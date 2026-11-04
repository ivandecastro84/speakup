"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITENS = [
  { href: "/aluno", rotulo: "Início" },
  { href: "/aluno/perfil", rotulo: "Perfil" },
];

/** Navegação inferior fixa do Portal do Aluno (alvos de toque >= 44 px). */
export function NavInferior() {
  const atual = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 border-t border-borda bg-superficie pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg">
        {ITENS.map((i) => {
          const ativo = atual === i.href;
          return (
            <li key={i.href} className="flex-1">
              <Link
                href={i.href}
                aria-current={ativo ? "page" : undefined}
                className={cx(
                  "flex min-h-14 items-center justify-center text-sm font-semibold",
                  ativo ? "text-destaque" : "text-suave",
                )}
              >
                {i.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
