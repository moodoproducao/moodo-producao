/* ============================================================
   PÁGINA: Agenda V2 (Fase 6)
   ============================================================
   "Quem precisa estar onde e quando?" — Agenda operacional única pra
   Montagem, Assistência, Retorno, Visita, Medição e Outro. Não é um
   calendário corporativo genérico (§1/§18): sem convite, sem participante
   por e-mail, sem integração externa — só compromisso de campo/operação já
   ligado a uma obra/cliente real deste app.

   PRINCÍPIO (§2/§13): a Agenda CONSOME informação dos módulos de origem, não
   duplica fonte de verdade. Só os 4 tipos sem módulo dono (RETORNO/VISITA/
   MEDICAO/OUTRO) viram registro PRÓPRIO (state.eventos, ver js/store.js
   Store.criarEvento/atualizarEvento/cancelarEvento). Os outros 2 tipos são
   computados AO VIVO, nunca gravados aqui:
     - MONTAGEM   ← obra.planejamentoMontagem (início previsto/fim previsto
                    calculado/equipe planejada) — os MESMOS campos que a
                    Montagem já grava via Store.setPlanejamentoMontagem
                    (Fase 5). Mudou o planejamento lá → a próxima leitura
                    daqui já reflete, sem nenhuma edição duplicada.
     - ASSISTENCIA ← state.assistencias (mesma leitura que o Calendário
                    legado já fazia: assistência não concluída com prazo
                    definido). Fonte de verdade continua 100% na Assistência
                    — Agenda só organiza/exibe. Integração mais profunda
                    (visita agendada como campo próprio etc.) é Fase 7 (§15),
                    não esta.
   "OBRA" existe no enum de origem (§4) mas fica RESERVADO/não populado
   nesta fase — não há hoje nenhum campo de obra (fora o planejamento de
   montagem, já coberto acima) que corresponda a um dos 6 tipos aprovados
   sem inventar tipo novo (ex.: data de entrega não é nenhum dos 6 tipos).
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function esc(s){ return UI.esc(s); }

  // ---------- datas (semana começa na segunda, sem lib nova) ----------
  function addDias(iso, n){
    const d = new Date(iso+"T00:00:00");
    d.setDate(d.getDate()+n);
    return d.toISOString().slice(0,10);
  }
  function segundaFeiraDe(iso){
    const d = new Date(iso+"T00:00:00");
    const dow = d.getDay(); // 0=domingo
    const diff = dow===0 ? -6 : 1-dow;
    d.setDate(d.getDate()+diff);
    return d.toISOString().slice(0,10);
  }

  // ---------- derivação (§13) — Montagem a partir do planejamento ----------
  // AJUSTE (Fase 6 — ajustes antes do push, §1): a fonte continua sendo
  // SÓ obra.planejamentoMontagem (inicioPrevisto/fimPrevistoCalculado/
  // equipePlanejada) — esta função devolve o "descritor base" do período
  // inteiro (data=início, dataFim=fim), ainda um objeto só, nada expandido
  // aqui. A expansão em ocorrências por dia (pra Montagem "ocupar" a Agenda
  // durante o período todo) é feita à parte, em ocorrenciasDeEventoBase —
  // ver o comentário lá pra entender a escolha da solução.
  function eventoMontagemDeObra(o){
    const pl = o.planejamentoMontagem;
    if(!pl || !pl.inicioPrevisto) return null; // sem planejamento definido = sem compromisso pra mostrar (nada inventado)
    const status = pl.fimReal ? "CONCLUIDO" : (pl.inicioReal ? "EM_ANDAMENTO" : "AGENDADO");
    const obsPartes = [];
    if(pl.observacoes) obsPartes.push(pl.observacoes);
    // AJUSTE (Fase 6 — verificação final de integração, antes do push):
    // fimPrevistoCalculado (Store.calcularFimPrevisto, Fase 5) é só uma
    // ESTIMATIVA de calendário — documentada como "nunca autoritativa"
    // desde a Fase 5 — e continua exibida aqui como texto informativo na
    // observação. Ela NÃO é mais usada pra decidir quantos dias a Montagem
    // ocupa na Agenda (ver ocorrenciasDeEventoBase, abaixo, pra entender
    // por quê): a fonte real da contagem passou a ser inicioPrevisto +
    // duracaoEstimadaValor + duracaoEstimadaUnidade direto, os MESMOS três
    // campos que o formulário de planejamento já grava — nenhum campo novo.
    if(pl.fimPrevistoCalculado) obsPartes.push(`Fim previsto (estimativa): ${C.fmtDate(pl.fimPrevistoCalculado)}`);
    // Fallback EXPLÍCITO pra planejamento antigo sem duracaoEstimadaUnidade
    // — "dias_uteis", o MESMO valor que Store.setPlanejamentoMontagem já
    // usa como default desde a Fase 5 (`dados.duracaoEstimadaUnidade ||
    // "dias_uteis"`, js/store.js) sempre que a unidade não vem preenchida.
    // Não é inferido de nenhuma outra informação — é o mesmo default fixo
    // já usado no resto do planejamento.
    const unidadeDuracao = pl.duracaoEstimadaUnidade || "dias_uteis";
    const duracaoEstimadaValor = pl.duracaoEstimadaValor || null;
    return {
      id: "evt-mont-"+o.id, tipo:"MONTAGEM", titulo:"Montagem — "+o.cliente,
      obraId:o.id, obraNome:o.cliente, cliente:o.cliente, endereco:o.endereco||"",
      data: pl.inicioPrevisto, unidadeDuracao, duracaoEstimadaValor, horaInicio:null, horaFim:null,
      equipe: pl.equipePlanejada||"", observacao: obsPartes.join(" · "),
      origem:"MONTAGEM", origemRefId:o.id, status,
      criadoPor:null, criadoEm:null, atualizadoPor:null, atualizadoEm:null,
    };
  }
  // ---------- expansão em ocorrências virtuais por dia (§1/§2) ----------
  // Escolhida a opção B do pedido ("ocorrências virtuais calculadas por dia
  // em memória") em vez da A ("um evento com início/fim de período"): TODA
  // a maquinaria de view já existente filtra por `e.data===iso` dia a dia
  // (Mês/Semana/Dia/Equipes/mobile/conflito) — com uma ocorrência por dia,
  // nenhuma dessas views precisa aprender "intervalo"; cada dia simplesmente
  // recebe seu próprio item, do jeito que elas já sabem ler. É a solução
  // mais simples compatível com as views atuais, como pedido.
  // NUNCA persiste nada — puramente em memória, recalculada a cada leitura
  // (chamada a partir de todosEventosBrutos, abaixo). O id de cada
  // ocorrência é DETERMINÍSTICO (base.id+"@"+dia, nunca M.uid): a mesma
  // ocorrência do mesmo dia sempre tem o mesmo id entre renders, o que
  // mantém estável a seleção no drawer (§20) e a filtragem por id em
  // qualquer lugar. Guarda de segurança bem acima de qualquer planejamento
  // real — existe só pra nunca travar a tela por erro grosseiro de digitação.
  //
  // AJUSTE (Fase 6 — verificação final de integração, antes do push): as
  // ocorrências são contadas DIRETO de duracaoEstimadaValor/
  // duracaoEstimadaUnidade — nunca mais iterando até fimPrevistoCalculado.
  // Motivo: Store.calcularFimPrevisto (Fase 5) soma dias de CALENDÁRIO ao
  // início (`inicio + dias`), que é a matemática certa pra "depois de N
  // dias", mas errada pra "um período de N dias começando no início" — um
  // período de 5 dias corridos começando numa segunda vai de segunda a
  // sexta (5 dias, +4), não de segunda à segunda seguinte (+7, 6 dias
  // úteis dentro do intervalo). Testado pelo fluxo real
  // (Store.setPlanejamentoMontagem → eventoMontagemDeObra →
  // ocorrenciasDeEventoBase) isso produzia 1 ocorrência A MAIS que a
  // duração declarada em TODOS os três casos (dias_uteis/semanas/
  // dias_corridos) — ver o relatório de entrega desta rodada pras datas
  // exatas. Corrigido contando os dias operacionais um a um a partir do
  // início, até bater a quantidade REALMENTE declarada no planejamento —
  // nunca dependendo da aproximação de calendário do fim. Isso também quer
  // dizer que "1 semana" = 5 dias úteis (segunda a sexta), não 7 dias
  // corridos — é a semântica operacional aprovada (fim de semana nunca é
  // ocupação automática, mesmo em "semanas" — já valia desde o ajuste
  // anterior, só ficou exato agora). fimPrevistoCalculado NÃO foi alterado
  // (Store.calcularFimPrevisto, Fase 5, continua intocada) — ela segue
  // existindo só como estimativa informativa (texto na observação), nunca
  // mais como limite de geração.
  function ocorrenciasDeEventoBase(base){
    if(!base) return [];
    if(!base.duracaoEstimadaValor){
      // sem duração declarada — nada pra contar; um único dia (o início),
      // mesmo comportamento de antes de existir expansão multidia.
      return [Object.assign({}, base, {periodoInicio: base.data, periodoFim: base.data})];
    }
    const unidade = base.unidadeDuracao || "dias_uteis"; // fallback defensivo — mesmo default do §3 da rodada anterior
    // "1 semana operacional" = 5 dias úteis (segunda a sexta) — não 7 dias
    // corridos; semântica confirmada nesta rodada.
    const alvo = unidade==="semanas" ? base.duracaoEstimadaValor*5 : base.duracaoEstimadaValor;
    const dias = [];
    let cursor = base.data, guard = 0;
    while(dias.length < alvo && guard < 400){ // guarda de segurança — bem acima de qualquer planejamento real
      if(C.ocupaAgendaNoDia(cursor, unidade)) dias.push(cursor);
      cursor = addDias(cursor, 1);
      guard++;
    }
    if(!dias.length) return [Object.assign({}, base, {periodoInicio: base.data, periodoFim: base.data})];
    const periodoFim = dias[dias.length-1];
    return dias.map(d=> Object.assign({}, base, {
      id: base.id+"@"+d, data: d, origemBaseId: base.id,
      periodoInicio: base.data, periodoFim,
    }));
  }
  // ---------- derivação — Assistência (Fase 7 — reescrita) ----------
  // ATÉ A FASE 6: um único evento por assistência, na data de `prazo` (mesma
  // regra do Calendário legado — nunca uma visita real, só um "lembrete" da
  // data-limite). Correção do usuário (item 4, aprovada): "confirma que a
  // Agenda deriva das visitas AGENDADAS (não mais de `prazo`); UMA
  // assistência pode gerar MÚLTIPLOS eventos derivados (um por visita
  // agendada); nunca persiste; usar assistenciaId+visitaId como referência
  // determinística; mudar a data da visita reflete automaticamente; visita
  // REALIZADA/CANCELADA para de aparecer como compromisso futuro (regra já
  // existente da Agenda, sem checagem nova)."
  //
  // Por isso esta função agora devolve um ARRAY (0, 1 ou N bases — uma por
  // visita AGENDADA do chamado), nunca mais um evento único ou null solto.
  // Cada base usa um id DETERMINÍSTICO combinando assistência+visita
  // ("evt-asst-"+assistenciaId+"-"+visitaId) — a mesma visita sempre produz
  // o mesmo id entre renders (igual ao id determinístico já usado em
  // ocorrenciasDeEventoBase pra ocorrência-por-dia), o que mantém estável a
  // seleção no drawer e a filtragem por id em qualquer lugar. `tipo` continua
  // SEMPRE "ASSISTENCIA" (nunca "RETORNO" — são dois tipos do catálogo com
  // significados diferentes: RETORNO é um compromisso manual qualquer,
  // ASSISTENCIA é sempre derivado de um chamado real).
  function eventosDeAssistencia(a){
    if(a.status==="CONCLUIDA" || a.status==="CANCELADA") return [];
    const agendadas = M.Calc.visitasComStatus(a, "AGENDADA");
    if(!agendadas.length) return [];
    const obra = a.obraId ? M.Store.getObra(a.obraId) : null;
    const status = a.status==="EM_EXECUCAO" ? "EM_ANDAMENTO" : "AGENDADO";
    return agendadas.filter(v=>v.data).map(v=> ({
      id:"evt-asst-"+a.id+"-"+v.id, tipo:"ASSISTENCIA", titulo:(a.categoria||"Assistência")+" — "+(a.obraNome||a.cliente||""),
      obraId:a.obraId||null, obraNome:a.obraNome||null, cliente:a.cliente||a.obraNome||null,
      endereco: obra ? (obra.endereco||"") : "",
      data:v.data, horaInicio:v.horaInicio||null, horaFim:v.horaFim||null,
      equipe:v.tecnico||a.responsavel||"", observacao:v.observacao||a.descricao||"",
      origem:"ASSISTENCIA", origemRefId:a.id, origemVisitaId:v.id, status,
      criadoPor:v.criadoPor||null, criadoEm:v.criadoEm||null, atualizadoPor:null, atualizadoEm:null,
    }));
  }

  // AJUSTE (§1, Fase 6): montagens entram aqui como OCORRÊNCIAS (uma por dia
  // do período, todas em memória) — `ocorrenciasDeEventoBase` devolve [base]
  // sem expandir quando não há período (Assistência, uma data só por visita),
  // então o caminho antigo continua idêntico pra tudo que já era de um dia só.
  // AJUSTE (Fase 7): assistência agora entra com `.flatMap` (cada assistência
  // pode contribuir 0..N bases, uma por visita agendada — ver
  // eventosDeAssistencia acima), não mais `.map(...).filter(Boolean)` de um
  // evento só.
  function todosEventosBrutos(){
    const manuais = M.Store.state.eventos;
    // FASE 7.5: rascunho não entra em Agenda (item 7 do pedido).
    const montagensBase = M.Store.obrasOperacionais().map(eventoMontagemDeObra).filter(Boolean);
    const assistenciasBase = M.Store.state.assistencias.flatMap(eventosDeAssistencia);
    const ocorrenciasDerivadas = montagensBase.concat(assistenciasBase).flatMap(ocorrenciasDeEventoBase);
    return manuais.concat(ocorrenciasDerivadas);
  }

  // ---------- escopo por perfil (§22) — mesmo padrão já usado no
  // Calendário legado/Pendências/Hoje: sem verTodasObras, só o que é do
  // contexto da pessoa (obra atribuída OU o próprio nome na equipe/criador).
  // Nenhuma permissão nova, nenhum vínculo novo — reusa
  // M.Store.obraIdsDoColaborador, a mesma função usada no resto do app.
  // AJUSTE (§5): comparação de pessoa centralizada em M.Calc.pessoaNoEvento
  // (normaliza espaço/caixa, nunca substring) — não duplica mais a mesma
  // regra de leitura do campo `equipe` aqui e em calc.js.
  function aplicarEscopo(brutos){
    if(M.Store.pode("verTodasObras")) return brutos;
    const nome = M.Store.state.usuarioAtual;
    const meuObraIds = M.Store.obraIdsDoColaborador(nome);
    return brutos.filter(e=> (e.obraId && meuObraIds.has(e.obraId)) || C.pessoaNoEvento(e, nome) || e.criadoPor===nome);
  }

  function todosEventosRaw(tiposArray){
    let out = aplicarEscopo(todosEventosBrutos());
    if(tiposArray && tiposArray.length) out = out.filter(e=> tiposArray.indexOf(e.tipo)!==-1);
    return out.sort((a,b)=> (a.data+(a.horaInicio||"00:00")).localeCompare(b.data+(b.horaInicio||"00:00")));
  }
  function eventosDoDia(iso, tiposArray){ return todosEventosRaw(tiposArray).filter(e=>e.data===iso); }
  function eventosDoPeriodo(inicioIso, fimIso, tiposArray){ return todosEventosRaw(tiposArray).filter(e=> e.data>=inicioIso && e.data<=fimIso); }
  // FASE 4/6 (§21 handoff): mesma API que M.Calendario.proximosEventos já
  // tinha — Hoje troca a chamada sem precisar mudar a forma como consome o
  // resultado. Cancelado nunca é "próximo compromisso" (já não é mais um
  // compromisso de verdade).
  // AJUSTE (§1): Montagem multidia agora gera uma ocorrência por dia — mas
  // "próximos compromissos" precisa continuar mostrando UMA linha por
  // compromisso real, não uma por dia do período. Dedupe pela chave do
  // "base" derivado (origemBaseId, presente só em ocorrência expandida);
  // evento manual/de um dia só não tem origemBaseId, então continua
  // contando por si (id) — comportamento idêntico ao de antes pra tudo que
  // não é multidia. todosEventosRaw já vem ordenado por data+hora, então a
  // primeira ocorrência de cada base dentro da janela é sempre a mais
  // próxima — é ela que aparece.
  function proximosEventos(diasAFrente, tiposArray){
    const limite = diasAFrente==null ? Infinity : diasAFrente;
    const vistos = new Set();
    const out = [];
    todosEventosRaw(tiposArray).forEach(e=>{
      if(e.status==="CANCELADO") return;
      const d = C.diasAte(e.data);
      if(d<0 || d>limite) return;
      const chave = e.origemBaseId || e.id;
      if(vistos.has(chave)) return;
      vistos.add(chave);
      out.push(e);
    });
    return out;
  }

  function aplicarFiltrosUI(eventos, filtros){
    filtros = filtros||{};
    let out = eventos;
    if(filtros.tipo) out = out.filter(e=>e.tipo===filtros.tipo);
    if(filtros.status) out = out.filter(e=>e.status===filtros.status);
    if(filtros.obraId) out = out.filter(e=>e.obraId===filtros.obraId);
    if(filtros.equipe){ const q=filtros.equipe.toLowerCase(); out = out.filter(e=> (e.equipe||"").toLowerCase().indexOf(q)!==-1); }
    return out;
  }

  M.Agenda = {
    addDias, segundaFeiraDe,
    eventoMontagemDeObra, eventosDeAssistencia, ocorrenciasDeEventoBase,
    todosEventosRaw, eventosDoDia, eventosDoPeriodo, proximosEventos, aplicarFiltrosUI,
  };

  // ============================================================
  // RENDER — desktop (Mês/Semana/Dia/Equipes) + mobile (Hoje/Amanhã/Semana)
  // ============================================================

  const ORIGEM_LABEL = {MANUAL:"Manual", MONTAGEM:"Planejamento de montagem", ASSISTENCIA:"Assistência", OBRA:"Obra"};

  // opts.esconderEquipe (§4): usado por viewSemana, que agora já agrupa as
  // linhas por pessoa (o nome vira o cabeçalho do grupo) — repetir a mesma
  // string de equipe dentro de cada linha ficaria redundante ali.
  function linhaCompactaHtml(e, idsConflito, opts){
    opts = opts || {};
    const conflito = idsConflito.has(e.id);
    const subPartes = [];
    if(!opts.esconderEquipe) subPartes.push(esc(e.equipe||"—"));
    if(e.obraNome) subPartes.push(esc(e.obraNome));
    return `<div class="agenda-evt-row${conflito?' conflito':''}${e.status==='CANCELADO'?' cancelado':''}" onclick="Act.selecionarEventoAgenda('${e.id}')">
      <span class="agenda-evt-hora">${e.horaInicio||"dia todo"}</span>
      ${UI.tipoEventoChip(e.tipo)}
      <span class="agenda-evt-title">${esc(e.titulo)}</span>
      ${subPartes.length? `<span class="agenda-evt-sub">${subPartes.join(" · ")}</span>` : ""}
      ${conflito? `<span title="Conflito de agenda" style="color:var(--critical);">${UI.icon('alert',12)}</span>`:""}
    </div>`;
  }

  // ---------- MÊS (§6) — capacidade/ocupação, sem ficha operacional ----------
  function viewMes(ano, mes, eventosEscopo, idsConflito){
    const first = new Date(ano,mes,1);
    const startDow = first.getDay();
    const dim = new Date(ano,mes+1,0).getDate();
    const porDia = {};
    eventosEscopo.forEach(e=>{
      const d = new Date(e.data+"T00:00:00");
      if(d.getMonth()!==mes || d.getFullYear()!==ano) return;
      (porDia[d.getDate()] = porDia[d.getDate()]||[]).push(e);
    });
    let cells = "";
    for(let i=0;i<startDow;i++) cells += `<div class="cal-cell empty"></div>`;
    for(let d=1; d<=dim; d++){
      const iso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = iso===M.todayISO();
      const doDia = (porDia[d]||[]).filter(e=>e.status!=="CANCELADO");
      const total = doDia.length;
      const tipos = doDia.reduce((acc,e)=>{ if(acc.indexOf(e.tipo)===-1) acc.push(e.tipo); return acc; }, []).slice(0,3);
      const temConflito = doDia.some(e=> idsConflito.has(e.id));
      const altaCarga = total>=4;
      cells += `<div class="cal-cell${isToday?' today':''}${altaCarga?' busy':''}" onclick="Act.agendaVerDia('${iso}')">
        <div class="cal-daynum">${d}${temConflito?` <span title="conflito" style="color:var(--critical);">●</span>`:""}</div>
        ${total? `<div class="chip neutral" style="font-size:9px;padding:1px 5px;">${total}</div>`:""}
        <div class="agenda-mes-dots">${tipos.map(t=>`<span class="dot ${M.tipoEventoDef(t).tone}"></span>`).join("")}</div>
      </div>`;
    }
    const dows = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
    // grade começa na segunda (§ padrão de semana do resto da Agenda) — os
    // índices de dow do JS (0=domingo) são remapeados só na exibição do
    // cabeçalho; a grade em si segue a semana civil normal (domingo-sábado),
    // igual ao Calendário legado, pra não confundir com o mês do calendário
    // impresso/físico que todo mundo já conhece.
    const dowsHtml = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(x=>`<div class="cal-dow">${x}</div>`).join("");
    return `<div class="card pad">
      <div class="cal-scroll"><div class="cal-grid">${dowsHtml}${cells}</div></div>
    </div>`;
  }

  // AJUSTE (Fase 6 — ajustes antes do push, §4) — dentro do dia, a equipe
  // precisa ser um eixo VISÍVEL, não só texto secundário perdido no card.
  // Mesmo padrão de agrupamento por pessoa que já existia em viewEquipes,
  // reaproveitado aqui — nenhuma estrutura de equipe nova. Evento com mais
  // de uma pessoa aparece sob o grupo de CADA uma delas (mesmo raciocínio
  // de viewEquipes): é o jeito de responder "quem está onde" pra cada
  // pessoa, sem inventar um "responsável principal" que o modelo não tem.
  function agruparPorPessoaNoDia(eventosDoDia){
    const porPessoa = {};
    const semEquipe = [];
    eventosDoDia.forEach(e=>{
      const pessoas = C.pessoasDoEvento(e);
      if(!pessoas.length){ semEquipe.push(e); return; }
      pessoas.forEach(p=> (porPessoa[p]=porPessoa[p]||[]).push(e));
    });
    const nomes = Object.keys(porPessoa).sort((a,b)=>a.localeCompare(b));
    const grupos = nomes.map(nome=>({nome, eventos:porPessoa[nome]}));
    if(semEquipe.length) grupos.push({nome:"Sem equipe definida", eventos:semEquipe});
    return grupos;
  }

  // ---------- SEMANA (§7) — visão operacional principal ----------
  function viewSemana(inicioIso, eventosEscopo, idsConflito){
    const dias = Array.from({length:7}, (_,i)=> addDias(inicioIso,i));
    return `<div class="agenda-semana-grid">${dias.map(iso=>{
      const doDia = eventosEscopo.filter(e=>e.data===iso).sort((a,b)=>(a.horaInicio||"").localeCompare(b.horaInicio||""));
      const isToday = iso===M.todayISO();
      const label = new Date(iso+"T00:00:00").toLocaleDateString("pt-BR",{weekday:"short", day:"2-digit"});
      const grupos = agruparPorPessoaNoDia(doDia);
      return `<div class="agenda-semana-col">
        <div class="agenda-semana-head${isToday?' today':''}">${esc(label)}</div>
        ${grupos.length? grupos.map(g=>`
          <div class="agenda-semana-equipe">
            <div class="agenda-semana-equipe-nome">${esc(g.nome)}</div>
            ${g.eventos.map(e=>linhaCompactaHtml(e, idsConflito, {esconderEquipe:true})).join("")}
          </div>
        `).join("") : `<p class="small muted">Sem compromissos</p>`}
      </div>`;
    }).join("")}</div>`;
  }

  // ---------- DIA (§8) — agenda detalhada ----------
  function viewDia(iso, eventosEscopo, idsConflito){
    const doDia = eventosEscopo.filter(e=>e.data===iso).sort((a,b)=>(a.horaInicio||"").localeCompare(b.horaInicio||""));
    if(!doDia.length) return `<div class="card pad"><p class="small muted">Nenhum compromisso neste dia.</p></div>`;
    return `<div class="card pad" style="overflow-x:auto;">
      <table class="tbl">
        <thead><tr><th>Horário</th><th>Tipo</th><th>Obra/Cliente</th><th>Equipe</th><th>Endereço</th><th>Status</th><th></th></tr></thead>
        <tbody>${doDia.map(e=>{
          const conflito = idsConflito.has(e.id);
          const periodo = e.periodoInicio && e.periodoFim && e.periodoInicio!==e.periodoFim
            ? `<div class="small muted">${C.fmtDate(e.periodoInicio)}–${C.fmtDate(e.periodoFim)}</div>` : "";
          return `<tr style="cursor:pointer;${conflito?'background:var(--critical-bg);':''}" onclick="Act.selecionarEventoAgenda('${e.id}')">
            <td>${e.horaInicio? e.horaInicio+(e.horaFim?"–"+e.horaFim:"") : "dia todo"}${periodo}</td>
            <td>${UI.tipoEventoChip(e.tipo)}</td>
            <td>${esc(e.obraNome||e.cliente||"—")}</td>
            <td>${esc(e.equipe||"—")}</td>
            <td class="small muted">${esc(e.endereco||"—")}</td>
            <td>${UI.statusEventoChip(e.status)}</td>
            <td>${conflito? `<span title="Conflito de agenda" style="color:var(--critical);">${UI.icon('alert',13)}</span>`:""}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;
  }

  // ---------- EQUIPES (§9) — distribuição por pessoa, sem rota/mapa ----------
  function viewEquipes(eventosSemana, idsConflito){
    const porPessoa = {};
    eventosSemana.filter(e=>e.status!=="CANCELADO").forEach(e=>{
      const pessoas = C.pessoasDoEvento(e);
      (pessoas.length? pessoas : ["Sem equipe definida"]).forEach(p=> (porPessoa[p]=porPessoa[p]||[]).push(e));
    });
    const nomes = Object.keys(porPessoa).sort((a,b)=> a==="Sem equipe definida" ? 1 : b==="Sem equipe definida" ? -1 : a.localeCompare(b));
    if(!nomes.length) return `<div class="card pad"><p class="small muted">Nenhum compromisso com equipe/responsável nesta semana.</p></div>`;
    return `<div class="agenda-equipes-grid">${nomes.map(nome=>{
      const evts = porPessoa[nome].slice().sort((a,b)=> (a.data+(a.horaInicio||"")).localeCompare(b.data+(b.horaInicio||"")));
      const nConflitos = evts.filter(e=>idsConflito.has(e.id)).length;
      return `<div class="card pad">
        <div class="flex-between"><b>${esc(nome)}</b>${nConflitos? `<span class="chip critical">${nConflitos} conflito${nConflitos>1?'s':''}</span>` : `<span class="chip neutral">${evts.length}</span>`}</div>
        <div style="margin-top:8px;">${evts.map(e=>linhaCompactaHtml(e, idsConflito)).join("")}</div>
      </div>`;
    }).join("")}</div>`;
  }

  // ---------- painel lateral de detalhe (§19/§20) ----------
  function drawerEvento(evento, idsConflito){
    if(!evento) return `<div class="card pad"><p class="small muted">Selecione um compromisso para ver os detalhes.</p></div>`;
    const emConflito = idsConflito.has(evento.id);
    const derivado = evento.origem!=="MANUAL";
    return `<div class="card pad">
      <div class="flex-between" style="flex-wrap:wrap;gap:6px;">${UI.tipoEventoChip(evento.tipo)}${UI.statusEventoChip(evento.status)}</div>
      <h3 style="margin:10px 0 2px;font-size:15px;">${esc(evento.titulo)}</h3>
      ${emConflito? `<div class="chip critical" style="margin-top:4px;">${UI.icon('alert',11)} Conflito de agenda</div>`:""}
      <div class="mcard-rows" style="margin-top:10px;">
        <div class="mcard-row"><span class="mcard-k">Data</span><span class="mcard-v">${C.fmtDate(evento.data)}${evento.horaInicio? " · "+evento.horaInicio+(evento.horaFim?"–"+evento.horaFim:"") : " · dia todo"}</span></div>
        ${evento.periodoInicio && evento.periodoFim && evento.periodoInicio!==evento.periodoFim ? `<div class="mcard-row"><span class="mcard-k">Período</span><span class="mcard-v">${C.fmtDate(evento.periodoInicio)} – ${C.fmtDate(evento.periodoFim)}</span></div>`:""}
        ${evento.obraNome||evento.cliente? `<div class="mcard-row"><span class="mcard-k">Obra/Cliente</span><span class="mcard-v">${esc(evento.obraNome||evento.cliente)}</span></div>`:""}
        ${evento.endereco? `<div class="mcard-row"><span class="mcard-k">Endereço</span><span class="mcard-v">${esc(evento.endereco)}</span></div>`:""}
        <div class="mcard-row"><span class="mcard-k">Equipe</span><span class="mcard-v">${esc(evento.equipe||"—")}</span></div>
        <div class="mcard-row"><span class="mcard-k">Origem</span><span class="mcard-v">${esc(ORIGEM_LABEL[evento.origem]||evento.origem)}</span></div>
      </div>
      ${evento.observacao? `<div class="hr" style="margin:10px 0;"></div><div class="small muted">${esc(evento.observacao)}</div>`:""}
      ${derivado? `<div class="help-banner" style="margin-top:10px;">${UI.icon('link',13)} Este compromisso vem d${evento.origem==="MONTAGEM"?"o planejamento da montagem":"a assistência"} — editar leva até lá.</div>`:""}
      <div class="flex-gap" style="margin-top:12px;flex-wrap:wrap;">
        ${evento.obraId? `<a class="btn sm ghost" href="#/obra/${evento.obraId}">${UI.icon('building',12)} Abrir obra</a>`:""}
        ${evento.origem==="MONTAGEM"? `<button class="btn sm" onclick="Act.abrirPlanejamentoMontagem('${evento.obraId}')">${UI.icon('wrench',12)} Abrir planejamento</button>`:""}
        ${evento.origem==="ASSISTENCIA"? `<button class="btn sm" onclick="Act.abrirAssistenciaDaAgenda('${evento.origemRefId}')">${UI.icon('lifebuoy',12)} Abrir atendimento</button>`:""}
        ${!derivado && M.Store.pode("agenda.editar")? `<button class="btn sm" onclick="Act.editarEventoAgenda('${evento.id}')">${UI.icon('edit',12)} Editar</button>`:""}
        ${!derivado && evento.status!=="CANCELADO" && M.Store.pode("agenda.editar")? `<button class="btn sm danger" onclick="Act.cancelarEventoAgenda('${evento.id}')">${UI.icon('x',12)} Cancelar</button>`:""}
      </div>
    </div>`;
  }

  // ---------- mobile (§10/§11) — Hoje/Amanhã/Semana, cards ----------
  function eventoCardMobileHtml(e, idsConflito){
    const obra = e.obraId ? M.Store.getObra(e.obraId) : null;
    const tel = obra && obra.telefone;
    let acaoBtn = "";
    if(e.origem==="MONTAGEM") acaoBtn = `<button class="btn sm ghost" onclick="Act.abrirPlanejamentoMontagem('${e.obraId}')">${UI.icon('wrench',12)} Abrir montagem</button>`;
    else if(e.origem==="ASSISTENCIA") acaoBtn = `<button class="btn sm ghost" onclick="Act.abrirAssistenciaDaAgenda('${e.origemRefId}')">${UI.icon('lifebuoy',12)} Abrir atendimento</button>`;
    else if(e.obraId) acaoBtn = `<a class="btn sm ghost" href="#/obra/${e.obraId}">${UI.icon('building',12)} Abrir obra</a>`;
    const conflito = idsConflito.has(e.id);
    return `<div class="mcard"${conflito?' style="border-color:var(--critical);"':''}>
      <div class="mcard-top"><span class="mcard-title">${esc(e.titulo)}</span>${UI.tipoEventoChip(e.tipo)}</div>
      <div class="mcard-rows">
        <div class="mcard-row"><span class="mcard-k">Horário</span><span class="mcard-v">${e.horaInicio? e.horaInicio+(e.horaFim?"–"+e.horaFim:"") : "dia todo"}</span></div>
        ${e.periodoInicio && e.periodoFim && e.periodoInicio!==e.periodoFim ? `<div class="mcard-row"><span class="mcard-k">Período</span><span class="mcard-v">${C.fmtDate(e.periodoInicio)}–${C.fmtDate(e.periodoFim)}</span></div>`:""}
        ${e.obraNome||e.cliente? `<div class="mcard-row"><span class="mcard-k">Obra/Cliente</span><span class="mcard-v">${esc(e.obraNome||e.cliente)}</span></div>`:""}
        ${e.endereco? `<div class="mcard-row"><span class="mcard-k">Endereço</span><span class="mcard-v">${esc(e.endereco)}</span></div>`:""}
        <div class="mcard-row"><span class="mcard-k">Equipe</span><span class="mcard-v">${esc(e.equipe||"—")}</span></div>
        <div class="mcard-row"><span class="mcard-k">Status</span><span class="mcard-v">${esc(M.statusEventoDef(e.status).label)}</span></div>
      </div>
      ${conflito? `<div class="chip critical" style="margin-top:6px;">${UI.icon('alert',11)} Conflito de agenda</div>`:""}
      ${(acaoBtn||tel)? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">${acaoBtn}${tel? `<a class="btn sm ghost" href="tel:${tel.replace(/\D/g,'')}">${UI.icon('phone',12)} Ligar</a>`:""}</div>` : ""}
    </div>`;
  }
  function grupoMobileDia(iso, eventos, idsConflito, tituloVazio){
    const doDia = eventos.filter(e=>e.data===iso && e.status!=="CANCELADO");
    if(!doDia.length) return `<p class="small muted">${esc(tituloVazio)}</p>`;
    return doDia.sort((a,b)=>(a.horaInicio||"").localeCompare(b.horaInicio||"")).map(e=>eventoCardMobileHtml(e, idsConflito)).join("");
  }
  function mobileView(eventosEscopo, idsConflito){
    const tab = M.UIState.agendaMobileTab;
    const hoje = M.todayISO(), amanha = addDias(hoje,1);
    const tabs = [{key:"HOJE",label:"Hoje"},{key:"AMANHA",label:"Amanhã"},{key:"SEMANA",label:"Semana"}];
    const tabsHtml = `<div class="flex-gap" style="margin-bottom:10px;flex-wrap:wrap;">${tabs.map(t=>`<button class="chip ${tab===t.key?'brand':'neutral'}" style="cursor:pointer;border:none;" onclick="Act.setAgendaMobileTab('${t.key}')">${t.label}</button>`).join("")}</div>`;
    let corpo;
    if(tab==="HOJE") corpo = grupoMobileDia(hoje, eventosEscopo, idsConflito, "Nada para hoje.");
    else if(tab==="AMANHA") corpo = grupoMobileDia(amanha, eventosEscopo, idsConflito, "Nada para amanhã.");
    else {
      const dias = Array.from({length:7}, (_,i)=> addDias(hoje,i));
      corpo = dias.map(iso=>{
        const doDia = eventosEscopo.filter(e=>e.data===iso && e.status!=="CANCELADO");
        if(!doDia.length) return "";
        const label = new Date(iso+"T00:00:00").toLocaleDateString("pt-BR",{weekday:"long", day:"2-digit", month:"short"});
        return `<div class="sec-head"><div class="sec-title"><b style="text-transform:capitalize;">${esc(label)}</b></div></div>${grupoMobileDia(iso, eventosEscopo, idsConflito, "")}`;
      }).join("") || `<p class="small muted">Nada nos próximos 7 dias.</p>`;
    }
    return `${tabsHtml}${corpo}`;
  }

  // ============================================================
  M.Pages.agenda = function(){
    const S = M.UIState;
    // inicialização preguiçosa (actions.js — onde M.UIState nasce — carrega
    // antes deste arquivo, então segundaFeiraDe só existe a partir daqui;
    // só computa na primeira vez que a tela é aberta, não no boot do app).
    if(!S.agendaSemanaInicio) S.agendaSemanaInicio = segundaFeiraDe(M.todayISO());
    const idsConflito = C.idsEmConflitoAgenda(aplicarEscopo(todosEventosBrutos()));
    const eventosEscopo = todosEventosRaw();
    const eventosFiltrados = aplicarFiltrosUI(eventosEscopo, S.agendaFiltros);

    // ---------- topo: seletor de view + navegação de período ----------
    const VIEWS = [{key:"MES",label:"Mês"},{key:"SEMANA",label:"Semana"},{key:"DIA",label:"Dia"},{key:"EQUIPES",label:"Equipes"}];
    const view = S.agendaView;
    let periodoLabel;
    if(view==="MES") periodoLabel = new Date(S.agendaAno, S.agendaMes, 1).toLocaleDateString("pt-BR",{month:"long", year:"numeric"});
    else if(view==="DIA") periodoLabel = new Date(S.agendaDia+"T00:00:00").toLocaleDateString("pt-BR",{weekday:"long", day:"2-digit", month:"long"});
    else periodoLabel = `${C.fmtDate(S.agendaSemanaInicio)} – ${C.fmtDate(addDias(S.agendaSemanaInicio,6))}`;

    // FASE 7.5: rascunho não entra no filtro de obra da Agenda (item 7).
    const obrasFiltroBase = M.Store.obrasOperacionais();
    const obrasParaFiltro = M.Store.pode("verTodasObras") ? obrasFiltroBase
      : obrasFiltroBase.filter(o=> M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual).has(o.id));

    const topoHtml = `
      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-between" style="flex-wrap:wrap;gap:10px;">
          <div class="flex-gap">${VIEWS.map(v=>`<button class="chip ${view===v.key?'brand':'neutral'}" style="cursor:pointer;border:none;" onclick="Act.setAgendaView('${v.key}')">${v.label}</button>`).join("")}</div>
          <div class="flex-gap" style="align-items:center;">
            <button class="btn-icon" onclick="Act.agendaNav(-1)">${UI.icon('chevron-left',14)}</button>
            <b style="text-transform:capitalize;min-width:150px;text-align:center;">${esc(periodoLabel)}</b>
            <button class="btn-icon" onclick="Act.agendaNav(1)">${UI.icon('chevron-right',14)}</button>
            <button class="btn sm ghost" onclick="Act.agendaHoje()">Hoje</button>
          </div>
        </div>
        <div class="hr" style="margin:10px 0;"></div>
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setAgendaFiltro('tipo',this.value)">
            <option value="">Todos os tipos</option>
            ${M.TIPOS_EVENTO_AGENDA.map(t=>`<option value="${t.key}" ${S.agendaFiltros.tipo===t.key?'selected':''}>${t.label}</option>`).join("")}
          </select>
          <select onchange="Act.setAgendaFiltro('obraId',this.value)">
            <option value="">Toda obra</option>
            ${obrasParaFiltro.map(o=>`<option value="${o.id}" ${S.agendaFiltros.obraId===o.id?'selected':''}>${esc(o.cliente)}</option>`).join("")}
          </select>
          <select onchange="Act.setAgendaFiltro('status',this.value)">
            <option value="">Todo status</option>
            ${M.STATUS_EVENTO_AGENDA.map(s=>`<option value="${s.key}" ${S.agendaFiltros.status===s.key?'selected':''}>${s.label}</option>`).join("")}
          </select>
          <input type="text" id="agendaFiltroEquipe" placeholder="Equipe/responsável" value="${esc(S.agendaFiltros.equipe)}" oninput="Act.setAgendaFiltro('equipe', this.value)" style="max-width:190px;">
        </div>
      </div>
    `;

    // ---------- visão principal + painel lateral ----------
    let mainHtml;
    if(view==="MES") mainHtml = viewMes(S.agendaAno, S.agendaMes, eventosFiltrados, idsConflito);
    else if(view==="DIA") mainHtml = viewDia(S.agendaDia, eventosFiltrados, idsConflito);
    else if(view==="EQUIPES") mainHtml = viewEquipes(eventosFiltrados.filter(e=> e.data>=S.agendaSemanaInicio && e.data<=addDias(S.agendaSemanaInicio,6)), idsConflito);
    else mainHtml = viewSemana(S.agendaSemanaInicio, eventosFiltrados, idsConflito);

    const eventoSelecionado = S.agendaEventoSelId ? eventosEscopo.find(e=>e.id===S.agendaEventoSelId) : null;
    const mostraDrawer = view==="SEMANA" || view==="DIA" || view==="EQUIPES";

    const desktopHtml = `
      <div class="desktop-only">
        ${topoHtml}
        ${mostraDrawer ? `
          <div class="agenda-layout">
            <div class="agenda-main">${mainHtml}</div>
            <div class="agenda-drawer">${drawerEvento(eventoSelecionado, idsConflito)}</div>
          </div>
        ` : mainHtml}
      </div>
    `;

    const mobileHtml = `<div class="mobile-only">${mobileView(eventosFiltrados, idsConflito)}</div>`;

    return {
      title:"Agenda", crumb:"Quem precisa estar onde e quando — montagem, assistência, retorno, visita e medição",
      html: desktopHtml + mobileHtml,
      actionsHtml: M.Store.pode("agenda.criar") ? `<button class="btn primary" onclick="Act.openEventoForm(null)">${UI.icon('plus',14)} Novo compromisso</button>` : "",
    };
  };

  // ---------- formulário de evento manual (§14/§15) ----------
  M.Pages.eventoFormHtml = function(evento){
    const editando = !!evento;
    const tiposManuais = M.TIPOS_EVENTO_AGENDA.filter(t=>t.manual);
    // FASE 7.5: rascunho não pode ganhar compromisso manual de Agenda (item 7).
    const obras = M.Store.obrasOperacionais();
    return `
      <div class="modal-head"><h2>${editando?"Editar compromisso":"Novo compromisso"}</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formEvento">
        <div class="modal-body">
          <div class="field"><label>Tipo</label>
            <select name="tipo">${tiposManuais.map(t=>`<option value="${t.key}" ${evento&&evento.tipo===t.key?'selected':''}>${t.label}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Título</label><input name="titulo" placeholder="Ex: Visita técnica" value="${esc(evento?evento.titulo:'')}"></div>
          <div class="field-row">
            <div class="field"><label>Obra</label>
              <select name="obraId"><option value="">— cliente avulso —</option>${obras.map(o=>`<option value="${o.id}" ${evento&&evento.obraId===o.id?'selected':''}>${o.numeroOS} — ${esc(o.cliente)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Cliente (se avulso)</label><input name="clienteLivre" placeholder="Nome do cliente" value="${esc(evento&&!evento.obraId?(evento.cliente||''):'')}"></div>
          </div>
          <div class="field"><label>Endereço/local</label><input name="endereco" placeholder="Endereço ou ponto de referência" value="${esc(evento?(evento.endereco||''):'')}"></div>
          <div class="field-row">
            <div class="field"><label>Data</label><input type="date" name="data" value="${evento?evento.data:M.todayISO()}" required></div>
            <div class="field"><label>Hora início</label><input type="time" name="horaInicio" value="${evento&&evento.horaInicio?evento.horaInicio:''}"></div>
            <div class="field"><label>Hora fim</label><input type="time" name="horaFim" value="${evento&&evento.horaFim?evento.horaFim:''}"></div>
          </div>
          <div class="field"><label>Equipe / responsáveis</label><input name="equipe" placeholder="Ex: Roberto Diniz, Fernanda Costa" value="${esc(evento?(evento.equipe||''):'')}"></div>
          <div class="field"><label>Observação</label><textarea name="observacao" placeholder="Observação curta">${esc(evento?(evento.observacao||''):'')}</textarea></div>
          ${editando && evento.status==="CANCELADO" ? `<p class="small muted">Este compromisso está cancelado.</p>` : ""}
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${editando?"Salvar":"Criar compromisso"}</button></div>
      </form>`;
  };
})();
