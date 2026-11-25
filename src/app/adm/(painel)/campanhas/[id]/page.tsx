import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cabecalho, Cartao } from "@/components/ui";
import { RpcError } from "@/lib/server/rpc";
import { chamarAdm, exigirPermissaoPagina } from "../../dados";
import { type DadosCampanha, FormCampanha } from "../form";

export const metadata: Metadata = { title: "Editar campanha" };

export default async function EditarCampanha({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissaoPagina("CAMPANHAS_GERENCIAR");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let c: DadosCampanha & { id: string };
  try {
    c = await chamarAdm("adm_campanha_obter", { p_id: id });
  } catch (e) {
    if (e instanceof RpcError && e.status === 404) notFound();
    throw e;
  }
  return (
    <>
      <p className="mb-4"><Link href="/adm/campanhas" className="inline-flex min-h-11 items-center underline">← Campanhas de Retenção</Link></p>
      <Cabecalho titulo={`Editar: ${c.nome}`} />
      <Cartao className="max-w-3xl"><FormCampanha id={id} inicial={c} /></Cartao>
    </>
  );
}
