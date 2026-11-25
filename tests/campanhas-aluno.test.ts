import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

let db: pg.Client;
let sup: string;
let hoje: string;

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query("truncate app.campanha_interesses, app.campanhas_retencao, app.churn_previsao");
  await semearK1(db);
  await db.query(`insert into app.alunos (id_aluno, nome, email, unidade, status_matricula, primeiro_acesso) values
    ('7', 'Sétimo Aluno', 's@x.com', 'Unidade Centro', 'Ativa', false),
    ('8', 'Oitava Aluna', 'o@x.com', 'Unidade Centro', 'Cancelada', false)`);
  await db.query("insert into app.churn_previsao (id_aluno, probabilidade_churn) values (7, 45), (8, 45), (9, 90)");
  hoje = (await db.query("select to_char(app.hoje(), 'YYYY-MM-DD') d")).rows[0].d;
  sup = (await rpc<{ token: string }>("adm_login", { p_email: "super@speakup.test", p_senha: SENHA_ADM })).token;
});

const loginAluno = async (id: string) => (await rpc<{ token: string }>("login_aluno", { p_id_aluno: id, p_senha: "Escola@@@" })).token;
const campanha = (o: Record<string, unknown> = {}) =>
  rpc<{ id: string }>("adm_campanha_salvar", {
    p_token: sup, p_id: null, p_nome: "Teste", p_churn_minimo: 30, p_churn_maximo: 60, p_desconto: 20,
    p_titulo: "{nome}, fique!", p_mensagem: "Olá {nome}", p_data_inicio: hoje, p_data_fim: "2099-12-31", p_ativa: true, ...o,
  });

describe("Campanhas de Retenção no portal do aluno", () => {
  it("aluno na faixa vê a oferta vigente; fora da faixa, sem previsão, cancelado, agendada ou inativa não vê", async () => {
    const { id } = await campanha();
    const t7 = await loginAluno("7");
    expect(await rpc("aluno_oferta_retencao", { p_token: t7 })).toMatchObject({ campanha_id: id, desconto: 20, interesse_em: null });
    expect(await rpc("aluno_oferta_retencao", { p_token: await loginAluno("8") })).toBeNull(); // cancelada
    expect(await rpc("aluno_oferta_retencao", { p_token: await loginAluno("A001") })).toBeNull(); // sem previsão
    await rpc("adm_campanha_definir_ativa", { p_token: sup, p_id: id, p_ativa: false });
    expect(await rpc("aluno_oferta_retencao", { p_token: t7 })).toBeNull();
    await rpc("adm_campanha_excluir", { p_token: sup, p_id: id });
    await campanha({ p_data_inicio: "2099-01-01" }); // agendada
    expect(await rpc("aluno_oferta_retencao", { p_token: t7 })).toBeNull();
  });

  it("Tenho interesse: registra uma vez, aparece no painel, só para a oferta do próprio aluno", async () => {
    const { id } = await campanha();
    const t7 = await loginAluno("7");
    await rpc("aluno_registrar_interesse", { p_token: t7, p_campanha_id: id });
    await rpc("aluno_registrar_interesse", { p_token: t7, p_campanha_id: id }); // idempotente
    expect((await rpc<{ interesse_em: string | null }>("aluno_oferta_retencao", { p_token: t7 })).interesse_em).not.toBeNull();
    const l = await rpc<{ id_aluno: string; churn: number }[]>("adm_campanha_interessados", { p_token: sup, p_id: id });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id_aluno: "7", churn: 45 });
    expect((await rpc<{ campanhas: { interessados: number }[] }>("adm_campanhas_listar", { p_token: sup })).campanhas[0].interessados).toBe(1);
    await expect(rpc("aluno_registrar_interesse", { p_token: await loginAluno("A001"), p_campanha_id: id })).rejects.toMatchObject({ status: 409 });
  });
});
