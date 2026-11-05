import type { Metadata } from "next";
import Link from "next/link";
import { Etiqueta, Selecao } from "@/components/campos";
import { Cabecalho, Campo, Cartao, EstadoVazio } from "@/components/ui";
import { chamarAdm, exigirPermissaoPagina } from "../dados";
import { BotoesPresenca } from "./botoes";

export const metadata: Metadata = { title: "Reposições" };

interface Reposicao {
  id: string;
  data: string;
  hora: number;
  tipo: "TURMA" | "AVULSA";
  status: "Agendada" | "Cancelada" | "Realizada" | "Falta";
  cancelamento_tardio: boolean;
  id_aluno: string;
  aluno: string;
  turma: string | null;
  turma_id: string | null;
  professor: string;
  sala: string | null;
  modalidade: string;
  idioma: string;
  nivel_curso: string;
  iniciada: boolean;
}

const TOM = { Agendada: "info", Realizada: "sucesso", Falta: "erro", Cancelada: "neutro" } as const;

export default async function Reposicoes({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; status?: string }> }) {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const f = await searchParams;
  const lista = await chamarAdm<Reposicao[]>("adm_listar_reposicoes", {
    p_de: f.de || null,
    p_ate: f.ate || null,
    p_status: f.status || null,
  });
  return (
    <>
      <Cabecalho titulo="Reposições" descricao="Agendadas pelos alunos no portal. Por padrão: últimos 7 dias e próximos 14." />
      <Cartao className="mb-6">
        <form method="get" className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Campo id="de" name="de" type="date" rotulo="De" defaultValue={f.de ?? ""} />
          <Campo id="ate" name="ate" type="date" rotulo="Até" defaultValue={f.ate ?? ""} />
          <Selecao id="status" name="status" rotulo="Situação" opcoes={["Agendada", "Realizada", "Falta", "Cancelada"]} vazio="Todas" defaultValue={f.status ?? ""} />
          <button type="submit" className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto">
            Filtrar
          </button>
        </form>
      </Cartao>
      {lista.length === 0 ? (
        <EstadoVazio titulo="Nenhuma reposição no período" />
      ) : (
        <Cartao className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Reposições</caption>
            <thead className="border-b border-borda text-suave">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Quando</th>
                <th scope="col" className="px-4 py-3 font-medium">Aluno</th>
                <th scope="col" className="px-4 py-3 font-medium">Aula</th>
                <th scope="col" className="px-4 py-3 font-medium">Professor · local</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                <th scope="col" className="px-4 py-3 font-medium">Presença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {lista.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {r.data.split("-").reverse().join("/")} · {String(r.hora).padStart(2, "0")}h
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/adm/alunos/${encodeURIComponent(r.id_aluno)}`} className="font-medium underline">
                      {r.aluno}
                    </Link>
                    <span className="block text-suave">{r.id_aluno}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.tipo === "TURMA" && r.turma_id ? (
                      <Link href={`/adm/turmas/${r.turma_id}`} className="underline">
                        Turma {r.turma}
                      </Link>
                    ) : (
                      "Aula avulsa"
                    )}
                    <span className="block text-suave">
                      {r.idioma} {r.nivel_curso}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.professor}
                    <span className="block text-suave">{r.modalidade === "Online" ? "Online" : r.sala}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tom={TOM[r.status]}>{r.status}</Etiqueta>
                    {r.cancelamento_tardio && <span className="block text-xs text-suave">fora do prazo</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.status !== "Cancelada" && r.iniciada ? <BotoesPresenca id={r.id} atual={r.status} /> : <span className="text-suave">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
    </>
  );
}
