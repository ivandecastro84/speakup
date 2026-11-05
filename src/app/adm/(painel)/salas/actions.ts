"use server";

import { revalidatePath } from "next/cache";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export async function salvarSala(id: string | null, anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const valores = {
    unidade: String(dados.get("unidade") ?? ""),
    nome: String(dados.get("nome") ?? "").trim(),
    capacidade: String(dados.get("capacidade") ?? "").trim(),
  };
  const capacidade = /^\d+$/.test(valores.capacidade) ? Number(valores.capacidade) : null;
  if (!valores.unidade || !valores.nome || capacidade === null) {
    return { erro: "Preencha unidade, nome e capacidade (número inteiro).", valores };
  }
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) =>
      rpc("adm_salvar_sala", {
        p_token: t,
        p_id: id,
        p_unidade: valores.unidade,
        p_nome: valores.nome,
        p_capacidade: capacidade,
        p_ativa: id === null ? true : dados.get("ativa") === "on",
        p_ip: ip,
      }),
    );
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), valores };
    throw e;
  }
  revalidatePath("/adm/salas");
  return { sucesso: id ? "Sala atualizada." : `Sala "${valores.nome}" cadastrada.`, versao: (anterior.versao ?? 0) + 1 };
}
