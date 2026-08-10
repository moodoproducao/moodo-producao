/* ============================================================
   MOODO PRODUÇÃO — dados (mock) e constantes de domínio
   ============================================================ */
window.M = window.M || {};

(function(){
  "use strict";

  // ---------- datas utilitárias ----------
  function inicioDoDiaAtual(){
    const agora = new Date();
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  }
  function dataLocalISO(data){
    const pad = n=>String(n).padStart(2,"0");
    return `${data.getFullYear()}-${pad(data.getMonth()+1)}-${pad(data.getDate())}`;
  }
  // TODAY continua sendo a referência inicial do calendário desta sessão. Já
  // todayISO()/dOff() consultam o relógio a cada chamada, inclusive se o PWA
  // permanecer aberto durante a virada do dia.
  const TODAY = inicioDoDiaAtual();
  function dOff(days){ const x = inicioDoDiaAtual(); x.setDate(x.getDate()+days); return dataLocalISO(x); }
  function todayISO(){ return dataLocalISO(inicioDoDiaAtual()); }

  // ---------- etapas do pipeline (seção 68-72: agora dados configuráveis, não constantes) ----------
  // Isto é só a SEMENTE inicial — a partir daqui quem manda é Store.state.etapas
  // (editável em Configurações → Processos → Etapas). "id" é a chave estável:
  // nunca muda depois de criada, mesmo que nome/ordem/grupo mudem.
  const ETAPAS_SEED = [
    {id:"AGENDADA",         nome:"Agendada",              nomeCurto:"Agendada", grupo:"PRE_PRODUCAO", ordem:0,  cor:"neutral", tempoEsperadoDias:1, responsavelPadrao:"Beatriz Nogueira", pesoValorProcessado:0,  exigeConferencia:false, permiteAvancoExcepcional:true,  ativa:true},
    {id:"MEDICAO",          nome:"Medição",               nomeCurto:"Medição",  grupo:"PRE_PRODUCAO", ordem:1,  cor:"neutral", tempoEsperadoDias:2, responsavelPadrao:"Carlos Nunes",     pesoValorProcessado:0,  exigeConferencia:true,  permiteAvancoExcepcional:false, ativa:true},
    {id:"PROJETO_EXECUTIVO",nome:"Projeto Executivo",     nomeCurto:"Executivo",grupo:"PRE_PRODUCAO", ordem:2,  cor:"neutral", tempoEsperadoDias:3, responsavelPadrao:"Juliana Prado",    pesoValorProcessado:5,  exigeConferencia:false, permiteAvancoExcepcional:true,  ativa:true},
    {id:"PLANO_DE_CORTE",   nome:"Plano de Corte",        nomeCurto:"Pl. Corte",grupo:"PRE_PRODUCAO", ordem:3,  cor:"neutral", tempoEsperadoDias:1, responsavelPadrao:"Juliana Prado",    pesoValorProcessado:5,  exigeConferencia:false, permiteAvancoExcepcional:false, ativa:true},
    {id:"LIBERADA",         nome:"Liberada para Produção",nomeCurto:"Liberada", grupo:"PRE_PRODUCAO", ordem:4,  cor:"neutral", tempoEsperadoDias:1, responsavelPadrao:"Beatriz Nogueira", pesoValorProcessado:0,  exigeConferencia:true,  permiteAvancoExcepcional:true,  ativa:true},
    {id:"CORTE",            nome:"Corte",                 nomeCurto:"Corte",    grupo:"FABRICA",       ordem:5,  cor:"brand",   tempoEsperadoDias:1, responsavelPadrao:"Willian Souza",    pesoValorProcessado:10, exigeConferencia:false, permiteAvancoExcepcional:false, ativa:true},
    {id:"USINAGEM",         nome:"Usinagem",              nomeCurto:"Usinagem", grupo:"FABRICA",       ordem:6,  cor:"brand",   tempoEsperadoDias:1, responsavelPadrao:"Pedro Rocha",      pesoValorProcessado:15, exigeConferencia:false, permiteAvancoExcepcional:false, ativa:true},
    {id:"FITAGEM",          nome:"Fitagem",               nomeCurto:"Fitagem",  grupo:"FABRICA",       ordem:7,  cor:"brand",   tempoEsperadoDias:1, responsavelPadrao:"Marcos Lima",      pesoValorProcessado:15, exigeConferencia:false, permiteAvancoExcepcional:false, ativa:true},
    {id:"PRE_MONTAGEM",     nome:"Pré-Montagem",          nomeCurto:"Pré-Mont.",grupo:"FABRICA",       ordem:8,  cor:"brand",   tempoEsperadoDias:2, responsavelPadrao:"Gabriel Alves",    pesoValorProcessado:20, exigeConferencia:false, permiteAvancoExcepcional:false, ativa:true},
    {id:"EMBALAGEM",        nome:"Limpeza e Embalagem",   nomeCurto:"Embalagem",grupo:"FABRICA",       ordem:9,  cor:"brand",   tempoEsperadoDias:1, responsavelPadrao:"Ana Ferreira",     pesoValorProcessado:5,  exigeConferencia:false, permiteAvancoExcepcional:false, ativa:true},
    {id:"ENTREGA",          nome:"Entrega",               nomeCurto:"Entrega",  grupo:"LOGISTICA",     ordem:10, cor:"gold",    tempoEsperadoDias:1, responsavelPadrao:"Fernanda Costa",   pesoValorProcessado:0,  exigeConferencia:false, permiteAvancoExcepcional:true,  ativa:true},
    {id:"MONTAGEM",         nome:"Montagem",              nomeCurto:"Montagem", grupo:"LOGISTICA",     ordem:11, cor:"gold",    tempoEsperadoDias:1, responsavelPadrao:"Roberto Diniz",    pesoValorProcessado:25, exigeConferencia:true,  permiteAvancoExcepcional:false, ativa:true},
    {id:"FINALIZADA",       nome:"Finalizada",            nomeCurto:"Finalizada",grupo:"LOGISTICA",    ordem:12, cor:"good",    tempoEsperadoDias:1, responsavelPadrao:"Beatriz Nogueira", pesoValorProcessado:0,  exigeConferencia:true,  permiteAvancoExcepcional:true,  ativa:true},
  ];

  // grupos visuais fixos do pipeline (seção 8) — cada etapa escolhe um destes em "grupo"
  const STAGE_GROUPS = [
    {key:"PRE_PRODUCAO", label:"PCP"},
    {key:"FABRICA",      label:"Fábrica"},
    {key:"LOGISTICA",    label:"Logística / Obra"},
  ];

  // requisitos padrão por etapa — semente inicial da biblioteca configurável
  // (obrigatorio: "OBRIGATORIO" | "RECOMENDADO" | "OPCIONAL")
  const REQUISITOS_SEED = {
    CORTE: [
      {nome:"Plano de corte aprovado", obrigatorio:"OBRIGATORIO"},
      {nome:"MDF disponível em estoque", obrigatorio:"OBRIGATORIO"},
      {nome:"Cor/padrão conferido", obrigatorio:"OBRIGATORIO"},
      {nome:"Chapa especial disponível", obrigatorio:"OPCIONAL"},
    ],
    USINAGEM: [
      {nome:"Peças cortadas", obrigatorio:"OBRIGATORIO"},
      {nome:"Arquivo CNC gerado", obrigatorio:"OBRIGATORIO"},
      {nome:"Arquivo conferido", obrigatorio:"OPCIONAL"},
      {nome:"Ferramenta disponível", obrigatorio:"OBRIGATORIO"},
    ],
    FITAGEM: [
      {nome:"Peças usinadas", obrigatorio:"OBRIGATORIO"},
      {nome:"Fita disponível", obrigatorio:"OBRIGATORIO"},
      {nome:"Fita especial disponível", obrigatorio:"OPCIONAL"},
    ],
    PRE_MONTAGEM: [
      {nome:"Peças fitadas", obrigatorio:"OBRIGATORIO"},
      {nome:"Ferragens separadas", obrigatorio:"OBRIGATORIO"},
      {nome:"Perfil de alumínio disponível", obrigatorio:"OPCIONAL"},
      {nome:"Componentes especiais recebidos", obrigatorio:"OPCIONAL"},
    ],
    EMBALAGEM: [
      {nome:"Pré-montagem concluída", obrigatorio:"OBRIGATORIO"},
      {nome:"Peças completas", obrigatorio:"OBRIGATORIO"},
      {nome:"Ferragens separadas", obrigatorio:"OBRIGATORIO"},
      {nome:"Vidro recebido", obrigatorio:"OPCIONAL"},
    ],
    MONTAGEM: [
      {nome:"Móveis entregues no local", obrigatorio:"OBRIGATORIO"},
      {nome:"Ferragens conferidas", obrigatorio:"OBRIGATORIO"},
      {nome:"Vidro disponível", obrigatorio:"OPCIONAL"},
      {nome:"Projeto executivo em mãos", obrigatorio:"OBRIGATORIO"},
      {nome:"Endereço/acesso confirmado", obrigatorio:"OBRIGATORIO"},
    ],
  };

  // categorias de pendência (seção 23) — chave curta + rótulo + grupo de fluxo padrão associado
  const CATEGORIAS_PENDENCIA_DEF = [
    {key:"FALTA_MDF",        label:"Falta MDF",            fluxo:"FALTA_MATERIAL"},
    {key:"FALTA_FERRAGEM",   label:"Falta ferragem",        fluxo:"FERRAGEM"},
    {key:"FALTA_MATERIAL",   label:"Falta material",        fluxo:"FALTA_MATERIAL"},
    {key:"PECA_REFAZER",     label:"Peça para refazer",     fluxo:"RETRABALHO"},
    {key:"PECA_DANIFICADA",  label:"Peça danificada",       fluxo:"RETRABALHO"},
    {key:"VIDRO",            label:"Vidro",                 fluxo:"VIDRO"},
    {key:"ESPELHO",          label:"Espelho",                fluxo:"VIDRO"},
    {key:"SERRALHERIA",      label:"Serralheria",            fluxo:"SERRALHERIA"},
    {key:"PINTURA",          label:"Pintura",                 fluxo:"PINTURA"},
    {key:"ESTOFADO",         label:"Estofado",                fluxo:"ESTOFADO"},
    {key:"FORNECEDOR",       label:"Fornecedor",              fluxo:"FALTA_MATERIAL"},
    {key:"CLIENTE",          label:"Cliente",                  fluxo:"APROVACAO"},
    {key:"OBRA_CIVIL",       label:"Obra civil",               fluxo:"OBRA_CIVIL"},
    {key:"MEDICAO",          label:"Medição",                   fluxo:"MEDICAO"},
    {key:"APROVACAO",        label:"Aprovação",                  fluxo:"APROVACAO"},
    {key:"OUTRO",            label:"Outro",                       fluxo:"OUTRO"},
  ];
  const CATEGORIAS_PENDENCIA = CATEGORIAS_PENDENCIA_DEF.map(c=>c.label);
  const categoriaDef = (label)=> CATEGORIAS_PENDENCIA_DEF.find(c=>c.label===label) || CATEGORIAS_PENDENCIA_DEF[CATEGORIAS_PENDENCIA_DEF.length-1];

  // fluxos operacionais padrão por categoria (seção 24/25)
  const FLUXOS_PENDENCIA_PADRAO = {
    VIDRO:        ["Levantar medidas","Confirmar vidro/modelo","Solicitar orçamento","Aprovar orçamento","Fazer pedido","Acompanhar fornecedor","Buscar/receber","Conferir","Instalar","Finalizar"],
    SERRALHERIA:  ["Levantar medidas","Especificar peça","Solicitar orçamento","Aprovar orçamento","Fazer pedido","Acompanhar fornecedor","Receber","Conferir","Instalar","Finalizar"],
    PINTURA:      ["Especificar cor/acabamento","Enviar peça para pintura","Acompanhar prazo","Receber pintado","Conferir acabamento","Instalar","Finalizar"],
    ESTOFADO:     ["Levantar medidas/tecido","Solicitar orçamento","Aprovar orçamento","Fazer pedido","Acompanhar fornecedor","Receber","Conferir","Instalar","Finalizar"],
    FALTA_MATERIAL:["Identificar item em falta","Verificar fornecedor alternativo","Fazer pedido/compra","Acompanhar entrega","Receber","Conferir","Liberar para produção","Finalizar"],
    FERRAGEM:     ["Identificar ferragem em falta","Fazer pedido/compra","Acompanhar entrega","Receber","Conferir","Liberar para produção","Finalizar"],
    MATERIAL_CLIENTE:["Solicitar material ao cliente","Definir prazo com cliente","Acompanhar envio","Receber","Conferir","Finalizar"],
    APROVACAO:    ["Enviar para aprovação","Acompanhar retorno","Registrar aprovação/ajuste","Finalizar"],
    MEDICAO:      ["Agendar medição","Realizar medição em campo","Conferir medidas","Ajustar projeto se necessário","Finalizar"],
    OBRA_CIVIL:   ["Identificar pendência de obra civil","Comunicar responsável pela obra","Acompanhar execução","Conferir no local","Finalizar"],
    RETRABALHO:   ["Identificar problema","Registrar origem","Registrar responsável","Produzir novamente","Conferir","Retornar ao fluxo","Finalizar"],
    OUTRO:        ["Descrever situação","Definir responsável","Acompanhar","Finalizar"],
  };

  const TIPOS_COMPONENTE = ["Vidro","Espelho","Serralheria","Pintura","Estofado","LED","Ferragem especial","Material do cliente","Outro"];
  const COMPONENTES_CHECKLIST_PADRAO = ["Corpo MDF","Frentes","Portas","Gavetas","Ferragens","Puxadores","Vidro","Espelho","Serralheria","Pintura","Estofado","LED","Outros"];

  // plano "obra no centro" — componente crítico AGUARDANDO/REFACAO gera uma
  // pendência real (Store.criarComponenteCritico), e essa pendência precisa de
  // uma categoria válida (CATEGORIAS_PENDENCIA_DEF) pra ganhar fluxo operacional.
  // Mapeia o tipo do componente pra categoria mais próxima; "Material especial"
  // é o tipo usado pelos itens especiais informados na criação da obra.
  const TIPO_COMPONENTE_TO_CATEGORIA = {
    "Vidro":"Vidro", "Espelho":"Espelho", "Serralheria":"Serralheria",
    "Pintura":"Pintura", "Estofado":"Estofado", "LED":"Outro",
    "Ferragem especial":"Falta ferragem", "Material do cliente":"Cliente",
    "Material especial":"Falta material", "Outro":"Outro",
  };

  // origem do problema (seção 47) — alimenta indicadores de qualidade
  const ORIGENS_PROBLEMA = ["Projeto","Medição","Corte","Usinagem","Fitagem","Pré-montagem","Transporte","Montagem","Fornecedor","Cliente","Obra civil","Não identificado"];

  // perfis de acesso (seção 53-57)
  const PERFIS = [
    {key:"ADMIN",     label:"Administrador",   descricao:"Acesso total, inclusive configurações e permissões.",
      pode:{verValores:true, verIndicadores:true, verDesempenho:true, verRanking:true, verAuditoria:true, verTodasObras:true, verConfiguracoes:true, liberarExcecao:true, editarProcesso:true, editarPermissoes:true}},
    {key:"PCP",       label:"PCP / Gestão",    descricao:"Planeja, acompanha e libera exceções do dia a dia.",
      pode:{verValores:true, verIndicadores:true, verDesempenho:true, verRanking:true, verAuditoria:true, verTodasObras:true, verConfiguracoes:true, liberarExcecao:true, editarProcesso:true, editarPermissoes:false}},
    {key:"LIDERANCA", label:"Liderança",       descricao:"Acompanha equipe e obras, pode liberar exceções.",
      pode:{verValores:true, verIndicadores:true, verDesempenho:true, verRanking:true, verAuditoria:true, verTodasObras:true, verConfiguracoes:false, liberarExcecao:true, editarProcesso:false, editarPermissoes:false}},
    {key:"OPERADOR",  label:"Operador",        descricao:"Executa tarefas, registra pendências e problemas.",
      pode:{verValores:false, verIndicadores:false, verDesempenho:false, verRanking:true, verAuditoria:false, verTodasObras:false, verConfiguracoes:false, liberarExcecao:false, editarProcesso:false, editarPermissoes:false}},
    {key:"MONTADOR",  label:"Montador",        descricao:"Executa montagem e entrega, registra pendências em obra.",
      pode:{verValores:false, verIndicadores:false, verDesempenho:false, verRanking:true, verAuditoria:false, verTodasObras:false, verConfiguracoes:false, liberarExcecao:false, editarProcesso:false, editarPermissoes:false}},
    {key:"TV",        label:"Consulta / TV",   descricao:"Apenas visualização — painel de chão de fábrica.",
      pode:{verValores:false, verIndicadores:true, verDesempenho:false, verRanking:false, verAuditoria:false, verTodasObras:true, verConfiguracoes:false, liberarExcecao:false, editarProcesso:false, editarPermissoes:false}},
  ];
  const perfilDef = (key)=> PERFIS.find(p=>p.key===key) || PERFIS[3];

  const COLABORADORES = [
    {id:"c1", nome:"Willian Souza",  cargo:"Operador de Corte/Router", iniciais:"WS", perfil:"OPERADOR",  telefone:"(11) 98811-2201"},
    {id:"c2", nome:"Gabriel Alves",  cargo:"Pré-Montagem",             iniciais:"GA", perfil:"OPERADOR",  telefone:"(11) 98811-2202"},
    {id:"c3", nome:"Marcos Lima",    cargo:"Fitagem",                  iniciais:"ML", perfil:"OPERADOR",  telefone:"(11) 98811-2203"},
    {id:"c4", nome:"Juliana Prado",  cargo:"Projetista Executivo",     iniciais:"JP", perfil:"LIDERANCA", telefone:"(11) 98811-2204"},
    {id:"c5", nome:"Carlos Nunes",   cargo:"Medição",                  iniciais:"CN", perfil:"OPERADOR",  telefone:"(11) 98811-2205"},
    {id:"c6", nome:"Ana Ferreira",   cargo:"Limpeza e Embalagem",      iniciais:"AF", perfil:"OPERADOR",  telefone:"(11) 98811-2206"},
    {id:"c7", nome:"Roberto Diniz",  cargo:"Montador",                 iniciais:"RD", perfil:"MONTADOR",  telefone:"(11) 98811-2207"},
    {id:"c8", nome:"Fernanda Costa", cargo:"Montagem / Entrega",       iniciais:"FC", perfil:"MONTADOR",  telefone:"(11) 98811-2208"},
    {id:"c9", nome:"Pedro Rocha",    cargo:"Usinagem",                 iniciais:"PR", perfil:"OPERADOR",  telefone:"(11) 98811-2209"},
    {id:"c10",nome:"Beatriz Nogueira",cargo:"PCP / Gestão",            iniciais:"BN", perfil:"PCP",       telefone:"(11) 98811-2210"},
    {id:"c11",nome:"Paulo Henrique", cargo:"Direção / Administrador",  iniciais:"PH", perfil:"ADMIN",     telefone:"(11) 98811-2200"},
  ];
  const colabByNome = (nome)=> COLABORADORES.find(c=>c.nome===nome);

  let _uid = 1;
  const uid = (p)=> p + "-" + (_uid++);

  // móvel.etapa guarda a CHAVE ESTÁVEL da etapa (não mais um índice de array) —
  // isso é o que permite inserir/reordenar etapa em Configurações sem corromper
  // dados já existentes. "etp" aqui é só um identity-helper pra deixar claro,
  // nos dados de exemplo abaixo, que aquele valor é uma referência de etapa.
  function etp(key){ return key; }

  function movel(o){
    const checklistSrc = o.checklist || COMPONENTES_CHECKLIST_PADRAO.slice(0,4);
    const item = Object.assign({
      id: uid("mov"),
      componentesCriticos: [],
      bloqueio: null,
      dataEntradaEtapa: o.dataEntradaEtapa || todayISO(),
      dataPrevista: o.dataPrevista || dOff(6),
      dataReal: o.dataReal || null,
      responsavel: o.responsavel || "Willian Souza",
      valorLiquido: o.valorLiquido || 0,
      requisitosOverride: {},
    }, o, {
      // precisa vir DEPOIS de "o" para não ser sobrescrito pela lista crua de strings
      checklist: checklistSrc.map(n=>({id:uid("chk"),nome:n,concluido:false})),
    });
    item.historicoEtapas = item.historicoEtapas || [{de:null, para:item.etapa, data:item.dataEntradaEtapa}];
    return item;
  }

  // ============================================================
  // OBRA 1 — OS 2026/336 — Marcela e Cristiano  (EM PRODUÇÃO)
  // ============================================================
  const os336 = {
    id:"os336", numeroOS:"OS 2026/336", cliente:"Marcela e Cristiano",
    endereco:"Rua das Orquídeas, 210 — Alphaville, Barueri/SP",
    telefone:"(11) 98877-2211", email:"marcela.cristiano@email.com",
    responsavel:"Beatriz Nogueira",
    dataOS: dOff(-24), dataEntregaPrevista: dOff(10), dataEntregaReal:null,
    valorBruto:109626, valorLiquido:100000,
    status:"EM_PRODUCAO", criadaEm: dOff(-24),
    ambientes:[
      { id:uid("amb"), nome:"Térreo Sala", valorBrutoPct:0.28, moveis:[
        movel({nome:"Buffet Suspenso", etapa:etp("FITAGEM"), dataEntradaEtapa:dOff(-2), responsavel:"Marcos Lima",
          checklist:["Corpo MDF","Frentes","Ferragens","Puxadores"], valorLiquido:9200}),
        movel({nome:"Caixa Revestida (Painel TV)", etapa:etp("PRE_MONTAGEM"), dataEntradaEtapa:dOff(-1), responsavel:"Gabriel Alves",
          checklist:["Corpo MDF","Serralheria","Pintura"], valorLiquido:7400,
          componentesCriticos:[{id:uid("comp"),nome:"Estrutura em Serralheria", tipo:"Serralheria", status:"AGUARDANDO", responsavel:"Beatriz Nogueira", fornecedor:"Metal Alfa Serralheria", prazo:dOff(2), observacao:"Estrutura de sustentação do painel"}]}),
      ]},
      { id:uid("amb"), nome:"Quarto Master", valorBrutoPct:0.34, moveis:[
        movel({nome:"Cabeceira", etapa:etp("PRE_MONTAGEM"), dataEntradaEtapa:dOff(-6), responsavel:"Gabriel Alves",
          checklist:["Corpo MDF","Estofado","Ferragens"], valorLiquido:6800,
          bloqueio:{categoria:"Aguardando estofado", descricao:"Estofado da cabeceira sob encomenda", responsavel:"Gabriel Alves", fornecedor:"Estofados Prime", abertura:dOff(-6), prazo:dOff(1), prioridade:"ALTA", status:"EM_COBRANCA"}}),
        movel({nome:"Criados-Mudos (par)", etapa:etp("EMBALAGEM"), dataEntradaEtapa:dOff(-1), responsavel:"Ana Ferreira",
          checklist:["Corpo MDF","Frentes","Ferragens","Puxadores"], valorLiquido:4200}),
        movel({nome:"Prateleira / Espelho", etapa:etp("PRE_MONTAGEM"), dataEntradaEtapa:dOff(-4), responsavel:"Gabriel Alves",
          checklist:["Corpo MDF","Espelho"], valorLiquido:2600,
          bloqueio:{categoria:"Aguardando espelho", descricao:"Espelho bisotado sob medida", responsavel:"Beatriz Nogueira", fornecedor:"Vidraçaria Pontal", abertura:dOff(-4), prazo:dOff(2), prioridade:"MEDIA", status:"ABERTA"}}),
        movel({nome:"Guarda-Roupa 6 Portas", etapa:etp("USINAGEM"), dataEntradaEtapa:dOff(-3), responsavel:"Pedro Rocha",
          checklist:["Corpo MDF","Portas","Gavetas","Ferragens","Puxadores"], valorLiquido:12400,
          componentesCriticos:[{id:uid("comp"),nome:"Frente Gaveta 03", tipo:"Outro", status:"REFACAO", responsavel:"Willian Souza", motivo:"Lascou na usinagem", prazo:todayISO(), observacao:"Refazer com urgência — cliente sensível a acabamento"}]}),
      ]},
      { id:uid("amb"), nome:"Quarto Hóspedes", valorBrutoPct:0.13, moveis:[
        movel({nome:"Cabeceira Ripada", etapa:etp("PRE_MONTAGEM"), dataEntradaEtapa:dOff(-5), responsavel:"Gabriel Alves",
          checklist:["Corpo MDF","Serralheria (metalon)","Pintura"], valorLiquido:5100,
          bloqueio:{categoria:"Aguardando serralheria", descricao:"Metalon de sustentação da cabeceira", responsavel:"Beatriz Nogueira", fornecedor:"Metal Alfa Serralheria", abertura:dOff(-5), prazo:dOff(3), prioridade:"MEDIA", status:"EM_COBRANCA"}}),
      ]},
      { id:uid("amb"), nome:"Closet", valorBrutoPct:0.25, moveis:[
        movel({nome:"Closet Portas de Vidro", etapa:etp("PRE_MONTAGEM"), dataEntradaEtapa:dOff(-3), responsavel:"Gabriel Alves",
          checklist:["Corpo MDF","Portas de Vidro","Ferragens","LED"], valorLiquido:14300,
          bloqueio:{categoria:"Aguardando vidro", descricao:"Vidro Reflecta bronze das portas", responsavel:"Beatriz Nogueira", fornecedor:"Vidraçaria Pontal", abertura:dOff(-3), prazo:dOff(2), prioridade:"ALTA", status:"ABERTA"}}),
      ]},
    ],
  };

  // ============================================================
  // OBRA 2 — Casa Augusto (INICIANDO — prazo apertado)
  // ============================================================
  const casaAugusto = {
    id:"casa-augusto", numeroOS:"OS 2026/341", cliente:"Augusto Ferraz",
    endereco:"Al. dos Ipês, 88 — Granja Viana, Cotia/SP", telefone:"(11) 97711-4400", email:"augusto.ferraz@email.com",
    responsavel:"Beatriz Nogueira",
    dataOS: dOff(-3), dataEntregaPrevista: dOff(7), dataEntregaReal:null,
    valorBruto:64500, valorLiquido:58000, status:"EM_PRODUCAO", criadaEm: dOff(-3),
    ambientes:[
      { id:uid("amb"), nome:"Cozinha", valorBrutoPct:0.55, moveis:[
        movel({nome:"Armário Superior", etapa:etp("MEDICAO"), dataEntradaEtapa:dOff(-2), responsavel:"Carlos Nunes",
          checklist:["Medição em campo","Conferência de vãos"], valorLiquido:18000}),
        movel({nome:"Bancada + Torre Quente", etapa:etp("AGENDADA"), dataEntradaEtapa:dOff(-3), responsavel:"Beatriz Nogueira",
          checklist:["Agendamento confirmado"], valorLiquido:16000}),
      ]},
      { id:uid("amb"), nome:"Sala de Estar", valorBrutoPct:0.45, moveis:[
        movel({nome:"Painel Ripado + Rack", etapa:etp("PROJETO_EXECUTIVO"), dataEntradaEtapa:dOff(-1), responsavel:"Juliana Prado",
          checklist:["Layout aprovado pelo cliente","Detalhamento técnico"], valorLiquido:24000}),
      ]},
    ],
  };

  // ============================================================
  // OBRA 3 — Casa Gomes (ATRASADA — risco alto)
  // ============================================================
  const casaGomes = {
    id:"casa-gomes", numeroOS:"OS 2026/329", cliente:"Fernando e Patrícia Gomes",
    endereco:"Rua Aroeira, 45 — Jardins, São Paulo/SP", telefone:"(11) 96622-3300", email:"fpgomes@email.com",
    responsavel:"Beatriz Nogueira",
    dataOS: dOff(-40), dataEntregaPrevista: dOff(-3), dataEntregaReal:null,
    valorBruto:142000, valorLiquido:128000, status:"EM_PRODUCAO", criadaEm: dOff(-40),
    ambientes:[
      { id:uid("amb"), nome:"Cozinha", valorBrutoPct:0.30, moveis:[
        movel({nome:"Armário Inferior", etapa:etp("EMBALAGEM"), dataEntradaEtapa:dOff(-2), responsavel:"Ana Ferreira", valorLiquido:15000}),
        movel({nome:"Torre Quente", etapa:etp("PRE_MONTAGEM"), dataEntradaEtapa:dOff(-9), responsavel:"Gabriel Alves", valorLiquido:13400,
          bloqueio:{categoria:"Falta ferragem", descricao:"Corrediças telescópicas 45cm em falta", responsavel:"Beatriz Nogueira", fornecedor:"Hafele", abertura:dOff(-9), prazo:dOff(-1), prioridade:"ALTA", status:"EM_COBRANCA"}}),
      ]},
      { id:uid("amb"), nome:"Home Office", valorBrutoPct:0.22, moveis:[
        movel({nome:"Bancada de Trabalho", etapa:etp("CORTE"), dataEntradaEtapa:dOff(-8), responsavel:"Willian Souza", valorLiquido:9600,
          bloqueio:{categoria:"Falta MDF", descricao:"Chapa MDF Freijó fora de linha, aguardando reposição", responsavel:"Beatriz Nogueira", fornecedor:"Duratex", abertura:dOff(-8), prazo:dOff(-2), prioridade:"ALTA", status:"ABERTA"}}),
      ]},
      { id:uid("amb"), nome:"Lavanderia", valorBrutoPct:0.16, moveis:[
        movel({nome:"Armário Suspenso", etapa:etp("USINAGEM"), dataEntradaEtapa:dOff(-7), responsavel:"Pedro Rocha", valorLiquido:6200,
          bloqueio:{categoria:"Peça danificada", descricao:"Lateral direita amassada no transporte interno", responsavel:"Pedro Rocha", prazo:dOff(0), prioridade:"MEDIA", status:"ABERTA"}}),
      ]},
      { id:uid("amb"), nome:"Área Gourmet", valorBrutoPct:0.32, moveis:[
        movel({nome:"Balcão Churrasqueira", etapa:etp("PLANO_DE_CORTE"), dataEntradaEtapa:dOff(-10), responsavel:"Juliana Prado", valorLiquido:17800,
          bloqueio:{categoria:"Aguardando aprovação", descricao:"Cliente ainda não aprovou revisão do executivo", responsavel:"Juliana Prado", abertura:dOff(-10), prazo:dOff(-1), prioridade:"ALTA", status:"EM_COBRANCA"}}),
        movel({nome:"Balcão Pia Externa", etapa:etp("PLANO_DE_CORTE"), dataEntradaEtapa:dOff(-10), responsavel:"Juliana Prado", valorLiquido:9200,
          bloqueio:{categoria:"Aguardando cliente", descricao:"Aguardando definição de cor da cuba pelo cliente", responsavel:"Beatriz Nogueira", abertura:dOff(-10), prazo:dOff(-1), prioridade:"MEDIA", status:"ABERTA"}}),
      ]},
    ],
  };

  // ============================================================
  // OBRA 4 — Real Bothanic 901B (EM MONTAGEM)
  // ============================================================
  const realBothanic = {
    id:"real-bothanic", numeroOS:"OS 2026/318", cliente:"Ricardo Bothanic (Apto 901B)",
    endereco:"Ed. Real Bothanic, Ap. 901B — Vila Andrade, São Paulo/SP", telefone:"(11) 95566-7788", email:"ricardo.bothanic@email.com",
    responsavel:"Beatriz Nogueira",
    dataOS: dOff(-52), dataEntregaPrevista: dOff(10), dataEntregaReal:null,
    valorBruto:96000, valorLiquido:89000, status:"EM_PRODUCAO", criadaEm: dOff(-52),
    ambientes:[
      { id:uid("amb"), nome:"Cozinha", valorBrutoPct:0.4, moveis:[
        movel({nome:"Armário Superior + Inferior", etapa:etp("MONTAGEM"), dataEntradaEtapa:dOff(-1), responsavel:"Roberto Diniz", valorLiquido:26000}),
      ]},
      { id:uid("amb"), nome:"Sala", valorBrutoPct:0.35, moveis:[
        movel({nome:"Estante + Painel TV", etapa:etp("MONTAGEM"), dataEntradaEtapa:dOff(-1), responsavel:"Fernanda Costa", valorLiquido:22000}),
      ]},
      { id:uid("amb"), nome:"Quarto Casal", valorBrutoPct:0.25, moveis:[
        movel({nome:"Guarda-Roupa Casal", etapa:etp("ENTREGA"), dataEntradaEtapa:dOff(-2), responsavel:"Fernanda Costa", valorLiquido:15600,
          bloqueio:{categoria:"Aguardando vidro", descricao:"Espelho de porta central em rota do fornecedor", responsavel:"Beatriz Nogueira", fornecedor:"Vidraçaria Pontal", abertura:dOff(-3), prazo:dOff(1), prioridade:"MEDIA", status:"EM_COBRANCA"}}),
      ]},
    ],
  };

  // ============================================================
  // OBRA 5 — Odonto Radi (QUASE PRONTA)
  // ============================================================
  const odontoRadi = {
    id:"odonto-radi", numeroOS:"OS 2026/302", cliente:"Clínica Odonto Radi",
    endereco:"Av. Paulista, 1500 — sala 1204, São Paulo/SP", telefone:"(11) 3344-5566", email:"contato@odontoradi.com.br",
    responsavel:"Beatriz Nogueira",
    dataOS: dOff(-60), dataEntregaPrevista: dOff(4), dataEntregaReal:null,
    valorBruto:78000, valorLiquido:71500, status:"EM_PRODUCAO", criadaEm: dOff(-60),
    ambientes:[
      { id:uid("amb"), nome:"Recepção", valorBrutoPct:0.5, moveis:[
        movel({nome:"Balcão de Recepção", etapa:etp("FINALIZADA"), dataEntradaEtapa:dOff(-1), responsavel:"Roberto Diniz", valorLiquido:38000}),
      ]},
      { id:uid("amb"), nome:"Consultórios", valorBrutoPct:0.5, moveis:[
        movel({nome:"Armários Consultório 1", etapa:etp("FINALIZADA"), dataEntradaEtapa:dOff(-2), responsavel:"Roberto Diniz", valorLiquido:16800}),
        movel({nome:"Armários Consultório 2", etapa:etp("MONTAGEM"), dataEntradaEtapa:dOff(-1), responsavel:"Roberto Diniz", valorLiquido:16700}),
      ]},
    ],
  };

  // ============================================================
  // OBRA 6 — Cozinha Iris (BLOQUEADA)
  // ============================================================
  const cozinhaIris = {
    id:"cozinha-iris", numeroOS:"OS 2026/347", cliente:"Íris Almeida",
    endereco:"Rua Tamoios, 320 — Moema, São Paulo/SP", telefone:"(11) 94433-1122", email:"iris.almeida@email.com",
    responsavel:"Beatriz Nogueira",
    dataOS: dOff(-15), dataEntregaPrevista: dOff(12), dataEntregaReal:null,
    valorBruto:52000, valorLiquido:48800, status:"EM_PRODUCAO", criadaEm: dOff(-15),
    fichaTecnica:{ chapasMDF:21, m2MDF:83.46, metrosFitagem:345.26, componentes:["Dobradiças","Corrediças","Parafusos","Vidro","Puxadores"] },
    ambientes:[
      { id:uid("amb"), nome:"Cozinha", valorBrutoPct:1, moveis:[
        movel({nome:"Torre Quente", etapa:etp("CORTE"), dataEntradaEtapa:dOff(-5), responsavel:"Willian Souza", valorLiquido:14800,
          bloqueio:{categoria:"Falta material", descricao:"Chapa especial (padrão Carvalho Malbec) fora de estoque", responsavel:"Beatriz Nogueira", fornecedor:"Duratex", abertura:dOff(-5), prazo:dOff(1), prioridade:"ALTA", status:"ABERTA"}}),
        movel({nome:"Armário Superior", etapa:etp("FITAGEM"), dataEntradaEtapa:dOff(-2), responsavel:"Marcos Lima", valorLiquido:12200,
          bloqueio:{categoria:"Falta material", descricao:"Fita de borda especial (mesmo padrão) sem estoque", responsavel:"Marcos Lima", fornecedor:"Rehau", abertura:dOff(-2), prazo:dOff(1), prioridade:"MEDIA", status:"EM_COBRANCA"}}),
        movel({nome:"Armário Inferior", etapa:etp("USINAGEM"), dataEntradaEtapa:dOff(-1), responsavel:"Pedro Rocha", valorLiquido:11800}),
        movel({nome:"Bancada + Cuba", etapa:etp("PLANO_DE_CORTE"), dataEntradaEtapa:dOff(-1), responsavel:"Juliana Prado", valorLiquido:10000}),
      ]},
    ],
  };

  const OBRAS_RAW = [os336, casaAugusto, casaGomes, realBothanic, odontoRadi, cozinhaIris];

  // ---------- pós-processamento: rateio bruto->líquido, valores por ambiente/móvel ----------
  function processarObra(o){
    o.fatorLiquido = o.valorLiquido / o.valorBruto;
    o.desconto = o.valorBruto - o.valorLiquido;
    o.descontoPct = o.desconto / o.valorBruto;
    o.ambientes.forEach(a=>{
      a.valorBruto = Math.round(o.valorBruto * a.valorBrutoPct);
      a.valorLiquido = Math.round(a.valorBruto * o.fatorLiquido);
      a.obraId = o.id;
      a.moveis.forEach(m=>{ m.ambienteId = a.id; m.obraId = o.id; });
    });
    return o;
  }
  const OBRAS = OBRAS_RAW.map(processarObra);

  // ============================================================
  // PENDÊNCIAS — derivadas dos bloqueios + avulsas
  // ============================================================
  function coletarPendencias(){
    const out = [];
    OBRAS.forEach(o=> o.ambientes.forEach(a=> a.moveis.forEach(m=>{
      if(m.bloqueio){
        out.push(Object.assign({id:uid("pnd"), obraId:o.id, ambienteId:a.id, movelId:m.id,
          obraNome:o.cliente, ambienteNome:a.nome, movelNome:m.nome, anexo:false, abertura: m.bloqueio.abertura || todayISO()}, m.bloqueio));
      }
      m.componentesCriticos.forEach(c=>{
        if(c.status==="AGUARDANDO"){
          out.push({id:uid("pnd"), obraId:o.id, ambienteId:a.id, movelId:m.id,
            obraNome:o.cliente, ambienteNome:a.nome, movelNome:m.nome,
            categoria:"Aguardando "+c.tipo.toLowerCase(), descricao:c.nome+" — "+(c.observacao||""),
            responsavel:c.responsavel, fornecedor:c.fornecedor||"", abertura:dOff(-3), prazo:c.prazo,
            prioridade:"ALTA", status:"ABERTA", anexo:false});
        }
      });
    })));
    return out;
  }
  const PENDENCIAS = coletarPendencias();

  // ============================================================
  // TAREFAS
  // ============================================================
  function findMovel(obraId, ambienteNome, movelNome){
    const o = OBRAS.find(x=>x.id===obraId);
    const a = o.ambientes.find(x=>x.nome===ambienteNome);
    return {o,a,m:a.moveis.find(x=>x.nome===movelNome)};
  }
  const TAREFAS = [];
  function addTarefa(t){ TAREFAS.push(Object.assign({id:uid("tsk"), tipo:t.tipo||"PRODUCAO"}, t)); }

  (function seedTarefas(){
    const ref1 = findMovel("os336","Quarto Master","Guarda-Roupa 6 Portas");
    addTarefa({obraId:ref1.o.id, obraNome:ref1.o.cliente, ambienteId:ref1.a.id, ambienteNome:ref1.a.nome, movelId:ref1.m.id, movelNome:ref1.m.nome,
      titulo:"Usinar peças", etapa:"USINAGEM", responsavelPlanejado:"Willian Souza", executadoPor:"Willian Souza",
      inicio:"08:12", fim:"10:37", data:todayISO(), status:"CONCLUIDA", resultado:"OK"});
    addTarefa({obraId:ref1.o.id, obraNome:ref1.o.cliente, ambienteId:ref1.a.id, ambienteNome:ref1.a.nome, movelId:ref1.m.id, movelNome:ref1.m.nome,
      titulo:"Refazer Frente Gaveta 03", etapa:"USINAGEM", responsavelPlanejado:"Willian Souza", executadoPor:"Willian Souza",
      inicio:null, fim:null, data:todayISO(), status:"EM_ANDAMENTO", tipo:"REFACAO", motivoRefacao:"Lascou na usinagem"});

    const ref2 = findMovel("os336","Térreo Sala","Buffet Suspenso");
    addTarefa({obraId:ref2.o.id, obraNome:ref2.o.cliente, ambienteId:ref2.a.id, ambienteNome:ref2.a.nome, movelId:ref2.m.id, movelNome:ref2.m.nome,
      titulo:"Fitar bordas", etapa:"FITAGEM", responsavelPlanejado:"Marcos Lima", executadoPor:null,
      inicio:null, fim:null, data:todayISO(), status:"PLANEJADA"});

    const ref3 = findMovel("os336","Quarto Master","Cabeceira");
    addTarefa({obraId:ref3.o.id, obraNome:ref3.o.cliente, ambienteId:ref3.a.id, ambienteNome:ref3.a.nome, movelId:ref3.m.id, movelNome:ref3.m.nome,
      titulo:"Pré-montar cabeceira", etapa:"PRE_MONTAGEM", responsavelPlanejado:"Gabriel Alves", executadoPor:"Gabriel Alves",
      inicio:"13:00", fim:null, data:todayISO(), status:"EM_ANDAMENTO"});

    const ref4 = findMovel("casa-gomes","Cozinha","Torre Quente");
    addTarefa({obraId:ref4.o.id, obraNome:ref4.o.cliente, ambienteId:ref4.a.id, ambienteNome:ref4.a.nome, movelId:ref4.m.id, movelNome:ref4.m.nome,
      titulo:"Pré-montar torre quente", etapa:"PRE_MONTAGEM", responsavelPlanejado:"Gabriel Alves", executadoPor:null,
      inicio:null, fim:null, data:todayISO(), status:"PLANEJADA"});

    const ref5 = findMovel("cozinha-iris","Cozinha","Torre Quente");
    addTarefa({obraId:ref5.o.id, obraNome:ref5.o.cliente, ambienteId:ref5.a.id, ambienteNome:ref5.a.nome, movelId:ref5.m.id, movelNome:ref5.m.nome,
      titulo:"Cortar peças", etapa:"CORTE", responsavelPlanejado:"Willian Souza", executadoPor:null,
      inicio:null, fim:null, data:todayISO(), status:"PLANEJADA"});

    const ref6 = findMovel("real-bothanic","Sala","Estante + Painel TV");
    addTarefa({obraId:ref6.o.id, obraNome:ref6.o.cliente, ambienteId:ref6.a.id, ambienteNome:ref6.a.nome, movelId:ref6.m.id, movelNome:ref6.m.nome,
      titulo:"Montar estante e painel", etapa:"MONTAGEM", responsavelPlanejado:"Fernanda Costa", executadoPor:"Fernanda Costa",
      inicio:"09:00", fim:"14:20", data:dOff(-1), status:"CONCLUIDA", resultado:"OK"});

    const ref7 = findMovel("odonto-radi","Recepção","Balcão de Recepção");
    addTarefa({obraId:ref7.o.id, obraNome:ref7.o.cliente, ambienteId:ref7.a.id, ambienteNome:ref7.a.nome, movelId:ref7.m.id, movelNome:ref7.m.nome,
      titulo:"Conferência final de qualidade", etapa:"FINALIZADA", responsavelPlanejado:"Beatriz Nogueira", executadoPor:"Beatriz Nogueira", conferidoPor:"Beatriz Nogueira",
      inicio:"07:40", fim:"08:10", data:dOff(-1), status:"CONCLUIDA", resultado:"OK"});

    // tarefas complementares (sem móvel específico)
    addTarefa({obraId:"os336", obraNome:os336.cliente, titulo:"Buscar vidro na Vidraçaria Pontal", etapa:null,
      responsavelPlanejado:"Fernanda Costa", executadoPor:null, data:todayISO(), status:"PLANEJADA", tipo:"COMPLEMENTAR"});
    addTarefa({obraId:"casa-gomes", obraNome:casaGomes.cliente, titulo:"Conferir medidas em obra antes da montagem", etapa:null,
      responsavelPlanejado:"Carlos Nunes", executadoPor:null, data:dOff(1), status:"PLANEJADA", tipo:"COMPLEMENTAR"});
    addTarefa({obraId:"real-bothanic", obraNome:realBothanic.cliente, titulo:"Carregar caminhão — entrega quarto casal", etapa:null,
      responsavelPlanejado:"Roberto Diniz", executadoPor:"Roberto Diniz", inicio:"07:00", fim:"07:35", data:todayISO(), status:"CONCLUIDA", resultado:"OK", tipo:"COMPLEMENTAR"});

    // mais algumas concluídas ao longo da semana p/ desempenho
    const gen = [
      ["Willian Souza","Cortar peças","CORTE",dOff(-1)], ["Willian Souza","Usinar peças","USINAGEM",dOff(-2)],
      ["Willian Souza","Cortar peças","CORTE",dOff(-3)], ["Marcos Lima","Fitar bordas","FITAGEM",dOff(-1)],
      ["Marcos Lima","Fitar bordas","FITAGEM",dOff(-2)], ["Gabriel Alves","Pré-montar módulo","PRE_MONTAGEM",dOff(-1)],
      ["Gabriel Alves","Pré-montar módulo","PRE_MONTAGEM",dOff(-3)], ["Ana Ferreira","Embalar módulos","EMBALAGEM",dOff(-1)],
      ["Roberto Diniz","Montar móveis em obra","MONTAGEM",dOff(-2)], ["Fernanda Costa","Entregar e conferir carga","ENTREGA",dOff(-2)],
      ["Pedro Rocha","Usinar peças","USINAGEM",dOff(-1)], ["Pedro Rocha","Usinar peças","USINAGEM",dOff(-4)],
    ];
    gen.forEach((g,i)=>{
      const obraRef = OBRAS[i % OBRAS.length];
      const todosMoveis = obraRef.ambientes.flatMap(a=>a.moveis.map(m=>({a,m})));
      const alvo = todosMoveis[i % Math.max(1,todosMoveis.length)];
      addTarefa({obraId:obraRef.id, obraNome:obraRef.cliente,
        ambienteId: alvo? alvo.a.id: null, ambienteNome: alvo? alvo.a.nome: null,
        movelId: alvo? alvo.m.id: null, movelNome: alvo? alvo.m.nome: null,
        titulo:g[1], etapa:g[2],
        responsavelPlanejado:g[0], executadoPor:g[0], inicio:"08:00", fim:"11:30", data:g[3], status:"CONCLUIDA",
        resultado: (i===2? "COM_RESSALVA": (i===9? "GEROU_REFACAO":"OK")) });
    });
  })();

  // ============================================================
  // LOTES DE PRODUÇÃO
  // ============================================================
  const LOTES = [
    { id:uid("lote"), tipo:"CORTE", data:dOff(1), responsavel:"Willian Souza", status:"PROGRAMADO", chapas:18,
      itens:[ {obraId:"cozinha-iris", label:"Cozinha Iris — Torre Quente"}, {obraId:"casa-augusto", label:"Casa Augusto — Bancada + Torre Quente"} ] },
    { id:uid("lote"), tipo:"USINAGEM", data:dOff(0), responsavel:"Pedro Rocha", status:"EM_ANDAMENTO", chapas:12,
      itens:[ {obraId:"os336", label:"OS 336 — Guarda-Roupa 6 Portas"}, {obraId:"casa-gomes", label:"Casa Gomes — Armário Suspenso"} ] },
    { id:uid("lote"), tipo:"FITAGEM", data:dOff(-1), responsavel:"Marcos Lima", status:"CONCLUIDO", chapas:9,
      itens:[ {obraId:"os336", label:"OS 336 — Buffet Suspenso"}, {obraId:"cozinha-iris", label:"Cozinha Iris — Armário Superior"} ] },
    { id:uid("lote"), tipo:"PRE_MONTAGEM", data:dOff(2), responsavel:"Gabriel Alves", status:"PROGRAMADO", chapas:null,
      itens:[ {obraId:"casa-gomes", label:"Casa Gomes — Torre Quente"} ] },
  ];

  // ============================================================
  // BIBLIOTECA DE TAREFAS PADRÃO POR ETAPA (seção 12/14)
  // ============================================================
  // obrigatorio: "OBRIGATORIO" | "RECOMENDADO" | "OPCIONAL"
  const TAREFAS_PADRAO_ETAPA = {
    AGENDADA: [
      {titulo:"Confirmar agendamento com cliente", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Beatriz Nogueira", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    MEDICAO: [
      {titulo:"Medição em campo", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Carlos Nunes", prazoPadraoDias:2, permiteAvancoExcepcional:false},
      {titulo:"Conferência de vãos", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Carlos Nunes", prazoPadraoDias:2, permiteAvancoExcepcional:true},
    ],
    PROJETO_EXECUTIVO: [
      {titulo:"Layout aprovado pelo cliente", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Juliana Prado", prazoPadraoDias:3, permiteAvancoExcepcional:true},
      {titulo:"Detalhamento técnico", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Juliana Prado", prazoPadraoDias:2, permiteAvancoExcepcional:false},
    ],
    PLANO_DE_CORTE: [
      {titulo:"Gerar plano de corte", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Juliana Prado", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Conferir aproveitamento de chapa", obrigatorio:"RECOMENDADO", responsavelPadrao:"Juliana Prado", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    LIBERADA: [
      {titulo:"Conferir requisitos de liberação", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Beatriz Nogueira", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    CORTE: [
      {titulo:"Conferir plano de corte", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Willian Souza", prazoPadraoDias:1, instrucoes:"Confirmar padrão e cor da chapa antes de iniciar.", permiteAvancoExcepcional:false},
      {titulo:"Conferir MDF", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Willian Souza", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Separar chapas", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Willian Souza", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Executar corte", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Willian Souza", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Identificar lote", obrigatorio:"RECOMENDADO", responsavelPadrao:"Willian Souza", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Conferir conclusão", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Willian Souza", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    USINAGEM: [
      {titulo:"Conferir arquivo CNC", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Pedro Rocha", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Usinar peças", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Pedro Rocha", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Conferir furações/encaixes", obrigatorio:"RECOMENDADO", responsavelPadrao:"Pedro Rocha", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    FITAGEM: [
      {titulo:"Conferir peças usinadas", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Marcos Lima", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Fitar bordas", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Marcos Lima", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Conferir acabamento da fita", obrigatorio:"RECOMENDADO", responsavelPadrao:"Marcos Lima", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    PRE_MONTAGEM: [
      {titulo:"Separar ferragens", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Gabriel Alves", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Pré-montar módulo", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Gabriel Alves", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Conferir portas e gavetas", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Gabriel Alves", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    EMBALAGEM: [
      {titulo:"Limpar peças", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Ana Ferreira", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Conferir itens completos", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Ana Ferreira", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Embalar módulos", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Ana Ferreira", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    ENTREGA: [
      {titulo:"Carregar caminhão", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Fernanda Costa", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Conferir carga na entrega", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Fernanda Costa", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    MONTAGEM: [
      {titulo:"Instalar todos os móveis", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Roberto Diniz", prazoPadraoDias:1, permiteAvancoExcepcional:false},
      {titulo:"Regular portas", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Roberto Diniz", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Regular gavetas", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Roberto Diniz", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Conferir ferragens", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Roberto Diniz", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Limpeza final", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Roberto Diniz", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Fotos finais", obrigatorio:"RECOMENDADO", responsavelPadrao:"Roberto Diniz", prazoPadraoDias:1, permiteAvancoExcepcional:true},
      {titulo:"Conferência final com cliente", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Roberto Diniz", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
    FINALIZADA: [
      {titulo:"Conferência final de qualidade", obrigatorio:"OBRIGATORIO", responsavelPadrao:"Beatriz Nogueira", prazoPadraoDias:1, permiteAvancoExcepcional:true},
    ],
  };

  // pesos padrão do índice de desempenho (seção 71)
  const PESOS_DESEMPENHO_DEFAULT = { valorProcessado:30, pontualidade:20, qualidade:20, pendencias:15, velocidadeResolucao:10, participacao:5 };

  // meta mensal (seção 67)
  const META_MENSAL = { valor: 1360000, mes: TODAY.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}) };

  // notificações — quais alertas ficam ativos (seção 72)
  const NOTIFICACOES_DEFAULT = {
    pendenciaVencendo:true, tarefaAtrasada:true, obraEmRisco:true, entregaProxima:true,
    assistenciaVencida:true, fornecedorAtrasado:false,
  };

  // ============================================================
  // ASSISTÊNCIAS (seção 44-47) — dados de exemplo
  // ============================================================
  const CATEGORIAS_ASSISTENCIA = ["Ajuste","Regulagem","Dano","Ferragem","Porta","Gaveta","LED","Vidro","Serralheria","Acabamento","Outro"];
  const ASSISTENCIAS = [
    { id:uid("asst"), obraId:"real-bothanic", obraNome:"Ricardo Bothanic (Apto 901B)", ambienteNome:"Cozinha", movelNome:"Armário Superior + Inferior",
      cliente:"Ricardo Bothanic", descricao:"Gaveta da bancada não fecha totalmente", categoria:"Gaveta", origem:"Montagem",
      data:dOff(-6), prioridade:"MEDIA", responsavel:"Roberto Diniz", prazo:dOff(2), status:"AGENDADA", foto:null },
    { id:uid("asst"), obraId:"odonto-radi", obraNome:"Clínica Odonto Radi", ambienteNome:"Recepção", movelNome:"Balcão de Recepção",
      cliente:"Clínica Odonto Radi", descricao:"Porta do balcão desalinhada após uso", categoria:"Porta", origem:"Transporte",
      data:dOff(-2), prioridade:"BAIXA", responsavel:"Roberto Diniz", prazo:dOff(5), status:"ABERTA", foto:null },
    { id:uid("asst"), obraId:"os336", obraNome:"Marcela e Cristiano", ambienteNome:"Térreo Sala", movelNome:"Buffet Suspenso",
      cliente:"Marcela e Cristiano", descricao:"Cliente pediu troca de puxador — solicitação de garantia", categoria:"Ferragem", origem:"Cliente",
      data:dOff(-1), prioridade:"BAIXA", responsavel:"Fernanda Costa", prazo:dOff(10), status:"EM_TRIAGEM", foto:null },
  ];

  // ============================================================
  // export
  // ============================================================
  M.TODAY = TODAY;
  M.dOff = dOff;
  M.todayISO = todayISO;
  M.ETAPAS_SEED = ETAPAS_SEED;
  M.STAGE_GROUPS = STAGE_GROUPS;
  M.REQUISITOS_SEED = REQUISITOS_SEED;
  M.CATEGORIAS_PENDENCIA = CATEGORIAS_PENDENCIA;
  M.CATEGORIAS_PENDENCIA_DEF = CATEGORIAS_PENDENCIA_DEF;
  M.categoriaDef = categoriaDef;
  M.FLUXOS_PENDENCIA_PADRAO = FLUXOS_PENDENCIA_PADRAO;
  M.TIPOS_COMPONENTE = TIPOS_COMPONENTE;
  M.TIPO_COMPONENTE_TO_CATEGORIA = TIPO_COMPONENTE_TO_CATEGORIA;
  M.COMPONENTES_CHECKLIST_PADRAO = COMPONENTES_CHECKLIST_PADRAO;
  M.ORIGENS_PROBLEMA = ORIGENS_PROBLEMA;
  M.PERFIS = PERFIS;
  M.perfilDef = perfilDef;
  M.COLABORADORES = COLABORADORES;
  M.colabByNome = colabByNome;
  M.OBRAS = OBRAS;
  M.PENDENCIAS = PENDENCIAS;
  M.TAREFAS = TAREFAS;
  M.LOTES = LOTES;
  M.TAREFAS_PADRAO_ETAPA = TAREFAS_PADRAO_ETAPA;
  M.PESOS_DESEMPENHO_DEFAULT = PESOS_DESEMPENHO_DEFAULT;
  M.META_MENSAL = META_MENSAL;
  M.NOTIFICACOES_DEFAULT = NOTIFICACOES_DEFAULT;
  M.CATEGORIAS_ASSISTENCIA = CATEGORIAS_ASSISTENCIA;
  M.ASSISTENCIAS = ASSISTENCIAS;
  M.uid = uid;
})();
