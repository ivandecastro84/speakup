import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verificar } from "@/lib/jwt";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";

export const runtime = "nodejs";

const COLUNAS: [string, string][] = [
  ["id_aluno", "id_aluno"],
  ["nome", "nome"],
  ["unidade", "unidade"],
  ["turmas", "turmas"],
  ["status_matricula", "status_matricula"],
  ["aulas", "aulas"],
  ["presentes", "presencas"],
  ["faltas", "faltas"],
  ["reposicoes", "reposicoes_realizadas"],
  ["frequencia", "frequencia_percentual"],
  ["speaking", "speaking"],
  ["listening", "listening"],
  ["reading", "reading"],
  ["writing", "writing"],
  ["media", "media"],
  ["cefr_inicial", "cefr_inicial"],
  ["cefr_atual", "cefr_atual"],
  ["elegivel", "elegivel"],
  ["motivo", "motivo"],
];

function campo(v: unknown): string {
  if (v === true) return "Sim";
  if (v === false) return "Não";
  const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Gera o CSV do relatório de RH e registra o envio (auditado). */
export async function GET(req: NextRequest) {
  const sessao = await verificar(req.cookies.get(COOKIE.ADM)?.value, "ADM");
  if (!sessao) return NextResponse.redirect(new URL("/adm/login?expirado=1", req.url));
  const q = req.nextUrl.searchParams;
  const empresa = q.get("empresa") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(empresa)) return NextResponse.json({ erro: "Empresa inválida." }, { status: 400 });
  try {
    const r = await rpc<{ empresa: { nome: string }; inicio: string; fim: string; linhas: Record<string, unknown>[] }>("adm_relatorio_rh", {
      p_token: sessao.tok,
      p_empresa_id: empresa,
      p_inicio: q.get("inicio") || null,
      p_fim: q.get("fim") || null,
      p_registrar_envio: true,
      p_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    const linhas = [COLUNAS.map(([, rotulo]) => rotulo).join(";"), ...r.linhas.map((l) => COLUNAS.map(([k]) => campo(l[k])).join(";"))];
    const slug = r.empresa.nome.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    return new NextResponse("﻿" + linhas.join("\r\n") + "\r\n", {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="relatorio-rh-${slug}-${r.inicio}-a-${r.fim}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof RpcError) return NextResponse.json({ erro: mensagemErro(e.message) }, { status: e.status });
    throw e;
  }
}
