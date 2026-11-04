"use client";

import { useEffect, useState } from "react";

export type Tema = "dark" | "light";
const CHAVE = "speakup-tema";

/**
 * Script inline executado antes da pintura: aplica o tema salvo no
 * navegador e evita o "flash" do tema errado. Padrão: escuro.
 */
export const scriptTema = `try{var t=localStorage.getItem("${CHAVE}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** Botão que alterna entre o tema escuro (padrão) e o claro, lembrando a escolha. */
export function AlternarTema({ className }: { className?: string }) {
  const [tema, setTema] = useState<Tema>("dark");

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function alternar() {
    const novo: Tema = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {}
    setTema(novo);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={tema === "light"}
      className={className ?? "min-h-11 px-2 text-sm text-suave underline"}
    >
      {tema === "dark" ? "Tema claro" : "Tema escuro"}
    </button>
  );
}
