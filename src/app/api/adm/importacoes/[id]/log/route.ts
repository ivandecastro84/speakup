import { NextResponse, type NextRequest } from "next/server";
import { gerarLogCsv, type EntradaLog } from "@/lib/importacao/log-csv";
import { COOKIE, verificar } from "@/lib/jwt";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

/** Download do log de erros/avisos em CSV (19 colunas + motivo). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await verificar(req.cookies.get(COOKIE.ADM)?.value, "ADM");
  if (!sessao) return NextResponse.redirect(new URL("/adm/login?expirado=1", req.url));
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ erro: "Importação não encontrada." }, { status: 404 });
  try {
    const entradas = await rpc<EntradaLog[]>("adm_importacao_log", { p_token: sessao.tok, p_importacao_id: id });
    return new NextResponse(gerarLogCsv(entradas), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="log-importacao-${id.slice(0, 8)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof RpcError) return NextResponse.json({ erro: mensagemErro(e.message) }, { status: e.status });
    throw e;
  }
}
