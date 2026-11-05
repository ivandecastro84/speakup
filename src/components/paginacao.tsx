import Link from "next/link";

/** Paginação por links, preservando os filtros da URL. */
export function Paginacao({
  base,
  params,
  pagina,
  porPagina,
  total,
}: {
  base: string;
  params: Record<string, string | undefined>;
  pagina: number;
  porPagina: number;
  total: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  const link = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("pagina", String(p));
    return `${base}?${q}`;
  };
  return (
    <nav aria-label="Paginação" className="mt-4 flex items-center justify-between gap-4 text-sm">
      <p className="text-suave">
        Página {pagina} de {paginas} · {total.toLocaleString("pt-BR")} registro(s)
      </p>
      <div className="flex gap-2">
        {pagina > 1 ? (
          <Link href={link(pagina - 1)} className="inline-flex min-h-11 items-center rounded-padrao border border-borda-campo px-4">
            Anterior
          </Link>
        ) : null}
        {pagina < paginas ? (
          <Link href={link(pagina + 1)} className="inline-flex min-h-11 items-center rounded-padrao border border-borda-campo px-4">
            Próxima
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
