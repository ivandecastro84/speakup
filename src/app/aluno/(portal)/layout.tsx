import Link from "next/link";
import { NavInferior } from "./nav";

export default function LayoutPortal({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between border-b border-borda bg-superficie px-4 py-3">
        <Link href="/aluno" className="font-bold">
          Speak Up Idiomas
        </Link>
        <form action="/aluno/sair" method="post">
          <button type="submit" className="min-h-11 px-2 text-sm text-suave underline">
            Sair
          </button>
        </form>
      </header>
      <main className="flex-1 px-4 pb-28 pt-6">{children}</main>
      <NavInferior />
    </div>
  );
}
