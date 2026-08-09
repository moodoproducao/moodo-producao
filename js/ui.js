/* ============================================================
   MOODO PRODUÇÃO — helpers de UI (componentes em string/HTML)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;

  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  // ---------- ícones lineares (SVG inline, sem emoji) ----------
  const ICONS = {
    home:            `<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>`,
    kanban:          `<rect x="4" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="10" rx="1"/><rect x="16" y="4" width="4" height="13" rx="1"/>`,
    building:        `<rect x="5" y="3" width="10" height="18" rx="1"/><path d="M9 7h2M9 11h2M9 15h2"/><path d="M15 21v-6h4v6"/>`,
    alert:           `<path d="M12 3l10 18H2z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>`,
    "check-circle":  `<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>`,
    list:            `<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>`,
    package:         `<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/>`,
    wrench:          `<circle cx="7" cy="17" r="3"/><circle cx="17" cy="7" r="3"/><path d="M9.5 14.5L14.5 9.5"/>`,
    "bar-chart":     `<path d="M5 20V10M12 20V4M19 20v-7"/>`,
    trophy:          `<path d="M8 21h8M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/>`,
    calendar:        `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
    tv:              `<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>`,
    user:            `<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/>`,
    users:           `<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.5 3-5.3 6.5-5.3s6.5 1.8 6.5 5.3"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15 14.5c2.7.3 5 2 5 5.5"/>`,
    settings:        `<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1L5.6 5.6"/>`,
    shield:          `<path d="M12 3l7 3v6c0 5-3.2 8-7 9-3.8-1-7-4-7-9V6l7-3z"/>`,
    lifebuoy:        `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M6.5 6.5l3 3M17.5 6.5l-3 3M6.5 17.5l3-3M17.5 17.5l-3-3"/>`,
    lock:            `<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>`,
    play:            `<path d="M7 5l12 7-12 7V5z"/>`,
    pause:           `<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>`,
    check:           `<path d="M4 12l5 5L20 6"/>`,
    camera:          `<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="14" r="3.5"/>`,
    clock:           `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`,
    "chevron-left":  `<path d="M15 5l-7 7 7 7"/>`,
    "chevron-right": `<path d="M9 5l7 7-7 7"/>`,
    "chevron-up":    `<path d="M5 15l7-7 7 7"/>`,
    "chevron-down":  `<path d="M5 9l7 7 7-7"/>`,
    x:               `<path d="M6 6l12 12M18 6L6 18"/>`,
    plus:            `<path d="M12 5v14M5 12h14"/>`,
    filter:          `<path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/>`,
    search:          `<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-5-5"/>`,
    phone:           `<path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z"/>`,
    bell:            `<path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3V9z"/><path d="M10 19a2 2 0 0 0 4 0"/>`,
    wifi:            `<path d="M3 9a15 15 0 0 1 18 0M6.5 12.5a10 10 0 0 1 11 0M10 16a5 5 0 0 1 4 0"/><circle cx="12" cy="19.3" r="1" fill="currentColor" stroke="none"/>`,
    "wifi-off":      `<path d="M3 3l18 18"/><path d="M6.5 12.5a10 10 0 0 1 4-2.3M10 16a5 5 0 0 1 4 0M3 9a15 15 0 0 1 6.5-3.4M20.9 9A15 15 0 0 0 17 6.8"/><circle cx="12" cy="19.3" r="1" fill="currentColor" stroke="none"/>`,
    star:            `<path d="M12 3l2.6 5.8 6.2.6-4.7 4.2 1.4 6.2L12 16.9 6.5 19.8l1.4-6.2-4.7-4.2 6.2-.6L12 3z"/>`,
    download:        `<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/>`,
    refresh:         `<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 6v5h-5"/>`,
    grip:            `<circle cx="8" cy="6" r="1" fill="currentColor"/><circle cx="8" cy="12" r="1" fill="currentColor"/><circle cx="8" cy="18" r="1" fill="currentColor"/><circle cx="14" cy="6" r="1" fill="currentColor"/><circle cx="14" cy="12" r="1" fill="currentColor"/><circle cx="14" cy="18" r="1" fill="currentColor"/>`,
    truck:           `<rect x="2" y="8" width="12" height="9" rx="1"/><path d="M14 11h4l3 3v3h-7z"/><circle cx="6.5" cy="18.5" r="1.6"/><circle cx="17" cy="18.5" r="1.6"/>`,
    edit:            `<path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/>`,
    trash:           `<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>`,
    "arrow-up-right":`<path d="M7 17L17 7M9 7h8v8"/>`,
    circle:          `<circle cx="12" cy="12" r="8"/>`,
    link:            `<path d="M9 15l6-6"/><path d="M8 16l-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0"/><path d="M16 8l2-2a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0"/>`,
    "file-text":     `<path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h6M9 8.5h2"/>`,
    upload:          `<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 19h14"/>`,
    "map-pin":       `<path d="M12 21s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>`,
    image:           `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5.5-5.5L4 21"/>`,
  };
  function icon(name, size){
    const s = size||16;
    const p = ICONS[name] || ICONS.circle;
    return `<span class="ico-svg" style="width:${s}px;height:${s}px;color:inherit;"><svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg></span>`;
  }

  function initials(nome){ return (nome||"?").split(" ").filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase(); }

  function avatar(nome, size){
    const cls = size==="sm" ? "avatar sm" : size==="lg" ? "avatar lg" : "avatar";
    return `<span class="${cls}" title="${esc(nome)}">${initials(nome)}</span>`;
  }
  function person(nome){ return `<span class="person">${avatar(nome,"sm")} ${esc(nome)}</span>`; }

  function riscoChip(nivel){
    const map = {BAIXO:["good","Risco baixo"], MEDIO:["warning","Risco médio"], ALTO:["critical","Risco alto"]};
    const [cls,label] = map[nivel]||["neutral",nivel];
    return `<span class="chip ${cls}"><span class="dot ${cls}"></span>${label}</span>`;
  }
  function statusPendenciaChip(status){
    const map = {ABERTA:["critical","Aberta"], EM_COBRANCA:["warning","Em cobrança"], RESOLVIDA:["good","Resolvida"]};
    const [cls,label] = map[status]||["neutral",status];
    return `<span class="chip ${cls}">${label}</span>`;
  }
  function prioridadeChip(p){
    const map = {ALTA:["critical","Alta"], MEDIA:["warning","Média"], BAIXA:["neutral","Baixa"]};
    const [cls,label] = map[p]||["neutral",p];
    return `<span class="chip ${cls}">${label}</span>`;
  }
  function tarefaStatusChip(s){
    const map = {PLANEJADA:["neutral","Planejada"], EM_ANDAMENTO:["warning","Em andamento"], CONCLUIDA:["good","Concluída"]};
    const [cls,label] = map[s]||["neutral",s];
    return `<span class="chip ${cls}">${label}</span>`;
  }
  function resultadoChip(r){
    if(!r) return "";
    const map = {OK:["good","OK"], COM_RESSALVA:["warning","Com ressalva"], GEROU_REFACAO:["critical","Gerou retrabalho"]};
    const [cls,label] = map[r]||["neutral",r];
    return `<span class="chip ${cls}">${label}</span>`;
  }

  function progressBar(pct, tone){
    const cls = tone || (pct>=80?"good": pct>=40?"":"warning");
    return `<div class="progress"><div class="${cls}" style="width:${Math.max(0,Math.min(100,pct))}%"></div></div>`;
  }

  // ---------- componentes reutilizáveis (base para Dashboard e demais páginas) ----------
  function statTile(o){
    o = o||{};
    const val = o.critical ? `<div class="value critical">${o.value}</div>` : `<div class="value">${o.value}</div>`;
    return `<div class="stat-tile">
      <div class="label">${o.icon? icon(o.icon,13):""}${esc(o.label)}</div>
      ${val}
      ${o.sub? `<div class="sub">${o.sub}</div>`:""}
    </div>`;
  }

  function card(o){
    o = o||{};
    return `<div class="card pad${o.cls? " "+o.cls:""}"${o.id? ` id="${o.id}"`:""}>
      ${o.title? `<div class="card-title">${o.icon? icon(o.icon,13):""}<span style="flex:1;">${esc(o.title)}</span>${o.right||""}</div>`:""}
      ${o.body||""}
    </div>`;
  }

  function progressRow(o){
    o = o||{};
    const pct = o.pct!=null ? o.pct : (o.total? Math.round(100*(o.done||0)/o.total) : 0);
    const tone = o.tone || "";
    const frac = (o.done!=null && o.total!=null) ? `<span class="pr-frac">${o.done} / ${o.total}</span>` : "";
    return `<div class="progress-row">
      <div class="pr-label">${esc(o.label)}</div>
      ${frac}
      <div class="progress thin"><div class="${tone}" style="width:${Math.max(0,Math.min(100,pct))}%"></div></div>
      <div class="pr-pct">${pct}%</div>
    </div>`;
  }

  function attentionItem(o){
    o = o||{};
    const tone = o.tone || "neutral";
    return `<div class="attention-item ${tone}">
      <div class="ai-tag">${esc(o.tag||"")}</div>
      <div class="ai-title">${esc(o.title||"")}</div>
      ${o.sub? `<div class="ai-sub">${esc(o.sub)}</div>`:""}
    </div>`;
  }

  function pageSearchInput(o){
    o = o||{};
    const id = o.id || ("qsearch"+Math.random().toString(36).slice(2,8));
    return `<div class="search-box">
      ${icon('search',15)}
      <input type="text" id="${id}" class="search-input" placeholder="${esc(o.placeholder||"Buscar...")}" autocomplete="off">
      <div class="search-results" id="${id}Results"></div>
    </div>`;
  }
  // liga um <input> de busca a uma lista de itens {label, sub, href} — usado em pageSearchInput
  function attachQuickSearch(inputId, items){
    const input = document.getElementById(inputId);
    const results = document.getElementById(inputId+"Results");
    if(!input || !results) return;
    function render(q){
      if(!q){ results.classList.remove("open"); results.innerHTML=""; return; }
      const norm = s=> (s||"").toLowerCase();
      const nq = norm(q);
      const matches = items.filter(it=> norm(it.label).includes(nq) || norm(it.sub).includes(nq)).slice(0,7);
      if(!matches.length){ results.innerHTML = `<div class="sr-empty">Nenhum resultado para "${esc(q)}"</div>`; results.classList.add("open"); return; }
      results.innerHTML = matches.map(it=>`<a class="sr-item" href="${it.href}">
        <div class="sr-label">${esc(it.label)}</div><div class="sr-sub">${esc(it.sub||"")}</div>
      </a>`).join("");
      results.classList.add("open");
    }
    input.addEventListener("input", ()=> render(input.value.trim()));
    input.addEventListener("focus", ()=> { if(input.value.trim()) render(input.value.trim()); });
    document.addEventListener("click", (e)=>{ if(!results.contains(e.target) && e.target!==input){ results.classList.remove("open"); } });
    results.addEventListener("click", ()=> { results.classList.remove("open"); input.value=""; });
  }

  function stageDaysChip(dias){
    const cls = dias>=6 ? "critical" : dias>=3 ? "warning" : "neutral";
    return `<span class="chip ${cls}">${dias}d na etapa</span>`;
  }

  // ---------- fotos (formulários de pendência/tarefa/assistência) ----------
  // Sem limite de quantidade — anexa quantas fotos forem necessárias, uma de
  // cada vez (tira e confirma, tira mais e confirma...) ou várias de uma vez.
  function fotoFieldHtml(name){
    return `<div class="field"><label>${icon('camera',13)} Fotos (opcional — quantas forem necessárias)</label>
      <input type="file" name="${name}" accept="image/*" capture="environment" multiple></div>`;
  }
  function fotosGaleriaHtml(fotos){
    if(!fotos || !fotos.length) return "";
    return `<div class="foto-galeria">${fotos.map(f=>`
      <a href="${f.url}" target="_blank" rel="noopener" class="foto-thumb" title="${esc(f.nome||'')}">
        <img src="${f.url}" alt="${esc(f.nome||'foto')}" loading="lazy">
      </a>`).join("")}</div>`;
  }

  // ---------- modal ----------
  function ensureOverlay(){
    let ov = document.getElementById("overlay");
    if(!ov){
      ov = document.createElement("div"); ov.id="overlay"; ov.className="overlay";
      ov.innerHTML = `<div class="modal" id="modalRoot"></div>`;
      document.body.appendChild(ov);
      ov.addEventListener("click", (e)=>{ if(e.target===ov) UI.closeModal(); });
    }
    return ov;
  }
  function assistenciaStatusChip(s){
    const map = {ABERTA:["critical","Aberta"], EM_TRIAGEM:["warning","Em triagem"], AGENDADA:["brand","Agendada"],
      EM_EXECUCAO:["warning","Em execução"], AGUARDANDO_MATERIAL:["warning","Aguard. material"],
      AGUARDANDO_CLIENTE:["neutral","Aguard. cliente"], CONCLUIDA:["good","Concluída"]};
    const [cls,label] = map[s]||["neutral",s];
    return `<span class="chip ${cls}">${label}</span>`;
  }
  function perfilChip(key){
    const p = M.perfilDef ? M.perfilDef(key) : null;
    return `<span class="chip brand">${esc(p?p.label:key)}</span>`;
  }
  // item 10: mascara um valor financeiro já formatado quando o perfil atual
  // não tem "verValores" — usar em todo lugar que hoje mostra R$ de obra/
  // ambiente/móvel fora das telas já bloqueadas inteiras (Indicadores/Config).
  function valorOuOculto(valorFormatadoHtml){
    return (M.Store && M.Store.pode("verValores")) ? valorFormatadoHtml
      : `<span class="small muted" title="Seu perfil não vê valores financeiros">•••••</span>`;
  }

  const UI = {
    esc, initials, avatar, person, riscoChip, statusPendenciaChip, prioridadeChip,
    tarefaStatusChip, resultadoChip, progressBar, stageDaysChip, icon, ICONS,
    assistenciaStatusChip, perfilChip, valorOuOculto,
    statTile, card, progressRow, attentionItem, pageSearchInput, attachQuickSearch,
    fotoFieldHtml, fotosGaleriaHtml,

    openModal(html, opts){
      opts = opts||{};
      const ov = ensureOverlay();
      const root = document.getElementById("modalRoot");
      root.className = "modal" + (opts.wide? " wide":"");
      root.innerHTML = html;
      ov.classList.add("open");
      ov.scrollTop = 0;
      root.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", UI.closeModal));
    },
    closeModal(){
      const ov = document.getElementById("overlay");
      if(ov) ov.classList.remove("open");
    },
    toast(msg){
      let wrap = document.getElementById("toastWrap");
      if(!wrap){ wrap=document.createElement("div"); wrap.id="toastWrap"; wrap.className="toast-wrap"; document.body.appendChild(wrap); }
      const t = document.createElement("div"); t.className="toast"; t.textContent = msg;
      wrap.appendChild(t);
      setTimeout(()=>{ t.remove(); }, 2600);
    },
    confirm(msg, onYes){
      UI.openModal(`
        <div class="modal-head"><h2>Confirmar</h2><button class="modal-close" data-close>✕</button></div>
        <div class="modal-body"><p>${esc(msg)}</p></div>
        <div class="modal-foot"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="confirmYes">Confirmar</button></div>
      `);
      document.getElementById("confirmYes").addEventListener("click", ()=>{ UI.closeModal(); onYes(); });
    },
  };

  M.UI = UI;
  window.UI = UI; // alias global — usado em handlers inline (onclick="UI....")
})();
