-- Campanhas de Retenção (D68). Somente superadministrador.
-- Faixa: churn >= mínimo e < máximo; com máximo = 100, o 100 também entra.
-- Sobreposição: duas campanhas ATIVAS não podem ter, ao mesmo tempo, faixas
-- de churn e períodos (datas) que se cruzem. Inativas podem se sobrepor.

insert into app.permissoes (codigo, descricao) values
  ('CAMPANHAS_GERENCIAR', 'Cadastrar e gerenciar campanhas de retenção');
insert into app.papel_permissao (papel, permissao) values ('ADM_SUPERADMIN', 'CAMPANHAS_GERENCIAR');

create table app.campanhas_retencao (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null check (length(btrim(nome)) between 1 and 120),
  churn_minimo         numeric(5, 2) not null check (churn_minimo between 0 and 100),
  churn_maximo         numeric(5, 2) not null check (churn_maximo between 0 and 100),
  desconto_percentual  numeric(5, 2) not null check (desconto_percentual between 0 and 100),
  titulo_oferta        text not null check (length(btrim(titulo_oferta)) between 1 and 120),
  mensagem             text not null check (length(btrim(mensagem)) between 1 and 1000),
  data_inicio          date not null,
  data_fim             date not null,
  ativa                boolean not null default true,
  criado_por           uuid not null references app.usuarios_adm (id),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  check (churn_minimo < churn_maximo),
  check (data_fim > data_inicio)
);
revoke all on app.campanhas_retencao from public, anon, authenticated;

-- O churn p pertence à faixa [mínimo, máximo) — ou [mínimo, 100] quando o máximo é 100.
create function app.churn_na_faixa(p numeric, p_min numeric, p_max numeric) returns boolean
language sql immutable set search_path = '' as $$
  select p >= p_min and (p < p_max or (p_max = 100 and p = 100))
$$;

-- Faixas [a1,a2) e [b1,b2) se cruzam? (o 100 incluído não muda: mínimo < 100 sempre)
create function app.faixas_cruzam(a1 numeric, a2 numeric, b1 numeric, b2 numeric) returns boolean
language sql immutable set search_path = '' as $$
  select a1 < b2 and b1 < a2
$$;

-- Primeira campanha ativa que conflita com os parâmetros (null se nenhuma).
create function app.campanha_conflitante(
  p_id uuid, p_min numeric, p_max numeric, p_ini date, p_fim date
) returns app.campanhas_retencao
language sql stable security definer set search_path = '' as $$
  select c.* from app.campanhas_retencao c
   where c.ativa and c.id is distinct from p_id
     and app.faixas_cruzam(c.churn_minimo, c.churn_maximo, p_min, p_max)
     and c.data_inicio <= p_fim and p_ini <= c.data_fim
   order by c.churn_minimo, c.data_inicio
   limit 1
$$;

create function app.validar_campanha(
  p_id uuid, p_nome text, p_min numeric, p_max numeric, p_desc numeric,
  p_titulo text, p_msg text, p_ini date, p_fim date, p_ativa boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c app.campanhas_retencao;
  fmt constant text := 'DD/MM/YYYY';
begin
  if nullif(btrim(coalesce(p_nome, '')), '') is null then perform app.invalido('Informe o nome da campanha.'); end if;
  if length(btrim(p_nome)) > 120 then perform app.invalido('O nome pode ter até 120 caracteres.'); end if;
  if p_min is null or p_max is null then perform app.invalido('Informe o churn mínimo e o churn máximo.'); end if;
  if p_min < 0 or p_min > 100 or p_max < 0 or p_max > 100 then perform app.invalido('Churn mínimo e máximo devem estar entre 0 e 100.'); end if;
  if p_min >= p_max then perform app.invalido('O churn mínimo deve ser menor que o churn máximo.'); end if;
  if p_desc is null or p_desc < 0 or p_desc > 100 then perform app.invalido('O desconto deve estar entre 0 e 100%.'); end if;
  if nullif(btrim(coalesce(p_titulo, '')), '') is null then perform app.invalido('Informe o título da oferta.'); end if;
  if length(btrim(p_titulo)) > 120 then perform app.invalido('O título da oferta pode ter até 120 caracteres.'); end if;
  if nullif(btrim(coalesce(p_msg, '')), '') is null then perform app.invalido('Informe a mensagem para o aluno.'); end if;
  if length(btrim(p_msg)) > 1000 then perform app.invalido('A mensagem pode ter até 1000 caracteres.'); end if;
  if p_ini is null or p_fim is null then perform app.invalido('Informe a data de início e a data de fim.'); end if;
  if p_fim <= p_ini then perform app.invalido('A data de fim deve ser depois da data de início.'); end if;

  if p_ativa then
    c := app.campanha_conflitante(p_id, p_min, p_max, p_ini, p_fim);
    if c.id is not null then
      perform app.conflito(format(
        'A campanha ativa "%s" (churn %s%% a %s%%, de %s a %s) cruza com esta na faixa de churn e no período. Ajuste a faixa ou as datas, ou desative uma delas.',
        c.nome, trim(to_char(c.churn_minimo, 'FM990.##')), trim(to_char(c.churn_maximo, 'FM990.##')),
        to_char(c.data_inicio, fmt), to_char(c.data_fim, fmt)));
    end if;
  end if;
end $$;

create function app.campanha_json(c app.campanhas_retencao) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) - 'criado_por' || jsonb_build_object(
    'alunos_na_faixa', (select count(*) from app.churn_previsao p
                         where app.churn_na_faixa(p.probabilidade_churn, c.churn_minimo, c.churn_maximo)),
    'vigencia', case when app.hoje() < c.data_inicio then 'agendada'
                     when app.hoje() > c.data_fim then 'encerrada' else 'em vigor' end)
$$;

create function public.adm_campanhas_listar(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'CAMPANHAS_GERENCIAR');
  return jsonb_build_object(
    'campanhas', coalesce((select jsonb_agg(app.campanha_json(c) order by c.churn_minimo, c.churn_maximo, c.data_inicio, c.nome)
                             from app.campanhas_retencao c), '[]'::jsonb),
    'total_previsoes', (select count(*) from app.churn_previsao));
end $$;

create function public.adm_campanha_obter(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  c app.campanhas_retencao;
begin
  perform app.exigir_permissao(u.id, 'CAMPANHAS_GERENCIAR');
  select * into c from app.campanhas_retencao where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  return app.campanha_json(c);
end $$;

create function public.adm_campanha_salvar(
  p_token text, p_id uuid, p_nome text, p_churn_minimo numeric, p_churn_maximo numeric,
  p_desconto numeric, p_titulo text, p_mensagem text, p_data_inicio date, p_data_fim date,
  p_ativa boolean default true, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_id uuid;
begin
  perform app.exigir_permissao(u.id, 'CAMPANHAS_GERENCIAR');
  perform pg_advisory_xact_lock(hashtext('campanhas_retencao'));
  if p_id is not null and not exists (select 1 from app.campanhas_retencao where id = p_id) then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  perform app.validar_campanha(p_id, p_nome, p_churn_minimo, p_churn_maximo, p_desconto,
                               p_titulo, p_mensagem, p_data_inicio, p_data_fim, coalesce(p_ativa, true));

  if p_id is null then
    insert into app.campanhas_retencao (nome, churn_minimo, churn_maximo, desconto_percentual, titulo_oferta, mensagem,
                                        data_inicio, data_fim, ativa, criado_por)
    values (btrim(p_nome), p_churn_minimo, p_churn_maximo, p_desconto, btrim(p_titulo), btrim(p_mensagem),
            p_data_inicio, p_data_fim, coalesce(p_ativa, true), u.id)
    returning id into v_id;
  else
    update app.campanhas_retencao
       set nome = btrim(p_nome), churn_minimo = p_churn_minimo, churn_maximo = p_churn_maximo,
           desconto_percentual = p_desconto, titulo_oferta = btrim(p_titulo), mensagem = btrim(p_mensagem),
           data_inicio = p_data_inicio, data_fim = p_data_fim, ativa = coalesce(p_ativa, true), atualizado_em = now()
     where id = p_id
    returning id into v_id;
  end if;

  perform app.auditar('ADM', u.id::text, case when p_id is null then 'CAMPANHA_CRIADA' else 'CAMPANHA_ALTERADA' end,
                      'campanha', v_id::text, p_ip,
                      jsonb_build_object('nome', btrim(p_nome), 'churn', format('%s–%s', p_churn_minimo, p_churn_maximo),
                                         'desconto', p_desconto, 'ativa', coalesce(p_ativa, true)));
  return jsonb_build_object('id', v_id);
end $$;

create function public.adm_campanha_definir_ativa(p_token text, p_id uuid, p_ativa boolean, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  c app.campanhas_retencao;
begin
  perform app.exigir_permissao(u.id, 'CAMPANHAS_GERENCIAR');
  perform pg_advisory_xact_lock(hashtext('campanhas_retencao'));
  select * into c from app.campanhas_retencao where id = p_id for update;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  if p_ativa then
    perform app.validar_campanha(c.id, c.nome, c.churn_minimo, c.churn_maximo, c.desconto_percentual,
                                 c.titulo_oferta, c.mensagem, c.data_inicio, c.data_fim, true);
  end if;
  update app.campanhas_retencao set ativa = p_ativa, atualizado_em = now() where id = p_id;
  perform app.auditar('ADM', u.id::text, case when p_ativa then 'CAMPANHA_ATIVADA' else 'CAMPANHA_DESATIVADA' end,
                      'campanha', p_id::text, p_ip, jsonb_build_object('nome', c.nome));
  return jsonb_build_object('ativa', p_ativa);
end $$;

create function public.adm_campanha_excluir(p_token text, p_id uuid, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  c app.campanhas_retencao;
begin
  perform app.exigir_permissao(u.id, 'CAMPANHAS_GERENCIAR');
  delete from app.campanhas_retencao where id = p_id returning * into c;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  perform app.auditar('ADM', u.id::text, 'CAMPANHA_EXCLUIDA', 'campanha', p_id::text, p_ip, to_jsonb(c) - 'criado_por');
  return jsonb_build_object('ok', true);
end $$;

revoke all on all functions in schema app from public, anon, authenticated;

do $$
declare
  f text;
begin
  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'adm_campanhas_listar', 'adm_campanha_obter', 'adm_campanha_salvar', 'adm_campanha_definir_ativa', 'adm_campanha_excluir')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
