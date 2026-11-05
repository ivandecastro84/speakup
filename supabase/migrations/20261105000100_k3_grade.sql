-- K3 · Painel administrativo: alunos (CRUD/inativação/exportação), professores,
-- disponibilidade docente, salas, turmas, horários e matrícula em turma.
-- Regra de ouro: nenhuma combinação gravada pode gerar conflito de grade.
-- Toda escrita de grade passa por app.validar_turma() sob um lock global.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table app.professores (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(btrim(nome)) > 0),
  email          text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone       text,
  idiomas        text[] not null default '{}',
  niveis         text[] not null default '{}',
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create unique index professores_email_uidx on app.professores (lower(email));

create table app.professor_unidade (
  professor_id  uuid not null references app.professores (id) on delete cascade,
  unidade_id    uuid not null references app.unidades (id) on delete cascade,
  primary key (professor_id, unidade_id)
);

-- Dias: 1 = segunda … 6 = sábado. Horários fixos: 08h, 10h, 12h, 14h, 16h, 18h, 20h.
create table app.disponibilidade_professor (
  professor_id  uuid not null references app.professores (id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 1 and 6),
  hora          smallint not null check (hora in (8, 10, 12, 14, 16, 18, 20)),
  primary key (professor_id, dia_semana, hora)
);

create table app.salas (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references app.unidades (id),
  nome        text not null check (length(btrim(nome)) > 0),
  capacidade  integer not null check (capacidade between 1 and 500),
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now(),
  unique (unidade_id, nome)
);

create table app.turmas (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null check (length(btrim(codigo)) > 0),
  nome           text not null check (length(btrim(nome)) > 0),
  unidade_id     uuid not null references app.unidades (id),
  idioma         text not null check (length(btrim(idioma)) > 0),
  nivel_curso    text not null check (length(btrim(nivel_curso)) > 0),
  modalidade     text not null check (modalidade in ('Presencial', 'Online')),
  professor_id   uuid not null references app.professores (id),
  sala_id        uuid references app.salas (id),
  capacidade     integer not null check (capacidade between 1 and 500),
  data_inicio    date not null,
  data_fim       date not null,
  situacao       text not null default 'Ativa' check (situacao in ('Ativa', 'Encerrada')),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (data_fim >= data_inicio)
);
create unique index turmas_codigo_uidx on app.turmas (lower(codigo));

create table app.turma_horarios (
  turma_id    uuid not null references app.turmas (id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 1 and 6),
  hora        smallint not null check (hora in (8, 10, 12, 14, 16, 18, 20)),
  primary key (turma_id, dia_semana, hora)
);

create table app.matricula_turma (
  turma_id    uuid not null references app.turmas (id) on delete cascade,
  id_aluno    text not null references app.alunos (id_aluno) on update cascade,
  incluido_em timestamptz not null default now(),
  primary key (turma_id, id_aluno)
);
create index matricula_turma_aluno_idx on app.matricula_turma (id_aluno);

revoke all on app.professores, app.professor_unidade, app.disponibilidade_professor, app.salas,
  app.turmas, app.turma_horarios, app.matricula_turma from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create function app.nome_dia(p_dia smallint) returns text
language sql immutable set search_path = '' as $$
  select (array['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])[p_dia]
$$;

create function app.rotulo_horario(p_dia smallint, p_hora smallint) returns text
language sql immutable set search_path = '' as $$
  select app.nome_dia(p_dia) || ' ' || lpad(p_hora::text, 2, '0') || 'h'
$$;

-- Erros de regra com texto para o usuário: o servidor mostra o que vem após ':'.
create function app.conflito(p_texto text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'CONFLITO:%', p_texto using errcode = 'PT409';
end $$;

create function app.invalido(p_texto text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'INVALIDO:%', p_texto using errcode = 'PT400';
end $$;

create function app.lock_grade() returns void
language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtext('speakup_grade'))
$$;

create function app.unidade_id_no_escopo(p_usuario_id uuid, p_nome text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from app.unidades where nome = p_nome and nome in (select app.unidades_escopo(p_usuario_id));
  if v_id is null then
    perform app.invalido(format('Unidade "%s" inexistente ou fora do seu escopo.', coalesce(p_nome, '')));
  end if;
  return v_id;
end $$;

create function app.professor_no_escopo(p_usuario_id uuid, p_professor_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.professor_unidade pu join app.unidades un on un.id = pu.unidade_id
     where pu.professor_id = p_professor_id and un.nome in (select app.unidades_escopo(p_usuario_id))
  ) or (app.tem_permissao(p_usuario_id, 'TODAS_UNIDADES') and exists (select 1 from app.professores where id = p_professor_id))
$$;

create function app.turma_no_escopo(p_usuario_id uuid, p_turma_id uuid) returns app.turmas
language plpgsql stable security definer set search_path = '' as $$
declare
  t app.turmas;
begin
  select tu.* into t from app.turmas tu join app.unidades un on un.id = tu.unidade_id
   where tu.id = p_turma_id and un.nome in (select app.unidades_escopo(p_usuario_id));
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- Validação central de uma turma ativa (todas as regras de grade)
-- ---------------------------------------------------------------------------
create function app.validar_turma(p_turma_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t app.turmas;
  p app.professores;
  s app.salas;
  v_un text;
  v_inscritos int;
  r record;
begin
  select * into t from app.turmas where id = p_turma_id;
  if not found or t.situacao <> 'Ativa' then return; end if;
  select nome into v_un from app.unidades where id = t.unidade_id;

  if not exists (select 1 from app.turma_horarios where turma_id = t.id) then
    perform app.invalido(format('A turma %s precisa de pelo menos um horário.', t.codigo));
  end if;

  -- Professor
  select * into p from app.professores where id = t.professor_id;
  if not p.ativo then
    perform app.conflito(format('O professor %s está inativo e tem a turma ativa %s.', p.nome, t.codigo));
  end if;
  if not exists (select 1 from app.professor_unidade where professor_id = p.id and unidade_id = t.unidade_id) then
    perform app.conflito(format('O professor %s não atua na unidade %s (turma %s).', p.nome, v_un, t.codigo));
  end if;
  if not (t.idioma = any (p.idiomas)) then
    perform app.conflito(format('O professor %s não leciona %s (turma %s).', p.nome, t.idioma, t.codigo));
  end if;
  if not (t.nivel_curso = any (p.niveis)) then
    perform app.conflito(format('O professor %s não leciona o nível %s (turma %s).', p.nome, t.nivel_curso, t.codigo));
  end if;

  -- Sala
  if t.modalidade = 'Presencial' then
    if t.sala_id is null then
      perform app.invalido(format('A turma presencial %s precisa de uma sala.', t.codigo));
    end if;
    select * into s from app.salas where id = t.sala_id;
    if s.unidade_id <> t.unidade_id then
      perform app.invalido(format('A sala %s não pertence à unidade %s.', s.nome, v_un));
    end if;
    if not s.ativa then
      perform app.conflito(format('A sala %s está inativa e é usada pela turma %s.', s.nome, t.codigo));
    end if;
    if s.capacidade < t.capacidade then
      perform app.conflito(format('A sala %s comporta %s alunos; a turma %s prevê %s.', s.nome, s.capacidade, t.codigo, t.capacidade));
    end if;
  elsif t.sala_id is not null then
    perform app.invalido(format('A turma online %s não deve ter sala.', t.codigo));
  end if;

  -- Horários dentro da disponibilidade do professor
  for r in
    select h.dia_semana, h.hora from app.turma_horarios h
     where h.turma_id = t.id
       and not exists (select 1 from app.disponibilidade_professor d
                        where d.professor_id = t.professor_id and d.dia_semana = h.dia_semana and d.hora = h.hora)
     order by 1, 2 limit 1
  loop
    perform app.conflito(format('O professor %s não está disponível %s (turma %s).',
                                p.nome, app.rotulo_horario(r.dia_semana, r.hora), t.codigo));
  end loop;

  -- Professor em duas turmas no mesmo horário (períodos que se sobrepõem)
  for r in
    select o.codigo, h.dia_semana, h.hora
      from app.turma_horarios h
      join app.turmas o on o.id <> t.id and o.situacao = 'Ativa' and o.professor_id = t.professor_id
                        and daterange(o.data_inicio, o.data_fim, '[]') && daterange(t.data_inicio, t.data_fim, '[]')
      join app.turma_horarios oh on oh.turma_id = o.id and oh.dia_semana = h.dia_semana and oh.hora = h.hora
     where h.turma_id = t.id
     limit 1
  loop
    perform app.conflito(format('Choque de horário: o professor %s já dá aula na turma %s %s.',
                                p.nome, r.codigo, app.rotulo_horario(r.dia_semana, r.hora)));
  end loop;

  -- Sala ocupada no mesmo horário
  if t.sala_id is not null then
    for r in
      select o.codigo, h.dia_semana, h.hora
        from app.turma_horarios h
        join app.turmas o on o.id <> t.id and o.situacao = 'Ativa' and o.sala_id = t.sala_id
                          and daterange(o.data_inicio, o.data_fim, '[]') && daterange(t.data_inicio, t.data_fim, '[]')
        join app.turma_horarios oh on oh.turma_id = o.id and oh.dia_semana = h.dia_semana and oh.hora = h.hora
       where h.turma_id = t.id
       limit 1
    loop
      perform app.conflito(format('Choque de sala: a sala %s já está ocupada pela turma %s %s.',
                                  s.nome, r.codigo, app.rotulo_horario(r.dia_semana, r.hora)));
    end loop;
  end if;

  -- Capacidade
  select count(*) into v_inscritos from app.matricula_turma where turma_id = t.id;
  if v_inscritos > t.capacidade then
    perform app.conflito(format('A turma %s tem %s alunos; a capacidade não pode ser menor que isso.', t.codigo, v_inscritos));
  end if;

  -- Alunos da turma sem choque com suas outras turmas
  for r in
    select mt.id_aluno, o.codigo, h.dia_semana, h.hora
      from app.matricula_turma mt
      join app.matricula_turma mo on mo.id_aluno = mt.id_aluno and mo.turma_id <> t.id
      join app.turmas o on o.id = mo.turma_id and o.situacao = 'Ativa'
                        and daterange(o.data_inicio, o.data_fim, '[]') && daterange(t.data_inicio, t.data_fim, '[]')
      join app.turma_horarios h on h.turma_id = t.id
      join app.turma_horarios oh on oh.turma_id = o.id and oh.dia_semana = h.dia_semana and oh.hora = h.hora
     where mt.turma_id = t.id
     limit 1
  loop
    perform app.conflito(format('Choque de horário: o aluno %s já está na turma %s %s.',
                                r.id_aluno, r.codigo, app.rotulo_horario(r.dia_semana, r.hora)));
  end loop;
end $$;

create function app.validar_turmas_do_professor(p_professor_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  for v in select id from app.turmas where professor_id = p_professor_id and situacao = 'Ativa' loop
    perform app.validar_turma(v);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ALUNOS
-- ---------------------------------------------------------------------------
create function app.filtro_alunos(
  p_usuario_id uuid, p_unidade text, p_nivel text, p_status text, p_busca text
) returns setof app.alunos
language sql stable security definer set search_path = '' as $$
  select a.* from app.alunos a
   where a.unidade in (select app.unidades_escopo(p_usuario_id))
     and (nullif(p_unidade, '') is null or a.unidade = p_unidade)
     and (nullif(p_nivel, '') is null or a.nivel_curso = p_nivel)
     and (nullif(p_status, '') is null or a.status_matricula = p_status)
     and (nullif(btrim(p_busca), '') is null
          or a.id_aluno ilike '%' || btrim(p_busca) || '%'
          or a.nome ilike '%' || btrim(p_busca) || '%')
$$;

create function public.adm_listar_alunos(
  p_token text, p_unidade text default null, p_nivel text default null, p_status text default null,
  p_busca text default null, p_pagina int default 1, p_por_pagina int default 25, p_ordem text default 'nome'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_pp int := least(greatest(coalesce(p_por_pagina, 25), 1), 100);
  v_pg int := greatest(coalesce(p_pagina, 1), 1);
  v_total int;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_LER');
  select count(*) into v_total from app.filtro_alunos(u.id, p_unidade, p_nivel, p_status, p_busca);
  return jsonb_build_object(
    'total', v_total, 'pagina', v_pg, 'por_pagina', v_pp,
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id_aluno', a.id_aluno, 'nome', a.nome, 'email', a.email, 'unidade', a.unidade,
               'nivel_curso', a.nivel_curso, 'modalidade', a.modalidade, 'turno', a.turno,
               'status_matricula', a.status_matricula))
        from (
          select * from app.filtro_alunos(u.id, p_unidade, p_nivel, p_status, p_busca) f
           order by case when p_ordem = 'id' then f.id_aluno end,
                    case when p_ordem = 'unidade' then f.unidade end,
                    case when p_ordem = 'status' then f.status_matricula end,
                    f.nome, f.id_aluno
           offset (v_pg - 1) * v_pp limit v_pp
        ) a
    ), '[]'::jsonb));
end $$;

create function public.adm_opcoes_alunos(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_LER');
  return jsonb_build_object(
    'unidades', coalesce((select jsonb_agg(n order by n) from app.unidades_escopo(u.id) n), '[]'::jsonb),
    'niveis', coalesce((select jsonb_agg(distinct a.nivel_curso)
                          from app.alunos a
                         where a.nivel_curso is not null and a.unidade in (select app.unidades_escopo(u.id))), '[]'::jsonb)
  );
end $$;

create function public.adm_exportar_alunos(
  p_token text, p_unidade text default null, p_nivel text default null, p_status text default null,
  p_busca text default null, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v jsonb;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_LER');
  select coalesce(jsonb_agg(to_jsonb(a) - 'senha_hash' - 'primeiro_acesso' - 'tentativas_falhas' - 'bloqueado_ate'
                            - 'criado_em' - 'atualizado_em' order by a.nome, a.id_aluno), '[]'::jsonb)
    into v from app.filtro_alunos(u.id, p_unidade, p_nivel, p_status, p_busca) a;
  perform app.auditar('ADM', u.id::text, 'ALUNOS_EXPORTADOS', 'aluno', null, p_ip,
    jsonb_build_object('registros', jsonb_array_length(v),
                       'filtros', jsonb_strip_nulls(jsonb_build_object('unidade', nullif(p_unidade, ''), 'nivel', nullif(p_nivel, ''),
                                                                       'status', nullif(p_status, ''), 'busca', nullif(p_busca, '')))));
  return v;
end $$;

create function public.adm_obter_aluno(p_token text, p_id_aluno text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  a app.alunos;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_LER');
  select * into a from app.alunos where id_aluno = p_id_aluno and unidade in (select app.unidades_escopo(u.id));
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  return (to_jsonb(a) - 'senha_hash' - 'tentativas_falhas' - 'bloqueado_ate')
    || jsonb_build_object('turmas', coalesce((
         select jsonb_agg(jsonb_build_object('id', t.id, 'codigo', t.codigo, 'nome', t.nome, 'situacao', t.situacao,
                                             'idioma', t.idioma, 'professor', p.nome,
                                             'horarios', (select jsonb_agg(app.rotulo_horario(h.dia_semana, h.hora) order by h.dia_semana, h.hora)
                                                            from app.turma_horarios h where h.turma_id = t.id))
                          order by t.situacao, t.codigo)
           from app.matricula_turma mt join app.turmas t on t.id = mt.turma_id join app.professores p on p.id = t.professor_id
          where mt.id_aluno = a.id_aluno), '[]'::jsonb));
end $$;

-- p_dados: as 19 colunas já validadas/normalizadas pelo servidor.
create function public.adm_salvar_aluno(p_token text, p_novo boolean, p_dados jsonb, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  d jsonb := p_dados;
  v_id text := btrim(d->>'id_aluno');
  atual app.alunos;
  v_alterados text[];
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_EDITAR');
  perform app.unidade_id_no_escopo(u.id, d->>'unidade');

  select * into atual from app.alunos where id_aluno = v_id for update;
  if p_novo and found then
    raise exception 'ALUNO_JA_EXISTE' using errcode = 'PT409';
  end if;
  if not p_novo and (not found or atual.unidade not in (select app.unidades_escopo(u.id))) then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;

  if p_novo then
    insert into app.alunos (id_aluno, nome, email, data_nascimento, idade, genero, unidade, cidade, estado,
      canal_aquisicao, nivel_curso, modalidade, turno, plano, desconto_percentual, data_matricula,
      status_matricula, data_cancelamento, "Valor Mensalidade")
    values (v_id, d->>'nome', d->>'email', (d->>'data_nascimento')::date, (d->>'idade')::int, d->>'genero',
      d->>'unidade', d->>'cidade', d->>'estado', d->>'canal_aquisicao', d->>'nivel_curso', d->>'modalidade',
      d->>'turno', d->>'plano', (d->>'desconto_percentual')::numeric, (d->>'data_matricula')::date,
      d->>'status_matricula', (d->>'data_cancelamento')::date, (d->>'Valor Mensalidade')::numeric);
    perform app.auditar('ADM', u.id::text, 'ALUNO_CRIADO', 'aluno', v_id, p_ip);
  else
    select array_agg(k) into v_alterados
      from jsonb_object_keys(d) k
     where k <> 'id_aluno' and (to_jsonb(atual)->k) is distinct from (d->k)
       and (to_jsonb(atual)->>k) is distinct from (d->>k);

    update app.alunos set
      nome = d->>'nome', email = d->>'email', data_nascimento = (d->>'data_nascimento')::date,
      idade = (d->>'idade')::int, genero = d->>'genero', unidade = d->>'unidade', cidade = d->>'cidade',
      estado = d->>'estado', canal_aquisicao = d->>'canal_aquisicao', nivel_curso = d->>'nivel_curso',
      modalidade = d->>'modalidade', turno = d->>'turno', plano = d->>'plano',
      desconto_percentual = (d->>'desconto_percentual')::numeric, data_matricula = (d->>'data_matricula')::date,
      status_matricula = d->>'status_matricula', data_cancelamento = (d->>'data_cancelamento')::date,
      "Valor Mensalidade" = (d->>'Valor Mensalidade')::numeric, atualizado_em = now()
    where id_aluno = v_id;

    if atual.unidade <> d->>'unidade' and exists (
      select 1 from app.matricula_turma mt join app.turmas t on t.id = mt.turma_id
       where mt.id_aluno = v_id and t.situacao = 'Ativa'
    ) then
      perform app.conflito('O aluno está em turma ativa da unidade atual. Retire-o da turma antes de trocar de unidade.');
    end if;

    perform app.auditar('ADM', u.id::text, 'ALUNO_ALTERADO', 'aluno', v_id, p_ip,
                        jsonb_build_object('campos', to_jsonb(coalesce(v_alterados, '{}'))));
  end if;
  return jsonb_build_object('id_aluno', v_id);
end $$;

-- Inativação (não há exclusão física de aluno).
create function public.adm_inativar_aluno(
  p_token text, p_id_aluno text, p_status text, p_data_cancelamento date default null, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  a app.alunos;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_EDITAR');
  if p_status not in ('Cancelada', 'Trancada') then
    perform app.invalido('Escolha Cancelada ou Trancada.');
  end if;
  select * into a from app.alunos where id_aluno = p_id_aluno and unidade in (select app.unidades_escopo(u.id)) for update;
  if not found then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  update app.alunos set
    status_matricula = p_status,
    data_cancelamento = case when p_status = 'Cancelada' then coalesce(p_data_cancelamento, current_date) else data_cancelamento end,
    atualizado_em = now()
  where id_aluno = a.id_aluno;
  perform app.auditar('ADM', u.id::text, 'ALUNO_INATIVADO', 'aluno', a.id_aluno, p_ip,
                      jsonb_build_object('de', a.status_matricula, 'para', p_status));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- PROFESSORES e DISPONIBILIDADE
-- ---------------------------------------------------------------------------
create function public.adm_listar_professores(
  p_token text, p_unidade text default null, p_busca text default null, p_incluir_inativos boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  return coalesce((
    select jsonb_agg(x order by x->>'nome')
      from (
        select jsonb_build_object(
                 'id', p.id, 'nome', p.nome, 'email', p.email, 'telefone', p.telefone, 'ativo', p.ativo,
                 'idiomas', to_jsonb(p.idiomas), 'niveis', to_jsonb(p.niveis),
                 'unidades', (select coalesce(jsonb_agg(un.nome order by un.nome), '[]'::jsonb)
                                from app.professor_unidade pu join app.unidades un on un.id = pu.unidade_id
                               where pu.professor_id = p.id),
                 'disponiveis', (select count(*) from app.disponibilidade_professor d where d.professor_id = p.id),
                 'turmas_ativas', (select count(*) from app.turmas t where t.professor_id = p.id and t.situacao = 'Ativa')
               ) x
          from app.professores p
         where app.professor_no_escopo(u.id, p.id)
           and (coalesce(p_incluir_inativos, false) or p.ativo)
           and (nullif(p_unidade, '') is null or exists (
                 select 1 from app.professor_unidade pu join app.unidades un on un.id = pu.unidade_id
                  where pu.professor_id = p.id and un.nome = p_unidade))
           and (nullif(btrim(p_busca), '') is null or p.nome ilike '%' || btrim(p_busca) || '%'
                or p.email ilike '%' || btrim(p_busca) || '%')
      ) s
  ), '[]'::jsonb);
end $$;

create function public.adm_obter_professor(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  p app.professores;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  select * into p from app.professores where id = p_id;
  if not found or not app.professor_no_escopo(u.id, p.id) then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  return to_jsonb(p) || jsonb_build_object(
    'unidades', (select coalesce(jsonb_agg(un.nome order by un.nome), '[]'::jsonb)
                   from app.professor_unidade pu join app.unidades un on un.id = pu.unidade_id where pu.professor_id = p.id),
    'disponibilidade', (select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia_semana, 'hora', d.hora)), '[]'::jsonb)
                          from app.disponibilidade_professor d where d.professor_id = p.id),
    'aulas', (select coalesce(jsonb_agg(jsonb_build_object('dia', h.dia_semana, 'hora', h.hora, 'turma_id', t.id,
                                                            'codigo', t.codigo, 'inicio', t.data_inicio, 'fim', t.data_fim)), '[]'::jsonb)
                from app.turmas t join app.turma_horarios h on h.turma_id = t.id
               where t.professor_id = p.id and t.situacao = 'Ativa')
  );
end $$;

create function public.adm_salvar_professor(
  p_token text, p_id uuid, p_nome text, p_email text, p_telefone text,
  p_idiomas text[], p_niveis text[], p_unidades text[], p_ativo boolean default true, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_id uuid := p_id;
  v_escopo text[];
  v_idiomas text[] := array(select distinct btrim(x) from unnest(coalesce(p_idiomas, '{}')) x where btrim(x) <> '' order by 1);
  v_niveis text[] := array(select distinct btrim(x) from unnest(coalesce(p_niveis, '{}')) x where btrim(x) <> '' order by 1);
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  perform app.lock_grade();
  select coalesce(array_agg(n), '{}') into v_escopo from app.unidades_escopo(u.id) n;

  if p_nome is null or length(btrim(p_nome)) = 0 then perform app.invalido('Informe o nome do professor.'); end if;
  if p_email is null or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform app.invalido('Informe um e-mail válido.'); end if;
  if cardinality(v_idiomas) = 0 then perform app.invalido('Informe pelo menos um idioma.'); end if;
  if cardinality(v_niveis) = 0 then perform app.invalido('Informe pelo menos um nível.'); end if;
  if exists (select 1 from unnest(coalesce(p_unidades, '{}')) n where not (n = any (v_escopo))) then
    perform app.invalido('Há unidade fora do seu escopo.');
  end if;

  if v_id is null then
    if cardinality(coalesce(p_unidades, '{}')) = 0 then perform app.invalido('Vincule o professor a pelo menos uma unidade.'); end if;
    if exists (select 1 from app.professores where lower(email) = lower(btrim(p_email))) then
      raise exception 'PROFESSOR_EMAIL_EXISTE' using errcode = 'PT409';
    end if;
    insert into app.professores (nome, email, telefone, idiomas, niveis, ativo)
    values (btrim(p_nome), lower(btrim(p_email)), nullif(btrim(p_telefone), ''), v_idiomas, v_niveis, coalesce(p_ativo, true))
    returning id into v_id;
  else
    if not app.professor_no_escopo(u.id, v_id) then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
    if exists (select 1 from app.professores where lower(email) = lower(btrim(p_email)) and id <> v_id) then
      raise exception 'PROFESSOR_EMAIL_EXISTE' using errcode = 'PT409';
    end if;
    update app.professores set nome = btrim(p_nome), email = lower(btrim(p_email)), telefone = nullif(btrim(p_telefone), ''),
           idiomas = v_idiomas, niveis = v_niveis, ativo = coalesce(p_ativo, true), atualizado_em = now()
     where id = v_id;
    -- só mexe nos vínculos das unidades do escopo; preserva os demais
    delete from app.professor_unidade pu using app.unidades un
     where pu.unidade_id = un.id and pu.professor_id = v_id and un.nome = any (v_escopo);
  end if;

  insert into app.professor_unidade (professor_id, unidade_id)
  select v_id, un.id from app.unidades un where un.nome = any (coalesce(p_unidades, '{}'))
  on conflict do nothing;

  if not exists (select 1 from app.professor_unidade where professor_id = v_id) then
    perform app.invalido('Vincule o professor a pelo menos uma unidade.');
  end if;

  perform app.validar_turmas_do_professor(v_id);
  perform app.auditar('ADM', u.id::text, case when p_id is null then 'PROFESSOR_CRIADO' else 'PROFESSOR_ALTERADO' end,
                      'professor', v_id::text, p_ip);
  return jsonb_build_object('id', v_id);
end $$;

create function public.adm_salvar_disponibilidade(p_token text, p_professor_id uuid, p_horarios jsonb, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  perform app.lock_grade();
  if not app.professor_no_escopo(u.id, p_professor_id) then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;

  delete from app.disponibilidade_professor where professor_id = p_professor_id;
  insert into app.disponibilidade_professor (professor_id, dia_semana, hora)
  select distinct p_professor_id, (e->>'dia')::smallint, (e->>'hora')::smallint
    from jsonb_array_elements(coalesce(p_horarios, '[]')) e;

  perform app.validar_turmas_do_professor(p_professor_id);
  perform app.auditar('ADM', u.id::text, 'DISPONIBILIDADE_ALTERADA', 'professor', p_professor_id::text, p_ip,
                      jsonb_build_object('horarios', jsonb_array_length(coalesce(p_horarios, '[]'))));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- SALAS
-- ---------------------------------------------------------------------------
create function public.adm_listar_salas(p_token text, p_unidade text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'unidade', un.nome, 'capacidade', s.capacidade,
                                        'ativa', s.ativa,
                                        'turmas_ativas', (select count(*) from app.turmas t where t.sala_id = s.id and t.situacao = 'Ativa'))
                     order by un.nome, s.nome)
      from app.salas s join app.unidades un on un.id = s.unidade_id
     where un.nome in (select app.unidades_escopo(u.id))
       and (nullif(p_unidade, '') is null or un.nome = p_unidade)
  ), '[]'::jsonb);
end $$;

create function public.adm_salvar_sala(
  p_token text, p_id uuid, p_unidade text, p_nome text, p_capacidade int, p_ativa boolean default true, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_un uuid := app.unidade_id_no_escopo(u.id, p_unidade);
  v_id uuid := p_id;
  v uuid;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  perform app.lock_grade();
  if p_nome is null or length(btrim(p_nome)) = 0 then perform app.invalido('Informe o nome da sala.'); end if;
  if p_capacidade is null or p_capacidade < 1 or p_capacidade > 500 then perform app.invalido('Capacidade deve ser entre 1 e 500.'); end if;
  if exists (select 1 from app.salas where unidade_id = v_un and lower(nome) = lower(btrim(p_nome)) and id is distinct from v_id) then
    raise exception 'SALA_JA_EXISTE' using errcode = 'PT409';
  end if;

  if v_id is null then
    insert into app.salas (unidade_id, nome, capacidade, ativa) values (v_un, btrim(p_nome), p_capacidade, coalesce(p_ativa, true))
    returning id into v_id;
  else
    if not exists (select 1 from app.salas s join app.unidades un on un.id = s.unidade_id
                    where s.id = v_id and un.nome in (select app.unidades_escopo(u.id))) then
      raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
    end if;
    if exists (select 1 from app.turmas where sala_id = v_id and unidade_id <> v_un) then
      perform app.conflito('A sala tem turmas de outra unidade; não é possível mudá-la de unidade.');
    end if;
    update app.salas set unidade_id = v_un, nome = btrim(p_nome), capacidade = p_capacidade, ativa = coalesce(p_ativa, true)
     where id = v_id;
    for v in select id from app.turmas where sala_id = v_id and situacao = 'Ativa' loop
      perform app.validar_turma(v);
    end loop;
  end if;
  perform app.auditar('ADM', u.id::text, case when p_id is null then 'SALA_CRIADA' else 'SALA_ALTERADA' end, 'sala', v_id::text, p_ip);
  return jsonb_build_object('id', v_id);
end $$;

-- ---------------------------------------------------------------------------
-- TURMAS
-- ---------------------------------------------------------------------------
create function app.turma_json(t app.turmas) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(t) || jsonb_build_object(
    'unidade', (select nome from app.unidades where id = t.unidade_id),
    'professor', (select nome from app.professores where id = t.professor_id),
    'sala', (select nome from app.salas where id = t.sala_id),
    'inscritos', (select count(*) from app.matricula_turma where turma_id = t.id),
    'horarios', (select coalesce(jsonb_agg(jsonb_build_object('dia', h.dia_semana, 'hora', h.hora) order by h.dia_semana, h.hora), '[]'::jsonb)
                   from app.turma_horarios h where h.turma_id = t.id)
  )
$$;

create function public.adm_listar_turmas(
  p_token text, p_unidade text default null, p_idioma text default null, p_situacao text default 'Ativa',
  p_professor_id uuid default null, p_busca text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  return coalesce((
    select jsonb_agg(app.turma_json(t) order by t.codigo)
      from app.turmas t join app.unidades un on un.id = t.unidade_id
     where un.nome in (select app.unidades_escopo(u.id))
       and (nullif(p_unidade, '') is null or un.nome = p_unidade)
       and (nullif(p_idioma, '') is null or t.idioma = p_idioma)
       and (nullif(p_situacao, '') is null or t.situacao = p_situacao)
       and (p_professor_id is null or t.professor_id = p_professor_id)
       and (nullif(btrim(p_busca), '') is null or t.codigo ilike '%' || btrim(p_busca) || '%' or t.nome ilike '%' || btrim(p_busca) || '%')
  ), '[]'::jsonb);
end $$;

create function public.adm_obter_turma(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  t app.turmas;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  t := app.turma_no_escopo(u.id, p_id);
  return app.turma_json(t) || jsonb_build_object(
    'alunos', (select coalesce(jsonb_agg(jsonb_build_object('id_aluno', a.id_aluno, 'nome', a.nome, 'status_matricula', a.status_matricula,
                                                             'incluido_em', mt.incluido_em) order by a.nome), '[]'::jsonb)
                 from app.matricula_turma mt join app.alunos a on a.id_aluno = mt.id_aluno where mt.turma_id = t.id));
end $$;

-- p_dados: codigo, nome, unidade, idioma, nivel_curso, modalidade, professor_id, sala_id,
--          capacidade, data_inicio, data_fim, situacao.  p_horarios: [{dia, hora}]
create function public.adm_salvar_turma(p_token text, p_id uuid, p_dados jsonb, p_horarios jsonb, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  d jsonb := p_dados;
  v_un uuid;
  v_id uuid := p_id;
  v_prof uuid := nullif(d->>'professor_id', '')::uuid;
  v_sala uuid := nullif(d->>'sala_id', '')::uuid;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  perform app.lock_grade();
  v_un := app.unidade_id_no_escopo(u.id, d->>'unidade');

  if coalesce(btrim(d->>'codigo'), '') = '' then perform app.invalido('Informe o código da turma.'); end if;
  if coalesce(btrim(d->>'nome'), '') = '' then perform app.invalido('Informe o nome da turma.'); end if;
  if coalesce(btrim(d->>'idioma'), '') = '' then perform app.invalido('Informe o idioma.'); end if;
  if coalesce(btrim(d->>'nivel_curso'), '') = '' then perform app.invalido('Informe o nível.'); end if;
  if coalesce(d->>'modalidade', '') not in ('Presencial', 'Online') then perform app.invalido('Escolha a modalidade.'); end if;
  if v_prof is null or not app.professor_no_escopo(u.id, v_prof) then perform app.invalido('Escolha um professor válido.'); end if;
  if coalesce((d->>'capacidade')::int, 0) < 1 then perform app.invalido('Capacidade deve ser de pelo menos 1 aluno.'); end if;
  if d->>'data_inicio' is null or d->>'data_fim' is null then perform app.invalido('Informe o período da turma.'); end if;
  if (d->>'data_fim')::date < (d->>'data_inicio')::date then perform app.invalido('A data de fim deve ser igual ou posterior à de início.'); end if;
  if coalesce(d->>'situacao', 'Ativa') not in ('Ativa', 'Encerrada') then perform app.invalido('Situação inválida.'); end if;
  if exists (select 1 from app.turmas where lower(codigo) = lower(btrim(d->>'codigo')) and id is distinct from v_id) then
    raise exception 'TURMA_CODIGO_EXISTE' using errcode = 'PT409';
  end if;

  if v_id is null then
    insert into app.turmas (codigo, nome, unidade_id, idioma, nivel_curso, modalidade, professor_id, sala_id,
                            capacidade, data_inicio, data_fim, situacao)
    values (btrim(d->>'codigo'), btrim(d->>'nome'), v_un, btrim(d->>'idioma'), btrim(d->>'nivel_curso'), d->>'modalidade',
            v_prof, v_sala, (d->>'capacidade')::int, (d->>'data_inicio')::date, (d->>'data_fim')::date,
            coalesce(d->>'situacao', 'Ativa'))
    returning id into v_id;
  else
    perform app.turma_no_escopo(u.id, v_id);
    if exists (select 1 from app.matricula_turma mt join app.alunos a on a.id_aluno = mt.id_aluno
                where mt.turma_id = v_id and a.unidade <> d->>'unidade') then
      perform app.conflito('A turma tem alunos de outra unidade; não é possível mudá-la de unidade.');
    end if;
    update app.turmas set codigo = btrim(d->>'codigo'), nome = btrim(d->>'nome'), unidade_id = v_un,
           idioma = btrim(d->>'idioma'), nivel_curso = btrim(d->>'nivel_curso'), modalidade = d->>'modalidade',
           professor_id = v_prof, sala_id = v_sala, capacidade = (d->>'capacidade')::int,
           data_inicio = (d->>'data_inicio')::date, data_fim = (d->>'data_fim')::date,
           situacao = coalesce(d->>'situacao', 'Ativa'), atualizado_em = now()
     where id = v_id;
    delete from app.turma_horarios where turma_id = v_id;
  end if;

  insert into app.turma_horarios (turma_id, dia_semana, hora)
  select distinct v_id, (e->>'dia')::smallint, (e->>'hora')::smallint
    from jsonb_array_elements(coalesce(p_horarios, '[]')) e;

  perform app.validar_turma(v_id);
  perform app.auditar('ADM', u.id::text, case when p_id is null then 'TURMA_CRIADA' else 'TURMA_ALTERADA' end,
                      'turma', v_id::text, p_ip, jsonb_build_object('codigo', btrim(d->>'codigo')));
  return jsonb_build_object('id', v_id);
end $$;

create function public.adm_turma_incluir_aluno(p_token text, p_turma_id uuid, p_id_aluno text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  t app.turmas;
  a app.alunos;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  perform app.lock_grade();
  t := app.turma_no_escopo(u.id, p_turma_id);
  if t.situacao <> 'Ativa' then perform app.conflito('A turma está encerrada.'); end if;

  select * into a from app.alunos where id_aluno = btrim(p_id_aluno) and unidade in (select app.unidades_escopo(u.id));
  if not found then perform app.invalido(format('Aluno "%s" não encontrado no seu escopo.', btrim(p_id_aluno))); end if;
  if a.status_matricula <> 'Ativa' then
    perform app.conflito(format('A matrícula do aluno %s está %s.', a.id_aluno, lower(a.status_matricula)));
  end if;
  if a.unidade <> (select nome from app.unidades where id = t.unidade_id) then
    perform app.conflito(format('O aluno %s é da unidade %s; a turma é de outra unidade.', a.id_aluno, a.unidade));
  end if;
  if exists (select 1 from app.matricula_turma where turma_id = t.id and id_aluno = a.id_aluno) then
    perform app.conflito(format('O aluno %s já está nesta turma.', a.id_aluno));
  end if;
  if (select count(*) from app.matricula_turma where turma_id = t.id) >= t.capacidade then
    perform app.conflito(format('Turma lotada (%s vagas).', t.capacidade));
  end if;

  insert into app.matricula_turma (turma_id, id_aluno) values (t.id, a.id_aluno);
  perform app.validar_turma(t.id);  -- inclui o choque de horário do aluno
  perform app.auditar('ADM', u.id::text, 'ALUNO_INCLUIDO_TURMA', 'turma', t.id::text, p_ip,
                      jsonb_build_object('id_aluno', a.id_aluno, 'codigo', t.codigo));
  return jsonb_build_object('ok', true);
end $$;

create function public.adm_turma_remover_aluno(p_token text, p_turma_id uuid, p_id_aluno text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  t app.turmas;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  t := app.turma_no_escopo(u.id, p_turma_id);
  delete from app.matricula_turma where turma_id = t.id and id_aluno = p_id_aluno;
  if found then
    perform app.auditar('ADM', u.id::text, 'ALUNO_REMOVIDO_TURMA', 'turma', t.id::text, p_ip,
                        jsonb_build_object('id_aluno', p_id_aluno, 'codigo', t.codigo));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on all functions in schema app from public, anon, authenticated;

do $$
declare
  f text;
begin
  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'adm_listar_alunos', 'adm_opcoes_alunos', 'adm_exportar_alunos', 'adm_obter_aluno', 'adm_salvar_aluno',
       'adm_inativar_aluno', 'adm_listar_professores', 'adm_obter_professor', 'adm_salvar_professor',
       'adm_salvar_disponibilidade', 'adm_listar_salas', 'adm_salvar_sala', 'adm_listar_turmas', 'adm_obter_turma',
       'adm_salvar_turma', 'adm_turma_incluir_aluno', 'adm_turma_remover_aluno')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
