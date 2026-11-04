/** As 19 colunas oficiais, na ordem e com os nomes exatos do layout. */
export const COLUNAS = [
  "id_aluno",
  "nome",
  "email",
  "data_nascimento",
  "idade",
  "genero",
  "unidade",
  "cidade",
  "estado",
  "canal_aquisicao",
  "nivel_curso",
  "modalidade",
  "turno",
  "plano",
  "desconto_percentual",
  "data_matricula",
  "status_matricula",
  "data_cancelamento",
  "Valor Mensalidade",
] as const;

export type Coluna = (typeof COLUNAS)[number];

export const OBRIGATORIAS: Coluna[] = ["id_aluno", "nome", "email", "unidade", "status_matricula"];

export const MODALIDADES = ["Presencial", "Online"] as const;
export const TURNOS = ["Manhã", "Tarde", "Noite"] as const;
export const STATUS = ["Ativa", "Cancelada", "Trancada", "Concluída"] as const;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const EXTENSOES = ["xlsx", "csv"] as const;
export type Formato = (typeof EXTENSOES)[number];

/** Limites configuráveis por ambiente. */
export const LIMITES = {
  /** Tamanho máximo do arquivo em MB (a Vercel aceita até 4,5 MB por requisição). */
  arquivoMb: Number(process.env.IMPORT_MAX_MB ?? 4),
  /** Número máximo de linhas de dados por arquivo. */
  linhas: Number(process.env.IMPORT_MAX_LINHAS ?? 5000),
  /** Acima disto, o processamento continua fora do ciclo da requisição. */
  limiteSincrono: Number(process.env.IMPORT_ASYNC_A_PARTIR_DE ?? 500),
  /** Linhas por chamada ao banco. */
  tamanhoPedaco: 500,
};

export function formatoDoArquivo(nome: string): Formato | null {
  const ext = nome.toLowerCase().split(".").pop();
  return ext === "xlsx" || ext === "csv" ? ext : null;
}
