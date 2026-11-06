import { NextResponse, type NextRequest } from "next/server";
import { gerarIcs } from "@/lib/integracoes/ics";
import type { DadosAula } from "@/lib/integracoes/tipos";
import { COOKIE, verificar } from "@/lib/jwt";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";

export const runtime = "nodejs";

/** Convite .ics de uma reposição do próprio aluno (adicionar à agenda). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await verificar(req.cookies.get(COOKIE.ALUNO)?.value, "ALUNO");
  if (!sessao) return NextResponse.redirect(new URL("/aluno/login?expirado=1", req.url));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: mensagemErro("NAO_ENCONTRADO") }, { status: 404 });
  try {
    const d = await rpc<DadosAula>("aluno_convite_reposicao", { p_token: sessao.tok, p_reposicao_id: id });
    const metodo = d.status === "Cancelada" ? "CANCEL" : "REQUEST";
    return new NextResponse(gerarIcs(d, metodo), {
      headers: {
        "content-type": `text/calendar; charset=utf-8; method=${metodo}`,
        "content-disposition": `attachment; filename="reposicao-${d.data}.ics"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof RpcError) return NextResponse.json({ erro: mensagemErro(e.message) }, { status: e.status });
    throw e;
  }
}
