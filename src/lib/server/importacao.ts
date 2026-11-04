import "server-only";
import { createHash } from "node:crypto";
import { LIMITES, formatoDoArquivo } from "@/lib/importacao/colunas";
import { ArquivoIlegivel, lerPlanilha } from "@/lib/importacao/ler";
import { validarPlanilha, type Ocorrencia } from "@/lib/importacao/validar";
import { rpc } from "./rpc";

export interface Lote {
  id: string;
  status: "PROCESSANDO" | "CONCLUIDA" | "REJEITADA" | "FALHOU";
  arquivo_nome: string;
  atomica: boolean;
  total_linhas: number;
  processadas: number;
  inseridos: number;
  atualizados: number;
  rejeitados: number;
  avisos: number;
  mensagem: string | null;
  iniciado_em: string;
  concluido_em: string | null;
}

/** Erro de entrada detectado antes de criar o lote (não chega ao banco). */
export class ErroEntrada extends Error {
  constructor(
    public readonly codigo: "EXTENSAO_NAO_SUPORTADA" | "ARQUIVO_GRANDE" | "ARQUIVO_VAZIO",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface OpcoesImportacao {
  ip?: string | null;
  atomica?: boolean;
  /** Agenda trabalho para depois da resposta (ex.: `after` do Next). */
  agendar?: (tarefa: () => Promise<void>) => void;
}

function semDados(o: Ocorrencia) {
  return { linha: o.linha, coluna: o.coluna, motivo: o.motivo };
}

/**
 * Executa a importação: lê, valida, cria o lote e processa em pedaços.
 * Lotes acima do limite síncrono continuam em segundo plano (via `agendar`);
 * o cliente acompanha pelo status do lote.
 */
export async function importarArquivo(
  token: string,
  arquivo: { nome: string; bytes: Uint8Array },
  opcoes: OpcoesImportacao = {},
): Promise<Lote> {
  const formato = formatoDoArquivo(arquivo.nome);
  if (!formato) throw new ErroEntrada("EXTENSAO_NAO_SUPORTADA", "Envie um arquivo .xlsx ou .csv.");
  if (arquivo.bytes.byteLength === 0) throw new ErroEntrada("ARQUIVO_VAZIO", "O arquivo está vazio.");
  if (arquivo.bytes.byteLength > LIMITES.arquivoMb * 1024 * 1024) {
    throw new ErroEntrada("ARQUIVO_GRANDE", `O arquivo excede o limite de ${LIMITES.arquivoMb} MB.`);
  }

  const checksum = createHash("sha256").update(arquivo.bytes).digest("hex");
  const atomica = opcoes.atomica ?? process.env.IMPORT_ATOMIC === "true";

  let resultado: ReturnType<typeof validarPlanilha>;
  try {
    resultado = validarPlanilha(await lerPlanilha(arquivo.bytes, formato));
  } catch (e) {
    if (!(e instanceof ArquivoIlegivel)) throw e;
    resultado = { errosArquivo: [{ linha: null, coluna: null, motivo: e.message }], validas: [], erros: [], avisos: [], total: 0 };
  }

  const errosArquivo = [...resultado.errosArquivo];
  if (!errosArquivo.length && resultado.total === 0) {
    errosArquivo.push({ linha: null, coluna: null, motivo: "O arquivo não tem linhas de dados." });
  }
  if (!errosArquivo.length && resultado.total > LIMITES.linhas) {
    errosArquivo.push({
      linha: null,
      coluna: null,
      motivo: `O arquivo tem ${resultado.total} linhas; o limite é ${LIMITES.linhas} por importação.`,
    });
  }

  const inicio = await rpc<{ id: string; status: Lote["status"] }>("adm_importacao_iniciar", {
    p_token: token,
    p_arquivo_nome: arquivo.nome,
    p_checksum: checksum,
    p_formato: formato,
    p_total_linhas: resultado.total,
    p_atomica: atomica,
    p_erros_arquivo: errosArquivo.length ? errosArquivo.map(semDados) : null,
    p_ip: opcoes.ip ?? null,
  });

  if (inicio.status === "REJEITADA") return status(token, inicio.id);

  // Pedaços por número de linha do arquivo, preservando a ordem.
  const numeros = [...new Set([...resultado.validas.map((v) => v.linha), ...resultado.erros.map((e) => e.linha!)])].sort(
    (a, b) => a - b,
  );
  const tamanho = atomica ? Math.max(numeros.length, 1) : LIMITES.tamanhoPedaco;
  const pedacos: number[][] = [];
  for (let i = 0; i < numeros.length; i += tamanho) pedacos.push(numeros.slice(i, i + tamanho));

  const processar = async () => {
    try {
      for (const pedaco of pedacos) {
        const ini = pedaco[0];
        const fim = pedaco[pedaco.length - 1];
        const naFaixa = (l: number | null) => l !== null && l >= ini && l <= fim;
        // Listas vazias vão como null (o banco trata como "nenhum item").
        const ouNulo = <T,>(xs: T[]) => (xs.length ? xs : null);
        await rpc("adm_importacao_processar", {
          p_token: token,
          p_importacao_id: inicio.id,
          p_linhas: ouNulo(resultado.validas.filter((v) => naFaixa(v.linha))),
          p_erros: ouNulo(resultado.erros.filter((e) => naFaixa(e.linha))),
          p_avisos: ouNulo(resultado.avisos.filter((a) => naFaixa(a.linha))),
        });
      }
      await rpc("adm_importacao_finalizar", { p_token: token, p_importacao_id: inicio.id, p_ip: opcoes.ip ?? null });
    } catch (e) {
      await rpc("adm_importacao_falhar", {
        p_token: token,
        p_importacao_id: inicio.id,
        p_mensagem: "Falha inesperada no processamento. As linhas já gravadas foram mantidas.",
        p_ip: opcoes.ip ?? null,
      }).catch(() => {});
      throw e;
    }
  };

  if (opcoes.agendar && resultado.total > LIMITES.limiteSincrono) {
    opcoes.agendar(() => processar().catch((e) => console.error("[importacao]", inicio.id, e)));
    return status(token, inicio.id);
  }

  await processar();
  return status(token, inicio.id);
}

export function status(token: string, id: string) {
  return rpc<Lote>("adm_importacao_status", { p_token: token, p_importacao_id: id });
}
