"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerHorarios, lerLista } from "@/components/campos";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export async function salvarProfessor(id: string | null, _: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const valores = {
    nome: String(dados.get("nome") ?? "").trim(),
    email: String(dados.get("email") ?? "").trim(),
    telefone: String(dados.get("telefone") ?? "").trim(),
    idiomas: String(dados.get("idiomas") ?? ""),
    niveis: String(dados.get("niveis") ?? ""),
  };
  const unidades = dados.getAll("unidades").map(String);
  const valoresComUnidades = { ...valores, unidades: unidades.join("|") };
  const ativo = id === null ? true : dados.get("ativo") === "on";
  const ip = await ipCliente();
  let novoId = id;
  try {
    const r = await comSessao("ADM", (t) =>
      rpc<{ id: string }>("adm_salvar_professor", {
        p_token: t,
        p_id: id,
        p_nome: valores.nome,
        p_email: valores.email,
        p_telefone: valores.telefone,
        p_idiomas: lerLista(valores.idiomas),
        p_niveis: lerLista(valores.niveis),
        p_unidades: unidades,
        p_ativo: ativo,
        p_ip: ip,
      }),
    );
    novoId = r.id;
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), valores: valoresComUnidades };
    throw e;
  }
  revalidatePath("/adm/professores");
  redirect(`/adm/professores/${novoId}?salvo=1`);
}

export async function salvarDisponibilidade(id: string, anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const horarios = lerHorarios(dados, "horarios");
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) =>
      rpc("adm_salvar_disponibilidade", { p_token: t, p_professor_id: id, p_horarios: horarios, p_ip: ip }),
    );
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), versao: anterior.versao };
    throw e;
  }
  revalidatePath(`/adm/professores/${id}`);
  return { sucesso: `Disponibilidade salva: ${horarios.length} horário(s) por semana.`, versao: anterior.versao };
}
