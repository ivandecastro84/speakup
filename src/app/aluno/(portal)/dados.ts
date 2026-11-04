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
