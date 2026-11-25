import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RpcError, rpc } from "@/lib/server/rpc";
import { personalizarMensagem } from "@/lib/campanhas";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

let db: pg.Client;
let sup: string;

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query("truncate app.campanhas_retencao, app.churn_previsao");
  await semearK1(db);
  sup = (await rpc<{ token: string }>("adm_login", { p_email: "super@speakup.test", p_senha: SENHA_ADM })).token;
});

type C = { id: string; nome: string; ativa: boolean; alunos_na_faixa: number; churn_minimo: number; churn_maximo: number };
const base = {
  p_nome: "Risco alto", p_churn_minimo: 60, p_churn_maximo: 80, p_desconto: 15, p_titulo: "Oferta especial",
  p_mensagem: "Olá, {nome}! Renove já com desconto.", p_data_inicio: "2026-12-01", p_data_fim: "2026-12-31", p_ativa: true,
};
const salvar = (o: Partial<typeof base> & { p_id?: string | null } = {}) =>
  rpc<{ id: string }>("adm_campanha_salvar", { p_token: sup, p_id: null, ...base, ...o });
const listar = async () => (await rpc<{ campanhas: C[] }>("adm_campanhas_listar", { p_token: sup })).campanhas;
async function erro(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof RpcError) return e;
    throw e;
  }
  throw new Error("esperava erro");
}

describe("Campanhas de Retenção", () => {
  it("só o superadmin acessa", async () => {
    for (const email of ["coord@speakup.test", "rh@speakup.test"]) {
      const t = (await rpc<{ token: string }>("adm_login", { p_email: email, p_senha: SENHA_ADM })).token;
      await expect(rpc("adm_campanhas_listar", { p_token: t })).rejects.toMatchObject({ status: 403 });
    }
  });

  it("validações: mínimo < máximo, desconto 0–100, fim depois do início, 0–100", async () => {
    expect((await erro(salvar({ p_churn_minimo: 80, p_churn_maximo: 80 }))).message).toMatch(/mínimo deve ser menor/);
    expect((await erro(salvar({ p_churn_minimo: -1 }))).message).toMatch(/entre 0 e 100/);
    expect((await erro(salvar({ p_churn_maximo: 101 }))).message).toMatch(/entre 0 e 100/);
    expect((await erro(salvar({ p_desconto: 120 }))).message).toMatch(/desconto/);
    expect((await erro(salvar({ p_data_fim: "2026-12-01" }))).message).toMatch(/fim deve ser depois/);
    expect((await erro(salvar({ p_nome: "  " }))).message).toMatch(/nome/);
    expect((await listar()).length).toBe(0);
  });

  it("contagem pela regra de faixa: >= mínimo e < máximo; com máximo 100, inclui o 100", async () => {
    await db.query(`insert into app.churn_previsao (id_aluno, probabilidade_churn) values
      (1, 59.99), (2, 60), (3, 79.99), (4, 80), (5, 99.9), (6, 100), (7, 0)`);
    await salvar(); // 60–80
    await salvar({ p_nome: "Crítico", p_churn_minimo: 80, p_churn_maximo: 100 });
    await salvar({ p_nome: "Baixo", p_churn_minimo: 0, p_churn_maximo: 60 });
    const l = await listar();
    expect(l.map((c) => [c.nome, Number(c.alunos_na_faixa)])).toEqual([["Baixo", 2], ["Risco alto", 2], ["Crítico", 3]]);
  });

  it("sobreposição: ativas não podem cruzar faixa E período; inativas e períodos distintos podem", async () => {
    const a = await salvar(); // 60–80, dezembro
    const e = await erro(salvar({ p_nome: "Cruzada", p_churn_minimo: 70, p_churn_maximo: 90, p_data_inicio: "2026-12-15", p_data_fim: "2027-01-15" }));
    expect(e.status).toBe(409);
    expect(e.message).toMatch(/Risco alto/);
    // faixa encostada (80 não pertence a 60–80) → ok
    await salvar({ p_nome: "Encostada", p_churn_minimo: 80, p_churn_maximo: 100 });
    // mesma faixa, período sem cruzar → ok
    await salvar({ p_nome: "Janeiro", p_data_inicio: "2027-01-01", p_data_fim: "2027-01-31" });
    // inativa pode se sobrepor; ativar depois é bloqueado
    const b = await salvar({ p_nome: "Inativa", p_ativa: false });
    expect((await erro(rpc("adm_campanha_definir_ativa", { p_token: sup, p_id: b.id, p_ativa: true }))).status).toBe(409);
    // desativa a A → B pode ser ativada
    await rpc("adm_campanha_definir_ativa", { p_token: sup, p_id: a.id, p_ativa: false });
    await rpc("adm_campanha_definir_ativa", { p_token: sup, p_id: b.id, p_ativa: true });
    // editar a própria campanha não conflita com ela mesma
    await salvar({ p_id: b.id, p_nome: "Inativa (editada)", p_desconto: 20 });
    expect((await listar()).find((c) => c.id === b.id)).toMatchObject({ nome: "Inativa (editada)", ativa: true });
  });

  it("edição, exclusão com auditoria e mensagem com {nome}", async () => {
    const { id } = await salvar();
    await salvar({ p_id: id, p_desconto: 25, p_titulo: "Nova oferta" });
    expect(await rpc("adm_campanha_obter", { p_token: sup, p_id: id })).toMatchObject({ titulo_oferta: "Nova oferta" });
    await rpc("adm_campanha_excluir", { p_token: sup, p_id: id });
    expect(await listar()).toEqual([]);
    const [log] = (await db.query("select detalhes from app.log_auditoria where acao = 'CAMPANHA_EXCLUIDA' and entidade_id = $1", [id])).rows;
    expect(log.detalhes).toMatchObject({ nome: "Risco alto", titulo_oferta: "Nova oferta" });
    expect((await erro(rpc("adm_campanha_excluir", { p_token: sup, p_id: id }))).status).toBe(404);
    expect(personalizarMensagem("Olá, {nome}! {NOME}, renove.", "Mariana Alves")).toBe("Olá, Mariana! Mariana, renove.");
    expect(personalizarMensagem("Oi {nome}", null)).toBe("Oi aluno(a)");
  });
});
