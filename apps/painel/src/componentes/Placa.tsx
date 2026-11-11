/**
 * Identidade da empresa no formato de uma placa de moto em categoria aluguel:
 * faixa azul em cima, caracteres vermelhos. É o único elemento "de marca" do painel.
 * As cores são fixas: placa é placa, no tema claro e no escuro.
 */
export function Placa({
  texto,
  faixa = 'PARANÁ',
  tamanho = 'normal',
}: {
  texto: string;
  faixa?: string;
  tamanho?: 'normal' | 'grande';
}) {
  const grande = tamanho === 'grande';
  return (
    <div
      className="inline-flex w-full max-w-full flex-col overflow-hidden rounded-md border-2 border-[#1e2529] bg-white"
      role="img"
      aria-label={texto}
    >
      <div
        className={`flex items-center justify-between bg-[#0b3d91] px-2 font-cond font-semibold tracking-[0.12em] text-white ${
          grande ? 'py-1 text-xs' : 'py-0.5 text-[10px]'
        }`}
        aria-hidden
      >
        <span>{faixa}</span>
        <span className="flex gap-0.5">
          <span className="block h-1.5 w-1.5 rounded-full bg-[#e5a50a]" />
          <span className="block h-1.5 w-1.5 rounded-full bg-white/80" />
        </span>
      </div>
      <div
        className={`truncate px-2 text-center font-cond font-bold uppercase tracking-[0.06em] text-[#b3122a] ${
          grande ? 'py-2 text-4xl' : 'py-1 text-xl'
        }`}
        aria-hidden
      >
        {texto}
      </div>
    </div>
  );
}
