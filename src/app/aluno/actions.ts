"use server";

import { redirect } from "next/navigation";
import type { EstadoForm } from "@/components/form";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { comSessao, exigirSessao, gravarSessao, ipCliente } from "@/lib/server/session";

interface RespostaLogin {
  ok: boolean;
  erro?: string;
  token?: string;
  duracao_minutos?: number;
  primeiro_acesso?: boolean;
}

function texto(dados: FormData, campo: string) {
  return String(dados.get(campo) ?? "").trim();
}

export async function entrarAluno(_: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const idAluno = texto(dados, "id_aluno");
  const senha = String(dados.get("senha") ?? "");
  if (!idAluno || !senha) {
    return { erro: mensagemErro("CAMPOS_OBRIGATORIOS"), valores: { id_aluno: idAluno } };
  }

  const r = await rpc<RespostaLogin>("login_aluno", {
    p_id_aluno: idAluno,
    p_senha: senha,
    p_ip: await ipCliente(),
  });
  if (!r.ok || !r.token || !r.duracao_minutos) {
    return { erro: mensagemErro(r.erro), valores: { id_aluno: idAluno } };
  }

  await gravarSessao({ tok: r.token, tp: "ALUNO", dur: r.duracao_minutos, pa: r.primeiro_acesso });
  redirect(r.primeiro_acesso ? "/aluno/primeiro-acesso" : "/aluno");
}

async function definirSenha(atual: string | null, nova: string, confirmacao: string): Promise<string | null> {
  if (!nova || !confirmacao || (atual !== null && !atual)) return mensagemErro("CAMPOS_OBRIGATORIOS");
  if (nova !== confirmacao) return mensagemErro("SENHAS_DIFERENTES");
  try {
    const ip = await ipCliente();
    await comSessao("ALUNO", (token) =>
      rpc("aluno_definir_senha", {
        p_token: token,
        p_senha_atual: atual,
        p_nova_senha: nova,
        p_ip: ip,
      }),
    );
    return null;
  } catch (e) {
    if (e instanceof RpcError) return mensagemErro(e.message);
    throw e;
  }
}

export async function definirSenhaPrimeiroAcesso(_: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const erro = await definirSenha(null, String(dados.get("nova") ?? ""), String(dados.get("confirmacao") ?? ""));
  if (erro) return { erro };
  const s = await exigirSessao("ALUNO");
  await gravarSessao({ tok: s.tok, tp: "ALUNO", dur: s.dur, pa: false });
  redirect("/aluno");
}

export async function alterarSenhaAluno(anterior: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const erro = await definirSenha(
    String(dados.get("atual") ?? ""),
    String(dados.get("nova") ?? ""),
    String(dados.get("confirmacao") ?? ""),
  );
  if (erro) return { erro };
  return { sucesso: "Senha alterada com sucesso.", versao: (anterior.versao ?? 0) + 1 };
}
