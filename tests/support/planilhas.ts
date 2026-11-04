import ExcelJS from "exceljs";
import { COLUNAS } from "@/lib/importacao/colunas";

export type LinhaTeste = Partial<Record<(typeof COLUNAS)[number], string | number | Date>>;

export function aluno(id: string, extra: LinhaTeste = {}): LinhaTeste {
  return {
    id_aluno: id,
    nome: `Aluno ${id}`,
    email: `aluno${id}@exemplo.com`,
    data_nascimento: "1995-05-10",
    idade: "",
    genero: "F",
    unidade: "Unidade Centro",
    cidade: "São Paulo",
    estado: "SP",
    canal_aquisicao: "B2C",
    nivel_curso: "Regular",
    modalidade: "Presencial",
    turno: "Manhã",
    plano: "Anual",
    desconto_percentual: "10",
    data_matricula: "2026-01-15",
    status_matricula: "Ativa",
    data_cancelamento: "",
    "Valor Mensalidade": "450.00",
    ...extra,
  };
}

export async function xlsx(linhas: LinhaTeste[], cabecalho: readonly string[] = COLUNAS): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Alunos");
  ws.addRow([...cabecalho]);
  for (const l of linhas) ws.addRow(cabecalho.map((c) => (l as Record<string, unknown>)[c] ?? ""));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export function csv(linhas: LinhaTeste[], sep = ";", cabecalho: readonly string[] = COLUNAS): string {
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "");
    return s.includes(sep) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cabecalho.join(sep), ...linhas.map((l) => cabecalho.map((c) => esc((l as Record<string, unknown>)[c])).join(sep))].join(
    "\n",
  );
}
