import { NextResponse, type NextRequest } from "next/server";
import { gerarDocumentacaoPdf } from "@/lib/api/documentacao";
import { COOKIE, verificar } from "@/lib/jwt";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";

export const runtime = "nodejs";

interface Chaves {
  empresas: { id: string; nome: string; media_minima: number; chave: { prefixo: string } | null }[];
}

/** PDF com o guia de integração; opcionalmente personalizado para uma empresa. */
export async function GET(req: NextRequest) {
  const sessao = await verificar(req.cookies.get(COOKIE.ADM)?.value, "ADM");
  if (!sessao) return NextResponse.redirect(new URL("/adm/login?expirado=1", req.url));
  try {
    const dados = await rpc<Chaves>("adm_chaves_api", { p_token: sessao.tok });
    const id = req.nextUrl.searchParams.get("empresa");
    const emp = id ? dados.empresas.find((e) => e.id === id) : null;
    if (id && !emp) return NextResponse.json({ erro: mensagemErro("NAO_ENCONTRADO") }, { status: 404 });
    const pdf = await gerarDocumentacaoPdf({
      baseUrl: process.env.API_BASE_URL || req.nextUrl.origin,
      empresa: emp ? { nome: emp.nome, media_minima: Number(emp.media_minima), prefixo: emp.chave?.prefixo ?? null } : null,
    });
    const sufixo = emp ? `-${emp.nome.normalize("NFD").replace(/[^\w]+/g, "-").replace(/-+$/, "").toLowerCase()}` : "";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="speakup-api-notas${sufixo}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof RpcError) return NextResponse.json({ erro: mensagemErro(e.message) }, { status: e.status });
    throw e;
  }
}
