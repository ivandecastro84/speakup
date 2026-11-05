import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alerta, Cabecalho, Cartao, EstadoVazio, cx } from "@/components/ui";
import { RpcError } from "@/lib/server/rpc";
import { chamarAdm, exigirPermissaoPagina } from "../../../dados";
import { FormChamada } from "./form";

export const metadata: Metadata = { title: "Chamada" };

interface Aula {
  data: string;
  hora: number;
  registrada: boolean;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function rotulo(a: { data: string; hora: number }) {
  const [y, m, d] = a.data.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} · ${String(a.hora).padStart(2, "0")}h`;
}

export default async function Chamada({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aula?: string; salvo?: string }>;
}) {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const { id } = await params;
  const { aula, salvo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let turma: { codigo: string; nome: string };
  let aulas: Aula[];
  try {
    [turma, aulas] = await Promise.all([
      chamarAdm<{ codigo: string; nome: string }>("adm_obter_turma", { p_id: id }),
      chamarAdm<Aula[]>("adm_aulas_turma", { p_turma_id: id }),
    ]);
  } catch (e) {
    if (e instanceof RpcError && e.status === 404) notFound();
    throw e;
  }

  const atual = aula ? aulas.find((a) => `${a.data}_${a.hora}` === aula) : aulas.find((a) => !a.registrada) ?? aulas[0];
  const lista = atual
    ? await chamarAdm<{
        regulares: { id_aluno: string; nome: string; situacao: string | null }[];
        reposicoes: { reposicao_id: string; id_aluno: string; nome: string; situacao: string | null }[];
      }>("adm_chamada", { p_turma_id: id, p_data: atual.data, p_hora: atual.hora })
    : null;

  return (
    <>
      <Link href={`/adm/turmas/${id}`} className="text-sm text-suave underline">
        ← {turma.codigo}
      </Link>
      <Cabecalho titulo={`Chamada · ${turma.codigo}`} descricao={turma.nome} />
      {salvo && (
        <div className="mb-6">
          <Alerta tipo="sucesso">Chamada salva. Faltas em aulas regulares geraram créditos de reposição.</Alerta>
        </div>
      )}
      {aulas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma aula realizada ainda" descricao="A chamada fica disponível a partir do início de cada aula." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Cartao className="p-0">
            <h2 className="px-4 pt-4 text-sm font-semibold text-suave">Aulas</h2>
            <ul className="max-h-[480px] overflow-y-auto p-2 text-sm">
              {aulas.map((a) => {
                const chave = `${a.data}_${a.hora}`;
                const ativo = atual && `${atual.data}_${atual.hora}` === chave;
                return (
                  <li key={chave}>
                    <Link
                      href={`/adm/turmas/${id}/chamada?aula=${chave}`}
                      aria-current={ativo ? "page" : undefined}
                      className={cx(
                        "flex min-h-11 items-center justify-between rounded-padrao px-3",
                        ativo ? "bg-destaque-suave font-semibold" : "hover:bg-destaque-suave",
                      )}
                    >
                      {rotulo(a)}
                      <span className={cx("text-xs", a.registrada ? "text-sucesso" : "text-aviso")}>
                        {a.registrada ? "feita" : "pendente"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Cartao>
          <Cartao>
            {atual && lista && (
              <>
                <h2 className="mb-4 text-lg">{rotulo(atual)}</h2>
                <FormChamada turmaId={id} data={atual.data} hora={atual.hora} regulares={lista.regulares} reposicoes={lista.reposicoes} />
              </>
            )}
          </Cartao>
        </div>
      )}
    </>
  );
}
