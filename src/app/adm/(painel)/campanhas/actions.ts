"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

const CAMPOS = ["nome", "churn_minimo", "churn_maximo", "desconto", "titulo", "mensagem", "data_inicio", "data_fim"] as const;

function numero(v: string): number | null {
  const s = v.trim().replace(",", ".");
  return s === "" || Number.isNaN(Number(s)) ? null : Number(s);
}

export async function salvarCampanha(id: string | null, _: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const valores: Record<string, string> = Object.fromEntries(CAMPOS.map((k) => [k, String(dados.get(k) ?? "").trim()]));
  const ativa = dados.get("ativa") === "on";
  valores.ativa = ativa ? "on" : "";
  const erros: Record<string, string> = {};
  const min = numero(valores.churn_minimo);
  const max = numero(valores.churn_maximo);
  const desc = numero(valores.desconto);
  if (!valores.nome) erros.nome = "Informe o nome.";
  if (min == null) erros.churn_minimo = "Informe um número de 0 a 100.";
  if (max == null) erros.churn_maximo = "Informe um número de 0 a 100.";
  if (min != null && max != null && min >= max) erros.churn_maximo = "Deve ser maior que o churn mínimo.";
  if (desc == null) erros.desconto = "Informe um número de 0 a 100.";
  if (!valores.titulo) erros.titulo = "Informe o título da oferta.";
  if (!valores.mensagem) erros.mensagem = "Escreva a mensagem.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valores.data_inicio)) erros.data_inicio = "Informe a data de início.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valores.data_fim)) erros.data_fim = "Informe a data de fim.";
  else if (valores.data_inicio && valores.data_fim <= valores.data_inicio) erros.data_fim = "Deve ser depois da data de início.";
  if (Object.keys(erros).length) return { erro: "Corrija os campos destacados.", erros, valores };

  const ip = await ipCliente();
  let novoId = id;
  try {
    const r = await comSessao("ADM", (t) =>
      rpc<{ id: string }>("adm_campanha_salvar", {
        p_token: t, p_id: id, p_nome: valores.nome, p_churn_minimo: min, p_churn_maximo: max, p_desconto: desc,
        p_titulo: valores.titulo, p_mensagem: valores.mensagem, p_data_inicio: valores.data_inicio, p_data_fim: valores.data_fim,
        p_ativa: ativa, p_ip: ip,
      }),
    );
    novoId = r.id;
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), valores };
    throw e;
  }
  revalidatePath("/adm/campanhas");
  redirect(`/adm/campanhas?salvo=${novoId}`);
}

export async function alternarAtiva(id: string, ativa: boolean): Promise<string | null> {
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) => rpc("adm_campanha_definir_ativa", { p_token: t, p_id: id, p_ativa: ativa, p_ip: ip }));
  } catch (e) {
    if (e instanceof RpcError) return mensagemErro(e.message);
    throw e;
  }
  revalidatePath("/adm/campanhas");
  return null;
}

export async function excluirCampanha(id: string): Promise<string | null> {
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) => rpc("adm_campanha_excluir", { p_token: t, p_id: id, p_ip: ip }));
  } catch (e) {
    if (e instanceof RpcError) return mensagemErro(e.message);
    throw e;
  }
  revalidatePath("/adm/campanhas");
  return null;
}
