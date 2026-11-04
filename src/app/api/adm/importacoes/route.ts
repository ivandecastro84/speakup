import { after, NextResponse, type NextRequest } from "next/server";
import { COOKIE, verificar } from "@/lib/jwt";
import { mensagemErro } from "@/lib/mensagens";
import { ErroEntrada, importarArquivo } from "@/lib/server/importacao";
import { RpcError } from "@/lib/server/rpc";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Recebe o arquivo (multipart, campo "arquivo") e inicia a importação. */
export async function POST(req: NextRequest) {
  const sessao = await verificar(req.cookies.get(COOKIE.ADM)?.value, "ADM");
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  let arquivo: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("arquivo");
    arquivo = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ erro: "Não foi possível ler o arquivo enviado." }, { status: 400 });
  }
  if (!arquivo) return NextResponse.json({ erro: "Selecione um arquivo." }, { status: 400 });

  try {
    const lote = await importarArquivo(
      sessao.tok,
      { nome: arquivo.name, bytes: new Uint8Array(await arquivo.arrayBuffer()) },
      {
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        agendar: (tarefa) => after(tarefa),
      },
    );
    return NextResponse.json(lote);
  } catch (e) {
    if (e instanceof ErroEntrada) return NextResponse.json({ erro: e.message }, { status: 400 });
    if (e instanceof RpcError) {
      return NextResponse.json({ erro: e.status === 401 ? "Sessão expirada." : mensagemErro(e.message) }, { status: e.status });
    }
    console.error("[importacao]", e);
    return NextResponse.json({ erro: "Falha inesperada na importação." }, { status: 500 });
  }
}
