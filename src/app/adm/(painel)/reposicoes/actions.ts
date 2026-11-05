"use server";

import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

/** Retorna a mensagem de erro, ou null em caso de sucesso. */
export async function marcarPresencaReposicao(id: string, situacao: "Presente" | "Falta"): Promise<string | null> {
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) =>
      rpc("adm_registrar_presenca_reposicao", { p_token: t, p_reposicao_id: id, p_situacao: situacao, p_ip: ip }),
    );
  } catch (e) {
    if (e instanceof RpcError) return mensagemErro(e.message);
    throw e;
  }
  revalidatePath("/adm/reposicoes");
  return null;
}
