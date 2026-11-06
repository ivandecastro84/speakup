import type { Metadata } from "next";
import { Marca } from "@/components/ui";
import { TentarDeNovo } from "./tentar";

export const metadata: Metadata = { title: "Sem conexão" };
export const dynamic = "force-static";

/** Tela offline do PWA (H.5): servida pelo service worker quando não há rede. */
export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 text-center">
      <Marca />
      <h1 className="text-2xl font-bold">Você está sem conexão</h1>
      <p className="text-suave">
        O portal precisa de internet para mostrar suas aulas e agendar reposições, porque os horários mudam a todo momento. Assim
        que a conexão voltar, é só tentar de novo.
      </p>
      <TentarDeNovo />
    </main>
  );
}
