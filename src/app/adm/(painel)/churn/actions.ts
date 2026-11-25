"use server";

import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export type ResultadoLote =
  | { ok: true; importadas: number; atualizadas: number; rejeitadas: number }
  | { ok: false; erro: string };

/** Grava um lote de até 500 linhas (upsert por id_aluno). */
export async function gravarLote(linhas: { id_aluno: number; probabilidade_churn: number }[]): Promise<ResultadoLote> {
  try {
    const r = await comSessao("ADM", (t) =>
      rpc<{ importadas: number; atualizadas: number; rejeitadas: number }>("adm_churn_gravar_lote", {
        p_token: t,
        p_linhas: linhas.map((l) => ({ id_aluno: String(l.id_aluno), probabilidade_churn: String(l.probabilidade_churn) })),
      }),
    );
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
}

export async function concluirImportacao(arquivo: string, t: { importadas: number; atualizadas: number; rejeitadas: number }) {
  const ip = await ipCliente();
  await comSessao("ADM", (tok) =>
    rpc("adm_churn_concluir", {
      p_token: tok, p_arquivo: arquivo, p_importadas: t.importadas, p_atualizadas: t.atualizadas, p_rejeitadas: t.rejeitadas, p_ip: ip,
    }),
  );
  revalidatePath("/adm/churn");
}
