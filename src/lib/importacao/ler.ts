import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { Formato } from "./colunas";

/** Valor bruto de célula, já convertido para texto (datas em YYYY-MM-DD). */
export type Celula = string;

export interface Planilha {
  cabecalho: string[];
  /** linhas de dados (sem o cabeçalho), com o número da linha no arquivo */
  linhas: { numero: number; valores: Celula[] }[];
}

export class ArquivoIlegivel extends Error {}

function dataIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function celulaExcel(v: ExcelJS.CellValue): Celula {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return dataIso(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text; // hyperlink
    if ("result" in v) return celulaExcel(v.result as ExcelJS.CellValue); // fórmula
    if ("error" in v) return "";
  }
  return String(v);
}

async function lerXlsx(bytes: Uint8Array): Promise<Planilha> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new ArquivoIlegivel("O arquivo .xlsx está corrompido ou não é uma planilha válida.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ArquivoIlegivel("A planilha não tem nenhuma aba.");

  const largura = Math.max(ws.columnCount, 1);
  const lerLinha = (r: ExcelJS.Row) =>
    Array.from({ length: largura }, (_, i) => celulaExcel(r.getCell(i + 1).value).trim());

  let cabecalho: string[] | null = null;
  const linhas: Planilha["linhas"] = [];
  ws.eachRow({ includeEmpty: false }, (row, numero) => {
    const valores = lerLinha(row);
    if (!cabecalho) {
      cabecalho = valores;
      return;
    }
    if (valores.some((v) => v !== "")) linhas.push({ numero, valores });
  });
  if (!cabecalho) throw new ArquivoIlegivel("A planilha está vazia.");
  return { cabecalho: aparar(cabecalho), linhas };
}

/** UTF-8 quando válido; senão Windows-1252 (CSV salvo pelo Excel em português). */
function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function lerCsv(bytes: Uint8Array): Planilha {
  const texto = decodificar(bytes).replace(/^﻿/, "");
  const r = Papa.parse<string[]>(texto, { skipEmptyLines: "greedy", delimiter: "" });
  const fatais = r.errors.filter((e) => e.type === "Quotes");
  if (fatais.length) throw new ArquivoIlegivel(`CSV mal formatado (aspas sem fechamento na linha ${fatais[0].row! + 1}).`);
  const [cab, ...resto] = r.data;
  if (!cab) throw new ArquivoIlegivel("O arquivo CSV está vazio.");
  return {
    cabecalho: aparar(cab.map((c) => c.trim())),
    linhas: resto.map((valores, i) => ({ numero: i + 2, valores: valores.map((v) => v.trim()) })),
  };
}

/** Remove colunas vazias à direita (comuns em planilhas). */
function aparar(cab: string[]): string[] {
  const c = [...cab];
  while (c.length && c[c.length - 1] === "") c.pop();
  return c;
}

export async function lerPlanilha(bytes: Uint8Array, formato: Formato): Promise<Planilha> {
  return formato === "xlsx" ? lerXlsx(bytes) : lerCsv(bytes);
}
