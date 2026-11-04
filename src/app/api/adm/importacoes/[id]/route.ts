import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verificar } from "@/lib/jwt";
import { mensagemErro } from "@/lib/mensagens";
import { status } from "@/lib/server/importacao";
import { RpcError } from "@/lib/server/rpc";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

/** Status do lote (usado pela barra de progresso). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await verificar(req.cookies.get(COOKIE.ADM)?.value, "ADM");
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "Importação não encontrada." }, { status: 404 });
  try {
    return NextResponse.json(await status(sessao.tok, id), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof RpcError) return NextResponse.json({ erro: mensagemErro(e.message) }, { status: e.status });
    throw e;
  }
}
