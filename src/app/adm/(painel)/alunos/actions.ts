"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoForm } from "@/components/form";
import { COLUNAS, type Coluna } from "@/lib/importacao/colunas";
import { validarRegistroAluno } from "@/lib/importacao/validar";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

export async function salvarAluno(novo: boolean, _: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const valores = Object.fromEntries(COLUNAS.map((c) => [c, String(dados.get(c) ?? "").trim()])) as Record<Coluna, string>;
  const v = validarRegistroAluno(valores);
  if (!v.dados) {
    return { erro: "Corrija os campos destacados.", erros: v.erros as Record<string, string>, valores };
  }
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) => rpc("adm_salvar_aluno", { p_token: t, p_novo: novo, p_dados: v.dados, p_ip: ip }));
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), valores };
    throw e;
  }
  revalidatePath("/adm/alunos", "layout");
  redirect(`/adm/alunos/${encodeURIComponent(valores.id_aluno)}?salvo=1`);
}

export async function inativarAluno(idAluno: string, _: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const status = String(dados.get("status") ?? "");
  const data = String(dados.get("data_cancelamento") ?? "") || null;
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) =>
      rpc("adm_inativar_aluno", { p_token: t, p_id_aluno: idAluno, p_status: status, p_data_cancelamento: data, p_ip: ip }),
    );
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message) };
    throw e;
  }
  revalidatePath("/adm/alunos", "layout");
  redirect(`/adm/alunos/${encodeURIComponent(idAluno)}?inativado=1`);
}
