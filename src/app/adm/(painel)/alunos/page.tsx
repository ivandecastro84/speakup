import type { Metadata } from "next";
import Link from "next/link";
import { Etiqueta, Selecao, TOM_STATUS } from "@/components/campos";
import { Paginacao } from "@/components/paginacao";
import { BotaoLink, Cabecalho, Campo, Cartao, EstadoVazio } from "@/components/ui";
import { STATUS } from "@/lib/importacao/colunas";
import { admAtual, chamarAdm, exigirPermissaoPagina } from "../dados";

export const metadata: Metadata = { title: "Alunos" };

interface Linha {
  id_aluno: string;
  nome: string;
  email: string;
  unidade: string;
  nivel_curso: string | null;
  modalidade: string | null;
  turno: string | null;
  status_matricula: string;
}

type Filtros = { unidade?: string; nivel?: string; status?: string; busca?: string; pagina?: string };

const POR_PAGINA = 25;

export default async function Alunos({ searchParams }: { searchParams: Promise<Filtros> }) {
  await exigirPermissaoPagina("ALUNOS_LER");
  const u = await admAtual();
  const f = await searchParams;
  const pagina = Math.max(1, Number(f.pagina) || 1);
  const [opcoes, r] = await Promise.all([
    chamarAdm<{ unidades: string[]; niveis: string[] }>("adm_opcoes_alunos"),
    chamarAdm<{ total: number; linhas: Linha[] }>("adm_listar_alunos", {
      p_unidade: f.unidade || null,
      p_nivel: f.nivel || null,
      p_status: f.status || null,
      p_busca: f.busca || null,
      p_pagina: pagina,
      p_por_pagina: POR_PAGINA,
    }),
  ]);
  const filtros = { unidade: f.unidade, nivel: f.nivel, status: f.status, busca: f.busca };
  const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][]).toString();
  const temFiltro = Object.values(filtros).some(Boolean);

  return (
    <>
      <Cabecalho
        titulo="Alunos"
        descricao={`${r.total.toLocaleString("pt-BR")} aluno(s)${temFiltro ? " com os filtros aplicados" : ""}.`}
        acao={
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/adm/alunos/exportar${qs ? `?${qs}` : ""}`}
              className="inline-flex min-h-11 items-center rounded-padrao border border-borda-campo px-4 text-sm font-semibold hover:bg-destaque-suave"
            >
              Exportar .csv
            </a>
            {u.permissoes.includes("ALUNOS_EDITAR") && <BotaoLink href="/adm/alunos/novo">Novo aluno</BotaoLink>}
          </div>
        }
      />

      <Cartao className="mb-6">
        <form method="get" className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <Campo id="busca" name="busca" rotulo="Buscar por nome ou matrícula" defaultValue={f.busca ?? ""} type="search" />
          <Selecao id="f-unidade" name="unidade" rotulo="Unidade" opcoes={opcoes.unidades} vazio="Todas" defaultValue={f.unidade ?? ""} />
          <Selecao id="f-nivel" name="nivel" rotulo="Nível" opcoes={opcoes.niveis.sort()} vazio="Todos" defaultValue={f.nivel ?? ""} />
          <Selecao id="f-status" name="status" rotulo="Situação" opcoes={[...STATUS]} vazio="Todas" defaultValue={f.status ?? ""} />
          <div className="flex gap-2">
            <button type="submit" className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto">
              Filtrar
            </button>
            {temFiltro && (
              <Link href="/adm/alunos" className="inline-flex min-h-11 items-center px-2 text-sm text-suave underline">
                Limpar
              </Link>
            )}
          </div>
        </form>
      </Cartao>

      {r.linhas.length === 0 ? (
        <EstadoVazio
          titulo={temFiltro ? "Nenhum aluno encontrado" : "Nenhum aluno cadastrado"}
          descricao={temFiltro ? "Ajuste os filtros ou limpe a busca." : "Cadastre um aluno ou importe uma planilha em Importações."}
        />
      ) : (
        <Cartao className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Lista de alunos</caption>
            <thead className="border-b border-borda text-suave">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Matrícula</th>
                <th scope="col" className="px-4 py-3 font-medium">Nome</th>
                <th scope="col" className="px-4 py-3 font-medium">Unidade</th>
                <th scope="col" className="px-4 py-3 font-medium">Nível</th>
                <th scope="col" className="px-4 py-3 font-medium">Modalidade</th>
                <th scope="col" className="px-4 py-3 font-medium">Turno</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {r.linhas.map((a) => (
                <tr key={a.id_aluno}>
                  <td className="px-4 py-3 tabular-nums">{a.id_aluno}</td>
                  <td className="px-4 py-3">
                    <Link href={`/adm/alunos/${encodeURIComponent(a.id_aluno)}`} className="font-medium underline">
                      {a.nome}
                    </Link>
                    <span className="block text-suave">{a.email}</span>
                  </td>
                  <td className="px-4 py-3">{a.unidade}</td>
                  <td className="px-4 py-3">{a.nivel_curso ?? "—"}</td>
                  <td className="px-4 py-3">{a.modalidade ?? "—"}</td>
                  <td className="px-4 py-3">{a.turno ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Etiqueta tom={TOM_STATUS[a.status_matricula]}>{a.status_matricula}</Etiqueta>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
      <Paginacao base="/adm/alunos" params={filtros} pagina={pagina} porPagina={POR_PAGINA} total={r.total} />
    </>
  );
}
