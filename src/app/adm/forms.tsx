"use client";

import { Formulario } from "@/components/form";
import { Campo } from "@/components/ui";
import { criarUnidade, criarUsuario, entrarAdm, trocarSenhaAdm } from "./actions";

const AJUDA_SENHA_ADM = "Mínimo de 12 caracteres, com maiúscula, minúscula, número e símbolo.";

export const PAPEIS = [
  { codigo: "ADM_COORDENACAO", rotulo: "Coordenação" },
  { codigo: "ADM_RH", rotulo: "RH corporativo" },
  { codigo: "ADM_SUPERADMIN", rotulo: "Superadministrador" },
];

export function FormLoginAdm() {
  return (
    <Formulario acao={entrarAdm} textoBotao="Entrar" textoPendente="Entrando…">
      {(estado) => (
        <>
          <Campo
            id="email"
            name="email"
            type="email"
            rotulo="E-mail institucional"
            autoComplete="username"
            required
            defaultValue={estado.valores?.email}
          />
          <Campo id="senha" name="senha" type="password" rotulo="Senha" autoComplete="current-password" required />
        </>
      )}
    </Formulario>
  );
}

export function FormTrocarSenhaAdm() {
  return (
    <Formulario acao={trocarSenhaAdm} textoBotao="Alterar senha" textoPendente="Salvando…">
      <Campo id="atual" name="atual" type="password" rotulo="Senha atual" autoComplete="current-password" required />
      <Campo id="nova" name="nova" type="password" rotulo="Nova senha" autoComplete="new-password" ajuda={AJUDA_SENHA_ADM} required />
      <Campo id="confirmacao" name="confirmacao" type="password" rotulo="Confirme a nova senha" autoComplete="new-password" required />
    </Formulario>
  );
}

export function FormCriarUnidade() {
  return (
    <Formulario acao={criarUnidade} textoBotao="Cadastrar unidade" textoPendente="Salvando…" className="flex flex-col gap-4 sm:max-w-md">
      {(estado) => <Campo id="nome" name="nome" rotulo="Nome da unidade" required defaultValue={estado.valores?.nome} />}
    </Formulario>
  );
}

export function FormCriarUsuario({ unidades }: { unidades: string[] }) {
  return (
    <Formulario acao={criarUsuario} textoBotao="Criar usuário" textoPendente="Criando…">
      {(estado) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="u-nome" name="nome" rotulo="Nome" required defaultValue={estado.valores?.nome} />
            <Campo id="u-email" name="email" type="email" rotulo="E-mail institucional" required defaultValue={estado.valores?.email} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="u-papel" className="text-sm font-medium">
              Papel
            </label>
            <select
              id="u-papel"
              name="papel"
              required
              defaultValue={estado.valores?.papel ?? ""}
              className="min-h-11 rounded-padrao border border-borda bg-superficie px-3"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {PAPEIS.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </div>
          <Campo id="u-senha" name="senha" type="password" rotulo="Senha inicial" autoComplete="new-password" ajuda={AJUDA_SENHA_ADM} required />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Unidades vinculadas</legend>
            {unidades.length === 0 ? (
              <p className="text-sm text-suave">Nenhuma unidade cadastrada ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {unidades.map((u) => (
                  <label key={u} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="unidades" value={u} className="size-5" />
                    {u}
                  </label>
                ))}
              </div>
            )}
            <p className="text-sm text-suave">Superadministradores enxergam todas as unidades.</p>
          </fieldset>
        </>
      )}
    </Formulario>
  );
}
