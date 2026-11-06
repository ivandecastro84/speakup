import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

let db: pg.Client;
let coord: string;
let turma: string;

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await db.query(
    `truncate app.avaliacoes, app.matricula_turma, app.turma_horarios, app.turmas, app.disponibilidade_professor,
              app.professor_unidade, app.professores cascade`,
  );
  await semearK1(db);
  coord = (await rpc<{ token: string }>("adm_login", { p_email: "coord@speakup.test", p_senha: SENHA_ADM })).token;
  const prof = await rpc<{ id: string }>("adm_salvar_professor", {
    p_token: coord, p_id: null, p_nome: "Prof N", p_email: "profn@speakup.test", p_telefone: null,
    p_idiomas: ["Inglês"], p_niveis: ["Regular"], p_unidades: ["Unidade Centro"], p_ativo: true,
  });
  await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: prof.id, p_horarios: [{ dia: 1, hora: 8 }] });
  const [{ ini, fim }] = (await db.query("select to_char(app.hoje() - 40, 'YYYY-MM-DD') ini, to_char(app.hoje() + 60, 'YYYY-MM-DD') fim")).rows;
  turma = (await rpc<{ id: string }>("adm_salvar_turma", {
    p_token: coord, p_id: null,
    p_dados: { codigo: "N-1", nome: "N-1", unidade: "Unidade Centro", idioma: "Inglês", nivel_curso: "Regular", modalidade: "Online",
               professor_id: prof.id, sala_id: null, capacidade: 10, data_inicio: ini, data_fim: fim, situacao: "Ativa" },
    p_horarios: [{ dia: 1, hora: 8 }],
  })).id;
  await rpc("adm_turma_incluir_aluno", { p_token: coord, p_turma_id: turma, p_id_aluno: "A001" });
});

describe("Tela Notas (lançamento individual)", () => {
  it("lista só alunos das unidades do usuário, com as turmas de cada um", async () => {
    const l = await rpc<{ id_aluno: string; turmas: { codigo: string }[] }[]>("adm_notas_alunos", { p_token: coord });
    expect(l.map((a) => a.id_aluno).sort()).toEqual(["A001", "A003"]); // A002 é da Unidade Norte
    expect(l.find((a) => a.id_aluno === "A001")?.turmas.map((t) => t.codigo)).toEqual(["N-1"]);
    expect(l.find((a) => a.id_aluno === "A003")?.turmas).toEqual([]);
    const rh = (await rpc<{ token: string }>("adm_login", { p_email: "rh@speakup.test", p_senha: SENHA_ADM })).token;
    await expect(rpc("adm_notas_alunos", { p_token: rh })).rejects.toMatchObject({ status: 403 });
  });

  it("salva pela regra existente, mostra no histórico, edita (mesma data substitui) e exclui com auditoria", async () => {
    const [{ d }] = (await db.query("select to_char(app.hoje() - 2, 'YYYY-MM-DD') d")).rows;
    const lancar = (notas: Record<string, string>) =>
      rpc("adm_lancar_avaliacoes", { p_token: coord, p_turma_id: turma, p_data: d, p_registros: [{ id_aluno: "A001", ...notas }] });
    await lancar({ speaking: "8", listening: "", reading: "9.5", writing: "", cefr: "B1" });
    let h = await rpc<{ id: string; speaking: number; reading: number; listening: number | null; cefr: string; turma: string }[]>(
      "adm_notas_do_aluno", { p_token: coord, p_id_aluno: "A001" });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ turma: "N-1", speaking: 8, reading: 9.5, listening: null, cefr: "B1" });

    await lancar({ speaking: "7", listening: "6", reading: "9.5", writing: "", cefr: "B1" });
    h = await rpc("adm_notas_do_aluno", { p_token: coord, p_id_aluno: "A001" });
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ speaking: 7, listening: 6 });

    await rpc("adm_excluir_avaliacao", { p_token: coord, p_id: h[0].id });
    expect(await rpc("adm_notas_do_aluno", { p_token: coord, p_id_aluno: "A001" })).toEqual([]);
    const [log] = (await db.query("select detalhes from app.log_auditoria where acao = 'NOTA_EXCLUIDA' and entidade_id = 'A001' order by id desc limit 1")).rows;
    expect(log.detalhes).toMatchObject({ turma: "N-1", speaking: 7 });
  });

  it("não lança nota para aluno fora da turma nem consulta aluno de outra unidade", async () => {
    const [{ d }] = (await db.query("select to_char(app.hoje() - 2, 'YYYY-MM-DD') d")).rows;
    await expect(
      rpc("adm_lancar_avaliacoes", { p_token: coord, p_turma_id: turma, p_data: d, p_registros: [{ id_aluno: "A003", speaking: "5" }] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(rpc("adm_notas_do_aluno", { p_token: coord, p_id_aluno: "A002" })).rejects.toMatchObject({ status: 404 });
  });
});
