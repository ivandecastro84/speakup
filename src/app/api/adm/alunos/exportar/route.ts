import { NextResponse, type NextRequest } from "next/server";
import { COLUNAS } from "@/lib/importacao/colunas";
import { COOKIE, verificar } from "@/lib/jwt";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";

export const runtime = "nodejs";

function campo(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exporta a listagem filtrada em CSV com as 19 colunas oficiais (o mesmo
 * layout da importação). Separador ";" e BOM para o Excel em português.
 */
export async function GET(req: NextRequest) {
  const sessao = await verificar(req.cookies.get(COOKIE.ADM)?.value, "ADM");
  if (!sessao) return NextResponse.redirect(new URL("/adm/login?expirado=1", req.url));
  const q = req.nextUrl.searchParams;
  try {
    const linhas = await rpc<Record<string, unknown>[]>("adm_exportar_alunos", {
      p_token: sessao.tok,
      p_unidade: q.get("unidade") || null,
      p_nivel: q.get("nivel") || null,
      p_status: q.get("status") || null,
      p_busca: q.get("busca") || null,
      p_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    const csv = [COLUNAS.join(";"), ...linhas.map((l) => COLUNAS.map((c) => campo(l[c])).join(";"))].join("\r\n");
    const hoje = new Date().toISOString().slice(0, 10);
    return new NextResponse("﻿" + csv + "\r\n", {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="alunos-${hoje}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof RpcError) return NextResponse.json({ erro: mensagemErro(e.message) }, { status: e.status });
    throw e;
  }
}
