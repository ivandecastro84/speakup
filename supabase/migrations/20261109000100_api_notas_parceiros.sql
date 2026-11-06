-- API de notas para empresas parceiras (D59–D63).
-- Cada empresa cliente recebe uma chave de API própria e consulta, por id_aluno
-- + nome, as notas dos alunos VINCULADOS a ela. Reaproveita as avaliações
-- (4 competências + CEFR), as presenças e a média mínima da empresa (K5).
-- Nenhuma tabela ou função existente é alterada; só o check de ator_tipo da
-- auditoria ganha o valor 'API' (as consultas da empresa ficam auditadas).

alter table app.log_auditoria drop constraint log_auditoria_ator_tipo_check;
alter table app.log_auditoria add constraint log_auditoria_ator_tipo_check
  check (ator_tipo in ('ALUNO', 'ADM', 'SISTEMA', 'ANONIMO', 'API'));

insert into app.configuracao (chave, valor, descricao) values
  ('api_limite_por_minuto', '60', 'Consultas por minuto permitidas para cada empresa na API de notas');

-- ---------------------------------------------------------------------------
-- Chaves de API (somente o hash SHA-256 é guardado)
-- ---------------------------------------------------------------------------
create table app.empresa_chaves_api (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas (id),
  prefixo       text not null,
  chave_hash    text not null unique,
  criada_por    uuid not null references app.usuarios_adm (id),
  criada_em     timestamptz not null default now(),
  revogada_em   timestamptz,
  revogada_por  uuid references app.usuarios_adm (id),
  ultimo_uso_em timestamptz
);
-- No máximo uma chave ativa por empresa.
create unique index empresa_chaves_api_ativa_uidx on app.empresa_chaves_api (empresa_id) where revogada_em is null;
revoke all on app.empresa_chaves_api from public, anon, authenticated;

-- Nome comparado sem acentos, maiúsculas ou espaços extras.
create function app.normalizar_nome(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(translate(btrim(coalesce(p, '')),
           'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
           'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')), '\s+', ' ', 'g')
$$;

-- Gestão das chaves: só quem enxerga todas as unidades (superadmin), porque a
-- chave dá acesso aos alunos da empresa em qualquer unidade.
create function public.adm_chaves_api(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'EMPRESAS_GERENCIAR');
  return jsonb_build_object(
    'pode_gerenciar', app.tem_permissao(u.id, 'TODAS_UNIDADES'),
    'empresas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'nome', e.nome, 'ativa', e.ativa, 'media_minima', e.media_minima,
               'alunos', (select count(*) from app.aluno_empresa ae where ae.empresa_id = e.id),
               'chave', (select jsonb_build_object('prefixo', c.prefixo, 'criada_em', c.criada_em,
                                                   'ultimo_uso_em', c.ultimo_uso_em, 'criada_por', ua.nome)
                           from app.empresa_chaves_api c join app.usuarios_adm ua on ua.id = c.criada_por
                          where c.empresa_id = e.id and c.revogada_em is null))
             order by e.nome)
        from app.empresas e), '[]'::jsonb));
end $$;

create function public.adm_gerar_chave_api(p_token text, p_empresa_id uuid, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  e app.empresas;
  v_chave text;
  v_revogadas int;
begin
  perform app.exigir_permissao(u.id, 'TODAS_UNIDADES');
  select * into e from app.empresas where id = p_empresa_id;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  if not e.ativa then perform app.conflito('A empresa está inativa. Reative o contrato antes de gerar a chave.'); end if;

  update app.empresa_chaves_api set revogada_em = now(), revogada_por = u.id
   where empresa_id = e.id and revogada_em is null;
  get diagnostics v_revogadas = row_count;

  v_chave := 'su_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into app.empresa_chaves_api (empresa_id, prefixo, chave_hash, criada_por)
  values (e.id, left(v_chave, 11), app.hash_token(v_chave), u.id);

  perform app.auditar('ADM', u.id::text, 'API_CHAVE_GERADA', 'empresa', e.id::text, p_ip,
                      jsonb_build_object('prefixo', left(v_chave, 11), 'substituiu_anterior', v_revogadas > 0));
  -- A chave completa só é devolvida aqui, uma única vez.
  return jsonb_build_object('chave', v_chave, 'prefixo', left(v_chave, 11), 'empresa', e.nome);
end $$;

create function public.adm_revogar_chave_api(p_token text, p_empresa_id uuid, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_n int;
begin
  perform app.exigir_permissao(u.id, 'TODAS_UNIDADES');
  update app.empresa_chaves_api set revogada_em = now(), revogada_por = u.id
   where empresa_id = p_empresa_id and revogada_em is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  perform app.auditar('ADM', u.id::text, 'API_CHAVE_REVOGADA', 'empresa', p_empresa_id::text, p_ip, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Consulta de notas (chamada pela rota pública /api/v1/notas)
-- Devolve {status, corpo}: erros de negócio não lançam exceção para que a
-- tentativa fique registrada na auditoria.
-- ---------------------------------------------------------------------------
create function public.api_notas_aluno(p_chave text, p_id_aluno text, p_nome text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.empresa_chaves_api;
  e app.empresas;
  a app.alunos;
  v_usos int;
  v_cursos jsonb;
  v_disc constant text[] := array['Speaking', 'Listening', 'Reading', 'Writing'];
begin
  select * into c from app.empresa_chaves_api
   where chave_hash = app.hash_token(coalesce(p_chave, '')) and revogada_em is null;
  if found then select * into e from app.empresas where id = c.empresa_id; end if;
  if c.id is null or not e.ativa then
    perform app.auditar('ANONIMO', null, 'API_NOTAS_NAO_AUTORIZADO', 'api', null, p_ip,
                        jsonb_build_object('prefixo', left(coalesce(p_chave, ''), 11)));
    return jsonb_build_object('status', 401, 'corpo', jsonb_build_object('erro', jsonb_build_object(
      'codigo', 'NAO_AUTORIZADO', 'mensagem', 'Chave de API ausente, inválida ou revogada.')));
  end if;

  select count(*) into v_usos from app.log_auditoria
   where ator_tipo = 'API' and ator_id = e.id::text and ocorrido_em > now() - interval '1 minute';
  if v_usos >= app.cfg_int('api_limite_por_minuto') then
    return jsonb_build_object('status', 429, 'corpo', jsonb_build_object('erro', jsonb_build_object(
      'codigo', 'LIMITE_EXCEDIDO',
      'mensagem', format('Limite de %s consultas por minuto atingido. Tente novamente em alguns segundos.',
                         app.cfg_int('api_limite_por_minuto')))));
  end if;
  update app.empresa_chaves_api set ultimo_uso_em = now() where id = c.id;

  if nullif(btrim(coalesce(p_id_aluno, '')), '') is null or nullif(btrim(coalesce(p_nome, '')), '') is null then
    perform app.auditar('API', e.id::text, 'API_NOTAS_CONSULTA', 'aluno', left(p_id_aluno, 50), p_ip,
                        jsonb_build_object('resultado', 'DADOS_INVALIDOS'));
    return jsonb_build_object('status', 400, 'corpo', jsonb_build_object('erro', jsonb_build_object(
      'codigo', 'DADOS_INVALIDOS', 'mensagem', 'Informe "id_aluno" e "nome" do aluno.')));
  end if;

  -- Mesmo resultado para id inexistente, nome divergente ou aluno de outra
  -- empresa: a API não revela se a matrícula existe.
  select al.* into a from app.alunos al
    join app.aluno_empresa ae on ae.id_aluno = al.id_aluno and ae.empresa_id = e.id
   where al.id_aluno = btrim(p_id_aluno)
     and app.normalizar_nome(al.nome) = app.normalizar_nome(p_nome);
  if not found then
    perform app.auditar('API', e.id::text, 'API_NOTAS_CONSULTA', 'aluno', left(btrim(p_id_aluno), 50), p_ip,
                        jsonb_build_object('resultado', 'NAO_ENCONTRADO'));
    return jsonb_build_object('status', 404, 'corpo', jsonb_build_object('erro', jsonb_build_object(
      'codigo', 'ALUNO_NAO_ENCONTRADO',
      'mensagem', 'Nenhum aluno vinculado à sua empresa foi encontrado com este ID e nome. Confira se o ID e o nome completo estão exatamente como no cadastro da escola.')));
  end if;

  -- Cursos: turmas em que o aluno está matriculado ou já recebeu avaliação.
  with turmas as (
    select t.* from app.turmas t
     where t.id in (select mt.turma_id from app.matricula_turma mt where mt.id_aluno = a.id_aluno
                    union select av.turma_id from app.avaliacoes av where av.id_aluno = a.id_aluno)
  ),
  freq as (
    select t.id as turma_id,
           count(p.*) as aulas,
           count(p.*) filter (where p.situacao = 'Presente') as presentes,
           (select count(*) from app.reposicoes r join app.creditos_reposicao cr on cr.id = r.credito_id
             where r.id_aluno = a.id_aluno and r.status = 'Realizada' and cr.turma_id = t.id) as reposicoes
      from turmas t left join app.presencas p on p.turma_id = t.id and p.id_aluno = a.id_aluno
     group by t.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'turma', t.codigo,
           'curso', t.idioma || ' · ' || t.nivel_curso,
           'idioma', t.idioma,
           'nivel_curso', t.nivel_curso,
           'nivel_cefr_atual', (select av.cefr from app.avaliacoes av
                                  where av.id_aluno = a.id_aluno and av.turma_id = t.id and av.cefr is not null
                                  order by av.data desc limit 1),
           'frequencia', jsonb_build_object(
              'aulas_registradas', f.aulas,
              'presencas', least(f.presentes + f.reposicoes, f.aulas),
              'percentual', case when f.aulas > 0 then round(100.0 * least(f.presentes + f.reposicoes, f.aulas) / f.aulas, 1) end),
           'disciplinas', (
              select jsonb_agg(jsonb_build_object(
                       'disciplina', d.nome,
                       'notas', d.notas,
                       'media', d.media,
                       'situacao', case when d.media is null then 'Sem avaliação'
                                        when d.media >= e.media_minima then 'Aprovado'
                                        else 'Abaixo da média' end)
                     order by d.ordem)
                from (
                  select x.ordem, x.nome,
                         coalesce(jsonb_agg(jsonb_build_object('data', av.data, 'nota', x.nota) order by av.data)
                                  filter (where x.nota is not null), '[]'::jsonb) as notas,
                         round(avg(x.nota), 2) as media
                    from generate_subscripts(v_disc, 1) as g(ordem)
                    cross join lateral (select g.ordem, v_disc[g.ordem] as nome) n
                    left join app.avaliacoes av on av.id_aluno = a.id_aluno and av.turma_id = t.id
                    cross join lateral (select n.ordem, n.nome,
                                               case n.ordem when 1 then av.speaking when 2 then av.listening
                                                            when 3 then av.reading else av.writing end as nota) x
                   group by x.ordem, x.nome
                ) d))
           order by t.data_inicio desc, t.codigo), '[]'::jsonb)
    into v_cursos
    from turmas t join freq f on f.turma_id = t.id;

  perform app.auditar('API', e.id::text, 'API_NOTAS_CONSULTA', 'aluno', a.id_aluno, p_ip,
                      jsonb_build_object('resultado', 'OK', 'cursos', jsonb_array_length(v_cursos)));

  return jsonb_build_object('status', 200, 'corpo', jsonb_build_object(
    'aluno', jsonb_build_object('id_aluno', a.id_aluno, 'nome', a.nome, 'situacao_matricula', a.status_matricula),
    'empresa', e.nome,
    'criterio', jsonb_build_object(
      'media_minima', e.media_minima,
      'descricao', format('Aprovado: média da disciplina maior ou igual a %s. Abaixo da média: menor que %s. Sem avaliação: nenhuma nota lançada.',
                          replace(to_char(e.media_minima, 'FM990.0'), '.', ','), replace(to_char(e.media_minima, 'FM990.0'), '.', ','))),
    'cursos', v_cursos,
    'consultado_em', now()));
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
       'adm_chaves_api', 'adm_gerar_chave_api', 'adm_revogar_chave_api', 'api_notas_aluno')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
