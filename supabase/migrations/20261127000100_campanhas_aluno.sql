-- Campanhas de Retenção no portal do aluno (D69).
-- O aluno vê a oferta quando: tem previsão de churn com o mesmo id_aluno, existe
-- campanha ATIVA cuja faixa inclui esse churn e hoje está dentro do período.
-- Matrícula Cancelada não recebe oferta. "Tenho interesse" fica registrado.

create table app.campanha_interesses (
  campanha_id    uuid not null references app.campanhas_retencao (id) on delete cascade,
  id_aluno       text not null references app.alunos (id_aluno) on update cascade on delete cascade,
  churn          numeric(5, 2),
  registrado_em  timestamptz not null default now(),
  primary key (campanha_id, id_aluno)
);
revoke all on app.campanha_interesses from public, anon, authenticated;

-- Campanha vigente do aluno (no máximo uma, pela regra de sobreposição; por
-- segurança, a de maior desconto).
create function app.campanha_do_aluno(p_id_aluno text) returns app.campanhas_retencao
language sql stable security definer set search_path = '' as $$
  select c.*
    from app.churn_previsao p
    join app.campanhas_retencao c
      on c.ativa and app.hoje() between c.data_inicio and c.data_fim
     and app.churn_na_faixa(p.probabilidade_churn, c.churn_minimo, c.churn_maximo)
   where p_id_aluno ~ '^[0-9]{1,15}$' and p.id_aluno = p_id_aluno::bigint
   order by c.desconto_percentual desc, c.data_fim
   limit 1
$$;

create function public.aluno_oferta_retencao(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.sessao_aluno(p_token);
  c app.campanhas_retencao;
begin
  if a.status_matricula = 'Cancelada' then return null; end if;
  c := app.campanha_do_aluno(a.id_aluno);
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'campanha_id', c.id, 'titulo', c.titulo_oferta, 'mensagem', c.mensagem,
    'desconto', c.desconto_percentual, 'data_fim', c.data_fim,
    'interesse_em', (select i.registrado_em from app.campanha_interesses i where i.campanha_id = c.id and i.id_aluno = a.id_aluno));
end $$;

create function public.aluno_registrar_interesse(p_token text, p_campanha_id uuid, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.sessao_aluno(p_token);
  c app.campanhas_retencao;
begin
  if a.status_matricula <> 'Cancelada' then c := app.campanha_do_aluno(a.id_aluno); end if;
  -- Só registra interesse na campanha que está sendo oferecida a este aluno agora.
  if c.id is null or c.id <> p_campanha_id then
    raise exception 'OFERTA_INDISPONIVEL' using errcode = 'PT409';
  end if;
  insert into app.campanha_interesses (campanha_id, id_aluno, churn)
  values (c.id, a.id_aluno, (select probabilidade_churn from app.churn_previsao where id_aluno = a.id_aluno::bigint))
  on conflict do nothing;
  if found then
    perform app.auditar('ALUNO', a.id_aluno, 'CAMPANHA_INTERESSE', 'campanha', c.id::text, p_ip,
                        jsonb_build_object('campanha', c.nome, 'desconto', c.desconto_percentual));
  end if;
  return jsonb_build_object('registrado_em',
    (select registrado_em from app.campanha_interesses where campanha_id = c.id and id_aluno = a.id_aluno));
end $$;

-- Painel: lista de interessados de uma campanha.
create function public.adm_campanha_interessados(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'CAMPANHAS_GERENCIAR');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id_aluno', a.id_aluno, 'nome', a.nome, 'email', a.email, 'unidade', a.unidade,
                                        'status_matricula', a.status_matricula, 'churn', i.churn, 'registrado_em', i.registrado_em)
                     order by i.registrado_em desc)
      from app.campanha_interesses i join app.alunos a on a.id_aluno = i.id_aluno
     where i.campanha_id = p_id), '[]'::jsonb);
end $$;

-- A listagem passa a trazer também quantos alunos demonstraram interesse.
create or replace function app.campanha_json(c app.campanhas_retencao) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) - 'criado_por' || jsonb_build_object(
    'alunos_na_faixa', (select count(*) from app.churn_previsao p
                         where app.churn_na_faixa(p.probabilidade_churn, c.churn_minimo, c.churn_maximo)),
    'interessados', (select count(*) from app.campanha_interesses i where i.campanha_id = c.id),
    'vigencia', case when app.hoje() < c.data_inicio then 'agendada'
                     when app.hoje() > c.data_fim then 'encerrada' else 'em vigor' end)
$$;

revoke all on all functions in schema app from public, anon, authenticated;

do $$
declare
  f text;
begin
  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('aluno_oferta_retencao', 'aluno_registrar_interesse', 'adm_campanha_interessados')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
