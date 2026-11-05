import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Etiqueta, rotuloHorario } from "@/components/campos";
import { Alerta, Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { RpcError } from "@/lib/server/rpc";
import { admAtual, chamarAdm, exigirPermissaoPagina } from "../../dados";
import { FormDisponibilidade, FormProfessor } from "../forms";

export const metadata: Metadata = { title: "Professor" };

interface Professor {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  idiomas: string[];
  niveis: string[];
  ativo: boolean;
  unidades: string[];
  disponibilidade: { dia: number; hora: number }[];
  aulas: { dia: number; hora: number; turma_id: string; codigo: string; inicio: string; fim: string }[];
}

export default async function ProfessorPagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const u = await admAtual();
  const { id } = await params;
  const { salvo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let p: Professor;
  try {
    p = await chamarAdm<Professor>("adm_obter_professor", { p_id: id });
  } catch (e) {
    if (e instanceof RpcError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }

  const turmas = [...new Map(p.aulas.map((a) => [a.turma_id, a])).values()];

  return (
    <>
      <Link href="/adm/professores" className="text-sm text-suave underline">
        ← Professores
      </Link>
      <Cabecalho
        titulo={p.nome}
        descricao={`${p.idiomas.join(", ")} · ${p.niveis.join(", ")}`}
        acao={<Etiqueta tom={p.ativo ? "sucesso" : "neutro"}>{p.ativo ? "Ativo" : "Inativo"}</Etiqueta>}
      />
      {salvo && (
        <div className="mb-6">
          <Alerta tipo="sucesso">Cadastro salvo.</Alerta>
        </div>
      )}
      <div className="grid gap-6 2xl:grid-cols-2">
        <Cartao aria-labelledby="titulo-grade">
          <h2 id="titulo-grade" className="mb-4 text-lg">
            Grade de disponibilidade
          </h2>
          <FormDisponibilidade
            id={p.id}
            disponiveis={p.disponibilidade}
            aulas={p.aulas.map((a) => ({ dia: a.dia, hora: a.hora, rotulo: a.codigo }))}
          />
        </Cartao>
        <div className="flex flex-col gap-6">
          <Cartao aria-labelledby="titulo-turmas">
            <h2 id="titulo-turmas" className="mb-3 text-lg">
              Turmas ativas
            </h2>
            {turmas.length === 0 ? (
              <EstadoVazio titulo="Nenhuma turma ativa" />
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {turmas.map((t) => (
                  <li key={t.turma_id}>
                    <Link href={`/adm/turmas/${t.turma_id}`} className="font-semibold underline">
                      {t.codigo}
                    </Link>{" "}
                    <span className="text-suave">
                      {p.aulas
                        .filter((a) => a.turma_id === t.turma_id)
                        .map((a) => rotuloHorario(a.dia, a.hora))
                        .join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao aria-labelledby="titulo-dados">
            <h2 id="titulo-dados" className="mb-4 text-lg">
              Dados do professor
            </h2>
            <FormProfessor
              id={p.id}
              unidades={u.unidades}
              inicial={{
                nome: p.nome,
                email: p.email,
                telefone: p.telefone ?? "",
                idiomas: p.idiomas.join(", "),
                niveis: p.niveis.join(", "),
                unidades: p.unidades,
                ativo: p.ativo,
              }}
            />
          </Cartao>
        </div>
      </div>
    </>
  );
}
