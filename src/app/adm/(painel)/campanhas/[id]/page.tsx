import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cabecalho, Cartao } from "@/components/ui";
import { RpcError } from "@/lib/server/rpc";
import { chamarAdm, exigirPermissaoPagina } from "../../dados";
import { type DadosCampanha, FormCampanha } from "../form";

export const metadata: Metadata = { title: "Editar campanha" };

interface Interessado {
  id_aluno: string; nome: string; email: string; unidade: string; status_matricula: string; churn: number | null; registrado_em: string;
}
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function EditarCampanha({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissaoPagina("CAMPANHAS_GERENCIAR");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let c: DadosCampanha & { id: string };
  let interessados: Interessado[];
  try {
    [c, interessados] = await Promise.all([
      chamarAdm<DadosCampanha & { id: string }>("adm_campanha_obter", { p_id: id }),
      chamarAdm<Interessado[]>("adm_campanha_interessados", { p_id: id }),
    ]);
  } catch (e) {
    if (e instanceof RpcError && e.status === 404) notFound();
    throw e;
  }
  return (
    <>
      <p className="mb-4"><Link href="/adm/campanhas" className="inline-flex min-h-11 items-center underline">← Campanhas de Retenção</Link></p>
      <Cabecalho titulo={`Editar: ${c.nome}`} />
      <Cartao className="max-w-3xl"><FormCampanha id={id} inicial={c} /></Cartao>
      <Cartao id="interessados" className="mt-6 overflow-x-auto p-0" aria-labelledby="titulo-interessados">
        <div className="p-5 pb-3">
          <h2 id="titulo-interessados" className="text-lg">Alunos que demonstraram interesse ({interessados.length})</h2>
          <p className="mt-1 text-sm text-suave">Registrados pelo botão &ldquo;Tenho interesse&rdquo; no portal do aluno. Entre em contato para concluir a rematrícula.</p>
        </div>
        {interessados.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-suave">Nenhum aluno demonstrou interesse ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Alunos interessados na campanha</caption>
            <thead className="border-y border-borda text-suave">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Aluno</th>
                <th scope="col" className="px-5 py-3 font-medium">Contato</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Churn</th>
                <th scope="col" className="px-5 py-3 font-medium">Interesse em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {interessados.map((i) => (
                <tr key={i.id_aluno}>
                  <td className="px-5 py-3">
                    <Link href={`/adm/alunos/${encodeURIComponent(i.id_aluno)}`} className="font-medium underline">{i.nome}</Link>
                    <span className="block text-xs text-suave">{i.id_aluno} · {i.unidade} · {i.status_matricula}</span>
                  </td>
                  <td className="px-5 py-3">{i.email}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{i.churn == null ? "—" : `${Number(i.churn).toLocaleString("pt-BR")}%`}</td>
                  <td className="px-5 py-3 tabular-nums">{dataHora.format(new Date(i.registrado_em))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </>
  );
}
