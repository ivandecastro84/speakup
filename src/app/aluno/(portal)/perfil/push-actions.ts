"use server";

import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao } from "@/lib/server/session";

export async function salvarInscricaoPush(s: { endpoint: string; p256dh: string; auth: string }): Promise<string | null> {
  try {
    await comSessao("ALUNO", (t) =>
      rpc("aluno_push_inscrever", { p_token: t, p_endpoint: s.endpoint, p_chave: s.p256dh, p_auth: s.auth }),
    );
    return null;
  } catch (e) {
    if (e instanceof RpcError) return mensagemErro(e.message);
    throw e;
  }
}

export async function removerInscricaoPush(endpoint: string): Promise<void> {
  await comSessao("ALUNO", (t) => rpc("aluno_push_cancelar", { p_token: t, p_endpoint: endpoint }));
}
