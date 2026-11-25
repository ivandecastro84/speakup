import { existsSync, readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emLotes, validarChurn } from "@/lib/churn/validar";
import { lerXlsxLeve, lerPlanilhaChurn } from "@/lib/churn/xlsx-leve";
import { lerPlanilha } from "@/lib/importacao/ler";
import { rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

async function xlsx(linhas: unknown[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Previsao_Churn");
  linhas.forEach((l) => ws.addRow(l));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("Previsão de churn · validação da planilha", () => {
  it("conta total, válidas e problemas por motivo; prévia com as 10 primeiras", async () => {
    const p = validarChurn(
      await lerPlanilha(
        await xlsx([
          ["id_aluno", "probabilidade_churn"],
          [1, 2.4], [2, "5,6"], [null, 10], [4, "alto"], [5, 120], [6, -1], ["x7", 3], [8, null],
          [9, 0], [10, 100], [11, 50], [1, 9.9],
        ]),
        "xlsx",
      ),
    );
    expect(p).toMatchObject({ total: 12, validas: 5, comProblema: 7 });
    expect(p.porMotivo).toEqual({
      "ID vazio": 1, "Probabilidade não numérica": 1, "Probabilidade fora de 0 a 100": 2, "ID inválido": 1,
      "Probabilidade vazia": 1, "ID repetido no arquivo": 1,
    });
    expect(p.primeiras).toHaveLength(10);
    expect(p.primeiras[0]).toEqual({ linha: 2, id_aluno: "1", probabilidade_churn: "2.4", problema: "ID repetido no arquivo" });
    // repetido: vale a última ocorrência; vírgula decimal aceita
    expect(p.gravar).toContainEqual({ id_aluno: 1, probabilidade_churn: 9.9 });
    expect(p.gravar).toContainEqual({ id_aluno: 2, probabilidade_churn: 5.6 });
  });

  it("leitor simples lê o mesmo que o exceljs numa planilha comum", async () => {
    const b = await xlsx([["id_aluno", "probabilidade_churn"], [1, 2.4], [2, "texto & <x>"], [null, 7]]);
    const a = await lerPlanilha(b, "xlsx");
    const l = await lerXlsxLeve(b);
    expect(l.cabecalho).toEqual(a.cabecalho);
    expect(l.linhas.map((x) => x.valores)).toEqual(a.linhas.map((x) => x.valores));
  });

  it("recusa planilha sem as colunas obrigatórias", async () => {
    const pl = await lerPlanilha(await xlsx([["aluno", "churn"], [1, 2]]), "xlsx");
    expect(() => validarChurn(pl)).toThrow(/id_aluno e probabilidade_churn/);
  });

  it.runIf(existsSync(process.env.CHURN_REAL ?? ""))("arquivo real: 13.000 linhas válidas em 26 lotes", async () => {
    const p = validarChurn(await lerPlanilhaChurn(new Uint8Array(readFileSync(process.env.CHURN_REAL!))));
    expect(p).toMatchObject({ total: 13000, validas: 13000, comProblema: 0 });
    expect(emLotes(p.gravar)).toHaveLength(26);
  });
});

describe("Previsão de churn · banco", () => {
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
    await db.query("truncate app.churn_previsao");
    await semearK1(db);
    await db.query(`insert into app.alunos (id_aluno, nome, email, unidade, status_matricula) values
      ('7', 'Sétimo Aluno', 's@x.com', 'Unidade Centro', 'Ativa')`);
    sup = (await rpc<{ token: string }>("adm_login", { p_email: "super@speakup.test", p_senha: SENHA_ADM })).token;
  });

  const lote = (linhas: [number | string, number | string][]) =>
    rpc<{ importadas: number; atualizadas: number; rejeitadas: number }>("adm_churn_gravar_lote", {
      p_token: sup, p_linhas: linhas.map(([i, p]) => ({ id_aluno: String(i), probabilidade_churn: String(p) })),
    });

  it("só o superadmin acessa (coordenação e RH recebem 403)", async () => {
    for (const email of ["coord@speakup.test", "rh@speakup.test"]) {
      const t = (await rpc<{ token: string }>("adm_login", { p_email: email, p_senha: SENHA_ADM })).token;
      await expect(rpc("adm_churn_consultar", { p_token: t })).rejects.toMatchObject({ status: 403 });
      await expect(rpc("adm_churn_gravar_lote", { p_token: t, p_linhas: [] })).rejects.toMatchObject({ status: 403 });
    }
  });

  it("upsert: novo conta como importada, existente como atualizada (sem duplicar); revalida no banco", async () => {
    expect(await lote([[1, 10], [2, 20.5], [7, 85]])).toEqual({ importadas: 3, atualizadas: 0, rejeitadas: 0 });
    expect(await lote([[2, 30], [3, 40], [0, 5], [4, 101]])).toEqual({ importadas: 1, atualizadas: 1, rejeitadas: 2 });
    const r = (await db.query("select id_aluno::int, probabilidade_churn::float p from app.churn_previsao order by 1")).rows;
    expect(r).toEqual([{ id_aluno: 1, p: 10 }, { id_aluno: 2, p: 30 }, { id_aluno: 3, p: 40 }, { id_aluno: 7, p: 85 }]);
    await expect(lote(Array.from({ length: 501 }, (_, i) => [i + 1, 1] as [number, number]))).rejects.toMatchObject({ status: 400 });
  });

  it("faixas (divisa vai para cima, 100 em 80–100), nome quando existe, busca e ordem do maior risco", async () => {
    await lote([[1, 0], [2, 19.99], [3, 20], [4, 59], [5, 60], [6, 80], [7, 100], [8, 40]]);
    const c = await rpc<{ faixas: { faixa: number; alunos: number }[]; total_geral: number; no_cadastro: number; itens: { id_aluno: number; nome: string | null; probabilidade_churn: number }[] }>(
      "adm_churn_consultar", { p_token: sup });
    expect(c.faixas.map((f) => Number(f.alunos))).toEqual([2, 1, 2, 1, 2]);
    expect(c).toMatchObject({ total_geral: 8, no_cadastro: 1 });
    expect(c.itens.map((i) => i.id_aluno)).toEqual([7, 6, 5, 4, 8, 3, 2, 1]);
    expect(c.itens[0]).toMatchObject({ nome: "Sétimo Aluno" });
    expect(c.itens[1].nome).toBeNull();
    const porNome = await rpc<{ itens: { id_aluno: number }[] }>("adm_churn_consultar", { p_token: sup, p_busca: "setimo" });
    expect(porNome.itens.map((i) => i.id_aluno)).toEqual([7]);
    const porId = await rpc<{ itens: { id_aluno: number }[] }>("adm_churn_consultar", { p_token: sup, p_busca: "4" });
    expect(porId.itens.map((i) => i.id_aluno)).toEqual([4]);
    const faixa = await rpc<{ total: number }>("adm_churn_consultar", { p_token: sup, p_faixa: 4 });
    expect(faixa.total).toBe(2);
  });

  it("13.000 linhas em 26 lotes de 500 e reimportação atualiza tudo", async () => {
    const linhas = Array.from({ length: 13000 }, (_, i) => [i + 1, (i % 1000) / 10] as [number, number]);
    const t0 = Date.now();
    let tot = { importadas: 0, atualizadas: 0, rejeitadas: 0 };
    for (const l of emLotes(linhas)) {
      const r = await lote(l);
      tot = { importadas: tot.importadas + r.importadas, atualizadas: tot.atualizadas + r.atualizadas, rejeitadas: tot.rejeitadas + r.rejeitadas };
    }
    expect(tot).toEqual({ importadas: 13000, atualizadas: 0, rejeitadas: 0 });
    expect(Date.now() - t0).toBeLessThan(15000);
    const r2 = await lote(linhas.slice(0, 500));
    expect(r2).toEqual({ importadas: 0, atualizadas: 500, rejeitadas: 0 });
    expect((await db.query("select count(*)::int n from app.churn_previsao")).rows[0].n).toBe(13000);
  }, 30000);
});
