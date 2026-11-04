import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* Componentes base da interface. Estilos usam apenas os tokens de globals.css. */

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const botaoBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-padrao px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variantes = {
  primario: "bg-destaque text-destaque-texto hover:bg-destaque-hover",
  secundario: "border border-borda bg-superficie text-texto hover:bg-fundo",
  perigo: "bg-erro text-white hover:opacity-90",
} as const;

export function Botao({
  variante = "primario",
  className,
  ...props
}: ComponentProps<"button"> & { variante?: keyof typeof variantes }) {
  return <button className={cx(botaoBase, variantes[variante], className)} {...props} />;
}

export function BotaoLink({
  variante = "primario",
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: keyof typeof variantes }) {
  return <Link className={cx(botaoBase, variantes[variante], className)} {...props} />;
}

export function Campo({
  id,
  rotulo,
  erro,
  ajuda,
  className,
  ...props
}: ComponentProps<"input"> & { id: string; rotulo: string; erro?: string; ajuda?: string }) {
  const descricao = [erro ? `${id}-erro` : null, ajuda ? `${id}-ajuda` : null].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricao || undefined}
        className={cx(
          "min-h-11 rounded-padrao border bg-superficie px-3 text-base",
          erro ? "border-erro" : "border-borda",
          className,
        )}
        {...props}
      />
      {ajuda && (
        <p id={`${id}-ajuda`} className="text-sm text-suave">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} className="text-sm text-erro">
          {erro}
        </p>
      )}
    </div>
  );
}

const tiposAlerta = {
  erro: "border-erro bg-erro-suave text-erro",
  sucesso: "border-sucesso bg-sucesso-suave text-sucesso",
  info: "border-info bg-info-suave text-info",
  aviso: "border-aviso bg-aviso-suave text-aviso",
} as const;

export function Alerta({ tipo, children }: { tipo: keyof typeof tiposAlerta; children: ReactNode }) {
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={cx("rounded-padrao border-l-4 px-4 py-3 text-sm font-medium", tiposAlerta[tipo])}
    >
      {children}
    </div>
  );
}

export function Cartao({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cx("rounded-padrao border border-borda bg-superficie p-5", className)}
      {...props}
    />
  );
}

export function EstadoVazio({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="rounded-padrao border border-dashed border-borda bg-superficie px-6 py-10 text-center">
      <p className="font-semibold">{titulo}</p>
      {descricao && <p className="mt-1 text-sm text-suave">{descricao}</p>}
    </div>
  );
}

export function Cabecalho({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{titulo}</h1>
        {descricao && <p className="mt-1 text-suave">{descricao}</p>}
      </div>
      {acao}
    </header>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-10 text-suave">
      <span className="size-4 animate-spin rounded-full border-2 border-borda border-t-destaque" />
      {texto}
    </div>
  );
}
