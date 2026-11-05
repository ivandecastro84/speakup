"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export async function salvarChamada(turmaId: string, data: string, hora: number, _: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const registros: Record<string, string>[] = [];
  for (const [chave, valor] of dados.entries()) {
    const situacao = String(valor);
    if (situacao !== "Presente" && situacao !== "Falta") continue;
    if (chave.startsWith("aluno:")) registros.push({ id_aluno: chave.slice(6), situacao });
    else if (chave.startsWith("repo:")) registros.push({ reposicao_id: chave.slice(5), situacao });
  }
  if (registros.length === 0) return { erro: "Marque presença ou falta para pelo menos um aluno." };
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) =>
      rpc("adm_registrar_chamada", { p_token: t, p_turma_id: turmaId, p_data: data, p_hora: hora, p_registros: registros, p_ip: ip }),
    );
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message) };
    throw e;
  }
  revalidatePath(`/adm/turmas/${turmaId}/chamada`);
  redirect(`/adm/turmas/${turmaId}/chamada?aula=${data}_${hora}&salvo=1`);
}
