import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { rpc } from "@/lib/server/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * API de notas para empresas parceiras (D59).
 * POST /api/v1/notas  ·  Authorization: Bearer <chave>  ·  {"id_aluno": "...", "nome": "..."}
 * Toda a regra (chave, escopo da empresa, limite, auditoria) está na RPC api_notas_aluno.
 */
function responder(status: number, corpo: unknown, requisicao: string) {
  return NextResponse.json(corpo, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": requisicao },
  });
}

const erro = (codigo: string, mensagem: string) => ({ erro: { codigo, mensagem } });

export async function POST(req: NextRequest) {
  const requisicao = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const chave = /^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? null;
  if (!chave) {
    return responder(401, erro("NAO_AUTORIZADO", 'Envie a chave de API no cabeçalho "Authorization: Bearer <sua-chave>".'), requisicao);
  }

  let corpo: unknown;
  try {
    const texto = await req.text();
    if (texto.length > 2000) throw new Error("grande");
    corpo = JSON.parse(texto);
  } catch {
    return responder(400, erro("DADOS_INVALIDOS", 'O corpo deve ser um JSON no formato {"id_aluno": "...", "nome": "..."}.'), requisicao);
  }
  const { id_aluno, nome } = (corpo ?? {}) as Record<string, unknown>;
  if (typeof id_aluno !== "string" || typeof nome !== "string" || !id_aluno.trim() || !nome.trim()) {
    return responder(400, erro("DADOS_INVALIDOS", 'Informe "id_aluno" e "nome" do aluno, ambos como texto.'), requisicao);
  }

  try {
    const r = await rpc<{ status: number; corpo: unknown }>("api_notas_aluno", {
      p_chave: chave,
      p_id_aluno: id_aluno.slice(0, 50),
      p_nome: nome.slice(0, 200),
      p_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    console.info(JSON.stringify({ nivel: "info", origem: "api.notas", requisicao, status: r.status }));
    return responder(r.status, r.corpo, requisicao);
  } catch (e) {
    console.error(JSON.stringify({ nivel: "erro", origem: "api.notas", requisicao, erro: e instanceof Error ? e.message : String(e) }));
    return responder(500, erro("ERRO_INTERNO", `Erro inesperado. Informe ao suporte o código ${requisicao}.`), requisicao);
  }
}

export function GET() {
  return NextResponse.json(erro("METODO_NAO_PERMITIDO", "Use POST com o corpo JSON {\"id_aluno\": \"...\", \"nome\": \"...\"}."), {
    status: 405,
    headers: { allow: "POST" },
  });
}
