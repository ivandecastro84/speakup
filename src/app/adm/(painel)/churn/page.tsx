import type { Metadata } from "next";
import Link from "next/link";
import { Paginacao } from "@/components/paginacao";
import { Cabecalho, Campo, Cartao, EstadoVazio, cx } from "@/components/ui";
import { chamarAdm, exigirPermissaoPagina } from "../dados";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Previsão de Churn" };

interface Consulta {
  faixas: { faixa: number; alunos: number }[];
  total_geral: number;
  no_cadastro: number;
  ultima_importacao: string | null;
  itens: {
    id_aluno: number; nome: string | null; unidade: string | null; status_matricula: string | null;
    probabilidade_churn: number; data_importacao: string;
  }[];
  total: number;
  pagina: number;
  por_pagina: number;
}

const FAIXAS = [
  { rotulo: "0–20", desc: "risco muito baixo", cor: "bg-emerald-500", texto: "text-emerald-600" },
  { rotulo: "20–40", desc: "risco baixo", cor: "bg-lime-500", texto: "text-lime-600" },
  { rotulo: "40–60", desc: "risco moderado", cor: "bg-amber-500", texto: "text-amber-600" },
  { rotulo: "60–80", desc: "risco alto", cor: "bg-orange-500", texto: "text-orange-600" },
  { rotulo: "80–100", desc: "risco muito alto", cor: "bg-red-600", texto: "text-red-600" },
];
const faixaDe = (p: number) => Math.min(Math.floor(p / 20), 4);
const pct = (v: number) => `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function Churn({ searchParams }: { searchParams: Promise<{ busca?: string; pagina?: string; faixa?: string }> }) {
  await exigirPermissaoPagina("CHURN_GERENCIAR");
  const f = await searchParams;
  const faixa = f.faixa && /^[0-4]$/.test(f.faixa) ? Number(f.faixa) : null;
  const c = await chamarAdm<Consulta>("adm_churn_consultar", {
    p_busca: f.busca || null,
    p_pagina: Number(f.pagina) || 1,
    p_faixa: faixa,
  });
  const maior = Math.max(1, ...c.faixas.map((x) => Number(x.alunos)));

  return (
    <>
      <Cabecalho
        titulo="Previsão de Churn"
        descricao="Importe a planilha com a probabilidade de evasão (0 a 100) de cada aluno e acompanhe quem está em maior risco."
      />
      <div className="flex flex-col gap-6">
        <Cartao aria-labelledby="titulo-importar">
          <h2 id="titulo-importar" className="mb-4 text-lg">Importar planilha</h2>
          <Importador />
        </Cartao>

        <Cartao aria-labelledby="titulo-faixas">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="titulo-faixas" className="text-lg">Alunos por faixa de risco</h2>
            <p className="text-sm text-suave">
              {c.total_geral.toLocaleString("pt-BR")} previsões · {c.no_cadastro.toLocaleString("pt-BR")} com aluno no cadastro
              {c.ultima_importacao ? ` · última importação ${dataHora.format(new Date(c.ultima_importacao))}` : ""}
            </p>
          </div>
          {c.total_geral === 0 ? (
            <EstadoVazio titulo="Nenhuma previsão importada ainda" descricao="Importe a planilha acima para ver o resumo." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-5">
              {c.faixas.map((x) => {
                const fx = FAIXAS[x.faixa];
                const ativo = faixa === x.faixa;
                return (
                  <li key={x.faixa}>
                    <Link
                      href={ativo ? "/adm/churn" : `/adm/churn?faixa=${x.faixa}`}
                      aria-current={ativo ? "true" : undefined}
                      className={cx(
                        "flex h-full flex-col gap-2 rounded-padrao border p-4 hover:border-borda-campo",
                        ativo ? "border-destaque ring-2 ring-destaque" : "border-borda",
                      )}
                    >
                      <span className="text-sm font-semibold">{fx.rotulo}%</span>
                      <span className="text-3xl font-bold tabular-nums">{Number(x.alunos).toLocaleString("pt-BR")}</span>
                      <span className="text-xs text-suave">{fx.desc}</span>
                      <span className="h-2 w-full overflow-hidden rounded-full bg-fundo" aria-hidden="true">
                        <span className={cx("block h-full rounded-full", fx.cor)} style={{ width: `${(Number(x.alunos) / maior) * 100}%` }} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-suave">Valor na divisa entra na faixa de cima (ex.: 20 está em 20–40); 100 fica em 80–100. Clique numa faixa para filtrar a tabela.</p>
        </Cartao>

        <Cartao className="p-0" aria-labelledby="titulo-lista">
          <div className="flex flex-wrap items-end justify-between gap-4 p-5">
            <h2 id="titulo-lista" className="text-lg">
              Alunos do maior para o menor risco
              {faixa != null && <span className="ml-2 text-sm font-normal text-suave">· faixa {FAIXAS[faixa].rotulo}%</span>}
            </h2>
            <form method="get" className="flex flex-wrap items-end gap-3">
              {faixa != null && <input type="hidden" name="faixa" value={faixa} />}
              <Campo id="busca" name="busca" rotulo="Buscar por id_aluno ou nome" defaultValue={f.busca ?? ""} />
              <button type="submit" className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto">Buscar</button>
              {(f.busca || faixa != null) && (
                <Link href="/adm/churn" className="inline-flex min-h-11 items-center text-sm underline">Limpar</Link>
              )}
            </form>
          </div>
          {c.itens.length === 0 ? (
            <div className="p-5 pt-0">
              <EstadoVazio titulo={c.total_geral === 0 ? "Sem dados" : "Nenhum aluno encontrado"} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Previsão de churn por aluno, do maior para o menor risco</caption>
                <thead className="border-y border-borda text-suave">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">id_aluno</th>
                    <th scope="col" className="px-5 py-3 font-medium">Aluno</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Probabilidade de churn</th>
                    <th scope="col" className="px-5 py-3 font-medium">Faixa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {c.itens.map((i) => {
                    const fx = FAIXAS[faixaDe(Number(i.probabilidade_churn))];
                    return (
                      <tr key={i.id_aluno}>
                        <td className="px-5 py-3 tabular-nums">{i.id_aluno}</td>
                        <td className="px-5 py-3">
                          {i.nome ? (
                            <>
                              <Link href={`/adm/alunos/${encodeURIComponent(String(i.id_aluno))}`} className="font-medium underline">{i.nome}</Link>
                              <span className="block text-xs text-suave">{i.unidade} · {i.status_matricula}</span>
                            </>
                          ) : (
                            <span className="text-suave">Não está no cadastro</span>
                          )}
                        </td>
                        <td className={cx("px-5 py-3 text-right font-semibold tabular-nums", fx.texto)}>{pct(i.probabilidade_churn)}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-2 text-xs">
                            <span className={cx("size-2.5 rounded-full", fx.cor)} aria-hidden="true" />
                            {fx.rotulo}% · {fx.desc}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-5">
            <Paginacao base="/adm/churn" params={{ busca: f.busca, faixa: faixa != null ? String(faixa) : undefined }}
              pagina={c.pagina} porPagina={c.por_pagina} total={c.total} />
          </div>
        </Cartao>
      </div>
    </>
  );
}
