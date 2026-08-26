/* ============================================================
   PÁGINA: Nova Obra V2 — wizard em 5 etapas (FASE 7.5, Parte A)
   Início → Dados → Ambientes e móveis → Revisão → Ativar.

   Documento (OS/Orçamento em PDF) NUNCA é obrigatório (item 2 do pedido):
   a etapa Início oferece "Importar documentos", "Criar manualmente" ou
   "Continuar rascunho" — os três caminhos convergem nas mesmas etapas
   seguintes. A leitura do PDF (js/pdf-import.js) só preenche o que
   conseguiu identificar de verdade; campo que não veio fica em branco
   pra revisão humana (item 3 — nunca inventar cliente/OS/data/
   responsável/ambiente/móvel/valor/prazo).

   Hierarquia estritamente CLIENTE→OBRA→AMBIENTE→MÓVEL (item 5) — sem
   peça/operação/máquina, isso é domínio do DinaBox.

   Convergência import↔manual: a etapa "Estrutura" ainda mostra UI
   diferente por modo (import: rateio bruto→líquido calculado a partir
   do PDF; manual: montagem direta de ambiente/móvel), mas ao avançar
   pra Revisão (Act.novaObraProximaEtapa) o modo import é convertido pra
   a mesma lista editável que o modo manual já usa (w.ambientesManual —
   ver M.Pages.novaObraSincronizarEstruturaImportada). Da Revisão em
   diante os dois modos compartilham exatamente o mesmo caminho de
   edição (corrigir/excluir/adicionar ambiente/móvel, mover móvel entre
   ambientes — item 4) e persistência (M.Pages.novaObraMontarManual +
   Store.criarObra/ativarObra/atualizarEstruturaRascunho), sem duplicar
   lógica entre os dois modos.
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  // ---------- helpers sobre os dados extraídos do PDF (w.dados) ----------
  function ambientesAgrupados(dados){
    const map = {};
    dados.itensOrc.forEach(it=>{ (map[it.ambiente] = map[it.ambiente]||[]).push(it); });
    return map;
  }
  function valorBrutoTotal(dados){
    return dados.valorBrutoTotal!=null ? Number(dados.valorBrutoTotal) : dados.itensOrc.reduce((s,i)=>s+(Number(i.valorBruto)||0),0);
  }
  function rateioAutomatico(grupos, vendido, brutoTotal){
    const nomes = Object.keys(grupos);
    const totalItens = nomes.reduce((s,n)=>s+grupos[n].length,0) || nomes.length || 1;
    const out = {};
    let acumulado = 0;
    nomes.forEach((nome,idx)=>{
      const bruto = grupos[nome].reduce((s,i)=>s+(Number(i.valorBruto)||0),0);
      const peso = brutoTotal>0 ? bruto/brutoTotal : grupos[nome].length/totalItens;
      const valor = idx===nomes.length-1 ? vendido-acumulado : Math.round(vendido*peso*100)/100;
      out[nome] = Math.round(valor*100)/100;
      acumulado += out[nome];
    });
    return out;
  }
  // CORREÇÃO (achado de auditoria — Fase 7.5): o código antigo usava
  // "c.chave" como chave de identificação do checkbox de componente
  // especial, mas js/pdf-import.js nunca gerou esse campo — todo checkbox
  // ficava com a mesma chave "undefined" (na prática, todos se comportavam
  // como um só). Chave estável de verdade: tipo do material + item ao qual
  // ele pertence (um mesmo item pode ter mais de um material especial —
  // ex. vidro E espelho no mesmo móvel — por isso não basta o item sozinho).
  function chaveComponente(tipo, descricaoItem){ return String(tipo)+"::"+String(descricaoItem); }
  function componentesEspeciaisFlat(dados){
    const out = [];
    dados.ambientes.forEach(a=> a.itens.forEach(it=>{
      (it.materiaisEspeciais||[]).forEach(m=> out.push(Object.assign({},m,{
        chave: chaveComponente(m.tipo, it.item), descricaoItem:it.item, ambiente:a.nome,
      })));
    }));
    return out;
  }

  // Carrega um rascunho já salvo (Store) de volta pro estado do wizard
  // (UIState), pra pessoa continuar de onde parou. Sempre entra direto na
  // etapa "dados" com modo "manual" — a partir daqui rascunho e criação
  // manual/import convertida usam exatamente a mesma estrutura editável
  // (ver comentário no topo do arquivo), então retomar um rascunho não
  // precisa saber se ele nasceu de PDF ou não.
  function hidratarWizardComRascunho(o){
    M.UIState.novaObra = {
      obraId:o.id, step:"dados", modo:"manual",
      osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
      lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
      nomeManual:o.nome||"", numeroOSManual:o.numeroOS||"", clienteManual:o.cliente||"",
      responsavelProducao:o.responsavel||"", enderecoManual:o.endereco||"",
      observacoesManual:o.observacoes||"", dataEntregaPrevistaManual:o.dataEntregaPrevista||"",
      componentesSelecionados:{},
      ambientesManual: (o.ambientes||[]).map(a=>({
        tid:a.id, nome:a.nome, valorBrutoPct:a.valorBrutoPct||0, valorBruto:a.valorBruto||0, valorLiquido:a.valorLiquido||0,
        moveis:(a.moveis||[]).map(m=>({tid:m.id, nome:m.nome, valorLiquido:m.valorLiquido||0, componentesCriticosIniciais:m.componentesCriticosIniciais||[]})),
      })),
      osDuplicadaConfirmada:false,
      // rascunho retomado entra sempre em modo:"manual" (w.dados fica null),
      // então a sincronização de import nem chegaria a rodar — marca já
      // sincronizado por segurança/consistência com o resto do estado.
      estruturaImportadaSincronizada:true,
    };
  }

  // Converte o rateio calculado a partir do PDF (modo import) pra mesma
  // lista editável do modo manual (w.ambientesManual) — chamado ao sair da
  // etapa "estrutura" (Act.novaObraProximaEtapa).
  //
  // CORREÇÃO PÓS-ENTREGA (item 2) — "EXTRAÇÃO É SEMENTE. EDIÇÃO HUMANA É
  // SOBERANA.": isto SÓ roda na primeira inicialização (guardado por
  // w.estruturaImportadaSincronizada). Antes desta correção, a função era
  // idempotente-por-recomputação — reconstruía do zero toda vez que a
  // etapa "estrutura" era deixada em modo import, mesmo numa segunda
  // passagem — e isso apagava qualquer edição manual feita depois na
  // Revisão (renomear, mover, remover, adicionar móvel/ambiente) assim que
  // a pessoa voltava pra Estrutura e avançava de novo. Agora, depois da
  // primeira conversão, voltar/avançar entre Estrutura e Revisão nunca mais
  // reconstrói a partir do PDF — se no futuro for necessário reaplicar os
  // dados extraídos, isso precisa ser uma ação explícita separada (ex.: um
  // botão "recarregar do PDF" com confirmação), nunca automática.
  M.Pages.novaObraSincronizarEstruturaImportada = function(){
    const w = M.UIState.novaObra;
    if(w.estruturaImportadaSincronizada) return;
    const dados = w.dados; if(!dados) return;
    const grupos = ambientesAgrupados(dados);
    const brutoTotal = valorBrutoTotal(dados);
    const vendido = dados.valorFinalVendido!=null ? Number(dados.valorFinalVendido) : brutoTotal;
    const fator = brutoTotal>0 ? vendido/brutoTotal : 0;
    const rateioAuto = rateioAutomatico(grupos, vendido, brutoTotal);
    w.ambientesManual = dados.ambientes.map(a=>{
      const itens = grupos[a.nome]||[];
      const liquidoAmbAuto = rateioAuto[a.nome]||0;
      const liquidoAmb = w.ambientesAjuste[a.nome]!=null ? w.ambientesAjuste[a.nome] : liquidoAmbAuto;
      return {
        tid:M.uid("amb"), nome:a.nome, valorBrutoPct: vendido>0 ? liquidoAmb/vendido : 0, valorBruto: liquidoAmb, valorLiquido: liquidoAmb,
        moveis: a.itens.map(it=>{
          const itemOrc = itens.find(x=>x.item===it.item);
          const valorItem = brutoTotal>0 && itemOrc
            ? Math.round(itemOrc.valorBruto*fator*(liquidoAmb/Math.max(1,liquidoAmbAuto)))
            : Math.round(liquidoAmb/Math.max(1,a.itens.length||1));
          return {
            tid:M.uid("mov"), nome: it.item, valorLiquido: (brutoTotal>0||vendido>0) ? valorItem : 0,
            componentesCriticosIniciais: (it.materiaisEspeciais||[])
              .filter(c=>w.componentesSelecionados[chaveComponente(c.tipo, it.item)]===true)
              .map(c=>({nome:c.nome, tipo:c.tipo})),
          };
        }),
      };
    });
    w.estruturaImportadaSincronizada = true;
  };

  // Monta o objeto de obra pronto pra Store.criarObra/atualizarEstruturaRascunho
  // — único "montador" agora (import e manual convergem em w.ambientesManual
  // antes de chegar aqui, ver comentário no topo do arquivo).
  M.Pages.novaObraMontarManual = function(){
    const w = M.UIState.novaObra;
    const ambientes = (w.ambientesManual||[]).map(a=>{
      const ambId = a.tid && String(a.tid).indexOf("amb-")===0 ? a.tid : M.uid("amb");
      const moveis = (a.moveis||[]).map(m=>{
        const movId = m.tid && String(m.tid).indexOf("mov-")===0 ? m.tid : M.uid("mov");
        return {
          id:movId, nome:m.nome, responsavel:w.responsavelProducao||"",
          componentesCriticosIniciais: m.componentesCriticosIniciais||[],
          componentesCriticos:[],
          dataPrevista: w.dataEntregaPrevistaManual || null, dataReal:null,
          valorLiquido: m.valorLiquido||0, requisitosOverride:{},
        };
      });
      return { id:ambId, nome:a.nome, valorBrutoPct:a.valorBrutoPct||0, valorBruto:a.valorBruto||0, valorLiquido:a.valorLiquido||0, moveis };
    });
    const somaLiquida = ambientes.reduce((s,a)=>s+(a.valorLiquido||0),0);
    return {
      id: M.uid("obra"),
      numeroOS: String(w.numeroOSManual||"").trim(),
      cliente: String(w.clienteManual||"").trim(),
      nome: String(w.nomeManual||"").trim() || String(w.clienteManual||"").trim(),
      endereco: w.enderecoManual || "",
      telefone: (w.dados&&w.dados.telefone) || "", email: (w.dados&&w.dados.email) || "",
      responsavel: w.responsavelProducao || "", responsavelDocumento: (w.dados&&w.dados.responsavel) || "",
      observacoes: w.observacoesManual || "",
      dataOS: (w.dados&&w.dados.data) || null,
      dataEntregaPrevista: w.dataEntregaPrevistaManual || null, dataEntregaReal:null,
      valorBruto: somaLiquida, valorLiquido: somaLiquida,
      ambientes,
    };
  };

  // Mantido por compatibilidade — monta o objeto de obra em modo import
  // direto a partir de w.dados/rateio, SEM passar por w.ambientesManual.
  // A tela do wizard não chama mais isto (usa
  // novaObraSincronizarEstruturaImportada + novaObraMontarManual, que
  // convergem os dois modos numa lista editável antes de persistir — ver
  // comentário no topo do arquivo); mantido como utilitário de conversão
  // bruta pra quem só precisa do objeto final a partir dos dados extraídos
  // (ex.: suíte de testes existente desde a Fase 0).
  M.Pages.novaObraMontar = function(){
    const w = M.UIState.novaObra;
    const dados = w.dados;
    const brutoTotal = valorBrutoTotal(dados);
    const vendido = dados.valorFinalVendido!=null ? Number(dados.valorFinalVendido) : brutoTotal;
    const fator = brutoTotal>0 ? vendido/brutoTotal : 0;
    const grupos = ambientesAgrupados(dados);
    const rateioAuto = rateioAutomatico(grupos, vendido, brutoTotal);

    const ambientes = dados.ambientes.map(a=>{
      const itens = grupos[a.nome]||[];
      const brutoAmb = itens.reduce((s,i)=>s+(Number(i.valorBruto)||0),0);
      const liquidoAmbAuto = rateioAuto[a.nome]||0;
      const liquidoAmb = w.ambientesAjuste[a.nome]!=null ? w.ambientesAjuste[a.nome] : liquidoAmbAuto;
      const moveis = a.itens.map(it=>{
        const itemOrc = itens.find(x=>x.item===it.item);
        const valorItem = brutoTotal>0 && itemOrc
          ? Math.round(itemOrc.valorBruto*fator*(liquidoAmb/Math.max(1,liquidoAmbAuto)))
          : Math.round(liquidoAmb/Math.max(1,a.itens.length||1));
        return {
          id:M.uid("mov"), nome:it.item, responsavel:w.responsavelProducao,
          componentesCriticosIniciais: (it.materiaisEspeciais||[])
            .filter(c=>w.componentesSelecionados[c.chave || chaveComponente(c.tipo, it.item)]===true)
            .map(c=>({nome:c.nome,tipo:c.tipo})),
          componentesCriticos:[], dataEntradaEtapa:M.todayISO(),
          dataPrevista: w.dataEntregaPrevistaManual || dados.dataEntregaPrevista || null, dataReal:null,
          valorLiquido:(brutoTotal>0||vendido>0)?valorItem:0, requisitosOverride:{},
        };
      });
      return { id:M.uid("amb"), nome:a.nome, valorBrutoPct: vendido>0 ? liquidoAmb/vendido : 0, valorBruto:brutoTotal>0?brutoAmb:liquidoAmb, valorLiquido:liquidoAmb, moveis };
    });

    return {
      id: M.uid("obra"), numeroOS: String(w.numeroOSManual||"").trim(), cliente: String(w.clienteManual||"").trim(),
      nome: String(w.nomeManual||"").trim() || String(w.clienteManual||"").trim(),
      endereco: w.enderecoManual || dados.endereco || "", telefone: dados.telefone || "", email: dados.email || "",
      responsavel: w.responsavelProducao, responsavelDocumento:dados.responsavel||"", dataOS: dados.data || null,
      dataEntregaPrevista: w.dataEntregaPrevistaManual || dados.dataEntregaPrevista || null, dataEntregaReal:null,
      valorBruto: brutoTotal>0?brutoTotal:vendido, valorLiquido: vendido, ambientes,
    };
  };

  // ---------- chrome do wizard (indicador de etapa + rodapé de ações) ----------
  const ETAPAS = [
    {key:"inicio", label:"Início"},
    {key:"dados", label:"Dados"},
    {key:"estrutura", label:"Ambientes e móveis"},
    {key:"revisao", label:"Revisão"},
    {key:"ativar", label:"Ativar"},
  ];
  function stepIndicatorHtml(stepAtual){
    const iAtual = ETAPAS.findIndex(e=>e.key===stepAtual);
    return `<div class="wizard-steps">${ETAPAS.map((e,i)=>{
      const cls = i===iAtual ? "active" : (i<iAtual ? "done" : "");
      const dot = i<iAtual ? UI.icon('check',12) : (i+1);
      const sep = i<ETAPAS.length-1 ? `<span class="wizard-sep"></span>` : "";
      return `<span class="wizard-step ${cls}"><span class="wizard-dot">${dot}</span><span class="wizard-label">${UI.esc(e.label)}</span></span>${sep}`;
    }).join("")}</div>`;
  }
  function rodapeHtml(stepAtual, opts){
    opts = opts||{};
    const podeSalvarRascunho = stepAtual!=="inicio" && M.Store.pode("obra.criar");
    const esquerda = stepAtual==="inicio"
      ? `<button class="btn" onclick="Act.novaObraCancelar()">${UI.icon('x',13)} Cancelar</button>`
      : `<button class="btn" onclick="Act.novaObraVoltarEtapa()">${UI.icon('chevron-left',13)} Voltar</button>`;
    const direita = [];
    if(podeSalvarRascunho) direita.push(`<button class="btn" onclick="Act.novaObraSalvarRascunho()">${UI.icon('download',13)} Salvar rascunho</button>`);
    if(stepAtual==="ativar"){
      direita.push(`<button class="btn primary" ${opts.podeAtivar?'':'disabled'} onclick="Act.novaObraAtivar()">${UI.icon('check',14)} Ativar obra</button>`);
    } else if(stepAtual!=="inicio"){
      direita.push(`<button class="btn primary" onclick="Act.novaObraProximaEtapa()">Continuar ${UI.icon('chevron-right',13)}</button>`);
    }
    return `<div class="wizard-actions">${esquerda}<div class="wizard-actions-right">${direita.join("")}</div></div>`;
  }

  // ---------- etapa: Início ----------
  function etapaInicioHtml(){
    const rascunhos = M.Store.pode("obra.criar") ? M.Store.obrasRascunho().slice(0,8) : [];
    return `
      <div class="grid-2">
        <div class="card pad opcao-inicio" onclick="Act.novaObraEscolherModo('import')">
          ${UI.icon('upload',22)}
          <div class="card-title" style="margin-top:10px;text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink);">Importar documentos</div>
          <p class="small muted">Envie a Ordem de Serviço e/ou o Orçamento (PDF). A leitura preenche o que conseguir identificar — o resto fica em branco pra você revisar, nada é inventado.</p>
        </div>
        <div class="card pad opcao-inicio" onclick="Act.novaObraEscolherModo('manual')">
          ${UI.icon('plus',22)}
          <div class="card-title" style="margin-top:10px;text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink);">Criar manualmente</div>
          <p class="small muted">Sem PDF — preencha os dados e monte os ambientes/móveis direto na tela.</p>
        </div>
      </div>
      ${rascunhos.length? `
      <div class="card pad" style="margin-top:16px;">
        <div class="card-title">Rascunhos em andamento</div>
        ${rascunhos.map(o=>`<div class="check-row">
          <span class="label"><b>${UI.esc(o.nome||o.cliente||"(sem nome)")}</b> <span class="small muted">${UI.esc(o.cliente||"sem cliente")} · criado por ${UI.esc(o.criadoPor||"—")} em ${o.criadoEm?C.fmtDate(o.criadoEm):"—"}</span></span>
          <button class="btn sm" onclick="Act.go('#/nova-obra/${o.id}')">Continuar</button>
        </div>`).join("")}
      </div>`:""}
    `;
  }

  // ---------- etapa: Dados (identificação — comum a import e manual) ----------
  function camposIdentificacaoHtml(w){
    const responsavelValido = M.COLABORADORES.some(c=>c.ativo!==false && c.nome===w.responsavelProducao);
    const numeroOSAtual = String(w.numeroOSManual||"").trim();
    // CORREÇÃO PÓS-ENTREGA (item 1) — rascunho retomado (w.obraId já
    // existe) ainda precisa da checagem; só a própria obra é excluída.
    const duplicada = numeroOSAtual ? M.Store.getObraByNumeroOS(numeroOSAtual, w.obraId) : null;
    return `
      <div class="card pad">
        <div class="grid-2">
          <div class="field"><label>Nome da obra</label>
            <input value="${UI.esc(w.nomeManual||'')}" placeholder="Ex.: Apartamento 402 — Ed. Aurora" onchange="Act.novaObraSetCampo('nomeManual',this.value)"></div>
          <div class="field"><label>Número da OS</label>
            <input value="${UI.esc(w.numeroOSManual||'')}" placeholder="Ex.: OS 2026/336" onchange="Act.novaObraSetCampo('numeroOSManual',this.value)"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Cliente</label>
            <input value="${UI.esc(w.clienteManual||'')}" placeholder="Nome do cliente" onchange="Act.novaObraSetCampo('clienteManual',this.value)"></div>
          <div class="field"><label>Responsável pela produção</label>
            <select onchange="Act.novaObraSetCampo('responsavelProducao',this.value)">
              <option value="">Selecione um colaborador...</option>
              ${M.COLABORADORES.filter(c=>c.ativo!==false).map(c=>`<option value="${UI.esc(c.nome)}" ${w.responsavelProducao===c.nome?'selected':''}>${UI.esc(c.nome)}</option>`).join("")}
            </select>
            ${w.responsavelProducao && !responsavelValido? `<div class="small" style="color:var(--critical);margin-top:4px;">Colaborador não corresponde à equipe cadastrada.</div>`:""}
          </div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Data prevista de entrega</label>
            <input type="date" value="${UI.esc(w.dataEntregaPrevistaManual||'')}" onchange="Act.novaObraSetCampo('dataEntregaPrevistaManual',this.value)"></div>
          <div class="field"><label>Endereço</label>
            <input value="${UI.esc(w.enderecoManual||'')}" placeholder="Rua, número — bairro, cidade/UF" onchange="Act.novaObraSetCampo('enderecoManual',this.value)"></div>
        </div>
        <div class="field"><label>Observações</label>
          <textarea placeholder="Observações gerais da obra..." onchange="Act.novaObraSetCampo('observacoesManual',this.value)">${UI.esc(w.observacoesManual||'')}</textarea></div>
        ${duplicada? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);">
          ${UI.icon('alert',13)} Já existe uma obra com esse número de OS: <b>${UI.esc(duplicada.nome||duplicada.cliente)}</b>
          — cliente ${UI.esc(duplicada.cliente||"—")}, responsável ${UI.esc(duplicada.responsavel||"—")}, status ${UI.esc(duplicada.status||M.Store.faseMacroDeObra(duplicada).label||"—")}.
          <a href="#/obra/${duplicada.id}">Abrir obra existente</a>. Isso não bloqueia — mas você vai precisar confirmar "mesmo assim continuar" na etapa Ativar.
        </div>`:""}
      </div>
    `;
  }
  function etapaDadosHtml(w){
    if(w.modo!=="import") return camposIdentificacaoHtml(w);
    // modo import: dropzones + leitura de PDF antes dos campos.
    const dropzone = (kind, label, nomeArquivo)=> `
      <div class="dropzone" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')"
           ondrop="event.preventDefault();this.classList.remove('over');Act.novaObraArquivoSelecionado('${kind}', event.dataTransfer.files[0])"
           onclick="document.getElementById('novaObraInput_${kind}').click()" style="padding:22px 16px;">
        <input type="file" accept="application/pdf" id="novaObraInput_${kind}" style="display:none"
               onchange="Act.novaObraArquivoSelecionado('${kind}', this.files[0])">
        ${UI.icon('file-text',22)}
        ${nomeArquivo? `<div style="margin-top:6px;"><b>${UI.esc(nomeArquivo)}</b><div class="small muted">arquivo recebido — clique para trocar</div></div>`
               : `<div style="margin-top:6px;"><b>${label}</b><div class="small muted">arraste o PDF aqui ou clique para escolher o arquivo</div></div>`}
      </div>`;
    return `
      <div class="card pad" style="margin-bottom:16px;">
        <div class="grid-2">
          ${dropzone("os","Ordem de Serviço (PDF)", w.osFileName)}
          ${dropzone("orc","Orçamento (PDF)", w.orcFileName)}
        </div>
        ${(w.osFileName || w.orcFileName) ? `
          <button class="btn primary" style="margin-top:14px;" ${w.lendo?'disabled':''} onclick="Act.novaObraLerPdf()">
            ${w.lendo? UI.icon('refresh',14)+' Lendo PDF…' : UI.icon('search',14)+' Ler documento(s)'}
          </button>`:""}
        ${w.erro? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);margin-top:12px;">${UI.icon('alert',13)} ${UI.esc(w.erro)}</div>`:""}
        ${!w.lido ? `<p class="small muted" style="margin-top:10px;">Envie pelo menos um dos dois PDFs. Documento não é obrigatório — você pode preencher tudo manualmente abaixo mesmo sem ler nenhum PDF.</p>`:""}
        ${w.lido? `<p class="small" style="margin-top:10px;color:var(--good);">${UI.icon('check-circle',13)} Documento lido — confira e complete os campos abaixo.</p>`:""}
      </div>
      ${camposIdentificacaoHtml(w)}
    `;
  }

  // ---------- etapa: Ambientes e móveis (Estrutura) ----------
  function builderAmbientesHtml(w, idPrefix){
    const inputAddAmb = idPrefix+"_addAmb";
    return `
      <div class="card pad">
        <div class="card-title">Ambientes e móveis</div>
        ${w.ambientesManual.length? w.ambientesManual.map(a=>{
          const inputAddMov = idPrefix+"_addMov_"+a.tid;
          return `<div class="ambiente-builder">
            <div class="flex-between" style="margin-bottom:6px;">
              <b>${UI.esc(a.nome)}</b>
              <button class="btn-icon" title="Remover ambiente" onclick="Act.novaObraManualRemoverAmbiente('${a.tid}')">${UI.icon('trash',13)}</button>
            </div>
            ${a.moveis.map(m=>`<div class="movel-row">
              <span class="small muted">${UI.icon('package',13)}</span>
              <span class="label">${UI.esc(m.nome)}</span>
              <button class="btn-icon" title="Remover móvel" onclick="Act.novaObraManualRemoverMovel('${a.tid}','${m.tid}')">${UI.icon('trash',12)}</button>
            </div>`).join("")}
            <div class="flex-gap" style="margin-top:6px;">
              <input type="text" id="${inputAddMov}" placeholder="Nome do móvel — ex.: Cozinha planejada" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border-strong);font-size:12.5px;">
              <button class="btn sm" onclick="Act.novaObraManualAddMovel('${a.tid}','${inputAddMov}')">${UI.icon('plus',12)} Móvel</button>
            </div>
          </div><div class="hr"></div>`;
        }).join("") : `<p class="small muted" style="margin-bottom:10px;">Nenhum ambiente ainda — adicione o primeiro abaixo.</p>`}
        <div class="flex-gap">
          <input type="text" id="${inputAddAmb}" placeholder="Nome do ambiente — ex.: Cozinha, Quarto do casal" style="flex:1;padding:7px 9px;border-radius:6px;border:1px solid var(--border-strong);font-size:13px;">
          <button class="btn sm" onclick="Act.novaObraManualAddAmbiente('${inputAddAmb}')">${UI.icon('plus',13)} Ambiente</button>
        </div>
      </div>
    `;
  }
  function etapaEstruturaHtml(w){
    if(w.modo!=="import"){
      return builderAmbientesHtml(w, "estrutura");
    }
    const dados = w.dados;
    if(!dados){
      return `<div class="help-banner">${UI.icon('alert',13)} Volte pra etapa Dados e leia um documento primeiro — ou escolha "Criar manualmente" desde o Início.</div>`;
    }
    const grupos = ambientesAgrupados(dados);
    const brutoTotal = valorBrutoTotal(dados);
    const vendido = dados.valorFinalVendido!=null ? Number(dados.valorFinalVendido) : brutoTotal;
    const fator = brutoTotal>0 ? vendido/brutoTotal : 0;
    const rateioAuto = rateioAutomatico(grupos, vendido, brutoTotal);
    const componentesFlat = componentesEspeciaisFlat(dados);
    const somaLiquidoAjustado = Object.keys(grupos).reduce((s,nome)=>{
      const auto = rateioAuto[nome]||0;
      return s + (w.ambientesAjuste[nome]!=null? w.ambientesAjuste[nome] : auto);
    },0);
    const fecha = vendido>0 && Math.abs(somaLiquidoAjustado-vendido)<=0.01;

    return `
      <div class="oneform-section" style="padding-top:0;">
        <h2><span class="num-badge">1</span>Valores — bruto × real vendido</h2>
        ${brutoTotal<=0? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);margin-bottom:12px;">${UI.icon('alert',13)} Este documento não trouxe preços. Informe um valor real vendido maior que zero; o app faz um rateio inicial pela quantidade de itens de cada ambiente, pra você revisar.</div>`:""}
        <div class="flex-gap" style="gap:20px;flex-wrap:wrap;margin-bottom:4px;">
          <div><div class="small muted">Valor bruto</div><b style="font-size:16px;">${C.fmtBRL(brutoTotal)}</b></div>
          <div><div class="small muted">Valor real vendido</div>
            <input type="number" min="0" step="100" value="${vendido}" style="font-size:15px;font-weight:700;width:140px;padding:4px 6px;border-radius:6px;border:1px solid var(--border-strong);"
              onchange="Act.novaObraSetVendido(this.value)"></div>
          <div><div class="small muted">Desconto</div><b style="font-size:16px;">${brutoTotal>0 ? `${C.fmtBRL(brutoTotal-vendido)} (${Math.round((1-fator)*10000)/100}%)` : "não calculável sem orçamento"}</b></div>
        </div>
      </div>
      <div class="oneform-section">
        <h2><span class="num-badge">2</span>Ambientes — rateio bruto → líquido</h2>
        <div class="table-scroll"><table class="tbl">
          <thead><tr><th>Ambiente</th><th>Itens</th><th>Valor bruto</th><th>Valor líquido (rateado)</th></tr></thead>
          <tbody>${Object.keys(grupos).map(nome=>{
            const bruto = grupos[nome].reduce((s,i)=>s+(Number(i.valorBruto)||0),0);
            const liquidoAuto = rateioAuto[nome]||0;
            const ajustado = w.ambientesAjuste[nome];
            const liquido = ajustado!=null ? ajustado : liquidoAuto;
            return `<tr>
              <td><b>${UI.esc(nome)}</b></td>
              <td class="small muted">${grupos[nome].length} item(ns)</td>
              <td>${C.fmtBRL(bruto)}</td>
              <td><input type="number" min="0" step="100" value="${liquido}" style="width:130px;padding:6px 8px;border-radius:6px;border:1px solid var(--border-strong);"
                    onchange="Act.novaObraAjustarValor('${UI.esc(nome)}', this.value)"></td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>
        <div class="flex-between" style="margin-top:10px;">
          <button class="btn sm" onclick="Act.novaObraResetAjustes()">${UI.icon('refresh',13)} Recalcular rateio automático</button>
          <span class="small" style="${fecha?'color:var(--good);font-weight:700;':'color:var(--critical);font-weight:700;'}">
            ${fecha? UI.icon('check-circle',13)+' soma dos ambientes fecha com o valor vendido' : `soma atual ${C.fmtBRL(somaLiquidoAjustado)} — ajuste até fechar em ${C.fmtBRL(vendido)}`}
          </span>
        </div>
      </div>
      <div class="oneform-section">
        <h2><span class="num-badge">3</span>Componentes especiais identificados</h2>
        <p class="small muted" style="margin-top:-6px;">Revise agora. Somente os itens marcados criam uma pendência de alta prioridade ao ativar a obra. LED nasce desmarcado por já fazer parte do próprio móvel, geralmente.</p>
        ${componentesFlat.length? `<div>${componentesFlat.map(c=>{
            const marcado = w.componentesSelecionados[c.chave]===true;
            return `<div class="check-row">
              <input type="checkbox" ${marcado?'checked':''} onchange="Act.novaObraToggleComponente('${UI.esc(c.chave)}')">
              <span class="label"><b>${UI.esc(c.nome)}</b> <span class="small muted">${UI.esc(c.descricaoItem.slice(0,55))}${c.descricaoItem.length>55?'…':''} · ${UI.esc(c.ambiente)}</span></span>
              <span class="chip ${marcado?'critical':'neutral'}">${marcado?'gera pendência':'não gera'}</span>
            </div>`;
          }).join("")}</div>`
          : `<p class="small muted">Nenhum identificado automaticamente.</p>`}
      </div>
      <div class="oneform-section" style="border-bottom:none;">
        <h2><span class="num-badge">4</span>Itens por ambiente</h2>
        ${dados.ambientes.map(a=>`
          <div class="card pad" style="margin-bottom:10px;">
            <div class="card-title" style="text-transform:none;letter-spacing:0;font-size:12.5px;">${UI.esc(a.nome)}</div>
            ${a.itens.map(it=>{
              const ativos = (it.materiaisEspeciais||[]).filter(c=>w.componentesSelecionados[chaveComponente(c.tipo, it.item)]===true);
              return `<div class="check-row"><span class="label"><b>${UI.esc(it.item)}</b>${ativos.length? ` <span class="small muted">— pendências: ${ativos.map(m=>UI.esc(m.nome)).join(", ")}</span>`:""}</span></div>`;
            }).join("")}
          </div>`).join("")}
      </div>
    `;
  }

  // ---------- etapa: Revisão ----------
  function etapaRevisaoHtml(w){
    const totalMoveis = (w.ambientesManual||[]).reduce((s,a)=>s+a.moveis.length,0);
    const inputAddAmb = "revisao_addAmb";
    return `
      <div class="card pad" style="margin-bottom:16px;">
        <div class="card-title">Identificação</div>
        <div class="grid-2">
          <div><div class="small muted">Cliente</div><b>${UI.esc(w.clienteManual||"—")}</b></div>
          <div><div class="small muted">Nome da obra</div><b>${UI.esc(w.nomeManual||w.clienteManual||"—")}</b></div>
        </div>
        <div class="grid-2">
          <div><div class="small muted">Número OS</div><b>${UI.esc(w.numeroOSManual||"—")}</b></div>
          <div><div class="small muted">Responsável</div><b>${UI.esc(w.responsavelProducao||"—")}</b></div>
        </div>
        <div class="grid-2">
          <div><div class="small muted">Data prevista de entrega</div><b>${w.dataEntregaPrevistaManual? C.fmtDate(w.dataEntregaPrevistaManual):"—"}</b></div>
          <div><div class="small muted">Endereço</div><b>${UI.esc(w.enderecoManual||"—")}</b></div>
        </div>
        ${w.observacoesManual? `<div style="margin-top:8px;"><div class="small muted">Observações</div><p class="small">${UI.esc(w.observacoesManual)}</p></div>`:""}
        <p class="small muted" style="margin-top:10px;">Precisa corrigir algo? <a href="javascript:void(0)" onclick="Act.novaObraIrParaEtapa('dados')">Voltar pra etapa Dados</a>.</p>
      </div>
      <div class="card pad">
        <div class="flex-between"><div class="card-title" style="margin-bottom:0;">Ambientes → Móveis</div><span class="small muted">${w.ambientesManual.length} ambiente(s) · ${totalMoveis} móvel(is)</span></div>
        ${!w.ambientesManual.length? `<p class="small muted" style="margin-top:10px;">Nenhum ambiente ainda.</p>`:""}
        ${w.ambientesManual.map(a=>`
          <div class="ambiente-builder" style="margin-top:12px;">
            <div class="flex-gap">
              <input type="text" value="${UI.esc(a.nome)}" onchange="Act.novaObraManualRenomearAmbiente('${a.tid}',this.value)" style="font-weight:700;flex:1;padding:5px 7px;border-radius:6px;border:1px solid transparent;" onfocus="this.style.borderColor='var(--border-strong)'" onblur="this.style.borderColor='transparent'">
              <button class="btn-icon" title="Remover ambiente" onclick="Act.novaObraManualRemoverAmbiente('${a.tid}')">${UI.icon('trash',13)}</button>
            </div>
            ${a.moveis.map(m=>`<div class="movel-row">
              ${UI.icon('package',13)}
              <input type="text" value="${UI.esc(m.nome)}" onchange="Act.novaObraManualRenomearMovel('${a.tid}','${m.tid}',this.value)">
              <select class="mover-select" onchange="if(this.value)Act.novaObraManualMoverMovel('${a.tid}','${m.tid}',this.value)">
                <option value="">mover para...</option>
                ${w.ambientesManual.filter(a2=>a2.tid!==a.tid).map(a2=>`<option value="${a2.tid}">${UI.esc(a2.nome)}</option>`).join("")}
              </select>
              <button class="btn-icon" title="Remover móvel" onclick="Act.novaObraManualRemoverMovel('${a.tid}','${m.tid}')">${UI.icon('trash',12)}</button>
            </div>`).join("")}
            <div class="flex-gap" style="margin-top:6px;">
              <input type="text" id="revisao_addMov_${a.tid}" placeholder="Adicionar móvel..." style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border-strong);font-size:12.5px;">
              <button class="btn sm" onclick="Act.novaObraManualAddMovel('${a.tid}','revisao_addMov_${a.tid}')">${UI.icon('plus',12)} Móvel</button>
            </div>
          </div>`).join("")}
        <div class="hr"></div>
        <div class="flex-gap">
          <input type="text" id="${inputAddAmb}" placeholder="Adicionar ambiente..." style="flex:1;padding:7px 9px;border-radius:6px;border:1px solid var(--border-strong);font-size:13px;">
          <button class="btn sm" onclick="Act.novaObraManualAddAmbiente('${inputAddAmb}')">${UI.icon('plus',13)} Ambiente</button>
        </div>
      </div>
    `;
  }

  // ---------- etapa: Ativar ----------
  function etapaAtivarHtml(w){
    const faltando = [];
    if(!String(w.nomeManual||"").trim() && !String(w.clienteManual||"").trim()) faltando.push("nome da obra");
    if(!String(w.clienteManual||"").trim()) faltando.push("cliente");
    if(!String(w.responsavelProducao||"").trim()) faltando.push("responsável");
    if(!(w.ambientesManual||[]).length) faltando.push("pelo menos 1 ambiente");
    const totalMoveis = (w.ambientesManual||[]).reduce((s,a)=>s+a.moveis.length,0);
    if(!totalMoveis) faltando.push("pelo menos 1 móvel");
    const numeroOSAtual = String(w.numeroOSManual||"").trim();
    // CORREÇÃO PÓS-ENTREGA (item 1) — mesma correção: rascunho retomado
    // também precisa da checagem, só a própria obra é excluída.
    const duplicada = numeroOSAtual ? M.Store.getObraByNumeroOS(numeroOSAtual, w.obraId) : null;
    const podeAtivar = !faltando.length && (!duplicada || w.osDuplicadaConfirmada);
    return `
      <div class="card pad">
        <div class="card-title">Checklist de ativação</div>
        ${["nome da obra","cliente","responsável","pelo menos 1 ambiente","pelo menos 1 móvel"].map(item=>{
          const ok = faltando.indexOf(item)===-1;
          return `<div class="check-row"><span class="dot ${ok?'good':'critical'}"></span><span class="label">${ok? UI.icon('check',12):UI.icon('alert',12)} ${item}</span></div>`;
        }).join("")}
        ${faltando.length? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);margin-top:10px;">${UI.icon('alert',13)} Ainda falta: ${faltando.join(", ")}. Você pode salvar como rascunho e continuar depois — só não dá pra ativar sem isso.</div>`
          : `<div class="help-banner" style="background:var(--good-bg);border-color:var(--good);color:var(--good);margin-top:10px;">${UI.icon('check-circle',13)} Tudo pronto pra ativar.</div>`}
      </div>
      ${duplicada? `<div class="card pad" style="margin-top:14px;border-color:var(--critical);">
        <div class="check-row"><span class="label">${UI.icon('alert',13)} Já existe uma obra com a OS <b>${UI.esc(numeroOSAtual)}</b>: ${UI.esc(duplicada.nome||duplicada.cliente)} (cliente ${UI.esc(duplicada.cliente||"—")}, responsável ${UI.esc(duplicada.responsavel||"—")}, status ${UI.esc(duplicada.status||M.Store.faseMacroDeObra(duplicada).label||"—")}). <a href="#/obra/${duplicada.id}">Abrir obra existente</a>.</span></div>
        <label class="check-row"><input type="checkbox" ${w.osDuplicadaConfirmada?'checked':''} onchange="Act.novaObraConfirmarOsDuplicada(this.checked)"><span class="label">Mesmo assim continuar — confirmo que é uma obra diferente.</span></label>
      </div>`:""}
      <div class="card pad" style="margin-top:14px;">
        <p class="small">Ao ativar, a obra <b>${UI.esc(w.nomeManual||w.clienteManual||"(sem nome)")}</b> entra em <b>Aguardando início</b> — a obra passa a ser operacional e ficará disponível nos módulos conforme fase, planejamento e permissões.</p>
      </div>
    `;
  }

  M.Pages.novaObra = function(obraIdParam){
    const w = M.UIState.novaObra;
    if(obraIdParam && w.obraId!==obraIdParam){
      const o = M.Store.getObra(obraIdParam);
      if(!o){ UI.toast("Rascunho não encontrado."); location.hash = "#/obras"; return {title:"Nova Obra", crumb:"", html:""}; }
      if(o.status!=="RASCUNHO"){ location.hash = "#/obra/"+o.id; return {title:"Nova Obra", crumb:"", html:""}; }
      hidratarWizardComRascunho(o);
    }
    if(!M.Store.pode("obra.criar")){
      return {title:"Nova Obra", crumb:"", html:`<div class="help-banner">${UI.icon('lock',13)} Seu perfil não tem permissão para criar obra.</div>`};
    }
    let corpo;
    if(w.step==="inicio") corpo = etapaInicioHtml();
    else if(w.step==="dados") corpo = etapaDadosHtml(w);
    else if(w.step==="estrutura") corpo = etapaEstruturaHtml(w);
    else if(w.step==="revisao") corpo = etapaRevisaoHtml(w);
    else corpo = etapaAtivarHtml(w);

    const faltandoAtivar = (()=>{
      const f = [];
      if(!String(w.nomeManual||"").trim() && !String(w.clienteManual||"").trim()) f.push(1);
      if(!String(w.clienteManual||"").trim()) f.push(1);
      if(!String(w.responsavelProducao||"").trim()) f.push(1);
      if(!(w.ambientesManual||[]).length) f.push(1);
      if(!(w.ambientesManual||[]).reduce((s,a)=>s+a.moveis.length,0)) f.push(1);
      return f.length>0;
    })();
    const numeroOSAtual = String(w.numeroOSManual||"").trim();
    // CORREÇÃO PÓS-ENTREGA (item 1) — idem: usado só pra habilitar/desabilitar
    // o botão "Ativar" no rodapé, precisa da mesma regra das outras 3 telas.
    const duplicada = numeroOSAtual ? M.Store.getObraByNumeroOS(numeroOSAtual, w.obraId) : null;
    const podeAtivar = !faltandoAtivar && (!duplicada || w.osDuplicadaConfirmada);

    const html = `
      ${stepIndicatorHtml(w.step)}
      ${corpo}
      ${rodapeHtml(w.step, {podeAtivar})}
    `;
    return {title:"Nova Obra", crumb:"Início → Dados → Ambientes e móveis → Revisão → Ativar", html};
  };
})();
