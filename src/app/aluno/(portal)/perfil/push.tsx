"use client";

import { useEffect, useState } from "react";
import { removerInscricaoPush, salvarInscricaoPush } from "./push-actions";

type Estado = "carregando" | "sem-suporte" | "indisponivel" | "bloqueado" | "inativo" | "ativo";

function chaveParaBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

const TEXTO: Record<Estado, string> = {
  carregando: "Verificando…",
  "sem-suporte": "Este navegador não aceita avisos. No iPhone, adicione o app à Tela de Início e abra por lá.",
  indisponivel: "Os avisos ainda não foram habilitados pela escola.",
  bloqueado: "Os avisos estão bloqueados nas configurações do navegador para este site.",
  inativo: "Avisos desativados neste aparelho.",
  ativo: "Avisos ativados neste aparelho.",
};

export function AtivarPush({ chavePublica }: { chavePublica: string | null }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEstado("sem-suporte");
      if (!chavePublica) return setEstado("indisponivel");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub ? "ativo" : "inativo");
    })().catch(() => setEstado("sem-suporte"));
  }, [chavePublica]);

  async function ativar() {
    setErro(null);
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") return setEstado(permissao === "denied" ? "bloqueado" : "inativo");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica!) });
      const j = sub.toJSON();
      const e = await salvarInscricaoPush({ endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth });
      if (e) {
        await sub.unsubscribe();
        setErro(e);
      } else setEstado("ativo");
    } catch {
      setErro("Não foi possível ativar os avisos neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setErro(null);
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removerInscricaoPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inativo");
    } finally {
      setOcupado(false);
    }
  }

  const podeAlternar = estado === "ativo" || estado === "inativo";
  return (
    <div className="flex flex-col gap-3">
      <p role="status" aria-live="polite" className="text-sm">
        {TEXTO[estado]}
      </p>
      {podeAlternar && (
        <button
          type="button"
          disabled={ocupado}
          onClick={estado === "ativo" ? desativar : ativar}
          className={
            estado === "ativo"
              ? "min-h-11 rounded-padrao border border-borda px-4 text-sm font-semibold disabled:opacity-60"
              : "min-h-11 rounded-padrao bg-destaque px-4 text-sm font-semibold text-destaque-texto disabled:opacity-60"
          }
        >
          {ocupado ? "Aguarde…" : estado === "ativo" ? "Desativar avisos" : "Ativar avisos"}
        </button>
      )}
      {erro && (
        <p role="alert" className="text-sm text-erro">
          {erro}
        </p>
      )}
    </div>
  );
}
