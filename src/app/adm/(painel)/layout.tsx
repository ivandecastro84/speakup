import Link from "next/link";
import { ROTULO_PAPEL, admAtual, type Permissao } from "./dados";
import { MenuLateral } from "./menu";
import { AlternarTema } from "@/components/tema";
import { Logo } from "@/components/ui";

const ITENS: { href: string; rotulo: string; permissao?: Permissao }[] = [
  { href: "/adm", rotulo: "Visão geral" },
  { href: "/adm/alunos", rotulo: "Alunos", permissao: "ALUNOS_LER" },
  { href: "/adm/turmas", rotulo: "Turmas", permissao: "GRADE_EDITAR" },
  { href: "/adm/professores", rotulo: "Professores", permissao: "GRADE_EDITAR" },
  { href: "/adm/salas", rotulo: "Salas", permissao: "GRADE_EDITAR" },
  { href: "/adm/reposicoes", rotulo: "Reposições", permissao: "GRADE_EDITAR" },
  { href: "/adm/empresas", rotulo: "Empresas", permissao: "EMPRESAS_GERENCIAR" },
  { href: "/adm/relatorios", rotulo: "Relatórios de RH", permissao: "RELATORIOS_LER" },
  { href: "/adm/importacoes", rotulo: "Importações", permissao: "ALUNOS_IMPORTAR" },
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
        <Link href="/adm" className="px-5 py-5" aria-label="Speak Up Idiomas — visão geral">
          <Logo largura={176} prioridade />
        </Link>
        <MenuLateral itens={itens} />
        <div className="mt-auto border-t border-borda px-5 py-4 text-sm">
          <p className="font-semibold">{u.nome}</p>
          <p className="text-suave">{ROTULO_PAPEL[u.papel]}</p>
          <div className="mt-2 flex items-center gap-3">
            <AlternarTema className="min-h-11 text-suave underline" />
            <form action="/adm/sair" method="post">
              <button type="submit" className="min-h-11 text-suave underline">
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
