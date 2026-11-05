import "server-only";
import { cache } from "react";
import { rpc } from "@/lib/server/rpc";
import { comSessao } from "@/lib/server/session";

export interface Aluno {
  id_aluno: string;
  nome: string;
  email: string;
  data_nascimento: string | null;
  idade: number | null;
  genero: string | null;
  unidade: string;
  cidade: string | null;
  estado: string | null;
  canal_aquisicao: string | null;
  nivel_curso: string | null;
  modalidade: string | null;
  turno: string | null;
  plano: string | null;
  desconto_percentual: number | null;
  data_matricula: string | null;
  status_matricula: "Ativa" | "Cancelada" | "Trancada" | "Concluída";
  data_cancelamento: string | null;
  "Valor Mensalidade": number | null;
  primeiro_acesso: boolean;
}

/** Dados do próprio aluno (a sessão define quem é; nunca há id na URL). */
export const alunoAtual = cache(() =>
  comSessao("ALUNO", (token) => rpc<Aluno>("aluno_me", { p_token: token })),
);

export interface ProximaAula {
  tipo: "Aula" | "Reposição";
  reposicao_id?: string;
  data: string;
  hora: number;
  turma: string | null;
  nome: string;
  professor: string;
  modalidade: string;
  sala: string | null;
  cancelamento_gratuito?: boolean;
}

export interface Painel {
  saldo: number;
  creditos: { valido_ate: string; data_falta: string }[];
  limite_mes: number;
  usadas_mes: number;
  antecedencia_horas: number;
  tem_turma: boolean;
  proximas: ProximaAula[];
}

export function chamarAluno<T>(fn: string, args: Record<string, unknown> = {}) {
  return comSessao("ALUNO", (token) => rpc<T>(fn, { p_token: token, ...args }));
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "qua, 12/11 · 18h" */
export function quando(data: string, hora: number, longo = false) {
  const [a, m, d] = data.split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${longo ? dia : dia.slice(0, 3)}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} · ${String(hora).padStart(2, "0")}h`;
}
