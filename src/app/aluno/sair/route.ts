import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verificar } from "@/lib/jwt";
import { rpc } from "@/lib/server/rpc";

async function sair(req: NextRequest) {
  const claims = await verificar(req.cookies.get(COOKIE.ALUNO)?.value, "ALUNO");
  if (claims) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await rpc("encerrar_sessao", { p_token: claims.tok, p_ip: ip }).catch(() => {});
  }
  const res = NextResponse.redirect(new URL("/aluno/login", req.url), 303);
  res.cookies.delete(COOKIE.ALUNO);
  return res;
}

export const GET = sair;
export const POST = sair;
