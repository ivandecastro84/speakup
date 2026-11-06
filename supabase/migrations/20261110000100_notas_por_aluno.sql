-- Tela "Notas" (lançamento individual por aluno). D64.
-- O salvamento reaproveita public.adm_lancar_avaliacoes (mesmas validações e
-- auditoria). Aqui entram só a lista de alunos/turmas, o histórico do aluno e
-- a exclusão de uma avaliação.

-- Alunos do escopo do usuário, com as turmas em que estão matriculados.
create function public.adm_notas_alunos(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'NOTAS_LANCAR');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id_aluno', a.id_aluno, 'nome', a.nome, 'unidade', a.unidade, 'status_matricula', a.status_matricula,
             'turmas', coalesce((
               select jsonb_agg(jsonb_build_object('id', t.id, 'codigo', t.codigo, 'idioma', t.idioma,
                                                   'nivel_curso', t.nivel_curso, 'situacao', t.situacao,
                                                   'data_inicio', t.data_inicio)
                                order by t.situacao, t.codigo)
                 from app.matricula_turma mt join app.turmas t on t.id = mt.turma_id
                where mt.id_aluno = a.id_aluno), '[]'::jsonb))
           order by a.nome, a.id_aluno)
      from app.alunos a
     where a.unidade in (select app.unidades_escopo(u.id))), '[]'::jsonb);
end $$;

-- Histórico de avaliações de um aluno (todas as turmas do escopo).
create function public.adm_notas_do_aluno(p_token text, p_id_aluno text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'NOTAS_LANCAR');
  if not exists (select 1 from app.alunos a where a.id_aluno = p_id_aluno
                   and a.unidade in (select app.unidades_escopo(u.id))) then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', av.id, 'turma_id', av.turma_id, 'turma', t.codigo, 'data', av.data,
             'speaking', av.speaking, 'listening', av.listening, 'reading', av.reading, 'writing', av.writing,
             'cefr', av.cefr, 'lancado_em', av.lancado_em, 'lancado_por', ua.nome)
           order by av.data desc, t.codigo)
      from app.avaliacoes av
      join app.turmas t on t.id = av.turma_id
      join app.usuarios_adm ua on ua.id = av.lancado_por
     where av.id_aluno = p_id_aluno), '[]'::jsonb);
end $$;

create function public.adm_excluir_avaliacao(p_token text, p_id uuid, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  av app.avaliacoes;
  t app.turmas;
begin
  perform app.exigir_permissao(u.id, 'NOTAS_LANCAR');
  select * into av from app.avaliacoes where id = p_id for update;
  if not found then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  t := app.turma_no_escopo(u.id, av.turma_id);
  delete from app.avaliacoes where id = av.id;
  perform app.auditar('ADM', u.id::text, 'NOTA_EXCLUIDA', 'aluno', av.id_aluno, p_ip,
    jsonb_build_object('turma', t.codigo, 'data', av.data, 'speaking', av.speaking, 'listening', av.listening,
                       'reading', av.reading, 'writing', av.writing, 'cefr', av.cefr));
  return jsonb_build_object('ok', true);
end $$;

do $$
declare
  f text;
begin
  for f in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('adm_notas_alunos', 'adm_notas_do_aluno', 'adm_excluir_avaliacao')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
