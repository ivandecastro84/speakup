// Dados de exemplo SOMENTE para o banco LOCAL de desenvolvimento.
// Uso: SEED_ADMIN_PASSWORD='...' node scripts/seed-dev.mjs [DATABASE_URL]
import pg from "pg";

const url = process.argv[2] ?? process.env.DATABASE_URL;
const senha = process.env.SEED_ADMIN_PASSWORD;
if (!url || !senha) {
  console.error("Defina DATABASE_URL e SEED_ADMIN_PASSWORD.");
  process.exit(1);
}
const { hostname } = new URL(url);
if (!["localhost", "127.0.0.1"].includes(hostname)) {
  console.error("seed-dev só roda em banco local.");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query(`
  insert into app.unidades (nome) values ('Unidade Paulista'), ('Unidade Pinheiros') on conflict do nothing;
  insert into app.alunos (id_aluno, nome, email, data_nascimento, idade, genero, unidade, cidade, estado,
    canal_aquisicao, nivel_curso, modalidade, turno, plano, desconto_percentual, data_matricula,
    status_matricula, data_cancelamento, "Valor Mensalidade") values
    ('2026001', 'Mariana Alves', 'mariana@exemplo.com', '1994-03-12', 32, 'F', 'Unidade Paulista', 'São Paulo', 'SP',
     'Corporativo', 'Business', 'Presencial', 'Noite', 'Anual', 15, '2026-02-01', 'Ativa', null, 489.90),
    ('2026002', 'Rafael Costa', 'rafael@exemplo.com', '2009-08-30', 17, 'M', 'Unidade Paulista', 'São Paulo', 'SP',
     'B2C', 'Teens', 'Online', 'Tarde', 'Semestral', 0, '2026-03-10', 'Ativa', null, 399.00),
    ('2026003', 'Juliana Prado', 'juliana@exemplo.com', '1988-11-05', 37, 'F', 'Unidade Pinheiros', 'São Paulo', 'SP',
     'Indicação', 'Regular', 'Presencial', 'Manhã', 'Anual', 10, '2025-08-15', 'Trancada', null, 429.00),
    ('2026004', 'Pedro Henrique', 'pedro@exemplo.com', '1990-01-20', 36, 'M', 'Unidade Pinheiros', 'São Paulo', 'SP',
     'Corporativo', 'Business', 'Online', 'Noite', 'Anual', 20, '2025-02-01', 'Cancelada', '2026-06-30', 489.90)
  on conflict (id_aluno) do nothing;
`);
await c.query(
  `insert into app.usuarios_adm (email, nome, senha_hash, papel) values
     ('admin@speakup.local', 'Administrador', extensions.crypt($1, extensions.gen_salt('bf', 10)), 'ADM_SUPERADMIN'),
     ('coordenacao@speakup.local', 'Coordenação Paulista', extensions.crypt($1, extensions.gen_salt('bf', 10)), 'ADM_COORDENACAO')
   on conflict do nothing`,
  [senha],
);
await c.query(`
  insert into app.unidade_usuario (usuario_id, unidade_id)
  select u.id, un.id from app.usuarios_adm u, app.unidades un
   where u.email = 'coordenacao@speakup.local' and un.nome = 'Unidade Paulista'
  on conflict do nothing;
`);
await c.end();
console.log("Seed local aplicado.");
