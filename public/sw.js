/* Service worker do Speak Up Idiomas (H.5 + F.9).
 * - Cache do "shell": arquivos estáticos versionados do Next (/_next/static),
 *   ícones, logotipos e a tela offline.
 * - Páginas (HTML) e APIs vão sempre à rede: são dados pessoais e mudam a todo
 *   momento, então NÃO ficam em cache. Sem rede, mostra a tela /offline.
 * - Web Push: exibe o aviso e abre o portal ao tocar.
 */
const VERSAO = "speakup-v1";
const SHELL = ["/offline", "/logo-speakup.webp", "/logo-speakup-negativo.webp", "/icones/192.png", "/icones/512.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }
  const estatico = url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname);
  if (estatico) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(VERSAO).then((c) => c.put(req, copia));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (e) => {
  let d = { titulo: "Speak Up Idiomas", corpo: "", url: "/aluno" };
  try {
    d = { ...d, ...e.data.json() };
  } catch {}
  e.waitUntil(
    self.registration.showNotification(d.titulo, {
      body: d.corpo,
      icon: "/icones/192.png",
      badge: "/icones/192.png",
      data: { url: d.url },
      lang: "pt-BR",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = (e.notification.data && e.notification.data.url) || "/aluno";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      for (const c of abertas) {
        if (new URL(c.url).pathname.startsWith("/aluno") && "focus" in c) {
          c.navigate(alvo);
          return c.focus();
        }
      }
      return self.clients.openWindow(alvo);
    }),
  );
});
