"use server";

import { revalidatePath } from "next/cache";
import { processarFila } from "@/lib/integracoes/fila";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** Processa agora os itens pendentes (com backoff vencido) no escopo do usuário. */
export async function processarAgora(): Promise<Resultado> {
  try {
    const r = await comSessao("ADM", (t) => processarFila(t, undefined, 100));
    revalidatePath("/adm/integracoes");
    if (r.processados === 0) return { ok: true, mensagem: "Nada pendente para processar agora." };
    return { ok: true, mensagem: `${plural(r.processados, "item processado", "itens processados")}: ${r.enviados} enviado(s), ${r.falhas} com falha.` };
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
}

/** Devolve à fila os itens com Falha (um ou todos) e já tenta enviá-los. */
export async function reprocessar(fila: "notificacao" | "calendario" | null, id: string | null): Promise<Resultado> {
  const ip = await ipCliente();
  try {
    const r = await comSessao("ADM", async (t) => {
      const v = await rpc<{ notificacoes: number; calendario: number }>("adm_reprocessar_integracoes", {
        p_token: t, p_fila: fila, p_id: id, p_ip: ip,
      });
      const p = await processarFila(t, undefined, 100);
      return { voltaram: v.notificacoes + v.calendario, ...p };
    });
    revalidatePath("/adm/integracoes");
    if (r.voltaram === 0) return { ok: true, mensagem: "Nenhuma falha para reprocessar." };
    return { ok: true, mensagem: `${plural(r.voltaram, "item voltou", "itens voltaram")} para a fila: ${r.enviados} enviado(s), ${r.falhas} com nova falha.` };
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
}
