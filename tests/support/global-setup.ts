// Recria o banco de teste do zero a partir das migrações (garante que as
// migrações reproduzem o banco — critério da Definição de Pronto).
import { resetDatabase } from "../../scripts/db.mjs";

export default async function prepararBancoDeTeste() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://dev:dev@localhost:5432/speakup_test";
  await resetDatabase(url);
}
