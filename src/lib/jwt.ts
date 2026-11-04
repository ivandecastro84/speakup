import { SignJWT, jwtVerify } from "jose";

/** Funções de JWT compatíveis com o runtime edge (usadas pelo middleware). */
export type TipoSessao = "ALUNO" | "ADM";

export interface ClaimsSessao {
  /** token opaco da sessão no banco */
  tok: string;
  tp: TipoSessao;
  /** duração da sessão em minutos (renovação deslizante) */
  dur: number;
  /** aluno ainda precisa trocar a senha padrão */
  pa?: boolean;
  exp?: number;
  iat?: number;
}

export const COOKIE: Record<TipoSessao, string> = { ALUNO: "su_aluno", ADM: "su_adm" };

function segredo(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou com menos de 32 caracteres");
  return new TextEncoder().encode(s);
}

export async function assinar(
  claims: Omit<ClaimsSessao, "exp" | "iat">,
  agora = Date.now(),
): Promise<string> {
  const iat = Math.floor(agora / 1000);
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + claims.dur * 60)
    .sign(segredo());
}

export async function verificar(
  jwt: string | undefined,
  tipo: TipoSessao,
): Promise<ClaimsSessao | null> {
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, segredo(), { algorithms: ["HS256"] });
    const c = payload as unknown as ClaimsSessao;
    if (c.tp !== tipo || typeof c.tok !== "string" || typeof c.dur !== "number") return null;
    return c;
  } catch {
    return null;
  }
}

/** Verdadeiro quando já passou metade da validade: hora de renovar. */
export function precisaRenovar(c: ClaimsSessao, agora = Date.now()): boolean {
  if (!c.exp || !c.iat) return false;
  return agora / 1000 > c.iat + (c.exp - c.iat) / 2;
}
