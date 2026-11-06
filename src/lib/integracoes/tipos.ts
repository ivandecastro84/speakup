/** Dados de uma aula reservada, montados no banco por app.dados_reposicao. */
export interface DadosAula {
  reposicao_id: string;
  uid: string;
  status: string;
  aluno: string;
  email: string;
  id_aluno: string;
  data: string;
  hora: number;
  inicio: string;
  fim: string;
  tipo: "TURMA" | "AVULSA";
  turma: string | null;
  idioma: string;
  nivel_curso: string;
  modalidade: string;
  professor: string | null;
  unidade: string;
  sala: string | null;
  credito_devolvido: boolean | null;
}

export type Evento = "CONFIRMACAO" | "CANCELAMENTO";

export const tituloAula = (d: DadosAula) => `Reposição de ${d.idioma} (${d.nivel_curso}) · Speak Up Idiomas`;

export const localAula = (d: DadosAula) =>
  d.modalidade === "Online" ? "Online" : [d.sala ? `Sala ${d.sala}` : null, `Unidade ${d.unidade}`].filter(Boolean).join(" · ");

export function quandoAula(d: DadosAula): string {
  const [a, m, dia] = d.data.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, dia, 12));
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(dt);
  return `${semana}, ${String(dia).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}, às ${String(d.hora).padStart(2, "0")}h`;
}

/** Mascara e-mail para log de aplicação (LGPD). */
export const mascararEmail = (e: string | null | undefined) =>
  !e || !e.includes("@") ? null : `${e[0]}***@${e.split("@")[1]}`;
