/* ============================================================
   MOODO PRODUÇÃO — leitor de PDF (Orçamento / Ordem de Serviço)
   ============================================================
   Lê o PDF de verdade (PDF.js, vendorizado localmente em
   js/vendor/pdfjs/ — sem depender de CDN externo, funciona também
   offline depois do primeiro uso via cache do service worker) e faz
   um parser específico pro FORMATO real gerado pela Moodo: cabeçalho
   (Cliente/Responsável/Telefone/Email), blocos por ambiente em caixa
   alta, itens fechados por "Quantidade: N [Valor: R$ X] [Subtotal:
   R$ X]", "Total ambiente: R$ X", e (no Orçamento) "Valor total:"
   dentro da Proposta de Pagamento = valor líquido vendido.

   Como é baseado em texto/regex desse formato específico (não IA/OCR
   genérico), funciona bem para os documentos que a Moodo já gera —
   se o modelo do PDF mudar bastante, algum campo pode não ser
   reconhecido. Por isso a tela de Nova Obra sempre mostra os dados
   extraídos pra revisão/ajuste (inclusive o rateio bruto→líquido por
   ambiente) antes de criar a obra — nunca cria direto sem confirmar.
   ============================================================ */
(function(){
  "use strict";
  window.M = window.M || {};
  const M = window.M;
  const PdfImport = {};
  M.PdfImport = PdfImport;

  // caminho deste próprio script — usado pra resolver os arquivos do
  // PDF.js vendorizados do lado dele, funcionando em qualquer subpasta
  // de deploy (mesmo padrão de caminho relativo do service-worker.js).
  const SCRIPT_SRC = document.currentScript && document.currentScript.src;
  const BASE = SCRIPT_SRC ? SCRIPT_SRC.replace(/[^\/]*$/, "") : "js/";

  // marca cada erro com a etapa exata em que ele aconteceu — sem isso, um
  // erro dentro do PDF.js (worker, minificado) chega na tela só como
  // "undefined is not a function" sem dizer QUAL chamada falhou. Cada
  // rótulo abaixo aparece entre colchetes no início da mensagem exibida,
  // pra dar pra diagnosticar remotamente (sem devtools no aparelho de
  // quem está usando) qual etapa exata travou.
  function comEtapa(etapa, erroOriginal){
    const msg = (erroOriginal && erroOriginal.message) || String(erroOriginal);
    const e = new Error(`[${etapa}] ${msg}`);
    e.etapaOriginal = etapa;
    return e;
  }

  let pdfjsPromise = null;
  function carregarPdfJs(){
    if(pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = import(BASE + "vendor/pdfjs/pdf.min.mjs").then(mod=>{
      mod.GlobalWorkerOptions.workerSrc = BASE + "vendor/pdfjs/pdf.worker.min.mjs";
      PdfImport._pdfjsLib = mod; // acessível pelo console pra diagnóstico remoto, se precisar
      return mod;
    }).catch(err=>{
      pdfjsPromise = null;
      console.error("[Moodo] falha ao carregar PDF.js:", err);
      throw comEtapa("carregar-biblioteca", err);
    });
    return pdfjsPromise;
  }

  // page.getTextContent() do PDF.js usa "for await...of" direto num
  // ReadableStream por baixo dos panos (streamTextContent + iteração
  // assíncrona). Descobri via teste real num iPhone que o Safari/iOS
  // não suporta esse protocolo de iteração assíncrona de ReadableStream
  // de forma confiável (Symbol.asyncIterator) — quebra fundo dentro do
  // PDF.js com "undefined is not a function", sem stack trace útil (o
  // erro atravessa a fronteira do Web Worker e perde o stack original).
  // Contorna lendo o mesmo stream manualmente com getReader() (suportado
  // em qualquer navegador com Streams, inclusive Safari/iOS) em vez de
  // depender da iteração assíncrona — mesmo resultado, sem depender do
  // recurso que falha.
  async function lerConteudoDaPagina(page){
    const stream = page.streamTextContent({});
    const reader = stream.getReader();
    const textContent = { items: [], styles: Object.create(null), lang: null };
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      if(value.lang && !textContent.lang) textContent.lang = value.lang;
      Object.assign(textContent.styles, value.styles);
      textContent.items.push(...value.items);
    }
    return textContent;
  }

  // --------------------------------------------------------------------
  // PDF → linhas de texto. Agrupa os itens de texto do PDF.js pela
  // posição Y (mesma linha visual = mesma linha do documento original,
  // que é como a tabela de itens/valores fica estruturada nesse layout).
  // --------------------------------------------------------------------
  PdfImport.extrairLinhas = async function(file){
    const pdfjsLib = await carregarPdfJs();
    let buffer;
    try{ buffer = await file.arrayBuffer(); }
    catch(err){ throw comEtapa("ler-arquivo", err); }

    let pdf;
    try{ pdf = await pdfjsLib.getDocument({ data: buffer }).promise; }
    catch(err){ throw comEtapa("abrir-pdf", err); }

    const linhas = [];
    for(let p=1; p<=pdf.numPages; p++){
      let page, content;
      try{ page = await pdf.getPage(p); }
      catch(err){ throw comEtapa(`abrir-pagina-${p}`, err); }
      try{ content = await lerConteudoDaPagina(page); }
      catch(err){ throw comEtapa(`ler-texto-pagina-${p}`, err); }
      let atualY = null, atual = [];
      content.items.forEach(item=>{
        if(!item.str || !item.str.trim()) return;
        const y = Math.round(item.transform[5]);
        if(atualY===null || Math.abs(y-atualY)>2.5){
          if(atual.length) linhas.push(atual.join(" ").replace(/\s+/g," ").trim());
          atual = [];
          atualY = y;
        }
        atual.push(item.str);
      });
      if(atual.length) linhas.push(atual.join(" ").replace(/\s+/g," ").trim());
    }
    return linhas.filter(Boolean);
  };

  // --------------------------------------------------------------------
  // valores em formato brasileiro ("R$ 13.350,00") → número
  // --------------------------------------------------------------------
  function parseValorBR(str){
    if(!str) return null;
    const limpo = str.replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",", ".");
    const n = parseFloat(limpo);
    return isNaN(n) ? null : n;
  }
  function dataBRparaISO(str){
    const m = (str||"").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
  function pegarCampo(bloco, rotulo){
    const re = new RegExp(rotulo + "\\s*:\\s*(.+?)(?=\\s+(?:Cliente|Respons[aá]vel|Telefone|Email|Data)\\s*:|$)", "i");
    const m = bloco.match(re);
    return m ? m[1].trim() : "";
  }

  // --------------------------------------------------------------------
  // componente crítico / exceção — detecção por palavra-chave na
  // descrição do item (aproximação: revise depois de criar a obra, na
  // aba de componentes de cada móvel — dá pra adicionar/remover lá).
  // --------------------------------------------------------------------
  const PALAVRAS_COMPONENTE = [
    {re:/\bvidro\b/i, tipo:"Vidro"},
    {re:/\bespelho\b/i, tipo:"Espelho"},
    {re:/serralheria|metalon/i, tipo:"Serralheria"},
    {re:/pintur|pintad/i, tipo:"Pintura"},
    {re:/estofad/i, tipo:"Estofado"},
    {re:/\bled\b|neon\s*led/i, tipo:"LED"},
    {re:/fornecid[oa]s?\s+pel[ao]\s+client|n[aã]o\s+incluso/i, tipo:"Material do cliente"},
  ];
  // devolve {nome, tipo} — não só o tipo — pra Store.criarObra conseguir
  // gerar a pendência já com a categoria certa (Vidro/Serralheria/...) em vez
  // de cair no genérico "Material especial" (fluxo de pendência mais raso).
  function detectarComponentes(descricao){
    const tipos = [];
    PALAVRAS_COMPONENTE.forEach(p=>{ if(p.re.test(descricao)) tipos.push(p.tipo); });
    return Array.from(new Set(tipos)).map(tipo=> ({ nome: tipo, tipo }));
  }
  PdfImport.detectarComponentes = detectarComponentes;

  // --------------------------------------------------------------------
  // linha de ambiente = título curto em caixa alta que não é um dos
  // rótulos/linhas conhecidas (Quantidade/Valor/Total/observações etc.)
  // --------------------------------------------------------------------
  function ehCabecalhoAmbiente(l){
    if(!l || l.length > 45) return false;
    if(/R\$/.test(l)) return false;
    if(/^(Quantidade|Valor|Subtotal|Total ambiente|Cliente|Respons[aá]vel|Telefone|Email|Data)\s*:/i.test(l)) return false;
    if(/VALOR TOTAL|OBSERVA[ÇC][ÕO]ES|CONSIDERA[ÇC][ÕO]ES|PROPOSTA DE PAGAMENTO|MOODO|CNPJ|OR[ÇC]AMENTO N|ORDEM DE SERVI[ÇC]O/i.test(l)) return false;
    const letras = l.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g,"");
    if(!letras) return false;
    return letras === letras.toUpperCase();
  }

  function parseAmbientes(linhas){
    const ambientes = [];
    let ambienteAtual = null, descAtual = [], dentro = false;
    function fecharItem(qtd, valorUnit, subtotal){
      const descricao = descAtual.join(" ").replace(/\s+/g," ").trim();
      descAtual = [];
      if(!descricao || !ambienteAtual) return;
      const quantidade = Number(qtd) || 1;
      const valorTotal = subtotal!=null ? subtotal : (valorUnit!=null ? valorUnit*quantidade : null);
      ambienteAtual.itens.push({
        descricao, quantidade,
        valorUnitario: valorUnit,
        subtotal,
        valorBruto: valorTotal,
        materiaisEspeciais: detectarComponentes(descricao),
      });
    }
    for(const l of linhas){
      if(/VALOR TOTAL|OBSERVA[ÇC][ÕO]ES DO OR[ÇC]AMENTO|CONSIDERA[ÇC][ÕO]ES FINAIS|PROPOSTA DE PAGAMENTO/i.test(l)) break;
      const totalAmb = l.match(/Total ambiente:?\s*R\$\s*([\d.,]+)/i);
      if(totalAmb){ fecharItem(); if(ambienteAtual) ambienteAtual.valorBruto = parseValorBR(totalAmb[1]); continue; }
      const item = l.match(/Quantidade:\s*(\d+)(?:\s*Valor:\s*R\$\s*([\d.,]+))?(?:\s*Subtotal:\s*R\$\s*([\d.,]+))?/i);
      if(item){ fecharItem(parseInt(item[1],10), item[2]?parseValorBR(item[2]):null, item[3]?parseValorBR(item[3]):null); continue; }
      if(ehCabecalhoAmbiente(l)){
        fecharItem();
        ambienteAtual = { nome: l.trim(), itens: [], valorBruto: null };
        ambientes.push(ambienteAtual);
        dentro = true;
        continue;
      }
      if(dentro && ambienteAtual) descAtual.push(l);
    }
    fecharItem();
    return ambientes;
  }

  // --------------------------------------------------------------------
  // parser de um documento (Orçamento OU Ordem de Serviço) já em linhas
  // --------------------------------------------------------------------
  PdfImport.parseDocumento = function(linhas){
    const texto = linhas.join("\n");
    const numeroMatch = texto.match(/(?:OR[ÇC]AMENTO|ORDEM DE SERVI[ÇC]O)\s*N[ºo°]?\s*(\d{2,4}\/\d{1,5})/i);
    const numeroOS = numeroMatch ? "OS " + numeroMatch[1] : null;

    const idxCliente = linhas.findIndex(l=>/^Cliente:/i.test(l));
    const headerTexto = idxCliente>=0 ? linhas.slice(idxCliente, idxCliente+6).join(" ") : "";
    const cliente = pegarCampo(headerTexto, "Cliente");
    const responsavel = pegarCampo(headerTexto, "Respons[aá]vel").replace(/^Arquitet[oa]\s+/i, "");
    const telefone = pegarCampo(headerTexto, "Telefone");
    // email é sempre o último campo do cabeçalho, sem rótulo depois pra
    // delimitar onde ele termina (diferente de cliente/responsável/telefone,
    // que são sempre seguidos por outro rótulo conhecido) — se usasse
    // pegarCampo aqui, capturava até o próximo ambiente inteiro. Um endereço
    // de email não tem espaço, então cortar no primeiro espaço já resolve.
    const emailMatch = headerTexto.match(/Email:\s*(\S+@\S+)/i);
    const email = emailMatch ? emailMatch[1] : "";

    const dataEntregaMatch = texto.match(/Data de entrega:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const dataEntregaPrevista = dataEntregaMatch ? dataBRparaISO(dataEntregaMatch[1]) : null;

    const ambientes = parseAmbientes(linhas);

    const brutoMatch = texto.match(/VALOR TOTAL DO OR[ÇC]AMENTO:?\s*R\$\s*([\d.,]+)/i) || texto.match(/VALOR TOTAL DOS AMBIENTES:?\s*R\$\s*([\d.,]+)/i);
    const valorBrutoTotal = brutoMatch ? parseValorBR(brutoMatch[1])
      : (ambientes.reduce((s,a)=> s + (a.valorBruto || a.itens.reduce((x,i)=>x+(i.valorBruto||0),0)), 0) || null);

    const idxProposta = linhas.findIndex(l=>/PROPOSTA DE PAGAMENTO/i.test(l));
    let valorLiquidoTotal = null;
    if(idxProposta>=0){
      const m = linhas.slice(idxProposta).join(" ").match(/Valor total:\s*R\$\s*([\d.,]+)/i);
      if(m) valorLiquidoTotal = parseValorBR(m[1]);
    }
    if(valorLiquidoTotal==null) valorLiquidoTotal = valorBrutoTotal;

    return { numeroOS, cliente, responsavel, telefone, email, dataEntregaPrevista, ambientes, valorBrutoTotal, valorLiquidoTotal };
  };

  // --------------------------------------------------------------------
  // combina Orçamento (tem valores) + OS (tem data de entrega) no
  // formato que a tela de Nova Obra usa. Funciona com só um dos dois
  // também — Orçamento sozinho já tem ambientes+valores; OS sozinha
  // traz ambientes sem valor (ajustável manualmente no passo de rateio).
  // --------------------------------------------------------------------
  PdfImport.combinar = function(orc, os){
    const base = orc || os;
    if(!base) return null;
    const fonteAmbientes = (orc && orc.ambientes && orc.ambientes.length) ? orc.ambientes : ((os && os.ambientes) || []);
    if(!fonteAmbientes.length) return null;

    const ambientes = fonteAmbientes.map(a=>({
      nome: a.nome,
      itens: a.itens.map(it=>({ item: it.descricao, qtd: it.quantidade||1, materiaisEspeciais: it.materiaisEspeciais||[] })),
    }));
    const itensOrc = [];
    fonteAmbientes.forEach(a=> a.itens.forEach(it=>{
      itensOrc.push({ ambiente:a.nome, item: it.descricao, qtd: it.quantidade||1, valorBruto: it.valorBruto!=null ? it.valorBruto : 0 });
    }));
    const somaItens = itensOrc.reduce((s,i)=>s+i.valorBruto,0);
    const valorBrutoTotal = orc && orc.valorBrutoTotal!=null ? orc.valorBrutoTotal : somaItens;
    // O total oficial do orçamento é a fonte de verdade. Alguns PDFs
    // arredondam ou apresentam valores por item que não fecham exatamente;
    // nesse caso o rateio proporcional preserva o total do documento.
    if(valorBrutoTotal>0 && somaItens>0 && Math.abs(valorBrutoTotal-somaItens)>0.01){
      const fatorAjuste = valorBrutoTotal/somaItens;
      let acumulado = 0;
      itensOrc.forEach((it,idx)=>{
        it.valorBruto = idx===itensOrc.length-1
          ? Math.round((valorBrutoTotal-acumulado)*100)/100
          : Math.round(it.valorBruto*fatorAjuste*100)/100;
        acumulado += it.valorBruto;
      });
    }
    const valorFinalVendido = orc && orc.valorLiquidoTotal!=null ? orc.valorLiquidoTotal : valorBrutoTotal;

    return {
      numeroOS: (orc && orc.numeroOS) || (os && os.numeroOS) || null,
      cliente: (orc && orc.cliente) || (os && os.cliente) || "",
      responsavel: (orc && orc.responsavel) || (os && os.responsavel) || "",
      endereco: "", // não aparece nesses documentos — preencher depois na obra
      telefone: (orc && orc.telefone) || (os && os.telefone) || "",
      email: (orc && orc.email) || (os && os.email) || "",
      data: M.todayISO(),
      dataEntregaPrevista: (os && os.dataEntregaPrevista) || null,
      ambientes, itensOrc, valorBrutoTotal, valorFinalVendido, temValores: valorBrutoTotal>0,
    };
  };
})();
