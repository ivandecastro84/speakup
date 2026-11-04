"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alerta, Botao, cx } from "@/components/ui";

interface Lote {
  id: string;
  status: "PROCESSANDO" | "CONCLUIDA" | "REJEITADA" | "FALHOU";
  arquivo_nome: string;
  total_linhas: number;
  processadas: number;
  inseridos: number;
  atualizados: number;
  rejeitados: number;
  avisos: number;
  mensagem: string | null;
}

type Fase =
  | { tipo: "selecionar"; erro?: string }
  | { tipo: "enviando"; arquivo: string; pct: number }
  | { tipo: "processando"; lote: Lote }
  | { tipo: "resumo"; lote: Lote };

const EXTENSOES = [".xlsx", ".csv"];

export function ImportarAlunos({ limiteMb, colunas }: { limiteMb: number; colunas: readonly string[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [fase, setFase] = useState<Fase>({ tipo: "selecionar" });
  const [arrastando, setArrastando] = useState(false);

  const abrir = () => {
    setFase({ tipo: "selecionar" });
    dialogo.current?.showModal();
  };
  const ocupado = fase.tipo === "enviando" || fase.tipo === "processando";
  const fechar = () => {
    if (ocupado) return;
    dialogo.current?.close();
    router.refresh();
  };

  // Acompanha lotes processados em segundo plano.
  useEffect(() => {
    if (fase.tipo !== "processando") return;
    const id = fase.lote.id;
    const t = setInterval(async () => {
      const r = await fetch(`/api/adm/importacoes/${id}`, { cache: "no-store" });
      if (r.status === 401) return (window.location.href = "/adm/login?expirado=1");
      if (!r.ok) return;
      const lote: Lote = await r.json();
      setFase(lote.status === "PROCESSANDO" ? { tipo: "processando", lote } : { tipo: "resumo", lote });
    }, 1000);
    return () => clearInterval(t);
  }, [fase]);

  const enviar = useCallback(
    (arquivo: File) => {
      const nome = arquivo.name.toLowerCase();
      if (!EXTENSOES.some((e) => nome.endsWith(e))) {
        setFase({ tipo: "selecionar", erro: "Formato não suportado. Envie um arquivo .xlsx ou .csv." });
        return;
      }
      if (arquivo.size > limiteMb * 1024 * 1024) {
        setFase({ tipo: "selecionar", erro: `O arquivo tem mais de ${limiteMb} MB. Divida em arquivos menores.` });
        return;
      }
      if (arquivo.size === 0) {
        setFase({ tipo: "selecionar", erro: "O arquivo está vazio." });
        return;
      }

      const dados = new FormData();
      dados.append("arquivo", arquivo);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/adm/importacoes");
      xhr.responseType = "json";
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setFase({ tipo: "enviando", arquivo: arquivo.name, pct: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        if (xhr.status === 401) {
          window.location.href = "/adm/login?expirado=1";
          return;
        }
        const corpo = xhr.response as (Lote & { erro?: string }) | null;
        if (xhr.status !== 200 || !corpo || corpo.erro) {
          setFase({ tipo: "selecionar", erro: corpo?.erro ?? "Não foi possível enviar o arquivo. Tente novamente." });
          return;
        }
        setFase(corpo.status === "PROCESSANDO" ? { tipo: "processando", lote: corpo } : { tipo: "resumo", lote: corpo });
      };
      xhr.onerror = () => setFase({ tipo: "selecionar", erro: "Falha de conexão durante o envio. Tente novamente." });
      setFase({ tipo: "enviando", arquivo: arquivo.name, pct: 0 });
      xhr.send(dados);
    },
    [limiteMb],
  );

  return (
    <>
      <Botao onClick={abrir}>Importar alunos</Botao>
      <dialog
        ref={dialogo}
        aria-labelledby="titulo-importar"
        onCancel={(e) => {
          e.preventDefault();
          fechar();
        }}
        className="m-auto w-[min(640px,calc(100vw-32px))] rounded-padrao border border-borda bg-superficie p-0 text-texto backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between border-b border-borda px-6 py-4">
          <h2 id="titulo-importar" className="text-lg font-semibold">
            Importar alunos
          </h2>
          <button
            type="button"
            onClick={fechar}
            disabled={ocupado}
            className="min-h-11 min-w-11 rounded-padrao text-suave hover:bg-fundo disabled:opacity-40"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          {fase.tipo === "selecionar" && (
            <>
              {fase.erro && <Alerta tipo="erro">{fase.erro}</Alerta>}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  const f = e.dataTransfer.files[0];
                  if (f) enviar(f);
                }}
                className={cx(
                  "flex flex-col items-center gap-3 rounded-padrao border-2 border-dashed px-6 py-10 text-center",
                  arrastando ? "border-destaque bg-destaque-suave" : "border-borda",
                )}
              >
                <p className="font-semibold">Arraste a planilha para cá</p>
                <p className="text-sm text-suave">ou</p>
                <Botao type="button" variante="secundario" onClick={() => entrada.current?.click()}>
                  Escolher arquivo
                </Botao>
                <input
                  ref={entrada}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="sr-only"
                  aria-label="Arquivo da planilha"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) enviar(f);
                  }}
                />
                <p className="text-sm text-suave">.xlsx ou .csv · até {limiteMb} MB</p>
              </div>
              <details className="text-sm">
                <summary className="min-h-11 cursor-pointer content-center font-medium">
                  Layout obrigatório (19 colunas, nesta ordem)
                </summary>
                <ol className="mt-2 grid list-decimal grid-cols-2 gap-x-6 gap-y-1 pl-6 text-suave sm:grid-cols-3">
                  {colunas.map((c) => (
                    <li key={c}>
                      <code>{c}</code>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-suave">
                  Obrigatórios: id_aluno, nome, email, unidade e status_matricula. Datas no formato AAAA-MM-DD. Um
                  id_aluno já existente atualiza o cadastro.
                </p>
              </details>
            </>
          )}

          {fase.tipo === "enviando" && (
            <Progresso
              rotulo={fase.pct < 100 ? `Enviando ${fase.arquivo}…` : `Validando e gravando ${fase.arquivo}…`}
              valor={fase.pct}
              max={100}
              detalhe={fase.pct < 100 ? `${fase.pct}% enviado` : "Arquivo recebido. Conferindo as 19 colunas e gravando as linhas…"}
            />
          )}

          {fase.tipo === "processando" && (
            <Progresso
              rotulo={`Processando ${fase.lote.arquivo_nome}…`}
              valor={fase.lote.processadas}
              max={Math.max(fase.lote.total_linhas, 1)}
              detalhe={`${fase.lote.processadas.toLocaleString("pt-BR")} de ${fase.lote.total_linhas.toLocaleString("pt-BR")} linhas`}
            />
          )}

          {fase.tipo === "resumo" && <Resumo lote={fase.lote} />}
        </div>

        {fase.tipo === "resumo" && (
          <div className="flex flex-wrap justify-end gap-3 border-t border-borda px-6 py-4">
            {(fase.lote.rejeitados > 0 || fase.lote.avisos > 0 || fase.lote.status === "REJEITADA") && (
              <a
                href={`/api/adm/importacoes/${fase.lote.id}/log`}
                className="inline-flex min-h-11 items-center rounded-padrao border border-borda px-4 text-sm font-semibold hover:bg-fundo"
              >
                Baixar log de erros (.csv)
              </a>
            )}
            <Botao variante="secundario" onClick={() => setFase({ tipo: "selecionar" })}>
              Importar outro arquivo
            </Botao>
            <Botao onClick={fechar}>Concluir</Botao>
          </div>
        )}
      </dialog>
    </>
  );
}

function Progresso({ rotulo, valor, max, detalhe }: { rotulo: string; valor: number; max: number; detalhe: string }) {
  return (
    <div className="flex flex-col gap-2 py-6">
      <label htmlFor="progresso-importacao" className="font-medium">
        {rotulo}
      </label>
      <progress id="progresso-importacao" value={valor} max={max} className="h-3 w-full accent-[var(--cor-destaque)]" />
      <p aria-live="polite" className="text-sm text-suave">
        {detalhe}
      </p>
      <p className="text-sm text-suave">Não feche esta janela até terminar.</p>
    </div>
  );
}

function Resumo({ lote }: { lote: Lote }) {
  const titulo =
    lote.status === "CONCLUIDA"
      ? "Importação concluída"
      : lote.status === "REJEITADA"
        ? "Arquivo rejeitado"
        : "Importação não concluída";
  return (
    <div aria-live="polite" className="flex flex-col gap-4">
      <div>
        <p className="text-lg font-semibold">{titulo}</p>
        <p className="text-sm text-suave">
          {lote.arquivo_nome} · {lote.total_linhas.toLocaleString("pt-BR")} linha(s) no arquivo
        </p>
      </div>
      {lote.status === "REJEITADA" && (
        <Alerta tipo="erro">
          O arquivo não segue o layout de 19 colunas e nada foi gravado. Baixe o log para ver o que corrigir.
        </Alerta>
      )}
      {lote.status === "FALHOU" && <Alerta tipo="erro">{lote.mensagem ?? "A importação falhou."}</Alerta>}
      {lote.status !== "REJEITADA" && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Total rotulo="Inseridos" valor={lote.inseridos} cor="bg-sucesso-suave text-sucesso" />
          <Total rotulo="Atualizados" valor={lote.atualizados} cor="bg-info-suave text-info" />
          <Total rotulo="Rejeitados" valor={lote.rejeitados} cor="bg-erro-suave text-erro" />
          <Total rotulo="Com aviso" valor={lote.avisos} cor="bg-aviso-suave text-aviso" />
        </dl>
      )}
      {lote.status === "CONCLUIDA" && lote.rejeitados > 0 && (
        <p className="text-sm text-suave">
          As linhas válidas foram gravadas. Corrija as rejeitadas usando o log e importe-as novamente.
        </p>
      )}
    </div>
  );
}

function Total({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className={cx("rounded-padrao px-4 py-3", cor)}>
      <dt className="text-sm font-medium">{rotulo}</dt>
      <dd className="text-2xl font-bold tabular-nums">{valor.toLocaleString("pt-BR")}</dd>
    </div>
  );
}
