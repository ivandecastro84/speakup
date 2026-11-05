"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerHorarios } from "@/components/campos";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

const CAMPOS = [
  "codigo", "nome", "unidade", "idioma", "nivel_curso", "modalidade", "professor_id", "sala_id",
  "capacidade", "data_inicio", "data_fim", "situacao",
] as const;

export async function salvarTurma(id: string | null, _: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(dados.get(c) ?? "").trim()])) as Record<(typeof CAMPOS)[number], string>;
  const horarios = lerHorarios(dados, "horarios");
  if (!/^\d+$/.test(valores.capacidade)) return { erro: "Informe a capacidade como número inteiro.", valores };
  if (horarios.length === 0) return { erro: "Marque pelo menos um horário na grade.", valores };

  const ip = await ipCliente();
  let novoId = id;
  try {
    const r = await comSessao("ADM", (t) =>
      rpc<{ id: string }>("adm_salvar_turma", {
        p_token: t,
        p_id: id,
        p_dados: {
          ...valores,
          capacidade: Number(valores.capacidade),
          sala_id: valores.modalidade === "Online" ? null : valores.sala_id || null,
          professor_id: valores.professor_id || null,
          data_inicio: valores.data_inicio || null,
          data_fim: valores.data_fim || null,
          situacao: valores.situacao || "Ativa",
        },
        p_horarios: horarios,
        p_ip: ip,
      }),
    );
    novoId = r.id;
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), valores };
    throw e;
  }
  revalidatePath("/adm/turmas");
  redirect(`/adm/turmas/${novoId}?salvo=1`);
}

export async function incluirAluno(turmaId: string, anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const idAluno = String(dados.get("id_aluno") ?? "").trim();
  if (!idAluno) return { erro: "Informe a matrícula do aluno." };
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) => rpc("adm_turma_incluir_aluno", { p_token: t, p_turma_id: turmaId, p_id_aluno: idAluno, p_ip: ip }));
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), valores: { id_aluno: idAluno } };
    throw e;
  }
  revalidatePath(`/adm/turmas/${turmaId}`);
  return { sucesso: `Aluno ${idAluno} incluído.`, versao: (anterior.versao ?? 0) + 1 };
}

export async function removerAluno(turmaId: string, idAluno: string) {
  const ip = await ipCliente();
  await comSessao("ADM", (t) => rpc("adm_turma_remover_aluno", { p_token: t, p_turma_id: turmaId, p_id_aluno: idAluno, p_ip: ip }));
  revalidatePath(`/adm/turmas/${turmaId}`);
}
