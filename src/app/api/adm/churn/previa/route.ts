import { NextResponse, type NextRequest } from "next/server";
import { validarChurn, LayoutInvalido } from "@/lib/churn/validar";
import { lerPlanilhaChurn } from "@/lib/churn/xlsx-leve";
import { ArquivoIlegivel } from "@/lib/importacao/ler";
import { COOKIE, verificar } from "@/lib/jwt";
import { RpcError, rpc } from "@/lib/server/rpc";

export const runtime = "nodejs";

const LIMITE_BYTES = 4 * 1024 * 1024;

/** Lê a planilha e devolve a prévia (nada é gravado aqui). */
export async function POST(req: NextRequest) {
  const sessao = await verificar(req.cookies.get(COOKIE.ADM)?.value, "ADM");
  if (!sessao) return NextResponse.json({ erro: "Sua sessão expirou. Entre de novo." }, { status: 401 });
  try {
    const eu = await rpc<{ permissoes: string[] }>("adm_me", { p_token: sessao.tok });
    if (!eu.permissoes.includes("CHURN_GERENCIAR")) return NextResponse.json({ erro: "Acesso restrito ao superadministrador." }, { status: 403 });
  } catch (e) {
    if (e instanceof RpcError) return NextResponse.json({ erro: "Sua sessão expirou. Entre de novo." }, { status: 401 });
    throw e;
  }

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ erro: "Escolha um arquivo .xlsx." }, { status: 400 });
  if (!/\.xlsx$/i.test(arquivo.name)) return NextResponse.json({ erro: "O arquivo precisa ser Excel no formato .xlsx." }, { status: 400 });
  if (arquivo.size > LIMITE_BYTES) return NextResponse.json({ erro: "Arquivo maior que 4 MB." }, { status: 413 });

  try {
    const planilha = await lerPlanilhaChurn(new Uint8Array(await arquivo.arrayBuffer()));
    const previa = validarChurn(planilha);
    if (previa.total === 0) return NextResponse.json({ erro: "A planilha não tem linhas de dados abaixo do cabeçalho." }, { status: 400 });
    return NextResponse.json({ arquivo: arquivo.name, ...previa }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ArquivoIlegivel || e instanceof LayoutInvalido) return NextResponse.json({ erro: e.message }, { status: 400 });
    throw e;
  }
}
