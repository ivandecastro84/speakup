import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, assinar, precisaRenovar, verificar, type TipoSessao } from "@/lib/jwt";

/**
 * Guarda das duas áreas. Portal do Aluno e Painel ADM usam cookies distintos
 * e não se misturam: uma sessão de aluno nunca abre rotas /adm e vice-versa.
 * A autorização de dados é sempre revalidada no banco (RPC); aqui só se
 * decide navegação e renovação deslizante do JWT.
 */
const AREAS: Record<TipoSessao, { prefixo: string; login: string; inicio: string }> = {
  ALUNO: { prefixo: "/aluno", login: "/aluno/login", inicio: "/aluno" },
  ADM: { prefixo: "/adm", login: "/adm/login", inicio: "/adm" },
};

const PRIMEIRO_ACESSO = "/aluno/primeiro-acesso";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const tipo: TipoSessao = pathname.startsWith("/adm") ? "ADM" : "ALUNO";
  const area = AREAS[tipo];
  const cookie = req.cookies.get(COOKIE[tipo])?.value;
  const claims = await verificar(cookie, tipo);

  // Rota de saída é sempre liberada (limpa cookie e revoga sessão).
  if (pathname === `${area.prefixo}/sair`) return NextResponse.next();

  if (pathname === area.login) {
    if (claims) return NextResponse.redirect(new URL(area.inicio, req.url));
    return NextResponse.next();
  }

  if (!claims) {
    const url = new URL(area.login, req.url);
    if (cookie) url.searchParams.set("expirado", "1");
    const res = NextResponse.redirect(url);
    if (cookie) res.cookies.delete(COOKIE[tipo]);
    return res;
  }

  if (tipo === "ALUNO") {
    if (claims.pa && pathname !== PRIMEIRO_ACESSO) {
      return NextResponse.redirect(new URL(PRIMEIRO_ACESSO, req.url));
    }
    if (!claims.pa && pathname === PRIMEIRO_ACESSO) {
      return NextResponse.redirect(new URL(area.inicio, req.url));
    }
  }

  const res = NextResponse.next();
  if (precisaRenovar(claims)) {
    const novo = await assinar({ tok: claims.tok, tp: claims.tp, dur: claims.dur, pa: claims.pa });
    res.cookies.set(COOKIE[tipo], novo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: claims.dur * 60,
    });
  }
  return res;
}

export const config = {
  matcher: ["/aluno/:path*", "/adm/:path*"],
};
