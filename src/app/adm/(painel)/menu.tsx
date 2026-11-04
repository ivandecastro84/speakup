"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function MenuLateral({ itens }: { itens: { href: string; rotulo: string }[] }) {
  const atual = usePathname();
  return (
    <nav aria-label="Menu do painel" className="px-3">
      <ul className="flex flex-col gap-1">
        {itens.map((i) => {
          const ativo = i.href === "/adm" ? atual === "/adm" : atual.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={ativo ? "page" : undefined}
                className={cx(
                  "flex min-h-11 items-center rounded-padrao px-3 text-sm font-medium",
                  ativo ? "bg-destaque-suave text-destaque" : "text-texto hover:bg-fundo",
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
