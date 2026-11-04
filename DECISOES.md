# Registro de decisões — Speak Up Idiomas

Todo item marcado **[DECISÃO PENDENTE]** tem um *default* já implementado e isolado em configuração.
Ele precisa ser confirmado (ou trocado) pelo responsável de produto. Os itens **[DECIDIDO]** foram
confirmados pelo usuário.

| # | Tema | Status | Default aplicado / decisão | Onde fica | Impacto se mudar |
|---|------|--------|----------------------------|-----------|------------------|
| D01 | Stack | [DECIDIDO] | Next.js 15 (App Router, TypeScript, Tailwind 4) + Supabase (Postgres 17) | `package.json`, `supabase/` | — |
| D02 | Região do banco | [DECISÃO PENDENTE] | `sa-east-1` (São Paulo): dados de alunos ficam no Brasil (LGPD) e a latência é menor | projeto Supabase `speak-up-idiomas` | Trocar de região exige recriar o projeto |
| D03 | Mecanismo de autenticação | [DECISÃO PENDENTE] | Autenticação própria por RPC no Postgres (bcrypt via `pgcrypto`) + JWT HS256 em cookie httpOnly, **em vez do Supabase Auth**. Motivos: o login do aluno é por matrícula com senha padrão; a importação de 2.000 alunos não pode criar 2.000 contas no Auth em < 15 s; o RBAC por unidade fica centralizado no banco | `supabase/migrations/*_k1_*`, `src/lib/jwt.ts`, `src/lib/server/` | Migrar para o Supabase Auth exigiria refazer o login e as sessões |
| D04 | Sessão e refresh | [DECISÃO PENDENTE] | Sessão no banco com expiração deslizante (aluno 120 min, ADM 60 min). O JWT é reemitido pelo middleware após metade da validade, e isso faz o papel do refresh token. Inatividade além do prazo → novo login (J-B3) | `app.configuracao` (`sessao_*_minutos`), `src/middleware.ts` | Um refresh token separado é viável sem mudar o banco |
| D05 | Bloqueio do aluno | [DECISÃO PENDENTE] | 5 falhas seguidas → bloqueio de **15 min**; durante o bloqueio, nem a senha correta entra | `app.configuracao` (`aluno_max_tentativas`, `aluno_bloqueio_minutos`) | Só configuração |
| D06 | Bloqueio do ADM | [DECISÃO PENDENTE] | A especificação não pede bloqueio por tentativas no login ADM; **não implementado**. Recomendação: aplicar a mesma regra do aluno | — | Exige migração |
| D07 | Perfil ADM_RH | [DECISÃO PENDENTE] | Somente `RELATORIOS_LER`, restrito às unidades vinculadas; sem importação, edição de grade ou leitura da base de alunos | `app.papel_permissao` | Só dados (tabela de permissões) |
| D08 | Aluno com matrícula Cancelada | [DECISÃO PENDENTE] | O prompt se contradiz: E.2 diz que a pré-condição é "status ≠ Cancelada", mas F.1 manda autenticar e mostrar "matrícula encerrada". **Aplicado F.1** | `login_aluno`, `/aluno` | Bloquear o login é uma linha em `login_aluno` |
| D09 | Nova senha do aluno | [DECISÃO PENDENTE] | Regra derivada: a nova senha não pode ser igual à senha padrão `Escola@@@` | `aluno_definir_senha` | — |
| D10 | Nome da coluna 19 | [DECIDIDO pela regra L] | Coluna gravada com o nome exato `"Valor Mensalidade"` (com espaço), igual ao cabeçalho oficial | `app.alunos` | — |
| D11 | Unidades | [DECISÃO PENDENTE] | `Unidade` é uma tabela própria e `aluno.unidade` referencia o nome dela. Comportamento da importação (K2) para unidade inexistente: **a definir**. Proposta: o superadmin cria a unidade automaticamente; a coordenação recebe erro de linha | `app.unidades` | Afeta o K2 |
| D12 | Gestão de usuários e unidades | [DECISÃO PENDENTE] | Construídas no K1 (tela mínima: listar e criar), porque o papel ADM_SUPERADMIN inclui "gestão de usuários administrativos" e sem ela não há como vincular coordenação/RH a unidades. Edição e desativação de usuários ficam fora do K1 | `/adm/usuarios`, `/adm/unidades` | — |
| D13 | Identidade visual | [DECISÃO PENDENTE] | `system-ui`, paleta neutra e uma cor de destaque (`#1f4fd1`), todos os tokens em `src/app/globals.css` | `globals.css` | Troca centralizada |
| D14 | Avisos do Supabase Advisor | [CIENTE] | O linter alerta "SECURITY DEFINER executável por anon" nas 13 RPCs. É **intencional**: elas formam a API pública, cada uma valida o token de sessão e as permissões, e as tabelas ficam no schema `app`, sem acesso pela API | `public.*` | — |
| D15 | Superadmin inicial em produção | [DECISÃO PENDENTE] | **Ainda não criado.** É preciso definir o e-mail do primeiro superadmin | — | Bloqueia o primeiro acesso ADM em produção |
| D16 | Ambiente de desenvolvimento | [CIENTE] | O container de desenvolvimento não alcança `*.supabase.co`. Os testes rodam num Postgres local com as **mesmas migrações** (o `bootstrap.sql` recria os papéis `anon`/`authenticated`), e o adaptador `rpc()` usa `DATABASE_URL` localmente e o Supabase em produção | `scripts/db.mjs`, `src/lib/server/rpc.ts` | — |
| D17 | SSO OAuth2/SAML | [DECISÃO PENDENTE] | IdP não definido. Será implementado no K6 como adaptador genérico OIDC/SAML 2.0 | — | — |
