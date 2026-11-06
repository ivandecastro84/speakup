"use client";

import { useEffect, useState } from "react";
import { Etiqueta } from "@/components/campos";
import { cx } from "@/components/ui";
import { EVENTO_CHAVE } from "./chaves";

interface Disciplina { disciplina: string; notas: { data: string; nota: number }[]; media: number | null; situacao: string }
interface Curso {
  turma: string; curso: string; nivel_cefr_atual: string | null;
  frequencia: { aulas_registradas: number; presencas: number; percentual: number | null };
  disciplinas: Disciplina[];
}
interface Sucesso { aluno: { id_aluno: string; nome: string; situacao_matricula: string }; empresa: string; cursos: Curso[] }
interface Resultado { status: number; ms: number; requisicao: string | null; corpo: unknown }

const TOM: Record<string, "sucesso" | "erro" | "neutro"> = { Aprovado: "sucesso", "Abaixo da média": "erro", "Sem avaliação": "neutro" };
const num = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
const dataBr = (d: string) => d.split("-").reverse().join("/");

export function TesteApi() {
  const [chave, setChave] = useState("");
  const [id, setId] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);

  useEffect(() => {
    try {
      setChave(sessionStorage.getItem("speakup-chave-teste") ?? "");
    } catch {}
    const ouvir = (e: Event) => {
      const v = (e as CustomEvent<string>).detail;
      setChave(v);
      try {
        sessionStorage.setItem("speakup-chave-teste", v);
      } catch {}
    };
    window.addEventListener(EVENTO_CHAVE, ouvir);
    return () => window.removeEventListener(EVENTO_CHAVE, ouvir);
  }, []);

  async function testar(ev: React.FormEvent) {
    ev.preventDefault();
    setEnviando(true);
    setR(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/v1/notas", {
        method: "POST",
        headers: { authorization: `Bearer ${chave.trim()}`, "content-type": "application/json" },
        body: JSON.stringify({ id_aluno: id, nome }),
      });
      const texto = await res.text();
      let corpo: unknown = texto;
      try {
        corpo = JSON.parse(texto);
      } catch {}
      setR({ status: res.status, ms: Math.round(performance.now() - t0), requisicao: res.headers.get("x-request-id"), corpo });
    } catch (e) {
      setR({ status: 0, ms: Math.round(performance.now() - t0), requisicao: null, corpo: { erro: { codigo: "FALHA_DE_REDE", mensagem: String(e) } } });
    } finally {
      setEnviando(false);
    }
  }

  const ok = r?.status === 200;
  const erro = r && !ok ? (r.corpo as { erro?: { codigo: string; mensagem: string } })?.erro : null;
  const dados = ok ? (r!.corpo as Sucesso) : null;

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={testar} className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="t-chave" className="text-sm font-medium">Chave de API da empresa</label>
          <input id="t-chave" type="password" autoComplete="off" required value={chave}
            onChange={(e) => { setChave(e.target.value); try { sessionStorage.setItem("speakup-chave-teste", e.target.value); } catch {} }}
            placeholder="su_…" className="min-h-11 rounded-padrao border border-borda-campo bg-superficie px-3 font-mono text-sm" />
          <p className="text-sm text-suave">A mesma chave que a empresa usará. Gere uma acima e use &ldquo;Usar no teste&rdquo;.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="t-id" className="text-sm font-medium">ID do aluno</label>
          <input id="t-id" required value={id} onChange={(e) => setId(e.target.value)} placeholder="ex.: 2026001"
            className="min-h-11 rounded-padrao border border-borda-campo bg-superficie px-3" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="t-nome" className="text-sm font-medium">Nome do aluno</label>
          <input id="t-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo"
            className="min-h-11 rounded-padrao border border-borda-campo bg-superficie px-3" />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={enviando}
            className="min-h-11 rounded-padrao bg-destaque px-5 text-sm font-semibold text-destaque-texto disabled:opacity-60">
            {enviando ? "Consultando…" : "Testar API"}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {r && (
          <div className="flex flex-col gap-4">
            <div className={cx("rounded-padrao border p-4", ok ? "border-sucesso bg-sucesso-suave" : "border-erro bg-erro-suave")} role="status">
              <p className="font-semibold">{ok ? "Consulta realizada com sucesso" : "A consulta retornou um erro"}</p>
              <p className="text-sm">
                HTTP {r.status || "sem resposta"} · {r.ms} ms{r.requisicao ? ` · X-Request-Id ${r.requisicao}` : ""}
              </p>
              {erro && <p className="mt-1 text-sm"><strong>{erro.codigo}</strong>: {erro.mensagem}</p>}
            </div>

            {dados && (
              <div className="flex flex-col gap-4">
                <p>
                  <strong>{dados.aluno.nome}</strong> · {dados.aluno.id_aluno} · matrícula {dados.aluno.situacao_matricula} · {dados.empresa}
                </p>
                {dados.cursos.length === 0 && <p className="text-sm text-suave">O aluno não está em nenhuma turma e não tem notas lançadas.</p>}
                {dados.cursos.map((c) => (
                  <div key={c.turma} className="overflow-x-auto rounded-padrao border border-borda">
                    <p className="border-b border-borda px-4 py-3 text-sm">
                      <strong>{c.curso}</strong> · turma {c.turma} · CEFR {c.nivel_cefr_atual ?? "—"} · frequência{" "}
                      {c.frequencia.percentual == null ? "—" : `${num(c.frequencia.percentual)}%`} ({c.frequencia.presencas}/{c.frequencia.aulas_registradas})
                    </p>
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Notas por disciplina em {c.curso}</caption>
                      <thead className="text-suave">
                        <tr>
                          <th scope="col" className="px-4 py-2 font-medium">Disciplina</th>
                          <th scope="col" className="px-4 py-2 font-medium">Notas</th>
                          <th scope="col" className="px-4 py-2 text-right font-medium">Média</th>
                          <th scope="col" className="px-4 py-2 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-borda">
                        {c.disciplinas.map((d) => (
                          <tr key={d.disciplina}>
                            <th scope="row" className="px-4 py-2 font-medium">{d.disciplina}</th>
                            <td className="px-4 py-2 tabular-nums">
                              {d.notas.length === 0 ? "—" : d.notas.map((n) => `${num(n.nota)} (${dataBr(n.data)})`).join(" · ")}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">{num(d.media)}</td>
                            <td className="px-4 py-2"><Etiqueta tom={TOM[d.situacao] ?? "neutro"}>{d.situacao}</Etiqueta></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            <details open>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Resposta exata da API (JSON)</summary>
              <pre className="max-h-[32rem] overflow-auto rounded-padrao border border-borda bg-fundo p-4 text-xs">
                {typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
