import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { validarRegistroAluno } from "@/lib/importacao/validar";
import { mensagemErro } from "@/lib/mensagens";
import { RpcError, rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

let db: pg.Client;

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query(
    "truncate app.matricula_turma, app.turma_horarios, app.turmas, app.salas, app.disponibilidade_professor, app.professor_unidade, app.professores cascade",
  );
  await semearK1(db);
});

async function token(email: string) {
  return (await rpc<{ token: string }>("adm_login", { p_email: email, p_senha: SENHA_ADM })).token;
}

async function erroDe(p: Promise<unknown>): Promise<RpcError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof RpcError) return e;
    throw e;
  }
  throw new Error("era esperado um erro");
}

const TODA_SEMANA = [1, 2, 3, 4, 5, 6].flatMap((dia) => [8, 10, 12, 14, 16, 18, 20].map((hora) => ({ dia, hora })));

async function professor(t: string, extra: Record<string, unknown> = {}) {
  const { id } = await rpc<{ id: string }>("adm_salvar_professor", {
    p_token: t,
    p_id: null,
    p_nome: "Prof. Laura",
    p_email: `laura${Math.random().toString(36).slice(2, 7)}@speakup.test`,
    p_telefone: "11 99999-0000",
    p_idiomas: ["Inglês"],
    p_niveis: ["Regular", "Business"],
    p_unidades: ["Unidade Centro"],
    p_ativo: true,
    ...extra,
  });
  return id;
}

async function sala(t: string, nome = "Sala 1", capacidade = 12) {
  return (
    await rpc<{ id: string }>("adm_salvar_sala", {
      p_token: t, p_id: null, p_unidade: "Unidade Centro", p_nome: nome, p_capacidade: capacidade, p_ativa: true,
    })
  ).id;
}

function salvarTurma(t: string, dados: Record<string, unknown>, horarios = [{ dia: 1, hora: 18 }], id: string | null = null) {
  return rpc<{ id: string }>("adm_salvar_turma", {
    p_token: t,
    p_id: id,
    p_dados: {
      codigo: `T-${Math.random().toString(36).slice(2, 7)}`,
      nome: "Inglês Regular Noite",
      unidade: "Unidade Centro",
      idioma: "Inglês",
      nivel_curso: "Regular",
      modalidade: "Presencial",
      capacidade: 10,
      data_inicio: "2026-02-01",
      data_fim: "2026-06-30",
      situacao: "Ativa",
      ...dados,
    },
    p_horarios: horarios,
  });
}

describe("K3 · Alunos (listagem, CRUD, inativação, exportação)", () => {
  it("listagem respeita o escopo de unidade, filtra, busca e pagina", async () => {
    const coord = await token("coord@speakup.test");
    const r = await rpc<{ total: number; linhas: { id_aluno: string }[] }>("adm_listar_alunos", { p_token: coord });
    expect(r.total).toBe(2);
    expect(r.linhas.map((l) => l.id_aluno).sort()).toEqual(["A001", "A003"]);

    const busca = await rpc<{ total: number }>("adm_listar_alunos", { p_token: coord, p_busca: "carla" });
    expect(busca.total).toBe(1);
    const status = await rpc<{ total: number }>("adm_listar_alunos", { p_token: coord, p_status: "Cancelada" });
    expect(status.total).toBe(1);
    const pagina = await rpc<{ linhas: unknown[] }>("adm_listar_alunos", { p_token: coord, p_por_pagina: 1, p_pagina: 2 });
    expect(pagina.linhas).toHaveLength(1);

    // aluno de outra unidade não é visível nem pela URL
    expect((await erroDe(rpc("adm_obter_aluno", { p_token: coord, p_id_aluno: "A002" }))).status).toBe(404);
  });

  it("cria, rejeita matrícula duplicada, edita e audita os campos alterados (sem valores)", async () => {
    const coord = await token("coord@speakup.test");
    const v = validarRegistroAluno({
      id_aluno: "N100", nome: "Nova Aluna", email: "nova@exemplo.com", unidade: "Unidade Centro",
      status_matricula: "ativa", turno: "noite", desconto_percentual: "5,5",
    });
    expect(v.erros).toEqual({});
    await rpc("adm_salvar_aluno", { p_token: coord, p_novo: true, p_dados: v.dados });

    const dup = await erroDe(rpc("adm_salvar_aluno", { p_token: coord, p_novo: true, p_dados: v.dados }));
    expect(dup.message).toBe("ALUNO_JA_EXISTE");

    await rpc("adm_salvar_aluno", { p_token: coord, p_novo: false, p_dados: { ...v.dados, nome: "Nova Aluna Silva" } });
    const { rows } = await db.query(
      "select detalhes from app.log_auditoria where acao = 'ALUNO_ALTERADO' and entidade_id = 'N100' order by id desc limit 1",
    );
    expect(rows[0].detalhes).toEqual({ campos: ["nome"] });
  });

  it("formulário usa as mesmas validações da importação", () => {
    const v = validarRegistroAluno({ id_aluno: "X", nome: "", email: "sem-arroba", unidade: "U", status_matricula: "Ativo" });
    expect(Object.keys(v.erros).sort()).toEqual(["email", "nome", "status_matricula"]);
  });

  it("coordenação não cria aluno em unidade fora do escopo", async () => {
    const coord = await token("coord@speakup.test");
    const v = validarRegistroAluno({ id_aluno: "N2", nome: "X", email: "x@x.com", unidade: "Unidade Norte", status_matricula: "Ativa" });
    const e = await erroDe(rpc("adm_salvar_aluno", { p_token: coord, p_novo: true, p_dados: v.dados }));
    expect(e.status).toBe(400);
    expect(mensagemErro(e.message)).toMatch(/fora do seu escopo/);
  });

  it("inativa (sem excluir) e registra auditoria", async () => {
    const coord = await token("coord@speakup.test");
    await rpc("adm_inativar_aluno", { p_token: coord, p_id_aluno: "A001", p_status: "Cancelada" });
    const { rows } = await db.query("select status_matricula, data_cancelamento from app.alunos where id_aluno = 'A001'");
    expect(rows[0].status_matricula).toBe("Cancelada");
    expect(rows[0].data_cancelamento).not.toBeNull();
    const aud = await db.query("select detalhes from app.log_auditoria where acao = 'ALUNO_INATIVADO' and entidade_id = 'A001'");
    expect(aud.rows[0].detalhes).toEqual({ de: "Ativa", para: "Cancelada" });
  });

  it("exportação respeita filtros e escopo, traz as 19 colunas e é auditada", async () => {
    const coord = await token("coord@speakup.test");
    const linhas = await rpc<Record<string, unknown>[]>("adm_exportar_alunos", { p_token: coord, p_status: "Ativa" });
    expect(linhas.map((l) => l.id_aluno)).toEqual(["A001"]);
    expect(Object.keys(linhas[0])).toHaveLength(19);
    expect(linhas[0]).not.toHaveProperty("senha_hash");
    const aud = await db.query("select detalhes from app.log_auditoria where acao = 'ALUNOS_EXPORTADOS' order by id desc limit 1");
    expect(aud.rows[0].detalhes).toEqual({ registros: 1, filtros: { status: "Ativa" } });
  });

  it("RH não lista nem edita alunos", async () => {
    const rh = await token("rh@speakup.test");
    expect((await erroDe(rpc("adm_listar_alunos", { p_token: rh }))).status).toBe(403);
    expect((await erroDe(rpc("adm_inativar_aluno", { p_token: rh, p_id_aluno: "A001", p_status: "Trancada" }))).status).toBe(403);
  });
});

describe("K3 · Professores, salas e turmas sem conflito de grade", () => {
  it("cadastra professor só em unidades do escopo e com e-mail único", async () => {
    const coord = await token("coord@speakup.test");
    const fora = await erroDe(professor(coord, { p_unidades: ["Unidade Norte"] }));
    expect(mensagemErro(fora.message)).toMatch(/fora do seu escopo/);
    await professor(coord, { p_email: "unico@speakup.test" });
    expect((await erroDe(professor(coord, { p_email: "UNICO@speakup.test" }))).message).toBe("PROFESSOR_EMAIL_EXISTE");
  });

  it("turma só pode usar horários em que o professor está disponível", async () => {
    const coord = await token("coord@speakup.test");
    const p = await professor(coord);
    const s = await sala(coord);
    const e = await erroDe(salvarTurma(coord, { professor_id: p, sala_id: s }));
    expect(mensagemErro(e.message)).toMatch(/não está disponível segunda 18h/);

    await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: p, p_horarios: [{ dia: 1, hora: 18 }] });
    await salvarTurma(coord, { professor_id: p, sala_id: s });
  });

  it("impede choque de professor e de sala no mesmo horário com períodos sobrepostos", async () => {
    const coord = await token("coord@speakup.test");
    const p = await professor(coord);
    const p2 = await professor(coord, { p_nome: "Prof. Rui" });
    for (const id of [p, p2]) await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: id, p_horarios: TODA_SEMANA });
    const s = await sala(coord);
    const s2 = await sala(coord, "Sala 2");
    await salvarTurma(coord, { codigo: "ING-1", professor_id: p, sala_id: s });

    const prof = await erroDe(salvarTurma(coord, { professor_id: p, sala_id: s2 }));
    expect(mensagemErro(prof.message)).toMatch(/professor Prof. Laura já dá aula na turma ING-1 segunda 18h/);

    const salaOcupada = await erroDe(salvarTurma(coord, { professor_id: p2, sala_id: s }));
    expect(mensagemErro(salaOcupada.message)).toMatch(/sala Sala 1 já está ocupada pela turma ING-1/);

    // mesmo horário, mas período sem sobreposição: permitido
    await salvarTurma(coord, { professor_id: p, sala_id: s, data_inicio: "2026-07-01", data_fim: "2026-12-15" });
    // turma encerrada libera o horário
    const { rows } = await db.query("select id from app.turmas where codigo = 'ING-1'");
    await db.query("update app.turmas set situacao = 'Encerrada' where id = $1", [rows[0].id]);
    await salvarTurma(coord, { professor_id: p2, sala_id: s });
  });

  it("valida sala (capacidade, modalidade) e competência do professor (idioma e nível)", async () => {
    const coord = await token("coord@speakup.test");
    const p = await professor(coord);
    await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: p, p_horarios: TODA_SEMANA });
    const pequena = await sala(coord, "Sala P", 4);

    expect(mensagemErro((await erroDe(salvarTurma(coord, { professor_id: p, sala_id: pequena }))).message)).toMatch(/comporta 4 alunos/);
    expect(mensagemErro((await erroDe(salvarTurma(coord, { professor_id: p, sala_id: null }))).message)).toMatch(/precisa de uma sala/);
    expect(mensagemErro((await erroDe(salvarTurma(coord, { professor_id: p, sala_id: pequena, modalidade: "Online" }))).message)).toMatch(
      /online .* não deve ter sala/,
    );
    expect(mensagemErro((await erroDe(salvarTurma(coord, { professor_id: p, modalidade: "Online", idioma: "Espanhol" }))).message)).toMatch(
      /não leciona Espanhol/,
    );
    expect(mensagemErro((await erroDe(salvarTurma(coord, { professor_id: p, modalidade: "Online", nivel_curso: "Teens" }))).message)).toMatch(
      /não leciona o nível Teens/,
    );
    await salvarTurma(coord, { professor_id: p, modalidade: "Online", sala_id: null });
  });

  it("não permite retirar disponibilidade, competência ou atividade que turmas ativas usam", async () => {
    const coord = await token("coord@speakup.test");
    const p = await professor(coord);
    await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: p, p_horarios: [{ dia: 1, hora: 18 }, { dia: 3, hora: 18 }] });
    await salvarTurma(coord, { codigo: "ON-1", professor_id: p, modalidade: "Online" });

    const e = await erroDe(rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: p, p_horarios: [{ dia: 3, hora: 18 }] }));
    expect(mensagemErro(e.message)).toMatch(/não está disponível segunda 18h \(turma ON-1\)/);
    const { rows } = await db.query("select count(*)::int n from app.disponibilidade_professor where professor_id = $1", [p]);
    expect(rows[0].n).toBe(2); // nada foi alterado

    const base = {
      p_token: coord, p_id: p, p_nome: "Prof. Laura", p_email: "laura@speakup.test", p_telefone: null,
      p_idiomas: ["Inglês"], p_niveis: ["Regular"], p_unidades: ["Unidade Centro"],
    };
    expect(mensagemErro((await erroDe(rpc("adm_salvar_professor", { ...base, p_ativo: false }))).message)).toMatch(/inativo/);
    expect(mensagemErro((await erroDe(rpc("adm_salvar_professor", { ...base, p_idiomas: ["Francês"] }))).message)).toMatch(/não leciona Inglês/);
  });

  it("inclusão de aluno: escopo, unidade, situação, lotação e choque de horário do aluno", async () => {
    const coord = await token("coord@speakup.test");
    const p = await professor(coord);
    const p2 = await professor(coord, { p_nome: "Prof. Rui" });
    for (const id of [p, p2]) await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: id, p_horarios: TODA_SEMANA });
    const t1 = (await salvarTurma(coord, { codigo: "A", professor_id: p, modalidade: "Online", capacidade: 1 })).id;
    const t2 = (await salvarTurma(coord, { codigo: "B", professor_id: p2, modalidade: "Online" })).id;
    const incluir = (turma: string, aluno: string) => rpc("adm_turma_incluir_aluno", { p_token: coord, p_turma_id: turma, p_id_aluno: aluno });

    expect(mensagemErro((await erroDe(incluir(t1, "A002"))).message)).toMatch(/não encontrado no seu escopo/);
    expect(mensagemErro((await erroDe(incluir(t1, "A003"))).message)).toMatch(/está cancelada/);
    await incluir(t1, "A001");
    expect(mensagemErro((await erroDe(incluir(t1, "A001"))).message)).toMatch(/já está nesta turma/);

    // mesmo horário (segunda 18h) em outra turma: choque do aluno
    const choque = await erroDe(incluir(t2, "A001"));
    expect(mensagemErro(choque.message)).toMatch(/aluno A001 já está na turma A segunda 18h/);
    expect((await db.query("select count(*)::int n from app.matricula_turma where turma_id = $1", [t2])).rows[0].n).toBe(0);

    // lotação
    await db.query(
      "insert into app.alunos (id_aluno, nome, email, unidade, status_matricula) values ('A010','Davi','davi@x.com','Unidade Centro','Ativa')",
    );
    expect(mensagemErro((await erroDe(incluir(t1, "A010"))).message)).toMatch(/lotada/);

    // reduzir capacidade abaixo dos inscritos é bloqueado
    await incluir(t2, "A010");
    const reduzir = await erroDe(
      salvarTurma(coord, { codigo: "B", professor_id: p2, modalidade: "Online", capacidade: 0 }, [{ dia: 1, hora: 18 }], t2),
    );
    expect(reduzir.status).toBe(400);
  });

  it("RH não acessa a grade; outra coordenação não enxerga turma alheia", async () => {
    const coord = await token("coord@speakup.test");
    const p = await professor(coord);
    await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: p, p_horarios: TODA_SEMANA });
    const t = (await salvarTurma(coord, { professor_id: p, modalidade: "Online" })).id;

    const rh = await token("rh@speakup.test");
    expect((await erroDe(rpc("adm_listar_turmas", { p_token: rh }))).status).toBe(403);
    const sem = await token("semvinculo@speakup.test");
    expect((await erroDe(rpc("adm_obter_turma", { p_token: sem, p_id: t }))).status).toBe(404);
    expect(await rpc("adm_listar_professores", { p_token: sem })).toEqual([]);
  });
});
