"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cx } from "@/components/ui";
import { type Previa, TAMANHO_LOTE, emLotes } from "@/lib/churn/validar";
import { concluirImportacao, gravarLote } from "./actions";

type Etapa =
  | { tipo: "inicio" }
  | { tipo: "lendo" }
  | { tipo: "previa"; previa: Previa & { arquivo: string } }
  | { tipo: "gravando"; previa: Previa & { arquivo: string }; feitos: number; lote: number; lotes: number }
  | { tipo: "fim"; arquivo: string; importadas: number; atualizadas: number; rejeitadas: number; erro?: string };

const fmt = (n: number) => n.toLocaleString("pt-BR");

export function Importador() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "inicio" });
  const [erro, setErro] = useState<string | null>(null);

  async function gerarPrevia(ev: React.FormEvent) {
    ev.preventDefault();
    const f = input.current?.files?.[0];
    if (!f) return setErro("Escolha um arquivo .xlsx.");
    setErro(null);
    setEtapa({ tipo: "lendo" });
    const fd = new FormData();
    fd.set("arquivo", f);
    try {
      const res = await fetch("/api/adm/churn/previa", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        setErro(j.erro ?? "Não foi possível ler o arquivo.");
        return setEtapa({ tipo: "inicio" });
      }
      setEtapa({ tipo: "previa", previa: j });
    } catch {
      setErro("Falha de conexão ao enviar o arquivo. Tente de novo.");
      setEtapa({ tipo: "inicio" });
    }
  }

  async function confirmar(previa: Previa & { arquivo: string }) {
    const lotes = emLotes(previa.gravar, TAMANHO_LOTE);
    let importadas = 0;
    let atualizadas = 0;
    let rejeitadasNoBanco = 0;
    for (let i = 0; i < lotes.length; i++) {
      setEtapa({ tipo: "gravando", previa, feitos: i * TAMANHO_LOTE, lote: i + 1, lotes: lotes.length });
      const r = await gravarLote(lotes[i]);
      if (!r.ok) {
        const rejeitadas = previa.comProblema + rejeitadasNoBanco;
        setEtapa({
          tipo: "fim", arquivo: previa.arquivo, importadas, atualizadas, rejeitadas,
          erro: `O lote ${i + 1} de ${lotes.length} falhou (${r.erro}). As linhas dos lotes anteriores já foram gravadas; importe o arquivo de novo para completar.`,
        });
        router.refresh();
        return;
      }
      importadas += r.importadas;
      atualizadas += r.atualizadas;
      rejeitadasNoBanco += r.rejeitadas;
    }
    const rejeitadas = previa.comProblema + rejeitadasNoBanco;
    await concluirImportacao(previa.arquivo, { importadas, atualizadas, rejeitadas });
    setEtapa({ tipo: "fim", arquivo: previa.arquivo, importadas, atualizadas, rejeitadas });
    router.refresh();
  }

  const reiniciar = () => {
    if (input.current) input.current.value = "";
    setErro(null);
    setEtapa({ tipo: "inicio" });
  };

  return (
    <div className="flex flex-col gap-5">
      {(etapa.tipo === "inicio" || etapa.tipo === "lendo") && (
        <form onSubmit={gerarPrevia} className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="arquivo" className="text-sm font-medium">Planilha (.xlsx) com as colunas id_aluno e probabilidade_churn</label>
            <input ref={input} id="arquivo" name="arquivo" type="file" required
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="min-h-11 rounded-padrao border border-borda-campo bg-superficie px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-destaque file:px-3 file:py-1 file:text-destaque-texto" />
          </div>
          <button type="submit" disabled={etapa.tipo === "lendo"}
            className="min-h-11 rounded-padrao bg-destaque px-5 text-sm font-semibold text-destaque-texto disabled:opacity-60">
            {etapa.tipo === "lendo" ? "Lendo arquivo…" : "Gerar prévia"}
          </button>
        </form>
      )}
      {erro && <p role="alert" className="rounded-padrao border border-erro bg-erro-suave p-3 text-sm">{erro}</p>}

      {etapa.tipo === "previa" && <PreviaView p={etapa.previa} onConfirmar={() => confirmar(etapa.previa)} onCancelar={reiniciar} />}

      {etapa.tipo === "gravando" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Gravando lote {etapa.lote} de {etapa.lotes}… ({fmt(etapa.feitos)} de {fmt(etapa.previa.validas)} linhas)
          </p>
          <div
            role="progressbar"
            aria-label="Progresso da importação"
            aria-valuemin={0}
            aria-valuemax={etapa.lotes}
            aria-valuenow={etapa.lote - 1}
            className="h-4 w-full overflow-hidden rounded-full bg-fundo ring-1 ring-borda"
          >
            <div
              className="h-full rounded-full bg-linear-to-r from-sky-500 to-violet-500"
              style={{ width: `${Math.round(((etapa.lote - 1) / etapa.lotes) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-suave" aria-live="polite">{Math.round(((etapa.lote - 1) / etapa.lotes) * 100)}% concluído</p>
        </div>
      )}

      {etapa.tipo === "fim" && (
        <div className="flex flex-col gap-4" role="status">
          <div className={cx("rounded-padrao border p-4", etapa.erro ? "border-erro bg-erro-suave" : "border-sucesso bg-sucesso-suave")}>
            <p className="font-semibold">{etapa.erro ? "Importação interrompida" : "Importação concluída"} · {etapa.arquivo}</p>
            {etapa.erro && <p className="mt-1 text-sm">{etapa.erro}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Numero rotulo="Importadas (novas)" valor={etapa.importadas} cor="text-sucesso" />
            <Numero rotulo="Atualizadas" valor={etapa.atualizadas} cor="text-info" />
            <Numero rotulo="Rejeitadas" valor={etapa.rejeitadas} cor={etapa.rejeitadas ? "text-erro" : undefined} />
          </div>
          <div>
            <button type="button" onClick={reiniciar} className="min-h-11 rounded-padrao border border-borda px-4 text-sm font-semibold">
              Importar outro arquivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviaView({ p, onConfirmar, onCancelar }: { p: Previa & { arquivo: string }; onConfirmar: () => void; onCancelar: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">Prévia de <strong>{p.arquivo}</strong>. Nada foi gravado ainda.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero rotulo="Total de linhas" valor={p.total} />
        <Numero rotulo="Linhas válidas" valor={p.validas} cor="text-sucesso" />
        <Numero rotulo="Linhas com problema" valor={p.comProblema} cor={p.comProblema ? "text-erro" : undefined} />
      </div>
      {p.comProblema > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {Object.entries(p.porMotivo).map(([m, n]) => (
            <li key={m} className="rounded-full bg-erro-suave px-3 py-1">{m}: <strong>{fmt(n!)}</strong></li>
          ))}
        </ul>
      )}

      <Tabela titulo="10 primeiras linhas" linhas={p.primeiras} />
      {p.exemplosProblema.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            Ver linhas com problema ({p.exemplosProblema.length < p.comProblema ? `primeiras ${p.exemplosProblema.length} de ${fmt(p.comProblema)}` : fmt(p.comProblema)})
          </summary>
          <Tabela titulo="Linhas com problema" linhas={p.exemplosProblema} />
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onConfirmar} disabled={p.validas === 0}
          className="min-h-11 rounded-padrao bg-destaque px-5 text-sm font-semibold text-destaque-texto disabled:opacity-60">
          Confirmar importação de {fmt(p.validas)} linha(s)
        </button>
        <button type="button" onClick={onCancelar} className="min-h-11 rounded-padrao border border-borda px-4 text-sm font-semibold">
          Cancelar
        </button>
        <span className="text-sm text-suave">
          Gravação em {Math.ceil(p.validas / TAMANHO_LOTE)} lote(s) de até {TAMANHO_LOTE}. IDs já existentes são atualizados.
        </span>
      </div>
    </div>
  );
}

function Tabela({ titulo, linhas }: { titulo: string; linhas: Previa["primeiras"] }) {
  return (
    <div className="overflow-x-auto rounded-padrao border border-borda">
      <table className="w-full text-left text-sm">
        <caption className="px-4 py-2 text-left text-sm font-semibold">{titulo}</caption>
        <thead className="border-y border-borda text-suave">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Linha</th>
            <th scope="col" className="px-4 py-2 font-medium">id_aluno</th>
            <th scope="col" className="px-4 py-2 font-medium">probabilidade_churn</th>
            <th scope="col" className="px-4 py-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((l) => (
            <tr key={l.linha}>
              <td className="px-4 py-2 tabular-nums text-suave">{l.linha}</td>
              <td className="px-4 py-2 tabular-nums">{l.id_aluno || <em className="text-suave">vazio</em>}</td>
              <td className="px-4 py-2 tabular-nums">{l.probabilidade_churn || <em className="text-suave">vazio</em>}</td>
              <td className={cx("px-4 py-2", l.problema ? "text-erro" : "text-sucesso")}>{l.problema ?? "OK"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-padrao border border-borda bg-superficie p-4">
      <p className="text-sm text-suave">{rotulo}</p>
      <p className={cx("mt-1 text-3xl font-bold tabular-nums", cor)}>{fmt(valor)}</p>
    </div>
  );
}
