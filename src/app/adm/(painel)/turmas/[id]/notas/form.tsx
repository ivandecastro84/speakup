"use client";

import { Formulario } from "@/components/form";
import { Campo } from "@/components/ui";
import { lancarNotas } from "./actions";

const COMPETENCIAS = ["speaking", "listening", "reading", "writing"] as const;
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function FormNotas({
  turmaId,
  hoje,
  alunos,
}: {
  turmaId: string;
  hoje: string;
  alunos: { id_aluno: string; nome: string; cefr_atual: string | null }[];
}) {
  return (
    <Formulario acao={lancarNotas.bind(null, turmaId)} textoBotao="Salvar notas" textoPendente="Salvando…">
      <div className="max-w-xs">
        <Campo id="data" name="data" type="date" rotulo="Data da avaliação" defaultValue={hoje} max={hoje} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Notas por aluno</caption>
          <thead className="text-suave">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Aluno</th>
              {COMPETENCIAS.map((c) => (
                <th key={c} scope="col" className="px-1 py-2 font-medium capitalize">
                  {c}
                </th>
              ))}
              <th scope="col" className="px-1 py-2 font-medium">CEFR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {alunos.map((a) => (
              <tr key={a.id_aluno}>
                <th scope="row" className="py-2 pr-3 font-medium">
                  {a.nome}
                  <span className="block text-xs font-normal text-suave">{a.id_aluno}</span>
                </th>
                {COMPETENCIAS.map((c) => (
                  <td key={c} className="px-1 py-2">
                    <input
                      name={`${a.id_aluno}|${c}`}
                      inputMode="decimal"
                      aria-label={`${c} de ${a.nome}`}
                      placeholder="0–10"
                      className="min-h-11 w-20 rounded-padrao border border-borda-campo bg-superficie px-2 text-center tabular-nums text-texto"
                    />
                  </td>
                ))}
                <td className="px-1 py-2">
                  <select
                    name={`${a.id_aluno}|cefr`}
                    aria-label={`Nível CEFR de ${a.nome}`}
                    defaultValue={a.cefr_atual ?? ""}
                    className="min-h-11 rounded-padrao border border-borda-campo bg-superficie px-2 text-texto"
                  >
                    <option value="">—</option>
                    {CEFR.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-suave">
        Deixe em branco o que não foi avaliado. Lançar de novo na mesma data substitui as notas do aluno nessa data.
      </p>
    </Formulario>
  );
}
