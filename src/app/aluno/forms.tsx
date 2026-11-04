"use client";

import { Formulario } from "@/components/form";
import { Campo } from "@/components/ui";
import { alterarSenhaAluno, definirSenhaPrimeiroAcesso, entrarAluno } from "./actions";

export function FormLoginAluno() {
  return (
    <Formulario acao={entrarAluno} textoBotao="Entrar" textoPendente="Entrando…">
      {(estado) => (
        <>
          <Campo
            id="id_aluno"
            name="id_aluno"
            rotulo="Matrícula"
            autoComplete="username"
            inputMode="text"
            required
            defaultValue={estado.valores?.id_aluno}
          />
          <Campo id="senha" name="senha" type="password" rotulo="Senha" autoComplete="current-password" required />
        </>
      )}
    </Formulario>
  );
}

const AJUDA_SENHA = "Mínimo de 8 caracteres, com letras e números.";

export function FormPrimeiroAcesso() {
  return (
    <Formulario acao={definirSenhaPrimeiroAcesso} textoBotao="Salvar nova senha" textoPendente="Salvando…">
      <Campo id="nova" name="nova" type="password" rotulo="Nova senha" autoComplete="new-password" ajuda={AJUDA_SENHA} required />
      <Campo id="confirmacao" name="confirmacao" type="password" rotulo="Confirme a nova senha" autoComplete="new-password" required />
    </Formulario>
  );
}

export function FormAlterarSenhaAluno() {
  return (
    <Formulario acao={alterarSenhaAluno} textoBotao="Alterar senha" textoPendente="Salvando…">
      <Campo id="atual" name="atual" type="password" rotulo="Senha atual" autoComplete="current-password" required />
      <Campo id="nova" name="nova" type="password" rotulo="Nova senha" autoComplete="new-password" ajuda={AJUDA_SENHA} required />
      <Campo id="confirmacao" name="confirmacao" type="password" rotulo="Confirme a nova senha" autoComplete="new-password" required />
    </Formulario>
  );
}
