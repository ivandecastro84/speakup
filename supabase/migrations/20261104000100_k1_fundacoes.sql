-- K1 · Fundações: esquema privado, unidades, alunos (19 colunas oficiais),
-- usuários administrativos, RBAC, sessões, configuração e auditoria imutável.
-- Tabelas ficam no schema "app", que NÃO é exposto pela API. Todo acesso
-- externo acontece por funções RPC em "public" (ver migração seguinte).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
revoke all on schema app from public;

-- ---------------------------------------------------------------------------
-- Configuração parametrizável
-- ---------------------------------------------------------------------------
create table app.configuracao (
  chave       text primary key,
  valor       text not null,
  descricao   text
);

insert into app.configuracao (chave, valor, descricao) values
  ('senha_padrao_hash', extensions.crypt('Escola@@@', extensions.gen_salt('bf', 10)),
     'Hash bcrypt da senha inicial padrão dos alunos'),
  ('aluno_max_tentativas', '5', 'Falhas consecutivas antes do bloqueio temporário'),
  ('aluno_bloqueio_minutos', '15', '[DECISÃO PENDENTE] Duração do bloqueio temporário do aluno'),
  ('sessao_aluno_minutos', '120', 'Expiração (deslizante) da sessão do aluno'),
  ('sessao_adm_minutos', '60', 'Expiração (deslizante) da sessão administrativa');

create function app.cfg(p_chave text) returns text
language sql stable security definer set search_path = '' as $$
  select valor from app.configuracao where chave = p_chave
$$;

create function app.cfg_int(p_chave text) returns int
language sql stable security definer set search_path = '' as $$
  select valor::int from app.configuracao where chave = p_chave
$$;

-- ---------------------------------------------------------------------------
-- Unidades
-- ---------------------------------------------------------------------------
create table app.unidades (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique check (length(btrim(nome)) > 0),
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Aluno — exatamente as 19 colunas oficiais (nomes preservados) + controle
-- ---------------------------------------------------------------------------
create table app.alunos (
  id_aluno              text primary key check (length(btrim(id_aluno)) > 0),
  nome                  text not null check (length(btrim(nome)) > 0),
  email                 text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  data_nascimento       date,
  idade                 integer check (idade is null or idade between 0 and 130),
  genero                text,
  unidade               text not null references app.unidades (nome) on update cascade,
  cidade                text,
  estado                char(2) check (estado is null or estado ~ '^[A-Z]{2}$'),
  canal_aquisicao       text,
  nivel_curso           text,
  modalidade            text check (modalidade is null or modalidade in ('Presencial', 'Online')),
  turno                 text check (turno is null or turno in ('Manhã', 'Tarde', 'Noite')),
  plano                 text,
  desconto_percentual   numeric(5, 2) check (desconto_percentual is null or desconto_percentual between 0 and 100),
  data_matricula        date,
  status_matricula      text not null check (status_matricula in ('Ativa', 'Cancelada', 'Trancada', 'Concluída')),
  data_cancelamento     date,
  "Valor Mensalidade"   numeric(12, 2) check ("Valor Mensalidade" is null or "Valor Mensalidade" >= 0),
  -- controle (fora da planilha)
  senha_hash            text,                 -- null = senha padrão ainda vigente
  primeiro_acesso       boolean not null default true,
  tentativas_falhas     integer not null default 0,
  bloqueado_ate         timestamptz,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index alunos_unidade_idx on app.alunos (unidade);
create index alunos_status_idx on app.alunos (status_matricula);

-- ---------------------------------------------------------------------------
-- RBAC: papéis, permissões, usuários administrativos e vínculo com unidades
-- ---------------------------------------------------------------------------
create table app.papeis (
  codigo     text primary key,
  descricao  text not null
);

create table app.permissoes (
  codigo     text primary key,
  descricao  text not null
);

create table app.papel_permissao (
  papel      text not null references app.papeis (codigo) on delete cascade,
  permissao  text not null references app.permissoes (codigo) on delete cascade,
  primary key (papel, permissao)
);

insert into app.papeis (codigo, descricao) values
  ('ADM_SUPERADMIN', 'Todas as unidades e gestão de usuários administrativos'),
  ('ADM_COORDENACAO', 'Acesso total às unidades vinculadas'),
  ('ADM_RH', '[DECISÃO PENDENTE] Leitura de frequência, notas e elegibilidade das unidades vinculadas');

insert into app.permissoes (codigo, descricao) values
  ('TODAS_UNIDADES', 'Escopo em todas as unidades'),
  ('USUARIOS_GERENCIAR', 'Criar e listar usuários administrativos'),
  ('UNIDADES_GERENCIAR', 'Cadastrar unidades'),
  ('AUDITORIA_LER', 'Consultar log de auditoria'),
  ('ALUNOS_LER', 'Consultar alunos das unidades do escopo'),
  ('ALUNOS_IMPORTAR', 'Importar alunos em lote'),
  ('ALUNOS_EDITAR', 'Editar alunos'),
  ('GRADE_EDITAR', 'Gerenciar turmas, professores e grade'),
  ('RELATORIOS_LER', 'Consultar relatórios de frequência, notas e elegibilidade');

insert into app.papel_permissao (papel, permissao)
select 'ADM_SUPERADMIN', codigo from app.permissoes;

insert into app.papel_permissao (papel, permissao) values
  ('ADM_COORDENACAO', 'ALUNOS_LER'),
  ('ADM_COORDENACAO', 'ALUNOS_IMPORTAR'),
  ('ADM_COORDENACAO', 'ALUNOS_EDITAR'),
  ('ADM_COORDENACAO', 'GRADE_EDITAR'),
  ('ADM_COORDENACAO', 'RELATORIOS_LER'),
  ('ADM_RH', 'RELATORIOS_LER');

create table app.usuarios_adm (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nome        text not null check (length(btrim(nome)) > 0),
  senha_hash  text not null,
  papel       text not null references app.papeis (codigo),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create unique index usuarios_adm_email_uidx on app.usuarios_adm (lower(email));

create table app.unidade_usuario (
  usuario_id  uuid not null references app.usuarios_adm (id) on delete cascade,
  unidade_id  uuid not null references app.unidades (id) on delete cascade,
  primary key (usuario_id, unidade_id)
);

-- ---------------------------------------------------------------------------
-- Sessões (token opaco; somente o hash SHA-256 é armazenado)
-- ---------------------------------------------------------------------------
create table app.sessoes (
  id             uuid primary key default gen_random_uuid(),
  token_hash     text not null unique,
  tipo           text not null check (tipo in ('ALUNO', 'ADM')),
  id_aluno       text references app.alunos (id_aluno) on delete cascade,
  usuario_id     uuid references app.usuarios_adm (id) on delete cascade,
  ip             text,
  criado_em      timestamptz not null default now(),
  ultimo_uso_em  timestamptz not null default now(),
  expira_em      timestamptz not null,
  revogada_em    timestamptz,
  check ((tipo = 'ALUNO' and id_aluno is not null and usuario_id is null)
      or (tipo = 'ADM' and usuario_id is not null and id_aluno is null))
);

-- ---------------------------------------------------------------------------
-- Log de auditoria append-only
-- ---------------------------------------------------------------------------
create table app.log_auditoria (
  id           bigint generated always as identity primary key,
  ocorrido_em  timestamptz not null default now(),
  ator_tipo    text not null check (ator_tipo in ('ALUNO', 'ADM', 'SISTEMA', 'ANONIMO')),
  ator_id      text,
  acao         text not null,
  entidade     text,
  entidade_id  text,
  ip           text,
  detalhes     jsonb not null default '{}'::jsonb
);

create index log_auditoria_ocorrido_idx on app.log_auditoria (ocorrido_em desc);

create function app.bloquear_alteracao_auditoria() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'LOG_AUDITORIA_IMUTAVEL' using errcode = 'PT403';
end $$;

create trigger log_auditoria_imutavel
  before update or delete on app.log_auditoria
  for each row execute function app.bloquear_alteracao_auditoria();

create trigger log_auditoria_sem_truncate
  before truncate on app.log_auditoria
  for each statement execute function app.bloquear_alteracao_auditoria();

-- Nenhum acesso direto às tabelas para os papéis da API.
revoke all on all tables in schema app from public;
revoke all on all functions in schema app from public;
