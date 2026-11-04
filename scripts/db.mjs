// Utilitário de banco LOCAL: recria o banco do zero e aplica bootstrap + migrações.
// Uso: node scripts/db.mjs reset [DATABASE_URL]
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export async function resetDatabase(url) {
  const alvo = new URL(url);
  const nome = alvo.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(nome)) throw new Error(`Nome de banco inválido: ${nome}`);
  if (!["localhost", "127.0.0.1"].includes(alvo.hostname)) {
    throw new Error("reset só é permitido em banco local");
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  await c.query(`drop database if exists ${nome} with (force)`);
  await c.query(`create database ${nome}`);
  await c.end();

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query(await readFile(path.join(raiz, "supabase/local/bootstrap.sql"), "utf8"));
  const dir = path.join(raiz, "supabase/migrations");
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of arquivos) {
    try {
      await db.query(await readFile(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`Falha na migração ${f}: ${e.message}`);
    }
  }
  await db.end();
  return arquivos;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [cmd, url = process.env.DATABASE_URL] = process.argv.slice(2);
  if (cmd !== "reset" || !url) {
    console.error("Uso: node scripts/db.mjs reset <DATABASE_URL>");
    process.exit(1);
  }
  const aplicadas = await resetDatabase(url);
  console.log(`Banco recriado. Migrações aplicadas: ${aplicadas.join(", ")}`);
}
