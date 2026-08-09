/* ============================================================
   PÁGINA: Nova Obra — tela única (seção 6), leitura real de PDF
   (Ordem de Serviço + Orçamento) via js/pdf-import.js
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  // ---------- helpers sobre os dados extraídos (w.dados) ----------
  function ambientesAgrupados(dados){
    const map = {};
    dados.itensOrc.forEach(it=>{ (map[it.ambiente] = map[it.ambiente]||[]).push(it); });
    return map;
  }
  function valorBrutoTotal(dados){ return dados.itensOrc.reduce((s,i)=>s+i.valorBruto,0); }
  function componentesEspeciaisFlat(dados){
    const out = [];
    dados.ambientes.forEach(a=> a.itens.forEach(it=>{
      (it.materiaisEspeciais||[]).forEach(m=> out.push(`${m.nome} — ${it.item.slice(0,40)}${it.item.length>40?"…":""} (${a.nome})`));
    }));
    return out;
  }

  M.Pages.novaObra = function(){
    const w = M.UIState.novaObra;
    const dados = w.dados;

    const dropzone = (kind, label, nomeArquivo)=> `
      <div class="dropzone" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')"
           ondrop="event.preventDefault();this.classList.remove('over');Act.novaObraArquivoSelecionado('${kind}', event.dataTransfer.files[0])"
           onclick="document.getElementById('novaObraInput_${kind}').click()" style="padding:22px 16px;">
        <input type="file" accept="application/pdf" id="novaObraInput_${kind}" style="display:none"
               onchange="Act.novaObraArquivoSelecionado('${kind}', this.files[0])">
        ${UI.icon('list',22)}
        ${nomeArquivo? `<div style="margin-top:6px;"><b>${UI.esc(nomeArquivo)}</b><div class="small muted">arquivo recebido — clique para trocar</div></div>`
               : `<div style="margin-top:6px;"><b>${label}</b><div class="small muted">arraste o PDF aqui ou clique para escolher o arquivo</div></div>`}
      </div>`;

    const html = `
      <div class="oneform-section">
        <h2><span class="num-badge">1</span>Documentos</h2>
        <div class="grid-2">
          ${dropzone("os","Ordem de Serviço (PDF)", w.osFileName)}
          ${dropzone("orc","Orçamento (PDF)", w.orcFileName)}
        </div>
        ${(w.osFileName || w.orcFileName) && !w.lido ? `
          <button class="btn primary" style="margin-top:14px;" ${w.lendo?'disabled':''} onclick="Act.novaObraLerPdf()">
            ${w.lendo? UI.icon('refresh',14)+' Lendo PDF…' : UI.icon('search',14)+' Ler documento(s)'}
          </button>`:""}
        ${w.erro? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);margin-top:12px;">${UI.icon('alert',13)} ${UI.esc(w.erro)}</div>`:""}
        ${!w.lido ? `<p class="small muted" style="margin-top:10px;">Envie pelo menos um dos dois PDFs (o Orçamento já traz valores; a OS sozinha traz só os itens, sem valor — dá pra ajustar manualmente depois). As seções abaixo aparecem depois da leitura.</p>`:""}
        ${w.lido? `<button class="btn sm" style="margin-top:10px;" onclick="Act.novaObraRecomecar()">${UI.icon('refresh',12)} Ler outro arquivo</button>`:""}
      </div>

      ${w.lido && dados ? (()=>{
        const grupos = ambientesAgrupados(dados);
        const brutoTotal = valorBrutoTotal(dados);
        const vendido = dados.valorFinalVendido || brutoTotal;
        const fator = brutoTotal>0 ? vendido/brutoTotal : 1;
        const componentesFlat = componentesEspeciaisFlat(dados);

        const somaLiquidoAjustado = Object.keys(grupos).reduce((s,nome)=>{
          const bruto = grupos[nome].reduce((x,i)=>x+i.valorBruto,0);
          const auto = Math.round(bruto*fator);
          return s + (w.ambientesAjuste[nome]!=null? w.ambientesAjuste[nome] : auto);
        },0);
        const fecha = somaLiquidoAjustado === vendido;

        return `
      <div class="oneform-section">
        <h2><span class="num-badge">2</span>Dados extraídos</h2>
        <p class="small muted">Confira — a leitura é automática (texto do PDF), então vale a pena revisar antes de criar a obra.</p>
        <div class="grid-2">
          <div class="card pad">
            <p><b>${UI.esc(dados.numeroOS||"(número não identificado)")}</b> — ${UI.esc(dados.cliente||"(cliente não identificado)")}</p>
            <p class="small muted">Responsável: ${UI.esc(dados.responsavel||"—")}</p>
            <p class="small muted">${UI.esc(dados.telefone||"sem telefone")} · ${UI.esc(dados.email||"sem email")}</p>
            <p class="small muted">Entrega prevista: ${dados.dataEntregaPrevista? C.fmtDate(dados.dataEntregaPrevista) : "não identificada — ajuste depois na obra"}</p>
            <div class="hr"></div>
            <div class="field"><label>Endereço (não veio no PDF — preencha aqui)</label>
              <input value="${UI.esc(w.enderecoManual||'')}" placeholder="Rua, número — bairro, cidade/UF" oninput="Act.novaObraSetEndereco(this.value)"></div>
          </div>
          <div class="card pad">
            <div class="card-title">Componentes especiais identificados</div>
            <p class="small muted" style="margin-top:-4px;">Detectado por palavra-chave no texto (vidro, espelho, serralheria, LED, pintura, estofado, material do cliente) — revise depois na obra, dá pra adicionar/remover em cada móvel.</p>
            ${componentesFlat.length? `<ul style="margin:0 0 0 18px; font-size:12.5px; line-height:1.9;">${componentesFlat.map(c=>`<li>${UI.esc(c)}</li>`).join("")}</ul>`
              : `<p class="small muted">Nenhum identificado automaticamente.</p>`}
          </div>
        </div>
      </div>

      <div class="oneform-section">
        <h2><span class="num-badge">3</span>Valores — bruto × real vendido</h2>
        <div class="flex-gap" style="gap:20px;flex-wrap:wrap;margin-bottom:12px;">
          <div><div class="small muted">Valor bruto</div><b style="font-size:16px;">${C.fmtBRL(brutoTotal)}</b></div>
          <div><div class="small muted">Valor real vendido</div>
            <input type="number" step="100" value="${vendido}" style="font-size:15px;font-weight:700;width:140px;padding:4px 6px;border-radius:6px;border:1px solid var(--border-strong);"
              onchange="Act.novaObraSetVendido(this.value)"></div>
          <div><div class="small muted">Desconto</div><b style="font-size:16px;">${C.fmtBRL(brutoTotal-vendido)} (${brutoTotal>0?Math.round((1-fator)*10000)/100:0}%)</b></div>
        </div>
        <p class="small muted">O orçamento pode ter sido majorado antes da negociação — por isso a produção nunca usa o valor bruto, e sim o valor real vendido, rateado proporcionalmente por ambiente (fator líquido = ${Math.round(fator*1000)/1000}). Se o PDF não trouxe o valor vendido (só OS, ou orçamento sem proposta de pagamento), ajuste aqui.</p>
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
              <td><b>${UI.esc(nome)}</b></td>
              <td class="small muted">${grupos[nome].length} item(ns)</td>
              <td>${C.fmtBRL(bruto)}</td>
              <td><input type="number" step="100" value="${liquido}" style="width:130px;padding:6px 8px;border-radius:6px;border:1px solid var(--border-strong);"
                    onchange="Act.novaObraAjustarValor('${UI.esc(nome)}', this.value)"></td>
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
        ${dados.ambientes.map(a=>`
          <div class="card pad" style="margin-bottom:10px;">
            <div class="card-title">${UI.esc(a.nome)}</div>
            ${a.itens.map(it=>`<div class="check-row"><span class="label"><b>${UI.esc(it.item)}</b>${it.materiaisEspeciais&&it.materiaisEspeciais.length? ` <span class="small muted">— ${it.materiaisEspeciais.map(m=>m.nome).join(", ")}</span>`:""}</span></div>`).join("")}
          </div>`).join("")}
      </div>

      <div class="oneform-section">
        <h2><span class="num-badge">6</span>Resumo</h2>
        <p class="small">Ao confirmar, a obra <b>${UI.esc(dados.numeroOS||"(sem número)")} — ${UI.esc(dados.cliente||"(sem cliente)")}</b> entra no Kanban de Produção na etapa inicial, com os ambientes e valores revisados acima.</p>
        <button class="btn primary" style="margin-top:10px;" ${fecha? "" : "disabled"} onclick="Act.novaObraCriar()">${UI.icon('check',14)} Criar obra</button>
        ${!fecha? `<p class="small critical" style="margin-top:6px;color:var(--critical);">Ajuste os valores líquidos por ambiente até a soma fechar com o valor vendido antes de criar a obra.</p>`:""}
      </div>
      `; })() : ""}
    `;

    return {title:"Nova Obra", crumb:"Uma tela só — documentos, valores, ambientes e resumo", narrow:true, html};
  };

  // monta o objeto de obra a partir do estado da tela única (chamado por Act.novaObraCriar)
  M.Pages.novaObraMontar = function(){
    const w = M.UIState.novaObra;
    const dados = w.dados;
    const brutoTotal = valorBrutoTotal(dados);
    const vendido = dados.valorFinalVendido || brutoTotal;
    const fator = brutoTotal>0 ? vendido/brutoTotal : 1;
    const grupos = ambientesAgrupados(dados);

    const ambientes = dados.ambientes.map(a=>{
      const itens = grupos[a.nome]||[];
      const brutoAmb = itens.reduce((s,i)=>s+i.valorBruto,0);
      const liquidoAmbAuto = Math.round(brutoAmb*fator);
      const liquidoAmb = w.ambientesAjuste[a.nome]!=null ? w.ambientesAjuste[a.nome] : liquidoAmbAuto;
      const moveis = a.itens.map(it=>{
        const itemOrc = itens.find(x=>x.item===it.item);
        const valorItem = itemOrc ? Math.round(itemOrc.valorBruto*fator*(liquidoAmb/Math.max(1,liquidoAmbAuto))) : Math.round(liquidoAmb/Math.max(1,a.itens.length));
        return {
          id:M.uid("mov"), nome:it.item, etapa:0, responsavel:dados.responsavel||"",
          // "Ações da etapa" (plano "obra no centro", fase 2): não existe mais checklist
          // genérico por móvel (Corpo MDF, Ferragens etc.) — a fábrica não executa isso
          // separado, o trabalho real já é coberto pelas ações padrão de cada etapa
          // (TAREFAS_PADRAO_ETAPA). Só materiais especiais (vidro, espelho, serralheria...)
          // viram componente crítico — exceção, não checklist de todo mundo.
          componentesCriticosIniciais: it.materiaisEspeciais||[],
          componentesCriticos:[], dataEntradaEtapa:M.todayISO(),
          dataPrevista: dados.dataEntregaPrevista || M.dOff(20), dataReal:null, valorLiquido:valorItem, requisitosOverride:{},
        };
      });
      return { id:M.uid("amb"), nome:a.nome, valorBrutoPct: brutoTotal>0 ? brutoAmb/brutoTotal : 0, valorBruto:brutoAmb, valorLiquido:liquidoAmb, moveis };
    });

    return {
      id: M.uid("obra"), numeroOS: dados.numeroOS || ("OS "+M.uid("").replace("-","")), cliente: dados.cliente || "Cliente não identificado",
      endereco: w.enderecoManual || dados.endereco || "", telefone: dados.telefone || "", email: dados.email || "",
      responsavel: dados.responsavel || "", dataOS: dados.data || M.todayISO(),
      dataEntregaPrevista: dados.dataEntregaPrevista || M.dOff(20), dataEntregaReal:null,
      valorBruto: brutoTotal, valorLiquido: vendido, status:"EM_PRODUCAO", criadaEm: M.todayISO(),
      ambientes,
    };
  };
})();
