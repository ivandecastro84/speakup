-- Previsão de Churn (D67): importação de planilha id_aluno + probabilidade_churn
-- (0–100) e consulta por faixas de risco. Somente superadministrador.

insert into app.permissoes (codigo, descricao) values
  ('CHURN_GERENCIAR', 'Importar e consultar a previsão de churn dos alunos');
insert into app.papel_permissao (papel, permissao) values ('ADM_SUPERADMIN', 'CHURN_GERENCIAR');

-- id_aluno é o número inteiro da planilha; cruza com app.alunos.id_aluno (texto)
-- quando o aluno existe no cadastro. IDs ainda não cadastrados também são guardados.
create table app.churn_previsao (
  id_aluno             bigint primary key check (id_aluno > 0),
  probabilidade_churn  numeric(5, 2) not null check (probabilidade_churn between 0 and 100),
  data_importacao      timestamptz not null default now()
);
create index churn_previsao_prob_idx on app.churn_previsao (probabilidade_churn desc, id_aluno);
revoke all on app.churn_previsao from public, anon, authenticated;

-- Faixa: valor na divisa vai para a faixa de cima; 100 fica em 80–100.
create function app.faixa_churn(p numeric) returns int
language sql immutable set search_path = '' as $$
  select least(floor(p / 20)::int, 4)
$$;

-- Grava um lote (até 500 linhas). Upsert: id existente é atualizado.
-- Revalida cada linha; as inválidas voltam como rejeitadas.
create function public.adm_churn_gravar_lote(p_token text, p_linhas jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_ins int := 0;
  v_upd int := 0;
  v_rej int := 0;
  v_total int := jsonb_array_length(coalesce(p_linhas, '[]'::jsonb));
begin
  perform app.exigir_permissao(u.id, 'CHURN_GERENCIAR');
  if v_total > 500 then perform app.invalido('Cada lote pode ter no máximo 500 linhas.'); end if;

  with brutas as (
    select x->>'id_aluno' as id_txt, x->>'probabilidade_churn' as p_txt, ord
      from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) with ordinality as t(x, ord)
  ),
  validas as (
    select distinct on (id_txt::bigint) id_txt::bigint as id_aluno, round(p_txt::numeric, 2) as prob
      from brutas
     where id_txt ~ '^[0-9]{1,15}$' and id_txt::bigint > 0
       and p_txt ~ '^-?[0-9]+(\.[0-9]+)?$' and p_txt::numeric between 0 and 100
     order by id_txt::bigint, ord desc
  ),
  gravadas as (
    insert into app.churn_previsao as c (id_aluno, probabilidade_churn, data_importacao)
    select id_aluno, prob, now() from validas
    on conflict (id_aluno) do update set probabilidade_churn = excluded.probabilidade_churn, data_importacao = now()
    returning (xmax = 0) as novo
  )
  select count(*) filter (where novo), count(*) filter (where not novo) into v_ins, v_upd from gravadas;

  v_rej := v_total - v_ins - v_upd;
  return jsonb_build_object('importadas', v_ins, 'atualizadas', v_upd, 'rejeitadas', v_rej);
end $$;

-- Registro da importação concluída (auditoria).
create function public.adm_churn_concluir(
  p_token text, p_arquivo text, p_importadas int, p_atualizadas int, p_rejeitadas int, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'CHURN_GERENCIAR');
  perform app.auditar('ADM', u.id::text, 'CHURN_IMPORTADO', 'churn_previsao', null, p_ip,
    jsonb_build_object('arquivo', left(p_arquivo, 200), 'importadas', p_importadas,
                       'atualizadas', p_atualizadas, 'rejeitadas', p_rejeitadas));
  return jsonb_build_object('ok', true);
end $$;

-- Resumo por faixa + lista pesquisável (id ou nome), do maior para o menor risco.
create function public.adm_churn_consultar(
  p_token text, p_busca text default null, p_pagina int default 1, p_faixa int default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_pag int := greatest(coalesce(p_pagina, 1), 1);
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_total int;
  v_itens jsonb;
begin
  perform app.exigir_permissao(u.id, 'CHURN_GERENCIAR');

  with base as (
    select c.id_aluno, c.probabilidade_churn, c.data_importacao, a.nome, a.unidade, a.status_matricula
      from app.churn_previsao c
      left join app.alunos a on a.id_aluno = c.id_aluno::text
     where (v_busca is null
            or c.id_aluno::text = v_busca
            or app.normalizar_nome(a.nome) like '%' || app.normalizar_nome(v_busca) || '%')
       and (p_faixa is null or app.faixa_churn(c.probabilidade_churn) = p_faixa)
  )
  select (select count(*) from base),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id_aluno', b.id_aluno, 'nome', b.nome, 'unidade', b.unidade, 'status_matricula', b.status_matricula,
                     'probabilidade_churn', b.probabilidade_churn, 'data_importacao', b.data_importacao)
                     order by b.probabilidade_churn desc, b.id_aluno)
                     from (select * from base order by probabilidade_churn desc, id_aluno
                           offset (v_pag - 1) * 50 limit 50) b), '[]'::jsonb)
    into v_total, v_itens;

  return jsonb_build_object(
    'faixas', (select jsonb_agg(jsonb_build_object('faixa', f, 'alunos',
                 (select count(*) from app.churn_previsao c where app.faixa_churn(c.probabilidade_churn) = f)) order by f)
                 from generate_series(0, 4) f),
    'total_geral', (select count(*) from app.churn_previsao),
    'no_cadastro', (select count(*) from app.churn_previsao c join app.alunos a on a.id_aluno = c.id_aluno::text),
    'ultima_importacao', (select max(data_importacao) from app.churn_previsao),
    'itens', v_itens, 'total', v_total, 'pagina', v_pag, 'por_pagina', 50);
end $$;

revoke all on all functions in schema app from public, anon, authenticated;

do $$
declare
  f text;
begin
  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('adm_churn_gravar_lote', 'adm_churn_concluir', 'adm_churn_consultar')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
