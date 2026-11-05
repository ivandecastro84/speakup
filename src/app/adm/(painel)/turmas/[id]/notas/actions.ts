"use server";

import { revalidatePath } from "next/cache";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export async function lancarNotas(turmaId: string, anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const data = String(dados.get("data") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data da avaliação." };

  const porAluno = new Map<string, Record<string, string>>();
  for (const [chave, valor] of dados.entries()) {
    const [id, campo] = chave.split("|");
    if (!campo) continue;
    const v = String(valor).trim().replace(",", ".");
    const reg = porAluno.get(id) ?? { id_aluno: id };
    reg[campo] = v;
    porAluno.set(id, reg);
  }
  const registros = [...porAluno.values()];
  const ip = await ipCliente();
  try {
    const r = await comSessao("ADM", (t) =>
      rpc<{ lancadas: number }>("adm_lancar_avaliacoes", { p_token: t, p_turma_id: turmaId, p_data: data, p_registros: registros, p_ip: ip }),
    );
    revalidatePath(`/adm/turmas/${turmaId}/notas`);
    return { sucesso: `Notas salvas para ${r.lancadas} aluno(s).`, versao: (anterior.versao ?? 0) + 1 };
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message) };
    throw e;
  }
}
