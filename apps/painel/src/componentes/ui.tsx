import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { ErroDaApi } from '../api.ts';
import type { SituacaoConexao } from '../tempo-real.ts';
import { IconeEstrela } from './icones.tsx';

type Variante = 'principal' | 'secundario' | 'perigo' | 'discreto';

const VARIANTES: Record<Variante, string> = {
  principal: 'bg-mercosul text-contraste hover:bg-mercosul-escuro disabled:bg-concreto',
  secundario: 'border border-asfalto/25 bg-superficie text-asfalto hover:border-asfalto/60 hover:bg-relevo',
  perigo: 'border border-aluguel/40 bg-superficie text-aluguel hover:border-aluguel',
  discreto: 'text-mercosul underline-offset-2 hover:underline',
};

export function Botao({
  variante = 'principal',
  className = '',
  carregando,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || carregando}
      className={`inline-flex items-center justify-center gap-2 rounded-md text-[15px] font-medium transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 ${
        variante === 'discreto' ? '' : 'min-h-10 px-4 py-2'
      } ${VARIANTES[variante]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Campo({
  rotulo,
  erro,
  dica,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string; dica?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro || dica ? `${id}-ajuda` : undefined}
        {...props}
        className={`min-h-10 rounded-md border bg-superficie px-3 py-2 text-base outline-none focus:border-mercosul focus:ring-2 focus:ring-mercosul/15 ${
          erro ? 'border-aluguel' : 'border-linha'
        }`}
      />
      {(erro || dica) && (
        <p id={`${id}-ajuda`} className={`text-sm ${erro ? 'text-aluguel' : 'text-concreto'}`}>
          {erro ?? dica}
        </p>
      )}
    </div>
  );
}

export function Selecao({
  rotulo,
  erro,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; erro?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <select
        id={id}
        aria-invalid={Boolean(erro)}
        {...props}
        className={`min-h-10 rounded-md border bg-superficie px-2 py-2 text-base outline-none focus:border-mercosul focus:ring-2 focus:ring-mercosul/15 ${
          erro ? 'border-aluguel' : 'border-linha'
        }`}
      >
        {children}
      </select>
      {erro && <p className="text-sm text-aluguel">{erro}</p>}
    </div>
  );
}

/** Mensagem geral de erro de um formulário (os erros por campo aparecem nos campos). */
export function AvisoErro({ erro }: { erro: unknown }) {
  if (!erro) return null;
  const mensagem = erro instanceof Error ? erro.message : 'Erro inesperado. Tente novamente.';
  return (
    <p role="alert" className="rounded border-l-4 border-aluguel bg-superficie px-3 py-2 text-sm">
      {mensagem}
    </p>
  );
}

export function erroDoCampo(erro: unknown, campo: string): string | undefined {
  return erro instanceof ErroDaApi ? erro.campos[campo]?.[0] : undefined;
}

export function Situacao({ ativo, rotulo }: { ativo: boolean; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`h-2 w-2 rounded-full ${ativo ? 'bg-ok' : 'bg-aluguel'}`} aria-hidden />
      {rotulo}
    </span>
  );
}

export function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function AreaTexto({
  rotulo,
  erro,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo: string; erro?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={Boolean(erro)}
        {...props}
        className={`rounded-md border bg-superficie px-3 py-2 text-base outline-none focus:border-mercosul focus:ring-2 focus:ring-mercosul/15 ${
          erro ? 'border-aluguel' : 'border-linha'
        }`}
      />
      {erro && <p className="text-sm text-aluguel">{erro}</p>}
    </div>
  );
}

/** Situação da conexão de tempo real com a central. */
export function IndicadorConexao({ conexao }: { conexao: SituacaoConexao }) {
  if (conexao === 'desligado') return null;
  const aoVivo = conexao === 'ao_vivo';
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm">
      <span className={`h-2 w-2 rounded-full ${aoVivo ? 'bg-ok' : 'animate-pulso bg-sinal'}`} aria-hidden />
      {aoVivo ? 'Ao vivo' : conexao === 'conectando' ? 'Conectando…' : 'Sem conexão, tentando de novo…'}
    </span>
  );
}

/** Superfície de conteúdo: lista, bloco de números, formulário. */
export function Cartao({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-lg border border-linha bg-superficie ${className}`}>{children}</div>;
}

/** Linhas cinzas no formato do conteúdo que está chegando. */
export function Esqueleto({ linhas = 3, className = '' }: { linhas?: number; className?: string }) {
  return (
    <div role="status" aria-label="Carregando" className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: linhas }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocos idênticos e fixos.
        <div key={i} className="esqueleto h-12" style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  );
}

/** Nota de 1 a 5 em estrelas, com o número para leitores de tela. */
export function Estrelas({ nota, tamanho = 16 }: { nota: number; tamanho?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-sinal" role="img" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconeEstrela key={n} tamanho={tamanho} cheia={n <= Math.round(nota)} />
      ))}
    </span>
  );
}
