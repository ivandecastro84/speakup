import Link from "next/link";
import { ROTULO_PAPEL, admAtual, type Permissao } from "./dados";
import { MenuLateral } from "./menu";

const ITENS: { href: string; rotulo: string; permissao?: Permissao }[] = [
  { href: "/adm", rotulo: "Visão geral" },
  { href: "/adm/unidades", rotulo: "Unidades", permissao: "UNIDADES_GERENCIAR" },
  { href: "/adm/usuarios", rotulo: "Usuários", permissao: "USUARIOS_GERENCIAR" },
  { href: "/adm/auditoria", rotulo: "Auditoria", permissao: "AUDITORIA_LER" },
  { href: "/adm/conta", rotulo: "Minha conta" },
];

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const u = await admAtual();
  const itens = ITENS.filter((i) => !i.permissao || u.permissoes.includes(i.permissao)).map(
    ({ href, rotulo }) => ({ href, rotulo }),
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-64 shrink-0 flex-col border-r border-borda bg-superficie">
        <Link href="/adm" className="px-5 py-5 text-lg font-bold">
          Speak Up Idiomas
        </Link>
        <MenuLateral itens={itens} />
        <div className="mt-auto border-t border-borda px-5 py-4 text-sm">
          <p className="font-semibold">{u.nome}</p>
          <p className="text-suave">{ROTULO_PAPEL[u.papel]}</p>
          <form action="/adm/sair" method="post" className="mt-2">
            <button type="submit" className="min-h-11 text-suave underline">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
