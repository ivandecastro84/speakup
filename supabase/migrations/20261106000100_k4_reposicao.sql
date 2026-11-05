-- K4 · Presença (chamada), créditos de reposição, motor de agendamento de
-- reposição (vaga em turma existente ou aula avulsa) e painel do aluno.
-- Horários de aula no fuso America/Sao_Paulo. Dia 1 = segunda … 6 = sábado.

insert into app.configuracao (chave, valor, descricao) values
  ('reposicao_antecedencia_horas', '4', '[DECISÃO PENDENTE] Cancelar até N horas antes devolve o crédito'),
  ('reposicao_limite_mes', '4', '[DECISÃO PENDENTE] Máximo de reposições por mês (pela data da reposição)'),
  ('reposicao_janela_dias', '14', '[DECISÃO PENDENTE] Quantos dias à frente a agenda de reposição fica aberta');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
-- Presença dos alunos REGULARES de uma turma numa aula (turma × data × hora).
create table app.presencas (
  turma_id        uuid not null references app.turmas (id) on delete cascade,
  data            date not null,
  hora            smallint not null check (hora in (8, 10, 12, 14, 16, 18, 20)),
  id_aluno        text not null references app.alunos (id_aluno) on update cascade,
  situacao        text not null check (situacao in ('Presente', 'Falta')),
  registrado_por  uuid not null references app.usuarios_adm (id),
  registrado_em   timestamptz not null default now(),
  primary key (turma_id, data, hora, id_aluno)
);
create index presencas_aluno_idx on app.presencas (id_aluno, data desc);

-- Crédito gerado por falta em aula regular.
create table app.creditos_reposicao (
  id          uuid primary key default gen_random_uuid(),
  id_aluno    text not null references app.alunos (id_aluno) on update cascade,
  turma_id    uuid not null references app.turmas (id) on delete cascade,
  data_aula   date not null,
  hora        smallint not null,
  valido_ate  date not null,
  status      text not null default 'Disponivel' check (status in ('Disponivel', 'Reservado', 'Usado')),
  criado_em   timestamptz not null default now(),
  unique (id_aluno, turma_id, data_aula, hora)
);
create index creditos_aluno_idx on app.creditos_reposicao (id_aluno, status, valido_ate);

-- Aula avulsa criada para uma reposição (1 aluno).
create table app.aulas_avulsas (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    uuid not null references app.unidades (id),
  professor_id  uuid not null references app.professores (id),
  sala_id       uuid references app.salas (id),
  idioma        text not null,
  nivel_curso   text not null,
  modalidade    text not null check (modalidade in ('Presencial', 'Online')),
  data          date not null,
  hora          smallint not null check (hora in (8, 10, 12, 14, 16, 18, 20)),
  criado_em     timestamptz not null default now()
);

create table app.reposicoes (
  id                   uuid primary key default gen_random_uuid(),
  id_aluno             text not null references app.alunos (id_aluno) on update cascade,
  credito_id           uuid not null references app.creditos_reposicao (id),
  tipo                 text not null check (tipo in ('TURMA', 'AVULSA')),
  turma_id             uuid references app.turmas (id),
  aula_avulsa_id       uuid references app.aulas_avulsas (id),
  data                 date not null,
  hora                 smallint not null check (hora in (8, 10, 12, 14, 16, 18, 20)),
  status               text not null default 'Agendada' check (status in ('Agendada', 'Cancelada', 'Realizada', 'Falta')),
  cancelamento_tardio  boolean not null default false,
  criado_em            timestamptz not null default now(),
  cancelado_em         timestamptz,
  presenca_por         uuid references app.usuarios_adm (id),
  presenca_em          timestamptz,
  check ((tipo = 'TURMA' and turma_id is not null and aula_avulsa_id is null)
      or (tipo = 'AVULSA' and aula_avulsa_id is not null and turma_id is null))
);
create index reposicoes_aluno_idx on app.reposicoes (id_aluno, data);
create index reposicoes_slot_idx on app.reposicoes (data, hora) where status = 'Agendada';

revoke all on app.presencas, app.creditos_reposicao, app.aulas_avulsas, app.reposicoes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Utilitários de tempo e ocupação
-- ---------------------------------------------------------------------------
create function app.hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create function app.inicio_aula(p_data date, p_hora smallint) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_data + make_time(p_hora, 0, 0)) at time zone 'America/Sao_Paulo'
$$;

create function app.dia_semana(p_data date) returns smallint
language sql immutable set search_path = '' as $$
  select extract(isodow from p_data)::smallint
$$;

-- A turma tem aula nesta data/hora?
create function app.turma_tem_aula(p_turma_id uuid, p_data date, p_hora smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.turmas t join app.turma_horarios h on h.turma_id = t.id
     where t.id = p_turma_id and t.situacao = 'Ativa'
       and p_data between t.data_inicio and t.data_fim
       and h.dia_semana = app.dia_semana(p_data) and h.hora = p_hora)
$$;

-- O aluno já tem compromisso (aula regular ou reposição agendada) neste horário?
create function app.aluno_ocupado(p_id_aluno text, p_data date, p_hora smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from app.matricula_turma mt
       where mt.id_aluno = p_id_aluno and app.turma_tem_aula(mt.turma_id, p_data, p_hora))
    or exists (
      select 1 from app.reposicoes r
       where r.id_aluno = p_id_aluno and r.status = 'Agendada' and r.data = p_data and r.hora = p_hora)
$$;

create function app.vagas_turma(p_turma_id uuid, p_data date, p_hora smallint) returns int
language sql stable security definer set search_path = '' as $$
  select t.capacidade
         - (select count(*) from app.matricula_turma where turma_id = t.id)::int
         - (select count(*) from app.reposicoes r
             where r.turma_id = t.id and r.data = p_data and r.hora = p_hora and r.status = 'Agendada')::int
    from app.turmas t where t.id = p_turma_id
$$;

create function app.professor_livre(p_professor_id uuid, p_data date, p_hora smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.professores where id = p_professor_id and ativo)
     and exists (select 1 from app.disponibilidade_professor
                  where professor_id = p_professor_id and dia_semana = app.dia_semana(p_data) and hora = p_hora)
     and not exists (select 1 from app.turmas t
                      where t.professor_id = p_professor_id and app.turma_tem_aula(t.id, p_data, p_hora))
     and not exists (select 1 from app.reposicoes r join app.aulas_avulsas a on a.id = r.aula_avulsa_id
                      where a.professor_id = p_professor_id and r.data = p_data and r.hora = p_hora and r.status = 'Agendada')
$$;

create function app.sala_livre(p_sala_id uuid, p_data date, p_hora smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.salas where id = p_sala_id and ativa)
     and not exists (select 1 from app.turmas t where t.sala_id = p_sala_id and app.turma_tem_aula(t.id, p_data, p_hora))
     and not exists (select 1 from app.reposicoes r join app.aulas_avulsas a on a.id = r.aula_avulsa_id
                      where a.sala_id = p_sala_id and r.data = p_data and r.hora = p_hora and r.status = 'Agendada')
$$;

create function app.saldo_reposicao(p_id_aluno text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from app.creditos_reposicao
   where id_aluno = p_id_aluno and status = 'Disponivel' and valido_ate >= app.hoje()
$$;

-- Reposições que contam no limite mensal (pela data da reposição).
create function app.reposicoes_no_mes(p_id_aluno text, p_data date) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from app.reposicoes
   where id_aluno = p_id_aluno
     and date_trunc('month', data) = date_trunc('month', p_data)
     and (status in ('Agendada', 'Realizada', 'Falta') or (status = 'Cancelada' and cancelamento_tardio))
$$;

-- ---------------------------------------------------------------------------
-- Opções de reposição de um aluno numa data/hora.
-- 1º vagas em outras turmas do mesmo idioma e nível; se não houver, aula avulsa.
-- ---------------------------------------------------------------------------
create function app.opcoes_reposicao(p_id_aluno text, p_data date, p_hora smallint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a app.alunos;
  v_unidade uuid;
  v_turmas jsonb;
  par record;
  v_prof record;
  v_sala_id uuid;
  v_sala_nome text;
  v_modalidade text;
begin
  select * into a from app.alunos where id_aluno = p_id_aluno;
  select id into v_unidade from app.unidades where nome = a.unidade;

  if app.aluno_ocupado(p_id_aluno, p_data, p_hora) or app.dia_semana(p_data) > 6 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', 'TURMA', 'turma_id', t.id, 'codigo', t.codigo, 'nome', t.nome, 'idioma', t.idioma,
           'nivel_curso', t.nivel_curso, 'modalidade', t.modalidade,
           'professor', (select nome from app.professores where id = t.professor_id),
           'sala', (select nome from app.salas where id = t.sala_id),
           'vagas', app.vagas_turma(t.id, p_data, p_hora)) order by t.codigo), '[]'::jsonb)
    into v_turmas
    from app.turmas t
   where t.unidade_id = v_unidade
     and app.turma_tem_aula(t.id, p_data, p_hora)
     and not exists (select 1 from app.matricula_turma mt where mt.turma_id = t.id and mt.id_aluno = p_id_aluno)
     and exists (select 1 from app.matricula_turma mt join app.turmas m on m.id = mt.turma_id
                  where mt.id_aluno = p_id_aluno and m.situacao = 'Ativa'
                    and m.idioma = t.idioma and m.nivel_curso = t.nivel_curso)
     and app.vagas_turma(t.id, p_data, p_hora) > 0;

  if jsonb_array_length(v_turmas) > 0 then
    return v_turmas;
  end if;

  -- Aula avulsa: professor livre que leciona o idioma/nível de uma turma do aluno
  v_modalidade := coalesce(a.modalidade, 'Presencial');
  for par in
    select distinct m.idioma, m.nivel_curso
      from app.matricula_turma mt join app.turmas m on m.id = mt.turma_id
     where mt.id_aluno = p_id_aluno and m.situacao = 'Ativa'
     order by 1, 2
  loop
    for v_prof in
      select p.id, p.nome
        from app.professores p join app.professor_unidade pu on pu.professor_id = p.id and pu.unidade_id = v_unidade
       where par.idioma = any (p.idiomas) and par.nivel_curso = any (p.niveis)
         and app.professor_livre(p.id, p_data, p_hora)
       order by (select count(*) from app.reposicoes r join app.aulas_avulsas av on av.id = r.aula_avulsa_id
                  where av.professor_id = p.id and r.status = 'Agendada'), p.nome
    loop
      v_sala_id := null;
      v_sala_nome := null;
      if v_modalidade = 'Presencial' then
        select s.id, s.nome into v_sala_id, v_sala_nome from app.salas s
         where s.unidade_id = v_unidade and app.sala_livre(s.id, p_data, p_hora)
         order by s.capacidade, s.nome limit 1;
        if v_sala_id is null then
          return '[]'::jsonb;  -- há professor, mas nenhuma sala livre
        end if;
      end if;
      return jsonb_build_array(jsonb_build_object(
        'tipo', 'AVULSA', 'professor_id', v_prof.id, 'professor', v_prof.nome,
        'sala_id', v_sala_id,
        'sala', v_sala_nome,
        'idioma', par.idioma, 'nivel_curso', par.nivel_curso, 'modalidade', v_modalidade));
    end loop;
  end loop;
  return '[]'::jsonb;
end $$;

-- ---------------------------------------------------------------------------
-- Novas regras de grade: aulas avulsas agendadas também ocupam professor/sala
-- ---------------------------------------------------------------------------
create or replace function app.validar_avulsas_professor(p_professor_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select rp.data, rp.hora, p.nome, p.ativo,
           exists (select 1 from app.disponibilidade_professor d
                    where d.professor_id = p.id and d.dia_semana = app.dia_semana(rp.data) and d.hora = rp.hora) as disponivel
      from app.reposicoes rp join app.aulas_avulsas av on av.id = rp.aula_avulsa_id join app.professores p on p.id = av.professor_id
     where av.professor_id = p_professor_id and rp.status = 'Agendada'
  loop
    if not r.ativo or not r.disponivel then
      perform app.conflito(format('O professor %s tem reposição avulsa agendada em %s %s.',
                                  r.nome, to_char(r.data, 'DD/MM/YYYY'), lpad(r.hora::text, 2, '0') || 'h'));
    end if;
  end loop;
end $$;

create function app.validar_turma_avulsas(p_turma_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select t.codigo, rp.data, rp.hora, case when av.professor_id = t.professor_id then 'professor' else 'sala' end as recurso
      from app.turmas t
      join app.turma_horarios h on h.turma_id = t.id
      join app.aulas_avulsas av on (av.professor_id = t.professor_id or (t.sala_id is not null and av.sala_id = t.sala_id))
      join app.reposicoes rp on rp.aula_avulsa_id = av.id and rp.status = 'Agendada'
     where t.id = p_turma_id and t.situacao = 'Ativa'
       and rp.data between t.data_inicio and t.data_fim
       and app.dia_semana(rp.data) = h.dia_semana and rp.hora = h.hora
     limit 1
  loop
    perform app.conflito(format('Choque com reposição avulsa já agendada (%s) em %s %s.',
                                r.recurso, to_char(r.data, 'DD/MM/YYYY'), lpad(r.hora::text, 2, '0') || 'h'));
  end loop;
end $$;

-- Encaixa as novas checagens nos pontos de escrita de grade já existentes:
-- a validação do K3 vira "base" e app.validar_turma passa a incluir as avulsas.
-- (Funções plpgsql resolvem o nome em tempo de execução, então todos os
-- chamadores existentes passam a usar a versão nova.)
alter function app.validar_turma(uuid) rename to validar_turma_base;

create function app.validar_turma(p_turma_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.validar_turma_base(p_turma_id);
  perform app.validar_turma_avulsas(p_turma_id);
end $$;

create or replace function app.validar_turmas_do_professor(p_professor_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  for v in select id from app.turmas where professor_id = p_professor_id and situacao = 'Ativa' loop
    perform app.validar_turma(v);
  end loop;
  perform app.validar_avulsas_professor(p_professor_id);
end $$;

-- ---------------------------------------------------------------------------
-- ALUNO: painel, catálogo, agendamento, cancelamento, presenças
-- ---------------------------------------------------------------------------
create function app.aluno_liberado(p_token text) returns app.alunos
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.sessao_aluno(p_token);
begin
  if a.primeiro_acesso then
    raise exception 'TROCA_SENHA_PENDENTE' using errcode = 'PT403';
  end if;
  return a;
end $$;

create function public.aluno_painel(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.aluno_liberado(p_token);
  v_hoje date := app.hoje();
  v_janela int := app.cfg_int('reposicao_janela_dias');
  v_antecedencia int := app.cfg_int('reposicao_antecedencia_horas');
begin
  return jsonb_build_object(
    'saldo', app.saldo_reposicao(a.id_aluno),
    'creditos', coalesce((select jsonb_agg(jsonb_build_object('valido_ate', c.valido_ate, 'data_falta', c.data_aula) order by c.valido_ate)
                            from app.creditos_reposicao c
                           where c.id_aluno = a.id_aluno and c.status = 'Disponivel' and c.valido_ate >= v_hoje), '[]'::jsonb),
    'limite_mes', app.cfg_int('reposicao_limite_mes'),
    'usadas_mes', app.reposicoes_no_mes(a.id_aluno, v_hoje),
    'antecedencia_horas', v_antecedencia,
    'tem_turma', exists (select 1 from app.matricula_turma mt join app.turmas t on t.id = mt.turma_id
                          where mt.id_aluno = a.id_aluno and t.situacao = 'Ativa'),
    'proximas', coalesce((
      select jsonb_agg(x order by x->>'data', (x->>'hora')::int)
        from (
          -- aulas regulares
          select jsonb_build_object('tipo', 'Aula', 'data', d::date, 'hora', h.hora, 'turma', t.codigo, 'nome', t.nome,
                                    'professor', p.nome, 'modalidade', t.modalidade, 'sala', s.nome) x
            from app.matricula_turma mt
            join app.turmas t on t.id = mt.turma_id and t.situacao = 'Ativa'
            join app.turma_horarios h on h.turma_id = t.id
            join app.professores p on p.id = t.professor_id
            left join app.salas s on s.id = t.sala_id
            cross join generate_series(v_hoje, v_hoje + v_janela, interval '1 day') d
           where mt.id_aluno = a.id_aluno
             and d::date between t.data_inicio and t.data_fim
             and app.dia_semana(d::date) = h.dia_semana
             and app.inicio_aula(d::date, h.hora) > now() - interval '2 hours'
          union all
          -- reposições agendadas
          select jsonb_build_object('tipo', 'Reposição', 'reposicao_id', r.id, 'data', r.data, 'hora', r.hora,
                                    'turma', t.codigo, 'nome', coalesce(t.nome, 'Aula avulsa de ' || av.idioma || ' ' || av.nivel_curso),
                                    'professor', coalesce(pt.nome, pa.nome),
                                    'modalidade', coalesce(t.modalidade, av.modalidade), 'sala', coalesce(st.nome, sa.nome),
                                    'cancelamento_gratuito', app.inicio_aula(r.data, r.hora) - make_interval(hours => v_antecedencia) >= now())
            from app.reposicoes r
            left join app.turmas t on t.id = r.turma_id
            left join app.professores pt on pt.id = t.professor_id
            left join app.salas st on st.id = t.sala_id
            left join app.aulas_avulsas av on av.id = r.aula_avulsa_id
            left join app.professores pa on pa.id = av.professor_id
            left join app.salas sa on sa.id = av.sala_id
           where r.id_aluno = a.id_aluno and r.status = 'Agendada'
        ) s
    ), '[]'::jsonb)
  );
end $$;

create function public.aluno_catalogo_reposicao(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.aluno_liberado(p_token);
  v_hoje date := app.hoje();
  v_janela int := app.cfg_int('reposicao_janela_dias');
  v_limite int := app.cfg_int('reposicao_limite_mes');
  v_saldo int := app.saldo_reposicao(a.id_aluno);
  v_bloqueio text;
  v_dias jsonb := '[]'::jsonb;
  v_horas jsonb;
  v_ops jsonb;
  d date;
  h smallint;
begin
  if a.status_matricula <> 'Ativa' then
    v_bloqueio := 'MATRICULA_INATIVA';
  elsif not exists (select 1 from app.matricula_turma mt join app.turmas t on t.id = mt.turma_id
                     where mt.id_aluno = a.id_aluno and t.situacao = 'Ativa') then
    v_bloqueio := 'SEM_TURMA';
  elsif v_saldo = 0 then
    v_bloqueio := 'SALDO_ZERO';
  end if;

  if v_bloqueio is null then
    for d in select g::date from generate_series(v_hoje, v_hoje + v_janela, interval '1 day') g loop
      continue when app.dia_semana(d) > 6;
      continue when app.reposicoes_no_mes(a.id_aluno, d) >= v_limite;
      v_horas := '[]'::jsonb;
      foreach h in array array[8, 10, 12, 14, 16, 18, 20]::smallint[] loop
        continue when app.inicio_aula(d, h) <= now();
        v_ops := app.opcoes_reposicao(a.id_aluno, d, h);
        if jsonb_array_length(v_ops) > 0 then
          v_horas := v_horas || jsonb_build_object('hora', h, 'opcoes', v_ops);
        end if;
      end loop;
      if jsonb_array_length(v_horas) > 0 then
        v_dias := v_dias || jsonb_build_object('data', d, 'horarios', v_horas);
      end if;
    end loop;
  end if;

  return jsonb_build_object('saldo', v_saldo, 'bloqueio', v_bloqueio, 'limite_mes', v_limite,
                            'usadas_mes', app.reposicoes_no_mes(a.id_aluno, v_hoje), 'dias', v_dias);
end $$;

create function public.aluno_agendar_reposicao(
  p_token text, p_data date, p_hora int, p_tipo text, p_turma_id uuid default null, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.aluno_liberado(p_token);
  v_hora smallint := p_hora::smallint;
  v_hoje date := app.hoje();
  v_ops jsonb;
  v_op jsonb;
  v_credito uuid;
  v_avulsa uuid;
  v_id uuid;
begin
  perform app.lock_grade();

  if a.status_matricula <> 'Ativa' then raise exception 'MATRICULA_INATIVA' using errcode = 'PT409'; end if;
  if p_data < v_hoje or p_data > v_hoje + app.cfg_int('reposicao_janela_dias') or app.inicio_aula(p_data, v_hora) <= now() then
    raise exception 'FORA_DA_JANELA' using errcode = 'PT409';
  end if;
  if app.reposicoes_no_mes(a.id_aluno, p_data) >= app.cfg_int('reposicao_limite_mes') then
    raise exception 'LIMITE_MES' using errcode = 'PT409';
  end if;

  select id into v_credito from app.creditos_reposicao
   where id_aluno = a.id_aluno and status = 'Disponivel' and valido_ate >= v_hoje
   order by valido_ate, criado_em limit 1 for update;
  if v_credito is null then raise exception 'SALDO_ZERO' using errcode = 'PT409'; end if;

  -- Recalcula as opções AGORA (sob lock): garante vaga, professor e sala livres.
  v_ops := app.opcoes_reposicao(a.id_aluno, p_data, v_hora);
  select o into v_op from jsonb_array_elements(v_ops) o
   where o->>'tipo' = p_tipo and (p_tipo = 'AVULSA' or (o->>'turma_id')::uuid = p_turma_id)
   limit 1;
  if v_op is null then raise exception 'HORARIO_INDISPONIVEL' using errcode = 'PT409'; end if;

  if p_tipo = 'AVULSA' then
    insert into app.aulas_avulsas (unidade_id, professor_id, sala_id, idioma, nivel_curso, modalidade, data, hora)
    values ((select id from app.unidades where nome = a.unidade), (v_op->>'professor_id')::uuid,
            nullif(v_op->>'sala_id', '')::uuid, v_op->>'idioma', v_op->>'nivel_curso', v_op->>'modalidade', p_data, v_hora)
    returning id into v_avulsa;
  end if;

  insert into app.reposicoes (id_aluno, credito_id, tipo, turma_id, aula_avulsa_id, data, hora)
  values (a.id_aluno, v_credito, p_tipo, case when p_tipo = 'TURMA' then p_turma_id end, v_avulsa, p_data, v_hora)
  returning id into v_id;

  update app.creditos_reposicao set status = 'Reservado' where id = v_credito;

  perform app.auditar('ALUNO', a.id_aluno, 'REPOSICAO_AGENDADA', 'reposicao', v_id::text, p_ip,
    jsonb_build_object('tipo', p_tipo, 'data', p_data, 'hora', v_hora, 'turma', v_op->>'codigo', 'professor', v_op->>'professor'));
  return v_op || jsonb_build_object('reposicao_id', v_id, 'data', p_data, 'hora', v_hora,
                                    'saldo', app.saldo_reposicao(a.id_aluno));
end $$;

create function public.aluno_cancelar_reposicao(p_token text, p_reposicao_id uuid, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.aluno_liberado(p_token);
  r app.reposicoes;
  v_tardio boolean;
begin
  perform app.lock_grade();
  select * into r from app.reposicoes where id = p_reposicao_id and id_aluno = a.id_aluno for update;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  if r.status <> 'Agendada' then raise exception 'REPOSICAO_NAO_AGENDADA' using errcode = 'PT409'; end if;
  if app.inicio_aula(r.data, r.hora) <= now() then raise exception 'REPOSICAO_JA_INICIADA' using errcode = 'PT409'; end if;

  v_tardio := app.inicio_aula(r.data, r.hora) - make_interval(hours => app.cfg_int('reposicao_antecedencia_horas')) < now();
  update app.reposicoes set status = 'Cancelada', cancelado_em = now(), cancelamento_tardio = v_tardio where id = r.id;
  update app.creditos_reposicao set status = case when v_tardio then 'Usado' else 'Disponivel' end where id = r.credito_id;

  perform app.auditar('ALUNO', a.id_aluno, 'REPOSICAO_CANCELADA', 'reposicao', r.id::text, p_ip,
                      jsonb_build_object('tardio', v_tardio, 'data', r.data, 'hora', r.hora));
  return jsonb_build_object('ok', true, 'credito_devolvido', not v_tardio, 'saldo', app.saldo_reposicao(a.id_aluno));
end $$;

create function public.aluno_presencas(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.aluno_liberado(p_token);
begin
  return jsonb_build_object(
    'resumo', (select jsonb_build_object(
                 'presencas', count(*) filter (where situacao = 'Presente'),
                 'faltas', count(*) filter (where situacao = 'Falta'))
               from (select situacao from app.presencas where id_aluno = a.id_aluno
                     union all
                     select case status when 'Realizada' then 'Presente' else 'Falta' end
                       from app.reposicoes where id_aluno = a.id_aluno and status in ('Realizada', 'Falta')) x),
    'registros', coalesce((
      select jsonb_agg(x order by x->>'data' desc, (x->>'hora')::int desc)
        from (
          select jsonb_build_object('data', pr.data, 'hora', pr.hora, 'tipo', 'Aula', 'turma', t.codigo, 'nome', t.nome,
                                    'situacao', pr.situacao) x
            from app.presencas pr join app.turmas t on t.id = pr.turma_id where pr.id_aluno = a.id_aluno
          union all
          select jsonb_build_object('data', r.data, 'hora', r.hora, 'tipo', 'Reposição',
                                    'turma', t.codigo, 'nome', coalesce(t.nome, 'Aula avulsa'),
                                    'situacao', case r.status when 'Realizada' then 'Presente' else 'Falta' end)
            from app.reposicoes r left join app.turmas t on t.id = r.turma_id
           where r.id_aluno = a.id_aluno and r.status in ('Realizada', 'Falta')
          limit 200
        ) s
    ), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- ADM: chamada por turma e presença em reposições
-- ---------------------------------------------------------------------------
create function public.adm_aulas_turma(p_token text, p_turma_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  t app.turmas;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  t := app.turma_no_escopo(u.id, p_turma_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'data', d::date, 'hora', h.hora,
             'registrada', exists (select 1 from app.presencas p where p.turma_id = t.id and p.data = d::date and p.hora = h.hora))
             order by d desc, h.hora desc)
      from generate_series(t.data_inicio, least(t.data_fim, app.hoje()), interval '1 day') d
      join app.turma_horarios h on h.turma_id = t.id and h.dia_semana = app.dia_semana(d::date)
     where app.inicio_aula(d::date, h.hora) <= now()
  ), '[]'::jsonb);
end $$;

create function public.adm_chamada(p_token text, p_turma_id uuid, p_data date, p_hora int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  t app.turmas;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  t := app.turma_no_escopo(u.id, p_turma_id);
  return jsonb_build_object(
    'regulares', coalesce((
      select jsonb_agg(jsonb_build_object('id_aluno', a.id_aluno, 'nome', a.nome, 'situacao', p.situacao) order by a.nome)
        from app.matricula_turma mt join app.alunos a on a.id_aluno = mt.id_aluno
        left join app.presencas p on p.turma_id = t.id and p.data = p_data and p.hora = p_hora and p.id_aluno = a.id_aluno
       where mt.turma_id = t.id), '[]'::jsonb),
    'reposicoes', coalesce((
      select jsonb_agg(jsonb_build_object('reposicao_id', r.id, 'id_aluno', a.id_aluno, 'nome', a.nome,
                                          'situacao', case r.status when 'Realizada' then 'Presente' when 'Falta' then 'Falta' end)
                       order by a.nome)
        from app.reposicoes r join app.alunos a on a.id_aluno = r.id_aluno
       where r.turma_id = t.id and r.data = p_data and r.hora = p_hora and r.status in ('Agendada', 'Realizada', 'Falta')), '[]'::jsonb));
end $$;

create function app.registrar_presenca_reposicao(p_usuario_id uuid, p_reposicao_id uuid, p_situacao text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r app.reposicoes;
begin
  select * into r from app.reposicoes where id = p_reposicao_id for update;
  if r.status not in ('Agendada', 'Realizada', 'Falta') then
    perform app.conflito('Esta reposição foi cancelada.');
  end if;
  update app.reposicoes
     set status = case p_situacao when 'Presente' then 'Realizada' else 'Falta' end,
         presenca_por = p_usuario_id, presenca_em = now()
   where id = r.id;
  update app.creditos_reposicao set status = 'Usado' where id = r.credito_id;
end $$;

-- p_registros: [{id_aluno, situacao}] para regulares e [{reposicao_id, situacao}] para reposições
create function public.adm_registrar_chamada(
  p_token text, p_turma_id uuid, p_data date, p_hora int, p_registros jsonb, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  t app.turmas;
  v_hora smallint := p_hora::smallint;
  e jsonb;
  v_sit text;
  c app.creditos_reposicao;
  v_faltas int := 0;
  v_pres int := 0;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  t := app.turma_no_escopo(u.id, p_turma_id);
  if not app.turma_tem_aula(t.id, p_data, v_hora) then
    perform app.invalido('Não há aula desta turma nesta data e horário.');
  end if;
  if app.inicio_aula(p_data, v_hora) > now() then
    perform app.invalido('Só é possível registrar a chamada de aulas que já começaram.');
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_registros, '[]')) loop
    v_sit := e->>'situacao';
    if v_sit not in ('Presente', 'Falta') then continue; end if;

    if e ? 'reposicao_id' then
      if not exists (select 1 from app.reposicoes where id = (e->>'reposicao_id')::uuid and turma_id = t.id
                      and data = p_data and hora = v_hora) then
        perform app.invalido('Reposição não pertence a esta aula.');
      end if;
      perform app.registrar_presenca_reposicao(u.id, (e->>'reposicao_id')::uuid, v_sit);
    else
      if not exists (select 1 from app.matricula_turma where turma_id = t.id and id_aluno = e->>'id_aluno') then
        perform app.invalido(format('O aluno %s não é desta turma.', e->>'id_aluno'));
      end if;
      insert into app.presencas (turma_id, data, hora, id_aluno, situacao, registrado_por)
      values (t.id, p_data, v_hora, e->>'id_aluno', v_sit, u.id)
      on conflict (turma_id, data, hora, id_aluno) do update
        set situacao = excluded.situacao, registrado_por = excluded.registrado_por, registrado_em = now();

      select * into c from app.creditos_reposicao
       where id_aluno = e->>'id_aluno' and turma_id = t.id and data_aula = p_data and hora = v_hora;
      if v_sit = 'Falta' and c.id is null then
        insert into app.creditos_reposicao (id_aluno, turma_id, data_aula, hora, valido_ate)
        values (e->>'id_aluno', t.id, p_data, v_hora,
                (date_trunc('month', p_data) + interval '2 months' - interval '1 day')::date);
      elsif v_sit = 'Presente' and c.id is not null then
        if c.status <> 'Disponivel' then
          perform app.conflito(format('A falta do aluno %s já gerou uma reposição agendada ou usada; não é possível trocar para presente.',
                                      e->>'id_aluno'));
        end if;
        delete from app.creditos_reposicao where id = c.id;
      end if;
    end if;
    if v_sit = 'Falta' then v_faltas := v_faltas + 1; else v_pres := v_pres + 1; end if;
  end loop;

  perform app.auditar('ADM', u.id::text, 'CHAMADA_REGISTRADA', 'turma', t.id::text, p_ip,
    jsonb_build_object('codigo', t.codigo, 'data', p_data, 'hora', v_hora, 'presentes', v_pres, 'faltas', v_faltas));
  return jsonb_build_object('presentes', v_pres, 'faltas', v_faltas);
end $$;

create function public.adm_listar_reposicoes(
  p_token text, p_de date default null, p_ate date default null, p_status text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'data', r.data, 'hora', r.hora, 'tipo', r.tipo, 'status', r.status,
             'cancelamento_tardio', r.cancelamento_tardio,
             'id_aluno', a.id_aluno, 'aluno', a.nome, 'unidade', a.unidade,
             'turma', t.codigo, 'turma_id', t.id,
             'professor', coalesce(pt.nome, pa.nome), 'sala', coalesce(st.nome, sa.nome),
             'modalidade', coalesce(t.modalidade, av.modalidade),
             'idioma', coalesce(t.idioma, av.idioma), 'nivel_curso', coalesce(t.nivel_curso, av.nivel_curso),
             'iniciada', app.inicio_aula(r.data, r.hora) <= now())
           order by r.data, r.hora, a.nome)
      from app.reposicoes r
      join app.alunos a on a.id_aluno = r.id_aluno
      left join app.turmas t on t.id = r.turma_id
      left join app.professores pt on pt.id = t.professor_id
      left join app.salas st on st.id = t.sala_id
      left join app.aulas_avulsas av on av.id = r.aula_avulsa_id
      left join app.professores pa on pa.id = av.professor_id
      left join app.salas sa on sa.id = av.sala_id
     where a.unidade in (select app.unidades_escopo(u.id))
       and r.data between coalesce(p_de, app.hoje() - 7) and coalesce(p_ate, app.hoje() + 14)
       and (nullif(p_status, '') is null or r.status = p_status)
  ), '[]'::jsonb);
end $$;

create function public.adm_registrar_presenca_reposicao(p_token text, p_reposicao_id uuid, p_situacao text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  r app.reposicoes;
begin
  perform app.exigir_permissao(u.id, 'GRADE_EDITAR');
  select rp.* into r from app.reposicoes rp join app.alunos a on a.id_aluno = rp.id_aluno
   where rp.id = p_reposicao_id and a.unidade in (select app.unidades_escopo(u.id));
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  if p_situacao not in ('Presente', 'Falta') then perform app.invalido('Situação inválida.'); end if;
  if app.inicio_aula(r.data, r.hora) > now() then
    perform app.invalido('Só é possível registrar presença de reposições que já começaram.');
  end if;
  perform app.registrar_presenca_reposicao(u.id, r.id, p_situacao);
  perform app.auditar('ADM', u.id::text, 'PRESENCA_REPOSICAO', 'reposicao', r.id::text, p_ip,
                      jsonb_build_object('id_aluno', r.id_aluno, 'situacao', p_situacao));
  return jsonb_build_object('ok', true);
end $$;

-- Saldo e reposições na ficha do aluno (ADM).
create function public.adm_reposicoes_aluno(p_token text, p_id_aluno text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_LER');
  if not exists (select 1 from app.alunos where id_aluno = p_id_aluno and unidade in (select app.unidades_escopo(u.id))) then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  return jsonb_build_object(
    'saldo', app.saldo_reposicao(p_id_aluno),
    'usadas_mes', app.reposicoes_no_mes(p_id_aluno, app.hoje()),
    'limite_mes', app.cfg_int('reposicao_limite_mes'),
    'faltas', (select count(*) from app.presencas where id_aluno = p_id_aluno and situacao = 'Falta'),
    'presencas', (select count(*) from app.presencas where id_aluno = p_id_aluno and situacao = 'Presente'));
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
       'aluno_painel', 'aluno_catalogo_reposicao', 'aluno_agendar_reposicao', 'aluno_cancelar_reposicao',
       'aluno_presencas', 'adm_aulas_turma', 'adm_chamada', 'adm_registrar_chamada', 'adm_listar_reposicoes',
       'adm_registrar_presenca_reposicao', 'adm_reposicoes_aluno')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
