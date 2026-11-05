import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RpcError, rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

let db: pg.Client;
let coord: string;
let sup: string;
let empresa: string;
let turma: string;

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

const login = async (email: string) => (await rpc<{ token: string }>("adm_login", { p_email: email, p_senha: SENHA_ADM })).token;

type Relatorio = {
  inicio: string;
  fim: string;
  atualizado_ate: string;
  resumo: { alunos: number; elegiveis: number };
  linhas: { id_aluno: string; aulas: number; presentes: number; faltas: number; reposicoes: number; frequencia: number | null; media: number | null; elegivel: boolean; motivo: string | null; cefr_atual: string | null; cefr_inicial: string | null }[];
};

/** Datas (Mon–Sat) já passadas do mês corrente, ou do anterior se o mês acabou de começar. */
async function diasPassados(n: number): Promise<string[]> {
  const rows = (
    await db.query(
      `select to_char(d::date, 'YYYY-MM-DD') d from generate_series(app.hoje() - 1, app.hoje() - 60, interval '-1 day') d
        where app.dia_semana(d::date) <= 6 order by d desc limit $1`,
      [n],
    )
  ).rows as { d: string }[];
  return rows.map((r) => r.d);
}

beforeEach(async () => {
  await db.query(
    `truncate app.relatorios_envios, app.avaliacoes, app.usuario_empresa, app.aluno_empresa, app.empresas,
              app.reposicoes, app.aulas_avulsas, app.creditos_reposicao, app.presencas, app.matricula_turma, app.turma_horarios,
              app.turmas, app.salas, app.disponibilidade_professor, app.professor_unidade, app.professores cascade`,
  );
  await semearK1(db);
  coord = await login("coord@speakup.test");
  sup = await login("super@speakup.test");
  await db.query(`insert into app.alunos (id_aluno, nome, email, unidade, status_matricula) values
                   ('A011', 'Elisa', 'elisa@x.com', 'Unidade Centro', 'Ativa')`);

  empresa = (await rpc<{ id: string }>("adm_salvar_empresa", {
    p_token: coord, p_id: null, p_nome: "Acme S.A.", p_cnpj: "12.345.678/0001-90", p_contato_nome: "Rita",
    p_contato_email: "rh@acme.com", p_freq_minima: 75, p_media_minima: 7,
  })).id;

  // turma desde 60 dias atrás, aula todo dia 08h, com A001 e A011
  const [{ ini, fim }] = (await db.query("select app.hoje() - 60 ini, app.hoje() + 30 fim")).rows;
  const { rows } = await db.query(
    `insert into app.professores (nome, email, idiomas, niveis) values ('Prof', 'p@x.com', '{Inglês}', '{Regular}') returning id`,
  );
  await db.query(`insert into app.professor_unidade select $1, id from app.unidades where nome = 'Unidade Centro'`, [rows[0].id]);
  await db.query(`insert into app.disponibilidade_professor select $1, d, 8 from generate_series(1, 6) d`, [rows[0].id]);
  turma = (
    await db.query(
      `insert into app.turmas (codigo, nome, unidade_id, idioma, nivel_curso, modalidade, professor_id, capacidade, data_inicio, data_fim)
       select 'T5', 'T5', u.id, 'Inglês', 'Regular', 'Online', $1, 10, $2, $3 from app.unidades u where u.nome = 'Unidade Centro' returning id`,
      [rows[0].id, ini, fim],
    )
  ).rows[0].id;
  await db.query(`insert into app.turma_horarios select $1, d, 8 from generate_series(1, 6) d`, [turma]);
  await db.query(`insert into app.matricula_turma values ($1, 'A001'), ($1, 'A011')`, [turma]);
});

async function chamada(data: string, a001: "Presente" | "Falta", a011: "Presente" | "Falta") {
  await rpc("adm_registrar_chamada", {
    p_token: coord, p_turma_id: turma, p_data: data, p_hora: 8,
    p_registros: [{ id_aluno: "A001", situacao: a001 }, { id_aluno: "A011", situacao: a011 }],
  });
}

describe("K5 · Empresas e vínculo", () => {
  it("valida empresa (CNPJ 14 dígitos, nome único) e vincula só alunos do escopo", async () => {
    expect((await erroDe(rpc("adm_salvar_empresa", { p_token: coord, p_id: null, p_nome: "X", p_cnpj: "123", p_contato_nome: null, p_contato_email: null, p_freq_minima: 75, p_media_minima: 7 }))).status).toBe(400);
    expect((await erroDe(rpc("adm_salvar_empresa", { p_token: coord, p_id: null, p_nome: "acme s.a.", p_cnpj: null, p_contato_nome: null, p_contato_email: null, p_freq_minima: 75, p_media_minima: 7 }))).message).toBe("EMPRESA_JA_EXISTE");

    const r = await rpc<{ vinculados: number; nao_encontrados: string[] }>("adm_vincular_alunos_empresa", {
      p_token: coord, p_empresa_id: empresa, p_ids: ["A001", "A011", "A002", "XYZ"],
    });
    expect(r).toEqual({ vinculados: 2, nao_encontrados: ["A002", "XYZ"] }); // A002 é de outra unidade
    expect(await rpc("adm_empresa_do_aluno", { p_token: coord, p_id_aluno: "A001" })).toMatchObject({ nome: "Acme S.A." });
  });

  it("RH não cadastra empresas nem lança notas", async () => {
    const rh = await login("rh@speakup.test");
    expect((await erroDe(rpc("adm_salvar_empresa", { p_token: rh, p_id: null, p_nome: "Y", p_cnpj: null, p_contato_nome: null, p_contato_email: null, p_freq_minima: 75, p_media_minima: 7 }))).status).toBe(403);
    expect((await erroDe(rpc("adm_lancar_avaliacoes", { p_token: rh, p_turma_id: turma, p_data: "2026-01-01", p_registros: [] }))).status).toBe(403);
  });
});

describe("K5 · Notas", () => {
  it("lança notas 0–10 e CEFR; rejeita valores fora da faixa e data futura", async () => {
    const [d] = await diasPassados(1);
    await rpc("adm_lancar_avaliacoes", {
      p_token: coord, p_turma_id: turma, p_data: d,
      p_registros: [{ id_aluno: "A001", speaking: "8", listening: "7,5".replace(",", "."), reading: "9", writing: "6", cefr: "B1" }],
    });
    const { rows } = await db.query("select speaking, cefr from app.avaliacoes where id_aluno = 'A001'");
    expect(rows[0]).toEqual({ speaking: "8.00", cefr: "B1" });

    expect((await erroDe(rpc("adm_lancar_avaliacoes", { p_token: coord, p_turma_id: turma, p_data: d, p_registros: [{ id_aluno: "A001", speaking: "11" }] }))).status).toBe(400);
    expect((await erroDe(rpc("adm_lancar_avaliacoes", { p_token: coord, p_turma_id: turma, p_data: d, p_registros: [{ id_aluno: "A001", cefr: "D1" }] }))).status).toBe(400);
    const [{ amanha }] = (await db.query("select to_char(app.hoje() + 1, 'YYYY-MM-DD') amanha")).rows;
    expect((await erroDe(rpc("adm_lancar_avaliacoes", { p_token: coord, p_turma_id: turma, p_data: amanha, p_registros: [] }))).status).toBe(400);
  });
});

describe("K5 · Relatório de RH", () => {
  async function prepararCenario() {
    await rpc("adm_vincular_alunos_empresa", { p_token: coord, p_empresa_id: empresa, p_ids: ["A001", "A011", "A003"] });
    const dias = await diasPassados(4);
    // A001: 3 presenças e 1 falta (75%); A011: 1 presença e 3 faltas (25%)
    await chamada(dias[0], "Presente", "Falta");
    await chamada(dias[1], "Presente", "Falta");
    await chamada(dias[2], "Presente", "Falta");
    await chamada(dias[3], "Falta", "Presente");
    await rpc("adm_lancar_avaliacoes", {
      p_token: coord, p_turma_id: turma, p_data: dias[3],
      p_registros: [{ id_aluno: "A001", speaking: 8, listening: 7, reading: 7, writing: 6, cefr: "A2" },
                    { id_aluno: "A011", speaking: 9, listening: 9, reading: 9, writing: 9, cefr: "B2" }],
    });
    await rpc("adm_lancar_avaliacoes", {
      p_token: coord, p_turma_id: turma, p_data: dias[0], p_registros: [{ id_aluno: "A001", cefr: "B1" }],
    });
    return { inicio: dias[3], fim: dias[0] };
  }

  it("J-F1: frequência, média, CEFR e elegibilidade refletem as presenças e notas do período", async () => {
    const p = await prepararCenario();
    const r = await rpc<Relatorio>("adm_relatorio_rh", { p_token: coord, p_empresa_id: empresa, p_inicio: p.inicio, p_fim: p.fim });
    const a001 = r.linhas.find((l) => l.id_aluno === "A001")!;
    const a011 = r.linhas.find((l) => l.id_aluno === "A011")!;
    expect(a001).toMatchObject({ aulas: 4, presentes: 3, faltas: 1, frequencia: 75, media: 7, elegivel: true, cefr_inicial: "A2", cefr_atual: "B1" });
    expect(a011).toMatchObject({ frequencia: 25, media: 9, elegivel: false, motivo: "Frequência abaixo do mínimo" });
    expect(r.linhas.find((l) => l.id_aluno === "A003")).toMatchObject({ aulas: 0, elegivel: false, motivo: "Sem aulas registradas no período" });
    expect(r.resumo).toMatchObject({ alunos: 3, elegiveis: 1 });
  });

  it("reposição realizada conta como presença", async () => {
    const p = await prepararCenario();
    // simula uma reposição realizada da A011 dentro do período
    const { rows } = await db.query("select id from app.creditos_reposicao where id_aluno = 'A011' limit 1");
    await db.query(
      `insert into app.reposicoes (id_aluno, credito_id, tipo, turma_id, data, hora, status) values ('A011', $1, 'TURMA', $2, $3, 8, 'Realizada')`,
      [rows[0].id, turma, p.fim],
    );
    const r = await rpc<Relatorio>("adm_relatorio_rh", { p_token: coord, p_empresa_id: empresa, p_inicio: p.inicio, p_fim: p.fim });
    expect(r.linhas.find((l) => l.id_aluno === "A011")).toMatchObject({ reposicoes: 1, frequencia: 50 });
  });

  it("J-F2: RH vê só as empresas vinculadas a ele; coordenação não vê aluno de unidade fora do escopo", async () => {
    await prepararCenario();
    const rh = await login("rh@speakup.test");
    expect((await erroDe(rpc("adm_relatorio_rh", { p_token: rh, p_empresa_id: empresa }))).status).toBe(404);
    expect(await rpc("adm_listar_empresas", { p_token: rh })).toEqual([]);

    const [{ id: rhId }] = (await db.query("select id from app.usuarios_adm where email = 'rh@speakup.test'")).rows;
    await rpc("adm_definir_empresas_usuario", { p_token: sup, p_usuario_id: rhId, p_empresas: [empresa] });
    const r = await rpc<Relatorio>("adm_relatorio_rh", { p_token: rh, p_empresa_id: empresa });
    expect(r.linhas.map((l) => l.id_aluno).sort()).toEqual(["A001", "A003", "A011"]);

    // aluno da Unidade Norte vinculado pela superadmin: a coordenação Centro não o vê
    await rpc("adm_vincular_alunos_empresa", { p_token: sup, p_empresa_id: empresa, p_ids: ["A002"] });
    const rc = await rpc<Relatorio>("adm_relatorio_rh", { p_token: coord, p_empresa_id: empresa });
    expect(rc.linhas.map((l) => l.id_aluno)).not.toContain("A002");
    const rr = await rpc<Relatorio>("adm_relatorio_rh", { p_token: rh, p_empresa_id: empresa });
    expect(rr.linhas.map((l) => l.id_aluno)).toContain("A002");
  });

  it("D+1: o período nunca passa de ontem; gerar o relatório registra o envio e audita", async () => {
    await prepararCenario();
    const [{ hoje, ontem }] = (await db.query("select to_char(app.hoje(), 'YYYY-MM-DD') hoje, to_char(app.hoje() - 1, 'YYYY-MM-DD') ontem")).rows;
    const r = await rpc<Relatorio>("adm_relatorio_rh", { p_token: coord, p_empresa_id: empresa, p_fim: hoje, p_registrar_envio: true });
    expect(r.fim).toBe(ontem);
    expect(r.atualizado_ate).toBe(ontem);
    const { rows } = await db.query("select registros from app.relatorios_envios where empresa_id = $1", [empresa]);
    expect(rows).toEqual([{ registros: 3 }]);
    const aud = await db.query("select count(*)::int n from app.log_auditoria where acao = 'RELATORIO_RH_GERADO'");
    expect(aud.rows[0].n).toBe(1);
  });
});
