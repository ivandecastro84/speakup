import Link from "next/link";

export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-12">
      <h1 className="text-3xl font-bold">Speak Up Idiomas</h1>
      <p className="mt-2 text-suave">Escolha como você quer entrar.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/aluno/login"
          className="rounded-padrao border border-borda bg-superficie p-6 hover:border-destaque"
        >
          <span className="text-lg font-semibold">Portal do Aluno</span>
          <span className="mt-1 block text-sm text-suave">Suas aulas, presenças e perfil.</span>
        </Link>
        <Link
          href="/adm/login"
          className="rounded-padrao border border-borda bg-superficie p-6 hover:border-destaque"
        >
          <span className="text-lg font-semibold">Painel Administrativo</span>
          <span className="mt-1 block text-sm text-suave">Coordenação, RH e administração.</span>
        </Link>
      </div>
    </main>
  );
}
