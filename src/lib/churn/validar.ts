import type { Planilha } from "@/lib/importacao/ler";

/** Validação da planilha de previsão de churn: colunas id_aluno e probabilidade_churn (0–100). */

export const TAMANHO_LOTE = 500;

export type Motivo = "ID vazio" | "ID inválido" | "Probabilidade vazia" | "Probabilidade não numérica" | "Probabilidade fora de 0 a 100" | "ID repetido no arquivo";

export interface LinhaPrevia {
  linha: number;
  id_aluno: string;
  probabilidade_churn: string;
  problema: Motivo | null;
}

export interface Previa {
  total: number;
  validas: number;
  comProblema: number;
  porMotivo: Partial<Record<Motivo, number>>;
  primeiras: LinhaPrevia[];
  /** até 50 linhas com problema, para conferência */
  exemplosProblema: LinhaPrevia[];
  /** linhas válidas, sem repetição (vale a última ocorrência), prontas para gravar */
  gravar: { id_aluno: number; probabilidade_churn: number }[];
}

export class LayoutInvalido extends Error {}

const normal = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s-]+/g, "_").trim();

/** Aceita número com ponto ou vírgula decimal (ex.: "2,4"). */
function numero(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export function validarChurn(p: Planilha): Previa {
  const cab = p.cabecalho.map(normal);
  const iId = cab.indexOf("id_aluno");
  const iProb = cab.indexOf("probabilidade_churn");
  if (iId < 0 || iProb < 0) {
    const faltam = [iId < 0 && "id_aluno", iProb < 0 && "probabilidade_churn"].filter(Boolean).join(" e ");
    throw new LayoutInvalido(`A planilha precisa ter as colunas id_aluno e probabilidade_churn na primeira linha. Não encontrei: ${faltam}.`);
  }

  // Primeira passada: valida cada linha.
  const linhas: (LinhaPrevia & { id?: number; prob?: number })[] = p.linhas.map(({ numero: linha, valores }) => {
    const idTxt = (valores[iId] ?? "").trim();
    const pTxt = (valores[iProb] ?? "").trim();
    const base = { linha, id_aluno: idTxt, probabilidade_churn: pTxt };
    if (!idTxt) return { ...base, problema: "ID vazio" };
    const id = numero(idTxt);
    if (id == null || !Number.isInteger(id) || id <= 0 || id > 999_999_999_999_999) return { ...base, problema: "ID inválido" };
    if (!pTxt) return { ...base, problema: "Probabilidade vazia" };
    const prob = numero(pTxt);
    if (prob == null) return { ...base, problema: "Probabilidade não numérica" };
    if (prob < 0 || prob > 100) return { ...base, problema: "Probabilidade fora de 0 a 100" };
    return { ...base, problema: null, id, prob: Math.round(prob * 100) / 100 };
  });

  // IDs repetidos: vale a última ocorrência; as anteriores são marcadas.
  const ultima = new Map<number, number>();
  linhas.forEach((l, i) => l.id != null && !l.problema && ultima.set(l.id, i));
  linhas.forEach((l, i) => {
    if (l.id != null && !l.problema && ultima.get(l.id) !== i) l.problema = "ID repetido no arquivo";
  });

  const porMotivo: Previa["porMotivo"] = {};
  for (const l of linhas) if (l.problema) porMotivo[l.problema] = (porMotivo[l.problema] ?? 0) + 1;
  const limpa = ({ linha, id_aluno, probabilidade_churn, problema }: LinhaPrevia): LinhaPrevia => ({ linha, id_aluno, probabilidade_churn, problema });
  const gravar = linhas.filter((l) => !l.problema).map((l) => ({ id_aluno: l.id!, probabilidade_churn: l.prob! }));

  return {
    total: linhas.length,
    validas: gravar.length,
    comProblema: linhas.length - gravar.length,
    porMotivo,
    primeiras: linhas.slice(0, 10).map(limpa),
    exemplosProblema: linhas.filter((l) => l.problema).slice(0, 50).map(limpa),
    gravar,
  };
}

/** Divide em lotes de 500 para gravação. */
export function emLotes<T>(itens: T[], tamanho = TAMANHO_LOTE): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) r.push(itens.slice(i, i + tamanho));
  return r;
}
