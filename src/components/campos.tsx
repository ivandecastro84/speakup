import type { ComponentProps, ReactNode } from "react";
import { cx } from "./ui";

/* Campos de formulário reutilizáveis (server-safe, sem estado). */

export const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const DIAS_LONGOS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const HORAS = [8, 10, 12, 14, 16, 18, 20] as const;

export function rotuloHorario(dia: number, hora: number) {
  return `${DIAS[dia - 1]} ${String(hora).padStart(2, "0")}h`;
}

export function Selecao({
  id,
  rotulo,
  erro,
  opcoes,
  vazio,
  className,
  ...props
}: ComponentProps<"select"> & {
  id: string;
  rotulo: string;
  erro?: string;
  opcoes: (string | { valor: string; rotulo: string })[];
  vazio?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <select
        // Remonta quando o valor inicial muda: o reset do formulário após a
        // server action volta ao valor reapresentado, e não ao da 1ª renderização.
        key={props.value === undefined ? String(props.defaultValue ?? "") : undefined}
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={cx(
          "min-h-11 rounded-padrao border bg-superficie px-3 text-base text-texto",
          erro ? "border-erro" : "border-borda-campo",
          className,
        )}
        {...props}
      >
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map((o) => {
          const { valor, rotulo: r } = typeof o === "string" ? { valor: o, rotulo: o } : o;
          return (
            <option key={valor} value={valor}>
              {r}
            </option>
          );
        })}
      </select>
      {erro && (
        <p id={`${id}-erro`} className="text-sm text-erro">
          {erro}
        </p>
      )}
    </div>
  );
}

export function Marcacoes({
  legenda,
  nome,
  opcoes,
  marcadas,
  ajuda,
  erro,
}: {
  legenda: string;
  nome: string;
  opcoes: string[];
  marcadas: string[];
  ajuda?: string;
  erro?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legenda}</legend>
      {opcoes.length === 0 ? (
        <p className="text-sm text-suave">Nenhuma opção disponível.</p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {opcoes.map((o) => (
            <label key={o} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                key={`${o}-${marcadas.includes(o)}`}
                type="checkbox"
                name={nome}
                value={o}
                defaultChecked={marcadas.includes(o)}
                className="size-5"
              />
              {o}
            </label>
          ))}
        </div>
      )}
      {ajuda && <p className="text-sm text-suave">{ajuda}</p>}
      {erro && <p className="text-sm text-erro">{erro}</p>}
    </fieldset>
  );
}

export function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-padrao border border-borda p-4">
      <legend className="px-1 text-sm font-semibold text-suave">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function Etiqueta({ tom = "neutro", children }: { tom?: "neutro" | "sucesso" | "erro" | "aviso" | "info"; children: ReactNode }) {
  const cores = {
    neutro: "bg-destaque-suave text-texto",
    sucesso: "bg-sucesso-suave text-sucesso",
    erro: "bg-erro-suave text-erro",
    aviso: "bg-aviso-suave text-aviso",
    info: "bg-info-suave text-info",
  };
  return <span className={cx("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", cores[tom])}>{children}</span>;
}

/** Lê os horários enviados pela GradeHorarios ("dia-hora"). */
export function lerHorarios(dados: FormData, nome: string): { dia: number; hora: number }[] {
  return dados
    .getAll(nome)
    .map(String)
    .map((v) => v.split("-").map(Number))
    .filter(([d, h]) => d >= 1 && d <= 6 && (HORAS as readonly number[]).includes(h))
    .map(([dia, hora]) => ({ dia, hora }));
}

/** Lista separada por vírgula → itens limpos e sem repetição. */
export function lerLista(texto: string): string[] {
  return [...new Set(texto.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))];
}

export const TOM_STATUS: Record<string, "sucesso" | "aviso" | "erro" | "info"> = {
  Ativa: "sucesso",
  Trancada: "aviso",
  Cancelada: "erro",
  Concluída: "info",
};
