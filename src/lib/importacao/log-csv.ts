import { COLUNAS } from "./colunas";

export interface EntradaLog {
  linha: number | null;
  tipo: "ERRO" | "AVISO";
  coluna: string | null;
  motivo: string;
  dados: Record<string, string> | null;
}

function campo(v: string): string {
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Log de erros em CSV: as mesmas 19 colunas do arquivo original + `motivo`.
 * Uma linha por linha do arquivo (motivos agrupados). Separador ";" e BOM
 * UTF-8 para abrir corretamente no Excel em português.
 */
export function gerarLogCsv(entradas: EntradaLog[]): string {
  const porLinha = new Map<string, { dados: Record<string, string> | null; motivos: string[] }>();
  for (const e of entradas) {
    const chave = e.linha === null ? "arquivo" : String(e.linha);
    const atual = porLinha.get(chave) ?? { dados: e.dados, motivos: [] };
    const prefixo = e.linha === null ? "Arquivo" : `Linha ${e.linha}`;
    atual.motivos.push(`${prefixo}${e.tipo === "AVISO" ? " (aviso)" : ""}: ${e.motivo}`);
    atual.dados ??= e.dados;
    porLinha.set(chave, atual);
  }

  const linhas = [[...COLUNAS, "motivo"].map(campo).join(";")];
  for (const { dados, motivos } of porLinha.values()) {
    const valores = COLUNAS.map((c) => campo(dados?.[c] ?? ""));
    linhas.push([...valores, campo(motivos.join(" | "))].join(";"));
  }
  return "﻿" + linhas.join("\r\n") + "\r\n";
}
