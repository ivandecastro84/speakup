# Speak Up Idiomas

Sistema de gestão acadêmica e operacional: **Portal do Aluno** (PWA mobile-first) e **Painel
Administrativo/RH** (desktop), com RBAC por unidade e auditoria imutável.

Stack: Next.js 15 · TypeScript · Tailwind 4 · Supabase (Postgres 17).
As decisões ainda pendentes estão em [`DECISOES.md`](./DECISOES.md).

## Arquitetura em uma frase

As tabelas ficam no schema privado `app` e não são expostas pela API. Toda leitura e escrita passa
por funções SQL em `public` (RPC), que validam a sessão e as permissões **no banco**. O Next.js só
chama essas funções pelo adaptador `src/lib/server/rpc.ts`.

```
navegador ──cookie JWT──▶ Next.js (middleware + server actions) ──rpc()──▶ Postgres (app.* + RPCs)
```

## Rodando localmente

Pré-requisitos: Node 22 e um PostgreSQL local (16 ou superior).

```bash
npm install
```

```bash
cp .env.example .env.local   # preencha SESSION_SECRET e descomente DATABASE_URL
```

```bash
npm run db:reset -- postgres://dev:dev@localhost:5432/speakup_dev
```

```bash
SEED_ADMIN_PASSWORD='Uma-Senha-Forte-1!' node scripts/seed-dev.mjs postgres://dev:dev@localhost:5432/speakup_dev
```

```bash
npm run dev
```

O seed local cria `admin@speakup.local` (superadmin), `coordenacao@speakup.local` (Unidade Paulista)
e os alunos `2026001` a `2026004`, que entram com a senha inicial `Escola@@@`.

## Testes

```bash
npm test
```

Os testes recriam o banco `speakup_test` do zero a partir das migrações e verificam os critérios de
aceite (J-A*, J-B*, J-C*, J-H*) as regras de grade do K3 e o motor de reposição do K4 (J-D1 a J-D5) chamando as RPCs com o papel `anon`, como acontece em produção.

## Importação de alunos

Painel ADM → **Importações** → **Importar alunos**. Aceita `.xlsx` ou `.csv` com exatamente as 19 colunas
oficiais, na ordem. Variáveis opcionais: `IMPORT_ATOMIC`, `IMPORT_MAX_MB`, `IMPORT_MAX_LINHAS`,
`IMPORT_ASYNC_A_PARTIR_DE` (ver `DECISOES.md`, D22 e D23).

## Banco de produção

Projeto Supabase `speak-up-idiomas` (`sa-east-1`). As migrações em `supabase/migrations/` são aplicadas
em ordem. Para criar um superadmin, rode no SQL Editor (com o seu e-mail e uma senha forte):

```sql
insert into app.usuarios_adm (email, nome, senha_hash, papel)
values ('voce@empresa.com', 'Seu Nome', extensions.crypt('SUA-SENHA-FORTE', extensions.gen_salt('bf', 10)), 'ADM_SUPERADMIN');
```

## Etapas

| Etapa | Escopo | Situação |
|------|--------|----------|
| K1 | Fundações, autenticação de aluno e ADM, RBAC, auditoria, layout base | ✅ concluída |
| K2 | Importação em lote (.xlsx/.csv) | ✅ concluída |
| K3 | Painel de alunos, turmas, professores e grade | ✅ concluída |
| K4 | Motor de agendamento e dashboard do aluno | ✅ concluída |
| K5 | Relatórios de RH e notas | ✅ concluída |
| K6 | Calendário, notificações e PWA | concluído |
| — | API de notas para empresas parceiras (D59–D63) | concluído |
| K7 | Endurecimento (RNFs, acessibilidade, carga) | aguardando |
