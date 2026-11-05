import type { Metadata } from "next";
import { Cartao, EstadoVazio, cx } from "@/components/ui";
import { chamarAluno, quando } from "../dados";

export const metadata: Metadata = { title: "Minhas presenças" };

interface Presencas {
  resumo: { presencas: number; faltas: number };
  registros: { data: string; hora: number; tipo: string; turma: string | null; nome: string; situacao: "Presente" | "Falta" }[];
}

export default async function MinhasPresencas() {
  const p = await chamarAluno<Presencas>("aluno_presencas");
  const total = Number(p.resumo.presencas) + Number(p.resumo.faltas);
  const taxa = total ? Math.round((Number(p.resumo.presencas) / total) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Minhas presenças</h1>
      <div className="grid grid-cols-3 gap-3">
        <Numero rotulo="Presenças" valor={String(p.resumo.presencas)} />
        <Numero rotulo="Faltas" valor={String(p.resumo.faltas)} />
        <Numero rotulo="Frequência" valor={taxa === null ? "—" : `${taxa}%`} />
      </div>
      {p.registros.length === 0 ? (
        <EstadoVazio titulo="Nenhuma chamada registrada ainda" descricao="Suas presenças aparecem aqui depois de cada aula." />
      ) : (
        <Cartao className="p-0">
          <ul className="divide-y divide-borda">
            {p.registros.map((r) => (
              <li key={`${r.tipo}-${r.data}-${r.hora}-${r.turma}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{quando(r.data, r.hora)}</p>
                  <p className="text-sm text-suave">
                    {r.tipo === "Reposição" ? "Reposição · " : ""}
                    {r.turma ? `${r.turma} — ` : ""}
                    {r.nome}
                  </p>
                </div>
                <span
                  className={cx(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    r.situacao === "Presente" ? "bg-sucesso-suave text-sucesso" : "bg-erro-suave text-erro",
                  )}
                >
                  {r.situacao}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Cartao className="p-4 text-center">
      <p className="text-xs text-suave">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
    </Cartao>
  );
}
