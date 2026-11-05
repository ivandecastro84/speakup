import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { RpcError } from "@/lib/server/rpc";
import { chamarAdm, exigirPermissaoPagina } from "../../../dados";
import { FormNotas } from "./form";

export const metadata: Metadata = { title: "Notas" };

interface Avaliacao {
  id_aluno: string;
  nome: string;
  data: string;
  speaking: number | null;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  cefr: string | null;
  observacao: string | null;
}

const nota = (v: number | null) => (v == null ? "—" : Number(v).toFixed(1));

export default async function Notas({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissaoPagina("NOTAS_LANCAR");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let turma: { codigo: string; nome: string };
  let dados: { alunos: { id_aluno: string; nome: string; cefr_atual: string | null }[]; avaliacoes: Avaliacao[] };
  try {
    [turma, dados] = await Promise.all([
      chamarAdm<{ codigo: string; nome: string }>("adm_obter_turma", { p_id: id }),
      chamarAdm<typeof dados>("adm_avaliacoes_turma", { p_turma_id: id }),
    ]);
  } catch (e) {
    if (e instanceof RpcError && e.status === 404) notFound();
    throw e;
  }
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <Link href={`/adm/turmas/${id}`} className="text-sm text-suave underline">
        ← {turma.codigo}
      </Link>
      <Cabecalho titulo={`Notas · ${turma.codigo}`} descricao="Speaking, Listening, Reading e Writing (0 a 10) e o nível CEFR atual." />
      <div className="flex flex-col gap-6">
        <Cartao>
          <h2 className="mb-4 text-lg">Lançar avaliação</h2>
          {dados.alunos.length === 0 ? (
            <EstadoVazio titulo="A turma não tem alunos" />
          ) : (
            <FormNotas turmaId={id} hoje={hoje} alunos={dados.alunos} />
          )}
        </Cartao>
        <Cartao className="overflow-x-auto p-0">
          <h2 className="px-5 pt-5 text-lg">Avaliações lançadas</h2>
          {dados.avaliacoes.length === 0 ? (
            <div className="p-5">
              <EstadoVazio titulo="Nenhuma avaliação ainda" />
            </div>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <caption className="sr-only">Avaliações da turma</caption>
              <thead className="border-b border-borda text-suave">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Data</th>
                  <th scope="col" className="px-4 py-3 font-medium">Aluno</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Speaking</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Listening</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Reading</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Writing</th>
                  <th scope="col" className="px-4 py-3 font-medium">CEFR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {dados.avaliacoes.map((a) => (
                  <tr key={`${a.id_aluno}-${a.data}`}>
                    <td className="px-4 py-3 tabular-nums">{a.data.split("-").reverse().join("/")}</td>
                    <td className="px-4 py-3">
                      {a.nome}
                      {a.observacao && <span className="block text-xs text-suave">{a.observacao}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{nota(a.speaking)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{nota(a.listening)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{nota(a.reading)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{nota(a.writing)}</td>
                    <td className="px-4 py-3">{a.cefr ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
      </div>
    </>
  );
}
