import type { Metadata } from "next";
import Link from "next/link";
import { Alerta } from "@/components/ui";
import { FormLoginAdm } from "../forms";

export const metadata: Metadata = { title: "Entrar — Painel Administrativo" };

export default async function LoginAdm({ searchParams }: { searchParams: Promise<{ expirado?: string }> }) {
  const { expirado } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="text-sm text-suave underline">
        Speak Up Idiomas
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Painel Administrativo</h1>
      <p className="mt-1 text-suave">Acesso restrito à coordenação, RH e administração.</p>
      <div className="mt-6 flex flex-col gap-4 rounded-padrao border border-borda bg-superficie p-5">
        {expirado && <Alerta tipo="info">Sua sessão expirou. Entre novamente.</Alerta>}
        <FormLoginAdm />
      </div>
    </main>
  );
}
