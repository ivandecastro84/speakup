"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alerta, Botao } from "./ui";

export interface EstadoForm {
  erro?: string;
  sucesso?: string;
  /** incrementado a cada sucesso para permitir reset do formulário */
  versao?: number;
  /** valores a reapresentar após erro (React reseta o form após a action) */
  valores?: Record<string, string>;
}

type Acao = (anterior: EstadoForm, dados: FormData) => Promise<EstadoForm>;

function BotaoEnviar({ children, pendente }: { children: ReactNode; pendente: string }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendente : children}
    </Botao>
  );
}

/**
 * Formulário com server action, mensagens acessíveis (aria-live) e botão
 * com estado de envio. Reseta os campos após sucesso.
 */
export function Formulario({
  acao,
  children,
  textoBotao,
  textoPendente = "Enviando…",
  className,
}: {
  acao: Acao;
  children: ReactNode | ((estado: EstadoForm) => ReactNode);
  textoBotao: string;
  textoPendente?: string;
  className?: string;
}) {
  const [estado, executar] = useActionState(acao, {});
  return (
    <form key={estado.versao ?? 0} action={executar} className={className ?? "flex flex-col gap-4"} noValidate>
      <div aria-live="polite">
        {estado.erro && <Alerta tipo="erro">{estado.erro}</Alerta>}
        {estado.sucesso && <Alerta tipo="sucesso">{estado.sucesso}</Alerta>}
      </div>
      {typeof children === "function" ? children(estado) : children}
      <BotaoEnviar pendente={textoPendente}>{textoBotao}</BotaoEnviar>
    </form>
  );
}
