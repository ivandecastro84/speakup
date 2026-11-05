import type { Metadata } from "next";
import { Etiqueta, Selecao } from "@/components/campos";
import { Alerta, Cabecalho, Campo, Cartao, EstadoVazio, cx } from "@/components/ui";
import { RpcError } from "@/lib/server/rpc";
import { mensagemErro } from "@/lib/mensagens";
import { chamarAdm, exigirPermissaoPagina } from "../dados";

export const metadata: Metadata = { title: "Relatórios de RH" };

interface Linha {
  id_aluno: string;
  nome: string;
  unidade: string;
  status_matricula: string;
  turmas: string | null;
  aulas: number;
  presentes: number;
  faltas: number;
  reposicoes: number;
  frequencia: number | null;
  media: number | null;
  cefr_inicial: string | null;
  cefr_atual: string | null;
  elegivel: boolean;
  motivo: string | null;
}

interface Relatorio {
  empresa: { id: string; nome: string; freq_minima: number; media_minima: number };
  inicio: string;
  fim: string;
  atualizado_ate: string;
  resumo: { alunos: number; elegiveis: number; frequencia_media: number | null; media_geral: number | null };
  linhas: Linha[];
  envios: { gerado_em: string; inicio: string; fim: string; registros: number; elegiveis: number; por: string }[];
}

const br = (iso: string) => iso.split("-").reverse().join("/");
const num = (v: number | string, casas = 1) =>
  Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; inicio?: string; fim?: string }>;
}) {
  await exigirPermissaoPagina("RELATORIOS_LER");
  const f = await searchParams;
  const empresas = await chamarAdm<{ id: string; nome: string }[]>("adm_listar_empresas");
  const empresaId = f.empresa && empresas.some((e) => e.id === f.empresa) ? f.empresa : empresas[0]?.id;

  let r: Relatorio | null = null;
  let erro: string | null = null;
  if (empresaId) {
    try {
      r = await chamarAdm<Relatorio>("adm_relatorio_rh", { p_empresa_id: empresaId, p_inicio: f.inicio || null, p_fim: f.fim || null });
    } catch (e) {
      if (e instanceof RpcError && e.status < 500) erro = mensagemErro(e.message);
      else throw e;
    }
  }
  const qs = r ? new URLSearchParams({ empresa: r.empresa.id, inicio: r.inicio, fim: r.fim }).toString() : "";

  return (
    <>
      <Cabecalho
        titulo="Relatórios de RH"
        descricao="Frequência, notas, evolução CEFR e elegibilidade a benefício. Dados atualizados até o dia anterior (D+1)."
      />
      {empresas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma empresa disponível" descricao="Peça ao administrador para vincular você às empresas que acompanha." />
      ) : (
        <>
          <Cartao className="mb-6">
            <form method="get" className="grid items-end gap-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Selecao id="empresa" name="empresa" rotulo="Empresa" opcoes={empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))} defaultValue={empresaId} />
              <Campo id="inicio" name="inicio" type="date" rotulo="De" defaultValue={r?.inicio ?? f.inicio ?? ""} />
              <Campo id="fim" name="fim" type="date" rotulo="Até" defaultValue={r?.fim ?? f.fim ?? ""} max={r?.atualizado_ate} />
              <button type="submit" className="min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto">
                Gerar
              </button>
            </form>
          </Cartao>
          {erro && <Alerta tipo="erro">{erro}</Alerta>}
          {r && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-suave">
                  <strong className="text-texto">{r.empresa.nome}</strong> · {br(r.inicio)} a {br(r.fim)} · regra: frequência ≥{" "}
                  {num(r.empresa.freq_minima, 0)}% e média ≥ {num(r.empresa.media_minima)}
                </p>
                <a
                  href={`/api/adm/relatorios/rh?${qs}`}
                  className="inline-flex min-h-11 items-center rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto"
                >
                  Baixar CSV e registrar envio
                </a>
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Numero rotulo="Alunos" valor={String(r.resumo.alunos)} />
                <Numero rotulo="Elegíveis" valor={`${r.resumo.elegiveis}`} destaque />
                <Numero rotulo="Frequência média" valor={r.resumo.frequencia_media == null ? "—" : `${num(r.resumo.frequencia_media, 0)}%`} />
                <Numero rotulo="Média geral" valor={r.resumo.media_geral == null ? "—" : num(r.resumo.media_geral)} />
              </div>
              {r.linhas.length === 0 ? (
                <EstadoVazio titulo="Nenhum aluno vinculado a esta empresa" />
              ) : (
                <Cartao className="overflow-x-auto p-0">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Alunos da empresa no período</caption>
                    <thead className="border-b border-borda text-suave">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-medium">Aluno</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Aulas</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Pres.</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Faltas</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Repos.</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Freq.</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Média</th>
                        <th scope="col" className="px-4 py-3 font-medium">CEFR</th>
                        <th scope="col" className="px-4 py-3 font-medium">Elegível</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borda">
                      {r.linhas.map((l) => (
                        <tr key={l.id_aluno}>
                          <td className="px-4 py-3">
                            <span className="font-medium">{l.nome}</span>
                            <span className="block text-suave">
                              {l.id_aluno} · {l.unidade}
                              {l.turmas ? ` · ${l.turmas}` : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{l.aulas}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{l.presentes}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{l.faltas}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{l.reposicoes}</td>
                          <td
                            className={cx(
                              "px-4 py-3 text-right tabular-nums",
                              l.frequencia != null && Number(l.frequencia) < Number(r!.empresa.freq_minima) && "font-semibold text-erro",
                            )}
                          >
                            {l.frequencia == null ? "—" : `${num(l.frequencia, 0)}%`}
                          </td>
                          <td
                            className={cx(
                              "px-4 py-3 text-right tabular-nums",
                              l.media != null && Number(l.media) < Number(r!.empresa.media_minima) && "font-semibold text-erro",
                            )}
                          >
                            {l.media == null ? "—" : num(l.media)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {l.cefr_atual ? (l.cefr_inicial && l.cefr_inicial !== l.cefr_atual ? `${l.cefr_inicial} → ${l.cefr_atual}` : l.cefr_atual) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Etiqueta tom={l.elegivel ? "sucesso" : "neutro"}>{l.elegivel ? "Sim" : "Não"}</Etiqueta>
                            {l.motivo && <span className="block text-xs text-suave">{l.motivo}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Cartao>
              )}
              <Cartao>
                <h2 className="mb-3 text-lg">Envios registrados</h2>
                {r.envios.length === 0 ? (
                  <p className="text-sm text-suave">Nenhum relatório gerado ainda para esta empresa.</p>
                ) : (
                  <ul className="divide-y divide-borda text-sm">
                    {r.envios.map((e) => (
                      <li key={e.gerado_em} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>
                          {dataHora.format(new Date(e.gerado_em))} · {e.por}
                        </span>
                        <span className="text-suave">
                          período {br(e.inicio)}–{br(e.fim)} · {e.registros} aluno(s), {e.elegiveis} elegível(is)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <Cartao>
      <p className="text-sm text-suave">{rotulo}</p>
      <p className={cx("mt-1 text-3xl font-bold tabular-nums", destaque && "text-sucesso")}>{valor}</p>
    </Cartao>
  );
}
