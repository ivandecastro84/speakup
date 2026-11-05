import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { COLUNAS } from "@/lib/importacao/colunas";
import { gerarLogCsv, type EntradaLog } from "@/lib/importacao/log-csv";
import { ErroEntrada, importarArquivo } from "@/lib/server/importacao";
import { RpcError, rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";
import { aluno, csv, xlsx } from "./support/planilhas";

let db: pg.Client;

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query("truncate app.logs_importacao, app.importacoes_lote cascade");
  await semearK1(db);
});

async function token(email: string) {
  const r = await rpc<{ token: string }>("adm_login", { p_email: email, p_senha: SENHA_ADM });
  return r.token;
}

const coord = () => token("coord@speakup.test");
const sup = () => token("super@speakup.test");

async function contarAlunos(where = "true") {
  const { rows } = await db.query(`select count(*)::int n from app.alunos where ${where}`);
  return rows[0].n as number;
}

async function log(tok: string, id: string) {
  return rpc<EntradaLog[]>("adm_importacao_log", { p_token: tok, p_importacao_id: id });
}

describe("K2 · Importação em lote", () => {
  it("J-C1: .xlsx válido com 19 colunas processa e retorna totais corretos", async () => {
    const t = await coord();
    const bytes = await xlsx([aluno("N1"), aluno("N2"), aluno("A001", { nome: "Ana Souza Atualizada" })]);
    const lote = await importarArquivo(t, { nome: "alunos.xlsx", bytes });
    expect(lote).toMatchObject({ status: "CONCLUIDA", total_linhas: 3, processadas: 3, inseridos: 2, atualizados: 1, rejeitados: 0 });
    expect(await contarAlunos("id_aluno in ('N1','N2')")).toBe(2);
  });

  it("aceita .csv com ; ou , e normaliza valores (vírgula decimal, caixa de enumerações, UF)", async () => {
    const t = await coord();
    const linhas = [aluno("C1", { desconto_percentual: "12,5", "Valor Mensalidade": "399,90", turno: "noite", estado: "sp" })];
    for (const [nome, sep] of [["a.csv", ";"], ["b.csv", ","]] as const) {
      await db.query("delete from app.alunos where id_aluno = 'C1'");
      const lote = await importarArquivo(t, { nome, bytes: new TextEncoder().encode(csv(linhas, sep)) });
      expect(lote.inseridos).toBe(1);
    }
    const { rows } = await db.query(`select desconto_percentual, "Valor Mensalidade" v, turno, estado from app.alunos where id_aluno = 'C1'`);
    expect(rows[0]).toEqual({ desconto_percentual: "12.50", v: "399.90", turno: "Noite", estado: "SP" });
  });

  it("aceita CSV em Windows-1252 (Excel em português) sem corromper acentos", async () => {
    const t = await coord();
    const texto = csv([aluno("W1", { nome: "João Conceição", turno: "Manhã" })]);
    const latin1 = Uint8Array.from([...texto].map((c) => c.charCodeAt(0)));
    const lote = await importarArquivo(t, { nome: "excel.csv", bytes: latin1 });
    expect(lote.inseridos).toBe(1);
    const { rows } = await db.query("select nome, turno from app.alunos where id_aluno = 'W1'");
    expect(rows[0]).toEqual({ nome: "João Conceição", turno: "Manhã" });
  });

  it("J-C2: arquivo com 18 colunas é rejeitado antes de gravar, com log", async () => {
    const t = await coord();
    const cab = COLUNAS.filter((c) => c !== "turno");
    const antes = await contarAlunos();
    const lote = await importarArquivo(t, { nome: "18.xlsx", bytes: await xlsx([aluno("X1")], cab) });
    expect(lote.status).toBe("REJEITADA");
    expect(await contarAlunos()).toBe(antes);
    const entradas = await log(t, lote.id);
    expect(entradas.map((e) => e.motivo).join(" ")).toMatch(/18 coluna[\s\S]*Coluna obrigatória ausente: "turno"/);
  });

  it("cabeçalho fora da ordem oficial também é rejeitado", async () => {
    const t = await coord();
    const cab = [...COLUNAS];
    [cab[0], cab[1]] = [cab[1], cab[0]];
    const lote = await importarArquivo(t, { nome: "ordem.csv", bytes: new TextEncoder().encode(csv([aluno("X2")], ";", cab)) });
    expect(lote.status).toBe("REJEITADA");
    expect((await log(t, lote.id)).some((e) => /fora da ordem/.test(e.motivo))).toBe(true);
  });

  it("J-C3: id_aluno existente atualiza o registro, sem criar segundo", async () => {
    const t = await coord();
    await importarArquivo(t, { nome: "1.xlsx", bytes: await xlsx([aluno("D1", { nome: "Primeiro" })]) });
    const lote = await importarArquivo(t, { nome: "2.xlsx", bytes: await xlsx([aluno("D1", { nome: "Segundo" })]) });
    expect(lote).toMatchObject({ inseridos: 0, atualizados: 1 });
    const { rows } = await db.query("select nome from app.alunos where id_aluno = 'D1'");
    expect(rows).toEqual([{ nome: "Segundo" }]);
  });

  it("J-C4: linha sem email é rejeitada e aparece no log com linha e motivo; as demais são gravadas", async () => {
    const t = await coord();
    const bytes = await xlsx([aluno("E1"), aluno("E2", { email: "" }), aluno("E3", { status_matricula: "Ativo" })]);
    const lote = await importarArquivo(t, { nome: "erros.xlsx", bytes });
    expect(lote).toMatchObject({ status: "CONCLUIDA", inseridos: 1, rejeitados: 2 });
    const entradas = await log(t, lote.id);
    expect(entradas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ linha: 3, tipo: "ERRO", coluna: "email", motivo: 'Campo obrigatório "email" vazio.' }),
        expect.objectContaining({ linha: 4, tipo: "ERRO", coluna: "status_matricula" }),
      ]),
    );
    expect(await contarAlunos("id_aluno in ('E2','E3')")).toBe(0);

    // CSV do log: 19 colunas originais + motivo
    const csvLog = gerarLogCsv(entradas).replace(/^﻿/, "").split("\r\n");
    expect(csvLog[0]).toBe([...COLUNAS, "motivo"].join(";"));
    expect(csvLog[1].startsWith("E2;Aluno E2;;")).toBe(true);
    // motivo tem aspas, então o campo vem entre aspas com aspas duplicadas (RFC 4180)
    expect(csvLog[1]).toMatch(/;"Linha 3: Campo obrigatório ""email"" vazio\."$/);
  });

  it("valida tipos: datas reais, desconto 0–100, mensalidade >= 0, UF, id repetido no arquivo", async () => {
    const t = await coord();
    const bytes = await xlsx([
      aluno("T1", { data_nascimento: "2026-02-30" }),
      aluno("T2", { desconto_percentual: "150" }),
      aluno("T3", { "Valor Mensalidade": "-1" }),
      aluno("T4", { estado: "XX" }),
      aluno("T5", { email: "sem-arroba" }),
      aluno("T6"),
      aluno("T6", { nome: "Duplicado" }),
    ]);
    const lote = await importarArquivo(t, { nome: "tipos.xlsx", bytes });
    expect(lote).toMatchObject({ inseridos: 1, rejeitados: 6 });
    const motivos = (await log(t, lote.id)).map((e) => `${e.linha}:${e.coluna}`);
    expect(motivos).toEqual(
      expect.arrayContaining(["2:data_nascimento", "3:desconto_percentual", "4:Valor Mensalidade", "5:estado", "6:email", "8:id_aluno"]),
    );
  });

  it("aceita modalidade Híbrido (com ou sem acento) e calcula a idade pela data de nascimento", async () => {
    const t = await coord();
    const hoje = new Date();
    const ano = hoje.getUTCFullYear() - 20;
    // aniversário daqui a 2 dias: a planilha (que calcula só pelo ano) diria 20, o correto é 19
    const futuro = new Date(Date.UTC(ano, hoje.getUTCMonth(), hoje.getUTCDate() + 2)).toISOString().slice(0, 10);
    const bytes = await xlsx([aluno("HB1", { modalidade: "Hibrido", data_nascimento: futuro, idade: "20" })]);
    const lote = await importarArquivo(t, { nome: "hibrido.xlsx", bytes });
    expect(lote).toMatchObject({ inseridos: 1, rejeitados: 0, avisos: 0 });
    const { rows } = await db.query("select modalidade, idade from app.alunos where id_aluno = 'HB1'");
    expect(rows[0]).toEqual({ modalidade: "Híbrido", idade: 19 });
  });

  it("aceita reimportar o próprio log de erros (19 colunas + motivo)", async () => {
    const t = await coord();
    const lote = await importarArquivo(t, { nome: "x.xlsx", bytes: await xlsx([aluno("LG1", { modalidade: "Remoto" })]) });
    expect(lote.rejeitados).toBe(1);
    const csvLog = gerarLogCsv(await log(t, lote.id));
    const corrigido = csvLog.replace(";Remoto;", ";Online;");
    const de_novo = await importarArquivo(t, { nome: "log-corrigido.csv", bytes: new TextEncoder().encode(corrigido) });
    expect(de_novo).toMatchObject({ status: "CONCLUIDA", inseridos: 1, rejeitados: 0 });

    // outra coluna extra continua sendo rejeitada
    const extra = csvLog.replace(";motivo", ";observacao");
    const r = await importarArquivo(t, { nome: "extra.csv", bytes: new TextEncoder().encode(extra) });
    expect(r.status).toBe("REJEITADA");
  });

  it("avisos não bloqueantes: idade divergente e Cancelada sem data de cancelamento", async () => {
    const t = await coord();
    const bytes = await xlsx([
      aluno("V1", { data_nascimento: "2000-01-01", idade: "10" }),
      aluno("V2", { status_matricula: "Cancelada", data_cancelamento: "" }),
    ]);
    const lote = await importarArquivo(t, { nome: "avisos.xlsx", bytes }, {});
    expect(lote).toMatchObject({ inseridos: 2, rejeitados: 0, avisos: 2 });
    const entradas = await log(t, lote.id);
    expect(entradas.every((e) => e.tipo === "AVISO")).toBe(true);
  });

  it("escopo: coordenação não grava em unidade alheia nem inexistente; superadmin cria a unidade", async () => {
    const tc = await coord();
    const bytes = await xlsx([
      aluno("S1", { unidade: "Unidade Norte" }),
      aluno("S2", { unidade: "Unidade Nova" }),
      aluno("A002", { unidade: "Unidade Centro" }), // aluno existente da Unidade Norte
    ]);
    const lote = await importarArquivo(tc, { nome: "escopo.xlsx", bytes });
    expect(lote).toMatchObject({ inseridos: 0, atualizados: 0, rejeitados: 3 });
    const motivos = (await log(tc, lote.id)).map((e) => e.motivo).join(" | ");
    expect(motivos).toMatch(/fora do seu escopo/);
    expect(motivos).toMatch(/"Unidade Nova" não cadastrada/);
    const { rows } = await db.query("select unidade from app.alunos where id_aluno = 'A002'");
    expect(rows[0].unidade).toBe("Unidade Norte");

    const ts = await sup();
    const l2 = await importarArquivo(ts, { nome: "sup.xlsx", bytes: await xlsx([aluno("S2", { unidade: "Unidade Nova" })]) });
    expect(l2.inseridos).toBe(1);
    expect(await contarAlunos("unidade = 'Unidade Nova'")).toBe(1);
  });

  it("IMPORT_ATOMIC: qualquer linha inválida desfaz o lote inteiro", async () => {
    const t = await coord();
    const bytes = await xlsx([aluno("AT1"), aluno("AT2", { email: "" })]);
    const lote = await importarArquivo(t, { nome: "atomica.xlsx", bytes }, { atomica: true });
    expect(lote).toMatchObject({ status: "FALHOU", inseridos: 0, atualizados: 0, rejeitados: 1 });
    expect(await contarAlunos("id_aluno = 'AT1'")).toBe(0);

    const ok = await importarArquivo(t, { nome: "atomica-ok.xlsx", bytes: await xlsx([aluno("AT1")]) }, { atomica: true });
    expect(ok).toMatchObject({ status: "CONCLUIDA", inseridos: 1 });
  });

  it("rejeita extensão não suportada e arquivo corrompido", async () => {
    const t = await coord();
    await expect(importarArquivo(t, { nome: "alunos.xls", bytes: new Uint8Array([1]) })).rejects.toBeInstanceOf(ErroEntrada);
    const lote = await importarArquivo(t, { nome: "falso.xlsx", bytes: new TextEncoder().encode("não é zip") });
    expect(lote.status).toBe("REJEITADA");
  });

  it("J-C5: lote de 2.000 linhas conclui em menos de 15 s", async () => {
    const t = await coord();
    const linhas = Array.from({ length: 2000 }, (_, i) => aluno(`P${String(i).padStart(5, "0")}`));
    const bytes = await xlsx(linhas);
    const inicio = performance.now();
    const lote = await importarArquivo(t, { nome: "2000.xlsx", bytes });
    const ms = performance.now() - inicio;
    expect(lote).toMatchObject({ status: "CONCLUIDA", inseridos: 2000 });
    expect(ms).toBeLessThan(15_000);
    console.log(`J-C5: 2.000 linhas em ${(ms / 1000).toFixed(2)} s`);
  });

  it("acima do limite síncrono, o processamento segue em segundo plano e o status acompanha", async () => {
    const t = await coord();
    const linhas = Array.from({ length: 600 }, (_, i) => aluno(`B${i}`));
    let tarefa: (() => Promise<void>) | null = null;
    const lote = await importarArquivo(t, { nome: "grande.xlsx", bytes: await xlsx(linhas) }, { agendar: (f) => (tarefa = f) });
    expect(lote).toMatchObject({ status: "PROCESSANDO", processadas: 0, total_linhas: 600 });
    await tarefa!();
    const fim = await rpc<{ status: string; inseridos: number }>("adm_importacao_status", { p_token: t, p_importacao_id: lote.id });
    expect(fim).toMatchObject({ status: "CONCLUIDA", inseridos: 600 });
  });

  it("J-H1: importação gera auditoria com autor, arquivo, totais e checksum", async () => {
    const t = await coord();
    const lote = await importarArquivo(t, { nome: "auditada.xlsx", bytes: await xlsx([aluno("H1")]) });
    const { rows } = await db.query(
      "select ator_id, detalhes from app.log_auditoria where acao = 'IMPORTACAO_ALUNOS' and entidade_id = $1",
      [lote.id],
    );
    const { rows: u } = await db.query("select id::text from app.usuarios_adm where email = 'coord@speakup.test'");
    expect(rows[0].ator_id).toBe(u[0].id);
    expect(rows[0].detalhes).toMatchObject({ arquivo: "auditada.xlsx", total: 1, inseridos: 1, status: "CONCLUIDA" });
    expect(rows[0].detalhes.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("J-B2: ADM_RH recebe 403 ao tentar importar", async () => {
    const t = await token("rh@speakup.test");
    const erro = await importarArquivo(t, { nome: "rh.xlsx", bytes: await xlsx([aluno("R1")]) }).catch((e) => e);
    expect(erro).toBeInstanceOf(RpcError);
    expect((erro as RpcError).status).toBe(403);
    expect(await contarAlunos("id_aluno = 'R1'")).toBe(0);
  });

  it("um usuário não lê o lote de outro (exceto superadmin)", async () => {
    const tc = await coord();
    const lote = await importarArquivo(tc, { nome: "x.xlsx", bytes: await xlsx([aluno("L1")]) });
    const outro = await token("semvinculo@speakup.test");
    const erro = await rpc("adm_importacao_status", { p_token: outro, p_importacao_id: lote.id }).catch((e) => e);
    expect((erro as RpcError).status).toBe(404);
    const ts = await sup();
    expect(await rpc("adm_importacao_status", { p_token: ts, p_importacao_id: lote.id })).toMatchObject({ id: lote.id });
  });
});
