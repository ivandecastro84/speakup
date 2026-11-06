"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cx } from "@/components/ui";
import { type NotaIndividual, excluirNota, salvarNota } from "./actions";

export interface AlunoNotas {
  id_aluno: string;
  nome: string;
  unidade: string;
  status_matricula: string;
  turmas: { id: string; codigo: string; idioma: string; nivel_curso: string; situacao: string; data_inicio: string }[];
}

export interface Avaliacao {
  id: string;
  turma_id: string;
  turma: string;
  data: string;
  speaking: number | null;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  cefr: string | null;
  lancado_em: string;
  lancado_por: string;
}

const COMP = [
  ["speaking", "Speaking"],
  ["listening", "Listening"],
  ["reading", "Reading"],
  ["writing", "Writing"],
] as const;
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];
const num = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
const br = (d: string) => d.split("-").reverse().join("/");
const campo = "min-h-11 w-full rounded-padrao border border-borda-campo bg-superficie px-3 text-texto disabled:opacity-60";

type Form = Omit<NotaIndividual, "idAluno">;

export function PainelNotas({
  alunos,
  selecionado,
  historico,
  hoje,
}: {
  alunos: AlunoNotas[];
  selecionado: string | null;
  historico: Avaliacao[];
  hoje: string;
}) {
  const router = useRouter();
  const aluno = alunos.find((a) => a.id_aluno === selecionado) ?? null;
  const vazio = (): Form => ({
    turmaId: aluno?.turmas.length === 1 ? aluno.turmas[0].id : "",
    data: hoje, speaking: "", listening: "", reading: "", writing: "", cefr: "",
  });
  const [f, setF] = useState<Form>(vazio);
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  // Troca de aluno: limpa o formulário.
  useEffect(() => {
    setF(vazio());
    setEditando(null);
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!aluno) return;
    setMsg(null);
    iniciar(async () => {
      const r = await salvarNota({ idAluno: aluno.id_aluno, ...f });
      if (r.ok) {
        setMsg({ ok: true, texto: editando ? "Avaliação atualizada." : "Notas salvas." });
        setF({ ...vazio(), turmaId: f.turmaId });
        setEditando(null);
        router.refresh();
      } else setMsg({ ok: false, texto: r.erro });
    });
  }

  function editar(a: Avaliacao) {
    setEditando(a.id);
    setMsg(null);
    setF({
      turmaId: a.turma_id,
      data: a.data,
      speaking: a.speaking == null ? "" : String(Number(a.speaking)),
      listening: a.listening == null ? "" : String(Number(a.listening)),
      reading: a.reading == null ? "" : String(Number(a.reading)),
      writing: a.writing == null ? "" : String(Number(a.writing)),
      cefr: a.cefr ?? "",
    });
    document.getElementById("form-nota")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function excluir(a: Avaliacao) {
    if (!confirm(`Excluir a avaliação de ${br(a.data)} (turma ${a.turma})? Esta ação não pode ser desfeita.`)) return;
    setMsg(null);
    iniciar(async () => {
      const r = await excluirNota(a.id);
      setMsg(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro });
      if (r.ok) {
        if (editando === a.id) {
          setEditando(null);
          setF(vazio());
        }
        router.refresh();
      }
    });
  }

  const semTurma = aluno != null && aluno.turmas.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-1.5">
        <label htmlFor="aluno" className="text-sm font-medium">Aluno</label>
        <select
          id="aluno"
          value={selecionado ?? ""}
          onChange={(e) => router.push(e.target.value ? `/adm/notas?aluno=${encodeURIComponent(e.target.value)}` : "/adm/notas")}
          className={campo}
        >
          <option value="">Selecione um aluno…</option>
          {alunos.map((a) => (
            <option key={a.id_aluno} value={a.id_aluno}>
              {a.nome} · {a.id_aluno}
              {a.status_matricula !== "Ativa" ? ` · ${a.status_matricula}` : ""}
              {a.turmas.length === 0 ? " · sem turma" : ""}
            </option>
          ))}
        </select>
        <p className="text-sm text-suave">{alunos.length} aluno(s) das suas unidades.</p>
      </div>

      {aluno && (
        <>
          <form id="form-nota" onSubmit={salvar} className="flex flex-col gap-4 rounded-padrao border border-borda p-5" aria-labelledby="titulo-form">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titulo-form" className="text-lg">
                {editando ? "Editar avaliação" : "Lançar notas"} · {aluno.nome}
              </h2>
              <span className="text-sm text-suave">{aluno.id_aluno} · {aluno.unidade} · matrícula {aluno.status_matricula}</span>
            </div>
            {semTurma ? (
              <p role="alert" className="rounded-padrao border border-aviso bg-aviso-suave p-3 text-sm">
                Este aluno não está em nenhuma turma. Matricule-o em uma turma (menu Turmas) para poder lançar notas.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="turma" className="text-sm font-medium">Turma</label>
                    <select id="turma" required value={f.turmaId} onChange={set("turmaId")} disabled={Boolean(editando)} className={campo}>
                      <option value="" disabled>Selecione…</option>
                      {aluno.turmas.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.codigo} · {t.idioma} {t.nivel_curso}
                          {t.situacao !== "Ativa" ? ` (${t.situacao})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="data" className="text-sm font-medium">Data da avaliação</label>
                    <input id="data" type="date" required max={hoje} value={f.data} onChange={set("data")} disabled={Boolean(editando)} className={campo} />
                  </div>
                </div>
                {editando && (
                  <p className="text-sm text-suave">Turma e data ficam fixas na edição. Para mudar a data, exclua e lance de novo.</p>
                )}
                <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                  <legend className="mb-2 text-sm font-medium">Notas de 0 a 10 (deixe em branco o que não foi avaliado)</legend>
                  {COMP.map(([k, rotulo]) => (
                    <div key={k} className="flex flex-col gap-1.5">
                      <label htmlFor={k} className="text-sm">{rotulo}</label>
                      <input id={k} inputMode="decimal" placeholder="0–10" value={f[k]} onChange={set(k)}
                        className={cx(campo, "text-center tabular-nums")} />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cefr" className="text-sm">CEFR</label>
                    <select id="cefr" value={f.cefr} onChange={set("cefr")} className={campo}>
                      <option value="">—</option>
                      {CEFR.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </fieldset>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={pendente}
                    className="min-h-11 rounded-padrao bg-destaque px-5 text-sm font-semibold text-destaque-texto disabled:opacity-60">
                    {pendente ? "Salvando…" : editando ? "Salvar alterações" : "Salvar"}
                  </button>
                  {editando && (
                    <button type="button" onClick={() => { setEditando(null); setF(vazio()); setMsg(null); }}
                      className="min-h-11 rounded-padrao border border-borda px-4 text-sm font-semibold">
                      Cancelar edição
                    </button>
                  )}
                </div>
              </>
            )}
            <p role="status" aria-live="polite" className={cx("text-sm", msg && (msg.ok ? "text-sucesso" : "text-erro"))}>
              {msg?.texto ?? ""}
            </p>
          </form>

          <section aria-labelledby="titulo-hist">
            <h2 id="titulo-hist" className="mb-3 text-lg">Notas lançadas</h2>
            {historico.length === 0 ? (
              <p className="text-sm text-suave">Nenhuma nota lançada para este aluno.</p>
            ) : (
              <div className="overflow-x-auto rounded-padrao border border-borda">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Notas lançadas para {aluno.nome}</caption>
                  <thead className="border-b border-borda text-suave">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Data</th>
                      <th scope="col" className="px-4 py-3 font-medium">Turma</th>
                      {COMP.map(([k, r]) => <th key={k} scope="col" className="px-3 py-3 text-right font-medium">{r}</th>)}
                      <th scope="col" className="px-3 py-3 font-medium">CEFR</th>
                      <th scope="col" className="px-4 py-3 font-medium">Lançado por</th>
                      <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {historico.map((a) => (
                      <tr key={a.id} className={cx(editando === a.id && "bg-destaque-suave")}>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums">{br(a.data)}</td>
                        <td className="px-4 py-2">{a.turma}</td>
                        {COMP.map(([k]) => <td key={k} className="px-3 py-2 text-right tabular-nums">{num(a[k])}</td>)}
                        <td className="px-3 py-2">{a.cefr ?? "—"}</td>
                        <td className="px-4 py-2 text-suave">{a.lancado_por}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => editar(a)} disabled={pendente}
                              className="min-h-11 rounded-padrao border border-borda px-3 text-sm">Editar</button>
                            <button type="button" onClick={() => excluir(a)} disabled={pendente}
                              className="min-h-11 rounded-padrao border border-borda px-3 text-sm text-erro">Excluir</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
