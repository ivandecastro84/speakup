import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, TOM_STATUS } from "@/components/campos";
import { Alerta, Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { COLUNAS } from "@/lib/importacao/colunas";
import { RpcError } from "@/lib/server/rpc";
import { admAtual, chamarAdm, exigirPermissaoPagina } from "../../dados";
import { FormAluno, FormInativar } from "../forms";
import { FormEmpresaAluno } from "../../empresas/forms";

export const metadata: Metadata = { title: "Aluno" };

interface TurmaDoAluno {
  id: string;
  codigo: string;
  nome: string;
  situacao: string;
  idioma: string;
  professor: string;
  horarios: string[] | null;
}

export default async function Aluno({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; inativado?: string }>;
}) {
  await exigirPermissaoPagina("ALUNOS_LER");
  const u = await admAtual();
  const { id } = await params;
  const { salvo, inativado } = await searchParams;
  const idAluno = decodeURIComponent(id);

  let a: Record<string, unknown> & { turmas: TurmaDoAluno[] };
  try {
    a = await chamarAdm("adm_obter_aluno", { p_id_aluno: idAluno });
  } catch (e) {
    if (e instanceof RpcError && e.status === 404) notFound();
    throw e;
  }

  const rep = await chamarAdm<{ saldo: number; usadas_mes: number; limite_mes: number; faltas: number; presencas: number }>(
    "adm_reposicoes_aluno",
    { p_id_aluno: idAluno },
  );
  const gereEmpresas = u.permissoes.includes("EMPRESAS_GERENCIAR");
  const [empresa, empresas] = await Promise.all([
    chamarAdm<{ id: string; nome: string; desde: string } | null>("adm_empresa_do_aluno", { p_id_aluno: idAluno }),
    gereEmpresas ? chamarAdm<{ id: string; nome: string; ativa: boolean }[]>("adm_listar_empresas") : Promise.resolve([]),
  ]);
  const podeEditar = u.permissoes.includes("ALUNOS_EDITAR");
  const inicial = Object.fromEntries(COLUNAS.map((c) => [c, a[c] == null ? "" : String(a[c])]));
  const status = String(a.status_matricula);

  return (
    <>
      <Link href="/adm/alunos" className="text-sm text-suave underline">
        ← Alunos
      </Link>
      <Cabecalho
        titulo={String(a.nome)}
        descricao={`Matrícula ${idAluno} · ${a.unidade}`}
        acao={<Etiqueta tom={TOM_STATUS[status]}>{status}</Etiqueta>}
      />
      <div className="mb-6 flex flex-col gap-3">
        {salvo && <Alerta tipo="sucesso">Cadastro salvo.</Alerta>}
        {inativado && <Alerta tipo="sucesso">Matrícula inativada. O histórico do aluno foi mantido.</Alerta>}
        {a.primeiro_acesso === true && (
          <Alerta tipo="info">O aluno ainda não fez o primeiro acesso ao portal (usa a senha inicial padrão).</Alerta>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Cartao>
          {podeEditar ? (
            <FormAluno novo={false} inicial={inicial} unidades={u.unidades} />
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {COLUNAS.map((c) => (
                <div key={c}>
                  <dt className="text-suave">{c}</dt>
                  <dd className="font-medium">{inicial[c] || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </Cartao>

        <div className="flex flex-col gap-6">
          <Cartao aria-labelledby="titulo-frequencia">
            <h2 id="titulo-frequencia" className="mb-3 text-lg">
              Frequência e reposições
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-suave">Presenças</dt>
                <dd className="text-xl font-bold tabular-nums">{rep.presencas}</dd>
              </div>
              <div>
                <dt className="text-suave">Faltas</dt>
                <dd className="text-xl font-bold tabular-nums">{rep.faltas}</dd>
              </div>
              <div>
                <dt className="text-suave">Créditos de reposição</dt>
                <dd className="text-xl font-bold tabular-nums">{rep.saldo}</dd>
              </div>
              <div>
                <dt className="text-suave">Reposições no mês</dt>
                <dd className="text-xl font-bold tabular-nums">
                  {rep.usadas_mes}/{rep.limite_mes}
                </dd>
              </div>
            </dl>
          </Cartao>
          <Cartao aria-labelledby="titulo-empresa">
            <h2 id="titulo-empresa" className="mb-3 text-lg">
              Empresa
            </h2>
            {gereEmpresas ? (
              <FormEmpresaAluno idAluno={idAluno} atual={empresa?.id ?? null} empresas={empresas.filter((e) => e.ativa || e.id === empresa?.id)} />
            ) : (
              <p className="text-sm">{empresa ? empresa.nome : "Aluno particular (sem empresa)."}</p>
            )}
          </Cartao>
          <Cartao aria-labelledby="titulo-turmas">
            <h2 id="titulo-turmas" className="mb-3 text-lg">
              Turmas
            </h2>
            {a.turmas.length === 0 ? (
              <EstadoVazio titulo="Sem turma" descricao="Inclua o aluno pela página da turma." />
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {a.turmas.map((t) => (
                  <li key={t.id} className="rounded-padrao border border-borda p-3">
                    <p className="font-semibold">
                      {u.permissoes.includes("GRADE_EDITAR") ? (
                        <Link href={`/adm/turmas/${t.id}`} className="underline">
                          {t.codigo}
                        </Link>
                      ) : (
                        t.codigo
                      )}{" "}
                      · {t.nome}
                    </p>
                    <p className="text-suave">
                      {t.idioma} · {t.professor} · {(t.horarios ?? []).join(", ")}
                    </p>
                    {t.situacao !== "Ativa" && <Etiqueta>{t.situacao}</Etiqueta>}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          {podeEditar && (status === "Ativa" || status === "Trancada") && (
            <Cartao aria-labelledby="titulo-inativar">
              <h2 id="titulo-inativar" className="text-lg">
                Inativar matrícula
              </h2>
              <p className="mb-4 mt-1 text-sm text-suave">
                O aluno não é excluído: a situação muda e todo o histórico (turmas, presenças, auditoria) é mantido.
              </p>
              <details>
                <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-acento-texto">
                  Quero inativar esta matrícula
                </summary>
                <div className="mt-3">
                  <FormInativar idAluno={idAluno} />
                </div>
              </details>
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
