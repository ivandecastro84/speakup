import Link from "next/link";
import { AlternarTema } from "@/components/tema";
import { Marca } from "@/components/ui";
import { NavInferior } from "./nav";

export default function LayoutPortal({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between border-b border-borda bg-superficie px-4 py-3">
        <Link href="/aluno" className="text-lg" aria-label="Speak Up Idiomas — início">
          <Marca />
        </Link>
        <div className="flex items-center gap-2">
          <AlternarTema />
          <form action="/aluno/sair" method="post">
            <button type="submit" className="min-h-11 px-2 text-sm text-suave underline">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 pb-28 pt-6">{children}</main>
      <NavInferior />
    </div>
  );
}
