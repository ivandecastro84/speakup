import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RpcError, rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

let db: pg.Client;
let coord: string;
let profA: string;
let profB: string;
let turmaA: string; // turma do aluno, 08h todos os dias, começou há 40 dias
let turmaB: string; // mesmo idioma/nível, 20h todos os dias

const TODOS_OS_DIAS = (hora: number) => [1, 2, 3, 4, 5, 6].map((dia) => ({ dia, hora }));

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

async function erroDe(p: Promise<unknown>): Promise<RpcError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof RpcError) return e;
    throw e;
  }
  throw new Error("era esperado um erro");
}

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as T[];
}

/** Data (Mon–Sat) mais recente já passada / próxima futura, no fuso de São Paulo. */
async function diaUtil(sentido: "passado" | "futuro", hora: number): Promise<string> {
  const [r] = await q<{ d: string }>(
    `select to_char(d::date, 'YYYY-MM-DD') d from generate_series(
        case when $1 = 'passado' then app.hoje() - 1 else app.hoje() + 1 end,
        case when $1 = 'passado' then app.hoje() - 8 else app.hoje() + 8 end,
        case when $1 = 'passado' then interval '-1 day' else interval '1 day' end) d
      where app.dia_semana(d::date) <= 6 and app.inicio_aula(d::date, $2::smallint) ${"<>"} now() limit 1`,
    [sentido, hora],
  );
  return r.d;
}

async function loginAluno(id: string) {
  await db.query("update app.alunos set primeiro_acesso = false where id_aluno = $1", [id]);
  return (await rpc<{ token: string }>("login_aluno", { p_id_aluno: id, p_senha: "Escola@@@" })).token;
}

async function chamada(turma: string, data: string, hora: number, registros: unknown[]) {
  return rpc("adm_registrar_chamada", { p_token: coord, p_turma_id: turma, p_data: data, p_hora: hora, p_registros: registros });
}

async function professor(nome: string, horarios: { dia: number; hora: number }[]) {
  const { id } = await rpc<{ id: string }>("adm_salvar_professor", {
    p_token: coord, p_id: null, p_nome: nome, p_email: `${nome.toLowerCase().replace(/\W/g, "")}@speakup.test`,
    p_telefone: null, p_idiomas: ["Inglês"], p_niveis: ["Regular"], p_unidades: ["Unidade Centro"], p_ativo: true,
  });
  await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: id, p_horarios: horarios });
  return id;
}

async function turma(codigo: string, prof: string, horarios: { dia: number; hora: number }[], capacidade = 10) {
  const [{ ini, fim }] = await q<{ ini: string; fim: string }>(
    "select to_char(app.hoje() - 40, 'YYYY-MM-DD') ini, to_char(app.hoje() + 60, 'YYYY-MM-DD') fim",
  );
  const { id } = await rpc<{ id: string }>("adm_salvar_turma", {
    p_token: coord, p_id: null,
    p_dados: { codigo, nome: codigo, unidade: "Unidade Centro", idioma: "Inglês", nivel_curso: "Regular", modalidade: "Online",
               professor_id: prof, sala_id: null, capacidade, data_inicio: ini, data_fim: fim, situacao: "Ativa" },
    p_horarios: horarios,
  });
  return id;
}

beforeEach(async () => {
  await db.query(
    `truncate app.reposicoes, app.aulas_avulsas, app.creditos_reposicao, app.presencas, app.matricula_turma, app.turma_horarios,
              app.turmas, app.salas, app.disponibilidade_professor, app.professor_unidade, app.professores cascade`,
  );
  await semearK1(db);
  await db.query(`update app.configuracao set valor = '4' where chave in ('reposicao_antecedencia_horas', 'reposicao_limite_mes')`);
  await db.query(`insert into app.alunos (id_aluno, nome, email, unidade, status_matricula, modalidade)
                  values ('A010', 'Davi', 'davi@x.com', 'Unidade Centro', 'Ativa', 'Online')`);
  await db.query(`update app.alunos set modalidade = 'Online' where id_aluno = 'A001'`);
  coord = (await rpc<{ token: string }>("adm_login", { p_email: "coord@speakup.test", p_senha: SENHA_ADM })).token;
  profA = await professor("Prof A", TODOS_OS_DIAS(8));
  profB = await professor("Prof B", TODOS_OS_DIAS(20));
  turmaA = await turma("TA", profA, TODOS_OS_DIAS(8));
  turmaB = await turma("TB", profB, TODOS_OS_DIAS(20), 1);
  for (const al of ["A001", "A010"]) {
    await rpc("adm_turma_incluir_aluno", { p_token: coord, p_turma_id: turmaA, p_id_aluno: al });
  }
});

describe("K4 · Chamada e créditos de reposição", () => {
  it("falta gera crédito válido até o fim do mês seguinte; presente desfaz", async () => {
    const d = await diaUtil("passado", 8);
    await chamada(turmaA, d, 8, [{ id_aluno: "A001", situacao: "Falta" }, { id_aluno: "A010", situacao: "Presente" }]);
    const [c] = await q<{ valido_ate: string }>(
      "select to_char(valido_ate, 'YYYY-MM-DD') valido_ate from app.creditos_reposicao where id_aluno = 'A001'",
    );
    const [esperado] = await q<{ d: string }>(
      "select to_char((date_trunc('month', $1::date) + interval '2 months' - interval '1 day')::date, 'YYYY-MM-DD') d",
      [d],
    );
    expect(c.valido_ate).toBe(esperado.d);

    const tok = await loginAluno("A001");
    expect((await rpc<{ saldo: number }>("aluno_painel", { p_token: tok })).saldo).toBe(1);

    await chamada(turmaA, d, 8, [{ id_aluno: "A001", situacao: "Presente" }]);
    expect((await rpc<{ saldo: number }>("aluno_painel", { p_token: tok })).saldo).toBe(0);
  });

  it("não registra chamada de aula futura nem de aluno de fora da turma", async () => {
    const futuro = await diaUtil("futuro", 8);
    expect((await erroDe(chamada(turmaA, futuro, 8, []))).status).toBe(400);
    const d = await diaUtil("passado", 8);
    expect((await erroDe(chamada(turmaA, d, 8, [{ id_aluno: "A003", situacao: "Falta" }]))).status).toBe(400);
  });

  it("aluno ainda com senha padrão não acessa o painel de reposição", async () => {
    const tok = (await rpc<{ token: string }>("login_aluno", { p_id_aluno: "A001", p_senha: "Escola@@@" })).token;
    expect((await erroDe(rpc("aluno_painel", { p_token: tok }))).status).toBe(403);
  });
});

describe("K4 · Motor de agendamento", () => {
  async function comCredito(aluno: string) {
    const d = await diaUtil("passado", 8);
    await chamada(turmaA, d, 8, [{ id_aluno: aluno, situacao: "Falta" }]);
    return loginAluno(aluno);
  }

  type Catalogo = {
    saldo: number;
    bloqueio: string | null;
    dias: { data: string; horarios: { hora: number; opcoes: { tipo: string; turma_id?: string; professor: string }[] }[] }[];
  };

  it("J-D4: saldo zero bloqueia o catálogo", async () => {
    const tok = await loginAluno("A001");
    const c = await rpc<Catalogo>("aluno_catalogo_reposicao", { p_token: tok });
    expect(c).toMatchObject({ saldo: 0, bloqueio: "SALDO_ZERO", dias: [] });
    const e = await erroDe(rpc("aluno_agendar_reposicao", { p_token: tok, p_data: await diaUtil("futuro", 20), p_hora: 20, p_tipo: "TURMA", p_turma_id: turmaB }));
    expect(e.message).toBe("SALDO_ZERO");
  });

  it("J-D5 e J-D1: não oferece horário em que o aluno já tem aula, nem professor ocupado; oferece turma com vaga", async () => {
    const tok = await comCredito("A001");
    const c = await rpc<Catalogo>("aluno_catalogo_reposicao", { p_token: tok });
    const horas = new Set(c.dias.flatMap((d) => d.horarios.map((h) => h.hora)));
    expect(horas.has(8)).toBe(false); // J-D5: aula regular do aluno às 08h
    expect([...horas]).toEqual([20]); // Prof B só tem 20h e está na turma TB → só vaga em turma
    const op = c.dias[0].horarios[0].opcoes[0];
    expect(op).toMatchObject({ tipo: "TURMA", turma_id: turmaB, professor: "Prof B" });
  });

  it("oferece aula avulsa quando não há vaga em turma, com professor livre (J-D1)", async () => {
    const profC = await professor("Prof C", [...TODOS_OS_DIAS(12), ...TODOS_OS_DIAS(14)]);
    await turma("TC", profC, TODOS_OS_DIAS(14)); // Prof C ocupado às 14h
    const tok = await comCredito("A001");
    const c = await rpc<Catalogo>("aluno_catalogo_reposicao", { p_token: tok });
    const opcoes = (hora: number) => c.dias.flatMap((d) => d.horarios.filter((h) => h.hora === hora).map((h) => h.opcoes));
    // 12h: nenhuma turma com vaga → aula avulsa com o Prof C (livre e disponível)
    expect(opcoes(12).length).toBeGreaterThan(0);
    expect(opcoes(12).every((o) => o[0].tipo === "AVULSA" && o[0].professor === "Prof C")).toBe(true);
    // 14h: Prof C está ocupado com a TC, mas a TC (mesmo idioma/nível) tem vaga → a vaga em turma tem prioridade
    expect(opcoes(14).every((o) => o.length === 1 && o[0].tipo === "TURMA" && o[0].professor === "Prof C")).toBe(true);
  });

  it("aluno Híbrido sem sala livre recebe aula avulsa online", async () => {
    await professor("Prof H", TODOS_OS_DIAS(12));
    await db.query("update app.alunos set modalidade = 'Híbrido' where id_aluno = 'A001'");
    const tok = await comCredito("A001");
    const c = await rpc<Catalogo>("aluno_catalogo_reposicao", { p_token: tok });
    const op = c.dias.flatMap((d) => d.horarios.filter((h) => h.hora === 12).map((h) => h.opcoes[0]))[0];
    expect(op).toMatchObject({ tipo: "AVULSA", professor: "Prof H", modalidade: "Online" });
  });

  it("J-D3: agendar reserva o crédito (saldo −1) e a reposição aparece nas próximas aulas", async () => {
    const tok = await comCredito("A001");
    const data = await diaUtil("futuro", 20);
    const r = await rpc<{ saldo: number; reposicao_id: string }>("aluno_agendar_reposicao", {
      p_token: tok, p_data: data, p_hora: 20, p_tipo: "TURMA", p_turma_id: turmaB,
    });
    expect(r.saldo).toBe(0);
    const painel = await rpc<{ proximas: { tipo: string; reposicao_id?: string }[] }>("aluno_painel", { p_token: tok });
    expect(painel.proximas.some((p) => p.tipo === "Reposição" && p.reposicao_id === r.reposicao_id)).toBe(true);
  });

  it("J-D2: duas confirmações simultâneas na última vaga geram uma reserva e um erro tratado", async () => {
    const t1 = await comCredito("A001");
    const t2 = await comCredito("A010");
    const data = await diaUtil("futuro", 20);
    const agendar = (t: string) =>
      rpc("aluno_agendar_reposicao", { p_token: t, p_data: data, p_hora: 20, p_tipo: "TURMA", p_turma_id: turmaB });
    const res = await Promise.allSettled([agendar(t1), agendar(t2)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falha = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((falha.reason as RpcError).message).toBe("HORARIO_INDISPONIVEL");
    const [{ n }] = await q<{ n: number }>("select count(*)::int n from app.reposicoes where turma_id = $1 and status = 'Agendada'", [turmaB]);
    expect(n).toBe(1);
  });

  it("cancelamento com antecedência devolve o crédito; tardio consome", async () => {
    const tok = await comCredito("A001");
    const data = await diaUtil("futuro", 20);
    const ag = () => rpc<{ reposicao_id: string }>("aluno_agendar_reposicao", { p_token: tok, p_data: data, p_hora: 20, p_tipo: "TURMA", p_turma_id: turmaB });

    const r1 = await ag();
    const c1 = await rpc<{ credito_devolvido: boolean; saldo: number }>("aluno_cancelar_reposicao", { p_token: tok, p_reposicao_id: r1.reposicao_id });
    expect(c1).toMatchObject({ credito_devolvido: true, saldo: 1 });

    await db.query(`update app.configuracao set valor = '1000' where chave = 'reposicao_antecedencia_horas'`);
    const r2 = await ag();
    const c2 = await rpc<{ credito_devolvido: boolean; saldo: number }>("aluno_cancelar_reposicao", { p_token: tok, p_reposicao_id: r2.reposicao_id });
    expect(c2).toMatchObject({ credito_devolvido: false, saldo: 0 });
  });

  it("limite de reposições por mês", async () => {
    await db.query(`update app.configuracao set valor = '1' where chave = 'reposicao_limite_mes'`);
    const tok = await comCredito("A001");
    // segundo crédito
    const [{ d2 }] = await q<{ d2: string }>(
      `select to_char(d::date, 'YYYY-MM-DD') d2 from generate_series(app.hoje() - 9, app.hoje() - 15, interval '-1 day') d
        where app.dia_semana(d::date) <= 6 limit 1`,
    );
    await chamada(turmaA, d2, 8, [{ id_aluno: "A001", situacao: "Falta" }]);
    const data = await diaUtil("futuro", 20);
    await rpc("aluno_agendar_reposicao", { p_token: tok, p_data: data, p_hora: 20, p_tipo: "TURMA", p_turma_id: turmaB });
    const [{ outro }] = await q<{ outro: string }>(
      `select to_char(d::date, 'YYYY-MM-DD') outro from generate_series($1::date + 1, $1::date + 8, interval '1 day') d
        where app.dia_semana(d::date) <= 6 and date_trunc('month', d) = date_trunc('month', $1::date) limit 1`,
      [data],
    ).then((r) => (r.length ? r : [{ outro: null as unknown as string }]));
    if (outro) {
      const e = await erroDe(rpc("aluno_agendar_reposicao", { p_token: tok, p_data: outro, p_hora: 20, p_tipo: "TURMA", p_turma_id: turmaB }));
      expect(["LIMITE_MES", "HORARIO_INDISPONIVEL"]).toContain(e.message);
    }
  });

  it("aula avulsa agendada passa a ocupar o professor na grade", async () => {
    const profC = await professor("Prof C", TODOS_OS_DIAS(12));
    const tok = await comCredito("A001");
    const data = await diaUtil("futuro", 12);
    const r = await rpc<{ tipo: string; professor: string }>("aluno_agendar_reposicao", {
      p_token: tok, p_data: data, p_hora: 12, p_tipo: "AVULSA",
    });
    expect(r).toMatchObject({ tipo: "AVULSA", professor: "Prof C" });

    const conflito = await erroDe(turma("TX", profC, TODOS_OS_DIAS(12)));
    expect(conflito.message).toMatch(/reposição avulsa já agendada/);
    const dispo = await erroDe(rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: profC, p_horarios: [] }));
    expect(dispo.message).toMatch(/reposição avulsa agendada/);
  });

  it("presença na reposição consome o crédito e aparece no histórico do aluno", async () => {
    const tok = await comCredito("A001");
    const data = await diaUtil("futuro", 20);
    const r = await rpc<{ reposicao_id: string }>("aluno_agendar_reposicao", { p_token: tok, p_data: data, p_hora: 20, p_tipo: "TURMA", p_turma_id: turmaB });
    // aula futura: ainda não pode registrar
    expect((await erroDe(rpc("adm_registrar_presenca_reposicao", { p_token: coord, p_reposicao_id: r.reposicao_id, p_situacao: "Presente" }))).status).toBe(400);
    await db.query("update app.reposicoes set data = app.hoje() - 1, hora = 8 where id = $1", [r.reposicao_id]);
    await rpc("adm_registrar_presenca_reposicao", { p_token: coord, p_reposicao_id: r.reposicao_id, p_situacao: "Presente" });
    const [{ status }] = await q<{ status: string }>(
      "select c.status from app.reposicoes r join app.creditos_reposicao c on c.id = r.credito_id where r.id = $1",
      [r.reposicao_id],
    );
    expect(status).toBe("Usado");
    const h = await rpc<{ registros: { tipo: string; situacao: string }[] }>("aluno_presencas", { p_token: tok });
    expect(h.registros).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: "Reposição", situacao: "Presente" })]));
  });
});
