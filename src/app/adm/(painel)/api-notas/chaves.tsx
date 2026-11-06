"use client";

import { useState, useTransition } from "react";
import { gerarChave, revogarChave } from "./actions";

export const EVENTO_CHAVE = "speakup:chave-teste";

export function AcoesChave({ empresaId, empresaNome, temChave }: { empresaId: string; empresaNome: string; temChave: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [chave, setChave] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const gerar = () => {
    if (temChave && !confirm(`Gerar uma nova chave para ${empresaNome}? A chave atual deixa de funcionar na hora.`)) return;
    setErro(null);
    iniciar(async () => {
      const r = await gerarChave(empresaId);
      if (r.ok && r.chave) setChave(r.chave);
      else if (!r.ok) setErro(r.erro);
    });
  };
  const revogar = () => {
    if (!confirm(`Revogar a chave de ${empresaNome}? A integração da empresa para de funcionar até uma nova chave ser gerada.`)) return;
    setErro(null);
    iniciar(async () => {
      const r = await revogarChave(empresaId);
      if (!r.ok) setErro(r.erro);
      setChave(null);
    });
  };
  const usarNoTeste = () => {
    if (!chave) return;
    window.dispatchEvent(new CustomEvent(EVENTO_CHAVE, { detail: chave }));
    document.getElementById("teste-api")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={gerar} disabled={pendente}
          className="min-h-11 rounded-padrao bg-destaque px-3 text-sm font-semibold text-destaque-texto disabled:opacity-60">
          {temChave ? "Gerar nova chave" : "Gerar chave"}
        </button>
        {temChave && (
          <button type="button" onClick={revogar} disabled={pendente}
            className="min-h-11 rounded-padrao border border-borda px-3 text-sm font-semibold disabled:opacity-60">
            Revogar
          </button>
        )}
      </div>
      {erro && <p role="alert" className="text-sm text-erro">{erro}</p>}
      {chave && (
        <div role="status" className="rounded-padrao border border-aviso bg-aviso-suave p-3 text-sm">
          <p className="font-semibold">Copie agora: esta chave não será exibida de novo.</p>
          <code className="mt-2 block break-all rounded bg-superficie p-2 font-mono text-xs">{chave}</code>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-padrao border border-borda bg-superficie px-3 font-semibold"
              onClick={() => navigator.clipboard.writeText(chave).then(() => setCopiado(true))}>
              {copiado ? "Copiada" : "Copiar chave"}
            </button>
            <button type="button" className="min-h-11 rounded-padrao border border-borda bg-superficie px-3 font-semibold" onClick={usarNoTeste}>
              Usar no teste
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
