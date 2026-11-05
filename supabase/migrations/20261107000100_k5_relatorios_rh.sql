-- K5 · Empresas clientes, vínculo aluno↔empresa, notas (4 competências + CEFR),
-- relatório de RH (frequência, notas, elegibilidade) com registro de envio.

-- ---------------------------------------------------------------------------
-- Permissões novas
-- ---------------------------------------------------------------------------
insert into app.permissoes (codigo, descricao) values
  ('EMPRESAS_GERENCIAR', 'Cadastrar empresas clientes e vincular alunos'),
  ('NOTAS_LANCAR', 'Lançar notas e nível CEFR');
insert into app.papel_permissao (papel, permissao) values
  ('ADM_SUPERADMIN', 'EMPRESAS_GERENCIAR'), ('ADM_SUPERADMIN', 'NOTAS_LANCAR'),
  ('ADM_COORDENACAO', 'EMPRESAS_GERENCIAR'), ('ADM_COORDENACAO', 'NOTAS_LANCAR');

update app.papeis set descricao = 'RH da empresa cliente: relatórios dos alunos das empresas vinculadas'
 where codigo = 'ADM_RH';

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table app.empresas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(btrim(nome)) > 0),
  cnpj           text check (cnpj is null or cnpj ~ '^\d{14}$'),
  contato_nome   text,
  contato_email  text check (contato_email is null or contato_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  freq_minima    numeric(5, 2) not null default 75 check (freq_minima between 0 and 100),
  media_minima   numeric(4, 2) not null default 7 check (media_minima between 0 and 10),
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now()
);
create unique index empresas_nome_uidx on app.empresas (lower(nome));
create unique index empresas_cnpj_uidx on app.empresas (cnpj) where cnpj is not null;

-- Um aluno pertence a no máximo uma empresa.
create table app.aluno_empresa (
  id_aluno    text primary key references app.alunos (id_aluno) on update cascade on delete cascade,
  empresa_id  uuid not null references app.empresas (id),
  desde       date not null default current_date
);
create index aluno_empresa_empresa_idx on app.aluno_empresa (empresa_id);

-- Empresas que um usuário de RH pode consultar.
create table app.usuario_empresa (
  usuario_id  uuid not null references app.usuarios_adm (id) on delete cascade,
  empresa_id  uuid not null references app.empresas (id) on delete cascade,
  primary key (usuario_id, empresa_id)
);

create table app.avaliacoes (
  id           uuid primary key default gen_random_uuid(),
  turma_id     uuid not null references app.turmas (id) on delete cascade,
  id_aluno     text not null references app.alunos (id_aluno) on update cascade,
  data         date not null,
  speaking     numeric(4, 2) check (speaking between 0 and 10),
  listening    numeric(4, 2) check (listening between 0 and 10),
  reading      numeric(4, 2) check (reading between 0 and 10),
  writing      numeric(4, 2) check (writing between 0 and 10),
  cefr         text check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  observacao   text,
  lancado_por  uuid not null references app.usuarios_adm (id),
  lancado_em   timestamptz not null default now(),
  unique (turma_id, id_aluno, data),
  check (coalesce(speaking, listening, reading, writing) is not null or cefr is not null)
);
create index avaliacoes_aluno_idx on app.avaliacoes (id_aluno, data);

create table app.relatorios_envios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas (id),
  inicio       date not null,
  fim          date not null,
  gerado_por   uuid not null references app.usuarios_adm (id),
  gerado_em    timestamptz not null default now(),
  formato      text not null default 'csv',
  registros    integer not null,
  elegiveis    integer not null
);
create index relatorios_envios_empresa_idx on app.relatorios_envios (empresa_id, gerado_em desc);

revoke all on app.empresas, app.aluno_empresa, app.usuario_empresa, app.avaliacoes, app.relatorios_envios
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Escopo
-- ---------------------------------------------------------------------------
-- RH (sem TODAS_UNIDADES e sem ALUNOS_LER) enxerga por empresa; demais, por unidade.
create function app.eh_rh(p_usuario_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select papel = 'ADM_RH' from app.usuarios_adm where id = p_usuario_id
$$;

create function app.empresa_visivel(p_usuario_id uuid, p_empresa_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when app.eh_rh(p_usuario_id) then exists (select 1 from app.usuario_empresa where usuario_id = p_usuario_id and empresa_id = p_empresa_id)
    else exists (select 1 from app.empresas where id = p_empresa_id)
  end
$$;

-- Alunos de uma empresa que o usuário pode ver no relatório.
create function app.alunos_relatorio(p_usuario_id uuid, p_empresa_id uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select ae.id_aluno
    from app.aluno_empresa ae join app.alunos a on a.id_aluno = ae.id_aluno
   where ae.empresa_id = p_empresa_id
     and app.empresa_visivel(p_usuario_id, p_empresa_id)
     and (app.eh_rh(p_usuario_id) or a.unidade in (select app.unidades_escopo(p_usuario_id)))
$$;

-- ---------------------------------------------------------------------------
-- EMPRESAS
-- ---------------------------------------------------------------------------
create function public.adm_listar_empresas(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  if not (app.tem_permissao(u.id, 'EMPRESAS_GERENCIAR') or app.tem_permissao(u.id, 'RELATORIOS_LER')) then
    raise exception 'SEM_PERMISSAO' using errcode = 'PT403';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(e) || jsonb_build_object(
             'alunos', (select count(*) from app.alunos_relatorio(u.id, e.id)),
             'ultimo_envio', (select max(gerado_em) from app.relatorios_envios r where r.empresa_id = e.id))
           order by e.nome)
      from app.empresas e
     where app.empresa_visivel(u.id, e.id)
  ), '[]'::jsonb);
end $$;

create function public.adm_obter_empresa(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  e app.empresas;
begin
  perform app.exigir_permissao(u.id, 'EMPRESAS_GERENCIAR');
  select * into e from app.empresas where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  return to_jsonb(e) || jsonb_build_object(
    'alunos', coalesce((
      select jsonb_agg(jsonb_build_object('id_aluno', a.id_aluno, 'nome', a.nome, 'unidade', a.unidade,
                                          'status_matricula', a.status_matricula, 'desde', ae.desde) order by a.nome)
        from app.aluno_empresa ae join app.alunos a on a.id_aluno = ae.id_aluno
       where ae.empresa_id = e.id and a.unidade in (select app.unidades_escopo(u.id))), '[]'::jsonb));
end $$;

create function public.adm_salvar_empresa(
  p_token text, p_id uuid, p_nome text, p_cnpj text, p_contato_nome text, p_contato_email text,
  p_freq_minima numeric, p_media_minima numeric, p_ativa boolean default true, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_id uuid := p_id;
  v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
begin
  perform app.exigir_permissao(u.id, 'EMPRESAS_GERENCIAR');
  if coalesce(btrim(p_nome), '') = '' then perform app.invalido('Informe o nome da empresa.'); end if;
  if v_cnpj is not null and length(v_cnpj) <> 14 then perform app.invalido('O CNPJ deve ter 14 dígitos.'); end if;
  if nullif(btrim(p_contato_email), '') is not null and btrim(p_contato_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.invalido('E-mail de contato inválido.');
  end if;
  if p_freq_minima is null or p_freq_minima < 0 or p_freq_minima > 100 then perform app.invalido('Frequência mínima deve estar entre 0 e 100.'); end if;
  if p_media_minima is null or p_media_minima < 0 or p_media_minima > 10 then perform app.invalido('Média mínima deve estar entre 0 e 10.'); end if;
  if exists (select 1 from app.empresas where lower(nome) = lower(btrim(p_nome)) and id is distinct from v_id) then
    raise exception 'EMPRESA_JA_EXISTE' using errcode = 'PT409';
  end if;
  if v_cnpj is not null and exists (select 1 from app.empresas where cnpj = v_cnpj and id is distinct from v_id) then
    raise exception 'CNPJ_JA_CADASTRADO' using errcode = 'PT409';
  end if;

  if v_id is null then
    insert into app.empresas (nome, cnpj, contato_nome, contato_email, freq_minima, media_minima, ativa)
    values (btrim(p_nome), v_cnpj, nullif(btrim(p_contato_nome), ''), nullif(lower(btrim(p_contato_email)), ''),
            p_freq_minima, p_media_minima, coalesce(p_ativa, true))
    returning id into v_id;
  else
    update app.empresas set nome = btrim(p_nome), cnpj = v_cnpj, contato_nome = nullif(btrim(p_contato_nome), ''),
           contato_email = nullif(lower(btrim(p_contato_email)), ''), freq_minima = p_freq_minima,
           media_minima = p_media_minima, ativa = coalesce(p_ativa, true)
     where id = v_id;
    if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  end if;
  perform app.auditar('ADM', u.id::text, case when p_id is null then 'EMPRESA_CRIADA' else 'EMPRESA_ALTERADA' end,
                      'empresa', v_id::text, p_ip, jsonb_build_object('nome', btrim(p_nome)));
  return jsonb_build_object('id', v_id);
end $$;

-- Vincula (ou move) alunos do escopo à empresa. Retorna os não encontrados.
create function public.adm_vincular_alunos_empresa(p_token text, p_empresa_id uuid, p_ids text[], p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_ids text[] := array(select distinct btrim(x) from unnest(coalesce(p_ids, '{}')) x where btrim(x) <> '');
  v_ok text[];
begin
  perform app.exigir_permissao(u.id, 'EMPRESAS_GERENCIAR');
  if not exists (select 1 from app.empresas where id = p_empresa_id) then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  select coalesce(array_agg(a.id_aluno), '{}') into v_ok
    from app.alunos a where a.id_aluno = any (v_ids) and a.unidade in (select app.unidades_escopo(u.id));

  insert into app.aluno_empresa (id_aluno, empresa_id)
  select x, p_empresa_id from unnest(v_ok) x
  on conflict (id_aluno) do update set empresa_id = excluded.empresa_id, desde = current_date
   where app.aluno_empresa.empresa_id <> excluded.empresa_id;

  if cardinality(v_ok) > 0 then
    perform app.auditar('ADM', u.id::text, 'ALUNOS_VINCULADOS_EMPRESA', 'empresa', p_empresa_id::text, p_ip,
                        jsonb_build_object('quantidade', cardinality(v_ok)));
  end if;
  return jsonb_build_object('vinculados', cardinality(v_ok),
                            'nao_encontrados', to_jsonb(array(select x from unnest(v_ids) x where not (x = any (v_ok)))));
end $$;

create function public.adm_desvincular_aluno_empresa(p_token text, p_id_aluno text, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_emp uuid;
begin
  perform app.exigir_permissao(u.id, 'EMPRESAS_GERENCIAR');
  delete from app.aluno_empresa ae using app.alunos a
   where ae.id_aluno = p_id_aluno and a.id_aluno = ae.id_aluno and a.unidade in (select app.unidades_escopo(u.id))
  returning ae.empresa_id into v_emp;
  if v_emp is not null then
    perform app.auditar('ADM', u.id::text, 'ALUNO_DESVINCULADO_EMPRESA', 'empresa', v_emp::text, p_ip,
                        jsonb_build_object('id_aluno', p_id_aluno));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Empresa do aluno (para a ficha).
create function public.adm_empresa_do_aluno(p_token text, p_id_aluno text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_LER');
  return (select jsonb_build_object('id', e.id, 'nome', e.nome, 'desde', ae.desde)
            from app.aluno_empresa ae join app.empresas e on e.id = ae.empresa_id join app.alunos a on a.id_aluno = ae.id_aluno
           where ae.id_aluno = p_id_aluno and a.unidade in (select app.unidades_escopo(u.id)));
end $$;

-- Empresas que um usuário de RH pode consultar (gestão de usuários).
create function public.adm_definir_empresas_usuario(p_token text, p_usuario_id uuid, p_empresas uuid[], p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'USUARIOS_GERENCIAR');
  if not exists (select 1 from app.usuarios_adm where id = p_usuario_id and papel = 'ADM_RH') then
    perform app.invalido('Empresas só se vinculam a usuários de RH.');
  end if;
  delete from app.usuario_empresa where usuario_id = p_usuario_id;
  insert into app.usuario_empresa (usuario_id, empresa_id)
  select p_usuario_id, e.id from app.empresas e where e.id = any (coalesce(p_empresas, '{}'));
  perform app.auditar('ADM', u.id::text, 'USUARIO_EMPRESAS_DEFINIDAS', 'usuario_adm', p_usuario_id::text, p_ip,
                      jsonb_build_object('empresas', cardinality(coalesce(p_empresas, '{}'))));
  return jsonb_build_object('ok', true);
end $$;

create function public.adm_empresas_usuarios_rh(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'USUARIOS_GERENCIAR');
  return coalesce((select jsonb_object_agg(x.usuario_id, x.empresas) from (
    select ue.usuario_id::text as usuario_id, jsonb_agg(ue.empresa_id) as empresas
      from app.usuario_empresa ue group by ue.usuario_id) x), '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- NOTAS
-- ---------------------------------------------------------------------------
create function public.adm_avaliacoes_turma(p_token text, p_turma_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  t app.turmas;
begin
  perform app.exigir_permissao(u.id, 'NOTAS_LANCAR');
  t := app.turma_no_escopo(u.id, p_turma_id);
  return jsonb_build_object(
    'alunos', coalesce((select jsonb_agg(jsonb_build_object('id_aluno', a.id_aluno, 'nome', a.nome,
                          'cefr_atual', (select av.cefr from app.avaliacoes av where av.id_aluno = a.id_aluno and av.cefr is not null
                                          order by av.data desc limit 1)) order by a.nome)
                         from app.matricula_turma mt join app.alunos a on a.id_aluno = mt.id_aluno where mt.turma_id = t.id), '[]'::jsonb),
    'avaliacoes', coalesce((select jsonb_agg(to_jsonb(av) - 'lancado_por' || jsonb_build_object('nome', a.nome) order by av.data desc, a.nome)
                              from app.avaliacoes av join app.alunos a on a.id_aluno = av.id_aluno where av.turma_id = t.id), '[]'::jsonb));
end $$;

-- p_registros: [{id_aluno, speaking, listening, reading, writing, cefr, observacao}]
create function public.adm_lancar_avaliacoes(p_token text, p_turma_id uuid, p_data date, p_registros jsonb, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  t app.turmas;
  e jsonb;
  v_n int := 0;
  v_nota numeric;
  k text;
begin
  perform app.exigir_permissao(u.id, 'NOTAS_LANCAR');
  t := app.turma_no_escopo(u.id, p_turma_id);
  if p_data is null or p_data > app.hoje() then perform app.invalido('A data da avaliação não pode ser futura.'); end if;
  if p_data < t.data_inicio then perform app.invalido('A data é anterior ao início da turma.'); end if;

  for e in select * from jsonb_array_elements(coalesce(p_registros, '[]')) loop
    if not exists (select 1 from app.matricula_turma where turma_id = t.id and id_aluno = e->>'id_aluno') then
      perform app.invalido(format('O aluno %s não é desta turma.', e->>'id_aluno'));
    end if;
    foreach k in array array['speaking', 'listening', 'reading', 'writing'] loop
      if nullif(e->>k, '') is not null then
        begin
          v_nota := (e->>k)::numeric;
        exception when others then
          perform app.invalido(format('Nota inválida em %s para o aluno %s.', k, e->>'id_aluno'));
        end;
        if v_nota < 0 or v_nota > 10 then
          perform app.invalido(format('Nota de %s do aluno %s deve estar entre 0 e 10.', k, e->>'id_aluno'));
        end if;
      end if;
    end loop;
    if nullif(e->>'cefr', '') is not null and e->>'cefr' not in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') then
      perform app.invalido(format('Nível CEFR inválido para o aluno %s.', e->>'id_aluno'));
    end if;
    continue when coalesce(nullif(e->>'speaking', ''), nullif(e->>'listening', ''), nullif(e->>'reading', ''),
                           nullif(e->>'writing', ''), nullif(e->>'cefr', '')) is null;

    insert into app.avaliacoes (turma_id, id_aluno, data, speaking, listening, reading, writing, cefr, observacao, lancado_por)
    values (t.id, e->>'id_aluno', p_data, nullif(e->>'speaking', '')::numeric, nullif(e->>'listening', '')::numeric,
            nullif(e->>'reading', '')::numeric, nullif(e->>'writing', '')::numeric, nullif(e->>'cefr', ''),
            nullif(btrim(e->>'observacao'), ''), u.id)
    on conflict (turma_id, id_aluno, data) do update set
      speaking = excluded.speaking, listening = excluded.listening, reading = excluded.reading, writing = excluded.writing,
      cefr = excluded.cefr, observacao = excluded.observacao, lancado_por = excluded.lancado_por, lancado_em = now();
    v_n := v_n + 1;
  end loop;

  perform app.auditar('ADM', u.id::text, 'NOTAS_LANCADAS', 'turma', t.id::text, p_ip,
                      jsonb_build_object('codigo', t.codigo, 'data', p_data, 'alunos', v_n));
  return jsonb_build_object('lancadas', v_n);
end $$;

-- ---------------------------------------------------------------------------
-- RELATÓRIO DE RH (dados até o dia anterior: D+1)
-- ---------------------------------------------------------------------------
create function public.adm_relatorio_rh(
  p_token text, p_empresa_id uuid, p_inicio date default null, p_fim date default null,
  p_registrar_envio boolean default false, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  e app.empresas;
  v_ontem date := app.hoje() - 1;
  v_inicio date := coalesce(p_inicio, date_trunc('month', v_ontem)::date);
  v_fim date := least(coalesce(p_fim, v_ontem), v_ontem);
  v_linhas jsonb;
  v_envio uuid;
begin
  perform app.exigir_permissao(u.id, 'RELATORIOS_LER');
  select * into e from app.empresas where id = p_empresa_id;
  if not found or not app.empresa_visivel(u.id, e.id) then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  if v_inicio > v_fim then perform app.invalido('O início do período deve ser anterior ao fim (dados disponíveis até ontem).'); end if;

  with alunos as (
    select a.* from app.alunos a where a.id_aluno in (select app.alunos_relatorio(u.id, e.id))
  ),
  freq as (
    select al.id_aluno,
           count(p.*) as aulas,
           count(p.*) filter (where p.situacao = 'Presente') as presentes,
           count(p.*) filter (where p.situacao = 'Falta') as faltas,
           (select count(*) from app.reposicoes r where r.id_aluno = al.id_aluno and r.status = 'Realizada'
              and r.data between v_inicio and v_fim) as reposicoes
      from alunos al left join app.presencas p on p.id_aluno = al.id_aluno and p.data between v_inicio and v_fim
     group by al.id_aluno
  ),
  notas as (
    select av.id_aluno,
           round(avg(av.speaking), 2) as speaking, round(avg(av.listening), 2) as listening,
           round(avg(av.reading), 2) as reading, round(avg(av.writing), 2) as writing,
           round(avg((coalesce(av.speaking, 0) + coalesce(av.listening, 0) + coalesce(av.reading, 0) + coalesce(av.writing, 0))
                     / nullif((av.speaking is not null)::int + (av.listening is not null)::int
                              + (av.reading is not null)::int + (av.writing is not null)::int, 0)), 2) as media
      from app.avaliacoes av
     where av.id_aluno in (select id_aluno from alunos) and av.data between v_inicio and v_fim
     group by av.id_aluno
  ),
  calc as (
    select al.id_aluno, al.nome, al.unidade, al.status_matricula, al.nivel_curso,
           f.aulas, f.presentes, f.faltas, f.reposicoes,
           case when f.aulas > 0 then round(100.0 * least(f.presentes + f.reposicoes, f.aulas) / f.aulas, 1) end as frequencia,
           n.speaking, n.listening, n.reading, n.writing, n.media,
           (select av.cefr from app.avaliacoes av where av.id_aluno = al.id_aluno and av.cefr is not null and av.data <= v_fim
             order by av.data asc limit 1) as cefr_inicial,
           (select av.cefr from app.avaliacoes av where av.id_aluno = al.id_aluno and av.cefr is not null and av.data <= v_fim
             order by av.data desc limit 1) as cefr_atual,
           (select string_agg(distinct t.codigo, ', ') from app.matricula_turma mt join app.turmas t on t.id = mt.turma_id
             where mt.id_aluno = al.id_aluno) as turmas
      from alunos al join freq f on f.id_aluno = al.id_aluno left join notas n on n.id_aluno = al.id_aluno
  )
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
           'elegivel', c.frequencia is not null and c.media is not null
                       and c.frequencia >= e.freq_minima and c.media >= e.media_minima,
           'motivo', case
             when c.aulas = 0 then 'Sem aulas registradas no período'
             when c.media is null then 'Sem notas no período'
             when c.frequencia < e.freq_minima and c.media < e.media_minima then 'Frequência e média abaixo do mínimo'
             when c.frequencia < e.freq_minima then 'Frequência abaixo do mínimo'
             when c.media < e.media_minima then 'Média abaixo do mínimo'
             else null end)
           order by c.nome), '[]'::jsonb)
    into v_linhas
    from calc c;

  if p_registrar_envio then
    insert into app.relatorios_envios (empresa_id, inicio, fim, gerado_por, registros, elegiveis)
    values (e.id, v_inicio, v_fim, u.id, jsonb_array_length(v_linhas),
            (select count(*) from jsonb_array_elements(v_linhas) x where (x->>'elegivel')::boolean))
    returning id into v_envio;
    perform app.auditar('ADM', u.id::text, 'RELATORIO_RH_GERADO', 'empresa', e.id::text, p_ip,
      jsonb_build_object('inicio', v_inicio, 'fim', v_fim, 'registros', jsonb_array_length(v_linhas), 'envio', v_envio));
  end if;

  return jsonb_build_object(
    'empresa', jsonb_build_object('id', e.id, 'nome', e.nome, 'freq_minima', e.freq_minima, 'media_minima', e.media_minima),
    'inicio', v_inicio, 'fim', v_fim, 'atualizado_ate', v_ontem, 'envio_id', v_envio,
    'resumo', (select jsonb_build_object(
                 'alunos', count(*),
                 'elegiveis', count(*) filter (where (x->>'elegivel')::boolean),
                 'frequencia_media', round(avg((x->>'frequencia')::numeric), 1),
                 'media_geral', round(avg((x->>'media')::numeric), 2))
               from jsonb_array_elements(v_linhas) x),
    'linhas', v_linhas,
    'envios', coalesce((select jsonb_agg(jsonb_build_object('gerado_em', r.gerado_em, 'inicio', r.inicio, 'fim', r.fim,
                                                            'registros', r.registros, 'elegiveis', r.elegiveis, 'por', ua.nome)
                                         order by r.gerado_em desc)
                          from (select * from app.relatorios_envios where empresa_id = e.id order by gerado_em desc limit 10) r
                          join app.usuarios_adm ua on ua.id = r.gerado_por), '[]'::jsonb));
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
       'adm_listar_empresas', 'adm_obter_empresa', 'adm_salvar_empresa', 'adm_vincular_alunos_empresa',
       'adm_desvincular_aluno_empresa', 'adm_empresa_do_aluno', 'adm_definir_empresas_usuario',
       'adm_empresas_usuarios_rh', 'adm_avaliacoes_turma', 'adm_lancar_avaliacoes', 'adm_relatorio_rh')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
