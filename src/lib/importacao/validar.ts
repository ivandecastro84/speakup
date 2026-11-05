import { COLUNAS, MODALIDADES, OBRIGATORIAS, STATUS, TURNOS, UFS, type Coluna } from "./colunas";
import type { Planilha } from "./ler";

export type Registro = Record<Coluna, string | number | null>;
export type Original = Record<Coluna, string>;

export interface Ocorrencia {
  linha: number | null;
  coluna: Coluna | null;
  motivo: string;
  dados?: Original;
}

export interface LinhaValida {
  linha: number;
  dados: Registro;
  original: Original;
}

export interface ResultadoValidacao {
  errosArquivo: Ocorrencia[];
  validas: LinhaValida[];
  erros: Ocorrencia[];
  avisos: Ocorrencia[];
  total: number;
}

/** Cabeçalho deve ser exatamente as 19 colunas oficiais, na ordem. */
export function validarCabecalho(cab: string[]): Ocorrencia[] {
  const erros: Ocorrencia[] = [];
  const esperado = COLUNAS as readonly string[];
  const faltando = esperado.filter((c) => !cab.includes(c));
  const sobrando = cab.filter((c) => !esperado.includes(c));
  const repetidas = cab.filter((c, i) => c && cab.indexOf(c) !== i);

  for (const c of faltando) erros.push({ linha: null, coluna: c as Coluna, motivo: `Coluna obrigatória ausente: "${c}".` });
  for (const c of sobrando)
    erros.push({ linha: null, coluna: null, motivo: `Coluna não prevista no layout: "${c || "(sem nome)"}".` });
  for (const c of new Set(repetidas)) erros.push({ linha: null, coluna: c as Coluna, motivo: `Coluna repetida: "${c}".` });

  if (!erros.length && cab.some((c, i) => c !== esperado[i])) {
    erros.push({
      linha: null,
      coluna: null,
      motivo: `As colunas estão fora da ordem oficial. Ordem esperada: ${esperado.join(", ")}.`,
    });
  }
  if (erros.length) {
    erros.unshift({
      linha: null,
      coluna: null,
      motivo: `Cabeçalho inválido: o arquivo tem ${cab.length} coluna(s); são exigidas exatamente as 19 colunas oficiais.`,
    });
  }
  return erros;
}

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_INTEIRO = /^-?\d+$/;
const RE_DECIMAL = /^-?\d+([.,]\d+)?$/;

function dataReal(v: string): boolean {
  const m = RE_DATA.exec(v);
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, me - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === me - 1 && dt.getUTCDate() === d && a >= 1900 && a <= 2100;
}

/** Comparação sem diferenciar maiúsculas nem acentos ("hibrido" → "Híbrido", "manha" → "Manhã"). */
function simplificar(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function canonico(valor: string, opcoes: readonly string[]): string | null {
  return opcoes.find((o) => simplificar(o) === simplificar(valor)) ?? null;
}

function idadeEm(nascimento: string, hoje: Date): number {
  const [a, m, d] = nascimento.split("-").map(Number);
  let idade = hoje.getUTCFullYear() - a;
  if (hoje.getUTCMonth() + 1 < m || (hoje.getUTCMonth() + 1 === m && hoje.getUTCDate() < d)) idade--;
  return idade;
}

/**
 * Valida um único cadastro (formulário do painel) com as MESMAS regras da
 * importação. Retorna os dados normalizados ou os erros por coluna.
 */
export function validarRegistroAluno(original: Partial<Record<Coluna, string>>): {
  dados: Registro | null;
  erros: Partial<Record<Coluna, string>>;
  avisos: string[];
} {
  const valores = COLUNAS.map((c) => (original[c] ?? "").trim());
  const r = validarPlanilha({ cabecalho: [...COLUNAS], linhas: [{ numero: 1, valores }] });
  const erros: Partial<Record<Coluna, string>> = {};
  for (const e of r.erros) if (e.coluna && !erros[e.coluna]) erros[e.coluna] = e.motivo;
  return { dados: r.validas[0]?.dados ?? null, erros, avisos: r.avisos.map((a) => a.motivo) };
}

/**
 * O log de erros baixado do sistema tem as 19 colunas + "motivo" no fim.
 * Para permitir corrigir e reenviar o próprio log, essa última coluna é
 * descartada (somente se for exatamente "motivo" e estiver na 20ª posição).
 */
function semColunaMotivo(p: Planilha): Planilha {
  const cab = p.cabecalho;
  if (cab.length !== COLUNAS.length + 1 || cab[cab.length - 1].trim().toLowerCase() !== "motivo") return p;
  return {
    cabecalho: cab.slice(0, COLUNAS.length),
    linhas: p.linhas.map((l) => ({ numero: l.numero, valores: l.valores.slice(0, COLUNAS.length) })),
  };
}

/**
 * Valida e normaliza as linhas. Não consulta o banco: escopo de unidade e
 * integridade são reaplicados pela RPC de processamento.
 */
export function validarPlanilha(entrada: Planilha, hoje = new Date()): ResultadoValidacao {
  const p = semColunaMotivo(entrada);
  const errosArquivo = validarCabecalho(p.cabecalho);
  const total = p.linhas.length;
  if (errosArquivo.length) return { errosArquivo, validas: [], erros: [], avisos: [], total };

  const validas: LinhaValida[] = [];
  const erros: Ocorrencia[] = [];
  const avisos: Ocorrencia[] = [];
  const primeiraOcorrencia = new Map<string, number>();

  for (const { numero, valores } of p.linhas) {
    const original = Object.fromEntries(COLUNAS.map((c, i) => [c, valores[i] ?? ""])) as Original;
    const dados = {} as Registro;
    const errosLinha: Ocorrencia[] = [];
    const erro = (coluna: Coluna, motivo: string) => errosLinha.push({ linha: numero, coluna, motivo, dados: original });

    for (const c of COLUNAS) {
      const v = original[c];
      dados[c] = v === "" ? null : v;
      if (v === "" && OBRIGATORIAS.includes(c)) erro(c, `Campo obrigatório "${c}" vazio.`);
    }

    if (original.email && !RE_EMAIL.test(original.email)) erro("email", `E-mail inválido: "${original.email}".`);

    for (const c of ["data_nascimento", "data_matricula", "data_cancelamento"] as const) {
      if (original[c] && !dataReal(original[c])) erro(c, `Data inválida em "${c}": "${original[c]}" (use AAAA-MM-DD).`);
    }

    if (original.idade) {
      if (!RE_INTEIRO.test(original.idade) || Number(original.idade) < 0 || Number(original.idade) > 130) {
        erro("idade", `Idade inválida: "${original.idade}".`);
      } else dados.idade = Number(original.idade);
    }

    if (original.desconto_percentual) {
      const n = Number(original.desconto_percentual.replace(",", "."));
      if (!RE_DECIMAL.test(original.desconto_percentual) || n < 0 || n > 100) {
        erro("desconto_percentual", `Desconto deve ser um número entre 0 e 100: "${original.desconto_percentual}".`);
      } else dados.desconto_percentual = n;
    }

    if (original["Valor Mensalidade"]) {
      const n = Number(original["Valor Mensalidade"].replace(",", "."));
      if (!RE_DECIMAL.test(original["Valor Mensalidade"]) || n < 0) {
        erro("Valor Mensalidade", `Valor da mensalidade deve ser um número maior ou igual a zero: "${original["Valor Mensalidade"]}".`);
      } else dados["Valor Mensalidade"] = n;
    }

    if (original.estado) {
      const uf = original.estado.toUpperCase();
      if (!UFS.includes(uf)) erro("estado", `UF inválida: "${original.estado}".`);
      else dados.estado = uf;
    }

    const enumeracoes: [Coluna, readonly string[]][] = [
      ["modalidade", MODALIDADES],
      ["turno", TURNOS],
      ["status_matricula", STATUS],
    ];
    for (const [c, opcoes] of enumeracoes) {
      const v = original[c];
      if (!v) continue;
      const ok = canonico(v, opcoes);
      if (!ok) erro(c, `Valor inválido em "${c}": "${v}". Permitidos: ${opcoes.join(", ")}.`);
      else dados[c] = ok;
    }

    if (original.id_aluno) {
      const anterior = primeiraOcorrencia.get(original.id_aluno);
      if (anterior !== undefined) {
        erro("id_aluno", `id_aluno "${original.id_aluno}" repetido no arquivo (já aparece na linha ${anterior}).`);
      } else primeiraOcorrencia.set(original.id_aluno, numero);
    }

    if (errosLinha.length) {
      erros.push(...errosLinha);
      continue;
    }

    // Idade: com data de nascimento, grava a idade calculada. Só avisa quando a
    // informada difere em mais de 1 ano (planilhas costumam calcular só pelo ano).
    if (original.data_nascimento) {
      const calculada = idadeEm(original.data_nascimento, hoje);
      if (dados.idade !== null && Math.abs(calculada - Number(dados.idade)) > 1) {
        avisos.push({
          linha: numero,
          coluna: "idade",
          motivo: `Idade informada (${dados.idade}) diverge da data de nascimento (${calculada} anos); foi gravada a idade calculada.`,
          dados: original,
        });
      }
      dados.idade = calculada;
    }
    if (dados.status_matricula === "Cancelada" && !original.data_cancelamento) {
      avisos.push({
        linha: numero,
        coluna: "data_cancelamento",
        motivo: "Matrícula Cancelada sem data de cancelamento.",
        dados: original,
      });
    }

    validas.push({ linha: numero, dados, original });
  }

  return { errosArquivo, validas, erros, avisos, total };
}
