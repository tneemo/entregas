// Tempo real do painel: uma conexão WebSocket por empresa aberta, compartilhada
// entre as telas. Mantém as últimas posições dos motoboys (mapa ao vivo) e avisa
// o React Query quando pedidos ou turnos mudam, para a fila se atualizar sozinha.

import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { MensagemCentral, PosicaoMotoboy } from '@entregas/shared';

export type SituacaoConexao = 'desligado' | 'conectando' | 'ao_vivo' | 'reconectando';

export interface EstadoAoVivo {
  conexao: SituacaoConexao;
  motoboys: Readonly<Record<string, PosicaoMotoboy>>;
}

const DESLIGADO: EstadoAoVivo = { conexao: 'desligado', motoboys: {} };
const PING_MS = 25_000;
const ESPERA_MAXIMA_MS = 30_000;

class CentralAoVivo {
  private estado: EstadoAoVivo = DESLIGADO;
  private readonly ouvintes = new Set<() => void>();
  private ws: WebSocket | null = null;
  private usos = 0;
  private tentativas = 0;
  private jaConectou = false;
  private timerReconectar: ReturnType<typeof setTimeout> | undefined;
  private timerParar: ReturnType<typeof setTimeout> | undefined;
  private timerPing: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly empresaId: string,
    private readonly consultas: QueryClient,
  ) {}

  ler = () => this.estado;

  inscrever = (ouvinte: () => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  /** Cada tela que usa a conexão chama; a última a sair desliga (com folga para trocas de tela). */
  usar() {
    this.usos++;
    clearTimeout(this.timerParar);
    if (!this.ws && this.estado.conexao === 'desligado') this.conectar();
    return () => {
      this.usos--;
      if (this.usos === 0) this.timerParar = setTimeout(() => this.parar(), 2_000);
    };
  }

  private mudar(parcial: Partial<EstadoAoVivo>) {
    this.estado = { ...this.estado, ...parcial };
    for (const ouvinte of this.ouvintes) ouvinte();
  }

  private conectar() {
    clearTimeout(this.timerReconectar);
    this.mudar({ conexao: this.jaConectou ? 'reconectando' : 'conectando' });
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocolo}//${location.host}/api/v1/empresas/${this.empresaId}/central/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.tentativas = 0;
      // Ao voltar de uma queda, algo pode ter mudado enquanto estava fora.
      if (this.jaConectou) this.atualizarConsultas();
      this.jaConectou = true;
      this.mudar({ conexao: 'ao_vivo' });
      this.timerPing = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
    };
    ws.onmessage = (evento) => {
      if (evento.data === 'pong') return;
      try {
        this.receber(JSON.parse(evento.data as string) as MensagemCentral);
      } catch {
        // mensagem inesperada: ignora
      }
    };
    ws.onclose = () => {
      clearInterval(this.timerPing);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.usos === 0) return;
      // Espera crescente (1 s, 2 s, 4 s… até 30 s) com um pouco de sorteio.
      const espera = Math.min(ESPERA_MAXIMA_MS, 1_000 * 2 ** this.tentativas++) + Math.random() * 500;
      this.mudar({ conexao: 'reconectando' });
      this.timerReconectar = setTimeout(() => this.conectar(), espera);
    };
  }

  private parar() {
    clearTimeout(this.timerReconectar);
    clearInterval(this.timerPing);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'Saiu do painel');
    this.jaConectou = false;
    this.tentativas = 0;
    this.mudar(DESLIGADO);
  }

  private atualizarConsultas(pedidoId?: string) {
    this.consultas.invalidateQueries({ queryKey: ['pedidos', this.empresaId] });
    this.consultas.invalidateQueries({ queryKey: ['motoboys', this.empresaId] });
    this.consultas.invalidateQueries({ queryKey: pedidoId ? ['pedido', this.empresaId, pedidoId] : ['pedido', this.empresaId] });
  }

  private receber(m: MensagemCentral) {
    switch (m.tipo) {
      case 'motoboys':
        this.mudar({ motoboys: Object.fromEntries(m.motoboys.map((p) => [p.vinculoId, p])) });
        break;
      case 'posicao':
        this.mudar({ motoboys: { ...this.estado.motoboys, [m.motoboy.vinculoId]: m.motoboy } });
        break;
      case 'turno':
        if (!m.emTurno) {
          const { [m.vinculoId]: _saiu, ...resto } = this.estado.motoboys;
          this.mudar({ motoboys: resto });
        }
        this.consultas.invalidateQueries({ queryKey: ['motoboys', this.empresaId] });
        break;
      case 'pedido':
        this.atualizarConsultas(m.pedidoId);
        break;
    }
  }
}

const centrais = new Map<string, CentralAoVivo>();

function centralDa(empresaId: string, consultas: QueryClient) {
  let central = centrais.get(empresaId);
  if (!central) {
    central = new CentralAoVivo(empresaId, consultas);
    centrais.set(empresaId, central);
  }
  return central;
}

const nadaParaOuvir = () => () => {};
const lerDesligado = () => DESLIGADO;

/** Conecta (ou reaproveita a conexão) ao tempo real da empresa. Sem empresa, fica desligado. */
export function useAoVivo(empresaId: string | undefined): EstadoAoVivo {
  const consultas = useQueryClient();
  const central = empresaId ? centralDa(empresaId, consultas) : null;
  useEffect(() => central?.usar(), [central]);
  return useSyncExternalStore(central?.inscrever ?? nadaParaOuvir, central?.ler ?? lerDesligado);
}
