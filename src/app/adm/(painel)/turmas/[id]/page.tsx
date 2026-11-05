import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, TOM_STATUS, rotuloHorario } from "@/components/campos";
import { Alerta, Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { RpcError } from "@/lib/server/rpc";
import { chamarAdm, exigirPermissaoPagina } from "../../dados";
import { removerAluno } from "../actions";
import { FormIncluirAluno, FormTurma } from "../forms";
import { opcoesTurma } from "../opcoes";
import type { LinhaTurma } from "../page";

export const metadata: Metadata = { title: "Turma" };

type Turma = LinhaTurma & {
  professor_id: string;
  sala_id: string | null;
  alunos: { id_aluno: string; nome: string; status_matricula: string }[];
};

export default async function TurmaPagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const { id } = await params;
  const { salvo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let t: Turma;
  try {
    t = await chamarAdm<Turma>("adm_obter_turma", { p_id: id });
  } catch (e) {
    if (e instanceof RpcError && e.status === 404) notFound();
    throw e;
  }
  const opcoes = await opcoesTurma();
  const ativa = t.situacao === "Ativa";
  const vagas = t.capacidade - t.alunos.length;

  return (
    <>
      <Link href="/adm/turmas" className="text-sm text-suave underline">
        ← Turmas
      </Link>
      <Cabecalho
        titulo={`${t.codigo} · ${t.nome}`}
        descricao={`${t.idioma} ${t.nivel_curso} · ${t.professor} · ${t.horarios.map((h) => rotuloHorario(h.dia, h.hora)).join(", ")}`}
        acao={
          <div className="flex items-center gap-3">
            <Etiqueta tom={ativa ? "sucesso" : "neutro"}>{t.situacao}</Etiqueta>
            <Link
              href={`/adm/turmas/${t.id}/notas`}
              className="inline-flex min-h-11 items-center rounded-padrao border border-borda-campo px-4 text-sm font-semibold hover:bg-destaque-suave"
            >
              Lançar notas
            </Link>
            <Link
              href={`/adm/turmas/${t.id}/chamada`}
              className="inline-flex min-h-11 items-center rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto"
            >
              Fazer chamada
            </Link>
          </div>
        }
      />
      {salvo && (
        <div className="mb-6">
          <Alerta tipo="sucesso">Turma salva. Nenhum conflito de grade encontrado.</Alerta>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Cartao>
          <FormTurma
            id={t.id}
            opcoes={opcoes}
            inicial={{
              codigo: t.codigo,
              nome: t.nome,
              unidade: t.unidade,
              idioma: t.idioma,
              nivel_curso: t.nivel_curso,
              modalidade: t.modalidade,
              professor_id: t.professor_id,
              sala_id: t.sala_id ?? "",
              capacidade: String(t.capacidade),
              data_inicio: t.data_inicio,
              data_fim: t.data_fim,
              situacao: t.situacao,
              horarios: t.horarios,
            }}
          />
        </Cartao>
        <Cartao aria-labelledby="titulo-alunos">
          <h2 id="titulo-alunos" className="text-lg">
            Alunos ({t.alunos.length}/{t.capacidade})
          </h2>
          <p className="mb-4 mt-1 text-sm text-suave">{ativa ? `${vagas} vaga(s) livre(s).` : "Turma encerrada."}</p>
          {ativa && vagas > 0 && (
            <div className="mb-5">
              <FormIncluirAluno turmaId={t.id} />
            </div>
          )}
          {t.alunos.length === 0 ? (
            <EstadoVazio titulo="Nenhum aluno na turma" />
          ) : (
            <ul className="divide-y divide-borda text-sm">
              {t.alunos.map((a) => (
                <li key={a.id_aluno} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <Link href={`/adm/alunos/${encodeURIComponent(a.id_aluno)}`} className="font-medium underline">
                      {a.nome}
                    </Link>
                    <span className="block text-suave">
                      {a.id_aluno} {a.status_matricula !== "Ativa" && <Etiqueta tom={TOM_STATUS[a.status_matricula]}>{a.status_matricula}</Etiqueta>}
                    </span>
                  </div>
                  <form action={removerAluno.bind(null, t.id, a.id_aluno)}>
                    <button
                      type="submit"
                      className="min-h-11 rounded-padrao px-3 text-sm font-semibold text-acento-texto hover:bg-acento-suave"
                      aria-label={`Retirar ${a.nome} da turma`}
                    >
                      Retirar
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
