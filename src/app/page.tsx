import Link from "next/link";
import { AlternarTema } from "@/components/tema";
import { Logo } from "@/components/ui";

export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-12">
      <div className="flex justify-end">
        <AlternarTema />
      </div>
      <h1>
        <Logo largura={280} prioridade />
      </h1>
      <p className="mt-2 text-suave">Escolha como você quer entrar.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/aluno/login"
          className="rounded-padrao border border-borda bg-superficie p-6 hover:border-borda-campo"
        >
          <span className="text-lg font-semibold">Portal do Aluno</span>
          <span className="mt-1 block text-sm text-suave">Suas aulas, presenças e perfil.</span>
        </Link>
        <Link
          href="/adm/login"
          className="rounded-padrao border border-borda bg-superficie p-6 hover:border-borda-campo"
        >
          <span className="text-lg font-semibold">Painel Administrativo</span>
          <span className="mt-1 block text-sm text-suave">Coordenação, RH e administração.</span>
        </Link>
      </div>
    </main>
  );
}
