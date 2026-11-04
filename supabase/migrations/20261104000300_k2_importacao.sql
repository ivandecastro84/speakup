-- K2 · Importação em lote de alunos (.xlsx/.csv)
-- A validação de formato/tipos é feita no servidor Next.js (mensagens por
-- linha e coluna). O banco reaplica as regras de autorização (permissão e
-- escopo de unidade), as restrições de integridade e grava o resultado.

create table app.importacoes_lote (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references app.usuarios_adm (id),
  arquivo_nome   text not null,
  checksum       text not null,              -- SHA-256 do arquivo enviado
  formato        text not null check (formato in ('xlsx', 'csv')),
  atomica        boolean not null default false,
  status         text not null check (status in ('PROCESSANDO', 'CONCLUIDA', 'REJEITADA', 'FALHOU')),
  total_linhas   integer not null default 0,
  processadas    integer not null default 0,
  inseridos      integer not null default 0,
  atualizados    integer not null default 0,
  rejeitados     integer not null default 0,
  avisos         integer not null default 0,
  mensagem       text,
  iniciado_em    timestamptz not null default now(),
  concluido_em   timestamptz
);

create index importacoes_lote_usuario_idx on app.importacoes_lote (usuario_id, iniciado_em desc);

create table app.logs_importacao (
  id             bigint generated always as identity primary key,
  importacao_id  uuid not null references app.importacoes_lote (id) on delete cascade,
  linha          integer,                    -- null = erro de arquivo/cabeçalho
  tipo           text not null check (tipo in ('ERRO', 'AVISO')),
  coluna         text,
  motivo         text not null,
  dados          jsonb                       -- valores originais da linha
);

create index logs_importacao_lote_idx on app.logs_importacao (importacao_id, linha);

insert into app.configuracao (chave, valor, descricao) values
  ('importacao_cria_unidade_superadmin', 'true',
   '[DECISÃO PENDENTE] Superadmin cria automaticamente unidade inexistente na importação; coordenação recebe erro de linha');

revoke all on app.importacoes_lote, app.logs_importacao from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Inicia um lote. Se p_erros_arquivo vier preenchido (ex.: cabeçalho
-- inválido), o lote nasce REJEITADO e nada é gravado em alunos.
-- ---------------------------------------------------------------------------
create function public.adm_importacao_iniciar(
  p_token text, p_arquivo_nome text, p_checksum text, p_formato text,
  p_total_linhas int, p_atomica boolean default false,
  p_erros_arquivo jsonb default null, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_id uuid;
  v_rejeitado boolean := p_erros_arquivo is not null and jsonb_array_length(p_erros_arquivo) > 0;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_IMPORTAR');

  insert into app.importacoes_lote (usuario_id, arquivo_nome, checksum, formato, atomica, status, total_linhas, mensagem, concluido_em)
  values (u.id, left(coalesce(p_arquivo_nome, 'arquivo'), 255), p_checksum, p_formato, coalesce(p_atomica, false),
          case when v_rejeitado then 'REJEITADA' else 'PROCESSANDO' end,
          greatest(coalesce(p_total_linhas, 0), 0),
          case when v_rejeitado then 'Arquivo rejeitado antes de qualquer gravação.' end,
          case when v_rejeitado then now() end)
  returning id into v_id;

  if v_rejeitado then
    insert into app.logs_importacao (importacao_id, linha, tipo, coluna, motivo)
    select v_id, null, 'ERRO', e->>'coluna', e->>'motivo'
      from jsonb_array_elements(p_erros_arquivo) e;

    perform app.auditar('ADM', u.id::text, 'IMPORTACAO_REJEITADA', 'importacao_lote', v_id::text, p_ip,
      jsonb_build_object('arquivo', p_arquivo_nome, 'checksum', p_checksum,
                         'erros', jsonb_array_length(p_erros_arquivo)));
  end if;

  return jsonb_build_object('id', v_id, 'status', case when v_rejeitado then 'REJEITADA' else 'PROCESSANDO' end);
end $$;

-- ---------------------------------------------------------------------------
-- Processa um pedaço do lote.
--   p_linhas : [{ "linha": n, "dados": {19 colunas normalizadas} }]  (já validadas)
--   p_erros  : [{ "linha": n, "coluna": c, "motivo": m, "dados": {...} }]  (rejeitadas na validação)
--   p_avisos : [{ "linha": n, "coluna": c, "motivo": m }]  (não bloqueantes)
-- Em lote atômico, qualquer rejeição desfaz todas as gravações deste pedaço
-- (o servidor envia lotes atômicos em um único pedaço).
-- ---------------------------------------------------------------------------
create function public.adm_importacao_processar(
  p_token text, p_importacao_id uuid,
  p_linhas jsonb, p_erros jsonb default '[]', p_avisos jsonb default '[]'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  l app.importacoes_lote;
  v_todas boolean := app.tem_permissao(u.id, 'TODAS_UNIDADES');
  v_cria_unidade boolean := app.tem_permissao(u.id, 'UNIDADES_GERENCIAR')
                            and coalesce(app.cfg('importacao_cria_unidade_superadmin'), 'false') = 'true';
  v_escopo text[];
  r jsonb;
  d jsonb;
  v_linha int;
  v_unidade text;
  v_unidade_atual text;
  v_inserido boolean;
  v_ins int := 0;
  v_upd int := 0;
  v_rej_linhas int[] := '{}';
  v_rej jsonb := '[]';          -- rejeições do banco: sobrevivem ao rollback do bloco interno
  v_unidades_novas text[] := '{}';
  v_msg text;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_IMPORTAR');

  select * into l from app.importacoes_lote where id = p_importacao_id for update;
  if not found or l.usuario_id <> u.id then
    raise exception 'IMPORTACAO_NAO_ENCONTRADA' using errcode = 'PT404';
  end if;
  if l.status <> 'PROCESSANDO' then
    raise exception 'IMPORTACAO_ENCERRADA' using errcode = 'PT409';
  end if;

  select coalesce(array_agg(n), '{}') into v_escopo from app.unidades_escopo(u.id) n;

  -- Bloco interno: em lote atômico com rejeições, tudo aqui é desfeito.
  begin
    for r in select * from jsonb_array_elements(coalesce(p_linhas, '[]')) loop
      v_linha := (r->>'linha')::int;
      d := r->'dados';
      v_unidade := btrim(d->>'unidade');
      v_msg := null;

      -- Escopo da unidade de destino
      if not exists (select 1 from app.unidades where nome = v_unidade) then
        if v_cria_unidade then
          insert into app.unidades (nome) values (v_unidade) on conflict do nothing;
          v_unidades_novas := array_append(v_unidades_novas, v_unidade);
          v_escopo := array_append(v_escopo, v_unidade);
        else
          v_msg := format('Unidade "%s" não cadastrada.', v_unidade);
        end if;
      elsif not (v_todas or v_unidade = any (v_escopo)) then
        v_msg := format('Unidade "%s" fora do seu escopo de acesso.', v_unidade);
      end if;

      -- Aluno existente em unidade fora do escopo não pode ser alterado
      if v_msg is null then
        select unidade into v_unidade_atual from app.alunos where id_aluno = d->>'id_aluno';
        if found and not (v_todas or v_unidade_atual = any (v_escopo)) then
          v_msg := 'Aluno já cadastrado em unidade fora do seu escopo de acesso.';
        end if;
      end if;

      if v_msg is not null then
        v_rej := v_rej || jsonb_build_object('linha', v_linha, 'coluna', 'unidade', 'motivo', v_msg, 'dados', r->'original');
        v_rej_linhas := array_append(v_rej_linhas, v_linha);
        continue;
      end if;

      begin
        insert into app.alunos as a (
          id_aluno, nome, email, data_nascimento, idade, genero, unidade, cidade, estado,
          canal_aquisicao, nivel_curso, modalidade, turno, plano, desconto_percentual,
          data_matricula, status_matricula, data_cancelamento, "Valor Mensalidade")
        values (
          d->>'id_aluno', d->>'nome', d->>'email', (d->>'data_nascimento')::date, (d->>'idade')::int,
          d->>'genero', v_unidade, d->>'cidade', d->>'estado', d->>'canal_aquisicao', d->>'nivel_curso',
          d->>'modalidade', d->>'turno', d->>'plano', (d->>'desconto_percentual')::numeric,
          (d->>'data_matricula')::date, d->>'status_matricula', (d->>'data_cancelamento')::date,
          (d->>'Valor Mensalidade')::numeric)
        on conflict (id_aluno) do update set
          nome = excluded.nome, email = excluded.email, data_nascimento = excluded.data_nascimento,
          idade = excluded.idade, genero = excluded.genero, unidade = excluded.unidade,
          cidade = excluded.cidade, estado = excluded.estado, canal_aquisicao = excluded.canal_aquisicao,
          nivel_curso = excluded.nivel_curso, modalidade = excluded.modalidade, turno = excluded.turno,
          plano = excluded.plano, desconto_percentual = excluded.desconto_percentual,
          data_matricula = excluded.data_matricula, status_matricula = excluded.status_matricula,
          data_cancelamento = excluded.data_cancelamento, "Valor Mensalidade" = excluded."Valor Mensalidade",
          atualizado_em = now()
        returning (xmax = 0) into v_inserido;

        if v_inserido then v_ins := v_ins + 1; else v_upd := v_upd + 1; end if;
      exception when others then
        v_rej := v_rej || jsonb_build_object('linha', v_linha, 'coluna', null,
                   'motivo', 'Registro recusado pelo banco de dados (' || sqlerrm || ').', 'dados', r->'original');
        v_rej_linhas := array_append(v_rej_linhas, v_linha);
      end;
    end loop;

    if l.atomica and (jsonb_array_length(v_rej) > 0 or jsonb_array_length(coalesce(p_erros, '[]')) > 0) then
      raise exception 'ROLLBACK_ATOMICO';
    end if;
  exception when raise_exception then
    if sqlerrm <> 'ROLLBACK_ATOMICO' then raise; end if;
    -- tudo do bloco foi desfeito; nenhuma linha válida foi gravada
    v_ins := 0;
    v_upd := 0;
    v_unidades_novas := '{}';
  end;

  -- Log: erros de validação + rejeições do banco + avisos
  insert into app.logs_importacao (importacao_id, linha, tipo, coluna, motivo, dados)
  select p_importacao_id, (e->>'linha')::int, 'ERRO', e->>'coluna', e->>'motivo', e->'dados'
    from jsonb_array_elements(coalesce(p_erros, '[]') || v_rej) e;

  insert into app.logs_importacao (importacao_id, linha, tipo, coluna, motivo, dados)
  select p_importacao_id, (e->>'linha')::int, 'AVISO', e->>'coluna', e->>'motivo', e->'dados'
    from jsonb_array_elements(coalesce(p_avisos, '[]')) e;

  update app.importacoes_lote set
    processadas = processadas + jsonb_array_length(coalesce(p_linhas, '[]'))
                  + (select count(distinct (e->>'linha')) from jsonb_array_elements(coalesce(p_erros, '[]')) e)::int,
    inseridos = inseridos + v_ins,
    atualizados = atualizados + v_upd,
    rejeitados = rejeitados
                 + (select count(distinct (e->>'linha')) from jsonb_array_elements(coalesce(p_erros, '[]')) e)::int
                 + coalesce(array_length(v_rej_linhas, 1), 0),
    avisos = avisos + (select count(distinct (e->>'linha')) from jsonb_array_elements(coalesce(p_avisos, '[]')) e)::int
  where id = p_importacao_id;

  if array_length(v_unidades_novas, 1) > 0 then
    perform app.auditar('ADM', u.id::text, 'UNIDADE_CRIADA_IMPORTACAO', 'importacao_lote', p_importacao_id::text, null,
                        jsonb_build_object('unidades', to_jsonb(v_unidades_novas)));
  end if;

  return jsonb_build_object('inseridos', v_ins, 'atualizados', v_upd,
                            'rejeitados_banco', coalesce(array_length(v_rej_linhas, 1), 0));
end $$;

create function public.adm_importacao_finalizar(p_token text, p_importacao_id uuid, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  l app.importacoes_lote;
  v_desfeita boolean;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_IMPORTAR');
  select * into l from app.importacoes_lote where id = p_importacao_id for update;
  if not found or l.usuario_id <> u.id then
    raise exception 'IMPORTACAO_NAO_ENCONTRADA' using errcode = 'PT404';
  end if;
  if l.status <> 'PROCESSANDO' then
    return to_jsonb(l);
  end if;

  v_desfeita := l.atomica and l.rejeitados > 0;

  update app.importacoes_lote set
    status = case when v_desfeita then 'FALHOU' else 'CONCLUIDA' end,
    mensagem = case when v_desfeita then 'Importação atômica desfeita: nenhuma linha foi gravada.' end,
    inseridos = case when v_desfeita then 0 else inseridos end,
    atualizados = case when v_desfeita then 0 else atualizados end,
    concluido_em = now()
  where id = p_importacao_id
  returning * into l;

  perform app.auditar('ADM', u.id::text, 'IMPORTACAO_ALUNOS', 'importacao_lote', l.id::text, p_ip,
    jsonb_build_object('arquivo', l.arquivo_nome, 'checksum', l.checksum, 'status', l.status,
                       'total', l.total_linhas, 'inseridos', l.inseridos, 'atualizados', l.atualizados,
                       'rejeitados', l.rejeitados, 'avisos', l.avisos, 'atomica', l.atomica));
  return to_jsonb(l);
end $$;

-- Marca o lote como FALHOU (erro inesperado no processamento assíncrono).
create function public.adm_importacao_falhar(p_token text, p_importacao_id uuid, p_mensagem text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  l app.importacoes_lote;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_IMPORTAR');
  update app.importacoes_lote
     set status = 'FALHOU', mensagem = left(p_mensagem, 500), concluido_em = now()
   where id = p_importacao_id and usuario_id = u.id and status = 'PROCESSANDO'
  returning * into l;
  if found then
    perform app.auditar('ADM', u.id::text, 'IMPORTACAO_FALHOU', 'importacao_lote', l.id::text, p_ip,
      jsonb_build_object('arquivo', l.arquivo_nome, 'checksum', l.checksum, 'processadas', l.processadas,
                         'inseridos', l.inseridos, 'atualizados', l.atualizados));
  end if;
  return jsonb_build_object('ok', found);
end $$;

-- Lote visível para quem o criou ou para quem tem escopo em todas as unidades.
create function app.lote_visivel(p_usuario_id uuid, p_importacao_id uuid) returns app.importacoes_lote
language plpgsql stable security definer set search_path = '' as $$
declare
  l app.importacoes_lote;
begin
  perform app.exigir_permissao(p_usuario_id, 'ALUNOS_IMPORTAR');
  select * into l from app.importacoes_lote where id = p_importacao_id;
  if not found or (l.usuario_id <> p_usuario_id and not app.tem_permissao(p_usuario_id, 'TODAS_UNIDADES')) then
    raise exception 'IMPORTACAO_NAO_ENCONTRADA' using errcode = 'PT404';
  end if;
  return l;
end $$;

create function public.adm_importacao_status(p_token text, p_importacao_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  return to_jsonb(app.lote_visivel(u.id, p_importacao_id));
end $$;

create function public.adm_importacao_log(p_token text, p_importacao_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  l app.importacoes_lote := app.lote_visivel(u.id, p_importacao_id);
begin
  perform app.auditar('ADM', u.id::text, 'IMPORTACAO_LOG_BAIXADO', 'importacao_lote', l.id::text);
  return coalesce((
    select jsonb_agg(jsonb_build_object('linha', linha, 'tipo', tipo, 'coluna', coluna, 'motivo', motivo, 'dados', dados)
                     order by linha nulls first, tipo, id)
      from app.logs_importacao where importacao_id = l.id
  ), '[]'::jsonb);
end $$;

create function public.adm_listar_importacoes(p_token text, p_limite int default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_todas boolean;
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_IMPORTAR');
  v_todas := app.tem_permissao(u.id, 'TODAS_UNIDADES');
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.iniciado_em desc)
      from (
        select l.*, ua.nome as usuario_nome
          from app.importacoes_lote l
          join app.usuarios_adm ua on ua.id = l.usuario_id
         where v_todas or l.usuario_id = u.id
         order by l.iniciado_em desc
         limit least(greatest(coalesce(p_limite, 20), 1), 100)
      ) x
  ), '[]'::jsonb);
end $$;

revoke all on all functions in schema app from public, anon, authenticated;

revoke all on function
  public.adm_importacao_iniciar(text, text, text, text, int, boolean, jsonb, text),
  public.adm_importacao_processar(text, uuid, jsonb, jsonb, jsonb),
  public.adm_importacao_finalizar(text, uuid, text),
  public.adm_importacao_falhar(text, uuid, text, text),
  public.adm_importacao_status(text, uuid),
  public.adm_importacao_log(text, uuid),
  public.adm_listar_importacoes(text, int)
from public;

grant execute on function
  public.adm_importacao_iniciar(text, text, text, text, int, boolean, jsonb, text),
  public.adm_importacao_processar(text, uuid, jsonb, jsonb, jsonb),
  public.adm_importacao_finalizar(text, uuid, text),
  public.adm_importacao_falhar(text, uuid, text, text),
  public.adm_importacao_status(text, uuid),
  public.adm_importacao_log(text, uuid),
  public.adm_listar_importacoes(text, int)
to anon, authenticated;
