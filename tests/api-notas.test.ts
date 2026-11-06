import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

let db: pg.Client;
let coord: string;
let sup: string;
let empresa: string;
let outra: string;
let turma: string;

type Resp = { status: number; corpo: Record<string, unknown> & { erro?: { codigo: string; mensagem: string } } };
type Disciplina = { disciplina: string; notas: { data: string; nota: number }[]; media: number | null; situacao: string };
type Curso = { turma: string; curso: string; nivel_cefr_atual: string | null; frequencia: { aulas_registradas: number; presencas: number; percentual: number | null }; disciplinas: Disciplina[] };

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

const login = async (email: string) => (await rpc<{ token: string }>("adm_login", { p_email: email, p_senha: SENHA_ADM })).token;
const consultar = (chave: string | null, id: string, nome: string) =>
  rpc<Resp>("api_notas_aluno", { p_chave: chave, p_id_aluno: id, p_nome: nome, p_ip: "203.0.113.9" });

beforeEach(async () => {
  await db.query(
    `truncate app.empresa_chaves_api, app.relatorios_envios, app.avaliacoes, app.usuario_empresa, app.aluno_empresa, app.empresas,
              app.reposicoes, app.aulas_avulsas, app.creditos_reposicao, app.presencas, app.matricula_turma, app.turma_horarios,
              app.turmas, app.salas, app.disponibilidade_professor, app.professor_unidade, app.professores cascade`,
  );
  await db.query("update app.configuracao set valor = '60' where chave = 'api_limite_por_minuto'");
  await semearK1(db);
  coord = await login("coord@speakup.test");
  sup = await login("super@speakup.test");
  const prof = await rpc<{ id: string }>("adm_salvar_professor", {
    p_token: coord, p_id: null, p_nome: "Prof A", p_email: "profa@speakup.test", p_telefone: null,
    p_idiomas: ["Inglês"], p_niveis: ["Regular"], p_unidades: ["Unidade Centro"], p_ativo: true,
  });
  await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: prof.id, p_horarios: [1, 2, 3, 4, 5, 6].map((dia) => ({ dia, hora: 8 })) });
  const [{ ini, fim }] = (await db.query("select to_char(app.hoje() - 40, 'YYYY-MM-DD') ini, to_char(app.hoje() + 60, 'YYYY-MM-DD') fim")).rows;
  turma = (await rpc<{ id: string }>("adm_salvar_turma", {
    p_token: coord, p_id: null,
    p_dados: { codigo: "ING-1", nome: "ING-1", unidade: "Unidade Centro", idioma: "Inglês", nivel_curso: "Regular", modalidade: "Online",
               professor_id: prof.id, sala_id: null, capacidade: 10, data_inicio: ini, data_fim: fim, situacao: "Ativa" },
    p_horarios: [1, 2, 3, 4, 5, 6].map((dia) => ({ dia, hora: 8 })),
  })).id;
  await rpc("adm_turma_incluir_aluno", { p_token: coord, p_turma_id: turma, p_id_aluno: "A001" });
  empresa = (await rpc<{ id: string }>("adm_salvar_empresa", { p_token: coord, p_id: null, p_nome: "Acme", p_cnpj: null, p_contato_nome: null, p_contato_email: null, p_freq_minima: 75, p_media_minima: 7 })).id;
  outra = (await rpc<{ id: string }>("adm_salvar_empresa", { p_token: coord, p_id: null, p_nome: "Beta", p_cnpj: null, p_contato_nome: null, p_contato_email: null, p_freq_minima: 75, p_media_minima: 7 })).id;
  await db.query("insert into app.aluno_empresa (id_aluno, empresa_id) values ('A001', $1), ('A003', $2)", [empresa, outra]);
});

async function lancar(data: string, notas: Record<string, number | string | null>) {
  await rpc("adm_lancar_avaliacoes", { p_token: coord, p_turma_id: turma, p_data: data, p_registros: [{ id_aluno: "A001", ...notas }] });
}

describe("API de notas para empresas parceiras", () => {
  it("só o superadmin gera chave; a chave completa aparece uma única vez e o banco guarda só o hash", async () => {
    await expect(rpc("adm_gerar_chave_api", { p_token: coord, p_empresa_id: empresa })).rejects.toMatchObject({ status: 403 });
    const g = await rpc<{ chave: string; prefixo: string }>("adm_gerar_chave_api", { p_token: sup, p_empresa_id: empresa });
    expect(g.chave).toMatch(/^su_[0-9a-f]{48}$/);
    const [linha] = (await db.query("select prefixo, chave_hash from app.empresa_chaves_api")).rows;
    expect(linha.prefixo).toBe(g.chave.slice(0, 11));
    expect(linha.chave_hash).not.toContain(g.chave.slice(11));
    const lista = await rpc<{ pode_gerenciar: boolean; empresas: { nome: string; chave: { prefixo: string } | null }[] }>("adm_chaves_api", { p_token: coord });
    expect(lista.pode_gerenciar).toBe(false);
    expect(JSON.stringify(lista)).not.toContain(g.chave);
  });

  it("retorna nome, disciplinas (4 competências), notas, média e situação pela média mínima da empresa", async () => {
    const { chave } = await rpc<{ chave: string }>("adm_gerar_chave_api", { p_token: sup, p_empresa_id: empresa });
    const [{ d1, d2 }] = (await db.query("select to_char(app.hoje() - 10, 'YYYY-MM-DD') d1, to_char(app.hoje() - 3, 'YYYY-MM-DD') d2")).rows;
    await lancar(d1, { speaking: 8, listening: 6, reading: 9, writing: null, cefr: "A2" });
    await lancar(d2, { speaking: 9, listening: 7, reading: 9, writing: null, cefr: "B1" });

    // Nome sem acento e em minúsculas também casa.
    const r = await consultar(chave, "A001", "  ana   SOUZA ");
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ aluno: { id_aluno: "A001", nome: "Ana Souza", situacao_matricula: "Ativa" }, empresa: "Acme" });
    const [curso] = r.corpo.cursos as Curso[];
    expect(curso).toMatchObject({ turma: "ING-1", curso: "Inglês · Regular", nivel_cefr_atual: "B1" });
    const por = Object.fromEntries(curso.disciplinas.map((d) => [d.disciplina, d]));
    expect(curso.disciplinas.map((d) => d.disciplina)).toEqual(["Speaking", "Listening", "Reading", "Writing"]);
    expect(por.Speaking).toMatchObject({ media: 8.5, situacao: "Aprovado" });
    expect(por.Speaking.notas).toEqual([{ data: d1, nota: 8 }, { data: d2, nota: 9 }]);
    expect(por.Listening).toMatchObject({ media: 6.5, situacao: "Abaixo da média" });
    expect(por.Writing).toMatchObject({ media: null, situacao: "Sem avaliação", notas: [] });

    // A regra acompanha a média mínima cadastrada na empresa.
    await db.query("update app.empresas set media_minima = 9 where id = $1", [empresa]);
    const r2 = await consultar(chave, "A001", "Ana Souza");
    const s2 = (r2.corpo.cursos as Curso[])[0].disciplinas.find((d) => d.disciplina === "Speaking");
    expect(s2?.situacao).toBe("Abaixo da média");
    expect((r2.corpo.criterio as { descricao: string }).descricao).toContain("9,0");
  });

  it("aluno de outra empresa, inexistente ou com nome divergente → 404 com mensagem clara (sem revelar qual)", async () => {
    const { chave } = await rpc<{ chave: string }>("adm_gerar_chave_api", { p_token: sup, p_empresa_id: empresa });
    for (const [id, nome] of [["A003", "Carla Dias"], ["X999", "Ninguém"], ["A001", "Ana Silva"], ["A002", "Bruno Lima"]]) {
      const r = await consultar(chave, id, nome);
      expect(r.status).toBe(404);
      expect(r.corpo.erro?.codigo).toBe("ALUNO_NAO_ENCONTRADO");
      expect(r.corpo.erro?.mensagem).toMatch(/Nenhum aluno vinculado à sua empresa/);
    }
    expect((await consultar(chave, "", "Ana Souza")).status).toBe(400);
  });

  it("chave ausente, errada, revogada ou de empresa inativa → 401; nova chave substitui a anterior", async () => {
    const { chave } = await rpc<{ chave: string }>("adm_gerar_chave_api", { p_token: sup, p_empresa_id: empresa });
    expect((await consultar(null, "A001", "Ana Souza")).status).toBe(401);
    expect((await consultar("su_" + "0".repeat(48), "A001", "Ana Souza")).status).toBe(401);

    const nova = await rpc<{ chave: string }>("adm_gerar_chave_api", { p_token: sup, p_empresa_id: empresa });
    expect((await consultar(chave, "A001", "Ana Souza")).status).toBe(401);
    expect((await consultar(nova.chave, "A001", "Ana Souza")).status).toBe(200);

    await db.query("update app.empresas set ativa = false where id = $1", [empresa]);
    expect((await consultar(nova.chave, "A001", "Ana Souza")).status).toBe(401);
    await db.query("update app.empresas set ativa = true where id = $1", [empresa]);

    await rpc("adm_revogar_chave_api", { p_token: sup, p_empresa_id: empresa });
    expect((await consultar(nova.chave, "A001", "Ana Souza")).corpo.erro?.codigo).toBe("NAO_AUTORIZADO");
  });

  it("toda consulta é auditada com empresa, aluno, IP e resultado; aplica limite por minuto", async () => {
    const { chave } = await rpc<{ chave: string }>("adm_gerar_chave_api", { p_token: sup, p_empresa_id: empresa });
    await consultar(chave, "A001", "Ana Souza");
    await consultar(chave, "A003", "Carla Dias");
    const log = (await db.query(
      "select ator_tipo, ator_id, entidade_id, ip, detalhes->>'resultado' r from app.log_auditoria where acao = 'API_NOTAS_CONSULTA' and ator_id = $1 order by id",
      [empresa],
    )).rows;
    expect(log).toEqual([
      { ator_tipo: "API", ator_id: empresa, entidade_id: "A001", ip: "203.0.113.9", r: "OK" },
      { ator_tipo: "API", ator_id: empresa, entidade_id: "A003", ip: "203.0.113.9", r: "NAO_ENCONTRADO" },
    ]);
    await db.query("update app.configuracao set valor = '2' where chave = 'api_limite_por_minuto'");
    const r = await consultar(chave, "A001", "Ana Souza");
    expect(r.status).toBe(429);
    expect(r.corpo.erro?.codigo).toBe("LIMITE_EXCEDIDO");
  });
});
