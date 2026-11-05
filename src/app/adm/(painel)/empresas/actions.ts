"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, ipCliente } from "@/lib/server/session";

function numero(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" || Number.isNaN(Number(s)) ? null : Number(s);
}

export async function salvarEmpresa(id: string | null, _: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const valores = Object.fromEntries(
    ["nome", "cnpj", "contato_nome", "contato_email", "freq_minima", "media_minima"].map((k) => [k, String(dados.get(k) ?? "").trim()]),
  );
  const ip = await ipCliente();
  let novoId = id;
  try {
    const r = await comSessao("ADM", (t) =>
      rpc<{ id: string }>("adm_salvar_empresa", {
        p_token: t,
        p_id: id,
        p_nome: valores.nome,
        p_cnpj: valores.cnpj || null,
        p_contato_nome: valores.contato_nome || null,
        p_contato_email: valores.contato_email || null,
        p_freq_minima: numero(dados.get("freq_minima")),
        p_media_minima: numero(dados.get("media_minima")),
        p_ativa: id === null ? true : dados.get("ativa") === "on",
        p_ip: ip,
      }),
    );
    novoId = r.id;
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), valores };
    throw e;
  }
  revalidatePath("/adm/empresas");
  redirect(`/adm/empresas/${novoId}?salvo=1`);
}

/** Matrículas separadas por linha, vírgula, ponto e vírgula ou espaço (colar uma coluna da planilha). */
export async function vincularAlunos(empresaId: string, anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const texto = String(dados.get("matriculas") ?? "");
  const ids = [...new Set(texto.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))].filter((s) => s.toLowerCase() !== "id_aluno");
  if (ids.length === 0) return { erro: "Cole pelo menos uma matrícula." };
  const ip = await ipCliente();
  try {
    const r = await comSessao("ADM", (t) =>
      rpc<{ vinculados: number; nao_encontrados: string[] }>("adm_vincular_alunos_empresa", {
        p_token: t, p_empresa_id: empresaId, p_ids: ids, p_ip: ip,
      }),
    );
    revalidatePath(`/adm/empresas/${empresaId}`);
    const faltou = r.nao_encontrados.length
      ? ` Não encontradas no seu escopo: ${r.nao_encontrados.slice(0, 20).join(", ")}${r.nao_encontrados.length > 20 ? "…" : ""}.`
      : "";
    return {
      sucesso: `${r.vinculados} aluno(s) vinculado(s).${faltou}`,
      versao: (anterior.versao ?? 0) + 1,
    };
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message), valores: { matriculas: texto } };
    throw e;
  }
}

export async function desvincularAluno(empresaId: string, idAluno: string) {
  const ip = await ipCliente();
  await comSessao("ADM", (t) => rpc("adm_desvincular_aluno_empresa", { p_token: t, p_id_aluno: idAluno, p_ip: ip }));
  revalidatePath(`/adm/empresas/${empresaId}`);
}

/** Vínculo pela ficha do aluno (empresa vazia = desvincular). */
export async function definirEmpresaAluno(idAluno: string, anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const empresa = String(dados.get("empresa") ?? "");
  const ip = await ipCliente();
  try {
    await comSessao("ADM", (t) =>
      empresa
        ? rpc("adm_vincular_alunos_empresa", { p_token: t, p_empresa_id: empresa, p_ids: [idAluno], p_ip: ip })
        : rpc("adm_desvincular_aluno_empresa", { p_token: t, p_id_aluno: idAluno, p_ip: ip }),
    );
  } catch (e) {
    if (e instanceof RpcError) return { erro: mensagemErro(e.message) };
    throw e;
  }
  revalidatePath(`/adm/alunos/${encodeURIComponent(idAluno)}`);
  return { sucesso: empresa ? "Empresa vinculada." : "Vínculo removido.", versao: (anterior.versao ?? 0) + 1 };
}
