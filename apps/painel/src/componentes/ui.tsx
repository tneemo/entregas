import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { ErroDaApi } from '../api.ts';
import type { SituacaoConexao } from '../tempo-real.ts';

type Variante = 'principal' | 'secundario' | 'perigo' | 'discreto';

const VARIANTES: Record<Variante, string> = {
  principal: 'bg-mercosul text-white hover:bg-mercosul-escuro disabled:bg-concreto',
  secundario: 'border border-asfalto/30 bg-white text-asfalto hover:border-asfalto',
  perigo: 'border border-aluguel/40 bg-white text-aluguel hover:border-aluguel',
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
      className={`inline-flex items-center justify-center gap-2 rounded-md text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
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
        className={`min-h-10 rounded border bg-white px-3 py-2 text-base outline-none focus:border-mercosul ${
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
        className={`min-h-10 rounded border bg-white px-2 py-2 text-base outline-none focus:border-mercosul ${
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
    <p role="alert" className="rounded border-l-4 border-aluguel bg-white px-3 py-2 text-sm">
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
        className={`rounded border bg-white px-3 py-2 text-base outline-none focus:border-mercosul ${
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
      <span className={`h-2 w-2 rounded-full ${aoVivo ? 'bg-ok' : 'bg-sinal'}`} aria-hidden />
      {aoVivo ? 'Ao vivo' : conexao === 'conectando' ? 'Conectando…' : 'Sem conexão, tentando de novo…'}
    </span>
  );
}
