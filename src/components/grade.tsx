"use client";

import { useState } from "react";
import { DIAS, DIAS_LONGOS, HORAS } from "./campos";
import { cx } from "./ui";

export interface Celula {
  dia: number;
  hora: number;
}

const chave = (c: Celula) => `${c.dia}-${c.hora}`;

/**
 * Grade semanal (segunda a sábado × 08h–20h) com seleção por clique.
 * Envia os horários marcados como inputs "nome" = "dia-hora".
 * `ocupados` mostra o que já está em uso (ex.: código da turma) e é sempre
 * mantido marcado se `travarOcupados` for verdadeiro.
 */
export function GradeHorarios({
  nome,
  legenda,
  selecionados,
  ocupados = [],
  ajuda,
}: {
  nome: string;
  legenda: string;
  selecionados: Celula[];
  ocupados?: (Celula & { rotulo: string })[];
  ajuda?: string;
}) {
  const [marcados, setMarcados] = useState(() => new Set(selecionados.map(chave)));
  const uso = new Map(ocupados.map((o) => [chave(o), o.rotulo]));

  const alternar = (k: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legenda}</legend>
      {ajuda && <p className="text-sm text-suave">{ajuda}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-12 text-left font-medium text-suave">
                <span className="sr-only">Horário</span>
              </th>
              {DIAS.map((d, i) => (
                <th key={d} scope="col" className="font-medium text-suave">
                  <abbr title={DIAS_LONGOS[i]} className="no-underline">
                    {d}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HORAS.map((h) => (
              <tr key={h}>
                <th scope="row" className="text-left font-medium text-suave tabular-nums">
                  {String(h).padStart(2, "0")}h
                </th>
                {DIAS.map((_, i) => {
                  const k = `${i + 1}-${h}`;
                  const ativo = marcados.has(k);
                  const em = uso.get(k);
                  return (
                    <td key={k}>
                      <button
                        type="button"
                        aria-pressed={ativo}
                        aria-label={`${DIAS_LONGOS[i]} ${h}h${em ? `, turma ${em}` : ""}`}
                        onClick={() => alternar(k)}
                        className={cx(
                          "flex min-h-11 w-full items-center justify-center truncate rounded-md border px-1 text-xs font-semibold",
                          ativo
                            ? "border-transparent bg-destaque text-destaque-texto"
                            : "border-borda bg-superficie text-suave hover:border-borda-campo",
                          em && !ativo && "border-erro text-erro",
                        )}
                      >
                        {em ?? (ativo ? "✓" : "")}
                      </button>
                      {ativo && <input type="hidden" name={nome} value={k} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p aria-live="polite" className="text-sm text-suave">
        {marcados.size} horário(s) marcado(s).
      </p>
    </fieldset>
  );
}
