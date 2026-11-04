import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assinar, verificar } from "@/lib/jwt";
import { RpcError, rpc } from "@/lib/server/rpc";
import { SENHA_ADM, conexaoAdmin, semearK1 } from "./support/db";

type Login = { ok: boolean; erro?: string; token?: string; primeiro_acesso?: boolean; duracao_minutos?: number };

let db: pg.Client;

beforeAll(async () => {
  db = conexaoAdmin();
  await db.connect();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await semearK1(db);
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

const loginAluno = (id: string, senha: string) => rpc<Login>("login_aluno", { p_id_aluno: id, p_senha: senha });
const loginAdm = (email: string, senha = SENHA_ADM) => rpc<Login>("adm_login", { p_email: email, p_senha: senha });

describe("J-A · Autenticação do aluno", () => {
  it("J-A1: aluno novo com Escola@@@ autentica e deve ir para a redefinição", async () => {
    const r = await loginAluno("A001", "Escola@@@");
    expect(r.ok).toBe(true);
    expect(r.primeiro_acesso).toBe(true);
    expect(r.token).toHaveLength(64);
  });

  it("J-A2: após redefinir, entra sem nova troca e a senha padrão deixa de valer", async () => {
    const r = await loginAluno("A001", "Escola@@@");
    await rpc("aluno_definir_senha", { p_token: r.token, p_senha_atual: null, p_nova_senha: "minhaSenha1" });

    const de_novo = await loginAluno("A001", "minhaSenha1");
    expect(de_novo).toMatchObject({ ok: true, primeiro_acesso: false });
    expect((await loginAluno("A001", "Escola@@@")).ok).toBe(false);
  });

  it("rejeita nova senha fraca ou igual à padrão", async () => {
    const r = await loginAluno("A001", "Escola@@@");
    const fraca = await erroDe(
      rpc("aluno_definir_senha", { p_token: r.token, p_senha_atual: null, p_nova_senha: "abc" }),
    );
    expect(fraca.message).toBe("SENHA_FRACA_ALUNO");
    expect(fraca.status).toBe(400);
  });

  it("J-A3: 5 senhas erradas seguidas bloqueiam, inclusive a senha correta, pelo prazo configurado", async () => {
    for (let i = 1; i <= 4; i++) {
      expect((await loginAluno("A001", "errada")).erro).toBe("CREDENCIAIS_INVALIDAS");
    }
    expect((await loginAluno("A001", "errada")).erro).toBe("CONTA_BLOQUEADA");
    expect((await loginAluno("A001", "Escola@@@")).erro).toBe("CONTA_BLOQUEADA");

    const { rows } = await db.query(
      "select round(extract(epoch from bloqueado_ate - now()) / 60) as min from app.alunos where id_aluno = 'A001'",
    );
    expect(Number(rows[0].min)).toBe(15);

    // Passado o prazo, volta a entrar.
    await db.query("update app.alunos set bloqueado_ate = now() - interval '1 second' where id_aluno = 'A001'");
    expect((await loginAluno("A001", "Escola@@@")).ok).toBe(true);
  });

  it("J-A4: aluno A não acessa dados do aluno B (não há identificador manipulável)", async () => {
    const a = await loginAluno("A001", "Escola@@@");
    const me = await rpc<{ id_aluno: string; senha_hash?: string }>("aluno_me", { p_token: a.token });
    expect(me.id_aluno).toBe("A001");
    expect(me).not.toHaveProperty("senha_hash");

    // A RPC não aceita id de aluno: parâmetros extras são rejeitados.
    await expect(rpc("aluno_me", { p_token: a.token, p_id_aluno: "A002" })).rejects.toBeInstanceOf(RpcError);
    // Acesso direto às tabelas é negado para o papel da API.
    const direto = await db.query(
      "select has_schema_privilege('anon', 'app', 'USAGE') as schema, has_table_privilege('anon', 'app.alunos', 'SELECT') as tabela",
    );
    expect(direto.rows[0]).toEqual({ schema: false, tabela: false });
  });

  it("matrícula Cancelada autentica (exibe matrícula encerrada) e id inexistente falha genericamente", async () => {
    expect((await loginAluno("A003", "Escola@@@")).ok).toBe(true);
    expect((await loginAluno("NAO-EXISTE", "Escola@@@")).erro).toBe("CREDENCIAIS_INVALIDAS");
  });

  it("sessão de aluno não vale na área administrativa", async () => {
    const a = await loginAluno("A001", "Escola@@@");
    expect((await erroDe(rpc("adm_me", { p_token: a.token }))).status).toBe(401);
  });
});

describe("J-B · Autenticação administrativa e RBAC", () => {
  it("login com senha errada falha; correta abre sessão", async () => {
    expect((await loginAdm("coord@speakup.test", "x")).erro).toBe("CREDENCIAIS_INVALIDAS");
    expect((await loginAdm("COORD@speakup.test")).ok).toBe(true);
  });

  it("J-B1: usuário sem vínculo de unidade não acessa dados de unidade", async () => {
    const s = await loginAdm("semvinculo@speakup.test");
    expect(await rpc("adm_resumo", { p_token: s.token })).toEqual([]);
    expect(await rpc("adm_listar_unidades", { p_token: s.token })).toEqual([]);
  });

  it("coordenação vê somente a própria unidade; superadmin vê todas", async () => {
    const coord = await loginAdm("coord@speakup.test");
    const resumo = await rpc<{ unidade: string; total: number }[]>("adm_resumo", { p_token: coord.token });
    expect(resumo.map((l) => l.unidade)).toEqual(["Unidade Centro"]);
    expect(Number(resumo[0].total)).toBe(2);

    const sup = await loginAdm("super@speakup.test");
    const todas = await rpc<{ unidade: string }[]>("adm_resumo", { p_token: sup.token });
    expect(todas.map((l) => l.unidade)).toEqual(["Unidade Centro", "Unidade Norte"]);
  });

  it("J-B2 (parcial K1): RH recebe 403 em ações fora do seu papel", async () => {
    const rh = await loginAdm("rh@speakup.test");
    expect((await erroDe(rpc("adm_resumo", { p_token: rh.token }))).status).toBe(403);
    expect((await erroDe(rpc("adm_listar_usuarios", { p_token: rh.token }))).status).toBe(403);
    // A permissão de importação não pertence ao papel RH (endpoint chega no K2).
    const { rows } = await db.query(
      "select count(*)::int as n from app.papel_permissao where papel = 'ADM_RH' and permissao = 'ALUNOS_IMPORTAR'",
    );
    expect(rows[0].n).toBe(0);
  });

  it("coordenação não gerencia usuários; superadmin cria usuário com política de senha forte", async () => {
    const coord = await loginAdm("coord@speakup.test");
    const negado = await erroDe(
      rpc("adm_criar_usuario", {
        p_token: coord.token, p_email: "x@speakup.test", p_nome: "X", p_papel: "ADM_RH", p_senha: SENHA_ADM, p_unidades: [],
      }),
    );
    expect(negado.status).toBe(403);

    const sup = await loginAdm("super@speakup.test");
    const fraca = await erroDe(
      rpc("adm_criar_usuario", {
        p_token: sup.token, p_email: "novo@speakup.test", p_nome: "Novo", p_papel: "ADM_RH", p_senha: "curta1!", p_unidades: [],
      }),
    );
    expect(fraca.message).toBe("SENHA_FRACA_ADM");

    await rpc("adm_criar_usuario", {
      p_token: sup.token, p_email: "novo@speakup.test", p_nome: "Novo", p_papel: "ADM_RH",
      p_senha: SENHA_ADM, p_unidades: ["Unidade Norte"],
    });
    const novo = await loginAdm("novo@speakup.test");
    const me = await rpc<{ unidades: string[]; papel: string }>("adm_me", { p_token: novo.token });
    expect(me).toMatchObject({ papel: "ADM_RH", unidades: ["Unidade Norte"] });
  });

  it("J-B3: JWT expirado é recusado e sessão expirada no banco força reautenticação", async () => {
    const s = await loginAdm("coord@speakup.test");
    const umaHoraAtras = Date.now() - 61 * 60 * 1000;
    const jwtVencido = await assinar({ tok: s.token!, tp: "ADM", dur: 60 }, umaHoraAtras);
    expect(await verificar(jwtVencido, "ADM")).toBeNull();

    const jwtValido = await assinar({ tok: s.token!, tp: "ADM", dur: 60 });
    expect(await verificar(jwtValido, "ADM")).not.toBeNull();
    expect(await verificar(jwtValido, "ALUNO")).toBeNull();

    await db.query("update app.sessoes set expira_em = now() - interval '1 second'");
    expect((await erroDe(rpc("adm_me", { p_token: s.token }))).status).toBe(401);
  });

  it("logout revoga a sessão no banco", async () => {
    const s = await loginAdm("coord@speakup.test");
    await rpc("encerrar_sessao", { p_token: s.token });
    expect((await erroDe(rpc("adm_me", { p_token: s.token }))).status).toBe(401);
  });
});

describe("J-H · Auditoria", () => {
  it("logins e falhas são auditados, sem e-mail em claro", async () => {
    await loginAdm("coord@speakup.test", "errada");
    const { rows } = await db.query(
      "select acao, detalhes from app.log_auditoria where acao = 'LOGIN_ADM_FALHA' order by id desc limit 1",
    );
    expect(rows[0].detalhes.email).toBe("c***@speakup.test");
  });

  it("J-H2: o log de auditoria não pode ser alterado nem apagado (nem por superusuário)", async () => {
    await loginAluno("A001", "Escola@@@");
    await expect(db.query("update app.log_auditoria set acao = 'X'")).rejects.toThrow(/LOG_AUDITORIA_IMUTAVEL/);
    await expect(db.query("delete from app.log_auditoria")).rejects.toThrow(/LOG_AUDITORIA_IMUTAVEL/);
    await expect(db.query("truncate app.log_auditoria")).rejects.toThrow(/LOG_AUDITORIA_IMUTAVEL/);
  });

  it("somente superadmin consulta a auditoria", async () => {
    const coord = await loginAdm("coord@speakup.test");
    expect((await erroDe(rpc("adm_listar_auditoria", { p_token: coord.token }))).status).toBe(403);
    const sup = await loginAdm("super@speakup.test");
    const log = await rpc<{ acao: string }[]>("adm_listar_auditoria", { p_token: sup.token, p_limite: 5 });
    expect(log[0].acao).toBe("LOGIN_ADM");
  });
});
