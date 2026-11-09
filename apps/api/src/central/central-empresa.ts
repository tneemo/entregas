// Durable Object CentralEmpresa: um por empresa (nome = empresaId).
//
// Guarda a última posição de cada motoboy em turno NESTA empresa e repassa, por
// WebSocket, o que muda: posições e turnos para o painel; status e posição do
// entregador para a página de rastreio de cada pedido.
//
// Privacidade (LGPD): o Worker só manda para cá posições de turno aberto nesta
// empresa, então a empresa A nunca recebe a posição de quem está em turno na B.
// A página de rastreio só recebe a posição do motoboy daquele pedido, e só
// enquanto o pedido está em rota de entrega. Ao encerrar o turno, a posição some.
//
// Usa WebSocket Hibernation: com o painel aberto e ninguém se mexendo, o objeto
// dorme e não gera custo de duração.

import { DurableObject } from 'cloudflare:workers';
import {
  POSICAO_VALIDA_HORAS,
  statusFinal,
  type MensagemCentral,
  type MensagemRastreio,
  type PosicaoMotoboy,
  type StatusPedido,
} from '@entregas/shared';

type Anexo =
  | { tipo: 'painel' }
  | { tipo: 'rastreio'; pedidoId: string; motoboyVinculoId: string | null; emRota: boolean };

const TAG_PAINEL = 'painel';
const TAG_RASTREIO = 'rastreio';
const tagPedido = (pedidoId: string) => `pedido:${pedidoId}`;

interface LinhaPosicao extends Record<string, SqlStorageValue> {
  vinculo_id: string;
  nome: string;
  latitude: number;
  longitude: number;
  precisao: number | null;
  velocidade: number | null;
  registrado_em: number;
}

const paraPosicao = (l: LinhaPosicao): PosicaoMotoboy => ({
  vinculoId: l.vinculo_id,
  nome: l.nome,
  latitude: l.latitude,
  longitude: l.longitude,
  precisao: l.precisao,
  velocidade: l.velocidade,
  registradoEm: new Date(l.registrado_em).toISOString(),
});

const paraRastreio = (p: PosicaoMotoboy): MensagemRastreio => ({
  tipo: 'posicao',
  latitude: p.latitude,
  longitude: p.longitude,
  precisao: p.precisao,
  registradoEm: p.registradoEm,
});

function enviar(ws: WebSocket, mensagem: MensagemCentral | MensagemRastreio) {
  try {
    ws.send(JSON.stringify(mensagem));
  } catch {
    // Conexão fechando: o navegador reconecta e recebe o estado completo.
  }
}

export class CentralEmpresa extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ultima_posicao (
      vinculo_id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      precisao REAL,
      velocidade REAL,
      registrado_em INTEGER NOT NULL
    )`);
    // O navegador manda "ping" para manter a conexão; responde sem acordar o objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /**
   * Abre um WebSocket. Só o Worker chama, depois de autenticar:
   * /painel (admin/despachante) ou /rastreio?pedido=&motoboy=&status= (token público já validado).
   */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Esperado WebSocket.', { status: 426 });
    }
    const url = new URL(request.url);
    const { 0: cliente, 1: servidor } = new WebSocketPair();

    if (url.pathname === '/painel') {
      this.ctx.acceptWebSocket(servidor, [TAG_PAINEL]);
      servidor.serializeAttachment({ tipo: 'painel' } satisfies Anexo);
      enviar(servidor, { tipo: 'motoboys', motoboys: this.posicoes() });
    } else if (url.pathname === '/rastreio') {
      const pedidoId = url.searchParams.get('pedido');
      if (!pedidoId) return new Response('Pedido não informado.', { status: 400 });
      const anexo: Anexo = {
        tipo: 'rastreio',
        pedidoId,
        motoboyVinculoId: url.searchParams.get('motoboy') || null,
        emRota: url.searchParams.get('status') === 'em_rota',
      };
      this.ctx.acceptWebSocket(servidor, [TAG_RASTREIO, tagPedido(pedidoId)]);
      servidor.serializeAttachment(anexo);
      const posicao = anexo.emRota && anexo.motoboyVinculoId ? this.posicao(anexo.motoboyVinculoId) : null;
      if (posicao) enviar(servidor, paraRastreio(posicao));
    } else {
      return new Response('Não encontrado.', { status: 404 });
    }
    return new Response(null, { status: 101, webSocket: cliente });
  }

  /** Últimas posições de quem está em turno (descarta as muito antigas). */
  posicoes(): PosicaoMotoboy[] {
    const limite = Date.now() - POSICAO_VALIDA_HORAS * 60 * 60 * 1000;
    this.sql.exec('DELETE FROM ultima_posicao WHERE registrado_em < ?', limite);
    return this.sql.exec<LinhaPosicao>('SELECT * FROM ultima_posicao ORDER BY nome').toArray().map(paraPosicao);
  }

  private posicao(vinculoId: string): PosicaoMotoboy | null {
    const linha = this.sql
      .exec<LinhaPosicao>('SELECT * FROM ultima_posicao WHERE vinculo_id = ?', vinculoId)
      .toArray()[0];
    return linha ? paraPosicao(linha) : null;
  }

  /** Ponto novo de um motoboy em turno nesta empresa. Pontos atrasados da fila offline são ignorados. */
  async registrarPosicao(p: PosicaoMotoboy): Promise<void> {
    const registradoEm = Date.parse(p.registradoEm);
    const atual = this.posicao(p.vinculoId);
    if (atual && Date.parse(atual.registradoEm) >= registradoEm) return;

    this.sql.exec(
      `INSERT INTO ultima_posicao (vinculo_id, nome, latitude, longitude, precisao, velocidade, registrado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (vinculo_id) DO UPDATE SET nome = excluded.nome, latitude = excluded.latitude,
         longitude = excluded.longitude, precisao = excluded.precisao, velocidade = excluded.velocidade,
         registrado_em = excluded.registrado_em`,
      p.vinculoId,
      p.nome,
      p.latitude,
      p.longitude,
      p.precisao,
      p.velocidade,
      registradoEm,
    );

    for (const ws of this.ctx.getWebSockets(TAG_PAINEL)) enviar(ws, { tipo: 'posicao', motoboy: p });
    for (const ws of this.ctx.getWebSockets(TAG_RASTREIO)) {
      const anexo = ws.deserializeAttachment() as Anexo;
      if (anexo.tipo === 'rastreio' && anexo.emRota && anexo.motoboyVinculoId === p.vinculoId) {
        enviar(ws, paraRastreio(p));
      }
    }
  }

  /** Motoboy abriu ou encerrou o turno. Ao encerrar, a posição dele deixa de existir aqui. */
  async mudouTurno(vinculoId: string, emTurno: boolean): Promise<void> {
    if (!emTurno) {
      this.sql.exec('DELETE FROM ultima_posicao WHERE vinculo_id = ?', vinculoId);
      for (const ws of this.ctx.getWebSockets(TAG_RASTREIO)) {
        const anexo = ws.deserializeAttachment() as Anexo;
        if (anexo.tipo === 'rastreio' && anexo.motoboyVinculoId === vinculoId) enviar(ws, { tipo: 'sem_posicao' });
      }
    }
    for (const ws of this.ctx.getWebSockets(TAG_PAINEL)) enviar(ws, { tipo: 'turno', vinculoId, emTurno });
  }

  /** Pedido criado ou mudou de situação. */
  async mudouPedido(pedidoId: string, status: StatusPedido, motoboyVinculoId: string | null): Promise<void> {
    for (const ws of this.ctx.getWebSockets(TAG_PAINEL)) enviar(ws, { tipo: 'pedido', pedidoId, status });

    const emRota = status === 'em_rota';
    const posicao = emRota && motoboyVinculoId ? this.posicao(motoboyVinculoId) : null;
    for (const ws of this.ctx.getWebSockets(tagPedido(pedidoId))) {
      const antes = ws.deserializeAttachment() as Anexo;
      if (antes.tipo !== 'rastreio') continue;
      ws.serializeAttachment({ ...antes, motoboyVinculoId, emRota } satisfies Anexo);
      enviar(ws, { tipo: 'status' });
      if (antes.emRota && !emRota) enviar(ws, { tipo: 'sem_posicao' });
      if (posicao) enviar(ws, paraRastreio(posicao));
      // Pedido terminou: nada mais vai mudar, libera a conexão.
      if (statusFinal(status)) ws.close(1000, 'Pedido concluído');
    }
  }

  override async webSocketMessage(): Promise<void> {
    // Os clientes só escutam; "ping" já é respondido automaticamente.
  }

  override async webSocketClose(ws: WebSocket, codigo: number, motivo: string): Promise<void> {
    try {
      ws.close(codigo, motivo);
    } catch {
      // Já fechada (códigos 1005/1006 não podem ser repetidos).
    }
  }
}
