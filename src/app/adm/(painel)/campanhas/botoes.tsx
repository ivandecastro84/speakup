"use client";

import { useState, useTransition } from "react";
import { alternarAtiva, excluirCampanha } from "./actions";

export function AcoesCampanha({ id, nome, ativa }: { id: string; nome: string; ativa: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <a href={`/adm/campanhas/${id}`} className="inline-flex min-h-11 items-center rounded-padrao border border-borda px-3 text-sm">
          Editar
        </a>
        <button type="button" disabled={pendente} aria-pressed={ativa}
          onClick={() => { setErro(null); iniciar(async () => setErro(await alternarAtiva(id, !ativa))); }}
          className="min-h-11 rounded-padrao border border-borda px-3 text-sm disabled:opacity-60">
          {ativa ? "Desativar" : "Ativar"}
        </button>
        <button type="button" disabled={pendente}
          onClick={() => {
            if (!confirm(`Excluir a campanha "${nome}"? Esta ação não pode ser desfeita.`)) return;
            setErro(null);
            iniciar(async () => setErro(await excluirCampanha(id)));
          }}
          className="min-h-11 rounded-padrao border border-borda px-3 text-sm text-erro disabled:opacity-60">
          Excluir
        </button>
      </div>
      {erro && <p role="alert" className="max-w-md text-xs text-erro">{erro}</p>}
    </div>
  );
}
