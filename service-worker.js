/* ============================================================
   MOODO PRODUÇÃO — service worker (cache básico do shell / PWA)
   MVP: cache "app-shell" simples, cache-first com fallback de rede.
   Sincronização offline completa (fila de ações pendentes) é uma
   evolução futura — aqui o objetivo é permitir abrir o app e ver a
   última tela mesmo sem internet, e sinalizar quando há versão nova.
   ============================================================ */
const CACHE_NAME = "moodo-producao-v3.1.0";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/data.js",
  "./js/store.js",
  "./js/calc.js",
  "./js/ui.js",
  "./js/actions.js",
  "./js/router.js",
  "./js/main.js",
  "./js/pages/dashboard.js",
  "./js/pages/producao.js",
  "./js/pages/obras.js",
  "./js/pages/novaObra.js",
  "./js/pages/obraDetail.js",
  "./js/pages/tarefas.js",
  "./js/pages/pendencias.js",
  "./js/pages/paraFinalizar.js",
  "./js/pages/indicadores.js",
  "./js/pages/desempenho.js",
  "./js/pages/calendario.js",
  "./js/pages/lotes.js",
  "./js/pages/montagem.js",
  "./js/pages/chaoDeFabrica.js",
  "./js/pages/equipe.js",
  "./js/pages/configuracoes.js",
  "./js/pages/meuPainel.js",
  "./js/pages/assistencias.js",
  "./js/pages/auditoria.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=> cache.addAll(SHELL_FILES)).catch(()=>{ /* segue mesmo se algum arquivo falhar */ })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event)=>{
  event.waitUntil(
    caches.keys().then(keys=> Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event)=>{
  if(event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached=>{
      const network = fetch(event.request).then(resp=>{
        if(resp && resp.status===200){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache=> cache.put(event.request, clone));
        }
        return resp;
      }).catch(()=> cached);
      return cached || network;
    })
  );
});
