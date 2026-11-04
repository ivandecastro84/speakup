import pg from "pg";

/** Conexão privilegiada, usada SOMENTE para preparar dados de teste. */
export function conexaoAdmin() {
  return new pg.Client({ connectionString: process.env.DATABASE_URL });
}

export const SENHA_ADM = "Senha-Forte-123!";

export async function semearK1(c: pg.Client) {
  await c.query(`
    truncate app.sessoes, app.unidade_usuario, app.usuarios_adm, app.alunos, app.unidades cascade;
    insert into app.unidades (nome) values ('Unidade Centro'), ('Unidade Norte');
    insert into app.alunos (id_aluno, nome, email, unidade, status_matricula, data_cancelamento) values
      ('A001', 'Ana Souza', 'ana@exemplo.com', 'Unidade Centro', 'Ativa', null),
      ('A002', 'Bruno Lima', 'bruno@exemplo.com', 'Unidade Norte', 'Ativa', null),
      ('A003', 'Carla Dias', 'carla@exemplo.com', 'Unidade Centro', 'Cancelada', '2026-06-30');
  `);
  await c.query(
    `insert into app.usuarios_adm (email, nome, senha_hash, papel) values
       ('super@speakup.test', 'Super Admin', extensions.crypt($1, extensions.gen_salt('bf', 4)), 'ADM_SUPERADMIN'),
       ('coord@speakup.test', 'Coord Centro', extensions.crypt($1, extensions.gen_salt('bf', 4)), 'ADM_COORDENACAO'),
       ('rh@speakup.test', 'RH Centro', extensions.crypt($1, extensions.gen_salt('bf', 4)), 'ADM_RH'),
       ('semvinculo@speakup.test', 'Sem Vínculo', extensions.crypt($1, extensions.gen_salt('bf', 4)), 'ADM_COORDENACAO')`,
    [SENHA_ADM],
  );
  await c.query(`
    insert into app.unidade_usuario (usuario_id, unidade_id)
    select u.id, un.id from app.usuarios_adm u, app.unidades un
     where (u.email = 'coord@speakup.test' or u.email = 'rh@speakup.test') and un.nome = 'Unidade Centro';
  `);
}
