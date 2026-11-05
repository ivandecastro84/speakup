-- Modalidade "Híbrido" para alunos (turmas continuam Presencial ou Online).
-- Na reposição avulsa, o aluno híbrido usa sala se houver uma livre; senão, a aula é online.

alter table app.alunos drop constraint if exists alunos_modalidade_check;
alter table app.alunos add constraint alunos_modalidade_check
  check (modalidade is null or modalidade in ('Presencial', 'Online', 'Híbrido'));

create or replace function app.opcoes_reposicao(p_id_aluno text, p_data date, p_hora smallint) returns jsonb
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
      v_modalidade := coalesce(a.modalidade, 'Presencial');
      if v_modalidade in ('Presencial', 'Híbrido') then
        select s.id, s.nome into v_sala_id, v_sala_nome from app.salas s
         where s.unidade_id = v_unidade and app.sala_livre(s.id, p_data, p_hora)
         order by s.capacidade, s.nome limit 1;
        if v_sala_id is not null then
          v_modalidade := 'Presencial';
        elsif v_modalidade = 'Híbrido' then
          v_modalidade := 'Online';
        else
          return '[]'::jsonb;  -- presencial: há professor, mas nenhuma sala livre
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

revoke all on function app.opcoes_reposicao(text, date, smallint) from public, anon, authenticated;
