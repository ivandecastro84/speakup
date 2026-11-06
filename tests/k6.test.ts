import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RpcError, rpc } from "@/lib/server/rpc";
import { type Adaptadores, processarFila } from "@/lib/integracoes/fila";
import { CalendarioStub, EmailStub, PushStub } from "@/lib/integracoes/adaptadores";
import type { MensagemEmail } from "@/lib/integracoes/modelos";
import { gerarIcs } from "@/lib/integracoes/ics";
import type { DadosAula } from "@/lib/integracoes/tipos";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

let db: pg.Client;
let coord: string;
let turmaA: string;
let turmaB: string;

const TODOS = (hora: number) => [1, 2, 3, 4, 5, 6].map((dia) => ({ dia, hora }));

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows as T[];
}

async function diaUtil(sentido: "passado" | "futuro"): Promise<string> {
  const [r] = await q<{ d: string }>(
    `select to_char(d::date, 'YYYY-MM-DD') d from generate_series(
        case when $1 = 'passado' then app.hoje() - 1 else app.hoje() + 1 end,
        case when $1 = 'passado' then app.hoje() - 8 else app.hoje() + 8 end,
        case when $1 = 'passado' then interval '-1 day' else interval '1 day' end) d
      where app.dia_semana(d::date) <= 6 limit 1`,
    [sentido],
  );
  return r.d;
}

async function professor(nome: string, horarios: { dia: number; hora: number }[]) {
  const { id } = await rpc<{ id: string }>("adm_salvar_professor", {
    p_token: coord, p_id: null, p_nome: nome, p_email: `${nome.toLowerCase().replace(/\W/g, "")}@speakup.test`,
    p_telefone: null, p_idiomas: ["Inglês"], p_niveis: ["Regular"], p_unidades: ["Unidade Centro"], p_ativo: true,
  });
  await rpc("adm_salvar_disponibilidade", { p_token: coord, p_professor_id: id, p_horarios: horarios });
  return id;
}

async function turma(codigo: string, prof: string, horarios: { dia: number; hora: number }[]) {
  const [{ ini, fim }] = await q<{ ini: string; fim: string }>(
    "select to_char(app.hoje() - 40, 'YYYY-MM-DD') ini, to_char(app.hoje() + 60, 'YYYY-MM-DD') fim",
  );
  const { id } = await rpc<{ id: string }>("adm_salvar_turma", {
    p_token: coord, p_id: null,
    p_dados: { codigo, nome: codigo, unidade: "Unidade Centro", idioma: "Inglês", nivel_curso: "Regular", modalidade: "Online",
               professor_id: prof, sala_id: null, capacidade: 10, data_inicio: ini, data_fim: fim, situacao: "Ativa" },
    p_horarios: horarios,
  });
  return id;
}

/** Aluno A001 com 1 crédito, logado; devolve o token. */
async function alunoComCredito() {
  await rpc("adm_registrar_chamada", {
    p_token: coord, p_turma_id: turmaA, p_data: await diaUtil("passado"), p_hora: 8,
    p_registros: [{ id_aluno: "A001", situacao: "Falta" }],
  });
  await db.query("update app.alunos set primeiro_acesso = false where id_aluno = 'A001'");
  return (await rpc<{ token: string }>("login_aluno", { p_id_aluno: "A001", p_senha: "Escola@@@" })).token;
}

async function agendar(tok: string) {
  return rpc<{ reposicao_id: string }>("aluno_agendar_reposicao", {
    p_token: tok, p_data: await diaUtil("futuro"), p_hora: 20, p_tipo: "TURMA", p_turma_id: turmaB,
  });
}

/** Adaptadores de teste: capturam o que seria enviado. */
function adaptadoresTeste(opcoes: { calendarioFalha?: boolean } = {}) {
  const emails: MensagemEmail[] = [];
  const calendario: string[] = [];
  const push: string[] = [];
  class Cal extends CalendarioStub {
    async criar(d: DadosAula) {
      if (opcoes.calendarioFalha) throw new Error("API de calendário indisponível");
      calendario.push(`${this.provedor}:CRIAR`);
      return super.criar(d);
    }
    async cancelar(d: DadosAula, id: string | null) {
      if (opcoes.calendarioFalha) throw new Error("API de calendário indisponível");
      calendario.push(`${this.provedor}:CANCELAR:${id}`);
    }
  }
  const ad: Adaptadores = {
    email: new (class extends EmailStub {
      async enviar(m: MensagemEmail) {
        emails.push(m);
        return super.enviar(m);
      }
    })(),
    push: new (class extends PushStub {
      async enviar(i: { endpoint: string }[], p: { titulo: string; corpo: string; url: string }) {
        push.push(`${i.length}:${p.titulo}`);
        return { invalidos: [] };
      }
    })(),
    calendario: { GOOGLE: new Cal("GOOGLE"), OUTLOOK: new Cal("OUTLOOK") },
  };
  return { ad, emails, calendario, push };
}

beforeEach(async () => {
  await db.query(
    `truncate app.notificacoes, app.eventos_calendario, app.push_inscricoes,
              app.reposicoes, app.aulas_avulsas, app.creditos_reposicao, app.presencas, app.matricula_turma, app.turma_horarios,
              app.turmas, app.salas, app.disponibilidade_professor, app.professor_unidade, app.professores cascade`,
  );
  await semearK1(db);
  await db.query(`update app.alunos set modalidade = 'Online' where id_aluno = 'A001'`);
  coord = (await rpc<{ token: string }>("adm_login", { p_email: "coord@speakup.test", p_senha: SENHA_ADM })).token;
  turmaA = await turma("TA", await professor("Prof A", TODOS(8)), TODOS(8));
  turmaB = await turma("TB", await professor("Prof B", TODOS(20)), TODOS(20));
  await rpc("adm_turma_incluir_aluno", { p_token: coord, p_turma_id: turmaA, p_id_aluno: "A001" });
});

describe("K6 · Calendário e notificações", () => {
  it("J-G1: reserva confirmada gera .ics válido", async () => {
    const tok = await alunoComCredito();
    const { reposicao_id } = await agendar(tok);
    const d = await rpc<DadosAula>("aluno_convite_reposicao", { p_token: tok, p_reposicao_id: reposicao_id });
    const ics = gerarIcs(d, "REQUEST", new Date("2026-11-05T12:00:00Z"));

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const campo of ["VERSION:2.0", "PRODID:", "METHOD:REQUEST", "BEGIN:VEVENT", "END:VEVENT", `UID:reposicao-${reposicao_id}@speakup-idiomas`, "DTSTAMP:20261105T120000Z"]) {
      expect(ics).toContain(campo);
    }
    // 20h em São Paulo (UTC-3) = 23h UTC; duração padrão 60 min.
    const ini = d.data.replace(/-/g, "");
    expect(ics).toContain(`DTSTART:${ini}T230000Z`);
    expect(ics).toMatch(/DTEND:\d{8}T000000Z/);
    expect(ics.replace(/\r\n /g, "")).toContain("RSVP=FALSE:mailto:ana@exemplo.com");
    // Toda linha ≤ 75 octetos e terminada em CRLF.
    for (const linha of ics.split("\r\n")) expect(Buffer.byteLength(linha)).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");

    // Outro aluno não obtém o convite.
    await db.query("update app.alunos set primeiro_acesso = false where id_aluno = 'A002'");
    const outro = (await rpc<{ token: string }>("login_aluno", { p_id_aluno: "A002", p_senha: "Escola@@@" })).token;
    await expect(rpc("aluno_convite_reposicao", { p_token: outro, p_reposicao_id: reposicao_id })).rejects.toMatchObject({ status: 404 });
  });

  it("J-G3: convite é enviado ao e-mail do aluno, com o .ics anexado", async () => {
    const tok = await alunoComCredito();
    await agendar(tok);
    const t = adaptadoresTeste();
    const r = await processarFila(tok, t.ad);
    expect(r).toMatchObject({ processados: 3, enviados: 3, falhas: 0 }); // e-mail + Google + Outlook (sem push ativo)
    expect(t.emails).toHaveLength(1);
    expect(t.emails[0].para).toBe("ana@exemplo.com");
    expect(t.emails[0].assunto).toMatch(/^Reposição confirmada/);
    expect(t.emails[0].anexo?.conteudo).toContain("METHOD:REQUEST");
    expect(t.calendario.sort()).toEqual(["GOOGLE:CRIAR", "OUTLOOK:CRIAR"]);

    const [n] = await q<{ status: string; provedor: string; destino: string }>("select status, provedor, destino from app.notificacoes");
    expect(n).toEqual({ status: "Enviado", provedor: "stub", destino: "ana@exemplo.com" });
  });

  it("J-G2: falha da API de calendário mantém a reserva e enfileira retentativa com backoff", async () => {
    const tok = await alunoComCredito();
    const { reposicao_id } = await agendar(tok);
    const t = adaptadoresTeste({ calendarioFalha: true });

    const r1 = await processarFila(tok, t.ad);
    expect(r1).toMatchObject({ enviados: 1, falhas: 2 }); // e-mail sai; calendário falha
    const [rep] = await q<{ status: string }>("select status from app.reposicoes where id = $1", [reposicao_id]);
    expect(rep.status).toBe("Agendada");
    let ev = await q<{ status: string; tentativas: number; ultimo_erro: string; atraso: number }>(
      "select status, tentativas, ultimo_erro, extract(epoch from proxima_tentativa - now())::int atraso from app.eventos_calendario",
    );
    expect(ev.every((e) => e.status === "Pendente" && e.tentativas === 1 && e.ultimo_erro.includes("indisponível"))).toBe(true);
    expect(ev.every((e) => e.atraso >= 50 && e.atraso <= 60)).toBe(true); // backoff de 1 min

    // Antes do backoff vencer, nada é reprocessado.
    expect((await processarFila(tok, t.ad)).processados).toBe(0);

    // 2ª e 3ª tentativas (simula o tempo passando) → Falha, disponível para reprocessamento.
    for (let i = 0; i < 2; i++) {
      await db.query("update app.eventos_calendario set proxima_tentativa = now() - interval '1 second'");
      await processarFila(tok, t.ad);
    }
    ev = await q("select status, tentativas from app.eventos_calendario");
    expect(ev).toEqual([{ status: "Falha", tentativas: 3 }, { status: "Falha", tentativas: 3 }]);
    expect((await q<{ status: string }>("select status from app.reposicoes where id = $1", [reposicao_id]))[0].status).toBe("Agendada");

    // Coordenação reprocessa; API volta → enviado.
    const rp = await rpc<{ calendario: number }>("adm_reprocessar_integracoes", { p_token: coord, p_fila: null, p_id: null });
    expect(rp.calendario).toBe(2);
    const ok = adaptadoresTeste();
    expect((await processarFila(coord, ok.ad)).enviados).toBe(2);
    expect(await q("select distinct status from app.eventos_calendario")).toEqual([{ status: "Enviado" }]);
  });

  it("cancelamento envia e-mail de cancelamento e cancela o evento já criado no provedor", async () => {
    const tok = await alunoComCredito();
    const { reposicao_id } = await agendar(tok);
    const t = adaptadoresTeste();
    await processarFila(tok, t.ad);
    const [{ id_externo }] = await q<{ id_externo: string }>("select id_externo from app.eventos_calendario where provedor = 'GOOGLE'");

    await rpc("aluno_cancelar_reposicao", { p_token: tok, p_reposicao_id: reposicao_id });
    await processarFila(tok, t.ad);
    expect(t.emails.map((e) => e.assunto.split(":")[0])).toEqual(["Reposição confirmada", "Reposição cancelada"]);
    expect(t.emails[1].anexo?.conteudo).toContain("METHOD:CANCEL");
    expect(t.emails[1].texto).toContain("O crédito de reposição voltou");
    expect(t.calendario).toContain(`GOOGLE:CANCELAR:${id_externo}`);
  });

  it("cancelamento antes do envio descarta o evento pendente em vez de criar e cancelar", async () => {
    const tok = await alunoComCredito();
    const { reposicao_id } = await agendar(tok);
    await rpc("aluno_cancelar_reposicao", { p_token: tok, p_reposicao_id: reposicao_id });
    const ev = await q<{ acao: string; status: string }>("select acao, status from app.eventos_calendario order by provedor");
    expect(ev).toEqual([{ acao: "CRIAR", status: "Descartado" }, { acao: "CRIAR", status: "Descartado" }]);
  });

  it("Web Push: só enfileira com inscrição ativa; aluno só processa a própria fila", async () => {
    const tok = await alunoComCredito();
    await rpc("aluno_push_inscrever", { p_token: tok, p_endpoint: "https://push.exemplo.com/abc", p_chave: "k", p_auth: "a" });
    await expect(
      rpc("aluno_push_inscrever", { p_token: tok, p_endpoint: "http://inseguro", p_chave: "k", p_auth: "a" }),
    ).rejects.toMatchObject({ status: 400 });
    await agendar(tok);

    // Outro aluno não processa (nem enxerga) os itens da Ana.
    await db.query("update app.alunos set primeiro_acesso = false where id_aluno = 'A002'");
    const outro = (await rpc<{ token: string }>("login_aluno", { p_id_aluno: "A002", p_senha: "Escola@@@" })).token;
    expect((await processarFila(outro, adaptadoresTeste().ad)).processados).toBe(0);

    const t = adaptadoresTeste();
    await processarFila(tok, t.ad);
    expect(t.push).toEqual(["1:Reposição confirmada"]);
  });

  it("painel: RH não acessa a fila; coordenação lista com e-mail mascarado", async () => {
    const tok = await alunoComCredito();
    await agendar(tok);
    const rh = (await rpc<{ token: string }>("adm_login", { p_email: "rh@speakup.test", p_senha: SENHA_ADM })).token;
    await expect(rpc("adm_listar_integracoes", { p_token: rh })).rejects.toMatchObject({ status: 403 });
    await expect(rpc("fila_reservar", { p_token: rh })).rejects.toBeInstanceOf(RpcError);

    const l = await rpc<{ total: number; resumo: { pendentes: number }; itens: { destino: string | null; tipo: string }[] }>(
      "adm_listar_integracoes", { p_token: coord },
    );
    expect(l.total).toBe(3);
    expect(l.resumo.pendentes).toBe(3);
    expect(l.itens.find((i) => i.tipo === "EMAIL")?.destino).toBe("a***@exemplo.com");
  });
});
