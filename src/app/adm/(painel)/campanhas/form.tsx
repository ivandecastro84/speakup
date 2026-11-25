"use client";

import { useState } from "react";
import { Formulario } from "@/components/form";
import { Campo } from "@/components/ui";
import { personalizarMensagem } from "@/lib/campanhas";
import { salvarCampanha } from "./actions";

export interface DadosCampanha {
  nome: string;
  churn_minimo: number;
  churn_maximo: number;
  desconto_percentual: number;
  titulo_oferta: string;
  mensagem: string;
  data_inicio: string;
  data_fim: string;
  ativa: boolean;
}

const n = (v: number | undefined) => (v == null ? "" : String(Number(v)));

export function FormCampanha({ id, inicial }: { id: string | null; inicial?: DadosCampanha }) {
  return (
    <Formulario acao={salvarCampanha.bind(null, id)} textoBotao={id ? "Salvar alterações" : "Cadastrar campanha"} textoPendente="Salvando…">
      {(e) => <Campos e={e} inicial={inicial} />}
    </Formulario>
  );
}

function Campos({ e, inicial }: { e: { valores?: Record<string, string>; erros?: Record<string, string> }; inicial?: DadosCampanha }) {
  const v = (k: string, padrao: string) => e.valores?.[k] ?? padrao;
  const [titulo, setTitulo] = useState(v("titulo", inicial?.titulo_oferta ?? ""));
  const [mensagem, setMensagem] = useState(v("mensagem", inicial?.mensagem ?? "Olá, {nome}! Temos uma condição especial para você renovar sua matrícula."));
  const [desc, setDesc] = useState(v("desconto", n(inicial?.desconto_percentual)));

  return (
    <>
      <Campo id="nome" name="nome" rotulo="Nome da campanha" required defaultValue={v("nome", inicial?.nome ?? "")} erro={e.erros?.nome} />
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Faixa de churn e desconto</legend>
        <Campo id="churn_minimo" name="churn_minimo" rotulo="Churn mínimo (%)" inputMode="decimal" required
          defaultValue={v("churn_minimo", n(inicial?.churn_minimo))} erro={e.erros?.churn_minimo} ajuda="Inclui o valor." />
        <Campo id="churn_maximo" name="churn_maximo" rotulo="Churn máximo (%)" inputMode="decimal" required
          defaultValue={v("churn_maximo", n(inicial?.churn_maximo))} erro={e.erros?.churn_maximo} ajuda="Não inclui o valor (exceto 100)." />
        <Campo id="desconto" name="desconto" rotulo="Desconto na rematrícula antecipada (%)" inputMode="decimal" required
          value={desc} onChange={(ev) => setDesc(ev.target.value)} erro={e.erros?.desconto} ajuda="De 0 a 100." />
      </fieldset>
      <Campo id="titulo" name="titulo" rotulo="Título da oferta" required value={titulo} onChange={(ev) => setTitulo(ev.target.value)}
        erro={e.erros?.titulo} maxLength={120} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mensagem" className="text-sm font-medium">Mensagem que o aluno verá</label>
        <textarea id="mensagem" name="mensagem" required rows={4} maxLength={1000} value={mensagem} onChange={(ev) => setMensagem(ev.target.value)}
          aria-describedby="mensagem-ajuda" aria-invalid={Boolean(e.erros?.mensagem)}
          className="rounded-padrao border border-borda-campo bg-superficie px-3 py-2 text-texto" />
        <p id="mensagem-ajuda" className="text-sm text-suave">
          Use <code className="rounded bg-fundo px-1 font-mono">{"{nome}"}</code> para inserir o primeiro nome do aluno. {mensagem.length}/1000
        </p>
        {e.erros?.mensagem && <p className="text-sm text-erro">{e.erros.mensagem}</p>}
      </div>
      <div className="rounded-padrao border border-dashed border-borda p-4" aria-live="polite">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-suave">Prévia para a aluna “Mariana Alves”</p>
        <p className="text-lg font-bold">{titulo || "Título da oferta"}</p>
        <p className="mt-1 whitespace-pre-line">{personalizarMensagem(mensagem || "…", "Mariana Alves")}</p>
        {desc && <p className="mt-2 inline-block rounded-full bg-sucesso-suave px-3 py-1 text-sm font-semibold text-sucesso">{desc}% de desconto na rematrícula antecipada</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="data_inicio" name="data_inicio" type="date" rotulo="Data de início" required defaultValue={v("data_inicio", inicial?.data_inicio ?? "")} erro={e.erros?.data_inicio} />
        <Campo id="data_fim" name="data_fim" type="date" rotulo="Data de fim" required defaultValue={v("data_fim", inicial?.data_fim ?? "")} erro={e.erros?.data_fim} />
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="ativa" defaultChecked={e.valores ? e.valores.ativa === "on" : (inicial?.ativa ?? true)} className="size-5" />
        <span>
          <span className="font-medium">Campanha ativa</span>
          <span className="block text-sm text-suave">Duas campanhas ativas não podem cruzar faixa de churn e período ao mesmo tempo.</span>
        </span>
      </label>
    </>
  );
}
