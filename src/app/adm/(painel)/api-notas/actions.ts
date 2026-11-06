"use server";

import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export type ResultadoChave = { ok: true; chave?: string; prefixo?: string; empresa?: string } | { ok: false; erro: string };

export async function gerarChave(empresaId: string): Promise<ResultadoChave> {
  const ip = await ipCliente();
  try {
    const r = await comSessao("ADM", (t) =>
      rpc<{ chave: string; prefixo: string; empresa: string }>("adm_gerar_chave_api", { p_token: t, p_empresa_id: empresaId, p_ip: ip }),
    );
    revalidatePath("/adm/api-notas");
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
}

export async function revogarChave(empresaId: string): Promise<ResultadoChave> {
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) => rpc("adm_revogar_chave_api", { p_token: t, p_empresa_id: empresaId, p_ip: ip }));
    revalidatePath("/adm/api-notas");
    return { ok: true };
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
}
