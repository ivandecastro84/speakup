"use server";

import { revalidatePath } from "next/cache";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

export interface NotaIndividual {
  idAluno: string;
  turmaId: string;
  data: string;
  speaking: string;
  listening: string;
  reading: string;
  writing: string;
  cefr: string;
}

/** Salva a nota de UM aluno reaproveitando adm_lancar_avaliacoes (mesmas regras e auditoria). */
export async function salvarNota(n: NotaIndividual): Promise<Resultado> {
  if (!n.idAluno || !n.turmaId) return { ok: false, erro: "Escolha o aluno e a turma." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.data)) return { ok: false, erro: "Informe a data da avaliação." };
  const campos = {
    speaking: n.speaking.trim().replace(",", "."),
    listening: n.listening.trim().replace(",", "."),
    reading: n.reading.trim().replace(",", "."),
    writing: n.writing.trim().replace(",", "."),
    cefr: n.cefr,
  };
  if (!Object.values(campos).some(Boolean)) return { ok: false, erro: "Preencha pelo menos uma nota ou o nível CEFR." };
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) =>
      rpc("adm_lancar_avaliacoes", {
        p_token: t,
        p_turma_id: n.turmaId,
        p_data: n.data,
        p_registros: [{ id_aluno: n.idAluno, ...campos }],
        p_ip: ip,
      }),
    );
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
  revalidatePath("/adm/notas");
  return { ok: true, mensagem: "Notas salvas." };
}

export async function excluirNota(id: string): Promise<Resultado> {
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) => rpc("adm_excluir_avaliacao", { p_token: t, p_id: id, p_ip: ip }));
  } catch (e) {
    if (e instanceof RpcError) return { ok: false, erro: mensagemErro(e.message) };
    throw e;
  }
  revalidatePath("/adm/notas");
  return { ok: true, mensagem: "Avaliação excluída." };
}
