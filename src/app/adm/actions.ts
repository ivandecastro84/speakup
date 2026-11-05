"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, gravarSessao, ipCliente } from "@/lib/server/session";

function texto(dados: FormData, campo: string) {
  return String(dados.get(campo) ?? "").trim();
}

async function tentar(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof RpcError) return mensagemErro(e.message);
    throw e;
  }
}

export async function entrarAdm(_: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const email = texto(dados, "email");
  const senha = String(dados.get("senha") ?? "");
  if (!email || !senha) return { erro: mensagemErro("CAMPOS_OBRIGATORIOS"), valores: { email } };

  const r = await rpc<{ ok: boolean; erro?: string; token?: string; duracao_minutos?: number }>("adm_login", {
    p_email: email,
    p_senha: senha,
    p_ip: await ipCliente(),
  });
  if (!r.ok || !r.token || !r.duracao_minutos) return { erro: mensagemErro(r.erro), valores: { email } };

  await gravarSessao({ tok: r.token, tp: "ADM", dur: r.duracao_minutos });
  redirect("/adm");
}

export async function trocarSenhaAdm(anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const atual = String(dados.get("atual") ?? "");
  const nova = String(dados.get("nova") ?? "");
  const confirmacao = String(dados.get("confirmacao") ?? "");
  if (!atual || !nova || !confirmacao) return { erro: mensagemErro("CAMPOS_OBRIGATORIOS") };
  if (nova !== confirmacao) return { erro: mensagemErro("SENHAS_DIFERENTES") };
  const ip = await ipCliente();
  const erro = await tentar(() =>
    comSessao("ADM", (t) =>
      rpc("adm_trocar_senha", { p_token: t, p_senha_atual: atual, p_nova_senha: nova, p_ip: ip }),
    ),
  );
  if (erro) return { erro };
  return { sucesso: "Senha alterada com sucesso.", versao: (anterior.versao ?? 0) + 1 };
}

export async function criarUnidade(anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const nome = texto(dados, "nome");
  if (!nome) return { erro: mensagemErro("NOME_OBRIGATORIO") };
  const ip = await ipCliente();
  const erro = await tentar(() =>
    comSessao("ADM", (t) => rpc("adm_criar_unidade", { p_token: t, p_nome: nome, p_ip: ip })),
  );
  if (erro) return { erro, valores: { nome } };
  revalidatePath("/adm/unidades");
  return { sucesso: `Unidade "${nome}" cadastrada.`, versao: (anterior.versao ?? 0) + 1 };
}

export async function criarUsuario(anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const valores = { email: texto(dados, "email"), nome: texto(dados, "nome"), papel: texto(dados, "papel") };
  const senha = String(dados.get("senha") ?? "");
  const unidades = dados.getAll("unidades").map(String);
  if (!valores.email || !valores.nome || !valores.papel || !senha) {
    return { erro: mensagemErro("CAMPOS_OBRIGATORIOS"), valores };
  }
  const ip = await ipCliente();
  const erro = await tentar(() =>
    comSessao("ADM", (t) =>
      rpc("adm_criar_usuario", {
        p_token: t,
        p_email: valores.email,
        p_nome: valores.nome,
        p_papel: valores.papel,
        p_senha: senha,
        p_unidades: unidades,
        p_ip: ip,
      }),
    ),
  );
  if (erro) return { erro, valores };
  revalidatePath("/adm/usuarios");
  return { sucesso: `Usuário ${valores.email} criado.`, versao: (anterior.versao ?? 0) + 1 };
}

export async function definirEmpresasUsuario(usuarioId: string, anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const empresas = dados.getAll("empresas").map(String);
  const ip = await ipCliente();
  const erro = await tentar(() =>
    comSessao("ADM", (t) => rpc("adm_definir_empresas_usuario", { p_token: t, p_usuario_id: usuarioId, p_empresas: empresas, p_ip: ip })),
  );
  if (erro) return { erro };
  revalidatePath("/adm/usuarios");
  return { sucesso: "Empresas atualizadas.", versao: (anterior.versao ?? 0) + 1 };
}
