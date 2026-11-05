"use client";

import { useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { marcarPresencaReposicao } from "./actions";

export function BotoesPresenca({ id, atual }: { id: string; atual: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const marcado = atual === "Realizada" ? "Presente" : atual === "Falta" ? "Falta" : null;
  return (
    <div>
      <div className="flex gap-1" role="group" aria-label="Registrar presença">
        {(["Presente", "Falta"] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={pendente}
            aria-pressed={marcado === s}
            onClick={() =>
              iniciar(async () => {
                const r = await marcarPresencaReposicao(id, s);
                setErro(r ?? null);
              })
            }
            className={cx(
              "min-h-11 rounded-padrao border px-3 text-sm",
              marcado === s ? "border-transparent bg-destaque text-destaque-texto" : "border-borda hover:border-borda-campo",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {erro && (
        <p role="alert" className="mt-1 text-xs text-erro">
          {erro}
        </p>
      )}
    </div>
  );
}
