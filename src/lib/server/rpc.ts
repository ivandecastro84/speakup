import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

/**
 * Adaptador único de acesso ao banco. Toda regra de negócio e de RBAC está
 * nas funções SQL (RPC); o servidor Next.js apenas as invoca.
 *  - Produção: Supabase via PostgREST (SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY).
 *  - Desenvolvimento/teste: Postgres direto (DATABASE_URL), executando como
 *    o papel "anon" para reproduzir exatamente as permissões da API.
 */
export class RpcError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

type Args = Record<string, unknown>;

const NOME_FUNCAO = /^[a-z_]+$/;
const NOME_PARAM = /^p_[a-z_]+$/;

function statusDe(code: string | undefined): number {
  if (code && /^PT\d{3}$/.test(code)) return Number(code.slice(2));
  return 500;
}

/**
 * Mesma semântica do PostgREST: objetos e listas de objetos vão como JSON;
 * listas de texto vão como array do Postgres (ex.: text[]).
 */
function paraPostgres(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.some((x) => x !== null && typeof x === "object") ? JSON.stringify(v) : v;
  if (typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

let pool: pg.Pool | null = null;
let supabase: SupabaseClient | null = null;

async function viaPostgres<T>(fn: string, args: Args): Promise<T> {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const chaves = Object.keys(args);
  const params = chaves.map((k, i) => {
    if (!NOME_PARAM.test(k)) throw new Error(`Parâmetro inválido: ${k}`);
    return `${k} => $${i + 1}`;
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role anon");
    const r = await client.query(
      `select public.${fn}(${params.join(", ")}) as r`,
      chaves.map((k) => paraPostgres(args[k])),
    );
    await client.query("commit");
    return r.rows[0].r as T;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    const err = e as { code?: string; message: string };
    throw new RpcError(err.code ?? "ERRO", err.message, statusDe(err.code));
  } finally {
    client.release();
  }
}

async function viaSupabase<T>(fn: string, args: Args): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY não configurados");
  supabase ??= createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new RpcError(error.code ?? "ERRO", error.message, statusDe(error.code));
  return data as T;
}

export async function rpc<T = unknown>(fn: string, args: Args = {}): Promise<T> {
  if (!NOME_FUNCAO.test(fn)) throw new Error(`Função inválida: ${fn}`);
  return process.env.DATABASE_URL ? viaPostgres<T>(fn, args) : viaSupabase<T>(fn, args);
}
