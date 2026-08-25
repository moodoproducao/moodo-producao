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
// FASE 2: precisa aceitar tambem perm em array (semantica OR - usada pelo
// item "admin" do menu), igual main.js's filtraPorPermissao passou a fazer.
function itemVisivel(it){
  if(!it.perm) return true;
  return Array.isArray(it.perm) ? it.perm.some(p=> app.M.Store.pode(p)) : app.M.Store.pode(it.perm);
}
// FASE 2 (Navegacao V2): o menu deixou de ser MENU/MENU_OPERADOR (2 listas
// fixas) e passou a ser M.Router.menuDoPerfil(perfilKey) - uma lista por
// perfil (8 no total), a MESMA fonte usada por main.js pro desktop e pro
// mobile (nav unica, sem duas navegacoes podendo divergir). Aqui aplicamos
// o mesmo filtro de permissao que main.js aplica (filtraPorPermissao) pra
// obter o menu de VERDADE que aparece pra aquele perfil. Store.pode() olha
// sempre o perfil do usuario ATUAL (M.Store.perfilAtual()) - entao so pode
// ser chamada de dentro de um comoUsuario(...) com alguem daquele perfil.
// Array.from() no final e proposital: M.Router.menuDoPerfil roda dentro do
// contexto vm isolado (realm proprio, com seu proprio Array/Array.prototype
// distinto do Node hospedeiro) - sem isso, assert.deepEqual falha por
// "mesma estrutura, mas nao referencia-iguais" mesmo com valores identicos
// (arrays de realms diferentes nao sao === -reference-equal- mesmo vazios).
function itensVisiveisDoPerfil(perfilKey){
  return Array.from(app.M.Router.menuDoPerfil(perfilKey).filter(itemVisivel), it=> it.key);
}
// menu de verdade (ja filtrado) de um colaborador REAL, pelo proprio perfil dele.
function menuVisivelPara(nome){
  return comoUsuario(nome, ()=> itensVisiveisDoPerfil(app.M.Store.perfilAtual().key));
}
// pra perfis sem colaborador dedicado no seed (GESTOR/ASSISTENCIA) - reatribui
// temporariamente o perfil de "Ana Ferreira" (mesmo padrao ja usado no resto
// deste arquivo pra testar esses perfis), le o menu ja filtrado, desfaz.
function menuVisivelReatribuindo(perfilKey){
  const alvo = app.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
  const perfilOriginal = alvo.perfil;
  alvo.perfil = perfilKey;
  const itens = menuVisivelPara("Ana Ferreira");
  alvo.perfil = perfilOriginal;
  return itens;
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

// ---- perfil x menu (FASE 2 - Navegacao V2): cada perfil tem sua propria
// lista, exata, na ordem pedida - nao so "ausencia de item legado" ----
const menuMontador = menuVisivelPara("Roberto Diniz");
assert.deepEqual(menuMontador, ["hoje","minhasObras","agenda","pendencias"], "Montador (Fase 2): Hoje, Minhas Obras, Agenda, Pendencias - nesta ordem, nada mais (equipe/obras/assistencias tambem sumiram do menu)");
const menuProducao = menuVisivelPara("Willian Souza");
assert.deepEqual(menuProducao, ["hoje","pendencias"], "Producao (Fase 2): so Hoje e Pendencias - simplificacao imediata pedida, sem Assistencias/Calendario/Agenda");
const menuAdmin = menuVisivelPara("Paulo Henrique");
assert.deepEqual(menuAdmin, ["hoje","obras","pendencias","montagem","assistencias","agenda","admin"], "Admin (Fase 2): as 7 areas de primeiro nivel da arquitetura V2, nesta ordem (Indicadores/Desempenho/Auditoria/Equipe/Configuracoes agora vivem dentro do hub 'Admin', nao mais como itens de topo)");

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
    const menuDaAssistencia = itensVisiveisDoPerfil("ASSISTENCIA");
    assert.deepEqual(menuDaAssistencia, ["hoje","atendimentos","agenda","pendencias"], "Assistencia (Fase 2): Hoje, Atendimentos, Agenda, Pendencias - nesta ordem, nada mais (sem Producao/Obras/Montagem)");
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
  const menuDoLider = itensVisiveisDoPerfil("LIDERANCA");
  assert.deepEqual(menuDoLider, ["hoje","obras","pendencias","montagem","agenda"], "Lider (Fase 2): sem Admin (perdeu admin.indicadores por padrao) - Indicadores/Desempenho nem existem mais como item de topo, viraram parte do hub Admin");
  assert.ok(!menuDoLider.includes("admin"), "Lider NAO deveria ver o item 'Admin' (nao tem nenhuma das 4 permissoes admin.* por padrao)");
  // resto do acesso operacional do Lider continua intacto:
  assert.equal(app.M.Store.pode("liberarExcecao"), true);
  assert.equal(app.M.Store.pode("obra.editar"), true);
  assert.equal(app.M.Store.pode("pendencia.atribuir"), true);
});

// ==================================================================
// FASE 2 (Navegacao V2) - testes obrigatorios da autorizacao de push:
// menu por perfil (os 8), ausencia estrutural das rotas legadas no menu,
// acesso direto as rotas legadas ainda respeitando os guards da Fase 1,
// rotas novas gating pela permissao certa, Hoje como 1o item universal,
// nenhuma permissao nova inventada, nenhum arquivo/rota legada apagada, e
// confirmacao de que a matriz de permissoes em si nao mudou 1 bit.
// ==================================================================

// ---- menu por perfil: PCP, Gestor e TV (Admin/Producao/Montador/
// Assistencia/Lider ja foram conferidos, exatos, logo acima) ----
const menuPCP = menuVisivelPara("Beatriz Nogueira");
assert.deepEqual(menuPCP, ["hoje","obras","pendencias","montagem","agenda"], "PCP (Fase 2): Hoje, Obras, Pendencias, Montagem, Agenda - sem Assistencias, sem Admin");
const menuGestor = menuVisivelReatribuindo("GESTOR");
assert.deepEqual(menuGestor, ["hoje","obras","pendencias","montagem","assistencias","agenda"], "Gestor (Fase 2): Hoje, Obras, Pendencias, Montagem, Assistencias, Agenda - sem Admin (falta admin.configuracoes das 4 exigidas)");
assert.equal(app.M.Router.menuDoPerfil("TV").length, 0, "TV (Fase 2): sem menu operacional comum - continua superficie separada, fora desta navegacao");

// ---- ausencia ESTRUTURAL das rotas legadas no menu: pra nenhum dos 8
// perfis existe item de menu apontando pra uma rota legada ----
const ROTAS_LEGADAS_HASH = ["#/producao","#/para-finalizar","#/meu-painel","#/tarefas","#/lotes",
  "#/indicadores","#/desempenho","#/auditoria","#/calendario","#/chao-de-fabrica","#/equipe",
  "#/configuracoes","#/dashboard","#/tv"];
["ADMIN","GESTOR","PCP","LIDERANCA","OPERADOR","MONTADOR","ASSISTENCIA","TV"].forEach(perfilKey=>{
  Array.from(app.M.Router.menuDoPerfil(perfilKey)).forEach(it=>{
    assert.ok(!ROTAS_LEGADAS_HASH.includes(it.route), `Item "${it.key}" do menu de ${perfilKey} nao deveria apontar pra rota legada ${it.route}`);
  });
});

// ---- rotas legadas continuam RESPONDENDO (guard da Fase 1 intacto) mesmo
// tendo sumido do menu - digitar a URL direto nao muda o comportamento ----
comoUsuario("Willian Souza", ()=>{ // Producao
  assert.equal(passaNaRota("producao"), true, "Producao ainda acessa a rota legada #/producao direto por URL (producao.ver=true) - so sumiu do MENU, o guard da rota continua igual");
  assert.equal(passaNaRota("equipe"), false, "Producao continua sem acesso a rota legada #/equipe (guard nao foi relaxado)");
  assert.equal(passaNaRota("indicadores"), false, "Producao continua sem acesso a rota legada #/indicadores");
});
comoUsuario("Roberto Diniz", ()=>{ // Montador
  assert.equal(passaNaRota("producao"), true, "Montador ainda acessa #/producao direto por URL mesmo sem estar mais no menu");
  assert.equal(passaNaRota("assistencias"), false, "Montador continua sem acesso a rota legada #/assistencias (guard nao foi relaxado)");
  assert.equal(passaNaRota("calendario"), true, "Montador continua acessando #/calendario (rota legada, mesma permissao agenda.ver de #/agenda)");
});
comoUsuario("Beatriz Nogueira", ()=>{ // PCP
  assert.equal(passaNaRota("equipe"), false, "PCP continua sem acesso a #/equipe");
  assert.equal(passaNaRota("configuracoes"), false, "PCP continua sem acesso a #/configuracoes");
  assert.equal(passaNaRota("indicadores"), false, "PCP continua sem acesso a #/indicadores");
});
comoUsuario("Juliana Prado", ()=>{ // Lider
  assert.equal(passaNaRota("indicadores"), false, "Lider continua sem acesso a #/indicadores");
  assert.equal(passaNaRota("equipe"), false, "Lider continua sem acesso a #/equipe");
});
comoUsuario("Paulo Henrique", ()=>{ // Admin
  ["producao","para-finalizar","tarefas","indicadores","desempenho","auditoria","calendario","lotes","chao-de-fabrica","equipe","configuracoes","meu-painel"]
    .forEach(k=> assert.equal(passaNaRota(k), true, `Admin deveria continuar acessando a rota legada #/${k} direto por URL`));
});

// ---- rotas NOVAS da Fase 2: gate exatamente pela permissao reaproveitada
// (nenhuma permissao nova foi criada so pra elas) ----
comoUsuario("Roberto Diniz", ()=> assert.equal(passaNaRota("minhas-obras"), true, "Montador acessa #/minhas-obras (obra.verAtribuidas=true, ja existia desde a Fase 1)"));
comoUsuario("Willian Souza", ()=> assert.equal(passaNaRota("minhas-obras"), false, "Producao NAO acessa #/minhas-obras (obra.verAtribuidas=false)"));
comoUsuario("Paulo Henrique", ()=>{
  const alvo = app.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
  const perfilOriginal = alvo.perfil;
  alvo.perfil = "ASSISTENCIA";
  comoUsuario("Ana Ferreira", ()=>{
    assert.equal(passaNaRota("atendimentos"), true, "Assistencia acessa #/atendimentos (assistencia.ver=true)");
    assert.equal(passaNaRota("agenda"), true, "Assistencia acessa #/agenda (agenda.ver=true)");
    assert.equal(passaNaRota("admin"), false, "Assistencia NAO acessa #/admin (nenhuma admin.* = true)");
  });
  alvo.perfil = perfilOriginal;
});
comoUsuario("Juliana Prado", ()=> assert.equal(passaNaRota("admin"), false, "Lider NAO acessa #/admin (nenhuma das 4 admin.* = true por padrao)"));
comoUsuario("Paulo Henrique", ()=> assert.equal(passaNaRota("admin"), true, "Admin acessa #/admin (tem as 4 permissoes admin.*)"));
comoUsuario("Willian Souza", ()=> assert.equal(passaNaRota("agenda"), false, "Producao NAO acessa #/agenda (agenda.ver=false, mesma permissao de sempre)"));

// ---- Hoje: continua sem guard de permissao (acesso universal) e e sempre
// o 1o item de todo perfil que tem menu - destino inicial correto por
// perfil (a troca de fato em DOMContentLoaded pra sempre cair em #/hoje
// mora em js/main.js e roda com DOM, fora do alcance deste harness - fica
// confirmada ao vivo no Playwright da Fase 2 (task de validacao)) ----
assert.equal(app.M.Router.ROUTE_PERMS.hoje, undefined, "Hoje precisa continuar sem guard de permissao (acesso universal)");
["ADMIN","GESTOR","PCP","LIDERANCA","OPERADOR","MONTADOR","ASSISTENCIA"].forEach(perfilKey=>{
  const primeiro = app.M.Router.menuDoPerfil(perfilKey)[0];
  assert.equal(primeiro && primeiro.key, "hoje", `Hoje precisa ser o primeiro item do menu de ${perfilKey}`);
});

// ---- nenhuma permissao NOVA foi inventada so pra Fase 2: toda "perm"
// usada em ROUTE_PERMS/MENU_ITEMS ja existia na matriz de perfis (a chave
// existe em M.perfilDef(...).pode - nao e um nome novo so pra "fazer o
// menu aparecer") ----
{
  const chavesConhecidas = new Set(Object.keys(app.M.perfilDef("ADMIN").pode));
  const permsUsadas = new Set();
  Object.values(app.M.Router.ROUTE_PERMS).forEach(p=> (Array.isArray(p)?p:[p]).forEach(k=> permsUsadas.add(k)));
  permsUsadas.forEach(k=> assert.ok(chavesConhecidas.has(k), `permissao "${k}" usada em ROUTE_PERMS precisa ja existir na matriz de perfis (nenhuma permissao nova pra Fase 2)`));
}

// ---- nenhum arquivo/logica legado foi apagado: toda pagina antiga
// continua existindo e carregando sem erro, e toda rota antiga continua
// mapeada de verdade pra sua funcao (contexto isolado so pra este check,
// pra nao interferir no resto da suite) ----
{
  const appPaginas = contextoBase();
  executar(appPaginas, "js/data.js");
  executar(appPaginas, "js/pdf-import.js");
  appPaginas.M.UI = {};
  appPaginas.M.Pages = {};
  executar(appPaginas, "js/store.js");
  executar(appPaginas, "js/calc.js");
  const arquivosDePagina = ["dashboard.js","hoje.js","producao.js","obras.js","novaObra.js","obraDetail.js",
    "tarefas.js","pendencias.js","paraFinalizar.js","indicadores.js","desempenho.js","calendario.js",
    "lotes.js","montagem.js","chaoDeFabrica.js","tv.js","equipe.js","configuracoes.js","meuPainel.js",
    "assistencias.js","auditoria.js","adminHub.js"];
  arquivosDePagina.forEach(f=> executar(appPaginas, "js/pages/"+f));
  executar(appPaginas, "js/router.js");
  const paginasEsperadas = ["dashboard","hoje","producao","obras","novaObra","obraDetail","tarefas",
    "pendencias","paraFinalizar","indicadores","desempenho","calendario","lotes","montagem",
    "chaoDeFabrica","tv","equipe","configuracoes","meuPainel","assistencias","auditoria","adminHub"];
  paginasEsperadas.forEach(k=> assert.equal(typeof appPaginas.M.Pages[k], "function", `M.Pages.${k} precisa continuar existindo (arquivo/logica legado nao pode ter sido apagado nesta fase)`));
  const rotasLegadasEsperadas = {producao:"producao", "para-finalizar":"paraFinalizar", tarefas:"tarefas",
    indicadores:"indicadores", desempenho:"desempenho", auditoria:"auditoria", calendario:"calendario",
    lotes:"lotes", montagem:"montagem", "chao-de-fabrica":"chaoDeFabrica", tv:"tv", equipe:"equipe",
    configuracoes:"configuracoes", "meu-painel":"meuPainel", dashboard:"hoje"};
  Object.keys(rotasLegadasEsperadas).forEach(rotaKey=> assert.equal(typeof appPaginas.M.Router.ROUTES[rotaKey], "function", `ROUTES["${rotaKey}"] precisa continuar respondendo (alias legado)`));
}

// ---- nenhuma permissao foi RELAXADA nesta fase: snapshot das chaves que a
// navegacao V2 passou a depender, comparado com a matriz da Fase 1 (rodada
// 3) - Fase 2 e so navegacao, zero mudanca esperada em js/data.js ----
{
  const snapshotEsperado = {
    ADMIN:       {"obra.ver":true,  "montagem.ver":true,  "assistencia.ver":true,  "agenda.ver":true,  "admin.equipe":true,  "admin.configuracoes":true,  "admin.indicadores":true,  "admin.auditoria":true},
    PCP:         {"obra.ver":true,  "montagem.ver":true,  "assistencia.ver":true,  "agenda.ver":true,  "admin.equipe":false, "admin.configuracoes":false, "admin.indicadores":false, "admin.auditoria":false},
    LIDERANCA:   {"obra.ver":true,  "montagem.ver":true,  "assistencia.ver":true,  "agenda.ver":true,  "admin.equipe":false, "admin.configuracoes":false, "admin.indicadores":false, "admin.auditoria":false},
    OPERADOR:    {"obra.ver":false, "montagem.ver":false, "assistencia.ver":false, "agenda.ver":false, "admin.equipe":false, "admin.configuracoes":false, "admin.indicadores":false, "admin.auditoria":false, "obra.verAtribuidas":false},
    MONTADOR:    {"obra.ver":false, "montagem.ver":true,  "assistencia.ver":false, "agenda.ver":true,  "admin.equipe":false, "admin.configuracoes":false, "admin.indicadores":false, "admin.auditoria":false, "obra.verAtribuidas":true},
    ASSISTENCIA: {"obra.ver":false, "montagem.ver":false, "assistencia.ver":true,  "agenda.ver":true,  "admin.equipe":false, "admin.configuracoes":false, "admin.indicadores":false, "admin.auditoria":false},
    GESTOR:      {"obra.ver":true,  "montagem.ver":true,  "assistencia.ver":true,  "agenda.ver":true,  "admin.equipe":true,  "admin.configuracoes":false, "admin.indicadores":true,  "admin.auditoria":true},
  };
  Object.keys(snapshotEsperado).forEach(perfilKey=>{
    const pode = app.M.perfilDef(perfilKey).pode;
    Object.keys(snapshotEsperado[perfilKey]).forEach(chave=>{
      assert.equal(pode[chave], snapshotEsperado[perfilKey][chave], `permissao "${chave}" do perfil ${perfilKey} nao pode ter mudado nesta fase (esperado ${snapshotEsperado[perfilKey][chave]})`);
    });
  });
}

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

// ==================================================================
// FASE 3 — faseMacro + regra de risco formal ("FASE 3 — DECISÕES
// APROVADAS COM AJUSTES"). Contexto isolado, com FIXTURES próprias — não
// usa nenhuma das 9 obras reais de produção (essas são dado de
// desenvolvimento/modelo, serão descartadas antes do go-live real, ver
// RELATORIO-FASE-3.md — não fazem parte da suite de regressão).
// ==================================================================
const appFase3 = contextoBase();
executar(appFase3, "js/data.js");
appFase3.M.UI = {};
appFase3.M.Pages = {};
executar(appFase3, "js/store.js");
executar(appFase3, "js/calc.js");

// ---- catálogo FASES_MACRO_SEED: 11 fases, só AGUARDANDO_INICIO/CONCLUIDA
// sem impacto de risco, nenhuma com "quemMove" (removido por decisão
// explícita da rodada de ajuste) ----
{
  const fases = appFase3.M.FASES_MACRO_SEED;
  assert.equal(fases.length, 11, "FASES_MACRO_SEED precisa ter exatamente 11 fases");
  // Array.from(): fases roda no realm isolado do vm (mesma questão já
  // documentada nos testes de menu por perfil acima) — sem isso,
  // assert.deepEqual falha por "mesma estrutura, não referência-iguais".
  const semImpacto = Array.from(fases.filter(f=>!f.impactaRisco).map(f=>f.key)).sort();
  assert.deepEqual(semImpacto, ["AGUARDANDO_INICIO","CONCLUIDA"].sort(), "só AGUARDANDO_INICIO e CONCLUIDA podem ter impactaRisco:false");
  Array.from(fases).forEach(f=> assert.equal(f.quemMove, undefined, `fase "${f.key}" não deveria ter quemMove (removido por decisão da FASE 3)`));
}

// ---- fixture helper: obra mínima, com faseMacro/pendências/prazo controlados ----
let _fxSeq = 0;
function obraFixture(over){
  _fxSeq++;
  return Object.assign({
    id: "fx-obra-"+_fxSeq, numeroOS: "OS FIXTURE/"+_fxSeq, cliente: "Cliente Fixture",
    dataOS: appFase3.M.todayISO(), criadaEm: appFase3.M.todayISO(),
    dataEntregaPrevista: appFase3.M.dOff(30), dataEntregaReal: null,
    valorBruto: 1000, valorLiquido: 1000, status: "EM_PRODUCAO", responsavel: "Teste",
    ambientes: [{id:"fx-amb-"+_fxSeq, nome:"Ambiente Fixture", moveis:[{id:"fx-mov-"+_fxSeq, nome:"Móvel Fixture", etapa:"CORTE", componentesCriticos:[]}]}],
  }, over);
}
function pendenciaFixture(obraId, over){
  return Object.assign({id:"fx-pnd-"+(Math.random()), obraId, status:"ABERTA", categoria:"Teste", impacto:"IMPEDE_FINALIZAR", abertura: appFase3.M.todayISO()}, over);
}

// ---- 1) nova obra criada via Store.criarObra nasce em AGUARDANDO_INICIO ----
{
  const montada = obraFixture({id:"fx-nova-1", numeroOS:"OS FIXTURE/NOVA", ambientes:[{id:"amb-nova", nome:"Sala", valorBrutoPct:1, moveis:[{nome:"Item novo", valorLiquido:1000}]}]});
  const criada = appFase3.M.Store.criarObra(montada);
  assert.equal(criada.faseMacro, "AGUARDANDO_INICIO", "toda obra nova precisa nascer em AGUARDANDO_INICIO");
}

// ---- 2) fase sem impactaRisco -> sempre N/A, mesmo com entrega vencida + BLOQUEIA_OBRA ----
{
  const o = obraFixture({faseMacro:"AGUARDANDO_INICIO", dataEntregaPrevista: appFase3.M.dOff(-30)});
  appFase3.M.Store.state.obras.push(o);
  appFase3.M.Store.state.pendencias.push(pendenciaFixture(o.id, {impacto:"BLOQUEIA_OBRA"}));
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "N/A", "fase sem impactaRisco precisa blindar o risco, mesmo com sinais graves");
  assert.ok(r.motivos.length>0, "N/A ainda precisa vir com motivo (por que não foi avaliado)");
}

// ---- 3) entrega vencida (sem nenhuma pendência) -> sempre ALTO ----
{
  const o = obraFixture({faseMacro:"PRODUCAO", dataEntregaPrevista: appFase3.M.dOff(-7)});
  appFase3.M.Store.state.obras.push(o);
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "ALTO", "entrega vencida precisa dar ALTO mesmo sem nenhuma pendência aberta");
  assert.ok(r.motivos.length>0, "ALTO precisa vir com motivo");
}

// ---- 4) prazo 0-2 dias SEM bloqueio/travamento aberto -> MEDIO, não ALTO ----
{
  const o = obraFixture({faseMacro:"PRODUCAO", dataEntregaPrevista: appFase3.M.dOff(1)});
  appFase3.M.Store.state.obras.push(o);
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "MEDIO", "entrega em 0-2 dias sem BLOQUEIA_AMBIENTE/IMPEDE_FINALIZAR aberto precisa ser MEDIO, não ALTO");
}

// ---- 5) prazo 0-2 dias COM bloqueio aberto -> escala pra ALTO ----
{
  const o = obraFixture({faseMacro:"PRODUCAO", dataEntregaPrevista: appFase3.M.dOff(1)});
  appFase3.M.Store.state.obras.push(o);
  appFase3.M.Store.state.pendencias.push(pendenciaFixture(o.id, {impacto:"BLOQUEIA_AMBIENTE", ambienteNome:"Cozinha"}));
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "ALTO", "entrega em 0-2 dias combinada com BLOQUEIA_AMBIENTE aberto precisa escalar pra ALTO");
  assert.ok(r.motivos.some(m=>m.includes("Entrega em")), "motivo do prazo precisa aparecer");
  assert.ok(r.motivos.some(m=>m.includes("Cozinha")), "motivo do ambiente travado precisa aparecer, sem duplicar o mesmo problema sob dois nomes");
}

// ---- 6) BLOQUEIA_AMBIENTE sozinho (prazo confortável) -> MEDIO, não ALTO ----
{
  const o = obraFixture({faseMacro:"PRODUCAO", dataEntregaPrevista: appFase3.M.dOff(30)});
  appFase3.M.Store.state.obras.push(o);
  appFase3.M.Store.state.pendencias.push(pendenciaFixture(o.id, {impacto:"BLOQUEIA_AMBIENTE"}));
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "MEDIO", "BLOQUEIA_AMBIENTE sozinho, sem prazo apertado, precisa ser MEDIO (não ALTO)");
}

// ---- 7) BLOQUEIA_OBRA -> sempre ALTO, mesmo com prazo confortável ----
{
  const o = obraFixture({faseMacro:"PRODUCAO", dataEntregaPrevista: appFase3.M.dOff(30)});
  appFase3.M.Store.state.obras.push(o);
  appFase3.M.Store.state.pendencias.push(pendenciaFixture(o.id, {impacto:"BLOQUEIA_OBRA"}));
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "ALTO", "BLOQUEIA_OBRA precisa dar ALTO mesmo com prazo confortável");
}

// ---- 8) progresso 100% NAO mascara risco (a correção do bug original) ----
{
  const o = obraFixture({
    faseMacro:"PRODUCAO", dataEntregaPrevista: appFase3.M.dOff(30),
    ambientes:[{id:"amb-100", nome:"Ambiente", moveis:[{id:"mov-100", nome:"Móvel", etapa:"FINALIZADA", componentesCriticos:[]}]}],
  });
  appFase3.M.Store.state.obras.push(o);
  appFase3.M.Store.state.pendencias.push(pendenciaFixture(o.id, {impacto:"BLOQUEIA_AMBIENTE"}));
  const prog = appFase3.M.Calc.progressoObra(o);
  assert.equal(prog.pct, 100, "pré-condição do teste: móvel em FINALIZADA precisa contar como 100% concluído");
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "MEDIO", "progresso 100% não pode reduzir o risco de uma pendência BLOQUEIA_AMBIENTE aberta (regressão do bug original)");
  assert.equal(r.progresso, 100, "o progresso continua disponível como dado informativo, só não interfere no nível");
}

// ---- 9) obra parada (pendência bloqueante aberta há >=5 dias) -> ALTO mesmo com prazo confortável ----
{
  const o = obraFixture({faseMacro:"PRODUCAO", dataEntregaPrevista: appFase3.M.dOff(30)});
  appFase3.M.Store.state.obras.push(o);
  appFase3.M.Store.state.pendencias.push(pendenciaFixture(o.id, {impacto:"IMPEDE_FINALIZAR", abertura: appFase3.M.dOff(-6)}));
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "ALTO", "obra parada (pendência bloqueante aberta há >=5 dias) precisa dar ALTO mesmo com prazo confortável");
}

// ---- 10) INFORMATIVO/NAO_IMPEDE sozinhos nunca elevam risco acima de BAIXO ----
{
  const o = obraFixture({faseMacro:"PRODUCAO", dataEntregaPrevista: appFase3.M.dOff(30)});
  appFase3.M.Store.state.obras.push(o);
  appFase3.M.Store.state.pendencias.push(pendenciaFixture(o.id, {impacto:"INFORMATIVO"}));
  appFase3.M.Store.state.pendencias.push(pendenciaFixture(o.id, {impacto:"NAO_IMPEDE"}));
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "BAIXO", "INFORMATIVO/NAO_IMPEDE sozinhos não deveriam elevar o risco");
  assert.equal(r.motivos.length, 0, "nenhum motivo deveria aparecer quando nada realmente eleva o risco");
}

// ---- 11) dado legado sem faseMacro nao quebra o app: cai no fallback
// visual (N/A, sem gravar nada) ----
{
  const o = obraFixture({dataEntregaPrevista: appFase3.M.dOff(-10)});
  delete o.faseMacro;
  appFase3.M.Store.state.obras.push(o);
  assert.doesNotThrow(()=> appFase3.M.Calc.riscoObra(o), "obra sem faseMacro nao pode derrubar riscoObra");
  const r = appFase3.M.Calc.riscoObra(o);
  assert.equal(r.nivel, "N/A", "obra legada sem faseMacro cai no fallback visual (N/A), nunca inferindo/gravando uma fase sozinha");
  const sit = appFase3.M.Calc.situacaoObra(o);
  assert.equal(sit.tone, "neutral");
  assert.equal(typeof sit.label, "string");
  assert.equal(o.faseMacro, undefined, "faseMacroDeObra/riscoObra NUNCA grava faseMacro na obra, mesmo depois de ler o fallback repetidas vezes");
}

console.log("Fase 3 (faseMacro + risco): OK");

console.log("Regressoes criticas: OK");

// ==================================================================
// FASE 4 — Pendências + Hoje. Contexto isolado com fixtures próprias (mesmo
// padrão da Fase 3 acima) — não mexe nas 9 obras/pendências reais de dev.
// Cobre: Store.log(extra)/historicoDaPendencia, Store.atribuirPendencia,
// Store.adicionarFotosPendencia (todos com guard real, não só visual),
// M.Calc.compararPrioridadePendencia (os 5 critérios exatos do handoff) e
// M.Calendario.proximosEventos (reuso decotado da tela Calendário).
// Não testa aqui o HTML de pendencias.js/hoje.js (essas páginas dependem de
// M.UI inteiro — ícones, chips, modais — fora do escopo deste harness, que
// desde a Fase 1 testa Store/Calc direto, não renderização); essas telas
// foram validadas visualmente via Playwright local (screenshots em anexo
// no relatório de entrega), não em produção.
// ==================================================================
const appFase4 = contextoBase();
executar(appFase4, "js/data.js");
appFase4.M.UI = {};
appFase4.M.Pages = {};
appFase4.M.UIState = {calFiltros: new Set(["PRODUCAO","ENTREGAS","MONTAGENS","PENDENCIAS","FORNECEDORES","ASSISTENCIAS"])};
executar(appFase4, "js/store.js");
executar(appFase4, "js/calc.js");
executar(appFase4, "js/pages/calendario.js"); // só define M.Calendario/funções — não precisa de UI real pra isso

function comoUsuarioFase4(nome, fn){
  const original = appFase4.M.Store.state.usuarioAtual;
  appFase4.M.Store.setUsuarioAtual(nome);
  try{ return fn(); } finally { appFase4.M.Store.setUsuarioAtual(original); }
}
// mesmo truque já usado no resto do arquivo pra testar GESTOR/ASSISTENCIA
// (sem colaborador dedicado no seed): reatribui "Ana Ferreira" por um instante.
function comoPerfilFase4(perfilKey, fn){
  const alvo = appFase4.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
  const original = alvo.perfil;
  alvo.perfil = perfilKey;
  try{ return comoUsuarioFase4("Ana Ferreira", fn); } finally { alvo.perfil = original; }
}
let _fx4Seq = 0;
function obraFixture4(over){
  _fx4Seq++;
  return Object.assign({
    id:"fx4-obra-"+_fx4Seq, numeroOS:"OS FIXTURE4/"+_fx4Seq, cliente:"Cliente Fixture 4",
    dataOS:appFase4.M.todayISO(), criadaEm:appFase4.M.todayISO(),
    dataEntregaPrevista:appFase4.M.dOff(30), dataEntregaReal:null,
    valorBruto:1000, valorLiquido:1000, status:"EM_PRODUCAO", responsavel:"Teste",
    ambientes:[{id:"fx4-amb-"+_fx4Seq, nome:"Ambiente Fixture", moveis:[{id:"fx4-mov-"+_fx4Seq, nome:"Móvel Fixture", etapa:"CORTE", componentesCriticos:[]}]}],
  }, over);
}
function pendenciaFixture4(obraId, over){
  return Object.assign({id:"fx4-pnd-"+(Math.random()), obraId, status:"ABERTA", categoria:"Teste",
    impacto:"IMPEDE_FINALIZAR", abertura:appFase4.M.todayISO()}, over);
}

// ---- 1) Store.log(extra) — retrocompatível (chamada de 3 args continua
// funcionando, sem pendenciaId) + threading do pendenciaId nos 3 pontos de
// chamada de pendência (criar/avançar/resolver/reabrir) ----
{
  assert.doesNotThrow(()=> appFase4.M.Store.log(null, "TESTE", "sem extra"), "Store.log de 3 args (assinatura antiga) precisa continuar funcionando");
  const semExtra = appFase4.M.Store.state.historico[0];
  assert.equal(semExtra.pendenciaId, undefined, "log sem extra não deveria ganhar pendenciaId nenhum");

  const o = obraFixture4();
  appFase4.M.Store.state.obras.push(o);
  const p = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.criarPendencia({
    obraId:o.id, categoria:"Outro", tipo:"Material", impacto:"BLOQUEIA_AMBIENTE",
    descricao:"pendência de teste Fase 4", responsavel:"Willian Souza", prioridade:"MEDIA",
  }));
  assert.equal(p.ok, true);
  const hist1 = appFase4.M.Store.historicoDaPendencia(p.pendencia.id);
  assert.equal(hist1.length, 1, "criarPendencia precisa gerar 1 evento de histórico linkado por pendenciaId");
  assert.equal(hist1[0].tipo, "PENDENCIA_ABERTA");
  assert.equal(hist1[0].pendenciaId, p.pendencia.id);

  comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.avancarFluxoPendencia(p.pendencia.id));
  const hist2 = appFase4.M.Store.historicoDaPendencia(p.pendencia.id);
  assert.ok(hist2.length >= 1, "avançar fluxo precisa aparecer no histórico da MESMA pendência");
  assert.ok(hist2.every(h=>h.pendenciaId===p.pendencia.id), "historicoDaPendencia nunca pode misturar eventos de outra pendência");
}

// ---- 2) Store.atribuirPendencia — guard real (pendencia.atribuir), não só
// visual; loga PENDENCIA_ATRIBUIDA linkado; ASSISTENCIA (atribuir:false na
// matriz da Fase 1) precisa continuar negado ----
{
  const o = obraFixture4();
  appFase4.M.Store.state.obras.push(o);
  const p = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.criarPendencia({
    obraId:o.id, categoria:"Outro", descricao:"pendência p/ atribuir", responsavel:"Willian Souza", prioridade:"MEDIA",
  })).pendencia;

  const negado = comoPerfilFase4("ASSISTENCIA", ()=> appFase4.M.Store.atribuirPendencia(p.id, "Beatriz Nogueira"));
  assert.equal(negado.ok, false, "ASSISTENCIA tem pendencia.atribuir=false na matriz da Fase 1 — não pode ter sido relaxado aqui");
  assert.equal(negado.motivo, "SEM_PERMISSAO");
  assert.equal(p.responsavel, "Willian Souza", "tentativa negada não pode ter mudado o responsável");

  const ok = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.atribuirPendencia(p.id, "Beatriz Nogueira"));
  assert.equal(ok.ok, true, "ADMIN tem pendencia.atribuir=true, precisa conseguir reatribuir");
  assert.equal(p.responsavel, "Beatriz Nogueira");
  const hist = appFase4.M.Store.historicoDaPendencia(p.id);
  assert.ok(hist.some(h=>h.tipo==="PENDENCIA_ATRIBUIDA"), "reatribuição precisa deixar rastro no histórico da pendência");

  const naoEncontrada = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.atribuirPendencia("id-inexistente", "X"));
  assert.equal(naoEncontrada.ok, false);
  assert.equal(naoEncontrada.motivo, "NAO_ENCONTRADA");
}

// ---- 3) Store.adicionarFotosPendencia — guard real (pendencia.editar);
// string vira objeto com defaults; objeto (já formatado pelo upload) passa
// direto, sem perder enviadoPor/data/tamanho; loga no histórico da pendência ----
{
  const o = obraFixture4();
  appFase4.M.Store.state.obras.push(o);
  const p = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.criarPendencia({
    obraId:o.id, categoria:"Outro", descricao:"pendência p/ fotos", responsavel:"Willian Souza", prioridade:"MEDIA",
  })).pendencia;

  // OPERADOR (Willian Souza): pendencia.editar=false na matriz da Fase 1
  const negado = comoUsuarioFase4("Willian Souza", ()=> appFase4.M.Store.adicionarFotosPendencia(p.id, ["http://x/foto.jpg"], "abertura"));
  assert.equal(negado.ok, false, "Produção tem pendencia.editar=false — não pode adicionar foto depois direto no Store");
  assert.equal(negado.motivo, "SEM_PERMISSAO");
  assert.equal((p.fotosAbertura||[]).length, 0, "tentativa negada não pode ter alterado fotosAbertura");

  const okString = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.adicionarFotosPendencia(p.id, ["http://x/foto1.jpg"], "abertura"));
  assert.equal(okString.ok, true);
  assert.equal(p.fotosAbertura.length, 1);
  assert.equal(p.fotosAbertura[0].url, "http://x/foto1.jpg");
  assert.equal(p.fotosAbertura[0].principal, false, "foto adicionada depois nunca vira principal automaticamente");

  const fotoObjPronta = {nome:"foto2.jpg", url:"http://x/foto2.jpg", tipo:"image/jpeg", tamanho:1234, enviadoPor:"Paulo Henrique", data:new Date().toISOString(), principal:false};
  const okObjeto = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.adicionarFotosPendencia(p.id, [fotoObjPronta], "resolucao"));
  assert.equal(okObjeto.ok, true);
  assert.equal(p.fotosResolucao.length, 1);
  assert.equal(p.fotosResolucao[0].tamanho, 1234, "objeto já formatado pelo upload precisa passar direto, sem perder campos");
  assert.equal(p.fotosResolucao[0].enviadoPor, "Paulo Henrique");

  const hist = appFase4.M.Store.historicoDaPendencia(p.id);
  assert.ok(hist.some(h=>h.tipo==="PENDENCIA_FOTOS_ADICIONADAS"), "adicionar foto depois precisa deixar rastro no histórico");
}

// ---- 4) M.Calc.compararPrioridadePendencia — os 5 critérios EXATOS do
// handoff, nessa ordem: 1.BLOQUEIA_OBRA 2.BLOQUEIA_AMBIENTE 3.IMPEDE_FINALIZAR
// 4.antiguidade 5.prazo da obra. Nada de score obscuro — cada critério só
// desempata o anterior. ----
{
  const obraPertoDoPrazo = obraFixture4({dataEntregaPrevista: appFase4.M.dOff(2)});
  const obraLongePrazo = obraFixture4({dataEntregaPrevista: appFase4.M.dOff(10)});
  appFase4.M.Store.state.obras.push(obraPertoDoPrazo, obraLongePrazo);

  const pBloqueiaObra = pendenciaFixture4(obraLongePrazo.id, {impacto:"BLOQUEIA_OBRA", abertura: appFase4.M.dOff(-1)});
  const pBloqueiaAmbPertoAntiga = pendenciaFixture4(obraPertoDoPrazo.id, {impacto:"BLOQUEIA_AMBIENTE", abertura: appFase4.M.dOff(-3)});
  const pBloqueiaAmbLongeAntiga = pendenciaFixture4(obraLongePrazo.id, {impacto:"BLOQUEIA_AMBIENTE", abertura: appFase4.M.dOff(-3)});
  const pImpedeFinalizar = pendenciaFixture4(obraPertoDoPrazo.id, {impacto:"IMPEDE_FINALIZAR", abertura: appFase4.M.dOff(-3)});
  const pNaoImpede = pendenciaFixture4(obraPertoDoPrazo.id, {impacto:"NAO_IMPEDE"});
  const pInformativo = pendenciaFixture4(obraLongePrazo.id, {impacto:"INFORMATIVO"});

  const embaralhado = [pInformativo, pNaoImpede, pBloqueiaAmbLongeAntiga, pImpedeFinalizar, pBloqueiaAmbPertoAntiga, pBloqueiaObra];
  const ordenado = embaralhado.slice().sort(appFase4.M.Calc.compararPrioridadePendencia);
  const ids = Array.from(ordenado.map(p=>p.id));
  assert.deepEqual(ids, [pBloqueiaObra.id, pBloqueiaAmbPertoAntiga.id, pBloqueiaAmbLongeAntiga.id, pImpedeFinalizar.id, pNaoImpede.id, pInformativo.id],
    "ordem precisa ser exatamente: BLOQUEIA_OBRA > BLOQUEIA_AMBIENTE (antiga primeiro, empatando por prazo da obra) > IMPEDE_FINALIZAR > NAO_IMPEDE > INFORMATIVO");

  // critério 4 isolado: mesma severidade, antiguidade diferente, mesma obra —
  // a mais antiga (mais dias em aberto) precisa vir primeiro.
  const pRecente = pendenciaFixture4(obraPertoDoPrazo.id, {impacto:"BLOQUEIA_AMBIENTE", abertura: appFase4.M.dOff(-1)});
  const pAntiga = pendenciaFixture4(obraPertoDoPrazo.id, {impacto:"BLOQUEIA_AMBIENTE", abertura: appFase4.M.dOff(-8)});
  const doisOrdenados = [pRecente, pAntiga].sort(appFase4.M.Calc.compararPrioridadePendencia);
  assert.equal(doisOrdenados[0].id, pAntiga.id, "critério 4 (antiguidade) isolado: mais dias em aberto vem primeiro");
}

// ---- 4b) M.Calc.pendenciaCritica (REFINO VISUAL V2, ajustes finais §3;
// campo de antiguidade reconfirmado na "última verificação antes do push"
// §1) — "Crítica" no resumo operacional (Pendências + Hoje > Exceções
// críticas) tem que vir do IMPACTO REAL, NUNCA de prioridade sozinha. Uma
// pendência INFORMATIVO/NAO_IMPEDE não pode virar "crítica" só porque
// alguém marcou prioridade="Crítica".
//
// Estas pendências são criadas pelo caminho REAL de produção
// (Store.criarPendencia -> novaPendenciaObj), não por um fixture que inventa
// campo — é o mesmo objeto que a tela realmente usa, com `abertura`,
// `criadoEm`, `criadoPor` etc. já preenchidos pelo próprio Store. ----
{
  const obraQualquer = obraFixture4({dataEntregaPrevista: appFase4.M.dOff(30)});
  appFase4.M.Store.state.obras.push(obraQualquer);

  function criarPendReal(over){
    return comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.criarPendencia(Object.assign({
      obraId:obraQualquer.id, obraNome:obraQualquer.cliente, categoria:"Outro",
    }, over))).pendencia;
  }

  // ---- evidência do campo canônico de antiguidade ----
  // `Store.criarPendencia` (caminho real, usado pelo formulário "Registrar
  // pendência") grava `abertura` E `criadoEm` — mas só `abertura` pode ser
  // retroativa (é o que os seeds de js/data.js fazem pra simular pendência
  // já aberta há dias, ex. `abertura:dOff(-6)`); `criadoEm` sempre reflete
  // o instante em que o REGISTRO foi criado no sistema, nunca é retroativo.
  const pComAberturaRetroativa = criarPendReal({impacto:"IMPEDE_FINALIZAR", abertura: appFase4.M.dOff(-6)});
  assert.ok(pComAberturaRetroativa.abertura, "toda pendência criada pelo caminho real tem `abertura` preenchida — é o campo canônico, não um alias de fixture");
  assert.equal(pComAberturaRetroativa.abertura, appFase4.M.dOff(-6), "`abertura` aceita ser retroativa — é o timestamp DE NEGÓCIO (quando o problema realmente se abriu)");
  assert.equal(pComAberturaRetroativa.criadoEm, appFase4.M.todayISO(), "`criadoEm` é um campo DIFERENTE (rastreabilidade — Fase 2) — sempre é 'agora', nunca retroativo, mesmo quando abertura é");
  assert.equal(appFase4.M.Calc.pendenciaCritica(pComAberturaRetroativa), true,
    "com `abertura` retroativa (>=5 dias), IMPEDE_FINALIZAR é crítica — confirma que a função usa `abertura`, não `criadoEm` (que aqui seria 'hoje', 0 dias)");

  const pInformativoPrioridadeCritica = criarPendReal({impacto:"INFORMATIVO", prioridade:"CRITICA"});
  assert.equal(appFase4.M.Calc.pendenciaCritica(pInformativoPrioridadeCritica), false,
    "INFORMATIVO com prioridade='Crítica' NÃO pode ser considerada crítica — prioridade nunca sobrepõe impacto");

  const pNaoImpedePrioridadeCritica = criarPendReal({impacto:"NAO_IMPEDE", prioridade:"CRITICA"});
  assert.equal(appFase4.M.Calc.pendenciaCritica(pNaoImpedePrioridadeCritica), false,
    "NAO_IMPEDE com prioridade='Crítica' NÃO pode ser considerada crítica — mesma regra");

  const pBloqueiaObraSemPrioridade = criarPendReal({impacto:"BLOQUEIA_OBRA"});
  assert.equal(appFase4.M.Calc.pendenciaCritica(pBloqueiaObraSemPrioridade), true,
    "BLOQUEIA_OBRA é sempre crítica, mesmo sem prioridade marcada");

  const pBloqueiaAmbiente = criarPendReal({impacto:"BLOQUEIA_AMBIENTE"});
  assert.equal(appFase4.M.Calc.pendenciaCritica(pBloqueiaAmbiente), true, "BLOQUEIA_AMBIENTE é sempre crítica");

  const pImpedeFinalizarRecenteSemPrazo = criarPendReal({impacto:"IMPEDE_FINALIZAR"}); // abertura = hoje (default do Store)
  assert.equal(appFase4.M.Calc.pendenciaCritica(pImpedeFinalizarRecenteSemPrazo), false,
    "IMPEDE_FINALIZAR recente (aberta hoje) e sem prazo vencido ainda não é crítica");

  const pImpedeFinalizarVencida = criarPendReal({impacto:"IMPEDE_FINALIZAR", prazo: appFase4.M.dOff(-1)});
  assert.equal(appFase4.M.Calc.pendenciaCritica(pImpedeFinalizarVencida), true,
    "IMPEDE_FINALIZAR com prazo vencido é crítica, mesmo recente");

  const pImpedeFinalizarEnvelhecida = criarPendReal({impacto:"IMPEDE_FINALIZAR", abertura: appFase4.M.dOff(-6)});
  assert.equal(appFase4.M.Calc.pendenciaCritica(pImpedeFinalizarEnvelhecida), true,
    "IMPEDE_FINALIZAR aberta há >=5 dias é crítica, mesmo sem prazo vencido");

  const pResolvidaBloqueiaObra = criarPendReal({impacto:"BLOQUEIA_OBRA", status:"RESOLVIDA"});
  assert.equal(appFase4.M.Calc.pendenciaCritica(pResolvidaBloqueiaObra), false,
    "pendência RESOLVIDA nunca é crítica, mesmo com impacto BLOQUEIA_OBRA");

  // ---- timestamp ausente/inválido não pode virar crítica por acidente ----
  // simula dado corrompido/legado real (não um campo inventado): mesmo
  // objeto do Store, com `abertura` removida depois — cenário que o guard
  // explícito em pendenciaCritica precisa cobrir sem estourar nem virar
  // crítica por coerção de NaN.
  const pSemAberturaValida = criarPendReal({impacto:"IMPEDE_FINALIZAR"});
  delete pSemAberturaValida.abertura;
  assert.doesNotThrow(()=> appFase4.M.Calc.pendenciaCritica(pSemAberturaValida), "abertura ausente não pode quebrar pendenciaCritica");
  assert.equal(appFase4.M.Calc.pendenciaCritica(pSemAberturaValida), false,
    "abertura ausente/undefined NÃO pode virar crítica por acidente (sem prazo vencido)");

  const pAberturaInvalida = criarPendReal({impacto:"IMPEDE_FINALIZAR", abertura:"data-invalida"});
  assert.doesNotThrow(()=> appFase4.M.Calc.pendenciaCritica(pAberturaInvalida), "abertura com valor inválido não pode quebrar pendenciaCritica");
  assert.equal(appFase4.M.Calc.pendenciaCritica(pAberturaInvalida), false,
    "abertura com valor inválido (data não parseável) NÃO pode virar crítica por acidente");
}

// ---- 5) M.Calendario.proximosEventos — reusa a mesma agregação da tela
// Calendário (sem duplicar lógica), desacoplada do filtro de UI da própria
// tela via o parâmetro filtrosSet ----
{
  const o = obraFixture4({dataEntregaPrevista: appFase4.M.dOff(3)});
  appFase4.M.Store.state.obras.push(o);
  const dentro = appFase4.M.Calendario.proximosEventos(7);
  assert.ok(dentro.some(e=>e.obraId===o.id), "entrega em 3 dias precisa aparecer numa janela de 7 dias");
  const fora = appFase4.M.Calendario.proximosEventos(1);
  assert.ok(!fora.some(e=>e.obraId===o.id), "entrega em 3 dias NÃO pode aparecer numa janela de 1 dia");

  const soMontagens = appFase4.M.Calendario.proximosEventos(7, ["MONTAGENS"]);
  assert.ok(!soMontagens.some(e=>e.obraId===o.id && e.tipo==="obra"), "filtrosChaves precisa restringir o tipo de evento — ENTREGAS não pode vazar quando só MONTAGENS foi pedido");
}

// ==================================================================
// FASE 4 — AJUSTE (pós-revisão): escopo real de "Minhas/Todas" em
// Pendências (não só esconder o botão) + PCP usando faseMacro em vez de
// progresso físico como proxy pra "obras entrando em produção".
// ==================================================================

// ---- 6) Store.pendenciasVisiveis() — escopo por perfil, aplicado no
// Store (camada de dados), não só na tela. Produção só enxerga a própria
// pendência mesmo dentro das próprias obras; Montador/Assistência só
// enxergam pendência das obras onde têm vínculo; Admin/PCP/Líder/Gestor
// continuam com visão ampla (verTodasObras). ----
{
  const obraA = obraFixture4(); // vai ficar no contexto do Montador/Produção de teste
  const obraB = obraFixture4(); // fora do contexto de ambos
  appFase4.M.Store.state.obras.push(obraA, obraB);

  // pendência do próprio Willian Souza (Produção/OPERADOR) na obra A
  const pMinhaProducao = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.criarPendencia({
    obraId:obraA.id, categoria:"Outro", descricao:"minha (produção)", responsavel:"Willian Souza", prioridade:"MEDIA",
  })).pendencia;
  // pendência de OUTRA pessoa (Beatriz Nogueira), na MESMA obra A — Willian
  // tem vínculo com obraA (é responsável por pMinhaProducao ali), mas essa
  // pendência específica não é dele.
  const pOutraNaMinhaObra = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.criarPendencia({
    obraId:obraA.id, categoria:"Outro", descricao:"de outra pessoa, mesma obra", responsavel:"Beatriz Nogueira", prioridade:"MEDIA",
  })).pendencia;
  // pendência numa obra totalmente fora do contexto de Willian/Roberto
  const pDeOutraObra = comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.criarPendencia({
    obraId:obraB.id, categoria:"Outro", descricao:"obra fora do contexto", responsavel:"Marcos Lima", prioridade:"MEDIA",
  })).pendencia;

  // ---- Produção (Willian Souza, OPERADOR): só a própria, mesmo "forçando
  // Todas" — não existe "Todas" pra esse perfil; a fonte (Store) já corta. ----
  const visivelProducao = comoUsuarioFase4("Willian Souza", ()=> appFase4.M.Store.pendenciasVisiveis());
  const idsProducao = Array.from(visivelProducao.map(p=>p.id));
  assert.ok(idsProducao.includes(pMinhaProducao.id), "Produção precisa ver a própria pendência");
  assert.ok(!idsProducao.includes(pOutraNaMinhaObra.id), "Produção NÃO pode ver pendência de outra pessoa, mesmo na mesma obra onde ela tem vínculo");
  assert.ok(!idsProducao.includes(pDeOutraObra.id), "Produção NÃO pode ver pendência de obra fora do seu contexto");
  // "forçar Todas" por manipulação de estado/UI não muda nada — pendenciasVisiveis()
  // não lê NENHUM estado de UI (M.UIState/toggle), só o perfil de quem está
  // logado; não existe um "modo Todas" pra alternar por fora pra esse perfil.
  const aindaSoMinhaProducao = comoUsuarioFase4("Willian Souza", ()=> appFase4.M.Store.pendenciasVisiveis());
  assert.equal(Array.from(aindaSoMinhaProducao.map(p=>p.id)).includes(pOutraNaMinhaObra.id), false,
    "mesmo chamando pendenciasVisiveis() de novo (equivalente a 'forçar Todas'), Produção continua sem ver pendência de outra pessoa");

  // ---- Montador (Roberto Diniz): sem pendência própria nessas obras, e sem
  // tarefa/assistência atribuída nelas → obraIdsDoColaborador vazio pra ele
  // aqui → não vê NENHUMA das três (nem a de obraA, que não é dele). ----
  const visivelMontador = comoUsuarioFase4("Roberto Diniz", ()=> appFase4.M.Store.pendenciasVisiveis());
  const idsMontador = Array.from(visivelMontador.map(p=>p.id));
  assert.ok(!idsMontador.includes(pMinhaProducao.id) && !idsMontador.includes(pOutraNaMinhaObra.id) && !idsMontador.includes(pDeOutraObra.id),
    "Montador sem nenhum vínculo com obraA/obraB não pode ver pendência nenhuma delas");
  // agora dá a ele um vínculo real com obraA (uma tarefa) — só aí obraA entra
  // no contexto dele, e ele passa a ver AS DUAS pendências de obraA (não é
  // 'somente minha', é 'somente do meu contexto de obra'), mas continua sem
  // ver a de obraB.
  appFase4.M.Store.state.tarefas.push({id:"fx4-tarefa-montador", obraId:obraA.id, responsavelPlanejado:"Roberto Diniz", titulo:"Instalar", status:"PENDENTE"});
  const visivelMontador2 = comoUsuarioFase4("Roberto Diniz", ()=> appFase4.M.Store.pendenciasVisiveis());
  const idsMontador2 = Array.from(visivelMontador2.map(p=>p.id));
  assert.ok(idsMontador2.includes(pMinhaProducao.id) && idsMontador2.includes(pOutraNaMinhaObra.id), "Montador com vínculo em obraA precisa ver as pendências DA OBRA (não só as próprias)");
  assert.ok(!idsMontador2.includes(pDeOutraObra.id), "Montador continua sem ver pendência de obraB, fora do seu contexto");

  // ---- Assistência: colaborador SINTÉTICO (zero vínculo prévio nos dados
  // de dev — "Ana Ferreira" é real e pode já ter tarefa/pendência da seed,
  // o que poluiria a asserção de "zero"), mesmo comportamento de contexto-
  // por-obra que o Montador, via assistência vinculada em vez de tarefa. ----
  const nomeAssistTeste = "Fixture ASSISTENCIA teste";
  appFase4.M.COLABORADORES.push({id:"fx4-colab-assist-teste", nome:nomeAssistTeste, cargo:"Teste", iniciais:"FX", perfil:"ASSISTENCIA", telefone:""});
  const visivelAssistAntes = comoUsuarioFase4(nomeAssistTeste, ()=> appFase4.M.Store.pendenciasVisiveis());
  assert.equal(visivelAssistAntes.length, 0, "Assistência sem nenhum atendimento vinculado não deveria ver nenhuma pendência dessas obras");
  appFase4.M.Store.state.assistencias.push({id:"fx4-assist-1", obraId:obraB.id, responsavel:nomeAssistTeste, categoria:"Ferragem", descricao:"teste", status:"ABERTA", data:appFase4.M.todayISO(), garantia:"EM_ANALISE", visitas:[]});
  const visivelAssistDepois = comoUsuarioFase4(nomeAssistTeste, ()=> appFase4.M.Store.pendenciasVisiveis());
  const idsAssist = Array.from(visivelAssistDepois.map(p=>p.id));
  assert.ok(idsAssist.includes(pDeOutraObra.id), "Assistência com atendimento vinculado a obraB precisa ver a pendência dessa obra");
  assert.ok(!idsAssist.includes(pMinhaProducao.id) && !idsAssist.includes(pOutraNaMinhaObra.id), "Assistência continua sem ver pendência de obraA, fora do seu contexto de atendimento");

  // ---- Admin/PCP/Líder/Gestor: visão ampla mantida (verTodasObras) — o
  // ajuste não pode ter restringido quem já era autorizado a ver tudo. ----
  const todasAsTres = [pMinhaProducao.id, pOutraNaMinhaObra.id, pDeOutraObra.id];
  const visivelAdmin = Array.from(comoUsuarioFase4("Paulo Henrique", ()=> appFase4.M.Store.pendenciasVisiveis()).map(p=>p.id));
  assert.ok(todasAsTres.every(id=>visivelAdmin.includes(id)), "Admin precisa continuar vendo tudo");
  const visivelPCP = Array.from(comoUsuarioFase4("Beatriz Nogueira", ()=> appFase4.M.Store.pendenciasVisiveis()).map(p=>p.id));
  assert.ok(todasAsTres.every(id=>visivelPCP.includes(id)), "PCP precisa continuar vendo tudo");
  const visivelLider = Array.from(comoUsuarioFase4("Juliana Prado", ()=> appFase4.M.Store.pendenciasVisiveis()).map(p=>p.id));
  assert.ok(todasAsTres.every(id=>visivelLider.includes(id)), "Líder precisa continuar vendo tudo");
  const visivelGestor = comoPerfilFase4("GESTOR", ()=> Array.from(appFase4.M.Store.pendenciasVisiveis().map(p=>p.id)));
  assert.ok(todasAsTres.every(id=>visivelGestor.includes(id)), "Gestor precisa continuar vendo tudo (escopo operacional permitido = verTodasObras, igual já era)");
}

// ---- 7) PCP — "obras entrando em produção" usa faseMacro, não progresso.
// Teste de integração real: executa M.Pages.hoje() de verdade (perfil PCP),
// com um mock mínimo de M.UI (só pra não travar em UI.icon/UI.card — não é
// teste de layout, é teste de QUAIS obras entram em qual bloco). ----
{
  const appHoje = contextoBase();
  executar(appHoje, "js/data.js");
  appHoje.M.UI = {
    esc:(s)=> String(s==null?"":s), icon:()=>"", card:(o)=> `[[${o.titulo||""}]]`+(o.body||""),
    riscoChip:()=>"", tipoChip:()=>"", assistenciaStatusChip:()=>"",
    pageSearchInput:()=>"", botaoNovaObraHtml:()=>"", attachQuickSearch:()=>{},
    // REFINO VISUAL V2 (ajustes finais, §1) — mesmos stubs mínimos já
    // adicionados a appFase5.M.UI (Montagem), agora necessários aqui porque
    // js/pages/hoje.js passou a ter faixa de KPI por perfil. Não trunca —
    // paginação/expansão é validada visualmente (Playwright), não no VM.
    kpiTile:(o)=> `[kpi:${o.label}=${o.value}]`,
    kpiRow:(tiles)=> (tiles||[]).join(""),
    secHead:(o)=> `[[${o.titulo||""}]]`,
    secaoComVerTodos:(o)=> ({itensHtml:(o.itens||[]).join(""), toggleHtml:"", ocultos:0, total:(o.itens||[]).length}),
  };
  appHoje.M.Pages = {};
  appHoje.M.UIState = {calFiltros: new Set(["PRODUCAO","ENTREGAS","MONTAGENS","PENDENCIAS","FORNECEDORES","ASSISTENCIAS"])};
  executar(appHoje, "js/store.js");
  executar(appHoje, "js/calc.js");
  executar(appHoje, "js/pages/calendario.js");
  // FASE 6 (Agenda V2, §21) — Hoje agora consome M.Agenda.proximosEventos
  // pros blocos "Próximos compromissos"; precisa estar carregado antes de
  // M.Pages.hoje() poder renderizar.
  executar(appHoje, "js/pages/agenda.js");
  executar(appHoje, "js/pages/hoje.js");

  // fixtures próprias, isoladas (sem compartilhar ambientes/moveis com as
  // obras reais de seed) — cada uma com estrutura mínima válida.
  function obraFixtureHoje(over){
    return Object.assign({
      numeroOS:"OS HOJE/X", cliente:"Cliente Hoje Fixture", dataOS:appHoje.M.todayISO(), criadaEm:appHoje.M.todayISO(),
      dataEntregaPrevista:appHoje.M.dOff(30), dataEntregaReal:null, valorBruto:1000, valorLiquido:1000,
      status:"AGUARDANDO_INICIO", responsavel:"Teste",
      ambientes:[{id:"amb-"+over.id, nome:"Ambiente", moveis:[{id:"mov-"+over.id, nome:"Móvel", etapa:"CORTE", componentesCriticos:[]}]}],
    }, over);
  }
  const oLiberada = obraFixtureHoje({id:"fx4-hoje-liberada", numeroOS:"OS HOJE/LIBERADA", faseMacro:"LIBERADA_PARA_PRODUCAO"});
  const oPlanoDeCorte = obraFixtureHoje({id:"fx4-hoje-plano", numeroOS:"OS HOJE/PLANO", faseMacro:"PCP_PLANO_DE_CORTE"});
  const oMedicaoProgressoBaixo = obraFixtureHoje({id:"fx4-hoje-medicao", numeroOS:"OS HOJE/MEDICAO", faseMacro:"MEDICAO"});
  const oLegadoSemFase = obraFixtureHoje({id:"fx4-hoje-legado", numeroOS:"OS HOJE/LEGADO"});
  appHoje.M.Store.state.obras.push(oLiberada, oPlanoDeCorte, oMedicaoProgressoBaixo, oLegadoSemFase);

  appHoje.M.Store.setUsuarioAtual("Beatriz Nogueira"); // PCP
  const resultado = appHoje.M.Pages.hoje();
  assert.ok(resultado.html.includes("OS HOJE/LIBERADA"), "obra com faseMacro LIBERADA_PARA_PRODUCAO precisa aparecer no bloco de obras liberadas");
  assert.ok(resultado.html.includes("OS HOJE/PLANO"), "obra com faseMacro PCP_PLANO_DE_CORTE precisa aparecer no bloco 'em preparação', separado do de liberadas");
  assert.ok(!resultado.html.includes("OS HOJE/MEDICAO"), "obra em MEDICAO (progresso baixo, mas fase errada) NÃO pode aparecer em nenhum dos dois blocos — progresso físico não substitui faseMacro");
  assert.ok(!resultado.html.includes("OS HOJE/LEGADO"), "obra legada sem faseMacro não pode ser inferida/aparecer no bloco — faseMacroDeObra já devolve _LEGADO_SEM_FASE, sem chute");

  // ---- 8) ÚLTIMO AJUSTE — Produção/Hoje: "itens que precisam de ação
  // agora" não pode mais trazer pendência de OUTRA pessoa só por estar na
  // mesma obra. Só entra: responsavel===usuário (bloco "Minhas") OU
  // pendência sem responsável explícito mas vinculada (via movelId) a uma
  // tarefa deste usuário — nenhum vínculo novo, reusa state.tarefas. Novo
  // colaborador sintético (sem nenhum vínculo prévio de seed) pra não
  // repetir a poluição de dado real já vista com "Ana Ferreira" no bloco 6.
  const nomeProducaoTeste = "Fixture PRODUÇÃO teste";
  appHoje.M.COLABORADORES.push({id:"fx4-colab-producao", nome:nomeProducaoTeste, cargo:"Produção Fixture", iniciais:"PT", perfil:"OPERADOR", telefone:""});
  const oProducaoFx = obraFixtureHoje({id:"fx4-hoje-producao", numeroOS:"OS HOJE/PRODFX",
    ambientes:[{id:"amb-fx4-hoje-producao", nome:"Ambiente", moveis:[
      {id:"mov-fx4-hoje-producao-a", nome:"Móvel A", etapa:"CORTE", componentesCriticos:[]},
      {id:"mov-fx4-hoje-producao-b", nome:"Móvel B", etapa:"CORTE", componentesCriticos:[]},
    ]}]});
  appHoje.M.Store.state.obras.push(oProducaoFx);
  const pMinha = appHoje.M.Store.criarPendencia({obraId:oProducaoFx.id, movelId:"mov-fx4-hoje-producao-a",
    obraNome:oProducaoFx.cliente, categoria:"Outro", descricao:"PENDFX minha responsabilidade direta",
    responsavel:nomeProducaoTeste}).pendencia;
  const pOutraPessoaMesmaObra = appHoje.M.Store.criarPendencia({obraId:oProducaoFx.id, movelId:"mov-fx4-hoje-producao-a",
    obraNome:oProducaoFx.cliente, categoria:"Outro", descricao:"PENDFX de outra pessoa mesma obra",
    responsavel:"Outra Pessoa Qualquer"}).pendencia;
  const pSemResponsavelComVinculo = appHoje.M.Store.criarPendencia({obraId:oProducaoFx.id, movelId:"mov-fx4-hoje-producao-b",
    obraNome:oProducaoFx.cliente, categoria:"Outro", descricao:"PENDFX sem responsável mas com tarefa própria",
    responsavel:null}).pendencia;
  const pSemResponsavelSemVinculo = appHoje.M.Store.criarPendencia({obraId:oProducaoFx.id, movelId:"mov-fx4-hoje-producao-a",
    obraNome:oProducaoFx.cliente, categoria:"Outro", descricao:"PENDFX sem responsável e sem tarefa própria",
    responsavel:null}).pendencia;
  // tarefa que liga o usuário ao Móvel B (mesmo vínculo que
  // obraIdsDoColaborador já lê de state.tarefas) — Móvel A não recebe
  // tarefa nenhuma dela, então pSemResponsavelSemVinculo fica de fato
  // sem vínculo comprovável.
  appHoje.M.Store.state.tarefas.push({id:"fx4-tarefa-producao", obraId:oProducaoFx.id, movelId:"mov-fx4-hoje-producao-b",
    titulo:"Tarefa fixture", etapa:"CORTE", status:"PENDENTE", tipo:"PRODUCAO", obrigatorio:"OBRIGATORIO",
    responsavelPlanejado:nomeProducaoTeste, executadoPor:null});

  appHoje.M.Store.setUsuarioAtual(nomeProducaoTeste);
  const resultadoProducao = appHoje.M.Pages.hoje();
  assert.ok(resultadoProducao.html.includes("PENDFX minha responsabilidade direta"), "Produção precisa ver, no bloco 'Minhas pendências', a própria pendência (responsavel===usuário)");
  assert.ok(!resultadoProducao.html.includes("PENDFX de outra pessoa mesma obra"), "Produção NÃO pode ver, em nenhum bloco, pendência atribuída a outra pessoa — nem por estar na mesma obra");
  assert.ok(resultadoProducao.html.includes("PENDFX sem responsável mas com tarefa própria"), "pendência sem responsável explícito, mas vinculada (via movelId) a uma tarefa própria do usuário, precisa aparecer em 'itens que precisam de ação agora'");
  assert.ok(!resultadoProducao.html.includes("PENDFX sem responsável e sem tarefa própria"), "pendência sem responsável E sem nenhum vínculo operacional comprovável não pode aparecer — não é 'ação agora' de ninguém em especial ainda");
}

console.log("Fase 4 (Pendências + Hoje): OK");

// ==================================================================
// FASE 5 — MONTAGEM V2 ("estados aprovados", aprovação por permissão,
// travamento manual com motivo, planejamento previsto×real, fim real da
// montagem). Contexto isolado (appFase5), fixtures próprias — não reusa
// nem contamina os dados de seed/dev nem os contextos de fases anteriores.
// ==================================================================
const appFase5 = contextoBase();
executar(appFase5, "js/data.js");
appFase5.M.UI = {
  esc:(s)=> String(s==null?"":s), icon:()=>"", card:(o)=> `[[${o.title||""}]]`+(o.body||""),
  situacaoAmbienteChip:(sit)=> `[chip:${sit.key}]`, progressBar:()=>"", statTile:()=>"", person:(n)=>n||"",
  valorOuOculto:(v)=>v,
  // REFINO VISUAL V2 — stubs mínimos dos componentes novos usados por
  // js/pages/montagem.js (Opção A). secaoComVerTodos aqui NUNCA trunca (sem
  // "limite" real) — os testes desta fase verificam presença de conteúdo
  // por texto (assert html.includes(...)), não paginação/expansão visual
  // (essa é validada no smoke test com Playwright/produção, não no VM).
  kpiTile:(o)=> `[kpi:${o.label}=${o.value}]`,
  kpiRow:(tiles)=> (tiles||[]).join(""),
  secHead:(o)=> `[[${o.titulo||""}]]`,
  secaoComVerTodos:(o)=> ({itensHtml:(o.itens||[]).join(""), toggleHtml:"", ocultos:0, total:(o.itens||[]).length}),
};
appFase5.M.Pages = {};
appFase5.M.UIState = {calFiltros: new Set(["PRODUCAO","ENTREGAS","MONTAGENS","PENDENCIAS","FORNECEDORES","ASSISTENCIAS"])};
executar(appFase5, "js/store.js");
executar(appFase5, "js/calc.js");
executar(appFase5, "js/pages/calendario.js");
executar(appFase5, "js/pages/montagem.js");

function comoUsuarioFase5(nome, fn){
  const original = appFase5.M.Store.state.usuarioAtual;
  appFase5.M.Store.setUsuarioAtual(nome);
  try{ return fn(); } finally { appFase5.M.Store.setUsuarioAtual(original); }
}
let _fx5Seq = 0;
// por padrão, o móvel já nasce em "FINALIZADA" (além de MONTAGEM) — assim
// naoMontados=0 de cara, e cada teste só precisa se preocupar com o que
// está testando (bloqueio/checklist/permissão), não com etapa de móvel.
function obraFixture5(over){
  _fx5Seq++;
  const id = "fx5-obra-"+_fx5Seq;
  const ambId = "fx5-amb-"+_fx5Seq, movId = "fx5-mov-"+_fx5Seq;
  return Object.assign({
    id, numeroOS:"OS FIXTURE5/"+_fx5Seq, cliente:"Cliente Fixture 5",
    dataOS:appFase5.M.todayISO(), criadaEm:appFase5.M.todayISO(),
    dataEntregaPrevista:appFase5.M.dOff(30), dataEntregaReal:null,
    valorBruto:1000, valorLiquido:1000, status:"EM_PRODUCAO", responsavel:"Teste",
    ambientes:[{id:ambId, nome:"Ambiente Fixture 5", moveis:[{id:movId, nome:"Móvel Fixture 5", etapa:"FINALIZADA", componentesCriticos:[]}]}],
  }, over);
}
function checklistCompleto(){
  const c = {}; appFase5.M.CHECKLIST_ENCERRAMENTO_AMBIENTE.forEach(item=> c[item]=true); return c;
}
// perfis reais do seed, sem inventar colaborador novo: Roberto Diniz
// (MONTADOR: montagem.marcarPronto=true, aprovarFinalizacao=false), Paulo
// Henrique (ADMIN: as duas true), Willian Souza (OPERADOR: nenhuma das
// duas — bom pra testar SEM_PERMISSAO de verdade).
const MONTADOR5 = "Roberto Diniz", APROVADOR5 = "Paulo Henrique", SEM_PERM5 = "Willian Souza";

// ---- 1) NAO_INICIADO → EM_MONTAGEM (iniciar montagem manualmente) ----
{
  const o = obraFixture5({ambientes:[{id:"fx5-amb-i1", nome:"Amb", moveis:[{id:"fx5-mov-i1", nome:"Mov", etapa:"CORTE", componentesCriticos:[]}]}]});
  appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "NAO_INICIADO", "ambiente sem nenhum móvel avançado e sem início manual começa NAO_INICIADO");
  const semPerm = comoUsuarioFase5(SEM_PERM5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(a.id));
  assert.equal(semPerm.ok, false, "perfil sem montagem.iniciar não pode iniciar montagem");
  const r = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(a.id));
  assert.equal(r.ok, true, "Montador (montagem.iniciar) pode iniciar montagem");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "EM_MONTAGEM", "depois de iniciar, ambiente vira EM_MONTAGEM mesmo sem nenhum móvel ter avançado etapa");
  assert.ok(!!a.montagemInicioReal, "montagemInicioReal fica registrado no ambiente");
  assert.ok(o.planejamentoMontagem && !!o.planejamentoMontagem.inicioReal, "início real da OBRA é capturado automaticamente no primeiro ambiente iniciado");
  const hist = appFase5.M.Store.state.historico.find(h=>h.tipo==="AMBIENTE_MONTAGEM_INICIADA" && h.obraId===o.id);
  assert.ok(hist, "histórico registra AMBIENTE_MONTAGEM_INICIADA");
}

// ---- 2/3/4) EM_MONTAGEM → TRAVADO (manual, motivo obrigatório) → EM_MONTAGEM ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(a.id));
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "EM_MONTAGEM");
  const semMotivo = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarAmbienteTravado(a.id, ""));
  assert.equal(semMotivo.ok, false, "travar sem motivo falha");
  assert.equal(semMotivo.motivo, "MOTIVO_OBRIGATORIO");
  const semPerm = comoUsuarioFase5(SEM_PERM5, ()=> appFase5.M.Store.marcarAmbienteTravado(a.id, "teste"));
  assert.equal(semPerm.ok, false, "perfil sem montagem.travar não pode travar manualmente");
  const r = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarAmbienteTravado(a.id, "Equipe remanejada pro outro canteiro"));
  assert.equal(r.ok, true);
  const sitTravado = appFase5.M.Calc.situacaoAmbiente(a);
  assert.equal(sitTravado.key, "TRAVADO", "EM_MONTAGEM → TRAVADO com motivo manual");
  assert.equal(sitTravado.origem, "MANUAL");
  assert.equal(sitTravado.motivo, "Equipe remanejada pro outro canteiro", "motivo do travamento manual aparece na situação");
  assert.ok(appFase5.M.Store.state.historico.find(h=>h.tipo==="AMBIENTE_TRAVADO_MANUAL" && h.obraId===o.id), "histórico registra AMBIENTE_TRAVADO_MANUAL");
  // destravar
  const destravarSemPerm = comoUsuarioFase5(SEM_PERM5, ()=> appFase5.M.Store.destravarAmbiente(a.id));
  assert.equal(destravarSemPerm.ok, false, "perfil sem montagem.destravar não pode destravar");
  const rd = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.destravarAmbiente(a.id));
  assert.equal(rd.ok, true, "TRAVADO (manual) → EM_MONTAGEM via destravar");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "EM_MONTAGEM");
  assert.ok(appFase5.M.Store.state.historico.find(h=>h.tipo==="AMBIENTE_DESTRAVADO" && h.obraId===o.id), "histórico registra AMBIENTE_DESTRAVADO");
}

// ---- 2b) permissões granulares de fato DESACOPLADAS (rodada de ajustes,
// item 2 + item 5): desligar montagem.iniciar/travar/destravar do Montador
// via override NÃO afeta as outras duas — prova de que não é a mesma chave
// disfarçada de três nomes. Sempre restaura o default no final. ----
{
  // iniciar
  const o1 = obraFixture5(); appFase5.M.Store.state.obras.push(o1);
  const a1 = o1.ambientes[0];
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.setPermissao("MONTADOR","montagem.iniciar", false));
  const semIniciar = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(a1.id));
  assert.equal(semIniciar.ok, false, "override: com montagem.iniciar=false, Montador não inicia mais montagem");
  assert.equal(semIniciar.motivo, "SEM_PERMISSAO");
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(a1.id)); // Admin inicia por ele (mantém montagem.iniciar)
  const rProntoSemIniciar = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a1.id, {checklist: checklistCompleto()}));
  assert.equal(rProntoSemIniciar.ok, true, "Montador sem montagem.iniciar CONTINUA podendo marcar pronto — as chaves são independentes, não uma reaproveitando a outra");
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.setPermissao("MONTADOR","montagem.iniciar", true)); // restaura

  // travar
  const o2 = obraFixture5(); appFase5.M.Store.state.obras.push(o2);
  const a2 = o2.ambientes[0];
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.setPermissao("MONTADOR","montagem.travar", false));
  const semTravar = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarAmbienteTravado(a2.id, "motivo qualquer"));
  assert.equal(semTravar.ok, false, "override: com montagem.travar=false, Montador não trava mais manualmente");
  assert.equal(semTravar.motivo, "SEM_PERMISSAO");
  const rIniciarSemTravar = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(a2.id));
  assert.equal(rIniciarSemTravar.ok, true, "Montador sem montagem.travar CONTINUA podendo iniciar montagem — chaves independentes");
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.setPermissao("MONTADOR","montagem.travar", true)); // restaura

  // destravar
  const o3 = obraFixture5(); appFase5.M.Store.state.obras.push(o3);
  const a3 = o3.ambientes[0];
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(a3.id));
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarAmbienteTravado(a3.id, "motivo qualquer"));
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.setPermissao("MONTADOR","montagem.destravar", false));
  const semDestravar = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.destravarAmbiente(a3.id));
  assert.equal(semDestravar.ok, false, "override: com montagem.destravar=false, Montador não destrava mais");
  assert.equal(semDestravar.motivo, "SEM_PERMISSAO");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a3).key, "TRAVADO", "ambiente continua travado — override realmente teve efeito, não foi ignorado");
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.setPermissao("MONTADOR","montagem.destravar", true)); // restaura
  const rDestravarRestaurado = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.destravarAmbiente(a3.id));
  assert.equal(rDestravarRestaurado.ok, true, "depois de restaurar o default, Montador volta a destravar normalmente");
}

// ---- pendência não trava automaticamente (só impacto que bloqueia fechamento) ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  appFase5.M.Store.state.pendencias.push({id:"fx5-pnd-info", obraId:o.id, ambienteId:a.id, status:"ABERTA",
    categoria:"Teste", impacto:"INFORMATIVO", descricao:"só um aviso", abertura:appFase5.M.todayISO()});
  assert.notEqual(appFase5.M.Calc.situacaoAmbiente(a).key, "TRAVADO", "pendência Informativo não trava o ambiente");
  appFase5.M.Store.state.pendencias.push({id:"fx5-pnd-naoimpede", obraId:o.id, ambienteId:a.id, status:"ABERTA",
    categoria:"Teste", impacto:"NAO_IMPEDE", descricao:"não impede", abertura:appFase5.M.todayISO()});
  assert.notEqual(appFase5.M.Calc.situacaoAmbiente(a).key, "TRAVADO", "pendência Não impede também não trava o ambiente");
}

// ---- 5/6/7/8) EM_MONTAGEM → PRONTO_PARA_FINALIZAR (Montador) → aprovação (Admin) → FINALIZADO ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  const semPerm = comoUsuarioFase5(SEM_PERM5, ()=> appFase5.M.Store.marcarProntoAmbiente(a.id, {checklist: checklistCompleto()}));
  assert.equal(semPerm.ok, false, "perfil sem montagem.marcarPronto não pode marcar pronto");
  assert.equal(semPerm.motivo, "SEM_PERMISSAO");

  const rMontador = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a.id, {checklist: checklistCompleto()}));
  assert.equal(rMontador.ok, true, "Montador consegue marcar pronto (checklist completo, sem bloqueio)");
  assert.equal(rMontador.status, "PRONTO_PARA_FINALIZAR");
  assert.equal(rMontador.aguardandoAprovacao, true);
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "PRONTO_PARA_FINALIZAR", "EM_MONTAGEM → PRONTO_PARA_FINALIZAR");
  assert.ok(appFase5.M.Store.state.historico.find(h=>h.tipo==="AMBIENTE_PRONTO_PARA_FINALIZAR" && h.obraId===o.id), "histórico registra AMBIENTE_PRONTO_PARA_FINALIZAR");

  // "O Montador NÃO deve aprovar sozinho a finalização definitiva" — testado
  // de duas formas: (a) chamar aprovarFinalizacaoAmbiente como Montador falha;
  // (b) o ambiente PERMANECE PRONTO_PARA_FINALIZAR (não virou FINALIZADO sozinho).
  const aprovarComoMontador = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a.id));
  assert.equal(aprovarComoMontador.ok, false, "Montador não pode aprovar finalização — falta montagem.aprovarFinalizacao");
  assert.equal(aprovarComoMontador.motivo, "SEM_PERMISSAO");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "PRONTO_PARA_FINALIZAR", "ambiente continua PRONTO_PARA_FINALIZAR, não vira FINALIZADO sozinho");

  // PRONTO_PARA_FINALIZAR não conta como fechado (Calc.taxaFechamento)
  assert.equal(appFase5.M.Calc.taxaFechamento(o), 0, "PRONTO_PARA_FINALIZAR não conta pra taxa de fechamento");
  assert.equal(appFase5.M.Calc.montagemFinalizadaObra(o).finalizada, false, "obra não está com montagem finalizada enquanto o ambiente só está PRONTO_PARA_FINALIZAR");

  // quem TEM montagem.aprovarFinalizacao aprova
  const rAprovar = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a.id));
  assert.equal(rAprovar.ok, true, "usuário com montagem.aprovarFinalizacao aprova o ambiente pronto");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "FINALIZADO", "PRONTO_PARA_FINALIZAR → FINALIZADO após aprovação");
  assert.ok(appFase5.M.Store.state.historico.find(h=>h.tipo==="AMBIENTE_FINALIZADO_APROVADO" && h.obraId===o.id), "histórico registra AMBIENTE_FINALIZADO_APROVADO");

  // FINALIZADO conta para Fechamento
  assert.equal(appFase5.M.Calc.taxaFechamento(o), 100, "FINALIZADO conta 100% na taxa de fechamento (obra de 1 ambiente)");
  assert.equal(appFase5.M.Calc.montagemFinalizadaObra(o).finalizada, true, "obra com único ambiente FINALIZADO conta como montagem finalizada (fim real)");
  assert.ok(o.planejamentoMontagem && !!o.planejamentoMontagem.fimReal, "fim real da obra é capturado automaticamente quando o último ambiente fecha");
}

// ---- AJUSTE OBRIGATÓRIO (item 1 do pedido): mesmo o Admin, que TEM as
// duas permissões (montagem.marcarPronto E montagem.aprovarFinalizacao),
// NÃO pula PRONTO_PARA_FINALIZAR. E aprovar direto num ambiente ainda
// EM_MONTAGEM (sem passar por marcarPronto) retorna erro de transição. ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "EM_MONTAGEM");

  const aprovarCedo = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a.id));
  assert.equal(aprovarCedo.ok, false, "aprovar direto em EM_MONTAGEM falha — não existe atalho, mesmo pra quem tem as duas permissões");
  assert.equal(aprovarCedo.motivo, "TRANSICAO_INVALIDA", "aprovar fora de PRONTO_PARA_FINALIZAR retorna erro de transição, não SEM_PERMISSAO");
  assert.equal(aprovarCedo.estadoAtual, "EM_MONTAGEM");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "EM_MONTAGEM", "estado não mudou depois da tentativa inválida");

  const rPronto = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a.id, {checklist: checklistCompleto()}));
  assert.equal(rPronto.ok, true);
  assert.equal(rPronto.status, "PRONTO_PARA_FINALIZAR", "Admin com montagem.aprovarFinalizacao TAMBÉM só marca pronto por aqui — nunca pula pra FINALIZADO");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "PRONTO_PARA_FINALIZAR", "mesmo o Admin passa PRIMEIRO por PRONTO_PARA_FINALIZAR");

  const rAprova = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a.id));
  assert.equal(rAprova.ok, true, "só DEPOIS, numa ação separada, o Admin aprova de verdade");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "FINALIZADO", "aprovar a partir de PRONTO_PARA_FINALIZAR funciona normalmente");
}

// ---- pendência BLOQUEIA_AMBIENTE impede fechamento (não existe EM_MONTAGEM
// enquanto travado, então marcarProntoAmbiente nem chega a olhar pro
// checklist — falha por transição, não por "pendente") ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  appFase5.M.Store.state.pendencias.push({id:"fx5-pnd-bloq", obraId:o.id, ambienteId:a.id, status:"ABERTA",
    categoria:"Teste", impacto:"BLOQUEIA_AMBIENTE", descricao:"Falta ferragem", abertura:appFase5.M.todayISO()});
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "TRAVADO", "pendência BLOQUEIA_AMBIENTE trava o ambiente automaticamente");
  const r = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a.id, {checklist: checklistCompleto()}));
  assert.equal(r.ok, false, "não dá pra marcar pronto (nem quem aprova) com pendência bloqueante aberta");
  assert.equal(r.motivo, "TRANSICAO_INVALIDA");
  assert.equal(r.estadoAtual, "TRAVADO");
}

// ---- FINALIZADO_COM_RESSALVA exige motivo + permissão; se o travamento vier
// de pendência, a relação é registrada no histórico automaticamente ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  appFase5.M.Store.state.pendencias.push({id:"fx5-pnd-ressalva", obraId:o.id, ambienteId:a.id, status:"ABERTA",
    categoria:"Teste", impacto:"BLOQUEIA_AMBIENTE", descricao:"Item fora de linha", abertura:appFase5.M.todayISO()});
  const semPermRessalva = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.finalizarComRessalva(a.id, {checklist: checklistCompleto(), motivo:"teste"}));
  assert.equal(semPermRessalva.ok, false, "Montador não tem montagem.finalizarComRessalva — não pode finalizar com ressalva");
  assert.equal(semPermRessalva.motivo, "SEM_PERMISSAO");
  const semMotivo = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.finalizarComRessalva(a.id, {checklist: checklistCompleto(), motivo:""}));
  assert.equal(semMotivo.ok, false, "ressalva sem motivo falha");
  assert.equal(semMotivo.motivo, "MOTIVO_OBRIGATORIO");
  const r = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.finalizarComRessalva(a.id, {checklist: checklistCompleto(), motivo:"Item fora de linha, cliente ciente"}));
  assert.equal(r.ok, true);
  assert.equal(r.status, "FINALIZADO_COM_RESSALVA", "nome canônico do status retornado — não o nome interno antigo FINALIZADA_RESSALVA");
  assert.equal(a.montagemStatus, "FINALIZADO_COM_RESSALVA", "campo bruto a.montagemStatus também usa o nome canônico");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "FINALIZADO_COM_RESSALVA");
  assert.equal(appFase5.M.Calc.taxaFechamento(o), 100, "FINALIZADO_COM_RESSALVA também conta pra taxa de fechamento");
  assert.equal(a.montagemRessalva.pendenciaVinculada, "fx5-pnd-ressalva", "travamento vindo de pendência é vinculado automaticamente na ressalva, mesmo sem informar explicitamente");
  const histRessalva = appFase5.M.Store.state.historico.find(h=>h.tipo==="AMBIENTE_FINALIZADO_RESSALVA" && h.obraId===o.id);
  assert.ok(histRessalva, "histórico registra AMBIENTE_FINALIZADO_RESSALVA");
  assert.ok(histRessalva.descricao.includes("pendência"), "histórico menciona a relação com a pendência que travava o ambiente");
}

// ---- NAO_INICIADO NÃO pode ir para FINALIZADO_COM_RESSALVA ----
{
  const o = obraFixture5({ambientes:[{id:"fx5-amb-ni-r", nome:"Amb", moveis:[{id:"fx5-mov-ni-r", nome:"Mov", etapa:"CORTE", componentesCriticos:[]}]}]});
  appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "NAO_INICIADO");
  const r = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.finalizarComRessalva(a.id, {checklist: checklistCompleto(), motivo:"teste"}));
  assert.equal(r.ok, false, "NAO_INICIADO não pode ir direto pra FINALIZADO_COM_RESSALVA");
  assert.equal(r.motivo, "TRANSICAO_INVALIDA");
  assert.equal(r.estadoAtual, "NAO_INICIADO");
}

// ---- EM_MONTAGEM / TRAVADO / PRONTO_PARA_FINALIZAR — as 3 origens
// autorizadas de ressalva funcionam ----
{
  const oA = obraFixture5(); appFase5.M.Store.state.obras.push(oA);
  const aA = oA.ambientes[0];
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(aA.id));
  assert.equal(appFase5.M.Calc.situacaoAmbiente(aA).key, "EM_MONTAGEM");
  const rA = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.finalizarComRessalva(aA.id, {checklist:{}, motivo:"ressalva a partir de EM_MONTAGEM"}));
  assert.equal(rA.ok, true, "ressalva permitida a partir de EM_MONTAGEM");

  const oB = obraFixture5(); appFase5.M.Store.state.obras.push(oB);
  const aB = oB.ambientes[0];
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(aB.id));
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarAmbienteTravado(aB.id, "motivo qualquer"));
  assert.equal(appFase5.M.Calc.situacaoAmbiente(aB).key, "TRAVADO");
  const rB = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.finalizarComRessalva(aB.id, {checklist:{}, motivo:"ressalva a partir de TRAVADO manual"}));
  assert.equal(rB.ok, true, "ressalva permitida a partir de TRAVADO");

  const oC = obraFixture5(); appFase5.M.Store.state.obras.push(oC);
  const aC = oC.ambientes[0];
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(aC.id, {checklist: checklistCompleto()}));
  assert.equal(appFase5.M.Calc.situacaoAmbiente(aC).key, "PRONTO_PARA_FINALIZAR");
  const rC = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.finalizarComRessalva(aC.id, {checklist: checklistCompleto(), motivo:"ressalva a partir de PRONTO_PARA_FINALIZAR"}));
  assert.equal(rC.ok, true, "ressalva permitida a partir de PRONTO_PARA_FINALIZAR");
}

// ---- fim real só ocorre quando TODOS os ambientes obrigatórios fecham (obra de 2 ambientes) ----
{
  const o = obraFixture5({ambientes:[
    {id:"fx5-amb-2a", nome:"Amb A", moveis:[{id:"fx5-mov-2a", nome:"Mov A", etapa:"FINALIZADA", componentesCriticos:[]}]},
    {id:"fx5-amb-2b", nome:"Amb B", moveis:[{id:"fx5-mov-2b", nome:"Mov B", etapa:"FINALIZADA", componentesCriticos:[]}]},
  ]});
  appFase5.M.Store.state.obras.push(o);
  const [a1,a2] = o.ambientes;
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a1.id, {checklist: checklistCompleto()}));
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a1.id));
  assert.equal(appFase5.M.Calc.montagemFinalizadaObra(o).finalizada, false, "com só 1 de 2 ambientes finalizado, montagem da obra NÃO está finalizada");
  assert.equal(o.planejamentoMontagem, undefined, "fim real não é gravado enquanto a obra não fechou (nem planejamentoMontagem chega a existir, já que nenhum início real foi capturado neste teste)");
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a2.id, {checklist: checklistCompleto()}));
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a2.id));
  assert.equal(appFase5.M.Calc.montagemFinalizadaObra(o).finalizada, true, "com os 2 ambientes finalizados, montagem da obra agora está finalizada (fim real)");
}

// ---- Produção física × Montagem física × Fechamento continuam métricas
// separadas (nunca somadas) — fixture onde produção=100%, físico=100%,
// mas fechamento ainda é 0% (ninguém marcou pronto/aprovou ainda) ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o); // móvel já nasce FINALIZADA (produção 100%, físico 100%)
  assert.equal(appFase5.M.Calc.progressoObra(o).pct, 100, "progresso de produção (móvel concluído) é 100%");
  assert.equal(appFase5.M.Calc.progressoFisicoMontagem(o).valueOf ? appFase5.M.Calc.progressoFisicoMontagem(o) : appFase5.M.Calc.progressoFisicoMontagem(o), 100, "progresso físico de montagem também é 100% (móvel já além da etapa MONTAGEM)");
  assert.equal(appFase5.M.Calc.taxaFechamento(o), 0, "mas taxa de fechamento é 0% — nenhum ambiente foi formalmente finalizado ainda; as três métricas nunca se confundem");
}

// ---- reabrir ambiente limpa fimReal da obra (permite recontagem honesta) ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.iniciarMontagemAmbiente(a.id));
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a.id, {checklist: checklistCompleto()}));
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a.id));
  assert.ok(o.planejamentoMontagem.fimReal, "fim real gravado após finalizar único ambiente");
  appFase5.M.Store.reabrirAmbiente(a.id);
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "EM_MONTAGEM", "ambiente reaberto volta pra EM_MONTAGEM (tinha início real registrado)");
  assert.equal(o.planejamentoMontagem.fimReal, null, "reabrir limpa o fim real da obra — a montagem não está mais de fato encerrada");
}

// ---- planejamento de montagem (§10): obra.editar necessário; fim previsto calculado ----
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const semPerm = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.setPlanejamentoMontagem(o.id, {inicioPrevisto:"2026-01-01", duracaoEstimadaValor:10, duracaoEstimadaUnidade:"dias_uteis"}));
  assert.equal(semPerm.ok, false, "Montador não tem obra.editar — não pode planejar montagem");
  const r = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.setPlanejamentoMontagem(o.id, {inicioPrevisto:"2026-01-01", duracaoEstimadaValor:10, duracaoEstimadaUnidade:"dias_uteis"}));
  assert.equal(r.ok, true, "Admin (obra.editar) pode definir planejamento");
  assert.equal(o.planejamentoMontagem.fimPrevistoCalculado, "2026-01-15", "10 dias úteis a partir de 01/01 calcula fim previsto (~14 dias corridos)");
  assert.ok(appFase5.M.Store.state.historico.find(h=>h.tipo==="OBRA_PLANEJAMENTO_MONTAGEM_DEFINIDO" && h.obraId===o.id), "histórico registra OBRA_PLANEJAMENTO_MONTAGEM_DEFINIDO");
}

// ---- nenhuma permissão da Fase 1 foi relaxada (spot-check da matriz montagem.*) ----
{
  const esperado = {
    ADMIN:{marcarPronto:true, aprovarFinalizacao:true, finalizarComRessalva:true},
    PCP:{marcarPronto:true, aprovarFinalizacao:false, finalizarComRessalva:true},
    LIDERANCA:{marcarPronto:true, aprovarFinalizacao:false, finalizarComRessalva:true},
    OPERADOR:{marcarPronto:false, aprovarFinalizacao:false, finalizarComRessalva:false},
    MONTADOR:{marcarPronto:true, aprovarFinalizacao:false, finalizarComRessalva:false},
    GESTOR:{marcarPronto:true, aprovarFinalizacao:false, finalizarComRessalva:true},
    ASSISTENCIA:{marcarPronto:false, aprovarFinalizacao:false, finalizarComRessalva:false},
  };
  Object.keys(esperado).forEach(perfilKey=>{
    const def = appFase5.M.perfilDef(perfilKey);
    assert.equal(def.pode["montagem.marcarPronto"], esperado[perfilKey].marcarPronto, `montagem.marcarPronto de ${perfilKey} não pode ter mudado`);
    assert.equal(def.pode["montagem.aprovarFinalizacao"], esperado[perfilKey].aprovarFinalizacao, `montagem.aprovarFinalizacao de ${perfilKey} não pode ter mudado`);
    assert.equal(def.pode["montagem.finalizarComRessalva"], esperado[perfilKey].finalizarComRessalva, `montagem.finalizarComRessalva de ${perfilKey} não pode ter mudado`);
  });
}

// ---- defaults das NOVAS permissões granulares (rodada de ajustes, item 2):
// Admin/PCP/Líder/Gestor/Montador recebem as 3; Produção/Assistência/TV não
// recebem nenhuma. Sem perfil hardcoded em código — isto é só a matriz de
// dados (M.PERFIS), a mesma que Configurações → Permissões edita. ----
{
  const esperadoGranular = {
    ADMIN:true, PCP:true, LIDERANCA:true, GESTOR:true, MONTADOR:true,
    OPERADOR:false, ASSISTENCIA:false, TV:false,
  };
  Object.keys(esperadoGranular).forEach(perfilKey=>{
    const def = appFase5.M.perfilDef(perfilKey);
    ["montagem.iniciar","montagem.travar","montagem.destravar"].forEach(chave=>{
      assert.equal(def.pode[chave], esperadoGranular[perfilKey], `${chave} de ${perfilKey} deveria ser ${esperadoGranular[perfilKey]}`);
    });
  });
}

// ---- estado salvo ANTES desta rodada (com montagem.marcarPronto/
// aprovarFinalizacao/finalizarComRessalva, mas SEM montagem.iniciar/travar/
// destravar) ganha as chaves novas via merge, com o default correto, SEM
// perder uma customização já feita em outra ação — mesmo padrão do teste de
// migração da Fase 1 (appMigracao), aplicado às chaves desta rodada. ----
{
  const appMigracaoFase5 = contextoBase();
  const estadoAntesDoAjuste = {
    obras: [{id:"obra-legado-fase5", cliente:"Cliente Legado", numeroOS:"OS 1", ambientes:[]}],
    permissoes: {
      ADMIN: {"montagem.ver":true, "montagem.marcarPronto":true, "montagem.aprovarFinalizacao":true, "montagem.finalizarComRessalva":true},
      // customização real: um administrador tinha desligado marcarPronto
      // do PCP antes desta rodada — isso não pode se perder na migração.
      PCP: {"montagem.ver":true, "montagem.marcarPronto":false, "montagem.aprovarFinalizacao":false, "montagem.finalizarComRessalva":true},
      MONTADOR: {"montagem.ver":true, "montagem.marcarPronto":true, "montagem.aprovarFinalizacao":false, "montagem.finalizarComRessalva":false},
    },
    usuarioAtual: "Paulo Henrique",
  };
  appMigracaoFase5.localStorage.setItem("moodo_producao_state_v1", JSON.stringify(estadoAntesDoAjuste));
  executar(appMigracaoFase5, "js/data.js");
  executar(appMigracaoFase5, "js/store.js");
  const permMigradas = appMigracaoFase5.M.Store.state.permissoes;
  assert.equal(permMigradas.PCP["montagem.marcarPronto"], false, "customização feita antes desta rodada (PCP sem marcarPronto) não pode se perder na migração");
  assert.equal(permMigradas.PCP["montagem.iniciar"], true, "PCP ganha montagem.iniciar com o default atual (true), mesmo vindo de um estado que não tinha essa chave");
  assert.equal(permMigradas.MONTADOR["montagem.iniciar"], true, "Montador ganha montagem.iniciar=true (default) ao migrar");
  assert.equal(permMigradas.MONTADOR["montagem.travar"], true, "Montador ganha montagem.travar=true (default) ao migrar");
  assert.equal(permMigradas.MONTADOR["montagem.destravar"], true, "Montador ganha montagem.destravar=true (default) ao migrar");
  assert.equal(permMigradas.ADMIN["montagem.marcarPronto"], true, "chave já existente e não customizada continua com o valor salvo");
  // e o app não trava calculando pode() pra ninguém depois dessa migração:
  appMigracaoFase5.M.Store.setUsuarioAtual("Roberto Diniz");
  assert.equal(appMigracaoFase5.M.Store.pode("montagem.iniciar"), true);
}

// ==================================================================
// ÚLTIMOS AJUSTES ANTES DO PUSH — item 1: FINALIZADO_COM_RESSALVA exige
// EXCLUSIVAMENTE montagem.finalizarComRessalva. liberarExcecao sozinho (sem
// montagem.finalizarComRessalva) não é mais um bypass válido pra essa
// transição específica — mesmo que liberarExcecao continue valendo pra
// outros fluxos legados (garantia CORTESIA, travar pendência).
// ==================================================================
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  // PCP tem liberarExcecao=true por padrão — desliga só montagem.finalizarComRessalva
  // pra isolar exatamente o caso pedido: liberarExcecao=true E
  // montagem.finalizarComRessalva=false.
  assert.equal(appFase5.M.perfilDef("PCP").pode.liberarExcecao, true, "pré-condição do teste: PCP tem liberarExcecao=true por padrão");
  appFase5.M.Store.setPermissao("PCP", "montagem.finalizarComRessalva", false);
  const rBloqueado = comoUsuarioFase5("Beatriz Nogueira" /* PCP no seed */, ()=> appFase5.M.Store.finalizarComRessalva(a.id, {checklist: checklistCompleto(), motivo:"tentativa via liberarExcecao"}));
  assert.equal(rBloqueado.ok, false, "liberarExcecao=true sozinho NÃO autoriza mais finalizar com ressalva na Montagem V2");
  assert.equal(rBloqueado.motivo, "SEM_PERMISSAO");
  assert.notEqual(appFase5.M.Calc.situacaoAmbiente(a).key, "FINALIZADO_COM_RESSALVA", "ambiente não foi finalizado com ressalva pelo bypass");
  appFase5.M.Store.setPermissao("PCP", "montagem.finalizarComRessalva", true); // restaura, não deixar resíduo pros testes seguintes

  // e com montagem.finalizarComRessalva=true (o critério correto e único agora),
  // a ação funciona normalmente pro mesmo perfil.
  const rAutorizado = comoUsuarioFase5("Beatriz Nogueira", ()=> appFase5.M.Store.finalizarComRessalva(a.id, {checklist: checklistCompleto(), motivo:"agora com a permissão certa"}));
  assert.equal(rAutorizado.ok, true, "montagem.finalizarComRessalva sozinho autoriza a ressalva quando os demais critérios são válidos");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "FINALIZADO_COM_RESSALVA");

  // liberarExcecao continua funcionando nos fluxos legados que já usavam
  // essa permissão (não foi removida do sistema, só deixou de valer aqui) —
  // spot-check: garantia CORTESIA continua exigindo liberarExcecao normalmente.
  assert.equal(appFase5.M.Store.pode("liberarExcecao"), true, "liberarExcecao continua ativa/consultável normalmente pra outros fluxos");
}

// ==================================================================
// ÚLTIMOS AJUSTES ANTES DO PUSH — item 2: nomenclatura canônica de
// a.montagemStatus (FINALIZADO / FINALIZADO_COM_RESSALVA, nunca mais
// FINALIZADA / FINALIZADA_RESSALVA) + migração explícita de estado salvo
// ANTES desta padronização.
// ==================================================================
{
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a.id, {checklist: checklistCompleto()}));
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a.id));
  assert.equal(a.montagemStatus, "FINALIZADO", "campo bruto grava direto o nome canônico — sem passar pelo nome interno antigo FINALIZADA");
}
{
  // estado salvo ANTES da padronização (nomes antigos FINALIZADA/
  // FINALIZADA_RESSALVA) é migrado de forma EXPLÍCITA (Store.migrarMontagemStatusLegado,
  // mapeamento determinístico de 2 valores literais — nenhuma inferência) ao
  // carregar — mesmo padrão de teste de migração usado no restante da suíte
  // (localStorage pré-semeado + carga real de js/store.js).
  const appMigracaoStatus = contextoBase();
  const estadoAntesDoAjuste = {
    obras: [{
      id:"obra-legado-status", cliente:"Cliente Legado Status", numeroOS:"OS 2",
      ambientes:[
        {id:"amb-legado-finalizado", nome:"Ambiente Finalizado Legado", moveis:[], montagemStatus:"FINALIZADA", finalizadoPor:"Teste", finalizadoEm:"2026-01-01"},
        {id:"amb-legado-ressalva", nome:"Ambiente Ressalva Legado", moveis:[], montagemStatus:"FINALIZADA_RESSALVA", montagemRessalva:{motivo:"legado", autorizadoPor:"Teste"}},
        {id:"amb-legado-pronto", nome:"Ambiente Pronto Legado", moveis:[], montagemStatus:"PRONTO_PARA_FINALIZAR"},
      ],
    }],
    usuarioAtual: "Paulo Henrique",
  };
  appMigracaoStatus.localStorage.setItem("moodo_producao_state_v1", JSON.stringify(estadoAntesDoAjuste));
  executar(appMigracaoStatus, "js/data.js");
  executar(appMigracaoStatus, "js/calc.js");
  executar(appMigracaoStatus, "js/store.js");
  const obraMigrada = appMigracaoStatus.M.Store.state.obras.find(o=>o.id==="obra-legado-status");
  const [finLegado, ressLegado, prontoLegado] = obraMigrada.ambientes;
  assert.equal(finLegado.montagemStatus, "FINALIZADO", "FINALIZADA (nome antigo) migra pra FINALIZADO (canônico) no boot, sem migração manual obra por obra");
  assert.equal(ressLegado.montagemStatus, "FINALIZADO_COM_RESSALVA", "FINALIZADA_RESSALVA (nome antigo) migra pra FINALIZADO_COM_RESSALVA (canônico) no boot");
  assert.equal(prontoLegado.montagemStatus, "PRONTO_PARA_FINALIZAR", "PRONTO_PARA_FINALIZAR não muda de nome — não precisa e não deve ser tocado pela migração");
  assert.equal(appMigracaoStatus.M.Calc.situacaoAmbiente(finLegado).key, "FINALIZADO", "leitura via situacaoAmbiente() confirma o estado migrado, sem nenhuma tradução de nome antigo no caminho de leitura");
  assert.equal(appMigracaoStatus.M.Calc.situacaoAmbiente(ressLegado).key, "FINALIZADO_COM_RESSALVA");
}

// ==================================================================
// ÚLTIMOS AJUSTES ANTES DO PUSH — item 3: checklist continua obrigatório
// pra EM_MONTAGEM → PRONTO_PARA_FINALIZAR; PRONTO_PARA_FINALIZAR →
// FINALIZADO não reexige checklist, mas rejeita se surgiu um bloqueio novo
// depois de marcar pronto.
// ==================================================================
{
  // checklist incompleto continua bloqueando marcarProntoAmbiente (regra já
  // aprovada, sem mudança — só confirmando que continua valendo).
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  const checklistIncompleto = checklistCompleto();
  const primeiroItem = Object.keys(checklistIncompleto)[0];
  checklistIncompleto[primeiroItem] = false;
  const rIncompleto = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a.id, {checklist: checklistIncompleto}));
  assert.equal(rIncompleto.ok, false, "checklist incompleto continua impedindo marcar pronto");
  assert.equal(rIncompleto.motivo, "PENDENTE");
  assert.ok(rIncompleto.itensChecklistFaltando.includes(primeiroItem));
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "EM_MONTAGEM", "ambiente continua EM_MONTAGEM enquanto o checklist não está completo");
}
{
  // PRONTO_PARA_FINALIZAR → FINALIZADO: NÃO reexige checklist (aprovar não
  // recebe nem olha pra opts.checklist) — mas um bloqueio NOVO (pendência
  // aberta com impacto de bloqueio, surgida DEPOIS de marcar pronto) impede
  // a aprovação, mesmo com o campo bruto ainda "PRONTO_PARA_FINALIZAR".
  const o = obraFixture5(); appFase5.M.Store.state.obras.push(o);
  const a = o.ambientes[0];
  const rPronto = comoUsuarioFase5(MONTADOR5, ()=> appFase5.M.Store.marcarProntoAmbiente(a.id, {checklist: checklistCompleto()}));
  assert.equal(rPronto.ok, true);
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "PRONTO_PARA_FINALIZAR");

  // aprovarFinalizacaoAmbiente não recebe opts nenhum — confirma que a
  // assinatura da função não tem como reexigir checklist (só ambienteId).
  assert.equal(appFase5.M.Store.aprovarFinalizacaoAmbiente.length, 1, "aprovarFinalizacaoAmbiente só recebe ambienteId — não há como reexigir checklist por aqui");

  // bloqueio novo surge DEPOIS de marcar pronto (pendência aberta com
  // impacto que bloqueia fechamento) — a.montagemStatus continua
  // "PRONTO_PARA_FINALIZAR" (nada nessa ação mexe nesse campo), mas
  // situacaoAmbiente() já daria prioridade a TRAVADO.
  appFase5.M.Store.state.pendencias.push({id:"fx5-pnd-pos-pronto", obraId:o.id, ambienteId:a.id, status:"ABERTA",
    categoria:"Teste", impacto:"BLOQUEIA_AMBIENTE", descricao:"Bloqueio surgido depois de marcar pronto", abertura:appFase5.M.todayISO()});
  assert.equal(a.montagemStatus, "PRONTO_PARA_FINALIZAR", "campo bruto não muda só por causa da pendência nova (bloqueio é sempre derivado, nunca gravado no campo)");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "TRAVADO", "situacaoAmbiente já reflete o bloqueio novo, mesmo com o campo bruto intacto");

  const rAprovarBloqueado = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a.id));
  assert.equal(rAprovarBloqueado.ok, false, "aprovação é recusada quando surgiu um bloqueio novo depois de marcar pronto");
  assert.equal(rAprovarBloqueado.motivo, "BLOQUEIO_SURGIU_APOS_PRONTO");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "TRAVADO", "ambiente continua TRAVADO — não foi finalizado por cima do bloqueio");

  // resolvendo a pendência, a aprovação volta a funcionar normalmente — sem
  // precisar refazer o checklist (não foi pedido de novo em opts nenhuma vez).
  comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.resolverPendencia("fx5-pnd-pos-pronto", {}));
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "PRONTO_PARA_FINALIZAR", "com a pendência resolvida, volta a PRONTO_PARA_FINALIZAR");
  const rAprovarDepois = comoUsuarioFase5(APROVADOR5, ()=> appFase5.M.Store.aprovarFinalizacaoAmbiente(a.id));
  assert.equal(rAprovarDepois.ok, true, "depois de resolver o bloqueio novo, aprovar funciona normalmente, sem reexigir checklist");
  assert.equal(appFase5.M.Calc.situacaoAmbiente(a).key, "FINALIZADO");
}

// ---- smoke: a página Montagem V2 renderiza sem lançar, pro Admin ----
{
  comoUsuarioFase5(APROVADOR5, ()=>{
    const resultado = appFase5.M.Pages.montagem();
    assert.ok(resultado && typeof resultado.html === "string" && resultado.html.length>0, "M.Pages.montagem() renderiza HTML sem lançar exceção");
  });
}

console.log("Fase 5 (Montagem V2): OK");

// ==================================================================
// FASE 6 — Agenda V2. Contexto isolado com fixtures próprias (mesmo padrão
// das fases anteriores). Cobre: Store.criarEvento/atualizarEvento/
// cancelarEvento (CRUD manual + guards de permissão/origem), M.Agenda
// (derivação MONTAGEM/ASSISTENCIA sem duplicar fonte, escopo por perfil,
// filtros) e M.Calc.conflitosAgenda/idsEmConflitoAgenda (§26 do pedido).
// Não testa aqui o HTML de agenda.js (mesma convenção da Fase 4/5 — esse
// arquivo testa Store/Calc/M.Agenda direto); a tela foi validada
// visualmente via Playwright (screenshots no relatório de entrega). Um
// smoke test mínimo de renderização (como a Fase 5 já faz com Montagem)
// fecha a lacuna de "explode ao renderizar" sem precisar de M.UI real.
// ==================================================================
const appFase6 = contextoBase();
executar(appFase6, "js/data.js");
appFase6.M.UI = {
  esc:(s)=> String(s==null?"":s), icon:()=>"",
  tipoEventoChip:(t)=> `[tipo:${t}]`, statusEventoChip:(s)=> `[status:${s}]`,
};
appFase6.M.Pages = {};
appFase6.M.UIState = {
  agendaView:"SEMANA", agendaAno: null, agendaMes: null, agendaSemanaInicio: null, agendaDia: null,
  agendaFiltros: {tipo:"", equipe:"", obraId:"", status:""}, agendaEventoSelId:null, agendaMobileTab:"HOJE",
};
executar(appFase6, "js/store.js");
executar(appFase6, "js/calc.js");
executar(appFase6, "js/pages/agenda.js");
// TODAY não existe ainda no momento em que M.UIState foi literal-montado
// acima (mesma pegadinha resolvida em js/pages/agenda.js com inicialização
// preguiçosa) — completa os campos de data agora que data.js já rodou.
appFase6.M.UIState.agendaAno = appFase6.M.TODAY.getFullYear();
appFase6.M.UIState.agendaMes = appFase6.M.TODAY.getMonth();
appFase6.M.UIState.agendaDia = appFase6.M.todayISO();
appFase6.M.UIState.agendaSemanaInicio = appFase6.M.Agenda.segundaFeiraDe(appFase6.M.todayISO());

function comoUsuarioFase6(nome, fn){
  const original = appFase6.M.Store.state.usuarioAtual;
  appFase6.M.Store.setUsuarioAtual(nome);
  try{ return fn(); } finally { appFase6.M.Store.setUsuarioAtual(original); }
}
let _fx6Seq = 0;
function obraFixture6(over){
  _fx6Seq++;
  return Object.assign({
    id:"fx6-obra-"+_fx6Seq, numeroOS:"OS FIXTURE6/"+_fx6Seq, cliente:"Cliente Fixture 6 #"+_fx6Seq,
    endereco:"Rua Fixture 6, "+_fx6Seq, telefone:"(11) 90000-00"+String(_fx6Seq).padStart(2,"0"),
    dataOS:appFase6.M.todayISO(), criadaEm:appFase6.M.todayISO(),
    dataEntregaPrevista:appFase6.M.dOff(30), dataEntregaReal:null,
    valorBruto:1000, valorLiquido:1000, status:"EM_PRODUCAO", responsavel:"Teste",
    ambientes:[],
  }, over);
}
// perfis reais do seed: Paulo Henrique (ADMIN — agenda.criar/editar=true),
// Beatriz Nogueira (PCP — agenda.criar/editar=true), Roberto Diniz
// (MONTADOR — agenda.ver=true, criar/editar=false), Willian Souza
// (OPERADOR/Produção — agenda.ver=false, o perfil que NÃO deveria ganhar
// Agenda nesta fase, §22).
const ADMIN6="Paulo Henrique", PCP6="Beatriz Nogueira", MONTADOR6="Roberto Diniz", PRODUCAO6="Willian Souza";

// ---- 1) criação de evento manual — só os 4 tipos manuais; tipo/data
// obrigatórios; guarda origem/status/auditoria default corretos ----
{
  const antes = appFase6.M.Store.state.eventos.length;
  const semTipo = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({data: appFase6.M.todayISO()}));
  assert.equal(semTipo.ok, false); assert.equal(semTipo.motivo, "DADOS_OBRIGATORIOS");
  const semData = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA"}));
  assert.equal(semData.ok, false); assert.equal(semData.motivo, "DADOS_OBRIGATORIOS");

  const montagemRecusada = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"MONTAGEM", data:appFase6.M.todayISO()}));
  assert.equal(montagemRecusada.ok, false, "MONTAGEM nunca pode virar registro manual — só é derivado do planejamento");
  assert.equal(montagemRecusada.motivo, "TIPO_NAO_MANUAL");
  const assistRecusada = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"ASSISTENCIA", data:appFase6.M.todayISO()}));
  assert.equal(assistRecusada.ok, false, "ASSISTENCIA nunca pode virar registro manual — só é derivado de state.assistencias");
  assert.equal(assistRecusada.motivo, "TIPO_NAO_MANUAL");
  assert.equal(appFase6.M.Store.state.eventos.length, antes, "nenhuma das tentativas recusadas pode ter empurrado item em state.eventos");

  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  const r = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({
    tipo:"VISITA", titulo:"Visita técnica", obraId:o.id, data:appFase6.M.todayISO(),
    horaInicio:"09:00", horaFim:"10:00", equipe:"Roberto Diniz", observacao:"teste",
  }));
  assert.equal(r.ok, true);
  assert.equal(appFase6.M.Store.state.eventos.length, antes+1);
  assert.equal(r.evento.origem, "MANUAL");
  assert.equal(r.evento.status, "AGENDADO");
  assert.equal(r.evento.obraNome, o.cliente, "obraNome precisa ser denormalizado da obra selecionada");
  assert.equal(r.evento.criadoPor, ADMIN6);
  assert.ok(r.evento.id && r.evento.criadoEm);
  const hist = appFase6.M.Store.state.historico.find(h=>h.tipo==="AGENDA_EVENTO_CRIADO" && h.eventoId===r.evento.id);
  assert.ok(hist, "§23 — criação de evento manual precisa deixar rastro no histórico central, sem sistema de auditoria paralelo");
}

// ---- 4) permissão agenda.criar — Produção (agenda.ver=false) e Montador
// (agenda.criar=false) não podem criar; PCP (agenda.criar=true) pode ----
{
  const antes = appFase6.M.Store.state.eventos.length;
  const negadoProducao = comoUsuarioFase6(PRODUCAO6, ()=> appFase6.M.Store.criarEvento({tipo:"OUTRO", data:appFase6.M.todayISO()}));
  assert.equal(negadoProducao.ok, false); assert.equal(negadoProducao.motivo, "SEM_PERMISSAO");
  const negadoMontador = comoUsuarioFase6(MONTADOR6, ()=> appFase6.M.Store.criarEvento({tipo:"OUTRO", data:appFase6.M.todayISO()}));
  assert.equal(negadoMontador.ok, false); assert.equal(negadoMontador.motivo, "SEM_PERMISSAO");
  assert.equal(appFase6.M.Store.state.eventos.length, antes, "§26 — evento sem permissão não pode alterar state");

  const okPcp = comoUsuarioFase6(PCP6, ()=> appFase6.M.Store.criarEvento({tipo:"MEDICAO", data:appFase6.M.todayISO()}));
  assert.equal(okPcp.ok, true, "PCP tem agenda.criar=true na matriz — precisa conseguir criar");
}

// ---- 2/5/6) edição de evento manual — agenda.editar; evento derivado
// nunca é editável (mesmo se, hipoteticamente, aparecesse em state.eventos);
// tentativa negada não altera nada ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  const criado = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"OUTRO", titulo:"Original", data:appFase6.M.todayISO(), equipe:"Fernanda Costa"})).evento;

  const negado = comoUsuarioFase6(MONTADOR6, ()=> appFase6.M.Store.atualizarEvento(criado.id, {titulo:"Hackeado"}));
  assert.equal(negado.ok, false); assert.equal(negado.motivo, "SEM_PERMISSAO");
  assert.equal(criado.titulo, "Original", "tentativa sem agenda.editar não pode ter mudado o título");

  const ok = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.atualizarEvento(criado.id, {titulo:"Editado", obraId:o.id}));
  assert.equal(ok.ok, true);
  assert.equal(criado.titulo, "Editado");
  assert.equal(criado.obraNome, o.cliente, "trocar obraId precisa redenormalizar obraNome");
  assert.ok(criado.atualizadoEm && criado.atualizadoPor===ADMIN6);
  const histEdit = appFase6.M.Store.state.historico.find(h=>h.tipo==="AGENDA_EVENTO_EDITADO" && h.eventoId===criado.id);
  assert.ok(histEdit, "edição precisa deixar rastro no histórico");

  // defesa em profundidade: se um objeto de origem MONTAGEM/ASSISTENCIA
  // aparecesse em state.eventos (nunca deveria — Store.criarEvento recusa),
  // atualizarEvento ainda assim tem que recusar editar, §15.
  const fakeDerivado = {id:"evt-fake-derivado", tipo:"MONTAGEM", origem:"MONTAGEM", titulo:"Não deveria editar", status:"AGENDADO"};
  appFase6.M.Store.state.eventos.push(fakeDerivado);
  const negadoOrigem = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.atualizarEvento("evt-fake-derivado", {titulo:"Tentativa"}));
  assert.equal(negadoOrigem.ok, false); assert.equal(negadoOrigem.motivo, "ORIGEM_NAO_EDITAVEL");
  assert.equal(fakeDerivado.titulo, "Não deveria editar");
  appFase6.M.Store.state.eventos.pop(); // limpa o fixture defensivo
}

// ---- 3) cancelamento — muda status, mantém rastro; evento derivado
// (mesma defesa acima) também não pode ser cancelado direto ----
{
  const criado = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"RETORNO", titulo:"A cancelar", data:appFase6.M.todayISO()})).evento;
  const negado = comoUsuarioFase6(MONTADOR6, ()=> appFase6.M.Store.cancelarEvento(criado.id));
  assert.equal(negado.ok, false); assert.equal(negado.motivo, "SEM_PERMISSAO");
  assert.equal(criado.status, "AGENDADO");

  const ok = comoUsuarioFase6(PCP6, ()=> appFase6.M.Store.cancelarEvento(criado.id));
  assert.equal(ok.ok, true);
  assert.equal(criado.status, "CANCELADO");
  const histCancel = appFase6.M.Store.state.historico.find(h=>h.tipo==="AGENDA_EVENTO_CANCELADO" && h.eventoId===criado.id);
  assert.ok(histCancel, "cancelamento precisa deixar rastro no histórico");
  // cancelado nunca aparece em proximosEventos (não é mais compromisso ativo)
  assert.ok(!appFase6.M.Agenda.proximosEventos(365).some(e=>e.id===criado.id), "evento cancelado não pode aparecer em proximosEventos");
}

// ---- 7/8/9) evento de MONTAGEM deriva do planejamento, ao vivo, sem
// duplicar fonte — nunca é gravado em state.eventos ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  assert.equal(appFase6.M.Agenda.eventoMontagemDeObra(o), null, "obra sem planejamento não gera compromisso nenhum (nada inventado)");

  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: appFase6.M.dOff(5), duracaoEstimadaValor:10, duracaoEstimadaUnidade:"dias_uteis",
    equipePlanejada:"Roberto Diniz, Fernanda Costa", observacoes:"planejamento de teste",
  }));
  const evtMont = appFase6.M.Agenda.eventoMontagemDeObra(o);
  assert.ok(evtMont, "com planejamento.inicioPrevisto definido, o compromisso de Montagem precisa existir");
  assert.equal(evtMont.tipo, "MONTAGEM");
  assert.equal(evtMont.origem, "MONTAGEM");
  assert.equal(evtMont.data, o.planejamentoMontagem.inicioPrevisto, "data do compromisso é a MESMA data de obra.planejamentoMontagem.inicioPrevisto — fonte única");
  assert.equal(evtMont.equipe, "Roberto Diniz, Fernanda Costa");
  assert.ok(!appFase6.M.Store.state.eventos.some(e=>e.origemRefId===o.id || e.obraId===o.id), "§13/§2 — Montagem NUNCA vira registro próprio em state.eventos, mesmo depois de ter planejamento");

  // §13 — "se o planejamento mudar, a Agenda reflete sem edição duplicada"
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {inicioPrevisto: appFase6.M.dOff(9)}));
  const evtMontAtualizado = appFase6.M.Agenda.eventoMontagemDeObra(o);
  assert.equal(evtMontAtualizado.data, appFase6.M.dOff(9), "mudar o planejamento na Montagem reflete na próxima leitura da Agenda, sem tocar em nenhum evento");

  assert.ok(appFase6.M.Agenda.todosEventosRaw(["MONTAGEM"]).some(e=>e.obraId===o.id && e.data===appFase6.M.dOff(9)), "todosEventosRaw precisa incluir o compromisso de Montagem derivado");
}

// ---- assistência deriva de state.assistencias (mesma regra do Calendário
// legado: não concluída + prazo definido), nunca duplicada ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  const assist = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarAssistencia({
    obraId:o.id, obraNome:o.cliente, descricao:"teste assistência agenda", categoria:"Porta",
    responsavel:"Fernanda Costa", prazo: appFase6.M.dOff(3), prioridade:"MEDIA",
  })).assistencia;
  const evtAsst = appFase6.M.Agenda.eventoDeAssistencia(assist);
  assert.ok(evtAsst, "assistência não concluída com prazo precisa gerar compromisso na Agenda");
  assert.equal(evtAsst.origem, "ASSISTENCIA");
  assert.equal(evtAsst.data, assist.prazo);
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.atualizarAssistencia(assist.id, {status:"CONCLUIDA"}));
  assert.equal(appFase6.M.Agenda.eventoDeAssistencia(assist), null, "assistência concluída não é mais compromisso ativo na Agenda");
}

// ---- 10/11) conflito simples por sobreposição — mesma pessoa, mesmo dia,
// horário sobreposto; NUNCA bloqueia o salvamento ----
{
  const dia = appFase6.M.dOff(20);
  const e1 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA", titulo:"Visita A", data:dia, horaInicio:"09:00", horaFim:"10:00", equipe:"Carlos Nunes"})).evento;
  const e2 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"MEDICAO", titulo:"Medição B", data:dia, horaInicio:"09:30", horaFim:"10:30", equipe:"Carlos Nunes"}));
  assert.equal(e2.ok, true, "criar um evento em conflito precisa continuar permitido — conflito é alerta, nunca bloqueio (§12)");
  const conflitos = appFase6.M.Calc.conflitosAgenda([e1, e2.evento]);
  assert.equal(conflitos.length, 1);
  assert.equal(conflitos[0].pessoa, "Carlos Nunes");
  const ids = appFase6.M.Calc.idsEmConflitoAgenda([e1, e2.evento]);
  assert.ok(ids.has(e1.id) && ids.has(e2.evento.id));

  // pessoas diferentes, mesmo horário — sem conflito
  const e3 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA", titulo:"Visita C", data:dia, horaInicio:"09:00", horaFim:"10:00", equipe:"Ana Ferreira"})).evento;
  assert.equal(appFase6.M.Calc.conflitosAgenda([e1, e3]).length, 0, "mesmo horário/dia, pessoas diferentes — sem conflito");

  // mesma pessoa, mesmo dia, horários que não se sobrepõem — sem conflito
  const e4 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA", titulo:"Visita D", data:dia, horaInicio:"11:00", horaFim:"12:00", equipe:"Carlos Nunes"})).evento;
  assert.equal(appFase6.M.Calc.conflitosAgenda([e1, e4]).length, 0, "mesma pessoa, mesmo dia, sem sobreposição de horário — sem conflito");

  // evento cancelado nunca conta como conflito
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.cancelarEvento(e2.evento.id));
  assert.equal(appFase6.M.Calc.conflitosAgenda([e1, e2.evento]).length, 0, "evento cancelado não gera conflito");
}

// ---- 12) filtros Tipo/Equipe/Obra/Status ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  const a = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA", data:appFase6.M.todayISO(), equipe:"Marcos Lima", obraId:o.id})).evento;
  const b = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"MEDICAO", data:appFase6.M.todayISO(), equipe:"Pedro Rocha"})).evento;
  const lista = [a,b];
  assert.deepEqual(appFase6.M.Agenda.aplicarFiltrosUI(lista, {tipo:"VISITA"}).map(e=>e.id), [a.id]);
  assert.deepEqual(appFase6.M.Agenda.aplicarFiltrosUI(lista, {equipe:"marcos"}).map(e=>e.id), [a.id], "filtro de equipe é case-insensitive, substring");
  assert.deepEqual(appFase6.M.Agenda.aplicarFiltrosUI(lista, {obraId:o.id}).map(e=>e.id), [a.id]);
  assert.deepEqual(appFase6.M.Agenda.aplicarFiltrosUI(lista, {status:"AGENDADO"}).map(e=>e.id).sort(), [a.id,b.id].sort());
  assert.deepEqual(appFase6.M.Agenda.aplicarFiltrosUI(lista, {status:"CANCELADO"}), []);
}

// ---- 13) escopo de Montador — só vê compromisso da própria obra/equipe
// (§22), nunca de obra alheia sem vínculo ----
{
  const obraDoMontador = obraFixture6();
  const obraAlheia = obraFixture6();
  appFase6.M.Store.state.obras.push(obraDoMontador, obraAlheia);
  // vínculo real via tarefa (mesmo mecanismo de obraIdsDoColaborador que o
  // resto do app já usa — nenhum vínculo novo inventado aqui)
  appFase6.M.Store.state.tarefas.push({id:"fx6-tsk-1", obraId:obraDoMontador.id, titulo:"Tarefa", status:"PLANEJADA", responsavelPlanejado:MONTADOR6});

  const evtObraDoMontador = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"OUTRO", data:appFase6.M.todayISO(), obraId:obraDoMontador.id})).evento;
  const evtObraAlheia = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"OUTRO", data:appFase6.M.todayISO(), obraId:obraAlheia.id})).evento;
  const evtAvulsoComEquipe = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"OUTRO", data:appFase6.M.todayISO(), equipe:MONTADOR6})).evento;
  const evtAvulsoSemVinculo = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"OUTRO", data:appFase6.M.todayISO(), equipe:"Pedro Rocha"})).evento;

  const visiveis = comoUsuarioFase6(MONTADOR6, ()=> appFase6.M.Agenda.todosEventosRaw());
  const idsVisiveis = visiveis.map(e=>e.id);
  assert.ok(idsVisiveis.includes(evtObraDoMontador.id), "Montador precisa ver compromisso da obra onde tem tarefa atribuída");
  assert.ok(idsVisiveis.includes(evtAvulsoComEquipe.id), "Montador precisa ver compromisso avulso onde seu nome está na equipe");
  assert.ok(!idsVisiveis.includes(evtObraAlheia.id), "Montador NÃO pode ver compromisso de obra sem nenhum vínculo — §22 não amplia acesso");
  assert.ok(!idsVisiveis.includes(evtAvulsoSemVinculo.id), "Montador NÃO pode ver compromisso avulso de outra pessoa sem vínculo");

  // Admin (verTodasObras) continua vendo tudo — escopo restrito é só pra
  // quem NÃO tem verTodasObras, ninguém perdeu visão que já tinha.
  const visiveisAdmin = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Agenda.todosEventosRaw()).map(e=>e.id);
  assert.ok(visiveisAdmin.includes(evtObraAlheia.id) && visiveisAdmin.includes(evtAvulsoSemVinculo.id));
}

// ---- 14) escopo de Assistência — só vê atendimento/compromisso do próprio
// contexto, mesmo raciocínio de escopo do Montador acima (§22) ----
{
  // reatribui um colaborador OPERADOR existente pro perfil ASSISTENCIA por
  // um instante — mesmo truque já usado nas fases anteriores pra testar um
  // perfil sem colaborador dedicado no seed.
  const alvo = appFase6.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
  const perfilOriginal = alvo.perfil;
  alvo.perfil = "ASSISTENCIA";
  try{
    const obraPropria = obraFixture6(), obraAlheia = obraFixture6();
    appFase6.M.Store.state.obras.push(obraPropria, obraAlheia);
    appFase6.M.Store.state.assistencias.push({id:"fx6-asst-propria", obraId:obraPropria.id, obraNome:obraPropria.cliente,
      status:"ABERTA", descricao:"minha", categoria:"Porta", responsavel:"Ana Ferreira", prazo: appFase6.M.dOff(2), garantia:"EM_ANALISE", visitas:[]});
    appFase6.M.Store.state.assistencias.push({id:"fx6-asst-alheia", obraId:obraAlheia.id, obraNome:obraAlheia.cliente,
      status:"ABERTA", descricao:"de outra pessoa", categoria:"Porta", responsavel:"Fernanda Costa", prazo: appFase6.M.dOff(2), garantia:"EM_ANALISE", visitas:[]});

    const visiveis = comoUsuarioFase6("Ana Ferreira", ()=> appFase6.M.Agenda.todosEventosRaw(["ASSISTENCIA"])).map(e=>e.origemRefId);
    assert.ok(visiveis.includes("fx6-asst-propria"), "Assistência vê o próprio atendimento");
    assert.ok(!visiveis.includes("fx6-asst-alheia"), "Assistência NÃO vê atendimento de outra pessoa sem vínculo — §22");
  } finally { alvo.perfil = perfilOriginal; }
}

// ---- smoke: a página Agenda renderiza sem lançar, nas 4 views desktop,
// pro Admin (mesmo padrão da Fase 5 com Montagem) ----
{
  comoUsuarioFase6(ADMIN6, ()=>{
    ["MES","SEMANA","DIA","EQUIPES"].forEach(v=>{
      appFase6.M.UIState.agendaView = v;
      const resultado = appFase6.M.Pages.agenda();
      assert.ok(resultado && typeof resultado.html === "string" && resultado.html.length>0, `M.Pages.agenda() renderiza HTML sem lançar exceção na view ${v}`);
    });
    appFase6.M.UIState.agendaView = "SEMANA";
    const form = appFase6.M.Pages.eventoFormHtml(null);
    assert.ok(typeof form === "string" && form.length>0, "M.Pages.eventoFormHtml() renderiza sem lançar");
  });
}

// ==================================================================
// FASE 6 — AJUSTES ANTES DO PUSH. Cobre os 3 pontos operacionais pedidos:
// (1) Montagem precisa ocupar o período previsto inteiro (ocorrências
//     virtuais por dia, nunca persistidas); (2) conflito precisa considerar
//     essa ocupação derivada; (3) comparação de pessoa no conflito não pode
//     ser substring ingênua.
// ==================================================================

// ---- A) montagem multidia — ocorre em TODOS os dias do período, nunca só
// no primeiro; alteração do planejamento muda o intervalo imediatamente;
// nenhuma ocorrência derivada entra em state.eventos ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  const inicio = appFase6.M.dOff(30); // período de 5 dias
  // dias_corridos aqui de propósito: este bloco testa a MECÂNICA da
  // expansão multidia (contagem, ids, período, não-persistência) — a
  // semântica de dias_uteis/semanas pulando fim de semana tem seção própria
  // logo abaixo, com dias fixos (segunda a segunda) pra não depender de em
  // qual dia da semana cai "hoje" no momento em que o teste roda.
  // AJUSTE (verificação final de integração): duracaoEstimadaValor agora
  // controla a contagem DIRETO (fluxo real) — nada de forçar
  // fimPrevistoCalculado à mão; esse campo não é mais usado pra decidir
  // quantos dias a Montagem ocupa (ver comentário em ocorrenciasDeEventoBase).
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: inicio, duracaoEstimadaValor:5, duracaoEstimadaUnidade:"dias_corridos",
    equipePlanejada:"Roberto Diniz",
  }));

  const base = appFase6.M.Agenda.eventoMontagemDeObra(o);
  assert.equal(base.data, inicio); assert.equal(base.duracaoEstimadaValor, 5);

  const ocorrencias = appFase6.M.Agenda.ocorrenciasDeEventoBase(base);
  assert.equal(ocorrencias.length, 5, "duracaoEstimadaValor:5 dias_corridos — exatamente 5 ocorrências, uma por dia");
  const diasEsperados = [0,1,2,3,4].map(n=>appFase6.M.dOff(30+n));
  // Array.from (não .map direto): `ocorrencias` é um array construído
  // dentro do contexto vm da fixture — .map nele herdaria o Array daquele
  // realm, e assert/strict compara identidade de protótipo, não só
  // conteúdo. Array.from aqui roda no realm do teste (host), produzindo um
  // array comparável de verdade — não é diferença de comportamento real do
  // app, só um detalhe do harness de teste isolado em vm.
  assert.deepEqual(Array.from(ocorrencias, oc=>oc.data), diasEsperados, "montagem precisa aparecer em TODOS os dias do período, não só no primeiro");
  ocorrencias.forEach(oc=>{
    assert.equal(oc.periodoInicio, inicio); assert.equal(oc.periodoFim, diasEsperados[4]);
    assert.equal(oc.origemRefId, o.id); assert.equal(oc.origem, "MONTAGEM");
  });
  // ids determinísticos e distintos por dia (nunca M.uid) — mantém seleção
  // estável no drawer entre renders.
  assert.equal(new Set(ocorrencias.map(oc=>oc.id)).size, 5);

  // todosEventosRaw precisa refletir isso pra QUALQUER dia do meio do
  // período, não só o início — é o que a view Dia/Semana/Equipes/mobile
  // consultam.
  const diaIntermediario = appFase6.M.dOff(32);
  assert.ok(appFase6.M.Agenda.eventosDoDia(diaIntermediario, ["MONTAGEM"]).some(e=>e.obraId===o.id),
    "view Dia num dia INTERMEDIÁRIO do período precisa mostrar a montagem");
  const diaAntesDoInicio = appFase6.M.dOff(29), diaDepoisDoFim = appFase6.M.dOff(35);
  assert.ok(!appFase6.M.Agenda.eventosDoDia(diaAntesDoInicio, ["MONTAGEM"]).some(e=>e.obraId===o.id),
    "view Dia FORA do período (antes) não pode mostrar a montagem");
  assert.ok(!appFase6.M.Agenda.eventosDoDia(diaDepoisDoFim, ["MONTAGEM"]).some(e=>e.obraId===o.id),
    "view Dia FORA do período (depois) não pode mostrar a montagem");

  // nenhuma ocorrência derivada é gravada — state.eventos continua só com o
  // que foi criado manualmente (nenhuma entrada com origemRefId===o.id).
  assert.ok(!appFase6.M.Store.state.eventos.some(e=>e.origemRefId===o.id),
    "§1 — nenhuma ocorrência derivada do período pode ser gravada em state.eventos");

  // alterar o planejamento muda o intervalo imediatamente, sem edição
  // duplicada — mesmo princípio do §13 original, agora valendo pro período
  // inteiro.
  const novoInicio = appFase6.M.dOff(40);
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {inicioPrevisto: novoInicio, duracaoEstimadaValor:2, duracaoEstimadaUnidade:"dias_corridos"}));
  const baseAtualizada = appFase6.M.Agenda.eventoMontagemDeObra(o);
  const ocorrenciasAtualizadas = appFase6.M.Agenda.ocorrenciasDeEventoBase(baseAtualizada);
  assert.equal(ocorrenciasAtualizadas.length, 2);
  assert.deepEqual(Array.from(ocorrenciasAtualizadas, oc=>oc.data), [novoInicio, appFase6.M.dOff(41)]);
  assert.ok(!appFase6.M.Agenda.eventosDoDia(diaIntermediario, ["MONTAGEM"]).some(e=>e.obraId===o.id),
    "período antigo precisa sumir assim que o planejamento muda — sem ocorrência fantasma");
}

// ---- B) "próximos compromissos" (Hoje) não duplica uma linha por dia de
// montagem multidia — mostra o compromisso UMA vez ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: appFase6.M.todayISO(), duracaoEstimadaValor:5, duracaoEstimadaUnidade:"dias_uteis",
    equipePlanejada:"Fernanda Costa",
  }));
  const proximos = appFase6.M.Agenda.proximosEventos(7, ["MONTAGEM"]).filter(e=>e.obraId===o.id);
  assert.equal(proximos.length, 1, "montagem de 5 dias dentro da janela de 7 dias precisa aparecer só 1 vez em proximosEventos, não 5");
}

// ---- C) conflito considera a ocupação derivada do período — montagem
// multidia × evento manual no meio do período, mesma pessoa ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  const inicio = appFase6.M.dOff(50);
  // dias_corridos aqui de propósito, pelo mesmo motivo do bloco A: este
  // teste é sobre a MECÂNICA de conflito num período multidia — não deve
  // depender de em que dia da semana "hoje" cai quando a suíte roda. A
  // distinção dias_uteis × dias_corridos no conflito tem teste dedicado
  // logo abaixo, com datas fixas (segunda a segunda), não relativas a hoje.
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: inicio, duracaoEstimadaValor:5, duracaoEstimadaUnidade:"dias_corridos",
    equipePlanejada:"Roberto Diniz",
  }));

  const diaDoMeio = appFase6.M.dOff(52); // dentro do período 50-54
  const visita = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({
    tipo:"VISITA", titulo:"Visita no meio da montagem", data:diaDoMeio, horaInicio:"14:00", horaFim:"15:00", equipe:"Roberto Diniz",
  })).evento;

  const todos = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Agenda.todosEventosRaw());
  const idsConflito = appFase6.M.Calc.idsEmConflitoAgenda(todos);
  assert.ok(idsConflito.has(visita.id), "visita no meio do período da montagem, mesma pessoa, precisa ser detectada em conflito (§3)");
  const ocorrenciaDoDia = todos.find(e=>e.tipo==="MONTAGEM" && e.obraId===o.id && e.data===diaDoMeio);
  assert.ok(ocorrenciaDoDia, "a ocorrência da montagem no dia do meio precisa existir na lista");
  assert.ok(idsConflito.has(ocorrenciaDoDia.id), "a ocorrência específica daquele dia precisa estar marcada em conflito");

  // não bloqueia — criarEvento já retornou ok:true acima; confirma de novo
  // explicitamente por clareza do teste.
  assert.ok(!!visita.id, "criar o evento em conflito com a montagem continua permitido — conflito nunca bloqueia salvamento (§3)");
}

// ---- D) conflito não usa substring ingênua — "Ana" ≠ "Mariana", "João" ≠
// "João Pedro" (colaboradores distintos), e normaliza espaço/caixa (§5) ----
{
  const dia = appFase6.M.dOff(60);
  const ana = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA", data:dia, horaInicio:"09:00", horaFim:"10:00", equipe:"Ana"})).evento;
  const mariana = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"MEDICAO", data:dia, horaInicio:"09:00", horaFim:"10:00", equipe:"Mariana"})).evento;
  assert.equal(appFase6.M.Calc.conflitosAgenda([ana, mariana]).length, 0, "'Ana' e 'Mariana' são pessoas diferentes — substring não pode gerar falso conflito");

  const joao = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA", data:dia, horaInicio:"11:00", horaFim:"12:00", equipe:"João"})).evento;
  const joaoPedro = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"MEDICAO", data:dia, horaInicio:"11:00", horaFim:"12:00", equipe:"João Pedro"})).evento;
  assert.equal(appFase6.M.Calc.conflitosAgenda([joao, joaoPedro]).length, 0, "'João' e 'João Pedro' são colaboradores distintos — não podem conflitar por substring");

  // mesmo colaborador, digitado com caixa/espaçamento diferente — PRECISA
  // conflitar (normalização de espaço/caixa).
  const c1 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA", data:dia, horaInicio:"13:00", horaFim:"14:00", equipe:"Carlos Nunes"})).evento;
  const c2 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"MEDICAO", data:dia, horaInicio:"13:30", horaFim:"14:30", equipe:"  carlos   nunes"})).evento;
  const confNorm = appFase6.M.Calc.conflitosAgenda([c1, c2]);
  assert.equal(confNorm.length, 1, "mesmo colaborador, digitado com espaço/caixa diferente, precisa conflitar (mesma pessoa de verdade)");

  // mesmo colaborador, mesmo dia, horários que não se sobrepõem — sem
  // conflito (recobre o cenário já existente, agora com a nova comparação).
  const c3 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"VISITA", data:dia, horaInicio:"15:00", horaFim:"16:00", equipe:"Carlos Nunes"})).evento;
  assert.equal(appFase6.M.Calc.conflitosAgenda([c1, c3]).length, 0, "mesma pessoa, mesmo dia, sem sobreposição — sem conflito");

  // CANCELADO continua ignorado (recobre de novo, com fixtures desta seção).
  const c4 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({tipo:"OUTRO", data:dia, horaInicio:"13:00", horaFim:"14:00", equipe:"Carlos Nunes"})).evento;
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.cancelarEvento(c4.id));
  assert.equal(appFase6.M.Calc.conflitosAgenda([c1, c4]).length, 0, "evento cancelado continua fora do cálculo de conflito, mesmo com pessoa/horário batendo");
}

// ---- E) Semana agrupa/identifica claramente a equipe; mobile Hoje/Amanhã/
// Semana respeita o período (smoke via M.Agenda, sem depender de HTML) ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  // dias_corridos aqui de propósito — este teste verifica que hoje/amanhã/
  // semana ENXERGAM o período (mecânica de leitura), não a regra de dia
  // útil em si (que tem teste dedicado com datas fixas, abaixo); com
  // dias_uteis este teste ficaria dependente de em que dia da semana "hoje"
  // cai quando a suíte roda.
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: appFase6.M.todayISO(), duracaoEstimadaValor:5, duracaoEstimadaUnidade:"dias_corridos",
    equipePlanejada:"Roberto Diniz",
  })); // 5 dias corridos a partir de hoje — cobre hoje, amanhã e a janela de 7 dias com folga

  const amanha = appFase6.M.dOff(1);
  assert.ok(appFase6.M.Agenda.eventosDoDia(appFase6.M.todayISO(), ["MONTAGEM"]).some(e=>e.obraId===o.id), "mobile Hoje — período cobre hoje");
  assert.ok(appFase6.M.Agenda.eventosDoDia(amanha, ["MONTAGEM"]).some(e=>e.obraId===o.id), "mobile Amanhã — período cobre amanhã");
  assert.ok(appFase6.M.Agenda.eventosDoPeriodo(appFase6.M.todayISO(), appFase6.M.dOff(6), ["MONTAGEM"]).some(e=>e.obraId===o.id), "mobile Semana — período aparece na janela de 7 dias");

  // render real da view Semana não lança e o HTML carrega o nome da equipe
  // como cabeçalho de grupo (eixo visível, não só texto perdido no card).
  comoUsuarioFase6(ADMIN6, ()=>{
    appFase6.M.UIState.agendaView = "SEMANA";
    appFase6.M.UIState.agendaSemanaInicio = appFase6.M.Agenda.segundaFeiraDe(appFase6.M.todayISO());
    const resultado = appFase6.M.Pages.agenda();
    assert.ok(resultado.html.includes("Roberto Diniz"), "Semana precisa mostrar o nome da equipe como eixo, não só escondido no card");
  });
}

console.log("Fase 6 — ajustes antes do push (multidia/conflito/substring): OK");

// ==================================================================
// FASE 6 — ÚLTIMO AJUSTE ANTES DO PUSH. A unidade do planejamento
// (dias_uteis/semanas/dias_corridos) precisa decidir quais dias do período
// viram ocupação REAL na Agenda — dias_uteis/semanas pulam sábado/domingo
// (não geram ocorrência ali, nem visual nem de conflito); dias_corridos
// inclui todos os dias. Datas FIXAS (não M.dOff) de propósito: são testes
// de dia-da-semana, não podem depender de em que dia da semana "hoje" cai
// no momento em que a suíte roda. 2030-01-07 é uma segunda-feira fixa,
// usada como âncora (2030 só pra ficar bem longe de qualquer data real do
// resto dos testes/fixtures).
// ==================================================================
const SEG = "2030-01-07", TER="2030-01-08", QUA="2030-01-09", QUI="2030-01-10",
  SEX="2030-01-11", SAB="2030-01-12", DOM="2030-01-13", SEG_SEGUINTE="2030-01-14",
  TER_SEGUINTE="2030-01-15";

// ---- F) dias_uteis segunda→sexta = 5 ocorrências ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: SEG, duracaoEstimadaValor:5, duracaoEstimadaUnidade:"dias_uteis", equipePlanejada:"Roberto Diniz",
  }));
  const base = appFase6.M.Agenda.eventoMontagemDeObra(o);
  assert.equal(base.unidadeDuracao, "dias_uteis");
  const ocorrencias = appFase6.M.Agenda.ocorrenciasDeEventoBase(base);
  assert.equal(ocorrencias.length, 5, "segunda a sexta, dias_uteis — 5 ocorrências, uma por dia útil");
  assert.deepEqual(Array.from(ocorrencias, oc=>oc.data), [SEG,TER,QUA,QUI,SEX]);
}

// ---- G) dias_uteis atravessando fim de semana não gera sábado/domingo ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: QUA, duracaoEstimadaValor:5, duracaoEstimadaUnidade:"dias_uteis", equipePlanejada:"Roberto Diniz",
  })); // quarta (09) + 5 dias úteis — atravessa o fim de semana 12/13 no meio da contagem
  const base = appFase6.M.Agenda.eventoMontagemDeObra(o);
  const dias = Array.from(appFase6.M.Agenda.ocorrenciasDeEventoBase(base), oc=>oc.data);
  assert.deepEqual(dias, [QUA,QUI,SEX,SEG_SEGUINTE,TER_SEGUINTE], "atravessa o fim de semana — sábado/domingo não podem gerar ocorrência");
  assert.ok(!dias.includes(SAB) && !dias.includes(DOM));
}

// ---- H) semanas não gera ocupação de fim de semana ("semana" é tratada
// como período operacional de dias úteis, não fim de semana automático —
// mesma regra de dias_uteis) ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: SEG, duracaoEstimadaValor:1, duracaoEstimadaUnidade:"semanas", equipePlanejada:"Roberto Diniz",
  }));
  const base = appFase6.M.Agenda.eventoMontagemDeObra(o);
  assert.equal(base.unidadeDuracao, "semanas");
  const dias = Array.from(appFase6.M.Agenda.ocorrenciasDeEventoBase(base), oc=>oc.data);
  assert.ok(!dias.includes(SAB) && !dias.includes(DOM), "semanas não pode gerar ocupação automática de sábado/domingo");
  // AJUSTE (verificação final de integração): "1 semana operacional" = 5
  // dias úteis (segunda a sexta), NÃO 6 — a versão anterior deste teste
  // esperava 6 dias (incluindo a segunda seguinte) porque a contagem vinha
  // de fimPrevistoCalculado (aproximação de calendário de +7 dias corridos,
  // Fase 5); agora a contagem vem direto de duracaoEstimadaValor×5 dias
  // úteis, sem essa distorção.
  assert.deepEqual(dias, [SEG,TER,QUA,QUI,SEX]);
}

// ---- I) dias_corridos gera sábado/domingo ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: SEG, duracaoEstimadaValor:7, duracaoEstimadaUnidade:"dias_corridos", equipePlanejada:"Roberto Diniz",
  }));
  const base = appFase6.M.Agenda.eventoMontagemDeObra(o);
  const dias = Array.from(appFase6.M.Agenda.ocorrenciasDeEventoBase(base), oc=>oc.data);
  assert.equal(dias.length, 7, "dias_corridos — todo dia do período, inclusive fim de semana");
  assert.ok(dias.includes(SAB) && dias.includes(DOM), "dias_corridos precisa incluir sábado e domingo");
}

// ---- J/K) conflito respeita a unidade — sábado só conflita se o
// planejamento for dias_corridos ----
{
  const oUteis = obraFixture6(), oCorridos = obraFixture6();
  appFase6.M.Store.state.obras.push(oUteis, oCorridos);

  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(oUteis.id, {
    inicioPrevisto: SEG, duracaoEstimadaValor:5, duracaoEstimadaUnidade:"dias_uteis", equipePlanejada:"Carlos Nunes",
  })); // 5 dias úteis a partir de segunda — ocupa exatamente segunda a sexta, não chega no sábado

  const visitaSabadoUteis = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({
    tipo:"VISITA", titulo:"Visita de sábado", data:SAB, equipe:"Carlos Nunes",
  })).evento;
  const todosUteis = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Agenda.todosEventosRaw());
  const idsConflitoUteis = appFase6.M.Calc.idsEmConflitoAgenda(todosUteis);
  assert.ok(!idsConflitoUteis.has(visitaSabadoUteis.id),
    "dias_uteis — sábado não é dia operacional do período; visita de sábado NÃO pode conflitar com a montagem");

  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(oCorridos.id, {
    inicioPrevisto: SEG, duracaoEstimadaValor:7, duracaoEstimadaUnidade:"dias_corridos", equipePlanejada:"Fernanda Costa",
  })); // 7 dias corridos a partir de segunda — inclui o sábado

  const visitaSabadoCorridos = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarEvento({
    tipo:"VISITA", titulo:"Visita de sábado 2", data:SAB, equipe:"Fernanda Costa",
  })).evento;
  const todosCorridos = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Agenda.todosEventosRaw());
  const idsConflitoCorridos = appFase6.M.Calc.idsEmConflitoAgenda(todosCorridos);
  assert.ok(idsConflitoCorridos.has(visitaSabadoCorridos.id),
    "dias_corridos — sábado é dia operacional do período; visita de sábado precisa conflitar com a montagem");
}

// ---- L) alteração de planejamento continua refletindo imediatamente,
// inclusive quando a mudança é só de UNIDADE (mesmo período de calendário,
// dias_uteis → dias_corridos passa a incluir fim de semana na próxima
// leitura, sem edição duplicada) ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: SEG, duracaoEstimadaValor:7, duracaoEstimadaUnidade:"dias_uteis", equipePlanejada:"Roberto Diniz",
  }));
  const diasAntes = Array.from(appFase6.M.Agenda.ocorrenciasDeEventoBase(appFase6.M.Agenda.eventoMontagemDeObra(o)), oc=>oc.data);
  assert.ok(!diasAntes.includes(SAB), "antes da mudança (dias_uteis) — sábado não ocupa");

  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.setPlanejamentoMontagem(o.id, {
    inicioPrevisto: SEG, duracaoEstimadaValor:7, duracaoEstimadaUnidade:"dias_corridos", equipePlanejada:"Roberto Diniz",
  }));
  const diasDepois = Array.from(appFase6.M.Agenda.ocorrenciasDeEventoBase(appFase6.M.Agenda.eventoMontagemDeObra(o)), oc=>oc.data);
  assert.ok(diasDepois.includes(SAB), "depois da mudança pra dias_corridos, sem edição duplicada — sábado passa a ocupar imediatamente");

  assert.ok(!appFase6.M.Store.state.eventos.some(e=>e.origemRefId===o.id),
    "nenhuma ocorrência derivada — de nenhuma das duas leituras — foi gravada em state.eventos");
}

// ---- M) fallback explícito de unidade ausente (planejamento "legado") ----
{
  const o = obraFixture6();
  // sem duracaoEstimadaUnidade — simula dado antigo, sem passar por
  // Store.setPlanejamentoMontagem. duracaoEstimadaValor PRECISA estar
  // presente pro fixture ser realista: Store.calcularFimPrevisto só produz
  // fimPrevistoCalculado quando duracaoEstimadaValor existe (Fase 5), então
  // um planejamento "com fim calculado mas sem valor de duração" nunca
  // acontece de verdade — não é esse o cenário legado a simular.
  o.planejamentoMontagem = {inicioPrevisto: SEG, duracaoEstimadaValor:5, equipePlanejada:"Roberto Diniz"};
  appFase6.M.Store.state.obras.push(o);
  const base = appFase6.M.Agenda.eventoMontagemDeObra(o);
  assert.equal(base.unidadeDuracao, "dias_uteis", "§3 — planejamento sem unidade cai no MESMO fallback fixo que Store.setPlanejamentoMontagem já usa (dias_uteis), nunca inferido de outra coisa");
  const dias = Array.from(appFase6.M.Agenda.ocorrenciasDeEventoBase(base), oc=>oc.data);
  assert.deepEqual(dias, [SEG,TER,QUA,QUI,SEX]);
}

console.log("Fase 6 — último ajuste antes do push (unidade dias_uteis/semanas/dias_corridos): OK");

console.log("Fase 6 (Agenda V2): OK");

// ==================================================================
// HOTFIX 3.1 — persistSupabase() não pode chamar Supa.salvarEstado() com
// cliente nulo; precisa esperar M.Supa.ready; precisa coalescer gravações
// concorrentes (fila de tamanho 1 — só a mais recente sobrevive, nunca uma
// antiga sobrescrevendo uma nova); aplicarEstadoRemoto() precisa reaplicar
// migrarChecklistLegado() pra fechar o loop descrito em
// HOTFIX-3.1-CAUSA-E-ABORDAGEM.md (sem isso, checklist legado "renascia" a
// cada sincronização e nunca convergia). Estes testes envolvem o debounce
// real de 400ms de persistSupabase() — por isso rodam numa IIFE assíncrona,
// depois de toda a suíte síncrona acima (que não muda em nada).
// ==================================================================
function esperar(ms){ return new Promise(resolve=> setTimeout(resolve, ms)); }

// contexto "ajudante", só pra extrair um state de exemplo com o formato
// completo e válido (obras/ambientes/moveis/permissoes/etapas/fasesMacro/
// fluxosPadrao/etc.) direto da semente real — sem M.Supa nenhum, então
// sincronizarComSupabase() nem roda (guard `M.Supa && M.Supa.habilitado`
// já existente, intocado). Usado só pra montar o "remoto" do teste de
// aplicarEstadoRemoto() abaixo.
function estadoDeExemplo(){
  const appAjudante = contextoBase();
  executar(appAjudante, "js/data.js");
  appAjudante.M.UI = {}; appAjudante.M.Pages = {};
  executar(appAjudante, "js/store.js");
  return JSON.parse(JSON.stringify(appAjudante.M.Store.state));
}

// contexto de teste com M.Supa mockado e controlável: `ready` começa como
// uma promise pendente (deferida manualmente por resolverPronto/
// rejeitarPronto) — assim cada teste decide exatamente quando "o Supabase
// termina de inicializar", em vez de depender de timing real de rede.
// `semSincronizacaoNoBoot` (padrão true): boot roda com habilitado:false, só
// pra sincronizarComSupabase() (código já existente, intocado — inclusive o
// caminho "tabela vazia" que chama salvarEstado() direto pra semear a
// nuvem, e o próprio ".then(ok=>...)" sem tratamento de rejeição, que hoje
// nunca dispara na prática porque M.Supa.ready em produção sempre resolve,
// nunca rejeita) NÃO anexe nada em M.Supa.ready — assim cada teste consegue
// isolar só o comportamento de persistSupabase() (o que este hotfix mudou),
// sem competir com esse outro fluxo, que é assunto separado. Só depois do
// boot terminar, o habilitado de verdade é ligado. O teste que precisa da
// sincronização de verdade (aplicarEstadoRemoto/migração) passa
// `semSincronizacaoNoBoot:false` explicitamente.
function criarContextoHotfix(overrides){
  overrides = overrides || {};
  const semSincronizacaoNoBoot = overrides.semSincronizacaoNoBoot !== false;
  const app = contextoBase();
  executar(app, "js/data.js");
  app.M.UI = {}; app.M.Pages = {};

  const chamadasSalvar = [];
  const chamadasClienteNulo = [];
  let mudancaCb = null;
  let resolverInterno, rejeitarInterno;
  const prontoDeferido = new Promise((res, rej)=>{ resolverInterno = res; rejeitarInterno = rej; });

  const desejado = Object.assign({
    habilitado: true,
    client: null,
    ready: prontoDeferido,
    // "tabela vazia" (primeiro acesso) por padrão — comportamento já
    // existente, sem relação com o hotfix; o teste de aplicarEstadoRemoto
    // usa assinarMudancas (ver obterMudancaCb) pra simular sincronização
    // de verdade de forma controlada.
    carregarEstado: async ()=> null,
    salvarEstado: async (estado, atualizadoEmConhecido)=>{
      if(!app.M.Supa.client){
        // isto É o TypeError original ("Cannot read properties of null
        // (reading 'from')") — aqui só registramos em vez de lançar, pra o
        // teste poder AFIRMAR que isto nunca acontece, sem derrubar o
        // próprio test runner com uma unhandled rejection por baixo.
        chamadasClienteNulo.push({dados: JSON.parse(JSON.stringify(estado))});
        return {ok:false};
      }
      chamadasSalvar.push({dados: JSON.parse(JSON.stringify(estado)), atualizadoEmConhecido});
      return {ok:true, atualizadoEm:"2026-01-01T00:00:00.000Z"};
    },
    assinarMudancas: (cb)=>{ mudancaCb = cb; return ()=>{ mudancaCb = null; }; },
    listarColaboradores: async ()=> [],
    assinarMudancasColaboradores: ()=> ()=>{},
  }, overrides);
  delete desejado.semSincronizacaoNoBoot;

  app.M.Supa = semSincronizacaoNoBoot ? Object.assign({}, desejado, {habilitado:false}) : desejado;
  executar(app, "js/store.js");
  if(semSincronizacaoNoBoot) app.M.Supa.habilitado = desejado.habilitado;

  return {
    app, chamadasSalvar, chamadasClienteNulo,
    // comCliente=false simula Supabase indisponível (ready resolve false,
    // sem cliente); por padrão resolve true e cria um cliente fake.
    resolverPronto(comCliente){
      if(comCliente!==false) app.M.Supa.client = app.M.Supa.client || {};
      resolverInterno(comCliente!==false);
    },
    rejeitarPronto(erro){ rejeitarInterno(erro); },
    obterMudancaCb(){ return mudancaCb; },
  };
}

async function rodarTestesHotfix(){
  // ---- 1, 2, 3, 4: boot com Supabase ainda não pronto não lança; emit()
  // antes de pronto não lança; a mudança local não se perde (state em
  // memória + localStorage); assim que Supa.ready resolve, a gravação
  // pendente é feita (com o estado certo) ----
  {
    const ctx = criarContextoHotfix();
    // o próprio boot (migrarChecklistLegado + sincronizarComSupabase) já
    // rodou dentro de criarContextoHotfix, com M.Supa.ready ainda pendente
    // — isto sozinho já é o teste 1: carregar não lançou nada nem chamou
    // salvarEstado com cliente nulo.
    assert.equal(ctx.chamadasClienteNulo.length, 0, "boot com Supabase ainda não pronto não pode ter chamado salvarEstado com cliente nulo");

    assert.doesNotThrow(()=>{
      ctx.app.M.Store.setPermissao("OPERADOR", "obra.criar", true);
    }, "emit() disparado antes do Supabase ficar pronto não pode lançar");

    // teste 3: a mudança local não pode se perder — continua no state em
    // memória e já foi gravada no localStorage (persist() é síncrono, roda
    // sempre, independente do Supabase).
    assert.equal(ctx.app.M.Store.state.permissoes.OPERADOR["obra.criar"], true, "mudança local não pode se perder enquanto espera o Supabase ficar pronto");
    const localSalvo = JSON.parse(ctx.app.localStorage.getItem("moodo_producao_state_v1"));
    assert.equal(localSalvo.permissoes.OPERADOR["obra.criar"], true, "localStorage precisa ter a mudança mesmo com o Supabase ainda não pronto");

    // enquanto ready não resolve, mesmo passado o debounce de 400ms, NENHUMA
    // gravação na nuvem pode ter acontecido ainda (a gravação real fica
    // esperando M.Supa.ready, não faz um snapshot fantasma antes disso).
    await esperar(450);
    assert.equal(ctx.chamadasSalvar.length, 0, "não pode gravar na nuvem enquanto M.Supa.ready ainda não resolveu");
    assert.equal(ctx.chamadasClienteNulo.length, 0);

    // teste 4: assim que Supa.ready resolve, a gravação pendente acontece,
    // com o estado mais recente.
    ctx.resolverPronto(true);
    await esperar(50);
    assert.equal(ctx.chamadasSalvar.length, 1, "a gravação pendente precisa acontecer assim que o Supabase fica pronto");
    assert.equal(ctx.chamadasSalvar[0].dados.permissoes.OPERADOR["obra.criar"], true);
    assert.equal(ctx.chamadasClienteNulo.length, 0, "salvarEstado nunca pode ser chamado com cliente nulo");
  }

  // ---- 5: dois (ou mais) emit() enquanto Supa.ready está pendente — quando
  // ready resolve, só o estado MAIS RECENTE é persistido; nenhuma gravação
  // antiga sobrescreve uma mais nova (coalescimento por geração, fila de
  // tamanho 1) ----
  {
    const ctx = criarContextoHotfix();
    ctx.app.M.Store.setPermissao("OPERADOR", "obra.criar", true); // 1a intenção de gravação (geração 1)
    await esperar(450); // deixa o timer da geração 1 disparar e ficar esperando M.Supa.ready (ainda pendente)
    ctx.app.M.Store.setPermissao("OPERADOR", "obra.criar", false); // 2a intenção, mais nova, chega ANTES do Supabase ficar pronto (geração 2)
    await esperar(450); // deixa o timer da geração 2 também disparar e ficar esperando M.Supa.ready
    assert.equal(ctx.chamadasSalvar.length, 0, "pré-condição: nenhuma gravação deveria ter acontecido ainda, Supabase continua não-pronto");

    ctx.resolverPronto(true); // agora sim, os dois ".then" pendentes disparam
    await esperar(50);

    assert.equal(ctx.chamadasSalvar.length, 1, "só UMA gravação pode acontecer, mesmo com duas intenções de gravação pendentes (fila de tamanho 1)");
    assert.equal(ctx.chamadasSalvar[0].dados.permissoes.OPERADOR["obra.criar"], false, "a gravação que aconteceu precisa ser a do estado MAIS RECENTE (geração 2), não a antiga (geração 1)");
    assert.equal(ctx.chamadasClienteNulo.length, 0);
  }

  // ---- 6: M.Supa.ready resolvendo false (Supabase indisponível) nunca
  // chama salvarEstado ----
  {
    const ctx = criarContextoHotfix();
    ctx.app.M.Store.setPermissao("OPERADOR", "obra.criar", true);
    await esperar(450);
    ctx.resolverPronto(false);
    await esperar(50);
    assert.equal(ctx.chamadasSalvar.length, 0, "ready=false não pode chamar salvarEstado");
    assert.equal(ctx.chamadasClienteNulo.length, 0, "ready=false nem deveria chegar perto de tentar chamar salvarEstado com cliente nulo");
  }

  // ---- 7: M.Supa.ready rejeitando não pode gerar unhandled rejection nem
  // travar o app ----
  {
    const rejeicoesNaoTratadas = [];
    const handler = (motivo)=> rejeicoesNaoTratadas.push(motivo);
    process.on("unhandledRejection", handler);
    try{
      const ctx = criarContextoHotfix();
      ctx.app.M.Store.setPermissao("OPERADOR", "obra.criar", true);
      await esperar(450);
      ctx.rejeitarPronto(new Error("falha simulada de inicialização do Supabase"));
      await esperar(100);
      assert.equal(rejeicoesNaoTratadas.length, 0, "M.Supa.ready rejeitando não pode virar unhandled rejection");
      assert.equal(ctx.chamadasSalvar.length, 0);
      assert.equal(ctx.chamadasClienteNulo.length, 0);
    } finally {
      process.removeListener("unhandledRejection", handler);
    }
  }

  // ---- 8: modo Supabase desabilitado continua funcionando 100% em
  // localStorage (nada disso quebrou o fallback local que já existia) ----
  {
    const ctx = criarContextoHotfix({habilitado:false});
    assert.doesNotThrow(()=>{
      ctx.app.M.Store.setPermissao("OPERADOR", "obra.criar", true);
    }, "com Supabase desabilitado, emit() precisa continuar funcionando só com localStorage");
    await esperar(450);
    assert.equal(ctx.chamadasSalvar.length, 0);
    assert.equal(ctx.chamadasClienteNulo.length, 0);
    const localSalvo = JSON.parse(ctx.app.localStorage.getItem("moodo_producao_state_v1"));
    assert.equal(localSalvo.permissoes.OPERADOR["obra.criar"], true, "localStorage precisa continuar funcionando normalmente com Supabase desabilitado");
  }

  // ---- 9: migrarChecklistLegado() sem nada pra migrar não chama emit();
  // aplicarEstadoRemoto() com checklist legado migra UMA vez e persiste; no
  // próximo ciclo (estado já migrado voltando da nuvem) NÃO migra de novo —
  // fecha o loop da causa raiz nº 2 (ver HOTFIX-3.1-CAUSA-E-ABORDAGEM.md) ----
  {
    // este teste precisa da sincronizarComSupabase() de verdade rodando no
    // boot (é dali que vem o assinarMudancas de verdade) — só aqui abrimos
    // mão do isolamento padrão.
    const ctx = criarContextoHotfix({semSincronizacaoNoBoot:false});
    ctx.resolverPronto(true);
    await esperar(50); // deixa o boot (carregarEstado=null -> "seed" a nuvem com o state local) assentar
    ctx.chamadasSalvar.length = 0; // baseline limpo - a gravação de "seed" do boot não é o que este teste mede

    const cb = ctx.obterMudancaCb();
    assert.ok(cb, "assinarMudancas precisa ter sido registrado no boot (sincronizarComSupabase)");

    const remotoComChecklistLegado = estadoDeExemplo();
    const movelAlvo = remotoComChecklistLegado.obras[0].ambientes[0].moveis[0];
    movelAlvo.checklist = [{nome:"Corpo MDF (legado)", concluido:false}];

    cb(remotoComChecklistLegado, "carimbo-ciclo-1"); // simula uma sincronização real trazendo dado legado da nuvem

    // a migração roda SÍNCRONA dentro de aplicarEstadoRemoto -> migrarChecklistLegado()
    const tarefaMigrada = ctx.app.M.Store.state.tarefas.find(t=>t.origemChecklist && t.titulo==="Corpo MDF (legado)");
    assert.ok(tarefaMigrada, "checklist legado vindo da nuvem precisa virar uma Tarefa real, igual já acontecia no boot local");
    const movelNoStateAtual = ctx.app.M.Store.findMovel(movelAlvo.id).m;
    assert.deepEqual(Array.from(movelNoStateAtual.checklist||[]), [], "checklist legado precisa ser esvaziado depois de migrado");

    await esperar(450); // deixa a gravação (emitida pela migração) sair
    assert.equal(ctx.chamadasSalvar.length, 1, "migrarChecklistLegado() encontrando algo pra migrar precisa gerar exatamente UMA gravação na nuvem");
    assert.equal(ctx.chamadasClienteNulo.length, 0);
    const estadoJaMigrado = ctx.chamadasSalvar[0].dados;
    ctx.chamadasSalvar.length = 0; // baseline limpo pro "próximo ciclo"

    cb(estadoJaMigrado, "carimbo-ciclo-2"); // "próximo ciclo": a nuvem agora devolve a versão JÁ migrada
    await esperar(450);
    assert.equal(ctx.chamadasSalvar.length, 0, "com o estado já migrado, migrarChecklistLegado() não pode achar nada pra migrar de novo, e não pode gerar nova gravação (sem isso, é o loop infinito da causa raiz nº 2)");
  }

  // ---- 10 (HOTFIX 3.13.1): estado vindo da nuvem de ANTES da Fase 6
  // (Agenda V2) não tem a chave `eventos` — aplicarEstadoRemoto() precisa
  // deixar state.eventos como array vazio, nunca undefined, senão
  // M.Agenda.todosEventosBrutos() (`state.eventos.concat(...)`) quebra a
  // primeira leitura da Agenda/Hoje assim que a sincronização real chega.
  // Reproduz o crash de produção encontrado no smoke test pós-push. ----
  {
    const ctx = criarContextoHotfix({semSincronizacaoNoBoot:false});
    ctx.resolverPronto(true);
    await esperar(50);
    ctx.chamadasSalvar.length = 0; // baseline limpo

    // completa o contexto com Calc/Agenda pra reproduzir a leitura real
    // que quebrava em produção (M.Agenda.todosEventosRaw -> todosEventosBrutos).
    ctx.app.M.UI = Object.assign({}, ctx.app.M.UI, {
      esc:(s)=> String(s==null?"":s), icon:()=>"",
      tipoEventoChip:(t)=> `[tipo:${t}]`, statusEventoChip:(s)=> `[status:${s}]`,
    });
    executar(ctx.app, "js/calc.js");
    executar(ctx.app, "js/pages/agenda.js");

    const cb = ctx.obterMudancaCb();
    assert.ok(cb, "assinarMudancas precisa ter sido registrado no boot (sincronizarComSupabase)");

    // estado remoto real de ANTES desta fase: sem a chave `eventos` (nunca
    // foi salva na nuvem por uma versão anterior do app).
    const remotoSemEventos = estadoDeExemplo();
    delete remotoSemEventos.eventos;
    assert.equal(Object.prototype.hasOwnProperty.call(remotoSemEventos, "eventos"), false, "pré-condição: o remoto simulado não pode ter a chave eventos");

    assert.doesNotThrow(()=>{
      cb(remotoSemEventos, "carimbo-sem-eventos");
    }, "aplicarEstadoRemoto() não pode lançar quando o remoto não tem `eventos`");

    assert.ok(Array.isArray(ctx.app.M.Store.state.eventos), "state.eventos precisa virar array (nunca undefined) mesmo quando o remoto não tem essa chave");
    assert.equal(ctx.app.M.Store.state.eventos.length, 0);

    assert.doesNotThrow(()=>{
      ctx.app.M.Agenda.todosEventosRaw();
    }, "leitura real da Agenda (todosEventosRaw -> todosEventosBrutos) não pode lançar depois de um estado remoto sem `eventos`");

    // uma segunda sincronização, agora com o remoto já tendo `eventos`
    // (array não vazio), continua funcionando normalmente — a defesa não
    // pisa num valor real vindo da nuvem.
    const remotoComEventos = estadoDeExemplo();
    remotoComEventos.eventos = [{id:"evt-1", tipo:"VISITA", data:"2030-01-07", titulo:"Visita teste"}];
    cb(remotoComEventos, "carimbo-com-eventos");
    assert.equal(ctx.app.M.Store.state.eventos.length, 1, "quando o remoto TEM eventos de verdade, a defesa não pode substituir por array vazio");
    assert.equal(ctx.app.M.Store.state.eventos[0].id, "evt-1");
  }

  console.log("Hotfix 3.1 (persistencia Supabase antes do cliente pronto): OK");
  console.log("Hotfix 3.13.1 (state.eventos undefined vindo de estado remoto pre-Fase-6): OK");
}

rodarTestesHotfix().catch(err=>{
  console.error(err);
  process.exitCode = 1;
});
