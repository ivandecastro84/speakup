import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { rpc } from "@/lib/server/rpc";
import { comSessao } from "@/lib/server/session";

export type Permissao =
  | "TODAS_UNIDADES"
  | "USUARIOS_GERENCIAR"
  | "UNIDADES_GERENCIAR"
  | "AUDITORIA_LER"
  | "ALUNOS_LER"
  | "ALUNOS_IMPORTAR"
  | "ALUNOS_EDITAR"
  | "GRADE_EDITAR"
  | "RELATORIOS_LER"
  | "EMPRESAS_GERENCIAR"
  | "NOTAS_LANCAR";

export interface UsuarioAdm {
  id: string;
  nome: string;
  email: string;
  papel: "ADM_SUPERADMIN" | "ADM_COORDENACAO" | "ADM_RH";
  permissoes: Permissao[];
  unidades: string[];
}

export const admAtual = cache(() =>
  comSessao("ADM", (token) => rpc<UsuarioAdm>("adm_me", { p_token: token })),
);

/** Chamada autenticada da área ADM. */
export function chamarAdm<T>(fn: string, args: Record<string, unknown> = {}) {
  return comSessao("ADM", (token) => rpc<T>(fn, { p_token: token, ...args }));
}

/**
 * Esconde a página de quem não tem a permissão. A regra real está no banco:
 * mesmo sem esta checagem, a RPC devolveria 403.
 */
export async function exigirPermissaoPagina(p: Permissao) {
  const u = await admAtual();
  if (!u.permissoes.includes(p)) notFound();
  return u;
}

export const ROTULO_PAPEL: Record<UsuarioAdm["papel"], string> = {
  ADM_SUPERADMIN: "Superadministrador",
  ADM_COORDENACAO: "Coordenação",
  ADM_RH: "RH corporativo",
};
