import type { Metadata } from "next";
import Link from "next/link";
import { Cabecalho, Cartao } from "@/components/ui";
import { exigirPermissaoPagina } from "../../dados";
import { FormCampanha } from "../form";

export const metadata: Metadata = { title: "Nova campanha" };

export default async function NovaCampanha() {
  await exigirPermissaoPagina("CAMPANHAS_GERENCIAR");
  return (
    <>
      <p className="mb-4"><Link href="/adm/campanhas" className="inline-flex min-h-11 items-center underline">← Campanhas de Retenção</Link></p>
      <Cabecalho titulo="Nova campanha" />
      <Cartao className="max-w-3xl"><FormCampanha id={null} /></Cartao>
    </>
  );
}
