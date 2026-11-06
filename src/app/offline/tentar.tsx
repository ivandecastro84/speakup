"use client";

import { useEffect } from "react";

export function TentarDeNovo() {
  useEffect(() => {
    const voltar = () => location.reload();
    window.addEventListener("online", voltar);
    return () => window.removeEventListener("online", voltar);
  }, []);
  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className="min-h-11 rounded-padrao bg-destaque px-5 font-semibold text-destaque-texto"
    >
      Tentar de novo
    </button>
  );
}
