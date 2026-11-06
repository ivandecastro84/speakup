"use client";

import { useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { type Resultado, processarAgora, reprocessar } from "./actions";

function useAcao() {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<Resultado | null>(null);
  return { pendente, r, rodar: (fn: () => Promise<Resultado>) => iniciar(async () => setR(await fn())) };
}

function Aviso({ r }: { r: Resultado | null }) {
  return (
    <p role="status" aria-live="polite" className={cx("text-sm", r && !r.ok ? "text-erro" : "text-suave")}>
      {r ? (r.ok ? r.mensagem : r.erro) : ""}
    </p>
  );
}

export function AcoesFila({ falhas }: { falhas: number }) {
  const { pendente, r, rodar } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() => rodar(processarAgora)}
          className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto disabled:opacity-60"
        >
          {pendente ? "Processando…" : "Processar pendentes agora"}
        </button>
        <button
          type="button"
          disabled={pendente || falhas === 0}
          onClick={() => rodar(() => reprocessar(null, null))}
          className="min-h-11 rounded-padrao border border-borda px-4 text-sm font-semibold disabled:opacity-50"
        >
          Reprocessar todas as falhas ({falhas})
        </button>
      </div>
      <Aviso r={r} />
    </div>
  );
}

export function ReprocessarItem({ fila, id }: { fila: "notificacao" | "calendario"; id: string }) {
  const { pendente, r, rodar } = useAcao();
  return (
    <div>
      <button
        type="button"
        disabled={pendente}
        onClick={() => rodar(() => reprocessar(fila, id))}
        className="min-h-11 rounded-padrao border border-borda px-3 text-sm disabled:opacity-60"
      >
        {pendente ? "Enviando…" : "Reprocessar"}
      </button>
      {r && !r.ok && (
        <p role="alert" className="mt-1 text-xs text-erro">
          {r.erro}
        </p>
      )}
    </div>
  );
}
