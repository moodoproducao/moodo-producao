const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
function executar(contexto, arquivo){
  vm.runInContext(fs.readFileSync(path.join(root, arquivo), "utf8"), contexto, {filename:arquivo});
}
function contextoBase(){
  const memoria = new Map();
  const contexto = vm.createContext({
    console, Date, Math, JSON, Promise, Set, Map,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: {
      getItem(chave){ return memoria.has(chave) ? memoria.get(chave) : null; },
      setItem(chave, valor){ memoria.set(chave, String(valor)); },
    },
  });
  contexto.window = contexto;
  contexto.document = {currentScript:{src:"https://teste.local/js/pdf-import.js"}};
  return contexto;
}

const app = contextoBase();

// ------------------------------------------------------------------
// Relogio: TODAY/todayISO precisa refletir a data real do aparelho - nao
// pode voltar a ser a antiga data fixa do prototipo (bug P0 da Fase 0).
// ------------------------------------------------------------------
executar(app, "js/data.js");
const agora = new Date();
const hojeEsperado = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,"0")}-${String(agora.getDate()).padStart(2,"0")}`;
assert.equal(app.M.todayISO(), hojeEsperado);

// ------------------------------------------------------------------
// PDF import: detectarComponentes - LED nasce desmarcado (nao gera
// pendencia padrao), Espelho/Serralheria geram pendencia padrao.
// ------------------------------------------------------------------
executar(app, "js/pdf-import.js");
const componentesDetectados = app.M.PdfImport.detectarComponentes("Painel com fita LED, espelho e estrutura em metalon");
assert.equal(componentesDetectados.find(c=>c.tipo==="LED").geraPendenciaPadrao, false);
assert.equal(componentesDetectados.find(c=>c.tipo==="Espelho").geraPendenciaPadrao, true);
assert.equal(componentesDetectados.find(c=>c.tipo==="Serralheria").geraPendenciaPadrao, true);

// PDF import: parseDocumento - quando ha Subtotal, ele prevalece sobre
// quantidade x valor unitario; combinar() usa o total oficial do orcamento
// (valorBrutoTotal) como fonte de verdade, ratiando os itens se necessario.
const doc = app.M.PdfImport.parseDocumento([
  "ORCAMENTO No 2026/999", "Cliente: Teste Responsavel: Willian Souza Telefone: 11 Email: teste@exemplo.com",
  "COZINHA", "Armario superior", "Quantidade: 2 Valor: R$ 100,00 Subtotal: R$ 200,00",
  "Total ambiente: R$ 200,00", "VALOR TOTAL DO ORCAMENTO: R$ 250,00",
]);
assert.equal(doc.ambientes[0].itens[0].valorBruto, 200);
const combinado = app.M.PdfImport.combinar(doc, null);
assert.equal(combinado.valorBrutoTotal, 250);
assert.equal(combinado.itensOrc.reduce((s,i)=>s+i.valorBruto,0), 250);

// PDF import: documento sem nenhum valor (so uma OS, sem orcamento) -
// combinar() precisa admitir isso sem quebrar, marcando temValores:false.
const osSemValor = app.M.PdfImport.parseDocumento([
  "ORDEM DE SERVICO No 2026/998", "Cliente: Teste Responsavel: Pessoa Externa Telefone: 11 Email: teste@exemplo.com",
  "SALA", "Painel", "Quantidade: 2", "OBSERVACOES DO ORCAMENTO",
]);
const combinadoSemValor = app.M.PdfImport.combinar(null, osSemValor);
assert.equal(combinadoSemValor.valorBrutoTotal, 0);
assert.equal(combinadoSemValor.temValores, false);

// ------------------------------------------------------------------
// Nova Obra: componente desmarcado na revisao (checkbox) nao pode virar
// componente critico/pendencia inicial da obra - so quem estiver marcado
// como true em UIState.novaObra.componentesSelecionados entra em
// componentesCriticosIniciais (ver js/pages/novaObra.js: novaObraMontar).
// ------------------------------------------------------------------
app.M.UI = {};
app.M.Pages = {};
app.M.UIState = {novaObra:{
  dados:{
    numeroOS:"OS 9999/10", cliente:"Teste", responsavel:"Externo", valorBrutoTotal:100, valorFinalVendido:100,
    data:app.M.todayISO(), dataEntregaPrevista:null, endereco:"", telefone:"", email:"",
    itensOrc:[{ambiente:"SALA",item:"Painel",qtd:1,valorBruto:100}],
    ambientes:[{nome:"SALA",itens:[{item:"Painel",materiaisEspeciais:[
      {chave:"0:0:0",nome:"Espelho",tipo:"Espelho",geraPendenciaPadrao:true},
      {chave:"0:0:1",nome:"LED",tipo:"LED",geraPendenciaPadrao:false},
    ]}]}],
  },
  ambientesAjuste:{}, enderecoManual:"", numeroOSManual:"OS 9999/10", clienteManual:"Teste", responsavelProducao:"Willian Souza",
  componentesSelecionados:{"0:0:0":true,"0:0:1":false},
}};
executar(app, "js/pages/novaObra.js");
const obraMontada = app.M.Pages.novaObraMontar();
assert.deepEqual(Array.from(obraMontada.ambientes[0].moveis[0].componentesCriticosIniciais, c=>c.tipo), ["Espelho"]);
assert.equal(obraMontada.valorBruto, 100);
assert.equal(obraMontada.valorLiquido, 100);

executar(app, "js/store.js");

// ------------------------------------------------------------------
// Store.criarObra: componente critico marcado na revisao (Espelho) precisa
// nascer com uma pendencia real vinculada (nao fica so decorativo) e essa
// pendencia precisa bloquear o avanco do movel (Store.bloqueiosMovel).
// ------------------------------------------------------------------
const obraComComponenteCriado = app.M.Store.criarObra(obraMontada);
const movelComEspelho = obraComComponenteCriado.ambientes[0].moveis[0];
assert.equal(movelComEspelho.componentesCriticos.length, 1);
assert.equal(movelComEspelho.componentesCriticos[0].tipo, "Espelho");
assert.equal(movelComEspelho.componentesCriticos[0].status, "AGUARDANDO");
const pendenciaDoEspelho = app.M.Store.state.pendencias.find(p=>p.id===movelComEspelho.componentesCriticos[0].pendenciaId);
assert.ok(pendenciaDoEspelho, "componente critico precisa ter gerado uma pendencia real");
assert.equal(pendenciaDoEspelho.movelId, movelComEspelho.id);
assert.equal(pendenciaDoEspelho.categoria, "Espelho");
assert.equal(app.M.Store.bloqueiosMovel(movelComEspelho.id).length, 1);

// ------------------------------------------------------------------
// ACHADO DA AUDITORIA (nao e bug da Fase 0, e comportamento real hoje):
// Store.criarObra NAO valida OS duplicada, responsavel ou rateio - essas
// checagens existiam so no teste antigo e nao existem mais em js/store.js.
// ------------------------------------------------------------------
const obrasAntesDup = app.M.Store.state.obras.length;
const obraDuplicadaMontada = app.M.Pages.novaObraMontar();
assert.equal(obraDuplicadaMontada.numeroOS, obraMontada.numeroOS);
app.M.Store.criarObra(obraDuplicadaMontada);
assert.equal(app.M.Store.state.obras.length, obrasAntesDup+1);
assert.equal(app.M.Store.state.obras.filter(o=>o.numeroOS===obraMontada.numeroOS).length, 2);

// ------------------------------------------------------------------
// Store.criarObra: caso "sem preco no PDF".
// ------------------------------------------------------------------
app.M.UIState.novaObra.dados = Object.assign({}, combinadoSemValor, {valorFinalVendido:100});
app.M.UIState.novaObra.numeroOSManual = "OS 9999/2";
app.M.UIState.novaObra.clienteManual = "Cliente Sem Preco";
const obraSemPrecoMontada = app.M.Pages.novaObraMontar();
assert.equal(obraSemPrecoMontada.valorBruto, 100);
assert.equal(obraSemPrecoMontada.valorLiquido, 100);
const obraSemPrecoCriada = app.M.Store.criarObra(obraSemPrecoMontada);
assert.equal(obraSemPrecoCriada.fatorLiquido, 1);
assert.equal(obraSemPrecoCriada.ambientes[0].valorLiquido, 100);
const primeiraEtapaAtiva = app.M.Store.etapasAtivas()[0].id;
assert.equal(obraSemPrecoCriada.ambientes[0].moveis[0].etapa, primeiraEtapaAtiva);

// ------------------------------------------------------------------
// Store.moverEtapa: historico central Store.state.historico (Store.log).
// ------------------------------------------------------------------
const historicoAntes = app.M.Store.state.historico.length;
const moverResultado = app.M.Store.moverEtapa(movelComEspelho.id, "MEDICAO", {ignorarRequisitos:true});
assert.equal(moverResultado.ok, true);
assert.equal(movelComEspelho.etapa, "MEDICAO");
assert.ok(app.M.Store.state.historico.length > historicoAntes);
assert.equal(app.M.Store.state.historico[0].tipo, "MUDANCA_ETAPA");

// ------------------------------------------------------------------
// Store.resolverPendencia: sincroniza componente critico + libera bloqueio.
// ------------------------------------------------------------------
app.M.Store.resolverPendencia(pendenciaDoEspelho.id);
assert.equal(pendenciaDoEspelho.status, "RESOLVIDA");
assert.equal(movelComEspelho.componentesCriticos[0].status, "RESOLVIDO");
assert.equal(app.M.Store.bloqueiosMovel(movelComEspelho.id).length, 0);

// ------------------------------------------------------------------
// NOVO - Store.pode()/setPermissao(): override por perfil.
// ------------------------------------------------------------------
const usuarioOriginal = app.M.Store.state.usuarioAtual;
assert.equal(app.M.Store.pode("verIndicadores"), true);
app.M.Store.setUsuarioAtual("Willian Souza");
assert.equal(app.M.Store.pode("verIndicadores"), false);
const tentativaSemPermissao = app.M.Store.setPermissao("OPERADOR", "verIndicadores", true);
assert.equal(tentativaSemPermissao.ok, false);
assert.equal(tentativaSemPermissao.motivo, "SEM_PERMISSAO");
app.M.Store.setUsuarioAtual("Paulo Henrique");
const overrideAplicado = app.M.Store.setPermissao("OPERADOR", "verIndicadores", true);
assert.equal(overrideAplicado.ok, true);
app.M.Store.setUsuarioAtual("Willian Souza");
assert.equal(app.M.Store.pode("verIndicadores"), true);
app.M.Store.setUsuarioAtual(usuarioOriginal);

// ------------------------------------------------------------------
// Indicadores: M.Calc.indicadores() - leitura direta do estado atual.
// ------------------------------------------------------------------
executar(app, "js/calc.js");
const allMoveisOriginal = app.M.Store.allMoveis;
app.M.Store.allMoveis = ()=>[
  {m:{etapa:"MEDICAO",   valorLiquido:50}},
  {m:{etapa:"CORTE",     valorLiquido:80}},
  {m:{etapa:"EMBALAGEM", valorLiquido:100}},
  {m:{etapa:"ENTREGA",   valorLiquido:150}},
  {m:{etapa:"MONTAGEM",  valorLiquido:200}},
];
const indicadores = app.M.Calc.indicadores();
assert.equal(indicadores.liberado, 530);
assert.equal(indicadores.produzido, 450);
assert.equal(indicadores.entregue, 350);
assert.equal(indicadores.montado, 200);
assert.equal(indicadores.emProducao, 80);
assert.equal(indicadores.aguardandoMontagem, 150);
assert.equal(indicadores.moveisProduzidos, 3);
app.M.Store.allMoveis = allMoveisOriginal;

// ------------------------------------------------------------------
// NOVO - M.Calc.diasAte / diasDesde.
// ------------------------------------------------------------------
assert.equal(app.M.Calc.diasAte(app.M.dOff(5)), 5);
assert.equal(app.M.Calc.diasAte(app.M.dOff(-3)), -3);
assert.equal(app.M.Calc.diasDesde(app.M.dOff(-7)), 7);
assert.equal(app.M.Calc.diasDesde(app.M.todayISO()), 0);

// ==================================================================
// FASE 1 (V2) - permissoes por acao: MENU / ROTA / ACAO + compatibilidade.
// Rodada 2 (ajustes pedidos apos revisao): matriz corrigida - nada de
// permissao emprestada so pra preservar item de menu legado.
// ==================================================================
executar(app, "js/router.js");

function comoUsuario(nome, fn){
  const original = app.M.Store.state.usuarioAtual;
  app.M.Store.setUsuarioAtual(nome);
  try{ return fn(); } finally { app.M.Store.setUsuarioAtual(original); }
}
// mesmo predicado usado em js/main.js (filtraPorPermissao) e no guard de
// rota de render() - reimplementado aqui de proposito (sem executar
// main.js, que precisa de DOM/addEventListener que este harness nao
// simula), pra testar a MESMA regra de dados que o app usa de verdade.
function itemVisivel(it){ return !it.perm || app.M.Store.pode(it.perm); }
function menuVisivelPara(nome, menuArr){
  return comoUsuario(nome, ()=> menuArr.flatMap(g=> g.items.filter(itemVisivel).map(it=>it.key)));
}
// mesma semantica string-ou-array de M.Router.ROUTE_PERMS usada em
// js/main.js render() - reimplementada aqui pelo mesmo motivo (sem DOM).
function passaNaRota(routeKey){
  const perm = app.M.Router.ROUTE_PERMS[routeKey];
  if(!perm) return true;
  return Array.isArray(perm) ? perm.some(p=> app.M.Store.pode(p)) : app.M.Store.pode(perm);
}

// ---- exemplo obrigatorio do handoff: MONTADOR -> CRIAR OBRA = NAO nas 3 camadas ----
assert.equal(comoUsuario("Roberto Diniz", ()=> app.M.Store.pode("obra.criar")), false, "Montador: MENU (botao Nova Obra) deveria estar oculto");
assert.equal(comoUsuario("Roberto Diniz", ()=> passaNaRota("nova-obra")), false, "Montador: ROTA #/nova-obra deveria estar bloqueada");
assert.equal(comoUsuario("Roberto Diniz", ()=> app.M.Store.pode("obra.criar")), false, "Montador: ACAO obra.criar deveria ser negada");
assert.equal(comoUsuario("Paulo Henrique", ()=> app.M.Store.pode("obra.criar")), true);
assert.equal(comoUsuario("Paulo Henrique", ()=> passaNaRota("nova-obra")), true);

// ---- item 6.1/6.2 do pedido de ajuste: Producao e Montador nao acessam mais
// Assistencias/Agenda/Equipe/Admin por padrao (a rodada 1 tinha dado essas
// permissoes so pra preservar o menu antigo - corrigido) ----
comoUsuario("Willian Souza", ()=>{ // OPERADOR = Producao
  assert.equal(app.M.Store.pode("assistencia.ver"), false, "Producao nao deveria acessar Assistencias por padrao");
  assert.equal(app.M.Store.pode("agenda.ver"), false, "Producao nao deveria acessar Agenda geral por padrao");
  assert.equal(app.M.Store.pode("admin.equipe"), false, "Producao nao deveria acessar Equipe por padrao");
  assert.equal(app.M.Store.pode("obra.ver"), false);
  assert.equal(app.M.Store.pode("obra.criar"), false);
  assert.equal(app.M.Store.pode("obra.editar"), false);
  assert.equal(Object.keys(app.M.perfilDef("OPERADOR").pode).filter(k=>k.startsWith("admin.")).every(k=> app.M.perfilDef("OPERADOR").pode[k]===false), true, "Producao nao deveria ter nenhum admin.* por padrao");
});
comoUsuario("Roberto Diniz", ()=>{ // MONTADOR
  assert.equal(app.M.Store.pode("assistencia.ver"), false, "Montador nao deveria acessar Assistencias como modulo geral");
  assert.equal(app.M.Store.pode("admin.equipe"), false, "Montador nao deveria acessar Equipe por padrao");
  // mas continua com o que e literalmente o trabalho dele:
  assert.equal(app.M.Store.pode("montagem.ver"), true);
  assert.equal(app.M.Store.pode("montagem.marcarPronto"), true);
  assert.equal(app.M.Store.pode("agenda.ver"), true, "Montador mantem agenda.ver (pedido explicito)");
});

// ---- item 6.3: Montador continua podendo acessar contexto de obra atribuido ----
comoUsuario("Roberto Diniz", ()=>{
  assert.equal(app.M.Store.pode("obra.verTodas"), false);
  assert.equal(app.M.Store.pode("obra.verAtribuidas"), true, "Montador precisa continuar abrindo obra pelo contexto atribuido");
  assert.equal(app.M.Store.pode("obra.verContexto"), true);
  assert.equal(passaNaRota("obra"), true, "guard OR da rota 'obra' nao pode travar o Montador (tem verAtribuidas/verContexto) - so confirma que a PERMISSAO existe");
});

// ==================================================================
// RODADA 3, item 1: guard CONTEXTUAL REAL da rota "obra/:id" -
// Store.podeAbrirObra(obraId). Ter a permissao (verAtribuidas/verContexto)
// nao basta mais - o obraId da URL precisa estar de verdade no conjunto de
// Store.obraIdsDoColaborador(usuario atual). Seed de dados usado (6 obras
// no total): os336, casa-augusto, casa-gomes, real-bothanic, odonto-radi,
// cozinha-iris.
// ==================================================================

// ---- Montador: obra atribuida = permitido / obra nao atribuida = negado ----
comoUsuario("Roberto Diniz", ()=>{
  const minhas = app.M.Store.obraIdsDoColaborador("Roberto Diniz");
  assert.ok(minhas.has("real-bothanic"), "pre-condicao do teste: Roberto Diniz precisa ter algo atribuido em real-bothanic (assistencia responsavel dele, no seed)");
  assert.equal(app.M.Store.podeAbrirObra("real-bothanic"), true, "Montador ABRE obra onde tem algo atribuido");
  assert.ok(!minhas.has("os336"), "pre-condicao do teste: Roberto Diniz NAO pode ter nada atribuido em os336 no seed");
  assert.equal(app.M.Store.podeAbrirObra("os336"), false, "Montador NAO abre obra so porque digitou o ID na URL - precisa estar atribuida a ele");
});

// ---- Producao: obra ligada a contexto proprio = permitido / obra aleatoria = negado ----
comoUsuario("Willian Souza", ()=>{
  assert.equal(app.M.Store.pode("obra.verTodas"), false);
  assert.equal(app.M.Store.pode("obra.verContexto"), true);
  const minhas = app.M.Store.obraIdsDoColaborador("Willian Souza");
  assert.ok(minhas.has(obraComComponenteCriado.id), "pre-condicao: a pendencia do componente critico (Espelho) ficou com responsavel:Willian Souza, entao a obra dele deveria estar no contexto");
  assert.equal(app.M.Store.podeAbrirObra(obraComComponenteCriado.id), true, "Producao ABRE a obra onde tem uma pendencia sob sua responsabilidade");
  assert.ok(!minhas.has(obraSemPrecoCriada.id), "pre-condicao: obraSemPrecoCriada nao gerou nenhuma pendencia/tarefa/assistencia com responsavel Willian Souza");
  assert.equal(app.M.Store.podeAbrirObra(obraSemPrecoCriada.id), false, "Producao NAO abre uma obra aleatoria, mesmo tendo obra.verContexto=true");
});

// ---- Assistencia: obra vinculada ao atendimento = permitido / obra sem vinculo = negado ----
comoUsuario("Paulo Henrique", ()=>{
  const alvo = app.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
  const perfilOriginal = alvo.perfil;
  alvo.perfil = "ASSISTENCIA";
  comoUsuario("Ana Ferreira", ()=>{
    // antes de criar o atendimento: sem vinculo nenhum com nenhuma das duas obras usadas no teste
    assert.ok(!app.M.Store.obraIdsDoColaborador("Ana Ferreira").has("odonto-radi"));
    assert.ok(!app.M.Store.obraIdsDoColaborador("Ana Ferreira").has("cozinha-iris"));
    assert.equal(app.M.Store.podeAbrirObra("odonto-radi"), false, "sem atendimento vinculado, Assistencia ainda nao pode abrir esta obra");
    // cria o atendimento de assistencia dela (assistencia.criar=true) - o guard de acao (rodada 2) ja garante isso funciona de verdade
    const rAssist = app.M.Store.criarAssistencia({obraId:"odonto-radi", obraNome:"Clínica Odonto Radi", categoria:"Outro", descricao:"teste guard contextual", responsavel:"Ana Ferreira"});
    assert.equal(rAssist.ok, true);
    assert.equal(app.M.Store.podeAbrirObra("odonto-radi"), true, "Assistencia ABRE a obra vinculada ao proprio atendimento, agora que ele existe");
    assert.equal(app.M.Store.podeAbrirObra("cozinha-iris"), false, "Assistencia NAO abre uma obra sem nenhum atendimento/pendencia/tarefa vinculado a ela");
  });
  alvo.perfil = perfilOriginal;
});

// ---- Admin/PCP/Lider/Gestor com obra.verTodas=true: sempre permitido, qualquer obra ----
comoUsuario("Paulo Henrique", ()=>{ // ADMIN
  assert.equal(app.M.Store.pode("obra.verTodas"), true);
  assert.equal(app.M.Store.podeAbrirObra("os336"), true, "Admin abre qualquer obra");
  assert.equal(app.M.Store.podeAbrirObra("cozinha-iris"), true, "Admin abre qualquer obra, mesmo sem nenhum vinculo pessoal");
});
comoUsuario("Beatriz Nogueira", ()=>{ // PCP
  assert.equal(app.M.Store.pode("obra.verTodas"), true);
  assert.equal(app.M.Store.podeAbrirObra("os336"), true, "PCP (verTodas=true) abre qualquer obra");
});
comoUsuario("Juliana Prado", ()=>{ // LIDERANCA / Lider
  assert.equal(app.M.Store.pode("obra.verTodas"), true);
  assert.equal(app.M.Store.podeAbrirObra("cozinha-iris"), true, "Lider (verTodas=true) abre qualquer obra");
});
comoUsuario("Paulo Henrique", ()=>{ // GESTOR (reatribuicao temporaria, igual ao bloco do item 6.5)
  const alvo = app.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
  const perfilOriginal = alvo.perfil;
  alvo.perfil = "GESTOR";
  comoUsuario("Ana Ferreira", ()=>{
    assert.equal(app.M.Store.pode("obra.verTodas"), true);
    assert.equal(app.M.Store.podeAbrirObra("odonto-radi"), true, "Gestor (verTodas=true) abre qualquer obra");
  });
  alvo.perfil = perfilOriginal;
});

// ---- caso de borda: sem obraId nenhum (rota "obra" sem parametro) nunca libera por engano, mesmo pra quem so tem verAtribuidas/verContexto ----
comoUsuario("Roberto Diniz", ()=> assert.equal(app.M.Store.podeAbrirObra(undefined), false, "sem obraId, nega por padrao (Montador nao tem verTodas)"));
comoUsuario("Paulo Henrique", ()=> assert.equal(app.M.Store.podeAbrirObra(undefined), true, "sem obraId, verTodas ainda libera (Admin)"));

// ---- perfil x menu: itens que devem ter sumido de verdade (nao so por
// nao terem chave "perm" antes - agora tem, e a permissao default e false) ----
const menuMontador = menuVisivelPara("Roberto Diniz", app.M.Router.MENU_OPERADOR);
assert.ok(!menuMontador.includes("obras"), "Montador nao deveria ver 'Obras' no menu");
assert.ok(!menuMontador.includes("assistencias"), "Montador NAO deveria mais ver 'Assistencias' no menu (corrigido nesta rodada)");
const footerMontador = comoUsuario("Roberto Diniz", ()=> app.M.Router.FOOTER_OPERADOR.filter(itemVisivel).map(it=>it.key));
assert.ok(!footerMontador.includes("equipe"), "Montador NAO deveria mais ver 'Equipe' no rodape (corrigido nesta rodada)");
const menuProducao = menuVisivelPara("Willian Souza", app.M.Router.MENU_OPERADOR);
assert.ok(!menuProducao.includes("assistencias") && !menuProducao.includes("calendario"), "Producao nao deveria ver Assistencias/Calendario no menu");
const menuAdmin = menuVisivelPara("Paulo Henrique", app.M.Router.MENU);
assert.ok(menuAdmin.includes("obras") && menuAdmin.includes("indicadores") && menuAdmin.includes("auditoria") && menuAdmin.includes("producao"), "Admin deveria ver tudo, incluindo Producao (item 1 novo: producao.ver)");

// ---- item 6.4: PCP nao acessa Configuracoes/Admin por padrao ----
comoUsuario("Beatriz Nogueira", ()=>{
  assert.equal(app.M.Store.pode("admin.configuracoes"), false, "PCP nao deveria acessar Configuracoes por padrao (corrigido nesta rodada)");
  assert.equal(app.M.Store.pode("admin.equipe"), false, "PCP nao deveria acessar Equipe por padrao");
  assert.equal(app.M.Store.pode("admin.auditoria"), false, "PCP nao deveria acessar Auditoria por padrao");
  assert.equal(app.M.Store.pode("admin.indicadores"), false, "PCP nao deveria acessar Indicadores por padrao");
  assert.equal(passaNaRota("configuracoes"), false, "ROTA #/configuracoes deveria bloquear PCP agora");
  // mas continua com as acoes operacionais de pre-producao:
  assert.equal(app.M.Store.pode("obra.criar"), true);
  assert.equal(app.M.Store.pode("obra.editar"), true);
  assert.equal(app.M.Store.pode("montagem.marcarPronto"), true);
  assert.equal(app.M.Store.pode("pendencia.atribuir"), true);
  assert.equal(app.M.Store.pode("admin.usuarios"), false, "PCP nao deveria poder gerenciar usuarios (so ADMIN)");
});

// ---- item 6.5: Gestor nao arquiva/cancela obra por padrao ----
comoUsuario("Paulo Henrique", ()=>{
  const alvo = app.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
  const perfilOriginal = alvo.perfil;
  alvo.perfil = "GESTOR";
  comoUsuario("Ana Ferreira", ()=>{
    assert.equal(app.M.Store.pode("obra.arquivar"), false, "Gestor nao deveria arquivar obra por padrao");
    assert.equal(app.M.Store.pode("obra.cancelar"), false, "Gestor nao deveria cancelar obra por padrao");
    assert.equal(app.M.Store.pode("obra.criar"), true); // resto do acesso amplo continua
  });
  alvo.perfil = perfilOriginal;
});

// ---- item 6.6: TV nao possui nenhuma acao mutavel ----
{
  const mutaveis = ["pendencia.criar","pendencia.editar","pendencia.atribuir","pendencia.resolver",
    "montagem.marcarPronto","montagem.aprovarFinalizacao","montagem.finalizarComRessalva",
    "assistencia.criar","assistencia.editar","assistencia.concluir",
    "agenda.criar","agenda.editar","obra.criar","obra.editar","obra.arquivar","obra.cancelar",
    "admin.configuracoes","admin.usuarios","tv.configurar",
    "liberarExcecao","editarProcesso","editarPermissoes"];
  const podeTv = app.M.perfilDef("TV").pode;
  mutaveis.forEach(k=> assert.equal(podeTv[k], false, `TV nao deveria ter "${k}"=true (perfil precisa ser 100% leitura)`));
  // e as leituras documentadas como necessarias pro painel continuam ligadas:
  assert.equal(podeTv["obra.ver"], true); assert.equal(podeTv["obra.verTodas"], true);
  assert.equal(podeTv["montagem.ver"], true); assert.equal(podeTv["pendencia.ver"], true);
  assert.equal(podeTv["admin.indicadores"], true);
}

// ---- item 6.7: Assistencia so acessa seu contexto ----
comoUsuario("Paulo Henrique", ()=>{
  const alvo = app.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
  const perfilOriginal = alvo.perfil;
  alvo.perfil = "ASSISTENCIA";
  comoUsuario("Ana Ferreira", ()=>{
    assert.equal(app.M.Store.pode("obra.ver"), false, "Assistencia nao deveria ver a lista geral de Obras");
    assert.equal(app.M.Store.pode("obra.verTodas"), false);
    assert.equal(app.M.Store.pode("obra.verAtribuidas"), false);
    assert.equal(app.M.Store.pode("obra.verContexto"), true, "Assistencia precisa poder abrir o contexto da obra do atendimento");
    assert.equal(app.M.Store.pode("producao.ver"), false, "Assistencia nao deveria ver o quadro de Producao");
    assert.equal(app.M.Store.pode("montagem.ver"), false, "Assistencia nao deveria ver Montagem geral");
    assert.equal(app.M.Store.pode("admin.ver"), false);
    assert.equal(app.M.Store.pode("assistencia.ver"), true);
    assert.equal(app.M.Store.pode("agenda.ver"), true);
    assert.equal(app.M.Store.pode("pendencia.ver"), true);
    const menuDaAssistencia = app.M.Router.MENU.flatMap(g=>g.items.filter(itemVisivel).map(it=>it.key));
    assert.ok(!menuDaAssistencia.includes("producao"), "Assistencia nao deveria ver 'Producao' no menu (corrigido nesta rodada)");
    assert.ok(!menuDaAssistencia.includes("obras"));
    assert.ok(!menuDaAssistencia.includes("montagem"));
  });
  alvo.perfil = perfilOriginal;
});

// ---- item 6.8: Admin continua com tudo ----
comoUsuario("Paulo Henrique", ()=>{
  Object.keys(app.M.perfilDef("ADMIN").pode).forEach(k=> assert.equal(app.M.Store.pode(k), true, `Admin deveria manter "${k}"=true`));
});

// ---- item 6.9: guards de acao existentes nao sao so visuais - chamar o
// Store direto (sem passar pela tela) e negado de verdade, com {ok:false}. ----
comoUsuario("Willian Souza", ()=>{ // Producao: pendencia.editar=false, pendencia.resolver=false
  const rCriar = app.M.Store.criarPendencia({obraId:null, categoria:"Outro", descricao:"teste guard acao", responsavel:"Willian Souza", prioridade:"BAIXA"});
  assert.equal(rCriar.ok, true, "Producao tem pendencia.criar=true, deveria conseguir criar");
  const idCriada = rCriar.pendencia.id;
  const rResolver = app.M.Store.resolverPendencia(idCriada, {});
  assert.equal(rResolver.ok, false, "Producao NAO deveria conseguir resolver pendencia direto no Store");
  assert.equal(rResolver.motivo, "SEM_PERMISSAO");
  const rEditar = app.M.Store.atualizarStatusPendencia(idCriada, "EM_TRATAMENTO");
  assert.equal(rEditar.ok, false, "Producao NAO deveria conseguir editar status de pendencia direto no Store");
});
comoUsuario("Roberto Diniz", ()=>{ // Montador: assistencia.criar=false agora
  const rAssist = app.M.Store.criarAssistencia({obraId:null, categoria:"Outro", descricao:"teste guard acao"});
  assert.equal(rAssist.ok, false, "Montador NAO deveria conseguir criar assistencia direto no Store (corrigido nesta rodada)");
  assert.equal(rAssist.motivo, "SEM_PERMISSAO");
  const rMontagem = app.M.Store.concluirMontagem(movelComEspelho.id, "1/1", false);
  assert.equal(rMontagem.ok, true, "Montador tem montagem.marcarPronto=true, deveria conseguir concluir montagem");
});
comoUsuario("Willian Souza", ()=>{ // Producao: montagem.marcarPronto=false
  const rMontagemNegada = app.M.Store.concluirMontagem(obraSemPrecoCriada.ambientes[0].moveis[0].id, "1/1", false);
  assert.equal(rMontagemNegada.ok, false, "Producao NAO deveria conseguir concluir montagem direto no Store");
  assert.equal(rMontagemNegada.motivo, "SEM_PERMISSAO");
});

// ---- override de permissao numa acao granular nova (nao so nas 10 flags antigas) ----
comoUsuario("Paulo Henrique", ()=>{
  const r1 = comoUsuario("Roberto Diniz", ()=> app.M.Store.pode("obra.arquivar"));
  assert.equal(r1, false);
  const resultadoOverride = app.M.Store.setPermissao("MONTADOR", "obra.arquivar", true);
  assert.equal(resultadoOverride.ok, true);
  assert.equal(comoUsuario("Roberto Diniz", ()=> app.M.Store.pode("obra.arquivar")), true, "override deveria valer pra chave granular nova, igual valia pras 10 antigas");
  app.M.Store.setPermissao("MONTADOR", "obra.arquivar", false); // desfaz, nao deixar residuo pros testes seguintes
});

// ---- compatibilidade: flags antigas continuam funcionando do jeito que sempre funcionaram ----
comoUsuario("Willian Souza", ()=> assert.equal(app.M.Store.pode("verConfiguracoes"), false));

// ---- perfis novos existem, tem a matriz nova inteira, e ninguem foi atribuido automaticamente ----
assert.ok(app.M.PERFIS.some(p=>p.key==="GESTOR"));
assert.ok(app.M.PERFIS.some(p=>p.key==="ASSISTENCIA"));
assert.equal(app.M.COLABORADORES.filter(c=>c.perfil==="GESTOR").length, 0, "nenhum colaborador deveria ter sido atribuido a GESTOR automaticamente");
assert.equal(app.M.COLABORADORES.filter(c=>c.perfil==="ASSISTENCIA").length, 0, "nenhum colaborador deveria ter sido atribuido a ASSISTENCIA automaticamente");
comoUsuario("Paulo Henrique", ()=>{
  const r = app.M.Store.setPermissao("ASSISTENCIA", "pendencia.resolver", false);
  assert.equal(r.ok, true); // confirma que o editor de permissoes aceita os 2 perfis novos sem erro
  app.M.Store.setPermissao("ASSISTENCIA", "pendencia.resolver", true); // desfaz
});

// ---- renomeacao conceitual (OPERADOR->Producao / LIDERANCA->Lider) sem quebrar dado existente ----
assert.equal(app.M.perfilDef("OPERADOR").label, "Produção");
assert.equal(app.M.perfilDef("LIDERANCA").label, "Líder");
assert.ok(app.M.COLABORADORES.some(c=>c.perfil==="OPERADOR"), "colaboradores salvos com perfil=OPERADOR precisam continuar resolvendo normalmente");
comoUsuario("Willian Souza", ()=> assert.equal(app.M.Store.perfilAtual().key, "OPERADOR")); // dado salvo (perfil:"OPERADOR") nao quebrou

// ---- montagem.finalizarComRessalva: aditivo, nao troca quem ja podia (liberarExcecao) ----
comoUsuario("Juliana Prado", ()=>{ // LIDERANCA: liberarExcecao=true de sempre
  assert.equal(app.M.Store.pode("liberarExcecao"), true);
  assert.equal(app.M.Store.pode("montagem.finalizarComRessalva"), true);
});

// ---- RODADA 3, item 2: Lider (LIDERANCA) perde admin.indicadores por padrao ----
comoUsuario("Juliana Prado", ()=>{
  assert.equal(app.M.Store.pode("admin.indicadores"), false, "Lider nao deveria acessar Indicadores por padrao (corrigido na rodada 3)");
  assert.equal(passaNaRota("indicadores"), false, "ROTA #/indicadores deveria bloquear o Lider agora");
  assert.equal(passaNaRota("desempenho"), false, "ROTA #/desempenho (mesma chave admin.indicadores) tambem deveria bloquear o Lider");
  const menuDoLider = app.M.Router.MENU.flatMap(g=>g.items.filter(itemVisivel).map(it=>it.key));
  assert.ok(!menuDoLider.includes("indicadores"), "Indicadores nao deveria mais aparecer no menu do Lider");
  assert.ok(!menuDoLider.includes("desempenho"), "Desempenho nao deveria mais aparecer no menu do Lider");
  // resto do acesso operacional do Lider continua intacto:
  assert.equal(app.M.Store.pode("liberarExcecao"), true);
  assert.equal(app.M.Store.pode("obra.editar"), true);
  assert.equal(app.M.Store.pode("pendencia.atribuir"), true);
});

// ------------------------------------------------------------------
// Compatibilidade de migracao: Store.load() precisa mesclar de verdade
// (mergePermissoes), nao so "OU" cru - um estado salvo ANTES da Fase 1
// (so com os 6 perfis antigos, so com as 10 flags antigas, com uma
// customizacao real de administrador) precisa, ao carregar:
//  1) preservar a customizacao ja feita (nao perder edicao de admin);
//  2) ganhar as chaves de acao novas nos perfis que ja existiam, com o
//     padrao atual (nao ficar faltando, o que quebraria a tela de edicao);
//  3) ganhar os perfis novos (GESTOR/ASSISTENCIA) inteiros, com o padrao
//     atual - um estado salvo antes deles existirem nunca teve essas chaves.
// ------------------------------------------------------------------
const appMigracao = contextoBase();
const estadoAntigoSimulado = {
  obras: [{id:"obra-legado-1", cliente:"Cliente Legado", numeroOS:"OS 1", ambientes:[]}],
  permissoes: {
    ADMIN:     {verValores:false, verIndicadores:true, verDesempenho:true, verRanking:true, verAuditoria:true, verTodasObras:true, verConfiguracoes:true, liberarExcecao:true, editarProcesso:true, editarPermissoes:true},
    PCP:       {verValores:true, verIndicadores:true, verDesempenho:true, verRanking:true, verAuditoria:true, verTodasObras:true, verConfiguracoes:true, liberarExcecao:true, editarProcesso:true, editarPermissoes:false},
    LIDERANCA: {verValores:true, verIndicadores:true, verDesempenho:true, verRanking:true, verAuditoria:true, verTodasObras:true, verConfiguracoes:false, liberarExcecao:true, editarProcesso:false, editarPermissoes:false},
    OPERADOR:  {verValores:false, verIndicadores:false, verDesempenho:false, verRanking:true, verAuditoria:false, verTodasObras:false, verConfiguracoes:false, liberarExcecao:false, editarProcesso:false, editarPermissoes:false},
    MONTADOR:  {verValores:false, verIndicadores:false, verDesempenho:false, verRanking:true, verAuditoria:false, verTodasObras:false, verConfiguracoes:false, liberarExcecao:false, editarProcesso:false, editarPermissoes:false},
    TV:        {verValores:false, verIndicadores:true, verDesempenho:false, verRanking:false, verAuditoria:false, verTodasObras:true, verConfiguracoes:false, liberarExcecao:false, editarProcesso:false, editarPermissoes:false},
    // sem GESTOR, sem ASSISTENCIA - estado salvo antes desses perfis existirem
  },
  usuarioAtual: "Paulo Henrique",
};
appMigracao.localStorage.setItem("moodo_producao_state_v1", JSON.stringify(estadoAntigoSimulado));
executar(appMigracao, "js/data.js");
executar(appMigracao, "js/store.js");
const permMigradas = appMigracao.M.Store.state.permissoes;
assert.equal(permMigradas.ADMIN.verValores, false, "customizacao de admin salva antes da Fase 1 nao pode se perder na migracao");
assert.equal(permMigradas.ADMIN["obra.criar"], true, "perfil antigo precisa ganhar as chaves de acao novas (padrao atual) ao migrar");
assert.ok(permMigradas.GESTOR, "perfil GESTOR precisa existir em state.permissoes mesmo vindo de um estado salvo que nao o tinha");
assert.equal(permMigradas.GESTOR["obra.criar"], true);
assert.ok(permMigradas.ASSISTENCIA, "perfil ASSISTENCIA precisa existir em state.permissoes mesmo vindo de um estado salvo que nao o tinha");
assert.equal(permMigradas.ASSISTENCIA["pendencia.ver"], true);
// e o app nao pode travar calculando pode() pra ninguem depois dessa migracao:
appMigracao.M.Store.setUsuarioAtual("Paulo Henrique");
assert.equal(appMigracao.M.Store.pode("obra.criar"), true);

console.log("Regressoes criticas: OK");
