-- K6 · Integrações: calendário (Google/Outlook por adaptador + .ics),
-- notificações (e-mail transacional e Web Push) com fila de retentativa.
--
-- A reserva é a fonte da verdade. Um gatilho em app.reposicoes enfileira,
-- na MESMA transação, o e-mail, o push e os eventos de calendário. O envio
-- acontece fora do banco (servidor Next.js, por adaptadores) e uma falha de
-- integração nunca desfaz a reserva: o item fica na fila para nova tentativa.

insert into app.configuracao (chave, valor, descricao) values
  ('aula_duracao_minutos', '60', '[DECISÃO PENDENTE] Duração da aula usada no convite de calendário (.ics)'),
  ('calendario_provedores', 'GOOGLE,OUTLOOK', 'Provedores de calendário que recebem os eventos das reservas'),
  ('fila_max_tentativas', '3', 'Tentativas de envio antes de a integração ficar como Falha (reprocessável)');

insert into app.permissoes (codigo, descricao) values
  ('NOTIFICACOES_GERENCIAR', 'Consultar a fila de notificações e calendário e reprocessar falhas');
insert into app.papel_permissao (papel, permissao) values
  ('ADM_SUPERADMIN', 'NOTIFICACOES_GERENCIAR'), ('ADM_COORDENACAO', 'NOTIFICACOES_GERENCIAR');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table app.notificacoes (
  id                 uuid primary key default gen_random_uuid(),
  id_aluno           text not null references app.alunos (id_aluno) on update cascade,
  reposicao_id       uuid references app.reposicoes (id),
  canal              text not null check (canal in ('EMAIL', 'PUSH')),
  evento             text not null check (evento in ('CONFIRMACAO', 'CANCELAMENTO')),
  destino            text,
  payload            jsonb not null,
  status             text not null default 'Pendente'
                     check (status in ('Pendente', 'Processando', 'Enviado', 'Falha', 'Descartado')),
  tentativas         smallint not null default 0,
  proxima_tentativa  timestamptz not null default now(),
  lease_ate          timestamptz,
  ultimo_erro        text,
  provedor           text,
  id_externo         text,
  criado_em          timestamptz not null default now(),
  concluido_em       timestamptz
);
create index notificacoes_fila_idx on app.notificacoes (proxima_tentativa) where status in ('Pendente', 'Processando');
create index notificacoes_aluno_idx on app.notificacoes (id_aluno, criado_em desc);

create table app.eventos_calendario (
  id                 uuid primary key default gen_random_uuid(),
  id_aluno           text not null references app.alunos (id_aluno) on update cascade,
  reposicao_id       uuid not null references app.reposicoes (id),
  provedor           text not null check (provedor in ('GOOGLE', 'OUTLOOK')),
  acao               text not null check (acao in ('CRIAR', 'CANCELAR')),
  payload            jsonb not null,
  status             text not null default 'Pendente'
                     check (status in ('Pendente', 'Processando', 'Enviado', 'Falha', 'Descartado')),
  tentativas         smallint not null default 0,
  proxima_tentativa  timestamptz not null default now(),
  lease_ate          timestamptz,
  ultimo_erro        text,
  id_externo         text,
  criado_em          timestamptz not null default now(),
  concluido_em       timestamptz
);
create index eventos_calendario_fila_idx on app.eventos_calendario (proxima_tentativa) where status in ('Pendente', 'Processando');
create index eventos_calendario_reposicao_idx on app.eventos_calendario (reposicao_id, provedor, acao);

create table app.push_inscricoes (
  endpoint   text primary key check (endpoint ~ '^https://'),
  id_aluno   text not null references app.alunos (id_aluno) on update cascade on delete cascade,
  p256dh     text not null,
  auth       text not null,
  criado_em  timestamptz not null default now()
);
create index push_inscricoes_aluno_idx on app.push_inscricoes (id_aluno);

revoke all on app.notificacoes, app.eventos_calendario, app.push_inscricoes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dados da aula para convite (.ics), e-mail e push
-- ---------------------------------------------------------------------------
create function app.dados_reposicao(p_reposicao_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'reposicao_id', r.id,
           'uid', 'reposicao-' || r.id || '@speakup-idiomas',
           'status', r.status,
           'aluno', a.nome, 'email', a.email, 'id_aluno', a.id_aluno,
           'data', r.data, 'hora', r.hora,
           'inicio', app.inicio_aula(r.data, r.hora),
           'fim', app.inicio_aula(r.data, r.hora) + make_interval(mins => app.cfg_int('aula_duracao_minutos')),
           'tipo', r.tipo,
           'turma', t.codigo,
           'idioma', coalesce(t.idioma, av.idioma), 'nivel_curso', coalesce(t.nivel_curso, av.nivel_curso),
           'modalidade', coalesce(t.modalidade, av.modalidade),
           'professor', coalesce(pt.nome, pa.nome),
           'unidade', a.unidade,
           'sala', coalesce(st.nome, sa.nome),
           'credito_devolvido', case when r.status = 'Cancelada' then not r.cancelamento_tardio end)
    from app.reposicoes r
    join app.alunos a on a.id_aluno = r.id_aluno
    left join app.turmas t on t.id = r.turma_id
    left join app.professores pt on pt.id = t.professor_id
    left join app.salas st on st.id = t.sala_id
    left join app.aulas_avulsas av on av.id = r.aula_avulsa_id
    left join app.professores pa on pa.id = av.professor_id
    left join app.salas sa on sa.id = av.sala_id
   where r.id = p_reposicao_id
$$;

-- ---------------------------------------------------------------------------
-- Enfileiramento (gatilho da reserva)
-- ---------------------------------------------------------------------------
create function app.enfileirar_reposicao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_evento text;
  v_dados jsonb;
  v_prov text;
  v_criar app.eventos_calendario;
begin
  if tg_op = 'INSERT' and new.status = 'Agendada' then
    v_evento := 'CONFIRMACAO';
  elsif tg_op = 'UPDATE' and old.status = 'Agendada' and new.status = 'Cancelada' then
    v_evento := 'CANCELAMENTO';
  else
    return new;
  end if;

  v_dados := app.dados_reposicao(new.id);

  -- E-mail transacional (convite .ics anexado na confirmação; CANCEL no cancelamento).
  insert into app.notificacoes (id_aluno, reposicao_id, canal, evento, destino, payload)
  values (new.id_aluno, new.id, 'EMAIL', v_evento, v_dados->>'email', v_dados);

  -- Push só se o aluno tiver ativado em algum dispositivo.
  if exists (select 1 from app.push_inscricoes where id_aluno = new.id_aluno) then
    insert into app.notificacoes (id_aluno, reposicao_id, canal, evento, payload)
    values (new.id_aluno, new.id, 'PUSH', v_evento, v_dados);
  end if;

  -- Calendário: um evento por provedor configurado.
  foreach v_prov in array string_to_array(app.cfg('calendario_provedores'), ',') loop
    v_prov := upper(btrim(v_prov));
    continue when v_prov not in ('GOOGLE', 'OUTLOOK');
    if v_evento = 'CONFIRMACAO' then
      insert into app.eventos_calendario (id_aluno, reposicao_id, provedor, acao, payload)
      values (new.id_aluno, new.id, v_prov, 'CRIAR', v_dados);
    else
      select * into v_criar from app.eventos_calendario
       where reposicao_id = new.id and provedor = v_prov and acao = 'CRIAR'
       order by criado_em desc limit 1 for update;
      if found and v_criar.status in ('Pendente', 'Falha') then
        -- O evento nunca chegou ao provedor: não há o que cancelar lá.
        update app.eventos_calendario
           set status = 'Descartado', ultimo_erro = 'Reserva cancelada antes do envio', concluido_em = now()
         where id = v_criar.id;
      elsif found then
        insert into app.eventos_calendario (id_aluno, reposicao_id, provedor, acao, payload)
        values (new.id_aluno, new.id, v_prov, 'CANCELAR', v_dados);
      end if;
    end if;
  end loop;
  return new;
end $$;

create trigger reposicoes_enfileirar
  after insert or update of status on app.reposicoes
  for each row execute function app.enfileirar_reposicao();

-- ---------------------------------------------------------------------------
-- Processamento da fila (chamado pelo servidor com a sessão de quem disparou)
-- ---------------------------------------------------------------------------
-- Escopo de quem processa: o aluno só os próprios itens; o ADM com
-- NOTIFICACOES_GERENCIAR, os itens dos alunos das suas unidades.
create function app.fila_escopo(p_token text) returns table (id_aluno text)
language plpgsql security definer set search_path = '' as $$
declare
  v_tipo text;
  u app.usuarios_adm;
  a app.alunos;
begin
  select s.tipo into v_tipo from app.sessoes s
   where s.token_hash = app.hash_token(p_token) and s.revogada_em is null and s.expira_em > now();
  if v_tipo = 'ALUNO' then
    a := app.sessao_aluno(p_token);
    return query select a.id_aluno;
  else
    u := app.sessao_adm(p_token);
    perform app.exigir_permissao(u.id, 'NOTIFICACOES_GERENCIAR');
    return query select al.id_aluno from app.alunos al where al.unidade in (select app.unidades_escopo(u.id));
  end if;
end $$;

create function public.fila_reservar(p_token text, p_limite int default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lim int := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_itens jsonb := '[]'::jsonb;
  v_alunos text[] := array(select e.id_aluno from app.fila_escopo(p_token) e);
begin

  with alvo as (
    select n.id from app.notificacoes n
     where n.id_aluno = any (v_alunos)
       and ((n.status = 'Pendente' and n.proxima_tentativa <= now())
         or (n.status = 'Processando' and n.lease_ate < now()))
     order by n.proxima_tentativa
     limit v_lim
     for update skip locked
  ), upd as (
    update app.notificacoes n
       set status = 'Processando', lease_ate = now() + interval '2 minutes'
      from alvo where n.id = alvo.id
    returning n.*
  )
  select v_itens || coalesce(jsonb_agg(jsonb_build_object(
           'fila', 'notificacao', 'id', upd.id, 'canal', upd.canal, 'evento', upd.evento,
           'destino', upd.destino, 'payload', upd.payload, 'tentativas', upd.tentativas,
           'inscricoes', case when upd.canal = 'PUSH' then coalesce((
               select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
                 from app.push_inscricoes p where p.id_aluno = upd.id_aluno), '[]'::jsonb) end)), '[]'::jsonb)
    into v_itens from upd;

  with alvo as (
    select e.id from app.eventos_calendario e
     where e.id_aluno = any (v_alunos)
       and ((e.status = 'Pendente' and e.proxima_tentativa <= now())
         or (e.status = 'Processando' and e.lease_ate < now()))
     order by e.proxima_tentativa
     limit v_lim
     for update skip locked
  ), upd as (
    update app.eventos_calendario e
       set status = 'Processando', lease_ate = now() + interval '2 minutes'
      from alvo where e.id = alvo.id
    returning e.*
  )
  select v_itens || coalesce(jsonb_agg(jsonb_build_object(
           'fila', 'calendario', 'id', upd.id, 'provedor', upd.provedor, 'acao', upd.acao,
           'payload', upd.payload, 'tentativas', upd.tentativas,
           'id_externo_criacao', case when upd.acao = 'CANCELAR' then (
               select c.id_externo from app.eventos_calendario c
                where c.reposicao_id = upd.reposicao_id and c.provedor = upd.provedor
                  and c.acao = 'CRIAR' and c.status = 'Enviado'
                order by c.concluido_em desc limit 1) end)), '[]'::jsonb)
    into v_itens from upd;

  return v_itens;
end $$;

-- Backoff: 1 min após a 1ª falha, 5 min após a 2ª; na 3ª vira Falha.
create function app.backoff(p_tentativa int) returns interval
language sql immutable set search_path = '' as $$
  select case when p_tentativa <= 1 then interval '1 minute' when p_tentativa = 2 then interval '5 minutes'
              else interval '15 minutes' end
$$;

create function public.fila_concluir(
  p_token text, p_fila text, p_id uuid, p_ok boolean,
  p_erro text default null, p_provedor text default null, p_id_externo text default null,
  p_endpoints_invalidos text[] default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_max int := app.cfg_int('fila_max_tentativas');
  v_tent int;
  v_status text;
  v_aluno text;
begin
  if p_fila = 'notificacao' then
    select n.tentativas + 1, n.id_aluno into v_tent, v_aluno from app.notificacoes n
     where n.id = p_id and n.status = 'Processando'
       and n.id_aluno in (select e.id_aluno from app.fila_escopo(p_token) e)
     for update;
  elsif p_fila = 'calendario' then
    select c.tentativas + 1, c.id_aluno into v_tent, v_aluno from app.eventos_calendario c
     where c.id = p_id and c.status = 'Processando'
       and c.id_aluno in (select e.id_aluno from app.fila_escopo(p_token) e)
     for update;
  else
    raise exception 'FILA_INVALIDA' using errcode = 'PT400';
  end if;
  if v_tent is null then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;

  v_status := case when p_ok then 'Enviado' when v_tent >= v_max then 'Falha' else 'Pendente' end;

  if p_fila = 'notificacao' then
    update app.notificacoes
       set status = v_status, tentativas = v_tent, lease_ate = null,
           ultimo_erro = case when p_ok then null else left(p_erro, 500) end,
           provedor = coalesce(p_provedor, provedor), id_externo = coalesce(p_id_externo, id_externo),
           proxima_tentativa = case when v_status = 'Pendente' then now() + app.backoff(v_tent) else proxima_tentativa end,
           concluido_em = case when v_status in ('Enviado', 'Falha') then now() end
     where id = p_id;
  else
    update app.eventos_calendario
       set status = v_status, tentativas = v_tent, lease_ate = null,
           ultimo_erro = case when p_ok then null else left(p_erro, 500) end,
           id_externo = coalesce(p_id_externo, id_externo),
           proxima_tentativa = case when v_status = 'Pendente' then now() + app.backoff(v_tent) else proxima_tentativa end,
           concluido_em = case when v_status in ('Enviado', 'Falha') then now() end
     where id = p_id;
  end if;

  -- Inscrições de push expiradas (404/410 do serviço de push) são removidas.
  if p_endpoints_invalidos is not null then
    delete from app.push_inscricoes where id_aluno = v_aluno and endpoint = any (p_endpoints_invalidos);
  end if;

  return jsonb_build_object('status', v_status, 'tentativas', v_tent);
end $$;

-- ---------------------------------------------------------------------------
-- Painel: fila de integrações
-- ---------------------------------------------------------------------------
create function app.integracoes_visiveis(p_usuario_id uuid)
returns table (fila text, id uuid, tipo text, evento text, status text, tentativas smallint,
               criado_em timestamptz, proxima_tentativa timestamptz, concluido_em timestamptz,
               ultimo_erro text, destino text, id_aluno text, aluno text, payload jsonb, provedor text)
language sql stable security definer set search_path = '' as $$
  select 'notificacao', n.id, n.canal, n.evento, n.status, n.tentativas, n.criado_em, n.proxima_tentativa,
         n.concluido_em, n.ultimo_erro, app.mascarar_email(n.destino), a.id_aluno, a.nome, n.payload, n.provedor
    from app.notificacoes n join app.alunos a on a.id_aluno = n.id_aluno
   where a.unidade in (select app.unidades_escopo(p_usuario_id))
  union all
  select 'calendario', c.id, c.provedor, c.acao, c.status, c.tentativas, c.criado_em, c.proxima_tentativa,
         c.concluido_em, c.ultimo_erro, null, a.id_aluno, a.nome, c.payload, c.provedor
    from app.eventos_calendario c join app.alunos a on a.id_aluno = c.id_aluno
   where a.unidade in (select app.unidades_escopo(p_usuario_id))
$$;
create function public.adm_listar_integracoes(
  p_token text, p_status text default null, p_tipo text default null, p_pagina int default 1
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_pag int := greatest(coalesce(p_pagina, 1), 1);
  v_total int;
  v_itens jsonb;
  v_resumo jsonb;
begin
  perform app.exigir_permissao(u.id, 'NOTIFICACOES_GERENCIAR');

  select jsonb_build_object(
           'pendentes', count(*) filter (where status in ('Pendente', 'Processando')),
           'falhas', count(*) filter (where status = 'Falha'),
           'enviados', count(*) filter (where status = 'Enviado'))
    into v_resumo from app.integracoes_visiveis(u.id);

  select count(*) into v_total from app.integracoes_visiveis(u.id) i
   where (nullif(p_status, '') is null or i.status = p_status)
     and (nullif(p_tipo, '') is null or i.tipo = p_tipo);

  select coalesce(jsonb_agg(jsonb_build_object(
           'fila', i.fila, 'id', i.id, 'tipo', i.tipo, 'evento', i.evento, 'status', i.status,
           'tentativas', i.tentativas, 'criado_em', i.criado_em, 'proxima_tentativa', i.proxima_tentativa,
           'concluido_em', i.concluido_em, 'ultimo_erro', i.ultimo_erro, 'destino', i.destino,
           'id_aluno', i.id_aluno, 'aluno', i.aluno, 'provedor', i.provedor,
           'aula', jsonb_build_object('data', i.payload->'data', 'hora', i.payload->'hora',
                                      'idioma', i.payload->'idioma', 'nivel_curso', i.payload->'nivel_curso'))
           order by i.criado_em desc), '[]'::jsonb)
    into v_itens
    from (select * from app.integracoes_visiveis(u.id) i
           where (nullif(p_status, '') is null or i.status = p_status)
             and (nullif(p_tipo, '') is null or i.tipo = p_tipo)
           order by i.criado_em desc
           offset (v_pag - 1) * 50 limit 50) i;

  return jsonb_build_object('itens', v_itens, 'total', v_total, 'pagina', v_pag, 'por_pagina', 50, 'resumo', v_resumo);
end $$;

-- Conteúdo de uma notificação (caixa de saída): o servidor renderiza o e-mail.
create function public.adm_obter_notificacao(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v jsonb;
begin
  perform app.exigir_permissao(u.id, 'NOTIFICACOES_GERENCIAR');
  select jsonb_build_object('id', n.id, 'canal', n.canal, 'evento', n.evento, 'status', n.status,
                            'destino', n.destino, 'payload', n.payload, 'tentativas', n.tentativas,
                            'provedor', n.provedor, 'id_externo', n.id_externo, 'ultimo_erro', n.ultimo_erro,
                            'criado_em', n.criado_em, 'concluido_em', n.concluido_em)
    into v
    from app.notificacoes n join app.alunos a on a.id_aluno = n.id_aluno
   where n.id = p_id and a.unidade in (select app.unidades_escopo(u.id));
  if v is null then raise exception 'NAO_ENCONTRADO' using errcode = 'PT404'; end if;
  perform app.auditar('ADM', u.id::text, 'NOTIFICACAO_VISUALIZADA', 'notificacao', p_id::text, null, '{}'::jsonb);
  return v;
end $$;

-- Reprocessar: devolve itens com Falha para a fila, zerando as tentativas.
create function public.adm_reprocessar_integracoes(
  p_token text, p_fila text default null, p_id uuid default null, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_n int := 0;
  v_c int := 0;
begin
  perform app.exigir_permissao(u.id, 'NOTIFICACOES_GERENCIAR');
  if p_fila is null or p_fila = 'notificacao' then
    update app.notificacoes n
       set status = 'Pendente', tentativas = 0, proxima_tentativa = now(), concluido_em = null
     where n.status = 'Falha' and (p_id is null or n.id = p_id)
       and n.id_aluno in (select al.id_aluno from app.alunos al where al.unidade in (select app.unidades_escopo(u.id)));
    get diagnostics v_n = row_count;
  end if;
  if p_fila is null or p_fila = 'calendario' then
    update app.eventos_calendario c
       set status = 'Pendente', tentativas = 0, proxima_tentativa = now(), concluido_em = null
     where c.status = 'Falha' and (p_id is null or c.id = p_id)
       and c.id_aluno in (select al.id_aluno from app.alunos al where al.unidade in (select app.unidades_escopo(u.id)));
    get diagnostics v_c = row_count;
  end if;
  if v_n + v_c > 0 then
    perform app.auditar('ADM', u.id::text, 'INTEGRACOES_REPROCESSADAS', 'fila', p_id::text, p_ip,
                        jsonb_build_object('notificacoes', v_n, 'calendario', v_c));
  end if;
  return jsonb_build_object('notificacoes', v_n, 'calendario', v_c);
end $$;

-- ---------------------------------------------------------------------------
-- Aluno: Web Push e convite .ics
-- ---------------------------------------------------------------------------
create function public.aluno_push_inscrever(p_token text, p_endpoint text, p_chave text, p_auth text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.sessao_aluno(p_token);
begin
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_chave, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'INSCRICAO_INVALIDA' using errcode = 'PT400';
  end if;
  insert into app.push_inscricoes (endpoint, id_aluno, p256dh, auth)
  values (p_endpoint, a.id_aluno, p_chave, p_auth)
  on conflict (endpoint) do update set id_aluno = excluded.id_aluno, p256dh = excluded.p256dh, auth = excluded.auth;
  return jsonb_build_object('ok', true);
end $$;

create function public.aluno_push_cancelar(p_token text, p_endpoint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.sessao_aluno(p_token);
begin
  delete from app.push_inscricoes where endpoint = p_endpoint and id_aluno = a.id_aluno;
  return jsonb_build_object('ok', true);
end $$;

create function public.aluno_convite_reposicao(p_token text, p_reposicao_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.aluno_liberado(p_token);
begin
  if not exists (select 1 from app.reposicoes r where r.id = p_reposicao_id and r.id_aluno = a.id_aluno) then
    raise exception 'NAO_ENCONTRADO' using errcode = 'PT404';
  end if;
  return app.dados_reposicao(p_reposicao_id);
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
       'fila_reservar', 'fila_concluir', 'adm_listar_integracoes', 'adm_obter_notificacao',
       'adm_reprocessar_integracoes', 'aluno_push_inscrever', 'aluno_push_cancelar', 'aluno_convite_reposicao')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
