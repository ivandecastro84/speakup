import type { Metadata } from "next";
import { sortearPartida } from "@/lib/memoria/jogo";
import { JogoMemoria } from "./jogo";

export const metadata: Metadata = { title: "Memory Game" };
// Sorteio novo a cada visita (sem isso o Next geraria a página uma vez só, no build).
export const dynamic = "force-dynamic";

export default function PaginaMemoryGame() {
  // A primeira partida é sorteada no servidor (evita diferença entre servidor e navegador);
  // as próximas, pelo botão "Novo Jogo", no navegador.
  const { pares, ordem } = sortearPartida();
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-padrao bg-linear-to-br from-fuchsia-500 via-violet-500 to-sky-500 p-5 text-white shadow-lg">
        <h1 className="text-2xl font-bold">Memory Game</h1>
        <p className="mt-1 text-white/90">
          Vire as cartas e encontre cada palavra em inglês com a sua tradução em português. Acerto vale +10; erro, −2.
        </p>
      </div>
      <JogoMemoria pares={pares} ordem={ordem} />
    </div>
  );
}
