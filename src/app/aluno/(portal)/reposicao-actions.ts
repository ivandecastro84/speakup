"use server";

import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export type ResultadoAcao = { ok: true; mensagem: string; devolvido?: boolean } | { ok: false; erro: string };

export async function agendarReposicao(escolha: {
  data: string;
  hora: number;
  tipo: "TURMA" | "AVULSA";
  turmaId: string | null;
}): Promise<ResultadoAcao> {
  const ip = await ipCliente();
  try {
    await comSessao("ALUNO", (t) =>
      rpc("aluno_agendar_reposicao", {
        p_token: t,
        p_data: escolha.data,
        p_hora: escolha.hora,
        p_tipo: escolha.tipo,
        p_turma_id: escolha.turmaId,
        p_ip: ip,
      }),
    );
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
  revalidatePath("/aluno", "layout");
  return { ok: true, mensagem: "Reposição agendada." };
}

export async function cancelarReposicao(id: string): Promise<ResultadoAcao> {
  const ip = await ipCliente();
  try {
    const r = await comSessao("ALUNO", (t) =>
      rpc<{ credito_devolvido: boolean }>("aluno_cancelar_reposicao", { p_token: t, p_reposicao_id: id, p_ip: ip }),
    );
    revalidatePath("/aluno", "layout");
    return {
      ok: true,
      devolvido: r.credito_devolvido,
      mensagem: r.credito_devolvido
        ? "Reposição cancelada. O crédito voltou para o seu saldo."
        : "Reposição cancelada fora do prazo: o crédito foi consumido.",
    };
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
}
