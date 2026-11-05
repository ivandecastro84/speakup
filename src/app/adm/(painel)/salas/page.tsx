import type { Metadata } from "next";
import { Etiqueta } from "@/components/campos";
import { Cabecalho, Cartao, EstadoVazio } from "@/components/ui";
import { admAtual, chamarAdm, exigirPermissaoPagina } from "../dados";
import { FormSala } from "./forms";

export const metadata: Metadata = { title: "Salas" };

interface Sala {
  id: string;
  nome: string;
  unidade: string;
  capacidade: number;
  ativa: boolean;
  turmas_ativas: number;
}

export default async function Salas() {
  await exigirPermissaoPagina("GRADE_EDITAR");
  const u = await admAtual();
  const salas = await chamarAdm<Sala[]>("adm_listar_salas");

  return (
    <>
      <Cabecalho titulo="Salas" descricao="Salas físicas por unidade, usadas pelas turmas presenciais." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          {salas.length === 0 ? (
            <EstadoVazio titulo="Nenhuma sala cadastrada" descricao="Cadastre as salas para criar turmas presenciais." />
          ) : (
            salas.map((s) => (
              <Cartao key={s.id}>
                <details>
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-3">
                    <span className="font-semibold">{s.nome}</span>
                    <span className="text-sm text-suave">
                      {s.unidade} · {s.capacidade} lugares · {s.turmas_ativas} turma(s) ativa(s)
                    </span>
                    {!s.ativa && <Etiqueta>Inativa</Etiqueta>}
                    <span className="ml-auto text-sm underline">Editar</span>
                  </summary>
                  <div className="mt-4">
                    <FormSala sala={s} unidades={u.unidades} />
                  </div>
                </details>
              </Cartao>
            ))
          )}
        </div>
        <Cartao>
          <h2 className="mb-4 text-lg">Nova sala</h2>
          <FormSala sala={null} unidades={u.unidades} />
        </Cartao>
      </div>
    </>
  );
}
