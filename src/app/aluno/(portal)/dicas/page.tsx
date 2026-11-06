import type { Metadata } from "next";
import { Dicas } from "./dicas";

export const metadata: Metadata = { title: "Dicas para melhorar o inglês" };

export default function PaginaDicas() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Dicas para melhorar o inglês</h1>
        <p className="text-suave">Sugestões práticas para treinar no dia a dia, com exemplos e tradução.</p>
      </div>
      <Dicas />
    </div>
  );
}
