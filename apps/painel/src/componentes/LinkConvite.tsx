import { useState } from 'react';
import { ROTULOS, type ConviteCriadoResposta } from '@entregas/shared';
import { Botao, dataCurta } from './ui.tsx';

/** Mostra o link do convite recém-criado, com cópia e envio pelo WhatsApp. */
export function LinkConvite({
  convite,
  nomeEmpresa,
  aoFechar,
}: {
  convite: ConviteCriadoResposta;
  nomeEmpresa: string;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const url = `${window.location.origin}${convite.caminho}`;
  const funcao = ROTULOS.papel[convite.papel].toLowerCase();
  const mensagem = `Olá! Você foi convidado para entrar na ${nomeEmpresa} como ${funcao}. Crie seu acesso por este link (vale até ${dataCurta(convite.expiraEm)}): ${url}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-l-4 border-sinal bg-white p-4" aria-live="polite">
      <p className="text-[15px]">
        Convite de <strong>{funcao}</strong> criado. Envie o link para a pessoa. Ele vale até{' '}
        {dataCurta(convite.expiraEm)} e só pode ser usado uma vez; depois de fechar este aviso ele não aparece de novo.
      </p>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Link do convite"
        className="min-h-10 w-full rounded border border-linha bg-papel px-3 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center rounded-md bg-ok px-4 text-[15px] font-medium text-white hover:brightness-110"
        >
          Enviar pelo WhatsApp
        </a>
        <Botao variante="secundario" onClick={copiar}>
          {copiado ? 'Link copiado' : 'Copiar link'}
        </Botao>
        <Botao variante="discreto" className="ml-auto" onClick={aoFechar}>
          Fechar
        </Botao>
      </div>
    </div>
  );
}
