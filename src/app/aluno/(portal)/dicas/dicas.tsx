"use client";

import { useRef, useState } from "react";
import { Cartao, cx } from "@/components/ui";
import { type Dica, buscarDicas, rotuloNivel } from "@/lib/dicas/api";

type Estado = { tipo: "inicial" } | { tipo: "carregando" } | { tipo: "ok"; dicas: Dica[] } | { tipo: "erro"; mensagem: string };

const COR_NIVEL: Record<string, string> = {
  iniciante: "bg-sucesso-suave text-sucesso",
  intermediario: "bg-info-suave text-info",
};

function mensagemAmigavel(e: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Parece que você está sem internet. Confira a conexão e tente de novo.";
  if (e instanceof DOMException && e.name === "AbortError") return "O serviço de dicas demorou demais para responder. Tente de novo em instantes.";
  return "Não conseguimos carregar as dicas agora. O serviço pode estar fora do ar; tente de novo em alguns minutos.";
}

export function Dicas() {
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });
  const atual = useRef<AbortController | null>(null);

  async function carregar() {
    atual.current?.abort();
    const ctl = new AbortController();
    atual.current = ctl;
    const limite = setTimeout(() => ctl.abort(), 10_000);
    setEstado({ tipo: "carregando" });
    try {
      const dicas = await buscarDicas(ctl.signal);
      setEstado({ tipo: "ok", dicas: [...dicas].sort((a, b) => a.id - b.id) });
    } catch (e) {
      if (atual.current === ctl) setEstado({ tipo: "erro", mensagem: mensagemAmigavel(e) });
    } finally {
      clearTimeout(limite);
    }
  }

  const carregando = estado.tipo === "carregando";

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={carregar}
        disabled={carregando}
        className="min-h-12 w-full rounded-padrao bg-destaque px-5 font-semibold text-destaque-texto disabled:opacity-60"
      >
        {estado.tipo === "ok" || estado.tipo === "erro" ? "Buscar dicas novamente" : "Ver dicas"}
      </button>

      <div aria-live="polite" aria-busy={carregando}>
        {carregando && (
          <p role="status" className="py-6 text-center text-suave">
            Carregando...
          </p>
        )}

        {estado.tipo === "erro" && (
          <div role="alert" className="rounded-padrao border border-erro bg-erro-suave p-4">
            <p className="font-semibold">Ops! As dicas não carregaram.</p>
            <p className="mt-1 text-sm">{estado.mensagem}</p>
          </div>
        )}

        {estado.tipo === "ok" &&
          (estado.dicas.length === 0 ? (
            <p className="py-6 text-center text-suave">Nenhuma dica disponível no momento. Volte mais tarde!</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-suave">{estado.dicas.length} dicas</p>
              <ul className="flex flex-col gap-4">
                {estado.dicas.map((d) => (
                  <li key={d.id}>
                    <Cartao className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="flex items-start gap-3 text-lg font-bold leading-snug">
                          <span
                            aria-label={`Dica ${d.id}`}
                            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destaque text-base text-destaque-texto tabular-nums"
                          >
                            {d.id}
                          </span>
                          <span className="pt-1">{d.titulo}</span>
                        </h2>
                        <span
                          className={cx(
                            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                            COR_NIVEL[d.nivel] ?? "bg-fundo text-suave",
                          )}
                        >
                          {rotuloNivel(d.nivel)}
                        </span>
                      </div>
                      <p>{d.explicacao}</p>
                      <div className="rounded-padrao border-l-4 border-destaque bg-fundo px-4 py-3">
                        <p lang="en" className="font-semibold italic">
                          “{d.exemplo_en}”
                        </p>
                        <p className="mt-1 text-sm text-suave">{d.traducao_pt}</p>
                      </div>
                    </Cartao>
                  </li>
                ))}
              </ul>
            </>
          ))}
      </div>
    </div>
  );
}
