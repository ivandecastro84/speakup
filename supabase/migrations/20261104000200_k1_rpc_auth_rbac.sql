-- K1 · Funções internas (schema app) e RPCs públicas de autenticação, RBAC,
-- usuários administrativos, unidades e auditoria.
-- Convenção de erros (SQLSTATE "PT" + status HTTP, entendido pelo PostgREST):
--   PT400 dado inválido · PT401 sessão inválida · PT403 sem permissão · PT409 conflito

-- ---------------------------------------------------------------------------
-- Utilitários internos
-- ---------------------------------------------------------------------------
create function app.hash_token(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create function app.mascarar_email(p_email text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else left(p_email, 1) || '***@' || split_part(p_email, '@', 2)
  end
$$;

create function app.auditar(
  p_ator_tipo text, p_ator_id text, p_acao text,
  p_entidade text default null, p_entidade_id text default null,
  p_ip text default null, p_detalhes jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into app.log_auditoria (ator_tipo, ator_id, acao, entidade, entidade_id, ip, detalhes)
  values (p_ator_tipo, p_ator_id, p_acao, p_entidade, p_entidade_id, p_ip, coalesce(p_detalhes, '{}'::jsonb));
$$;

create function app.criar_sessao(p_tipo text, p_id_aluno text, p_usuario_id uuid, p_ip text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_min int := app.cfg_int(case when p_tipo = 'ALUNO' then 'sessao_aluno_minutos' else 'sessao_adm_minutos' end);
  v_expira timestamptz := now() + make_interval(mins => v_min);
begin
  insert into app.sessoes (token_hash, tipo, id_aluno, usuario_id, ip, expira_em)
  values (app.hash_token(v_token), p_tipo, p_id_aluno, p_usuario_id, p_ip, v_expira);
  return jsonb_build_object('token', v_token, 'expira_em', v_expira, 'duracao_minutos', v_min);
end $$;

-- Valida a sessão e renova a expiração (sliding). Lança PT401 se inválida.
create function app.validar_sessao(p_token text, p_tipo text) returns app.sessoes
language plpgsql security definer set search_path = '' as $$
declare
  s app.sessoes;
  v_min int;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'SESSAO_INVALIDA' using errcode = 'PT401';
  end if;

  select * into s
    from app.sessoes
   where token_hash = app.hash_token(p_token)
     and tipo = p_tipo
     and revogada_em is null
     and expira_em > now();

  if not found then
    raise exception 'SESSAO_INVALIDA' using errcode = 'PT401';
  end if;

  v_min := app.cfg_int(case when p_tipo = 'ALUNO' then 'sessao_aluno_minutos' else 'sessao_adm_minutos' end);
  update app.sessoes
     set expira_em = now() + make_interval(mins => v_min), ultimo_uso_em = now()
   where id = s.id;

  return s;
end $$;

create function app.sessao_aluno(p_token text) returns app.alunos
language plpgsql security definer set search_path = '' as $$
declare
  s app.sessoes := app.validar_sessao(p_token, 'ALUNO');
  a app.alunos;
begin
  select * into a from app.alunos where id_aluno = s.id_aluno;
  if not found then
    raise exception 'SESSAO_INVALIDA' using errcode = 'PT401';
  end if;
  return a;
end $$;

create function app.sessao_adm(p_token text) returns app.usuarios_adm
language plpgsql security definer set search_path = '' as $$
declare
  s app.sessoes := app.validar_sessao(p_token, 'ADM');
  u app.usuarios_adm;
begin
  select * into u from app.usuarios_adm where id = s.usuario_id and ativo;
  if not found then
    raise exception 'SESSAO_INVALIDA' using errcode = 'PT401';
  end if;
  return u;
end $$;

create function app.tem_permissao(p_usuario_id uuid, p_permissao text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from app.usuarios_adm u
      join app.papel_permissao pp on pp.papel = u.papel
     where u.id = p_usuario_id and u.ativo and pp.permissao = p_permissao
  )
$$;

create function app.exigir_permissao(p_usuario_id uuid, p_permissao text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.tem_permissao(p_usuario_id, p_permissao) then
    raise exception 'SEM_PERMISSAO:%', p_permissao using errcode = 'PT403';
  end if;
end $$;

-- Nomes das unidades no escopo do usuário (todas, se tiver TODAS_UNIDADES).
create function app.unidades_escopo(p_usuario_id uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select un.nome from app.unidades un
   where app.tem_permissao(p_usuario_id, 'TODAS_UNIDADES')
  union
  select un.nome
    from app.unidade_usuario uu
    join app.unidades un on un.id = uu.unidade_id
   where uu.usuario_id = p_usuario_id
$$;

create function app.validar_senha_aluno(p_senha text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_senha is null or length(p_senha) < 8 or p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then
    raise exception 'SENHA_FRACA_ALUNO' using errcode = 'PT400';
  end if;
end $$;

create function app.validar_senha_adm(p_senha text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_senha is null or length(p_senha) < 12
     or p_senha !~ '[A-Z]' or p_senha !~ '[a-z]' or p_senha !~ '[0-9]' or p_senha !~ '[^A-Za-z0-9]' then
    raise exception 'SENHA_FRACA_ADM' using errcode = 'PT400';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPC · Aluno
-- ---------------------------------------------------------------------------
create function public.login_aluno(p_id_aluno text, p_senha text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos;
  v_ok boolean;
  v_max int := app.cfg_int('aluno_max_tentativas');
  v_bloq int := app.cfg_int('aluno_bloqueio_minutos');
  v_sessao jsonb;
begin
  select * into a from app.alunos where id_aluno = btrim(p_id_aluno) for update;

  if not found then
    perform app.auditar('ANONIMO', btrim(p_id_aluno), 'LOGIN_ALUNO_FALHA', 'aluno', btrim(p_id_aluno), p_ip,
                        jsonb_build_object('motivo', 'inexistente'));
    return jsonb_build_object('ok', false, 'erro', 'CREDENCIAIS_INVALIDAS');
  end if;

  if a.bloqueado_ate is not null and a.bloqueado_ate > now() then
    perform app.auditar('ANONIMO', a.id_aluno, 'LOGIN_ALUNO_BLOQUEADO', 'aluno', a.id_aluno, p_ip);
    return jsonb_build_object('ok', false, 'erro', 'CONTA_BLOQUEADA', 'bloqueado_ate', a.bloqueado_ate);
  end if;

  v_ok := case
    when a.senha_hash is null then extensions.crypt(coalesce(p_senha, ''), app.cfg('senha_padrao_hash')) = app.cfg('senha_padrao_hash')
    else extensions.crypt(coalesce(p_senha, ''), a.senha_hash) = a.senha_hash
  end;

  if not v_ok then
    if a.tentativas_falhas + 1 >= v_max then
      update app.alunos
         set tentativas_falhas = 0, bloqueado_ate = now() + make_interval(mins => v_bloq)
       where id_aluno = a.id_aluno;
      perform app.auditar('ANONIMO', a.id_aluno, 'ALUNO_BLOQUEADO', 'aluno', a.id_aluno, p_ip,
                          jsonb_build_object('minutos', v_bloq));
      return jsonb_build_object('ok', false, 'erro', 'CONTA_BLOQUEADA',
                                'bloqueado_ate', now() + make_interval(mins => v_bloq));
    end if;
    update app.alunos set tentativas_falhas = tentativas_falhas + 1 where id_aluno = a.id_aluno;
    perform app.auditar('ANONIMO', a.id_aluno, 'LOGIN_ALUNO_FALHA', 'aluno', a.id_aluno, p_ip,
                        jsonb_build_object('tentativa', a.tentativas_falhas + 1));
    return jsonb_build_object('ok', false, 'erro', 'CREDENCIAIS_INVALIDAS');
  end if;

  update app.alunos set tentativas_falhas = 0, bloqueado_ate = null where id_aluno = a.id_aluno;
  v_sessao := app.criar_sessao('ALUNO', a.id_aluno, null, p_ip);
  perform app.auditar('ALUNO', a.id_aluno, 'LOGIN_ALUNO', 'aluno', a.id_aluno, p_ip);

  return v_sessao || jsonb_build_object(
    'ok', true,
    'primeiro_acesso', a.primeiro_acesso,
    'status_matricula', a.status_matricula
  );
end $$;

create function public.aluno_me(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.sessao_aluno(p_token);
begin
  return (to_jsonb(a) - 'senha_hash' - 'tentativas_falhas' - 'bloqueado_ate' - 'criado_em' - 'atualizado_em');
end $$;

-- Define a senha do aluno. No primeiro acesso a senha atual não é exigida
-- (o aluno acabou de se autenticar com a senha padrão).
create function public.aluno_definir_senha(p_token text, p_senha_atual text, p_nova_senha text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a app.alunos := app.sessao_aluno(p_token);
  v_atual_ok boolean;
begin
  if not a.primeiro_acesso then
    v_atual_ok := case
      when a.senha_hash is null then extensions.crypt(coalesce(p_senha_atual, ''), app.cfg('senha_padrao_hash')) = app.cfg('senha_padrao_hash')
      else extensions.crypt(coalesce(p_senha_atual, ''), a.senha_hash) = a.senha_hash
    end;
    if not v_atual_ok then
      raise exception 'SENHA_ATUAL_INCORRETA' using errcode = 'PT400';
    end if;
  end if;

  perform app.validar_senha_aluno(p_nova_senha);

  if extensions.crypt(p_nova_senha, app.cfg('senha_padrao_hash')) = app.cfg('senha_padrao_hash') then
    raise exception 'SENHA_IGUAL_PADRAO' using errcode = 'PT400';
  end if;

  update app.alunos
     set senha_hash = extensions.crypt(p_nova_senha, extensions.gen_salt('bf', 10)),
         primeiro_acesso = false,
         atualizado_em = now()
   where id_aluno = a.id_aluno;

  perform app.auditar('ALUNO', a.id_aluno,
                      case when a.primeiro_acesso then 'ALUNO_SENHA_PRIMEIRO_ACESSO' else 'ALUNO_SENHA_ALTERADA' end,
                      'aluno', a.id_aluno, p_ip);
  return jsonb_build_object('ok', true, 'primeiro_acesso', false);
end $$;

-- ---------------------------------------------------------------------------
-- RPC · Administração
-- ---------------------------------------------------------------------------
create function public.adm_login(p_email text, p_senha text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm;
  v_sessao jsonb;
begin
  select * into u from app.usuarios_adm where lower(email) = lower(btrim(p_email)) and ativo;

  if not found or extensions.crypt(coalesce(p_senha, ''), u.senha_hash) <> u.senha_hash then
    perform app.auditar('ANONIMO', null, 'LOGIN_ADM_FALHA', 'usuario_adm', u.id::text, p_ip,
                        jsonb_build_object('email', app.mascarar_email(btrim(p_email))));
    return jsonb_build_object('ok', false, 'erro', 'CREDENCIAIS_INVALIDAS');
  end if;

  v_sessao := app.criar_sessao('ADM', null, u.id, p_ip);
  perform app.auditar('ADM', u.id::text, 'LOGIN_ADM', 'usuario_adm', u.id::text, p_ip);
  return v_sessao || jsonb_build_object('ok', true, 'papel', u.papel);
end $$;

create function public.adm_me(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  return jsonb_build_object(
    'id', u.id,
    'nome', u.nome,
    'email', u.email,
    'papel', u.papel,
    'permissoes', coalesce((select jsonb_agg(permissao order by permissao)
                              from app.papel_permissao where papel = u.papel), '[]'::jsonb),
    'unidades', coalesce((select jsonb_agg(nome order by nome)
                            from app.unidades_escopo(u.id) as nome), '[]'::jsonb)
  );
end $$;

-- Resumo do dashboard: alunos por unidade e status, apenas no escopo.
create function public.adm_resumo(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'ALUNOS_LER');
  return coalesce((
    select jsonb_agg(linha order by linha->>'unidade')
      from (
        select jsonb_build_object(
                 'unidade', es.nome,
                 'total', count(a.id_aluno),
                 'ativa', count(a.id_aluno) filter (where a.status_matricula = 'Ativa'),
                 'trancada', count(a.id_aluno) filter (where a.status_matricula = 'Trancada'),
                 'cancelada', count(a.id_aluno) filter (where a.status_matricula = 'Cancelada'),
                 'concluida', count(a.id_aluno) filter (where a.status_matricula = 'Concluída')
               ) as linha
          from app.unidades_escopo(u.id) as es(nome)
          left join app.alunos a on a.unidade = es.nome
         group by es.nome
      ) t
  ), '[]'::jsonb);
end $$;

create function public.adm_trocar_senha(p_token text, p_senha_atual text, p_nova_senha text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  if extensions.crypt(coalesce(p_senha_atual, ''), u.senha_hash) <> u.senha_hash then
    raise exception 'SENHA_ATUAL_INCORRETA' using errcode = 'PT400';
  end if;
  perform app.validar_senha_adm(p_nova_senha);
  update app.usuarios_adm set senha_hash = extensions.crypt(p_nova_senha, extensions.gen_salt('bf', 10)) where id = u.id;
  perform app.auditar('ADM', u.id::text, 'ADM_SENHA_ALTERADA', 'usuario_adm', u.id::text, p_ip);
  return jsonb_build_object('ok', true);
end $$;

create function public.adm_listar_unidades(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', un.id, 'nome', un.nome) order by un.nome)
      from app.unidades un
     where un.nome in (select app.unidades_escopo(u.id))
  ), '[]'::jsonb);
end $$;

create function public.adm_criar_unidade(p_token text, p_nome text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_id uuid;
begin
  perform app.exigir_permissao(u.id, 'UNIDADES_GERENCIAR');
  if p_nome is null or length(btrim(p_nome)) = 0 then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'PT400';
  end if;
  insert into app.unidades (nome) values (btrim(p_nome))
  on conflict (nome) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'UNIDADE_JA_EXISTE' using errcode = 'PT409';
  end if;
  perform app.auditar('ADM', u.id::text, 'UNIDADE_CRIADA', 'unidade', v_id::text, p_ip,
                      jsonb_build_object('nome', btrim(p_nome)));
  return jsonb_build_object('id', v_id, 'nome', btrim(p_nome));
end $$;

create function public.adm_listar_usuarios(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'USUARIOS_GERENCIAR');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'nome', x.nome, 'email', x.email, 'papel', x.papel, 'ativo', x.ativo,
             'criado_em', x.criado_em,
             'unidades', coalesce((select jsonb_agg(un.nome order by un.nome)
                                     from app.unidade_usuario uu join app.unidades un on un.id = uu.unidade_id
                                    where uu.usuario_id = x.id), '[]'::jsonb)
           ) order by x.nome)
      from app.usuarios_adm x
  ), '[]'::jsonb);
end $$;

create function public.adm_criar_usuario(
  p_token text, p_email text, p_nome text, p_papel text, p_senha text,
  p_unidades text[] default '{}', p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
  v_id uuid;
  v_faltantes text[];
begin
  perform app.exigir_permissao(u.id, 'USUARIOS_GERENCIAR');

  if p_email is null or btrim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_INVALIDO' using errcode = 'PT400';
  end if;
  if p_nome is null or length(btrim(p_nome)) = 0 then
    raise exception 'NOME_OBRIGATORIO' using errcode = 'PT400';
  end if;
  if not exists (select 1 from app.papeis where codigo = p_papel) then
    raise exception 'PAPEL_INVALIDO' using errcode = 'PT400';
  end if;
  perform app.validar_senha_adm(p_senha);

  select array_agg(n) into v_faltantes
    from unnest(coalesce(p_unidades, '{}')) as n
   where n not in (select nome from app.unidades);
  if v_faltantes is not null then
    raise exception 'UNIDADE_INEXISTENTE:%', array_to_string(v_faltantes, ', ') using errcode = 'PT400';
  end if;

  if exists (select 1 from app.usuarios_adm where lower(email) = lower(btrim(p_email))) then
    raise exception 'EMAIL_JA_CADASTRADO' using errcode = 'PT409';
  end if;

  insert into app.usuarios_adm (email, nome, senha_hash, papel)
  values (lower(btrim(p_email)), btrim(p_nome), extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), p_papel)
  returning id into v_id;

  insert into app.unidade_usuario (usuario_id, unidade_id)
  select v_id, un.id from app.unidades un where un.nome = any (coalesce(p_unidades, '{}'));

  perform app.auditar('ADM', u.id::text, 'USUARIO_ADM_CRIADO', 'usuario_adm', v_id::text, p_ip,
                      jsonb_build_object('papel', p_papel, 'email', app.mascarar_email(p_email),
                                         'unidades', to_jsonb(coalesce(p_unidades, '{}'))));
  return jsonb_build_object('id', v_id);
end $$;

create function public.adm_listar_auditoria(p_token text, p_limite int default 50, p_antes_de bigint default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u app.usuarios_adm := app.sessao_adm(p_token);
begin
  perform app.exigir_permissao(u.id, 'AUDITORIA_LER');
  return coalesce((
    select jsonb_agg(to_jsonb(l) order by l.id desc)
      from (
        select id, ocorrido_em, ator_tipo, ator_id, acao, entidade, entidade_id, ip, detalhes
          from app.log_auditoria
         where p_antes_de is null or id < p_antes_de
         order by id desc
         limit least(greatest(coalesce(p_limite, 50), 1), 200)
      ) l
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- RPC · Sessão (comum)
-- ---------------------------------------------------------------------------
create function public.encerrar_sessao(p_token text, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s app.sessoes;
begin
  update app.sessoes set revogada_em = now()
   where token_hash = app.hash_token(coalesce(p_token, '')) and revogada_em is null
  returning * into s;
  if found then
    perform app.auditar(s.tipo, coalesce(s.id_aluno, s.usuario_id::text), 'LOGOUT', 'sessao', s.id::text, p_ip);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Permissões de execução: só as RPCs públicas, só para os papéis da API.
-- ---------------------------------------------------------------------------
revoke all on schema app from anon, authenticated;
revoke all on all tables in schema app from anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;

revoke all on function
  public.login_aluno(text, text, text),
  public.aluno_me(text),
  public.aluno_definir_senha(text, text, text, text),
  public.adm_login(text, text, text),
  public.adm_me(text),
  public.adm_resumo(text),
  public.adm_trocar_senha(text, text, text, text),
  public.adm_listar_unidades(text),
  public.adm_criar_unidade(text, text, text),
  public.adm_listar_usuarios(text),
  public.adm_criar_usuario(text, text, text, text, text, text[], text),
  public.adm_listar_auditoria(text, int, bigint),
  public.encerrar_sessao(text, text)
from public;

grant execute on function
  public.login_aluno(text, text, text),
  public.aluno_me(text),
  public.aluno_definir_senha(text, text, text, text),
  public.adm_login(text, text, text),
  public.adm_me(text),
  public.adm_resumo(text),
  public.adm_trocar_senha(text, text, text, text),
  public.adm_listar_unidades(text),
  public.adm_criar_unidade(text, text, text),
  public.adm_listar_usuarios(text),
  public.adm_criar_usuario(text, text, text, text, text, text[], text),
  public.adm_listar_auditoria(text, int, bigint),
  public.encerrar_sessao(text, text)
to anon, authenticated;
