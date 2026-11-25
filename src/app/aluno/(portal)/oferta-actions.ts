"use server";

import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export async function registrarInteresse(campanhaId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const ip = await ipCliente();
  try {
    await comSessao("ALUNO", (t) => rpc("aluno_registrar_interesse", { p_token: t, p_campanha_id: campanhaId, p_ip: ip }));
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
  revalidatePath("/aluno");
  return { ok: true };
}
