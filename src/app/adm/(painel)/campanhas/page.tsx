import type { Metadata } from "next";
import Link from "next/link";
import { Etiqueta } from "@/components/campos";
import { Alerta, Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { descreverFaixa, personalizarMensagem } from "@/lib/campanhas";
import { chamarAdm, exigirPermissaoPagina } from "../dados";
import { AcoesCampanha } from "./botoes";

export const metadata: Metadata = { title: "Campanhas de Retenção" };

interface Campanha {
  id: string; nome: string; churn_minimo: number; churn_maximo: number; desconto_percentual: number;
  titulo_oferta: string; mensagem: string; data_inicio: string; data_fim: string; ativa: boolean;
  alunos_na_faixa: number; interessados: number; vigencia: "agendada" | "em vigor" | "encerrada";
}

const br = (d: string) => d.split("-").reverse().join("/");
const num = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default async function Campanhas({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  await exigirPermissaoPagina("CAMPANHAS_GERENCIAR");
  const { salvo } = await searchParams;
  const { campanhas, total_previsoes } = await chamarAdm<{ campanhas: Campanha[]; total_previsoes: number }>("adm_campanhas_listar");

  return (
    <>
      <Cabecalho
        titulo="Campanhas de Retenção"
        descricao="Ofertas de rematrícula antecipada por faixa de risco de churn. O aluno entra na campanha quando o churn dele é maior ou igual ao mínimo e menor que o máximo (com máximo 100, o 100 também entra)."
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-suave">
          {campanhas.length} campanha(s), ordenadas pela faixa de churn · contagem sobre {Number(total_previsoes).toLocaleString("pt-BR")} previsões
          importadas em <Link href="/adm/churn" className="underline">Previsão de Churn</Link>
        </p>
        <Link href="/adm/campanhas/nova" className="inline-flex min-h-11 items-center rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto">
          Nova campanha
        </Link>
      </div>
      {salvo && campanhas.some((c) => c.id === salvo) && (
        <div className="mb-6"><Alerta tipo="sucesso">Campanha salva.</Alerta></div>
      )}
      {campanhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma campanha cadastrada" descricao="Crie a primeira campanha para uma faixa de risco." />
      ) : (
        <ul className="flex flex-col gap-4">
          {campanhas.map((c) => (
            <li key={c.id}>
              <Cartao className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg">{c.nome}</h2>
                    <Etiqueta tom={c.ativa ? "sucesso" : "neutro"}>{c.ativa ? "Ativa" : "Inativa"}</Etiqueta>
                    <Etiqueta tom={c.vigencia === "em vigor" ? "info" : c.vigencia === "agendada" ? "aviso" : "neutro"}>{c.vigencia}</Etiqueta>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
                    <div><dt className="text-suave">Faixa de churn</dt><dd className="font-semibold">{descreverFaixa(c.churn_minimo, c.churn_maximo)}</dd></div>
                    <div><dt className="text-suave">Alunos na faixa</dt><dd className="text-2xl font-bold tabular-nums">{Number(c.alunos_na_faixa).toLocaleString("pt-BR")}</dd></div>
                    <div><dt className="text-suave">Desconto</dt><dd className="font-semibold">{num(c.desconto_percentual)}%</dd></div>
                    <div>
                      <dt className="text-suave">Interessados</dt>
                      <dd>
                        <Link href={`/adm/campanhas/${c.id}#interessados`} className="text-2xl font-bold tabular-nums underline">
                          {Number(c.interessados).toLocaleString("pt-BR")}
                        </Link>
                      </dd>
                    </div>
                    <div><dt className="text-suave">Período</dt><dd className="font-semibold">{br(c.data_inicio)} a {br(c.data_fim)}</dd></div>
                  </dl>
                  <div className="rounded-padrao bg-fundo p-3 text-sm">
                    <p className="font-semibold">{c.titulo_oferta}</p>
                    <p className="whitespace-pre-line text-suave">{personalizarMensagem(c.mensagem, "Mariana Alves")}</p>
                  </div>
                </div>
                <AcoesCampanha id={c.id} nome={c.nome} ativa={c.ativa} />
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
