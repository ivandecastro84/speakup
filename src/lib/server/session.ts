import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, assinar, verificar, type ClaimsSessao, type TipoSessao } from "@/lib/jwt";
import { RpcError } from "./rpc";

const LOGIN: Record<TipoSessao, string> = { ALUNO: "/aluno/login", ADM: "/adm/login" };
const SAIR: Record<TipoSessao, string> = { ALUNO: "/aluno/sair", ADM: "/adm/sair" };

export async function ipCliente(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function gravarSessao(claims: Omit<ClaimsSessao, "exp" | "iat">) {
  const jwt = await assinar(claims);
  (await cookies()).set(COOKIE[claims.tp], jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: claims.dur * 60,
  });
}

export async function apagarSessao(tipo: TipoSessao) {
  (await cookies()).delete(COOKIE[tipo]);
}

export async function lerSessao(tipo: TipoSessao): Promise<ClaimsSessao | null> {
  return verificar((await cookies()).get(COOKIE[tipo])?.value, tipo);
}

/** Exige sessão válida; sem ela, redireciona ao login da área. */
export async function exigirSessao(tipo: TipoSessao): Promise<ClaimsSessao> {
  const s = await lerSessao(tipo);
  if (!s) redirect(`${LOGIN[tipo]}?expirado=1`);
  return s;
}

/**
 * Executa uma chamada autenticada. Se o banco disser que a sessão não vale
 * mais (401), encerra a sessão local e manda para o login.
 */
export async function comSessao<T>(
  tipo: TipoSessao,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const s = await exigirSessao(tipo);
  try {
    return await fn(s.tok);
  } catch (e) {
    if (e instanceof RpcError && e.status === 401) redirect(SAIR[tipo]);
    throw e;
  }
}
