import JSZip from "jszip";
import { ArquivoIlegivel, type Planilha, lerPlanilha } from "@/lib/importacao/ler";

/**
 * Leitor .xlsx simples para planilhas gravadas com prefixo de namespace no XML
 * (ex.: <x:sheet>, gerado pelo Open XML SDK/.NET). É válido pelo padrão, mas o
 * exceljs não entende. Lê só a primeira aba, como texto.
 */
const tag = (nome: string) => `(?:[\\w.-]+:)?${nome}`;
const attr = (s: string, nome: string) => new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${nome}="([^"]*)"`).exec(s)?.[1];
const xmlTexto = (s: string) =>
  s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
/** Junta os <t> de um <si>/<is> (texto simples ou rich text). */
const textos = (s: string) => [...s.matchAll(new RegExp(`<${tag("t")}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag("t")}>`, "g"))].map((m) => xmlTexto(m[1])).join("");
const colunaIdx = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

export async function lerXlsxLeve(bytes: Uint8Array): Promise<Planilha> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ArquivoIlegivel("O arquivo .xlsx está corrompido ou não é uma planilha válida.");
  }
  const ler = (p: string) => zip.file(p)?.async("string");
  const wb = await ler("xl/workbook.xml");
  if (!wb) throw new ArquivoIlegivel("O arquivo .xlsx não tem a estrutura de planilha esperada.");

  // Primeira aba → caminho do XML pela tabela de relacionamentos.
  const primeira = new RegExp(`<${tag("sheet")}\\b([^>]*)/?>`).exec(wb)?.[1] ?? "";
  const rid = attr(primeira, "id");
  const rels = (await ler("xl/_rels/workbook.xml.rels")) ?? "";
  let alvo = "worksheets/sheet1.xml";
  for (const m of rels.matchAll(new RegExp(`<${tag("Relationship")}\\b([^>]*)/?>`, "g"))) {
    if (attr(m[1], "Id") === rid) alvo = attr(m[1], "Target") ?? alvo;
  }
  const caminho = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, "")}`;
  const folha = await ler(caminho);
  if (!folha) throw new ArquivoIlegivel("A planilha não tem nenhuma aba legível.");

  const compartilhados = [...((await ler("xl/sharedStrings.xml")) ?? "").matchAll(new RegExp(`<${tag("si")}\\b[^>]*>([\\s\\S]*?)</${tag("si")}>`, "g"))].map((m) => textos(m[1]));

  const linhas: { numero: number; valores: string[] }[] = [];
  const reLinha = new RegExp(`<${tag("row")}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag("row")}>)`, "g");
  const reCel = new RegExp(`<${tag("c")}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag("c")}>)`, "g");
  const reV = new RegExp(`<${tag("v")}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag("v")}>`);
  let seq = 0;
  for (const r of folha.matchAll(reLinha)) {
    seq++;
    const numero = Number(attr(r[1], "r")) || seq;
    const valores: string[] = [];
    let col = 0;
    for (const c of (r[2] ?? "").matchAll(reCel)) {
      const ref = attr(c[1], "r");
      if (ref) col = colunaIdx(ref);
      const tipo = attr(c[1], "t");
      const corpo = c[2] ?? "";
      const v = reV.exec(corpo)?.[1];
      let valor = "";
      if (tipo === "s") valor = compartilhados[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = textos(corpo);
      else if (v != null) valor = xmlTexto(v);
      valores[col] = valor.trim();
      col++;
    }
    for (let i = 0; i < valores.length; i++) valores[i] ??= "";
    linhas.push({ numero, valores });
  }
  const [cab, ...dados] = linhas;
  if (!cab) throw new ArquivoIlegivel("A planilha está vazia.");
  const cabecalho = [...cab.valores];
  while (cabecalho.length && cabecalho[cabecalho.length - 1] === "") cabecalho.pop();
  return { cabecalho, linhas: dados.filter((l) => l.valores.some((v) => v !== "")) };
}

/** Tenta o leitor padrão (exceljs) e, se ele não entender o arquivo, o leitor simples. */
export async function lerPlanilhaChurn(bytes: Uint8Array): Promise<Planilha> {
  try {
    return await lerPlanilha(bytes, "xlsx");
  } catch (e) {
    if (!(e instanceof ArquivoIlegivel)) throw e;
    return lerXlsxLeve(bytes);
  }
}
