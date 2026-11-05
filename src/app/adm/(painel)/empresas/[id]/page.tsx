import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, TOM_STATUS } from "@/components/campos";
import { Alerta, Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { RpcError } from "@/lib/server/rpc";
import { admAtual, chamarAdm, exigirPermissaoPagina } from "../../dados";
import { desvincularAluno } from "../actions";
import { FormEmpresa, FormVincular } from "../forms";
import type { Empresa } from "../page";

export const metadata: Metadata = { title: "Empresa" };

type Detalhe = Omit<Empresa, "alunos"> & {
  alunos: { id_aluno: string; nome: string; unidade: string; status_matricula: string; desde: string }[];
};

export default async function EmpresaPagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  await exigirPermissaoPagina("EMPRESAS_GERENCIAR");
  const u = await admAtual();
  const { id } = await params;
  const { salvo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let e: Detalhe;
  try {
    e = await chamarAdm<Detalhe>("adm_obter_empresa", { p_id: id });
  } catch (err) {
    if (err instanceof RpcError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <Link href="/adm/empresas" className="text-sm text-suave underline">
        ← Empresas
      </Link>
      <Cabecalho
        titulo={e.nome}
        descricao={`${e.alunos.length} aluno(s) vinculado(s)${u.permissoes.includes("TODAS_UNIDADES") ? "" : " nas suas unidades"}.`}
        acao={
          u.permissoes.includes("RELATORIOS_LER") ? (
            <Link
              href={`/adm/relatorios?empresa=${e.id}`}
              className="inline-flex min-h-11 items-center rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto"
            >
              Ver relatório
            </Link>
          ) : undefined
        }
      />
      {salvo && (
        <div className="mb-6">
          <Alerta tipo="sucesso">Empresa salva.</Alerta>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Cartao>
            <h2 className="mb-4 text-lg">Dados e regra de elegibilidade</h2>
            <FormEmpresa
              id={e.id}
              inicial={{
                nome: e.nome,
                cnpj: e.cnpj ?? "",
                contato_nome: e.contato_nome ?? "",
                contato_email: e.contato_email ?? "",
                freq_minima: String(Number(e.freq_minima)),
                media_minima: String(Number(e.media_minima)),
                ativa: e.ativa,
              }}
            />
          </Cartao>
          <Cartao>
            <h2 className="mb-4 text-lg">Vincular alunos em lote</h2>
            <FormVincular empresaId={e.id} />
          </Cartao>
        </div>
        <Cartao aria-labelledby="titulo-alunos" className="self-start">
          <h2 id="titulo-alunos" className="mb-3 text-lg">
            Alunos vinculados
          </h2>
          {e.alunos.length === 0 ? (
            <EstadoVazio titulo="Nenhum aluno vinculado" />
          ) : (
            <ul className="divide-y divide-borda text-sm">
              {e.alunos.map((a) => (
                <li key={a.id_aluno} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <Link href={`/adm/alunos/${encodeURIComponent(a.id_aluno)}`} className="font-medium underline">
                      {a.nome}
                    </Link>
                    <span className="block text-suave">
                      {a.id_aluno} · {a.unidade}{" "}
                      {a.status_matricula !== "Ativa" && <Etiqueta tom={TOM_STATUS[a.status_matricula]}>{a.status_matricula}</Etiqueta>}
                    </span>
                  </div>
                  <form action={desvincularAluno.bind(null, e.id, a.id_aluno)}>
                    <button
                      type="submit"
                      className="min-h-11 rounded-padrao px-3 text-sm font-semibold text-acento-texto hover:bg-acento-suave"
                      aria-label={`Desvincular ${a.nome}`}
                    >
                      Desvincular
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
