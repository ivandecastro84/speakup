import "server-only";
import { admAtual, chamarAdm } from "../dados";
import type { OpcoesTurma } from "./forms";

/** Listas para o formulário de turma (somente o escopo do usuário). */
export async function opcoesTurma(): Promise<OpcoesTurma> {
  const [u, professores, salas] = await Promise.all([
    admAtual(),
    chamarAdm<OpcoesTurma["professores"]>("adm_listar_professores"),
    chamarAdm<OpcoesTurma["salas"]>("adm_listar_salas"),
  ]);
  return { unidades: u.unidades, professores, salas };
}
