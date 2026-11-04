import type { Metadata } from "next";
import Link from "next/link";
import { Alerta } from "@/components/ui";
import { FormLoginAluno } from "../forms";

export const metadata: Metadata = { title: "Entrar — Portal do Aluno" };

export default async function LoginAluno({ searchParams }: { searchParams: Promise<{ expirado?: string }> }) {
  const { expirado } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="text-sm text-suave underline">
        Speak Up Idiomas
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Portal do Aluno</h1>
      <p className="mt-1 text-suave">Entre com sua matrícula e senha.</p>
      <div className="mt-6 flex flex-col gap-4 rounded-padrao border border-borda bg-superficie p-5">
        {expirado && <Alerta tipo="info">Sua sessão expirou. Entre novamente.</Alerta>}
        <FormLoginAluno />
      </div>
      <p className="mt-4 text-sm text-suave">
        Primeiro acesso? Use sua matrícula e a senha inicial informada pela escola. Você vai criar uma nova
        senha em seguida.
      </p>
    </main>
  );
}
