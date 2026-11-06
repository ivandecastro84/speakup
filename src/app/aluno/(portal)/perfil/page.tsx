import type { Metadata } from "next";
import { Cartao } from "@/components/ui";
import { chavePublicaVapid } from "@/lib/integracoes/adaptadores";
import { AtivarPush } from "./push";
import { FormAlterarSenhaAluno } from "../../forms";
import { alunoAtual, type Aluno } from "../dados";

export const metadata: Metadata = { title: "Perfil" };

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function data(v: string | null) {
  if (!v) return null;
  const [a, m, d] = v.split("-");
  return `${d}/${m}/${a}`;
}

export default async function Perfil() {
  const a = await alunoAtual();
  const campos: [string, string | number | null][] = [
    ["Matrícula", a.id_aluno],
    ["Nome", a.nome],
    ["E-mail", a.email],
    ["Data de nascimento", data(a.data_nascimento)],
    ["Idade", a.idade],
    ["Gênero", a.genero],
    ["Unidade", a.unidade],
    ["Cidade", a.cidade],
    ["Estado", a.estado],
    ["Canal de aquisição", a.canal_aquisicao],
    ["Nível do curso", a.nivel_curso],
    ["Modalidade", a.modalidade],
    ["Turno", a.turno],
    ["Plano", a.plano],
    ["Desconto", a.desconto_percentual != null ? `${Number(a.desconto_percentual)}%` : null],
    ["Data da matrícula", data(a.data_matricula)],
    ["Situação da matrícula", a.status_matricula],
    ["Data de cancelamento", data(a.data_cancelamento)],
    ["Valor da mensalidade", valor(a)],
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <Cartao aria-labelledby="titulo-dados">
        <h2 id="titulo-dados" className="text-lg font-semibold">
          Meus dados
        </h2>
        <p className="mt-1 text-sm text-suave">Para corrigir algum dado, procure a secretaria da sua unidade.</p>
        <dl className="mt-4 divide-y divide-borda text-sm">
          {campos.map(([rotulo, v]) => (
            <div key={rotulo} className="flex justify-between gap-4 py-2.5">
              <dt className="text-suave">{rotulo}</dt>
              <dd className="text-right font-medium">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </Cartao>
      <Cartao aria-labelledby="titulo-push">
        <h2 id="titulo-push" className="text-lg font-semibold">
          Avisos no celular
        </h2>
        <p className="mb-4 mt-1 text-sm text-suave">
          Receba um aviso quando uma reposição for confirmada ou cancelada. Os e-mails continuam chegando normalmente.
        </p>
        <AtivarPush chavePublica={chavePublicaVapid()} />
      </Cartao>
      <Cartao aria-labelledby="titulo-senha">
        <h2 id="titulo-senha" className="mb-4 text-lg font-semibold">
          Alterar senha
        </h2>
        <FormAlterarSenhaAluno />
      </Cartao>
    </div>
  );
}

function valor(a: Aluno) {
  const v = a["Valor Mensalidade"];
  return v != null ? moeda.format(Number(v)) : null;
}
