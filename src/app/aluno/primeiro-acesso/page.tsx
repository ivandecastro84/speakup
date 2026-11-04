import type { Metadata } from "next";
import { FormPrimeiroAcesso } from "../forms";

export const metadata: Metadata = { title: "Criar nova senha" };

export default function PrimeiroAcesso() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-bold">Crie sua nova senha</h1>
      <p className="mt-1 text-suave">
        Por segurança, troque a senha inicial antes de continuar. Você só precisa fazer isso uma vez.
      </p>
      <div className="mt-6 rounded-padrao border border-borda bg-superficie p-5">
        <FormPrimeiroAcesso />
      </div>
      <form action="/aluno/sair" method="post" className="mt-4">
        <button type="submit" className="min-h-11 text-sm text-suave underline">
          Sair
        </button>
      </form>
    </main>
  );
}
