import type { Metadata } from "next";
import Link from "next/link";
import { Etiqueta, Selecao } from "@/components/campos";
import { BotaoLink, Cabecalho, Campo, Cartao, EstadoVazio } from "@/components/ui";
import { admAtual, chamarAdm, exigirPermissaoPagina } from "../dados";

export const metadata: Metadata = { title: "Professores" };

interface Linha {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  idiomas: string[];
  niveis: string[];
  unidades: string[];
  disponiveis: number;
  turmas_ativas: number;
}

export default async function Professores({
  searchParams,
}: {
  searchParams: Promise<{ unidade?: string; busca?: string; inativos?: string }>;
}) {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const u = await admAtual();
  const f = await searchParams;
  const lista = await chamarAdm<Linha[]>("adm_listar_professores", {
    p_unidade: f.unidade || null,
    p_busca: f.busca || null,
    p_incluir_inativos: f.inativos === "1",
  });
  const temFiltro = Boolean(f.unidade || f.busca || f.inativos);

  return (
    <>
      <Cabecalho
        titulo="Professores"
        descricao="Cadastro, competências e grade de disponibilidade."
        acao={<BotaoLink href="/adm/professores/novo">Novo professor</BotaoLink>}
      />
      <Cartao className="mb-6">
        <form method="get" className="grid items-end gap-4 sm:grid-cols-[2fr_1fr_auto_auto]">
          <Campo id="busca" name="busca" type="search" rotulo="Buscar por nome ou e-mail" defaultValue={f.busca ?? ""} />
          <Selecao id="f-unidade" name="unidade" rotulo="Unidade" opcoes={u.unidades} vazio="Todas" defaultValue={f.unidade ?? ""} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="inativos" value="1" defaultChecked={f.inativos === "1"} className="size-5" />
            Incluir inativos
          </label>
          <button type="submit" className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto">
            Filtrar
          </button>
        </form>
      </Cartao>
      {lista.length === 0 ? (
        <EstadoVazio
          titulo={temFiltro ? "Nenhum professor encontrado" : "Nenhum professor cadastrado"}
          descricao={temFiltro ? "Ajuste os filtros." : "Cadastre o primeiro professor para montar turmas."}
        />
      ) : (
        <Cartao className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Professores</caption>
            <thead className="border-b border-borda text-suave">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Professor</th>
                <th scope="col" className="px-4 py-3 font-medium">Unidades</th>
                <th scope="col" className="px-4 py-3 font-medium">Idiomas</th>
                <th scope="col" className="px-4 py-3 font-medium">Níveis</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Horários disponíveis</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Turmas ativas</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <Link href={`/adm/professores/${p.id}`} className="font-medium underline">
                      {p.nome}
                    </Link>
                    <span className="block text-suave">{p.email}</span>
                  </td>
                  <td className="px-4 py-3">{p.unidades.join(", ")}</td>
                  <td className="px-4 py-3">{p.idiomas.join(", ")}</td>
                  <td className="px-4 py-3">{p.niveis.join(", ")}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(p.disponiveis) === 0 ? <Etiqueta tom="aviso">nenhum</Etiqueta> : p.disponiveis}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.turmas_ativas}</td>
                  <td className="px-4 py-3">
                    <Etiqueta tom={p.ativo ? "sucesso" : "neutro"}>{p.ativo ? "Ativo" : "Inativo"}</Etiqueta>
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
