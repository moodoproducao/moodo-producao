/* ============================================================
   PÁGINA: Nova Obra — tela única (seção 6), importação simulada (OS + Orçamento)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  // "leitura" simulada — dados mockados baseados num PDF de exemplo
  const MOCK_OS = {
    numeroOS: "OS 2026/350", cliente: "Beatriz e Henrique", responsavel:"Beatriz Nogueira",
    data: M.todayISO(), endereco:"Rua Girassóis, 77 — Alphaville, Barueri/SP", telefone:"(11) 99887-6655", email:"beatriz.henrique@email.com",
    ambientes: [
      {nome:"Sala de Estar", itens:[
        {item:"Estante Suspensa", qtd:1, materiaisEspeciais:["LED embutido","Prateleiras de vidro"]},
        {item:"Rack Baixo", qtd:1, materiaisEspeciais:["Base em serralheria (ferro preto)"]},
      ]},
      {nome:"Cozinha", itens:[
        {item:"Armário Planejado Completo", qtd:1, materiaisEspeciais:["Espelho no painel superior"]},
      ]},
    ],
    observacoes:"Cliente pediu atenção especial ao acabamento do rack (base em ferro preto fosco).",
  };
  const MOCK_ORC = {
    numero:"ORC 2026/350",
    itens:[
      {ambiente:"Sala de Estar", item:"Estante Suspensa", qtd:1, valorBruto:18000},
      {ambiente:"Sala de Estar", item:"Rack Baixo", qtd:1, valorBruto:9800},
      {ambiente:"Cozinha", item:"Armário Planejado Completo", qtd:1, valorBruto:34600},
    ],
    valorFinalVendido: 56000,
  };
  const COMPONENTES_ESPECIAIS = [
    "1 item de serralheria (base do rack)", "2 itens de vidro/espelho (prateleiras + espelho armário)", "1 item com LED (perfil embutido)",
  ];

  function ambientesAgrupados(){
    const map = {};
    MOCK_ORC.itens.forEach(it=>{ (map[it.ambiente] = map[it.ambiente]||[]).push(it); });
    return map;
  }
  function valorBrutoTotal(){ return MOCK_ORC.itens.reduce((s,i)=>s+i.valorBruto,0); }

  M.Pages.novaObra = function(){
    const w = M.UIState.novaObra;
    const grupos = ambientesAgrupados();
    const brutoTotal = valorBrutoTotal();
    const vendido = MOCK_ORC.valorFinalVendido;
    const fator = vendido / brutoTotal;

    const somaLiquidoAjustado = Object.keys(grupos).reduce((s,nome)=>{
      const bruto = grupos[nome].reduce((x,i)=>x+i.valorBruto,0);
      const auto = Math.round(bruto*fator);
      return s + (w.ambientesAjuste[nome]!=null? w.ambientesAjuste[nome] : auto);
    },0);
    const fecha = somaLiquidoAjustado === vendido;

    const dropzone = (kind, label, file)=> `
      <div class="dropzone" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')"
           ondrop="event.preventDefault();this.classList.remove('over');Act.novaObraDropFile('${kind}', (event.dataTransfer.files[0]||{}).name)"
           onclick="Act.novaObraDropFile('${kind}')" style="padding:22px 16px;">
        ${UI.icon('list',22)}
        ${file? `<div style="margin-top:6px;"><b>${UI.esc(file)}</b><div class="small muted">arquivo recebido — clique para trocar</div></div>`
               : `<div style="margin-top:6px;"><b>${label}</b><div class="small muted">arraste o PDF aqui ou clique para simular o upload</div></div>`}
      </div>`;

    const html = `
      <div class="oneform-section">
        <h2><span class="num-badge">1</span>Documentos</h2>
        <div class="grid-2">
          ${dropzone("os","Ordem de Serviço (PDF)", w.osFile)}
          ${dropzone("orc","Orçamento (PDF)", w.orcFile)}
        </div>
        ${(w.osFile && w.orcFile && !w.lido) ? `<button class="btn primary" style="margin-top:14px;" onclick="Act.novaObraSimularLeitura()">${UI.icon('search',14)} Simular leitura automática</button>`:""}
        ${!w.lido ? `<p class="small muted" style="margin-top:10px;">As seções abaixo aparecem depois da leitura automática (simulada nesta versão — numa fase futura virá de OCR/IA real lendo o PDF).</p>`:""}
      </div>

      ${w.lido ? `
      <div class="oneform-section">
        <h2><span class="num-badge">2</span>Dados extraídos</h2>
        <div class="grid-2">
          <div class="card pad">
            <p><b>${MOCK_OS.numeroOS}</b> — ${MOCK_OS.cliente}</p>
            <p class="small muted">${MOCK_OS.endereco}</p>
            <p class="small muted">Responsável: ${MOCK_OS.responsavel}</p>
            <div class="hr"></div>
            <p class="small">${UI.esc(MOCK_OS.observacoes)}</p>
          </div>
          <div class="card pad">
            <div class="card-title">Componentes especiais identificados</div>
            <ul style="margin:0 0 0 18px; font-size:12.5px; line-height:1.9;">${COMPONENTES_ESPECIAIS.map(c=>`<li>${c}</li>`).join("")}</ul>
          </div>
        </div>
      </div>

      <div class="oneform-section">
        <h2><span class="num-badge">3</span>Valores — bruto × real vendido</h2>
        <div class="flex-gap" style="gap:20px;flex-wrap:wrap;margin-bottom:12px;">
          <div><div class="small muted">Valor bruto</div><b style="font-size:16px;">${C.fmtBRL(brutoTotal)}</b></div>
          <div><div class="small muted">Valor real vendido</div><b style="font-size:16px;">${C.fmtBRL(vendido)}</b></div>
          <div><div class="small muted">Desconto</div><b style="font-size:16px;">${C.fmtBRL(brutoTotal-vendido)} (${Math.round((1-fator)*10000)/100}%)</b></div>
        </div>
        <p class="small muted">O orçamento pode ter sido majorado antes da negociação — por isso a produção nunca usa o valor bruto, e sim o valor real vendido, rateado proporcionalmente por ambiente (fator líquido = ${Math.round(fator*1000)/1000}).</p>
      </div>

      <div class="oneform-section">
        <h2><span class="num-badge">4</span>Ambientes — rateio bruto → líquido</h2>
        <table class="tbl">
          <thead><tr><th>Ambiente</th><th>Itens</th><th>Valor bruto</th><th>Valor líquido (rateado)</th></tr></thead>
          <tbody>${Object.keys(grupos).map(nome=>{
            const bruto = grupos[nome].reduce((s,i)=>s+i.valorBruto,0);
            const liquidoAuto = Math.round(bruto*fator);
            const ajustado = w.ambientesAjuste[nome];
            const liquido = ajustado!=null ? ajustado : liquidoAuto;
            return `<tr>
              <td><b>${nome}</b></td>
              <td class="small muted">${grupos[nome].map(i=>i.item).join(", ")}</td>
              <td>${C.fmtBRL(bruto)}</td>
              <td><input type="number" step="100" value="${liquido}" style="width:130px;padding:6px 8px;border-radius:6px;border:1px solid var(--border-strong);"
                    onchange="Act.novaObraAjustarValor('${nome}', this.value)"></td>
            </tr>`;
          }).join("")}</tbody>
        </table>
        <div class="flex-between" style="margin-top:10px;">
          <button class="btn sm" onclick="Act.novaObraResetAjustes()">${UI.icon('refresh',13)} Recalcular rateio automático</button>
          <span class="small" style="${fecha?'color:var(--good);font-weight:700;':'color:var(--critical);font-weight:700;'}">
            ${fecha? UI.icon('check-circle',13)+' soma dos ambientes fecha com o valor vendido' : `soma atual ${C.fmtBRL(somaLiquidoAjustado)} — ajuste até fechar em ${C.fmtBRL(vendido)}`}
          </span>
        </div>
      </div>

      <div class="oneform-section">
        <h2><span class="num-badge">5</span>Itens / móveis</h2>
        ${MOCK_OS.ambientes.map(a=>`
          <div class="card pad" style="margin-bottom:10px;">
            <div class="card-title">${a.nome}</div>
            ${a.itens.map(it=>`<div class="check-row"><span class="label"><b>${UI.esc(it.item)}</b>${it.materiaisEspeciais&&it.materiaisEspeciais.length? ` <span class="small muted">— ${it.materiaisEspeciais.join(", ")}</span>`:""}</span></div>`).join("")}
          </div>`).join("")}
      </div>

      <div class="oneform-section">
        <h2><span class="num-badge">6</span>Componentes especiais / exceções</h2>
        <p class="small muted">Só cadastramos aqui o que é exceção — vidro, serralheria, LED, itens terceirizados. Peças de MDF comuns não precisam de cadastro individual.</p>
        <ul style="margin:8px 0 0 18px; font-size:12.5px; line-height:1.9;">${COMPONENTES_ESPECIAIS.map(c=>`<li>${c}</li>`).join("")}</ul>
      </div>

      <div class="oneform-section">
        <h2><span class="num-badge">7</span>Resumo</h2>
        <p class="small">Ao confirmar, a obra <b>${MOCK_OS.numeroOS} — ${MOCK_OS.cliente}</b> entra no Kanban de Produção na etapa <b>Agendada</b>, com os ambientes e valores revisados acima.</p>
        <button class="btn primary" style="margin-top:10px;" ${fecha? "" : "disabled"} onclick="Act.novaObraCriar()">${UI.icon('check',14)} Criar obra</button>
        ${!fecha? `<p class="small critical" style="margin-top:6px;color:var(--critical);">Ajuste os valores líquidos por ambiente até a soma fechar com o valor vendido antes de criar a obra.</p>`:""}
      </div>
      ` : ""}
    `;

    return {title:"Nova Obra", crumb:"Uma tela só — documentos, valores, ambientes e resumo", narrow:true, html};
  };

  // monta o objeto de obra a partir do estado da tela única (chamado por Act.novaObraCriar)
  M.Pages.novaObraMontar = function(){
    const w = M.UIState.novaObra;
    const brutoTotal = valorBrutoTotal();
    const vendido = MOCK_ORC.valorFinalVendido;
    const fator = vendido/brutoTotal;
    const grupos = ambientesAgrupados();

    const ambientes = MOCK_OS.ambientes.map(a=>{
      const itens = grupos[a.nome]||[];
      const brutoAmb = itens.reduce((s,i)=>s+i.valorBruto,0);
      const liquidoAmbAuto = Math.round(brutoAmb*fator);
      const liquidoAmb = w.ambientesAjuste[a.nome]!=null ? w.ambientesAjuste[a.nome] : liquidoAmbAuto;
      const moveis = a.itens.map(it=>{
        const itemOrc = itens.find(x=>x.item===it.item);
        const valorItem = itemOrc ? Math.round(itemOrc.valorBruto*fator*(liquidoAmb/Math.max(1,liquidoAmbAuto))) : Math.round(liquidoAmb/a.itens.length);
        return {
          id:M.uid("mov"), nome:it.item, etapa:0, responsavel:MOCK_OS.responsavel,
          // item 9 do backlog de melhorias (checklist vira tarefa): a lista de componentes
          // do móvel (MDF, ferragens, materiais especiais) não fica mais como um checklist
          // separado e desconectado — Store.criarObra() transforma cada item aqui numa
          // Tarefa de verdade (mesma tela de Iniciar/Concluir de qualquer outra tarefa).
          checklistInicial:["Corpo MDF","Ferragens"].concat(it.materiaisEspeciais||[]),
          componentesCriticos:[], bloqueio:null, dataEntradaEtapa:M.todayISO(),
          dataPrevista:M.dOff(20), dataReal:null, valorLiquido:valorItem, requisitosOverride:{},
        };
      });
      return { id:M.uid("amb"), nome:a.nome, valorBrutoPct: brutoAmb/brutoTotal, valorBruto:brutoAmb, valorLiquido:liquidoAmb, moveis };
    });

    return {
      id: M.uid("obra"), numeroOS: MOCK_OS.numeroOS, cliente: MOCK_OS.cliente,
      endereco: MOCK_OS.endereco, telefone: MOCK_OS.telefone, email: MOCK_OS.email,
      responsavel: MOCK_OS.responsavel, dataOS: MOCK_OS.data, dataEntregaPrevista: M.dOff(20), dataEntregaReal:null,
      valorBruto: brutoTotal, valorLiquido: vendido, status:"EM_PRODUCAO", criadaEm: M.todayISO(),
      ambientes,
    };
  };
})();
