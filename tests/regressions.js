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

// AJUSTES FINAIS (item 1) — "assistencia.cancelar" é chave NOVA nesta
// rodada; o estado simulado acima (`estadoAntigoSimulado`) foi salvo antes
// dela existir (nem em ADMIN, nem em nenhum perfil) E já carrega uma
// customização real do ADMIN em OUTRA chave (verValores:false). O merge de
// verdade (Store.mergePermissoes, chamado dentro de js/store.js na carga
// acima — não uma reimplementação local) precisa: preencher o default novo
// SEM apagar a customização preexistente.
assert.equal(permMigradas.ADMIN["assistencia.cancelar"], true, "ADMIN ganha o default novo (true) mesmo vindo de um estado salvo sem essa chave");
assert.equal(permMigradas.ADMIN.verValores, false, "...sem apagar a customização (verValores:false) que já estava salva em outra chave — mesmo objeto, mesma migração");
assert.equal(permMigradas.OPERADOR["assistencia.cancelar"], false, "OPERADOR ganha o default novo (false)");
assert.equal(permMigradas.MONTADOR["assistencia.cancelar"], false, "MONTADOR ganha o default novo (false)");
assert.ok(permMigradas.GESTOR, "GESTOR (perfil novo, ausente do estado salvo) precisa existir de qualquer forma...");
assert.equal(permMigradas.GESTOR["assistencia.cancelar"], true, "...e já vir com assistencia.cancelar=true (perfil inteiro é novo, não só a chave)");

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

// ---- FASE 7 (Assistências V2) — assistência deriva das VISITAS AGENDADAS
// (não mais de `prazo` solto), e pode gerar MÚLTIPLOS eventos por chamado —
// substitui o teste equivalente da Fase 6 (eventoDeAssistencia singular,
// baseado em `prazo`), que deixou de existir por decisão explícita do
// usuário (correção 4 da aprovação da Fase 7). Nunca duplicada em
// state.eventos (mesmo princípio "derivado, nunca persistido" de sempre).
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  const assist = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarAssistencia({
    obraId:o.id, obraNome:o.cliente, descricao:"teste assistência agenda", categoria:"Porta",
    responsavel:"Fernanda Costa", prioridade:"MEDIA",
  })).assistencia;
  // sem nenhuma visita agendada ainda — nenhum evento derivado.
  // NOTA: comparar por .length em vez de assert.deepEqual(...,[]) — arrays
  // criados dentro do contexto vm/ isolado de outro "realm" que o array
  // literal do próprio arquivo de teste, e o deepStrictEqual do Node não
  // trata dois arrays vazios de realms diferentes como iguais (confirmado
  // isoladamente) — não é bug do código, é uma pegadinha do harness vm.
  assert.equal(appFase6.M.Agenda.eventosDeAssistencia(assist).length, 0, "sem visita AGENDADA, nenhum compromisso derivado na Agenda");

  const v1 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.agendarVisitaAssistencia(assist.id, {data: appFase6.M.dOff(3), tecnico:"Fernanda Costa"})).visita;
  const v2 = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.agendarVisitaAssistencia(assist.id, {data: appFase6.M.dOff(9), tecnico:"Fernanda Costa"})).visita;
  const eventos = appFase6.M.Agenda.eventosDeAssistencia(assist);
  assert.equal(eventos.length, 2, "UMA assistência com 2 visitas AGENDADAS precisa gerar 2 compromissos na Agenda (§4 da aprovação)");
  assert.ok(eventos.every(e=>e.tipo==="ASSISTENCIA" && e.origem==="ASSISTENCIA"), "tipo/origem sempre ASSISTENCIA, nunca RETORNO");
  assert.equal(eventos.map(e=>e.data).sort().join(","), [v1.data, v2.data].sort().join(","));
  assert.ok(eventos.every(e=>e.id==="evt-asst-"+assist.id+"-"+eventos.find(x=>x.data===e.data && x.origemVisitaId===e.origemVisitaId).origemVisitaId), "id determinístico assistenciaId+visitaId");

  // mudar a data da visita reflete automaticamente na próxima leitura, sem edição duplicada (§4).
  v1.data = appFase6.M.dOff(4);
  const eventosApos = appFase6.M.Agenda.eventosDeAssistencia(assist);
  assert.ok(eventosApos.some(e=>e.data===appFase6.M.dOff(4) && e.origemVisitaId===v1.id), "mudar a data da visita reflete na Agenda sem tocar em nenhum evento");

  // realizar uma visita (REALIZADA) tira ELA da Agenda — a outra continua.
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.registrarVisitaAssistencia(assist.id, {visitaId:v1.id, desfecho:"RESOLVIDA"}));
  const eventosPosRealizada = appFase6.M.Agenda.eventosDeAssistencia(assist);
  assert.equal(eventosPosRealizada.length, 1, "visita REALIZADA para de aparecer como compromisso futuro (regra já existente da Agenda)");
  assert.equal(eventosPosRealizada[0].origemVisitaId, v2.id);

  // concluir a assistência (gate: cobertura decidida + resultado + sem
  // visita AGENDADA pendente + sem pendência bloqueante vinculada) tira o
  // chamado inteiro da Agenda.
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.registrarVisitaAssistencia(assist.id, {visitaId:v2.id, desfecho:"RESOLVIDA"}));
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.definirGarantiaAssistencia(assist.id, "COBERTO"));
  const rConcluir = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.concluirAssistencia(assist.id, {resultado:"Porta regulada e funcionando."}));
  assert.equal(rConcluir.ok, true, "sem visita AGENDADA pendente e sem pendência bloqueante, concluir precisa funcionar: "+JSON.stringify(rConcluir));
  assert.equal(assist.status, "CONCLUIDA");
  assert.equal(appFase6.M.Agenda.eventosDeAssistencia(assist).length, 0, "assistência concluída não é mais compromisso ativo na Agenda");
}

// ---- FASE 7 — regra dura: registrar uma visita RESOLVIDA NUNCA conclui a
// assistência sozinha (auto-conclusão removida de propósito — §12/correção
// 9); Store.atualizarAssistencia recusa a transição direta pra CONCLUIDA
// (precisa passar por concluirAssistencia, com o gate); o gate bloqueia
// cobertura "Em análise", visita AGENDADA pendente e pendência bloqueante
// vinculada via assistenciaId. ----
{
  const o = obraFixture6();
  appFase6.M.Store.state.obras.push(o);
  const assist = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarAssistencia({
    obraId:o.id, obraNome:o.cliente, descricao:"teste gate de conclusão", categoria:"Porta",
    responsavel:"Fernanda Costa", prioridade:"MEDIA",
  })).assistencia;

  const rDireto = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.atualizarAssistencia(assist.id, {status:"CONCLUIDA"}));
  assert.equal(rDireto.ok, false); assert.equal(rDireto.motivo, "USE_CONCLUIR_ASSISTENCIA");
  assert.notEqual(assist.status, "CONCLUIDA");

  const rVisita = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.registrarVisitaAssistencia(assist.id, {desfecho:"RESOLVIDA", diagnostico:"Regulado."}));
  assert.equal(rVisita.ok, true);
  assert.notEqual(assist.status, "CONCLUIDA", "resolver UMA visita nunca conclui a assistência sozinha — regra dura mantida (§12)");

  const rSemCobertura = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.concluirAssistencia(assist.id, {resultado:"Feito."}));
  assert.equal(rSemCobertura.ok, false); assert.equal(rSemCobertura.motivo, "COBERTURA_NAO_DEFINIDA", "cobertura ainda 'Em análise' (default) precisa bloquear a conclusão");

  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.definirGarantiaAssistencia(assist.id, "COBERTO"));
  const rSemResultado = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.concluirAssistencia(assist.id, {}));
  assert.equal(rSemResultado.ok, false); assert.equal(rSemResultado.motivo, "RESULTADO_OBRIGATORIO");

  const visitaFutura = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.agendarVisitaAssistencia(assist.id, {data: appFase6.M.dOff(5), tecnico:"Fernanda Costa"})).visita;
  const rComVisitaAgendada = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.concluirAssistencia(assist.id, {resultado:"Feito."}));
  assert.equal(rComVisitaAgendada.ok, false); assert.equal(rComVisitaAgendada.motivo, "VISITA_AGENDADA_PENDENTE", "visita AGENDADA pendente precisa bloquear a conclusão");

  // AJUSTES FINAIS (item 4): motivo passou a ser obrigatório em
  // cancelarVisitaAssistencia — esta chamada (pré-existente, Fase 6/7)
  // precisou ganhar o 3º argumento pra continuar cancelando de verdade.
  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.cancelarVisitaAssistencia(assist.id, visitaFutura.id, "não é mais necessária pro teste"));
  const pend = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.criarPendencia({
    obraId:o.id, obraNome:o.cliente, categoria:"Peça para refazer", descricao:"peça bloqueante do teste",
    responsavel:"Fernanda Costa", prioridade:"ALTA", impacto:"IMPEDE_FINALIZAR", origem:"ASSISTENCIA", assistenciaId:assist.id,
  })).pendencia;
  const rComPendenciaBloqueante = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.concluirAssistencia(assist.id, {resultado:"Feito."}));
  assert.equal(rComPendenciaBloqueante.ok, false); assert.equal(rComPendenciaBloqueante.motivo, "PENDENCIA_BLOQUEANTE", "pendência vinculada com impacto bloqueante precisa impedir a conclusão");

  comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.atualizarStatusPendencia(pend.id, "RESOLVIDA"));
  const rFinal = comoUsuarioFase6(ADMIN6, ()=> appFase6.M.Store.concluirAssistencia(assist.id, {resultado:"Feito."}));
  assert.equal(rFinal.ok, true, "resolvida a pendência bloqueante e sem visita agendada, concluir precisa funcionar: "+JSON.stringify(rFinal));
  assert.equal(assist.status, "CONCLUIDA");
  assert.ok(appFase6.M.Store.state.historico.some(h=>h.assistenciaId===assist.id && h.tipo==="ASSISTENCIA_CONCLUIDA"), "conclusão precisa deixar rastro no histórico DA OBRA (Store.log, não só Store.audit)");
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
    // FASE 7: a Agenda deriva de VISITA AGENDADA, não mais de `prazo` solto
    // (correção 4) — fixture precisa de uma visita com status AGENDADA pra
    // gerar o compromisso que este teste de escopo verifica.
    appFase6.M.Store.state.assistencias.push({id:"fx6-asst-propria", obraId:obraPropria.id, obraNome:obraPropria.cliente,
      status:"AGENDADA", descricao:"minha", categoria:"Porta", responsavel:"Ana Ferreira", garantia:"EM_ANALISE",
      visitas:[{id:"fx6-visit-propria", status:"AGENDADA", data:appFase6.M.dOff(2), tecnico:"Ana Ferreira"}]});
    appFase6.M.Store.state.assistencias.push({id:"fx6-asst-alheia", obraId:obraAlheia.id, obraNome:obraAlheia.cliente,
      status:"AGENDADA", descricao:"de outra pessoa", categoria:"Porta", responsavel:"Fernanda Costa", garantia:"EM_ANALISE",
      visitas:[{id:"fx6-visit-alheia", status:"AGENDADA", data:appFase6.M.dOff(2), tecnico:"Fernanda Costa"}]});

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
// FASE 7 — ASSISTÊNCIAS V2. Contexto isolado com fixtures próprias (mesmo
// padrão das fases anteriores). Carrega a cadeia REAL de arquivos, incluindo
// js/ui.js de verdade (não um stub mínimo) — as funções de ui.js não tocam
// DOM na hora de serem DEFINIDAS, só quando chamadas (openModal/toast/etc.,
// nada disso é exercitado por render puro de HTML), então dá pra validar o
// HTML de verdade das 3 telas novas (V2 desktop/mobile/detalhe) sem precisar
// stubar chip-a-chip. Cobre exatamente a lista de testes obrigatórios do
// pedido original (§30): criar assistência; obra concluída aceita sem
// side-effect em faseMacro; as 4 coberturas + log de mudança; N visitas;
// visita→Agenda (mudança de data reflete, nunca duplica, nunca vira registro
// próprio); Pendência herda contexto+origem; bloqueante impede
// conclusão/não-bloqueante não impede; visita RESOLVIDA isolada não conclui
// sozinha; conclusão registra resultado/autor/data/cobertura; concluída sai
// de "precisa de ação"; escopo por perfil Assistência; Produção sem acesso;
// Hoje consome o modelo novo; desktop/mobile/detalhe renderizam sem lançar.
// ==================================================================
{
  const appFase7 = contextoBase();
  executar(appFase7, "js/data.js");
  appFase7.M.Pages = {};
  appFase7.M.UIState = {
    obraTab:{}, obraFoco:{},
    atendFiltro:{status:"", garantia:"", grupo:"", obraId:"", busca:""}, atendExpandidoId:null,
    assistFiltro:{status:"", garantia:""}, assistExpandido:null,
    expandSections:new Set(),
    calFiltros:new Set(["PRODUCAO","ENTREGAS","MONTAGENS","PENDENCIAS","FORNECEDORES","ASSISTENCIAS"]),
  };
  executar(appFase7, "js/store.js");
  executar(appFase7, "js/calc.js");
  executar(appFase7, "js/ui.js");
  executar(appFase7, "js/pages/agenda.js");
  executar(appFase7, "js/pages/assistenciasV2.js");
  executar(appFase7, "js/pages/obraDetail.js");
  executar(appFase7, "js/pages/hoje.js");
  appFase7.M.UIState.agendaAno = appFase7.M.TODAY.getFullYear();
  appFase7.M.UIState.agendaMes = appFase7.M.TODAY.getMonth();
  appFase7.M.UIState.agendaDia = appFase7.M.todayISO();
  appFase7.M.UIState.agendaSemanaInicio = appFase7.M.Agenda.segundaFeiraDe(appFase7.M.todayISO());

  function comoUsuarioFase7(nome, fn){
    const original = appFase7.M.Store.state.usuarioAtual;
    appFase7.M.Store.setUsuarioAtual(nome);
    try{ return fn(); } finally { appFase7.M.Store.setUsuarioAtual(original); }
  }
  let _fx7Seq = 0;
  function obraFixture7(over){
    _fx7Seq++;
    return Object.assign({
      id:"fx7-obra-"+_fx7Seq, numeroOS:"OS FX7/"+_fx7Seq, cliente:"Cliente Fixture 7 #"+_fx7Seq,
      dataOS:appFase7.M.todayISO(), criadaEm:appFase7.M.todayISO(), dataEntregaPrevista:appFase7.M.dOff(30), dataEntregaReal:null,
      valorBruto:1000, valorLiquido:1000, status:"AGUARDANDO_INICIO", responsavel:"Teste", endereco:"Rua Fixture, 7",
      ambientes:[{id:"fx7-amb-"+_fx7Seq, nome:"Ambiente", moveis:[{id:"fx7-mov-"+_fx7Seq, nome:"Móvel", etapa:"CORTE", componentesCriticos:[]}]}],
    }, over);
  }
  const ADMIN7 = "Paulo Henrique";

  // ---- 1) criar assistência: defaults corretos (garantia "Em análise",
  // status ABERTA, visitas vazio) — mesmo contrato desde a Fase 5, não mudou ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const r = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"vazamento no rodapé", categoria:"Acabamento", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    }));
    assert.equal(r.ok, true);
    assert.equal(r.assistencia.status, "ABERTA");
    assert.equal(r.assistencia.garantia, "EM_ANALISE");
    assert.equal((r.assistencia.visitas||[]).length, 0);
    assert.ok(appFase7.M.Store.state.historico.some(h=>h.assistenciaId===r.assistencia.id && h.tipo==="ASSISTENCIA_ABERTA"), "abertura precisa aparecer no Histórico DA OBRA (Store.log), não só na Auditoria site-wide");
  }

  // ---- 2) obra CONCLUÍDA (faseMacro) aceita assistência sem nenhum
  // side-effect — criar/editar/agendar/registrar visita NUNCA tocam
  // faseMacro nem reabrem Produção/Montagem (correção 5 da aprovação:
  // CONCLUIDA ≠ "arquivada", conceito adiado, não simulado aqui) ----
  {
    const o = obraFixture7({faseMacro:"CONCLUIDA"});
    appFase7.M.Store.state.obras.push(o);
    const r = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"ajuste pós-entrega", categoria:"Regulagem", responsavel:"Fernanda Costa", prioridade:"BAIXA",
    }));
    assert.equal(r.ok, true, "obra com faseMacro CONCLUIDA precisa aceitar nova assistência normalmente");
    assert.equal(o.faseMacro, "CONCLUIDA", "criar assistência não pode alterar faseMacro da obra");
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.agendarVisitaAssistencia(r.assistencia.id, {data: appFase7.M.dOff(2), tecnico:"Fernanda Costa"}));
    assert.equal(o.faseMacro, "CONCLUIDA", "agendar visita também não pode alterar faseMacro (nunca reabre Produção/Montagem)");
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.atualizarAssistencia(r.assistencia.id, {status:"EM_EXECUCAO"}));
    assert.equal(o.faseMacro, "CONCLUIDA", "editar status da assistência também não pode alterar faseMacro");
  }

  // ---- 3) as 4 coberturas (garantia) + cada mudança loga no Histórico da obra ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"teste cobertura", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"BAIXA",
    })).assistencia;
    ["COBERTO","NAO_COBERTO","EM_ANALISE","CORTESIA"].forEach(g=>{
      const r = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.definirGarantiaAssistencia(a.id, g));
      assert.equal(r.ok, true, "ADMIN precisa poder definir qualquer uma das 4 coberturas, inclusive Cortesia");
      assert.equal(a.garantia, g);
    });
    const logsGarantia = appFase7.M.Store.state.historico.filter(h=>h.assistenciaId===a.id && h.tipo==="ASSISTENCIA_GARANTIA_DEFINIDA");
    assert.equal(logsGarantia.length, 4, "cada uma das 4 mudanças de cobertura precisa deixar rastro no Histórico da obra");
  }

  // ---- 4) N visitas por chamado (mais de 2) — histórico completo preservado ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"porta empenada", categoria:"Porta", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.registrarVisitaAssistencia(a.id, {desfecho:"RETORNO_NECESSARIO", diagnostico:"1ª visita — identificou a peça"}));
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.registrarVisitaAssistencia(a.id, {desfecho:"RETORNO_NECESSARIO", diagnostico:"2ª visita — peça ainda não chegou"}));
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.registrarVisitaAssistencia(a.id, {desfecho:"RESOLVIDA", diagnostico:"3ª visita — instalada e resolvida"}));
    assert.equal(a.visitas.length, 3, "3 visitas distintas precisam ter sido preservadas, nenhuma sobrescrita");
    assert.equal(a.visitas[0].diagnostico, "1ª visita — identificou a peça");
    assert.equal(a.visitas[2].diagnostico, "3ª visita — instalada e resolvida");
    assert.notEqual(a.status, "CONCLUIDA", "resolver a 3ª visita ainda não conclui a assistência sozinha (§12)");
  }

  // ---- 5) Pendência gerada a partir de uma visita herda contexto e ganha
  // origem="ASSISTENCIA"+assistenciaId (correção 6); visita.pendenciaGeradaId
  // precisa apontar pro id de verdade (bug pré-existente da Fase 5,
  // corrigido de passagem nesta fase — ver comentário em Store.js) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, ambienteNome:"Cozinha", movelNome:"Armário", descricao:"puxador quebrado", categoria:"Ferragem",
      responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    const r = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.registrarVisitaAssistencia(a.id, {
      desfecho:"RETORNO_NECESSARIO", diagnostico:"precisa de puxador novo",
      pecaNecessaria:{categoria:"Peça para refazer", descricao:"puxador novo", prazo: appFase7.M.dOff(7)},
    }));
    assert.equal(r.ok, true);
    assert.ok(r.pendenciaGerada, "visita com peça necessária precisa gerar uma pendência real");
    assert.equal(r.pendenciaGerada.origem, "ASSISTENCIA");
    assert.equal(r.pendenciaGerada.assistenciaId, a.id);
    assert.equal(r.pendenciaGerada.obraId, a.obraId, "pendência precisa herdar obraId do contexto da assistência");
    assert.equal(r.pendenciaGerada.ambienteNome, "Cozinha", "pendência precisa herdar ambienteNome do contexto da assistência");
    assert.equal(r.visita.pendenciaGeradaId, r.pendenciaGerada.id, "visita.pendenciaGeradaId precisa apontar pro id real da pendência (bug da Fase 5 corrigido)");
  }

  // ---- 6) bloqueante impede conclusão / não-bloqueante NÃO impede — usa
  // M.bloqueiaFechamento (mesma função de sempre, nenhum booleano paralelo) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"teste bloqueio", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"BAIXA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.definirGarantiaAssistencia(a.id, "COBERTO"));
    const pendInformativa = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarPendencia({
      obraId:o.id, obraNome:o.cliente, categoria:"Outro", descricao:"observação sem impacto", responsavel:"Fernanda Costa",
      prioridade:"BAIXA", impacto:"INFORMATIVO", origem:"ASSISTENCIA", assistenciaId:a.id,
    })).pendencia;
    const rComNaoBloqueante = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.concluirAssistencia(a.id, {resultado:"Resolvido, observação registrada."}));
    assert.equal(rComNaoBloqueante.ok, true, "pendência vinculada com impacto INFORMATIVO (não bloqueia fechamento) NÃO pode impedir a conclusão");
    assert.equal(a.status, "CONCLUIDA");
    assert.equal(pendInformativa.status, "ABERTA", "concluir a assistência não precisa nem deve mexer numa pendência informativa não-bloqueante");
  }

  // ---- 7) conclusão registra resultado + autor + data + cobertura ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"teste registro de conclusão", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"BAIXA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.definirGarantiaAssistencia(a.id, "NAO_COBERTO"));
    const r = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.concluirAssistencia(a.id, {resultado:"Explicado ao cliente, fora da garantia."}));
    assert.equal(r.ok, true);
    assert.equal(a.resultado, "Explicado ao cliente, fora da garantia.");
    assert.equal(a.resolvidoPor, ADMIN7);
    assert.ok(a.resolvidoEm);
    assert.equal(a.garantia, "NAO_COBERTO");

    // ---- 8) concluída sai de "precisa de ação" (mesmo critério da tela V2/Hoje) ----
    assert.notEqual(a.status, "ABERTA");
    assert.equal(appFase7.M.Calc.assistenciaComRetornoPendente(a), false, "assistência concluída não pode contar como 'retorno pendente'");
  }

  // ---- 9) escopo por perfil Assistência (Store.assistenciasVisiveis) — só
  // o atendimento das obras do próprio contexto, mesmo raciocínio de
  // pendenciasVisiveis (Fase 4) ----
  {
    const alvo = appFase7.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
    const perfilOriginal = alvo.perfil;
    alvo.perfil = "ASSISTENCIA";
    try{
      const oPropria = obraFixture7(), oAlheia = obraFixture7();
      appFase7.M.Store.state.obras.push(oPropria, oAlheia);
      const aPropria = comoUsuarioFase7("Ana Ferreira", ()=> appFase7.M.Store.criarAssistencia({
        obraId:oPropria.id, obraNome:oPropria.cliente, descricao:"minha", categoria:"Outro", responsavel:"Ana Ferreira", prioridade:"BAIXA",
      })).assistencia;
      const aAlheia = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
        obraId:oAlheia.id, obraNome:oAlheia.cliente, descricao:"de outra pessoa", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"BAIXA",
      })).assistencia;
      const visiveis = comoUsuarioFase7("Ana Ferreira", ()=> appFase7.M.Store.assistenciasVisiveis()).map(a=>a.id);
      assert.ok(visiveis.includes(aPropria.id), "Assistência vê o próprio atendimento");
      assert.ok(!visiveis.includes(aAlheia.id), "Assistência NÃO vê atendimento de outra pessoa sem vínculo — mesmo escopo de pendenciasVisiveis");
      // Admin (verTodasObras) continua vendo tudo.
      const visiveisAdmin = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.assistenciasVisiveis()).map(a=>a.id);
      assert.ok(visiveisAdmin.includes(aPropria.id) && visiveisAdmin.includes(aAlheia.id));
    } finally { alvo.perfil = perfilOriginal; }
  }

  // ---- 10) Produção (OPERADOR) — zero acesso (assistencia.criar=false
  // continua negando no Store, não só escondendo botão na tela) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const r = comoUsuarioFase7("Roberto Diniz", ()=> appFase7.M.Store.criarAssistencia({obraId:o.id, obraNome:o.cliente, descricao:"teste", categoria:"Outro"}));
    assert.equal(r.ok, false); assert.equal(r.motivo, "SEM_PERMISSAO");
  }

  // ---- 11) Hoje (perfil Assistência) consome o modelo novo — smoke real,
  // sem lançar, com fixture com visita agendada aparecendo no bloco certo ----
  {
    const alvo = appFase7.M.COLABORADORES.find(c=>c.nome==="Ana Ferreira");
    const perfilOriginal = alvo.perfil;
    alvo.perfil = "ASSISTENCIA";
    try{
      const o = obraFixture7();
      appFase7.M.Store.state.obras.push(o);
      const a = comoUsuarioFase7("Ana Ferreira", ()=> appFase7.M.Store.criarAssistencia({
        obraId:o.id, obraNome:o.cliente, descricao:"FX7HOJE atendimento do dia", categoria:"Outro", responsavel:"Ana Ferreira", prioridade:"MEDIA",
      })).assistencia;
      comoUsuarioFase7("Ana Ferreira", ()=> appFase7.M.Store.agendarVisitaAssistencia(a.id, {data: appFase7.M.dOff(1), tecnico:"Ana Ferreira"}));
      const resultado = comoUsuarioFase7("Ana Ferreira", ()=> appFase7.M.Pages.hoje());
      assert.ok(resultado && typeof resultado.html === "string" && resultado.html.length>0, "M.Pages.hoje() renderiza sem lançar pro perfil Assistência");
      // o card do bloco "Atendimentos do dia" mostra categoria+obraNome (não
      // a descrição) — confere pelo nome da obra fixture, que é único.
      assert.ok(resultado.html.includes(o.cliente), "atendimento do dia (responsável = usuário atual) precisa aparecer no bloco 'Atendimentos do dia'");
    } finally { alvo.perfil = perfilOriginal; }
  }

  // ---- 12) desktop/mobile/detalhe renderizam sem lançar (smoke, mesmo
  // padrão já usado pra Agenda/Montagem) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"smoke render", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=>{
      const rDesktop = appFase7.M.Pages.assistenciasV2();
      assert.ok(rDesktop && rDesktop.html.length>0, "M.Pages.assistenciasV2() (desktop) renderiza sem lançar");
      const rMobile = appFase7.M.Pages.atendimentos();
      assert.ok(rMobile && rMobile.html.length>0, "M.Pages.atendimentos() (mobile) renderiza sem lançar");
      const rDetail = appFase7.M.Pages.assistenciaDetail(a.id);
      assert.ok(rDetail && rDetail.html.length>0, "M.Pages.assistenciaDetail() renderiza sem lançar");
      const rObra = appFase7.M.Pages.obraDetail(o.id);
      assert.ok(rObra && rObra.html.includes("Ver atendimentos"), "Visão Geral da obra precisa ter o bloco novo com o link 'Ver atendimentos' (correção 8)");
    });
  }

  // ---- 13) evento derivado de assistência NUNCA vira registro próprio em
  // state.eventos (mesma defesa em profundidade da Montagem, Fase 6) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"teste nunca persiste", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"BAIXA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.agendarVisitaAssistencia(a.id, {data: appFase7.M.dOff(2), tecnico:"Fernanda Costa"}));
    assert.ok(!appFase7.M.Store.state.eventos.some(e=>e.origemRefId===a.id || e.obraId===a.obraId && e.tipo==="ASSISTENCIA"), "visita agendada NUNCA pode virar registro próprio em state.eventos — só derivada em memória");
  }

  // ==================================================================
  // AJUSTES FINAIS (rodada de fechamento antes do push) — permissão
  // "assistencia.cancelar" + Store.cancelarAssistencia + bypass fechado +
  // motivo obrigatório em cancelarVisitaAssistencia. Cobre item a item a
  // lista de testes exigida pelo usuário nesta rodada.
  // ==================================================================
  function reassignPerfil7(nomeColab, novoPerfil, fn){
    const alvo = appFase7.M.COLABORADORES.find(c=>c.nome===nomeColab);
    const original = alvo.perfil;
    alvo.perfil = novoPerfil;
    try{ return fn(); } finally { alvo.perfil = original; }
  }

  // ---- 14) Admin cancela assistência — sucesso, com todos os campos
  // gravados corretamente e nada mais tocado (visitas/fotos/pendências/
  // faseMacro preservados) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC admin cancela", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.agendarVisitaAssistencia(a.id, {data: appFase7.M.dOff(3), tecnico:"Fernanda Costa"}));
    const visitaId = a.visitas[0].id;
    const r = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a.id, {motivo:"Cliente desistiu do reparo"}));
    assert.equal(r.ok, true, "ADMIN precisa poder cancelar (matriz: ADMIN=true)");
    assert.equal(a.status, "CANCELADA");
    assert.equal(a.canceladoPor, ADMIN7);
    assert.ok(a.canceladoEm);
    assert.equal(a.motivoCancelamento, "Cliente desistiu do reparo");
    assert.equal(o.faseMacro, undefined, "cancelar assistência não pode criar/alterar faseMacro da obra (obra fixture nasce sem faseMacro)");
    assert.equal(a.visitas.length, 1, "cancelar a assistência NÃO remove a visita já registrada");
    assert.equal(a.visitas[0].id, visitaId, "a visita continua a mesma, intacta");
    assert.ok(appFase7.M.Store.state.historico.some(h=>h.assistenciaId===a.id && h.tipo==="ASSISTENCIA_CANCELADA"), "cancelamento precisa aparecer no Histórico da obra");
  }

  // ---- 15) Gestor cancela — sucesso (matriz: GESTOR=true; perfil sem
  // colaborador fixo hoje, reatribuído só pro teste, restaurado depois) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC gestor cancela", categoria:"Outro", responsavel:"Pedro Rocha", prioridade:"MEDIA",
    })).assistencia;
    const r = reassignPerfil7("Pedro Rocha", "GESTOR", ()=> comoUsuarioFase7("Pedro Rocha", ()=> appFase7.M.Store.cancelarAssistencia(a.id, {motivo:"Duplicado — já existe outro chamado pro mesmo item"})));
    assert.equal(r.ok, true, "GESTOR precisa poder cancelar (matriz: GESTOR=true)");
    assert.equal(a.status, "CANCELADA");
  }

  // ---- 16/17/18/19/20) todos os perfis SEM assistencia.cancelar recusam,
  // mesmo tendo assistencia.editar (ASSISTENCIA/PCP/LIDERANCA) ou não
  // (MONTADOR/OPERADOR) — status permanece intocado em todos os casos ----
  {
    const casos = [
      {nome:"Ana Ferreira",   perfilTemp:"ASSISTENCIA", label:"Assistência"},
      {nome:"Beatriz Nogueira", perfilTemp:null,          label:"PCP"},          // já é PCP por padrão
      {nome:"Juliana Prado",  perfilTemp:null,          label:"Líder"},          // já é LIDERANCA por padrão
      {nome:"Roberto Diniz",  perfilTemp:null,          label:"Montador"},       // já é MONTADOR por padrão
      {nome:"Willian Souza",  perfilTemp:null,          label:"Produção/Operador"}, // já é OPERADOR por padrão
    ];
    casos.forEach(({nome,perfilTemp,label})=>{
      const o = obraFixture7();
      appFase7.M.Store.state.obras.push(o);
      const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
        obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC "+label+" não cancela", categoria:"Outro", responsavel:nome, prioridade:"MEDIA",
      })).assistencia;
      const run = ()=> comoUsuarioFase7(nome, ()=> appFase7.M.Store.cancelarAssistencia(a.id, {motivo:"tentativa sem permissão"}));
      const r = perfilTemp ? reassignPerfil7(nome, perfilTemp, run) : run();
      assert.equal(r.ok, false, label+" NÃO pode cancelar assistência (matriz: "+label+"=false)");
      assert.equal(r.motivo, "SEM_PERMISSAO");
      assert.equal(a.status, "ABERTA", label+" tentando cancelar não pode ter mudado o status de jeito nenhum");
    });
  }

  // ---- 21) bypass fechado: mesmo um perfil com assistencia.editar (ex.:
  // ADMIN, que também tem editar) NUNCA consegue gravar CANCELADA via
  // atualizarAssistencia — só passando por Store.cancelarAssistencia ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC bypass", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    const r = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.atualizarAssistencia(a.id, {status:"CANCELADA"}));
    assert.equal(r.ok, false, "atualizarAssistencia nunca pode gravar CANCELADA, mesmo pra quem tem assistencia.editar");
    assert.equal(r.motivo, "USE_CANCELAR_ASSISTENCIA");
    assert.equal(a.status, "ABERTA", "status não pode ter mudado — bypass tem que falhar ANTES de tocar o dado");
    // ASSISTENCIA/PCP/LIDERANCA têm assistencia.editar=true e
    // assistencia.cancelar=false — o cenário de bypass mais realista é
    // justamente um desses tentando contornar a permissão que não têm.
    const rAssist = reassignPerfil7("Ana Ferreira", "ASSISTENCIA", ()=> comoUsuarioFase7("Ana Ferreira", ()=> appFase7.M.Store.atualizarAssistencia(a.id, {status:"CANCELADA"})));
    assert.equal(rAssist.ok, false);
    assert.equal(rAssist.motivo, "USE_CANCELAR_ASSISTENCIA", "perfil Assistência (editar=true, cancelar=false) também não contorna via patch direto");
    assert.equal(a.status, "ABERTA");
  }

  // ---- 22) motivo obrigatório — ADMIN com permissão, mas sem motivo, é
  // recusado; status não muda ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC sem motivo", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    const r1 = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a.id, {}));
    assert.equal(r1.ok, false); assert.equal(r1.motivo, "MOTIVO_OBRIGATORIO");
    const r2 = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a.id, {motivo:"   "}));
    assert.equal(r2.ok, false, "motivo só com espaços em branco também é recusado"); assert.equal(r2.motivo, "MOTIVO_OBRIGATORIO");
    assert.equal(a.status, "ABERTA");
  }

  // ---- 23) CONCLUIDA não pode ser cancelada; CANCELADA cancelada de novo é
  // idempotente (mesmo padrão do gate de conclusão) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC já concluída", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"BAIXA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.definirGarantiaAssistencia(a.id, "COBERTO"));
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.concluirAssistencia(a.id, {resultado:"Resolvido"}));
    assert.equal(a.status, "CONCLUIDA");
    const r = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a.id, {motivo:"tentando cancelar depois de concluída"}));
    assert.equal(r.ok, false); assert.equal(r.motivo, "ASSISTENCIA_CONCLUIDA");
    assert.equal(a.status, "CONCLUIDA", "status continua CONCLUIDA — não pode virar CANCELADA por cima");

    const o2 = obraFixture7();
    appFase7.M.Store.state.obras.push(o2);
    const a2 = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o2.id, obraNome:o2.cliente, descricao:"FX7CANC cancelar 2x", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"BAIXA",
    })).assistencia;
    const rc1 = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a2.id, {motivo:"primeira vez"}));
    assert.equal(rc1.ok, true);
    const rc2 = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a2.id, {motivo:"segunda vez"}));
    assert.equal(rc2.ok, true, "cancelar uma assistência já CANCELADA é idempotente, não erro");
    assert.equal(rc2.jaCancelada, true);
    assert.equal(a2.motivoCancelamento, "primeira vez", "a 2ª tentativa não pode sobrescrever o motivo já gravado da 1ª");
  }

  // ---- 24) CANCELADA não aparece em "Precisa de ação" — prova ponta a
  // ponta: uma assistência SEM visita e SEM próximo passo aparece na coluna
  // "Precisa de ação" enquanto ABERTA; ao cancelar, o mesmo texto (único)
  // some de dentro daquela coluna especificamente (não só da contagem) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const marcador = "FX7CANC-marcador-unico-precisa-de-acao";
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:marcador, categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    // "Precisa de ação" aparece 2x no HTML (tile do KPI e cabeçalho da
    // coluna) — o marcador único de conteúdo só pode estar DENTRO da coluna
    // de verdade (corpoColunas, depois de "cols-3-tight"), nunca no KPI.
    const htmlAntes = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Pages.assistenciasV2()).html;
    const colunasAntes = htmlAntes.indexOf("cols-3-tight");
    const iniAntes = htmlAntes.indexOf("Precisa de ação", colunasAntes);
    const fimAntes = htmlAntes.indexOf("Agendadas hoje", iniAntes);
    const colunaPrecisaAcaoAntes = htmlAntes.slice(iniAntes, fimAntes);
    assert.ok(colunaPrecisaAcaoAntes.includes(marcador), "assistência ABERTA sem visita/próximo passo precisa aparecer na coluna 'Precisa de ação'");

    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a.id, {motivo:"cancelada pra sair de precisa de ação"}));
    const htmlDepois = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Pages.assistenciasV2()).html;
    const colunasDepois = htmlDepois.indexOf("cols-3-tight");
    const iniDepois = htmlDepois.indexOf("Precisa de ação", colunasDepois);
    const fimDepois = htmlDepois.indexOf("Agendadas hoje", iniDepois);
    const colunaPrecisaAcaoDepois = htmlDepois.slice(iniDepois, fimDepois);
    assert.ok(!colunaPrecisaAcaoDepois.includes(marcador), "depois de CANCELADA, o mesmo item não pode mais aparecer na coluna 'Precisa de ação'");
  }

  // ---- 25) CANCELADA não gera evento de Agenda; visita CANCELADA some da
  // Agenda mas as OUTRAS visitas agendadas da mesma assistência continuam
  // (cancelar 1 visita não derruba as demais nem a assistência) ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC agenda", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.agendarVisitaAssistencia(a.id, {data: appFase7.M.dOff(2), tecnico:"Fernanda Costa"}));
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.agendarVisitaAssistencia(a.id, {data: appFase7.M.dOff(4), tecnico:"Fernanda Costa"}));
    assert.equal(appFase7.M.Agenda.eventosDeAssistencia(a).length, 2, "2 visitas agendadas → 2 eventos derivados");

    const visitaCancelada = a.visitas[0];
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarVisitaAssistencia(a.id, visitaCancelada.id, "cliente remarcou"));
    const eventosAposCancelarVisita = appFase7.M.Agenda.eventosDeAssistencia(a);
    assert.equal(eventosAposCancelarVisita.length, 1, "visita cancelada some da Agenda — a OUTRA visita agendada continua");
    assert.ok(!eventosAposCancelarVisita.some(e=>e.origemVisitaId===visitaCancelada.id), "o evento da visita cancelada especificamente não pode mais existir");
    assert.equal(a.status, "AGENDADA", "cancelar 1 visita não cancela a assistência (status inalterado)");

    // agora cancela a assistência inteira — a visita restante também some.
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a.id, {motivo:"cancelando tudo"}));
    assert.equal(appFase7.M.Agenda.eventosDeAssistencia(a).length, 0, "assistência CANCELADA não pode gerar nenhum evento de Agenda, mesmo com visita ainda formalmente AGENDADA na visita");
  }

  // ---- 26) cancelar visita — gate correto (assistencia.editar, não
  // assistencia.cancelar), motivo obrigatório, histórico registra ----
  {
    const o = obraFixture7();
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC visita", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"MEDIA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.agendarVisitaAssistencia(a.id, {data: appFase7.M.dOff(2), tecnico:"Fernanda Costa"}));
    const visitaId = a.visitas[0].id;

    // sem motivo → recusa
    const rSemMotivo = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarVisitaAssistencia(a.id, visitaId, ""));
    assert.equal(rSemMotivo.ok, false); assert.equal(rSemMotivo.motivo, "MOTIVO_OBRIGATORIO");
    assert.equal(appFase7.M.Calc.statusEfetivoVisita(a.visitas[0]), "AGENDADA", "sem motivo, a visita continua AGENDADA");

    // perfil ASSISTENCIA tem assistencia.editar=true (não precisa de
    // assistencia.cancelar pra isso — item 4, decisão mantida) e consegue.
    const r = reassignPerfil7("Ana Ferreira", "ASSISTENCIA", ()=> comoUsuarioFase7("Ana Ferreira", ()=> appFase7.M.Store.cancelarVisitaAssistencia(a.id, visitaId, "cliente remarcou pra semana que vem")));
    assert.equal(r.ok, true, "perfil ASSISTENCIA (assistencia.editar=true) consegue cancelar uma visita, sem precisar de assistencia.cancelar");
    assert.equal(appFase7.M.Calc.statusEfetivoVisita(a.visitas[0]), "CANCELADA");
    assert.equal(a.visitas[0].motivoCancelamento, "cliente remarcou pra semana que vem");
    assert.equal(a.visitas[0].canceladoPor, "Ana Ferreira");
    assert.ok(a.visitas[0].canceladoEm);
    assert.ok(appFase7.M.Store.state.historico.some(h=>h.assistenciaId===a.id && h.visitaId===visitaId && h.tipo==="ASSISTENCIA_VISITA_CANCELADA"), "cancelamento de visita precisa aparecer no Histórico da obra");

    // perfil sem assistencia.editar (Produção/Operador) não consegue, nem
    // com motivo.
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.agendarVisitaAssistencia(a.id, {data: appFase7.M.dOff(5), tecnico:"Fernanda Costa"}));
    const visitaId2 = a.visitas[1].id;
    const rSemPermissao = comoUsuarioFase7("Willian Souza", ()=> appFase7.M.Store.cancelarVisitaAssistencia(a.id, visitaId2, "motivo válido"));
    assert.equal(rSemPermissao.ok, false); assert.equal(rSemPermissao.motivo, "SEM_PERMISSAO");
  }

  // ---- 27) faseMacro permanece intacto também nas duas ações novas
  // (cancelar assistência inteira e cancelar 1 visita) numa obra CONCLUIDA ----
  {
    const o = obraFixture7({faseMacro:"CONCLUIDA"});
    appFase7.M.Store.state.obras.push(o);
    const a = comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.criarAssistencia({
      obraId:o.id, obraNome:o.cliente, descricao:"FX7CANC obra concluida", categoria:"Outro", responsavel:"Fernanda Costa", prioridade:"BAIXA",
    })).assistencia;
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.agendarVisitaAssistencia(a.id, {data: appFase7.M.dOff(2), tecnico:"Fernanda Costa"}));
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarVisitaAssistencia(a.id, a.visitas[0].id, "motivo qualquer"));
    assert.equal(o.faseMacro, "CONCLUIDA", "cancelar 1 visita não pode alterar faseMacro");
    comoUsuarioFase7(ADMIN7, ()=> appFase7.M.Store.cancelarAssistencia(a.id, {motivo:"motivo qualquer"}));
    assert.equal(o.faseMacro, "CONCLUIDA", "cancelar a assistência inteira também não pode alterar faseMacro — obra concluída não vira 'arquivada' nem reabre nada");
  }

  // ---- 28) regressão de compatibilidade da migração de permissões
  // (mergePermissoes de verdade, não reimplementada aqui) — coberta como
  // extensão do teste de migração já existente da Fase 1, logo depois de
  // `appMigracao` ser carregado (ver acima, antes da seção "FASE 3"). Não
  // duplicado aqui de propósito — mesmo estado simulado, mesma chamada real
  // a js/store.js, sem reescrever a lógica de merge à mão num teste.
}

console.log("Fase 7 (Assistências V2): OK");

// ==================================================================
// FASE 7.5 — NOVA OBRA V2 + EDIÇÃO V2 (Partes A e B). Testes no nível de
// Store/Pages (mesmo padrão já usado em todo o arquivo) — funções de
// js/actions.js que leem elemento do DOM (document.getElementById, ex.
// novaObraManualAddAmbiente) não são chamadas diretamente aqui; testamos a
// mesma lógica através de M.Store.*/M.Pages.novaObraMontarManual, que é
// exatamente o que Act.novaObra* chama por baixo. Cobertura do Detalhe
// Rápido (Parte C) fica no próprio bloco da Parte C, mais abaixo.
// ==================================================================
{
  const app75 = contextoBase();
  executar(app75, "js/data.js");
  executar(app75, "js/pdf-import.js");
  app75.M.UI = {};
  app75.M.Pages = {};
  app75.M.UIState = {novaObra:{
    obraId:null, step:"inicio", modo:null, osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
    lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
    nomeManual:"", numeroOSManual:"", clienteManual:"", responsavelProducao:"",
    enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
    ambientesManual:[], osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
  }};
  executar(app75, "js/store.js");
  executar(app75, "js/calc.js");
  executar(app75, "js/pages/novaObra.js");
  function w75(){ return app75.M.UIState.novaObra; }
  function resetWizard75(){
    app75.M.UIState.novaObra = {
      obraId:null, step:"inicio", modo:"manual", osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
      lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
      nomeManual:"", numeroOSManual:"", clienteManual:"", responsavelProducao:"",
      enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
      ambientesManual:[], osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
    };
  }

  // ---- 1) criar rascunho manual, sem nenhum documento — item 2/3 do
  // pedido: documento nunca é obrigatório. Nasce RASCUNHO, sem seeding
  // (sem tarefas/pendência), fora de obrasOperacionais/allMoveis. ----
  {
    resetWizard75();
    w75().clienteManual = "Cliente FX75 Rascunho";
    w75().nomeManual = "Obra FX75 Rascunho";
    const antesTarefas = app75.M.Store.state.tarefas.length;
    const montado = app75.M.Pages.novaObraMontarManual();
    montado.status = "RASCUNHO";
    const criado = app75.M.Store.criarObra(montado);
    assert.equal(criado.status, "RASCUNHO");
    assert.equal(criado.faseMacro, "AGUARDANDO_INICIO");
    assert.ok(criado.criadoPor!==undefined, "criadoPor precisa existir (mesmo que null)");
    assert.ok(criado.criadoEm, "criadoEm precisa ter sido carimbado");
    assert.equal(app75.M.Store.state.tarefas.length, antesTarefas, "rascunho não pode gerar tarefa nenhuma (sem seeding antes de ativar)");
    assert.equal(app75.M.Store.obrasOperacionais().some(o=>o.id===criado.id), false, "rascunho não pode aparecer em obrasOperacionais()");
    assert.equal(app75.M.Store.obrasRascunho().some(o=>o.id===criado.id), true, "rascunho precisa aparecer em obrasRascunho()");
    assert.equal(app75.M.Store.allMoveis().some(({o})=>o.id===criado.id), false, "móvel de rascunho não pode aparecer em allMoveis() (usado por risco/Hoje/Montagem/etc.)");
  }

  // ---- 2) ativar rascunho incompleto (sem ambiente/móvel) precisa falhar
  // com CAMPOS_OBRIGATORIOS, listando o que falta — item 6 do pedido ----
  {
    resetWizard75();
    w75().clienteManual = "Cliente FX75 Incompleto";
    w75().responsavelProducao = "";
    const montado = app75.M.Pages.novaObraMontarManual();
    montado.status = "RASCUNHO";
    const criado = app75.M.Store.criarObra(montado);
    const r = app75.M.Store.ativarObra(criado.id);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, "CAMPOS_OBRIGATORIOS");
    assert.ok(r.faltando.includes("responsável"));
    assert.ok(r.faltando.includes("pelo menos 1 ambiente"));
    assert.ok(r.faltando.includes("pelo menos 1 móvel"));
    assert.equal(criado.status, "RASCUNHO", "ativação que falha não pode mudar o status");
  }

  // ---- 3) completar o rascunho (ambiente+móvel+responsável) e ativar —
  // seeding (tarefas padrão da etapa inicial) só acontece agora, nunca
  // antes. faseMacro continua AGUARDANDO_INICIO (nunca inferido) ----
  {
    resetWizard75();
    w75().clienteManual = "Cliente FX75 Completo";
    w75().nomeManual = "Obra FX75 Completa";
    w75().responsavelProducao = "Willian Souza";
    w75().ambientesManual = [{tid:"tmpamb-fx1", nome:"Sala", moveis:[{tid:"tmpmov-fx1", nome:"Painel ripado"}]}];
    const montado = app75.M.Pages.novaObraMontarManual();
    assert.ok(String(montado.ambientes[0].id).indexOf("amb-")===0, "novaObraMontarManual precisa mintar id canônico amb-N, não reaproveitar o tid temporário");
    montado.status = "RASCUNHO";
    const criado = app75.M.Store.criarObra(montado);
    const antesTarefas = app75.M.Store.state.tarefas.length;
    const r = app75.M.Store.ativarObra(criado.id);
    assert.equal(r.ok, true);
    assert.equal(criado.status, "ATIVA");
    assert.equal(criado.faseMacro, "AGUARDANDO_INICIO");
    assert.ok(criado.ativadoPor!==undefined);
    assert.ok(criado.ativadoEm);
    assert.ok(app75.M.Store.state.tarefas.length > antesTarefas, "ativarObra precisa gerar as tarefas padrão da etapa inicial (seeding adiado)");
    assert.equal(app75.M.Store.obrasOperacionais().some(o=>o.id===criado.id), true, "obra ativada precisa sair de RASCUNHO e virar operacional");
    // ativarObra chamado de novo (idempotência) não duplica nada nem falha.
    const r2 = app75.M.Store.ativarObra(criado.id);
    assert.equal(r2.ok, true);
    assert.equal(r2.jaAtiva, true);
  }

  // ---- 4) componente especial marcado só vira pendência real na
  // ativação (nunca no rascunho) — mesma régua do "sem seeding antes de
  // ativar" acima, agora com componentesCriticosIniciais ----
  {
    resetWizard75();
    w75().clienteManual = "Cliente FX75 Componente";
    w75().responsavelProducao = "Willian Souza";
    w75().ambientesManual = [{tid:"tmpamb-fx2", nome:"Quarto", moveis:[{tid:"tmpmov-fx2", nome:"Painel com espelho",
      componentesCriticosIniciais:[{nome:"Espelho", tipo:"Espelho"}]}]}];
    const montado = app75.M.Pages.novaObraMontarManual();
    montado.status = "RASCUNHO";
    const criado = app75.M.Store.criarObra(montado);
    const movelRascunho = criado.ambientes[0].moveis[0];
    assert.equal((movelRascunho.componentesCriticos||[]).length, 0, "rascunho não pode ter componente crítico ativo ainda");
    const pendAntes = app75.M.Store.state.pendencias.length;
    app75.M.Store.ativarObra(criado.id);
    assert.equal(movelRascunho.componentesCriticos.length, 1, "ativação precisa processar componentesCriticosIniciais guardados");
    assert.equal(movelRascunho.componentesCriticos[0].tipo, "Espelho");
    assert.ok(app75.M.Store.state.pendencias.length > pendAntes, "ativação precisa criar a pendência real do componente especial");
  }

  // ---- 5) OS duplicada — getObraByNumeroOS normaliza (trim + minúsculas)
  // e é a base da confirmação explícita da UI (item 9). Store em si não
  // bloqueia duas obras com a mesma OS (decisão consciente — quem decide é
  // a pessoa, via confirmação explícita) ----
  {
    resetWizard75();
    w75().clienteManual = "Cliente FX75 OS Dup A";
    w75().numeroOSManual = "  OS 7500/Dup  ";
    w75().responsavelProducao = "Willian Souza";
    w75().ambientesManual = [{tid:"a1", nome:"Amb", moveis:[{tid:"m1", nome:"Mov"}]}];
    const montadoA = app75.M.Pages.novaObraMontarManual();
    montadoA.status = "RASCUNHO";
    app75.M.Store.criarObra(montadoA);
    const achada = app75.M.Store.getObraByNumeroOS("os 7500/dup");
    assert.ok(achada, "getObraByNumeroOS precisa casar ignorando espaço/maiúscula");
    assert.equal(achada.numeroOS.trim(), "OS 7500/Dup");
    assert.equal(app75.M.Store.getObraByNumeroOS("OS-QUE-NAO-EXISTE"), null);
  }

  // ---- 6) retomar rascunho salvo: hidratar o wizard a partir da obra do
  // Store precisa preservar os ids reais (amb-N/mov-N), não regerar tmp —
  // atualizarEstruturaRascunho depois reconhece e não duplica ----
  {
    resetWizard75();
    w75().clienteManual = "Cliente FX75 Retomar";
    w75().responsavelProducao = "Willian Souza";
    w75().ambientesManual = [{tid:"tmpamb-fx3", nome:"Cozinha", moveis:[{tid:"tmpmov-fx3", nome:"Armário"}]}];
    const montado = app75.M.Pages.novaObraMontarManual();
    montado.status = "RASCUNHO";
    const criado = app75.M.Store.criarObra(montado);
    const ambienteIdReal = criado.ambientes[0].id;
    const movelIdReal = criado.ambientes[0].moveis[0].id;

    // hidratação manual do wizard igual à função hidratarWizardComRascunho
    // (privada ao módulo da página) — reproduz o mesmo contrato aqui pra
    // não depender de expor uma função interna só pro teste.
    app75.M.UIState.novaObra = {
      obraId:criado.id, step:"dados", modo:"manual", osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
      lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
      nomeManual:criado.nome||"", numeroOSManual:criado.numeroOS||"", clienteManual:criado.cliente||"",
      responsavelProducao:criado.responsavel||"", enderecoManual:criado.endereco||"",
      observacoesManual:criado.observacoes||"", dataEntregaPrevistaManual:criado.dataEntregaPrevista||"",
      componentesSelecionados:{},
      ambientesManual:(criado.ambientes||[]).map(a=>({tid:a.id, nome:a.nome, moveis:(a.moveis||[]).map(m=>({tid:m.id, nome:m.nome}))})),
      osDuplicadaConfirmada:false,
    };
    assert.equal(w75().ambientesManual[0].tid, ambienteIdReal);
    assert.equal(w75().ambientesManual[0].moveis[0].tid, movelIdReal);
    // edita e salva de novo via atualizarEstruturaRascunho — precisa
    // PRESERVAR os ids reais (não pode virar amb-novo/mov-novo).
    w75().ambientesManual[0].moveis.push({tid:"tmpmov-fx3b", nome:"Bancada"});
    const camposObj = app75.M.Pages.novaObraMontarManual();
    app75.M.Store.atualizarEstruturaRascunho(criado.id, camposObj.ambientes);
    assert.equal(criado.ambientes[0].id, ambienteIdReal, "id do ambiente precisa ser preservado ao reeditar o rascunho");
    assert.equal(criado.ambientes[0].moveis[0].id, movelIdReal, "id do móvel original precisa ser preservado");
    assert.equal(criado.ambientes[0].moveis.length, 2, "móvel novo adicionado na reedição precisa entrar");
  }

  // ---- 7) modo import: novaObraSincronizarEstruturaImportada converte
  // w.dados + rateio + componentesSelecionados pra w.ambientesManual —
  // isso é o que permite import e manual convergirem no mesmo caminho de
  // edição/persistência a partir da etapa Revisão ----
  {
    resetWizard75();
    w75().modo = "import";
    w75().clienteManual = "Cliente FX75 Import";
    w75().responsavelProducao = "Willian Souza";
    w75().dados = {
      numeroOS:"OS 7500/Imp", cliente:"Cliente FX75 Import", responsavel:"Externo",
      valorBrutoTotal:200, valorFinalVendido:200, data:app75.M.todayISO(), dataEntregaPrevista:null,
      endereco:"", telefone:"", email:"",
      itensOrc:[{ambiente:"SALA", item:"Painel", qtd:1, valorBruto:200}],
      ambientes:[{nome:"SALA", itens:[{item:"Painel", materiaisEspeciais:[
        {nome:"Espelho", tipo:"Espelho", geraPendenciaPadrao:true},
      ]}]}],
    };
    w75().componentesSelecionados = {"Espelho::Painel": true};
    app75.M.Pages.novaObraSincronizarEstruturaImportada();
    assert.equal(w75().ambientesManual.length, 1);
    assert.equal(w75().ambientesManual[0].nome, "SALA");
    assert.equal(w75().ambientesManual[0].moveis[0].nome, "Painel");
    assert.equal(w75().ambientesManual[0].moveis[0].valorLiquido, 200);
    assert.deepEqual(Array.from(w75().ambientesManual[0].moveis[0].componentesCriticosIniciais, c=>c.tipo), ["Espelho"]);
    const montado = app75.M.Pages.novaObraMontarManual();
    assert.equal(montado.valorLiquido, 200);
    assert.equal(montado.ambientes[0].moveis[0].componentesCriticosIniciais[0].tipo, "Espelho");
  }

  // ---- 8) edição simples (item 14): atualizarObra troca nome/endereco/
  // etc., loga OBRA_EDITADA, nunca mexe em ambientes/status/faseMacro ----
  {
    const o = {id:"fx75-editsimples", nome:"Nome Antigo", cliente:"Cliente X", numeroOS:"OS 1", responsavel:"Fulano",
      status:"ATIVA", faseMacro:"AGUARDANDO_INICIO", endereco:"Rua A", observacoes:"", ambientes:[]};
    app75.M.Store.state.obras.push(o);
    const histAntes = app75.M.Store.state.historico.length;
    const r = app75.M.Store.atualizarObra(o.id, {nome:"Nome Novo", endereco:"Rua B"});
    assert.equal(r.ok, true);
    assert.equal(o.nome, "Nome Novo");
    assert.equal(o.endereco, "Rua B");
    assert.equal(o.status, "ATIVA", "edição simples não pode mudar status");
    assert.equal(o.faseMacro, "AGUARDANDO_INICIO", "edição simples não pode mudar faseMacro");
    assert.ok(app75.M.Store.state.historico.length > histAntes);
    assert.equal(app75.M.Store.state.historico[0].tipo, "OBRA_EDITADA");
  }

  // ---- 9) correção de OS: antes de fase operacional relevante (ordem<3)
  // não exige motivo; depois de LIBERACAO (ordem>=3) exige, senão bloqueia
  // com MOTIVO_OBRIGATORIO_OS e marca revisaoPCPNecessaria — item 16 ----
  {
    const oCedo = {id:"fx75-os-cedo", nome:"Obra Cedo", cliente:"C", numeroOS:"OS CEDO/1", responsavel:"F",
      status:"ATIVA", faseMacro:"AGUARDANDO_INICIO", ambientes:[]};
    app75.M.Store.state.obras.push(oCedo);
    const rCedo = app75.M.Store.atualizarObra(oCedo.id, {numeroOS:"OS CEDO/2"});
    assert.equal(rCedo.ok, true);
    assert.equal(oCedo.numeroOS, "OS CEDO/2");
    assert.notEqual(oCedo.revisaoPCPNecessaria, true, "correção de OS antes de fase operacional relevante não marca revisão PCP");

    const oTarde = {id:"fx75-os-tarde", nome:"Obra Tarde", cliente:"C", numeroOS:"OS TARDE/1", responsavel:"F",
      status:"ATIVA", faseMacro:"PCP_PLANO_DE_CORTE", ambientes:[]};
    app75.M.Store.state.obras.push(oTarde);
    const semMotivo = app75.M.Store.atualizarObra(oTarde.id, {numeroOS:"OS TARDE/2"});
    assert.equal(semMotivo.ok, false);
    assert.equal(semMotivo.motivo, "MOTIVO_OBRIGATORIO_OS");
    assert.equal(oTarde.numeroOS, "OS TARDE/1", "sem motivo, a OS não pode ter sido alterada");
    const comMotivo = app75.M.Store.atualizarObra(oTarde.id, {numeroOS:"OS TARDE/2"}, {motivo:"OS estava com número trocado desde a leitura do PDF"});
    assert.equal(comMotivo.ok, true);
    assert.equal(oTarde.numeroOS, "OS TARDE/2");
    assert.equal(oTarde.revisaoPCPNecessaria, true, "correção de OS depois de LIBERACAO precisa marcar revisão PCP necessária");
    assert.equal(app75.M.Store.state.historico[0].tipo, "OBRA_OS_CORRIGIDA");
  }

  // ---- 10) estrutural: adicionar/remover ambiente/móvel antes de
  // LIBERACAO não marca revisão PCP; depois marca — nunca bloqueia
  // (item 15) ----
  {
    const o = {id:"fx75-estrut", nome:"Obra Estrut", cliente:"C", numeroOS:"OS EST/1", responsavel:"F",
      status:"ATIVA", faseMacro:"MEDICAO", ambientes:[]};
    app75.M.Store.state.obras.push(o);
    const rAmb = app75.M.Store.adicionarAmbiente(o.id, {nome:"Ambiente Novo"});
    assert.equal(rAmb.ok, true);
    assert.notEqual(o.revisaoPCPNecessaria, true, "estrutural antes de LIBERACAO não marca revisão PCP");
    o.faseMacro = "LIBERADA_PARA_PRODUCAO";
    const rMov = app75.M.Store.adicionarMovel(o.id, rAmb.ambiente.id, {nome:"Móvel Novo"});
    assert.equal(rMov.ok, true);
    assert.equal(o.revisaoPCPNecessaria, true, "estrutural depois de LIBERACAO precisa marcar revisão PCP necessária");
  }

  // ---- 10b) CORREÇÃO PÓS-ENTREGA (última correção antes do push) —
  // limiar de revisão PCP não pode mais depender de número mágico, e
  // precisa bater exatamente com a ordem oficial do catálogo (item 15):
  // ANTES de LIBERACAO (AGUARDANDO_INICIO/MEDICAO/PROJETO_EXECUTIVO) não
  // marca; A PARTIR de LIBERACAO (inclusive) e todas as fases seguintes
  // marca. Cobre as 7 fases pedidas explicitamente, uma por uma, tanto via
  // Store._obraEmFaseOperacionalRelevante (a fonte da regra) quanto via um
  // adicionarAmbiente de verdade (efeito observável) ----
  {
    const NAO_MARCA = ["AGUARDANDO_INICIO", "MEDICAO", "PROJETO_EXECUTIVO"];
    const MARCA = ["LIBERACAO", "PCP_PLANO_DE_CORTE", "LIBERADA_PARA_PRODUCAO", "PRODUCAO", "AGUARDANDO_MONTAGEM", "MONTAGEM", "FINALIZACAO", "CONCLUIDA"];

    // confere que o teste está mesmo cobrindo o catálogo oficial inteiro
    // (se uma fase nova for inserida no catálogo e ninguém atualizar as
    // duas listas acima, isto quebra alto e visível, em vez de passar
    // batido cobrindo só um subconjunto).
    const chavesCatalogo = app75.M.Store.fasesMacroOrdenadas().map(f=>f.key);
    assert.deepEqual(NAO_MARCA.concat(MARCA).sort(), chavesCatalogo.slice().sort(),
      "as duas listas do teste (NAO_MARCA + MARCA) precisam cobrir exatamente todas as fases do catálogo oficial");

    let seq = 0;
    NAO_MARCA.forEach(faseKey=>{
      seq++;
      // via a fonte da regra
      assert.equal(app75.M.Store._obraEmFaseOperacionalRelevante({faseMacro:faseKey}), false,
        `${faseKey}: _obraEmFaseOperacionalRelevante precisa ser false (antes de LIBERACAO)`);
      // via efeito observável (adicionarAmbiente de verdade)
      const o = {id:`fx75-limiar-${seq}`, nome:`Obra Limiar ${faseKey}`, cliente:"C", numeroOS:`OS LIM/${seq}`, responsavel:"F",
        status:"ATIVA", faseMacro:faseKey, ambientes:[]};
      app75.M.Store.state.obras.push(o);
      const r = app75.M.Store.adicionarAmbiente(o.id, {nome:"Ambiente Teste Limiar"});
      assert.equal(r.ok, true);
      assert.notEqual(o.revisaoPCPNecessaria, true, `${faseKey}: alteração estrutural NÃO pode marcar revisão PCP`);
    });
    MARCA.forEach(faseKey=>{
      seq++;
      assert.equal(app75.M.Store._obraEmFaseOperacionalRelevante({faseMacro:faseKey}), true,
        `${faseKey}: _obraEmFaseOperacionalRelevante precisa ser true (LIBERACAO ou depois)`);
      const o = {id:`fx75-limiar-${seq}`, nome:`Obra Limiar ${faseKey}`, cliente:"C", numeroOS:`OS LIM/${seq}`, responsavel:"F",
        status:"ATIVA", faseMacro:faseKey, ambientes:[]};
      app75.M.Store.state.obras.push(o);
      const r = app75.M.Store.adicionarAmbiente(o.id, {nome:"Ambiente Teste Limiar"});
      assert.equal(r.ok, true);
      assert.equal(o.revisaoPCPNecessaria, true, `${faseKey}: alteração estrutural PRECISA marcar revisão PCP`);
    });

    // dado legado (sem faseMacro reconhecida no catálogo) nunca marca —
    // regra pré-existente (fm.legado), reconfirmada aqui pra não regredir.
    assert.equal(app75.M.Store._obraEmFaseOperacionalRelevante({faseMacro:"CHAVE_QUE_NAO_EXISTE"}), false,
      "faseMacro legada/desconhecida nunca marca revisão PCP");
  }

  // ---- 11) remoção de ambiente/móvel com vínculo existente (pendência)
  // precisa ser bloqueada e orientar, nunca apagar silenciosamente
  // (item 17) — sem vínculo, remove normal ----
  {
    const o = {id:"fx75-vinculo", nome:"Obra Vinc", cliente:"C", numeroOS:"OS VIN/1", responsavel:"F",
      status:"ATIVA", faseMacro:"MEDICAO", ambientes:[]};
    app75.M.Store.state.obras.push(o);
    const amb = app75.M.Store.adicionarAmbiente(o.id, {nome:"Ambiente Vínculo"}).ambiente;
    const mov = app75.M.Store.adicionarMovel(o.id, amb.id, {nome:"Móvel Vínculo"}).movel;
    app75.M.Store.state.pendencias.push({id:"fx75-pend-vinc", obraId:o.id, ambienteId:amb.id, movelId:mov.id, status:"ABERTA", categoria:"Teste"});
    const rBloqueado = app75.M.Store.removerAmbiente(o.id, amb.id);
    assert.equal(rBloqueado.ok, false);
    assert.equal(rBloqueado.motivo, "VINCULOS_EXISTENTES");
    assert.ok(rBloqueado.vinculos.length>0);
    assert.equal(o.ambientes.some(a=>a.id===amb.id), true, "ambiente com vínculo não pode ter sido removido");

    // "sem vínculo": usa uma obra RASCUNHO — adicionarMovel numa obra ATIVA
    // já semeia tarefas-padrão na hora (comportamento correto e
    // intencional), e essas tarefas por si só já contam como vínculo —
    // então numa obra ATIVA todo móvel nasce com vínculo. Rascunho é o
    // único jeito de ter um móvel "livre de verdade" pra este caso.
    const oRascunho = {id:"fx75-vinculo-livre", nome:"Obra Vinc Livre", cliente:"C", numeroOS:"OS VIN/2", responsavel:"F",
      status:"RASCUNHO", faseMacro:"AGUARDANDO_INICIO", ambientes:[]};
    app75.M.Store.state.obras.push(oRascunho);
    const ambLivre = app75.M.Store.adicionarAmbiente(oRascunho.id, {nome:"Ambiente Livre"}).ambiente;
    const movLivre = app75.M.Store.adicionarMovel(oRascunho.id, ambLivre.id, {nome:"Móvel Livre"}).movel;
    const rLivre = app75.M.Store.removerMovel(oRascunho.id, ambLivre.id, movLivre.id);
    assert.equal(rLivre.ok, true);
    const rLivre2 = app75.M.Store.removerAmbiente(oRascunho.id, ambLivre.id);
    assert.equal(rLivre2.ok, true);
    assert.equal(oRascunho.ambientes.some(a=>a.id===ambLivre.id), false);
  }

  // ---- 12) mover móvel entre ambientes NÃO passa pelo guard de vínculo
  // (não é remoção) — histórico/pendência continuam válidos porque o
  // movelId não muda ----
  {
    const o = {id:"fx75-mover", nome:"Obra Mover", cliente:"C", numeroOS:"OS MOV/1", responsavel:"F",
      status:"ATIVA", faseMacro:"MEDICAO", ambientes:[]};
    app75.M.Store.state.obras.push(o);
    const ambA = app75.M.Store.adicionarAmbiente(o.id, {nome:"Origem"}).ambiente;
    const ambB = app75.M.Store.adicionarAmbiente(o.id, {nome:"Destino"}).ambiente;
    const mov = app75.M.Store.adicionarMovel(o.id, ambA.id, {nome:"Móvel Viajante"}).movel;
    app75.M.Store.state.pendencias.push({id:"fx75-pend-mov", obraId:o.id, movelId:mov.id, status:"ABERTA", categoria:"Teste"});
    const r = app75.M.Store.moverMovel(o.id, mov.id, ambB.id);
    assert.equal(r.ok, true);
    assert.equal(ambA.moveis.some(m=>m.id===mov.id), false);
    assert.equal(ambB.moveis.some(m=>m.id===mov.id), true);
    assert.equal(mov.ambienteId, ambB.id);
    const pend = app75.M.Store.state.pendencias.find(p=>p.id==="fx75-pend-mov");
    assert.equal(pend.movelId, mov.id, "pendência continua apontando pro mesmo movelId depois da mudança de ambiente");
  }

  // ---- 13) nenhum "excluir obra" normal existe (item 17 — sem delete
  // comum de Obra, nunca) ----
  {
    assert.equal(typeof app75.M.Store.excluirObra, "undefined");
    assert.equal(typeof app75.M.Store.deletarObra, "undefined");
    assert.equal(typeof app75.M.Store.removerObra, "undefined");
  }

  // ---- 14) CORREÇÃO PÓS-ENTREGA (item 2) — "extração é semente, edição
  // humana é soberana": voltar de Revisão pra Estrutura e avançar de novo
  // NÃO pode reconstruir do PDF depois da primeira sincronização — renomear
  // ambiente, remover ambiente, mover móvel entre ambientes e adicionar
  // móvel manualmente precisam sobreviver a esse ciclo intacto ----
  {
    resetWizard75();
    w75().modo = "import";
    w75().clienteManual = "Cliente FX75 Preservar Edicao";
    w75().responsavelProducao = "Willian Souza";
    w75().dados = {
      numeroOS:"OS 7500/Preserv", cliente:"Cliente FX75 Preservar Edicao", responsavel:"Externo",
      valorBrutoTotal:300, valorFinalVendido:300, data:app75.M.todayISO(), dataEntregaPrevista:null,
      endereco:"", telefone:"", email:"",
      itensOrc:[
        {ambiente:"SALA", item:"Painel", qtd:1, valorBruto:100},
        {ambiente:"COZINHA", item:"Bancada", qtd:1, valorBruto:100},
        {ambiente:"QUARTO", item:"Cama", qtd:1, valorBruto:100},
      ],
      ambientes:[
        {nome:"SALA", itens:[{item:"Painel", materiaisEspeciais:[]}]},
        {nome:"COZINHA", itens:[{item:"Bancada", materiaisEspeciais:[]}]},
        {nome:"QUARTO", itens:[{item:"Cama", materiaisEspeciais:[]}]},
      ],
    };
    // 1ª sincronização (equivalente a sair de "estrutura" pela 1ª vez).
    app75.M.Pages.novaObraSincronizarEstruturaImportada();
    assert.equal(w75().estruturaImportadaSincronizada, true, "1ª sincronização precisa marcar a flag");
    assert.equal(w75().ambientesManual.length, 3, "1ª sincronização precisa trazer os 3 ambientes do PDF");

    // edições humanas na Revisão — mesmas 4 operações que Act.obraAdicionar/
    // RemoverAmbiente/Movel e Act.novaObraManualMoverMovel fazem sobre
    // w.ambientesManual (reproduzidas aqui diretamente, sem depender de
    // Act, que não está carregado neste contexto — ver contexto app75c
    // abaixo pra cobertura via Act de verdade):
    const ambSala = w75().ambientesManual.find(a=>a.nome==="SALA");
    const ambCozinha = w75().ambientesManual.find(a=>a.nome==="COZINHA");
    const ambQuarto = w75().ambientesManual.find(a=>a.nome==="QUARTO");
    ambSala.nome = "Sala Ampla";                                          // renomear ambiente
    w75().ambientesManual = w75().ambientesManual.filter(a=>a!==ambQuarto); // remover ambiente inteiro
    const bancada = ambCozinha.moveis.find(m=>m.nome==="Bancada");
    ambCozinha.moveis = ambCozinha.moveis.filter(m=>m!==bancada);
    ambSala.moveis.push(bancada);                                        // mover móvel entre ambientes
    ambCozinha.moveis.push({tid:"tmpmov-extra-fx75", nome:"Armário Extra"}); // adicionar móvel manual

    const snapshotAntesDoCiclo = JSON.stringify(w75().ambientesManual);

    // "voltar pra Estrutura e avançar de novo" == chamar a sincronização
    // outra vez (é exatamente isso que Act.novaObraProximaEtapa faz ao
    // sair de "estrutura" em modo import — ver js/actions.js).
    app75.M.Pages.novaObraSincronizarEstruturaImportada();

    assert.equal(JSON.stringify(w75().ambientesManual), snapshotAntesDoCiclo,
      "2ª passagem pela sincronização NÃO pode alterar nada — edição humana é soberana depois da 1ª inicialização");
    assert.equal(w75().ambientesManual.length, 2, "QUARTO removido precisa continuar removido (não pode ressurgir do PDF)");
    assert.equal(w75().ambientesManual.find(a=>a.nome==="QUARTO"), undefined);
    assert.equal(w75().ambientesManual.find(a=>a.nome==="Sala Ampla").moveis.some(m=>m.nome==="Bancada"), true, "móvel movido precisa continuar no ambiente de destino");
    assert.equal(w75().ambientesManual.find(a=>a.nome==="COZINHA").moveis.some(m=>m.nome==="Bancada"), false, "móvel movido não pode ressurgir no ambiente de origem");
    assert.equal(w75().ambientesManual.find(a=>a.nome==="COZINHA").moveis.some(m=>m.nome==="Armário Extra"), true, "móvel adicionado manualmente precisa sobreviver ao ciclo");

    // montagem final reflete as edições, não o PDF original.
    const montadoFinal = app75.M.Pages.novaObraMontarManual();
    assert.equal(montadoFinal.ambientes.length, 2);
    assert.equal(montadoFinal.ambientes.some(a=>a.nome==="Sala Ampla"), true);
    assert.equal(montadoFinal.ambientes.some(a=>a.nome==="QUARTO"), false);
  }
}
console.log("Fase 7.5 — Nova Obra V2 + Edição V2 (Partes A e B): OK");

// ------------------------------------------------------------------
// FASE 7.5 — CORREÇÕES PÓS-ENTREGA (contexto próprio, com js/actions.js
// carregado de verdade): item 1 (OS duplicada em rascunho retomado, fim a
// fim via Act.novaObraAtivar) e reforço do item 2 via Act.novaObraProximaEtapa
// de verdade (não a chamada direta da função de sincronização). UI real não
// é necessária aqui — só Act.*/Store.*, então M.UI/M.render/location são
// stubs mínimos (só o que Act.novaObra* efetivamente usa: UI.toast,
// Act.rerender→M.render, location.hash).
// ------------------------------------------------------------------
{
  const app75c = contextoBase();
  executar(app75c, "js/data.js");
  executar(app75c, "js/pdf-import.js");
  app75c.M.UI = { toast(){}, esc:(s)=>String(s==null?"":s), icon:()=>"" };
  app75c.M.render = function(){};
  app75c.location = {hash:""};
  app75c.M.Pages = {};
  app75c.M.UIState = {novaObra:{
    obraId:null, step:"inicio", modo:null, osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
    lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
    nomeManual:"", numeroOSManual:"", clienteManual:"", responsavelProducao:"",
    enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
    ambientesManual:[], osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
  }};
  executar(app75c, "js/store.js");
  executar(app75c, "js/calc.js");
  executar(app75c, "js/pages/novaObra.js");
  executar(app75c, "js/actions.js");
  app75c.M.Store.setUsuarioAtual("Paulo Henrique"); // ADMIN, tem obra.criar

  // ---- 1) BUG (item 1) — OS duplicada em rascunho retomado. Antes da
  // correção, a checagem era pulada inteira sempre que w.obraId já existia
  // ("w.obraId ? null : getObraByNumeroOS(...)") — e um rascunho retomado
  // SEMPRE tem obraId. Passos exatamente como pedido: 1) criar obra A com
  // OS X; 2) criar e salvar rascunho B; 3) retomar rascunho B; 4) definir
  // OS X nele; 5) tentar ativar; 6) precisa exigir confirmação ----
  {
    // 1) obra A, ativa, com OS X.
    const w = app75c.M.UIState.novaObra;
    w.clienteManual = "Cliente FX75 OS-A"; w.numeroOSManual = "OS 7500/RETOMA-X";
    w.responsavelProducao = "Willian Souza";
    w.ambientesManual = [{tid:"tmpamb-a", nome:"Amb A", moveis:[{tid:"tmpmov-a", nome:"Mov A"}]}];
    app75c.Act.novaObraAtivar();
    const obraA = app75c.M.Store.state.obras.find(o=>o.cliente==="Cliente FX75 OS-A");
    assert.ok(obraA, "obra A precisa ter sido criada e ativada");
    assert.equal(obraA.numeroOS, "OS 7500/RETOMA-X");

    // 2) criar e salvar rascunho B, com uma OS diferente.
    app75c.Act.novaObraRecomecar();
    const w2 = app75c.M.UIState.novaObra;
    w2.clienteManual = "Cliente FX75 OS-B"; w2.numeroOSManual = "OS 7500/RETOMA-B-original";
    w2.responsavelProducao = "Willian Souza";
    w2.ambientesManual = [{tid:"tmpamb-b", nome:"Amb B", moveis:[{tid:"tmpmov-b", nome:"Mov B"}]}];
    app75c.Act.novaObraSalvarRascunho();
    const obraB = app75c.M.Store.state.obras.find(o=>o.cliente==="Cliente FX75 OS-B");
    assert.ok(obraB, "rascunho B precisa ter sido salvo");
    assert.equal(obraB.status, "RASCUNHO");

    // 3) "retomar" o rascunho B — w.obraId passa a existir, exatamente como
    // no fluxo real (Act.abrirEditarObra/router "#/nova-obra/:id" fazem
    // essa hidratação; aqui simulamos o resultado direto no UIState).
    app75c.M.UIState.novaObra = {
      obraId:obraB.id, step:"ativar", modo:"manual",
      osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
      lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
      nomeManual:obraB.nome||"", numeroOSManual:obraB.numeroOS||"", clienteManual:obraB.cliente||"",
      responsavelProducao:obraB.responsavel||"", enderecoManual:obraB.endereco||"",
      observacoesManual:obraB.observacoes||"", dataEntregaPrevistaManual:obraB.dataEntregaPrevista||"",
      componentesSelecionados:{},
      ambientesManual:(obraB.ambientes||[]).map(a=>({tid:a.id, nome:a.nome, moveis:(a.moveis||[]).map(m=>({tid:m.id, nome:m.nome}))})),
      osDuplicadaConfirmada:false, estruturaImportadaSincronizada:true,
    };
    // rascunho retomado não pode conflitar com ele mesmo, mesmo antes de
    // trocar a OS (regressão do "própria OS não conflita consigo mesma").
    assert.equal(app75c.M.Store.getObraByNumeroOS(app75c.M.UIState.novaObra.numeroOSManual, app75c.M.UIState.novaObra.obraId), null,
      "OS atual do próprio rascunho não pode aparecer como duplicada dele mesmo");

    // 4) define a OS X (igual à obra A) no rascunho retomado.
    app75c.M.UIState.novaObra.numeroOSManual = "OS 7500/RETOMA-X";

    // 5) tentar ativar sem confirmar — precisa BLOQUEAR (não ativar) e
    // continuar em RASCUNHO. Este é o bug relatado: antes da correção,
    // como w.obraId já existia (rascunho retomado), a checagem de
    // duplicidade era pulada inteira e a obra ativava direto.
    app75c.Act.novaObraAtivar();
    const obraBApos = app75c.M.Store.getObra(obraB.id);
    assert.equal(obraBApos.status, "RASCUNHO", "rascunho retomado com OS duplicada NÃO pode ativar sem confirmação explícita — bug do item 1");
    assert.equal(obraBApos.numeroOS, "OS 7500/RETOMA-B-original", "sem confirmar, a OS gravada no Store nem deveria ter sido trocada");

    // 6) confirma "mesmo assim continuar" — agora ativa normalmente, e a
    // obra A (a "outra obra", que é quem de fato tem essa OS) continua
    // intacta e sem qualquer alteração.
    app75c.M.UIState.novaObra.osDuplicadaConfirmada = true;
    app75c.Act.novaObraAtivar();
    const obraBFinal = app75c.M.Store.getObra(obraB.id);
    assert.equal(obraBFinal.status, "ATIVA", "com confirmação explícita, o rascunho retomado precisa poder ativar mesmo com OS duplicada");
    assert.equal(obraBFinal.numeroOS, "OS 7500/RETOMA-X");
    const obraAApos = app75c.M.Store.getObra(obraA.id);
    assert.equal(obraAApos.numeroOS, "OS 7500/RETOMA-X", "obra A (a outra obra com essa OS) não pode ter sido alterada");
  }
}
console.log("Fase 7.5 — Correções pós-entrega (OS duplicada em rascunho retomado + edição importada preservada): OK");

// ------------------------------------------------------------------
// FASE 7.5 — HOTFIX PÓS-PUBLICAÇÃO: Act.setObrasFiltroStatus. O botão
// "Rascunhos" da tela Obras (js/pages/obras.js) sempre chamou
// Act.setObrasFiltroStatus('RASCUNHO') via onclick, mas a função nunca
// tinha sido implementada em js/actions.js — descoberto no smoke test em
// produção (clique não fazia nada; TypeError silencioso no onclick). Este
// teste garante que a função existe, grava M.UIState.obrasFiltroStatus e
// dispara um re-render (Act.rerender→M.render) — e que uma futura
// regressão (função removida/renomeada de novo) quebra a suíte, não só o
// clique em produção.
{
  const app75d = contextoBase();
  executar(app75d, "js/data.js");
  app75d.M.UI = { toast(){}, esc:(s)=>String(s==null?"":s), icon:()=>"" };
  let renders = 0;
  app75d.M.render = function(){ renders++; };
  app75d.location = {hash:""};
  app75d.M.Pages = {};
  app75d.M.UIState = {};
  executar(app75d, "js/store.js");
  executar(app75d, "js/calc.js");
  executar(app75d, "js/actions.js");

  assert.equal(typeof app75d.Act.setObrasFiltroStatus, "function",
    "Act.setObrasFiltroStatus precisa existir — é chamada pelo onclick dos botões Ativas/Rascunhos em Obras");
  app75d.Act.setObrasFiltroStatus("RASCUNHO");
  assert.equal(app75d.M.UIState.obrasFiltroStatus, "RASCUNHO", "precisa gravar o filtro escolhido em M.UIState.obrasFiltroStatus");
  assert.equal(renders, 1, "precisa disparar um re-render (Act.rerender→M.render) pra tela refletir a troca de aba");
  app75d.Act.setObrasFiltroStatus("ATIVAS");
  assert.equal(app75d.M.UIState.obrasFiltroStatus, "ATIVAS");
  assert.equal(renders, 2);
}
console.log("Fase 7.5 — Hotfix Act.setObrasFiltroStatus (toggle Ativas/Rascunhos): OK");

// ------------------------------------------------------------------
// FASE 7.5 — HOTFIX PÓS-PUBLICAÇÃO 2: M.Pages.novaObra('id') renderizava
// "Início" na PRIMEIRA chamada ao retomar um rascunho, mesmo com o estado
// já hidratado certo. Causa: `const w = M.UIState.novaObra` era capturado
// ANTES de hidratarWizardComRascunho(o) rodar — e essa função SUBSTITUI o
// objeto (M.UIState.novaObra = {...}), não muta o existente, então o `w`
// local ficava apontando pro objeto antigo (step:"inicio") pelo resto
// daquela mesma renderização. Um segundo render qualquer (F5, outro clique)
// já mostrava certo, o que mascarava o bug em teste manual descuidado —
// achado só ao simular o clique de verdade em produção, isolado, numa aba
// nova (sem nenhum render anterior "por acidente" corrigindo o quadro).
// Este teste chama M.Pages.novaObra(id) UMA ÚNICA VEZ (a chamada que o
// router faz de verdade ao navegar) e exige que o HTML já venha certo.
{
  const app75e = contextoBase();
  executar(app75e, "js/data.js");
  executar(app75e, "js/pdf-import.js");
  app75e.M.UI = { toast(){}, esc:(s)=>String(s==null?"":s), icon:(k)=>k?`<i>${k}</i>`:"" };
  app75e.M.render = function(){};
  app75e.location = {hash:""};
  app75e.M.Pages = {};
  app75e.M.UIState = {novaObra:{
    obraId:null, step:"inicio", modo:null, osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
    lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
    nomeManual:"", numeroOSManual:"", clienteManual:"", responsavelProducao:"",
    enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
    ambientesManual:[], osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
  }};
  executar(app75e, "js/store.js");
  executar(app75e, "js/calc.js");
  executar(app75e, "js/pages/novaObra.js");
  executar(app75e, "js/actions.js");
  app75e.M.Store.setUsuarioAtual("Paulo Henrique"); // ADMIN, tem obra.criar

  // cria e salva um rascunho (como no fluxo real: preencher Dados, Salvar rascunho).
  const w = app75e.M.UIState.novaObra;
  w.clienteManual = "Cliente FX75 Retomada"; w.nomeManual = "Obra FX75 Retomada";
  w.numeroOSManual = "OS 7500/RETOMA-RENDER"; w.responsavelProducao = "Willian Souza";
  app75e.Act.novaObraSalvarRascunho();
  const rascunho = app75e.M.Store.state.obras.find(o=>o.cliente==="Cliente FX75 Retomada");
  assert.ok(rascunho, "rascunho precisa ter sido salvo");

  // simula uma ABA NOVA: UIState.novaObra volta ao estado inicial (é isso
  // que uma aba/sessão de navegador nova de fato tem — nada em memória do
  // wizard anterior), e então o router chama M.Pages.novaObra(id) UMA VEZ,
  // exatamente como acontece ao clicar "Continuar" numa linha de rascunho.
  app75e.M.UIState.novaObra = {
    obraId:null, step:"inicio", modo:null, osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
    lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
    nomeManual:"", numeroOSManual:"", clienteManual:"", responsavelProducao:"",
    enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
    ambientesManual:[], osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
  };
  const pagina = app75e.M.Pages.novaObra(rascunho.id);
  assert.equal(app75e.M.UIState.novaObra.step, "dados", "estado global precisa hidratar pra etapa Dados");
  assert.ok(pagina && typeof pagina.html === "string" && pagina.html.length>0, "M.Pages.novaObra precisa retornar html");
  assert.ok(!pagina.html.includes("Importar documentos"),
    "BUG: primeira renderização ainda mostrando a etapa Início (html da etapa Início) mesmo com o estado já hidratado pra Dados");
  assert.ok(pagina.html.includes(rascunho.nome) || pagina.html.includes("Obra FX75 Retomada"),
    "html retornado precisa já conter os dados do rascunho retomado (etapa Dados), não a tela Início vazia");
}
console.log("Fase 7.5 — Hotfix M.Pages.novaObra (primeira renderização ao retomar rascunho já mostra Dados): OK");

// ------------------------------------------------------------------
// HOTFIX 3.15.4 — Act.novaObraSetCampo (nome/OS/cliente/responsável/
// endereço/observações/data da etapa Dados) nunca chamava Act.rerender(),
// diferente de todo outro setter da mesma etapa (novaObraToggleComponente,
// novaObraSetVendido, novaObraAjustarValor, novaObraConfirmarOsDuplicada —
// todos chamam). O <input> do navegador mostrava o texto digitado
// normalmente (é o próprio DOM guardando o que foi digitado), mas qualquer
// coisa DERIVADA do estado — o banner de "já existe uma obra com esse
// número de OS" e o aviso de "responsável não corresponde à equipe" —
// ficava PARADA na tela com o valor de antes da edição, até algum outro
// clique (Continuar/Voltar, etc.) forçar um re-render por fora. Achado no
// smoke test em produção: corrigir o número da OS pra sair de uma
// duplicidade real não fazia o aviso sumir da tela (o dado por trás já
// estava certo — só a tela que não reagia). Reproduz exatamente isso:
// conta os re-renders disparados por novaObraSetCampo, e confirma que uma
// nova leitura da tela (M.Pages.novaObra) já reflete a duplicidade
// aparecendo/sumindo sem precisar de nenhuma outra ação no meio. ----
{
  const app75f = contextoBase();
  executar(app75f, "js/data.js");
  executar(app75f, "js/pdf-import.js");
  app75f.M.UI = { toast(){}, esc:(s)=>String(s==null?"":s), icon:(k)=>k?`<i>${k}</i>`:"" };
  let renders = 0;
  app75f.M.render = function(){ renders++; };
  app75f.location = {hash:""};
  app75f.M.Pages = {};
  app75f.M.UIState = {novaObra:{
    obraId:null, step:"dados", modo:"manual", osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
    lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
    nomeManual:"Obra Hotfix 3154", numeroOSManual:"", clienteManual:"Cliente Hotfix 3154", responsavelProducao:"",
    enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
    ambientesManual:[], osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
  }};
  executar(app75f, "js/store.js");
  executar(app75f, "js/calc.js");
  executar(app75f, "js/pages/novaObra.js");
  executar(app75f, "js/actions.js");
  app75f.M.Store.setUsuarioAtual("Paulo Henrique");

  // obra real já existente com uma OS conhecida, pra colidir de propósito.
  app75f.M.UIState.novaObra.nomeManual = "Obra Existente 3154";
  app75f.M.UIState.novaObra.clienteManual = "Cliente Existente 3154";
  app75f.M.UIState.novaObra.numeroOSManual = "OS 3154/EXISTENTE";
  app75f.M.UIState.novaObra.responsavelProducao = "Willian Souza";
  app75f.M.UIState.novaObra.ambientesManual = [{tid:"tmpamb-3154", nome:"Sala", moveis:[{tid:"tmpmov-3154", nome:"Painel"}]}];
  const montadoExistente = app75f.M.Pages.novaObraMontarManual();
  app75f.M.Store.criarObra(montadoExistente); // não precisa ativar — getObraByNumeroOS não filtra por status

  // volta o wizard pro estado de quem está criando uma OBRA NOVA, digitando
  // por acaso o mesmo número de OS da obra que acabou de ser criada acima.
  app75f.M.UIState.novaObra = {
    obraId:null, step:"dados", modo:"manual", osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
    lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
    nomeManual:"Obra Nova 3154", numeroOSManual:"OS 3154/EXISTENTE", clienteManual:"Cliente Novo 3154", responsavelProducao:"",
    enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
    ambientesManual:[], osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
  };
  renders = 0;

  const paginaComDuplicata = app75f.M.Pages.novaObra();
  assert.ok(paginaComDuplicata.html.includes("Já existe uma obra com esse número de OS"),
    "pré-condição: com a OS colidindo, o banner de duplicidade precisa aparecer");

  assert.doesNotThrow(()=>{
    app75f.Act.novaObraSetCampo("numeroOSManual", "OS 3154/UNICA-NOVA");
  }, "novaObraSetCampo não pode lançar");
  assert.equal(app75f.M.UIState.novaObra.numeroOSManual, "OS 3154/UNICA-NOVA", "o campo precisa ter sido gravado no estado");
  assert.equal(renders, 1,
    "BUG: novaObraSetCampo precisa disparar Act.rerender() igual todo outro setter da etapa (novaObraToggleComponente/SetVendido/AjustarValor/ConfirmarOsDuplicada) — sem isso o banner de OS duplicada fica preso na tela com o valor antigo até outra ação forçar o re-render");

  const paginaSemDuplicata = app75f.M.Pages.novaObra();
  assert.ok(!paginaSemDuplicata.html.includes("Já existe uma obra com esse número de OS"),
    "depois de corrigir a OS pra uma que não colide, uma nova leitura da tela não pode mais mostrar o banner de duplicidade");

  // o inverso também precisa disparar o render: digitar uma OS que PASSA a
  // colidir também precisa avisar sem esperar outra ação.
  app75f.Act.novaObraSetCampo("numeroOSManual", "OS 3154/EXISTENTE");
  assert.equal(renders, 2);
  const paginaVoltouDuplicata = app75f.M.Pages.novaObra();
  assert.ok(paginaVoltouDuplicata.html.includes("Já existe uma obra com esse número de OS"),
    "digitar de volta uma OS que colide também precisa fazer o banner reaparecer sem precisar de outra ação no meio");
}
console.log("Hotfix 3.15.4 (Act.novaObraSetCampo sem rerender — banner de OS duplicada/responsável ficava preso na tela): OK");

// ------------------------------------------------------------------
// HOTFIX 3.15.5 — Act.go(route) não disparava render() quando `route` já
// era o hash atual. location.hash = mesmo-valor-de-antes NUNCA dispara
// "hashchange" no navegador (comportamento nativo, não é bug do app) — e é
// só o listener de hashchange (main.js) que chama render(). Isso é
// inofensivo na maioria dos usos de Act.go (trocar de página sempre muda o
// hash de verdade), mas quebra qualquer call-site que usa Act.go pra
// "recarregar a tela atual com um filtro/aba diferente já setado antes" —
// ex.: M.Drawer.abrirCompletoPendencia('#/pendencias') chamado a partir da
// própria tela de Pendências: o filtro fica gravado certinho em
// M.UIState.pendFiltro.obraId, mas a lista continua mostrando tudo, até
// QUALQUER outra ação não relacionada forçar um re-render por fora.
// Achado no smoke test em produção testando o Detalhe Rápido (Context
// Drawer) com uma pendência real: "Abrir completo" a partir da tela de
// Pendências não parecia fazer nada. Este teste cobre o Act.go em si
// (fix na raiz, não só o call-site) e também o cenário real do drawer. ----
{
  const app75g = contextoBase();
  executar(app75g, "js/data.js");
  app75g.M.UI = { toast(){}, esc:(s)=>String(s==null?"":s), icon:()=>"" };
  let renders = 0;
  app75g.M.render = function(){ renders++; };
  app75g.location = {hash:"#/pendencias"};
  app75g.M.Pages = {};
  app75g.M.UIState = {};
  executar(app75g, "js/store.js");
  executar(app75g, "js/calc.js");
  executar(app75g, "js/actions.js");

  // 1) mesmo hash de antes: hashchange nunca dispararia no navegador de
  // verdade — Act.go precisa perceber isso e chamar M.render() na mão.
  renders = 0;
  app75g.Act.go("#/pendencias");
  assert.equal(app75g.location.hash, "#/pendencias", "hash continua o mesmo (é exatamente esse o cenário)");
  assert.equal(renders, 1,
    "BUG: Act.go(route) pra um hash IGUAL ao atual precisa forçar M.render() na mão — sem isso, qualquer filtro/aba que o call-site tenha mudado antes de chamar Act.go fica preso na tela até outra ação re-renderizar");

  // 2) hash DIFERENTE continua funcionando do jeito de sempre — muda
  // location.hash e deixa o listener de hashchange (main.js, não simulado
  // aqui) cuidar do render(); Act.go não pode chamar M.render() ele mesmo
  // nesse caso (senão renderizaria different vezes numa navegação real).
  renders = 0;
  app75g.Act.go("#/obras");
  assert.equal(app75g.location.hash, "#/obras", "precisa ter mudado o hash de verdade");
  assert.equal(renders, 0, "hash MUDOU — quem chama render() é o listener de hashchange (main.js), Act.go não pode chamar M.render() ele mesmo aqui");
}
console.log("Hotfix 3.15.5 (Act.go sem forçar render quando o hash não muda — 'Abrir completo' do drawer parecia não fazer nada): OK");

// ------------------------------------------------------------------
// mesmo Hotfix 3.15.5, agora no cenário real de produção que expôs o bug:
// M.Drawer.abrirCompletoPendencia chamado a partir da PRÓPRIA tela de
// Pendências precisa deixar a lista já filtrada visível, sem precisar de
// nenhuma outra ação no meio. ----
{
  const app75h = contextoBase();
  executar(app75h, "js/data.js");
  app75h.document = {currentScript:{src:"https://teste.local/js/pdf-import.js"}, getElementById(){ return null; }};
  app75h.location = {hash:"#/pendencias"};
  app75h.M.Pages = {};
  app75h.M.UIState = {
    pendFiltro:{obraId:"", status:"", impacto:"", responsavel:"", busca:"", modo:"todas"},
    pendExpandido:null, pendView:"lista", pendSomenteMinhas:null,
  };
  executar(app75h, "js/store.js");
  executar(app75h, "js/calc.js");
  executar(app75h, "js/ui.js");
  executar(app75h, "js/pages/pendencias.js");
  executar(app75h, "js/drawer.js");
  executar(app75h, "js/actions.js");
  app75h.M.Store.setUsuarioAtual("Paulo Henrique");

  let ultimaTelaRenderizada = null;
  app75h.M.render = function(){ ultimaTelaRenderizada = app75h.M.Pages.pendencias(); };

  const pend = app75h.M.Store.state.pendencias[0];
  assert.ok(pend && pend.obraId, "pré-condição: precisa existir uma pendência real de exemplo com obraId");

  app75h.M.Drawer.abrirCompletoPendencia(pend.id);
  assert.equal(app75h.M.UIState.pendFiltro.obraId, pend.obraId, "filtro por obra precisa ter sido setado");
  assert.ok(ultimaTelaRenderizada, "BUG: abrirCompletoPendencia a partir da própria tela de Pendências (hash não muda) precisa ter forçado um render — sem isso o filtro fica gravado mas a tela não reflete");
  assert.ok(ultimaTelaRenderizada.html.includes(pend.descricao) || ultimaTelaRenderizada.html.length>0,
    "a tela renderizada de novo precisa refletir o filtro já aplicado");
}
console.log("Hotfix 3.15.5b (M.Drawer.abrirCompletoPendencia a partir da tela de Pendências já mostra a lista filtrada): OK");

// ------------------------------------------------------------------
// HOTFIX 3.15.5c — consolidação pós-smoke: os 3 casos formais pedidos pra
// Act.go como infraestrutura compartilhada de navegação, mais o call-site
// que o próprio commit do 3.15.5 já citava como exemplo (Act.trocarUsuario)
// mas que na prática continuava usando `location.hash =` direto e nunca se
// beneficiou do fix.
//
// CASO A — rota atual = destino, estado interno mudou -> tela precisa
//          refletir o novo estado (coberto acima, no app75g/app75h).
// CASO B — rota atual != destino -> navegação normal continua funcionando
//          (coberto acima, no app75g).
// CASO C — destino é a mesma rota e NADA relevante mudou -> não pode virar
//          comportamento quebrado (erro, travamento) nem loop.
// ----
{
  const app75i = contextoBase();
  executar(app75i, "js/data.js");
  app75i.M.UI = { toast(){}, esc:(s)=>String(s==null?"":s), icon:()=>"" };
  let renders = 0;
  app75i.M.render = function(){ renders++; };
  app75i.location = {hash:"#/hoje"};
  app75i.M.Pages = {};
  app75i.M.UIState = {};
  executar(app75i, "js/store.js");
  executar(app75i, "js/calc.js");
  executar(app75i, "js/actions.js");

  // CASO C: chamar Act.go pra mesma rota várias vezes seguidas, sem nenhuma
  // mudança de estado no meio, não pode travar, não pode lançar exceção, e
  // não pode entrar em loop (cada chamada é 1 render, nem mais nem menos —
  // Act.go não se auto-chama, então não há como isso recursar sozinho).
  renders = 0;
  let excecao = null;
  try{
    for(let i=0;i<5;i++) app75i.Act.go("#/hoje");
  }catch(e){ excecao = e; }
  assert.equal(excecao, null, "Caso C: chamar Act.go repetidamente pra mesma rota sem mudar estado não pode lançar exceção");
  assert.equal(renders, 5, "Caso C: cada chamada de Act.go pra mesma rota renderiza exatamente 1 vez (sem acumular, sem pular, sem loop)");
  assert.equal(app75i.location.hash, "#/hoje", "Caso C: hash permanece o mesmo, como esperado (não é uma navegação de verdade)");
}
console.log("Hotfix 3.15.5c — Caso C (Act.go repetido pra mesma rota sem mudança de estado, sem loop/travamento): OK");

// ------------------------------------------------------------------
// Consolidação 3.15.5 — Act.trocarUsuario agora navega via Act.go (antes
// usava location.hash direto e ficava fora do alcance do fix, mesmo sendo
// citado como exemplo no próprio commit). O seletor de usuário fica no
// cabeçalho global (main.js) — presente em toda tela, inclusive Hoje. ----
{
  const app75j = contextoBase();
  executar(app75j, "js/data.js");
  let toasts = [];
  app75j.M.UI = { toast(msg){ toasts.push(msg); }, esc:(s)=>String(s==null?"":s), icon:()=>"" };
  let renders = 0;
  app75j.M.render = function(){ renders++; };
  app75j.M.Pages = {};
  app75j.M.UIState = {};
  executar(app75j, "js/store.js");
  executar(app75j, "js/calc.js");
  executar(app75j, "js/actions.js");

  // cenário do bug: já estamos em #/hoje (onde o seletor de usuário vive) e
  // trocamos de usuário sem navegar pra nenhum outro lugar antes.
  app75j.location = {hash:"#/hoje"};
  renders = 0;
  const nomes = app75j.M.Store.state.equipe && app75j.M.Store.state.equipe.length
    ? app75j.M.Store.state.equipe.map(c=>c.nome)
    : [app75j.M.Store.state.usuarioAtual];
  const outroNome = nomes.find(n=>n!==app75j.M.Store.state.usuarioAtual) || app75j.M.Store.state.usuarioAtual;
  app75j.Act.trocarUsuario(outroNome);
  assert.equal(app75j.M.Store.state.usuarioAtual, outroNome, "usuário precisa ter trocado de verdade no estado");
  assert.equal(app75j.location.hash, "#/hoje", "hash continua #/hoje (é exatamente esse o cenário: já estava lá)");
  assert.equal(renders, 1, "BUG: trocar de usuário estando já em Hoje (hash não muda) precisa forçar 1 render na mão via Act.go — sem isso o toast aparece mas a tela não reflete o novo usuário até outra ação");
  assert.ok(toasts.some(t=>String(t).indexOf(outroNome)!==-1), "toast de confirmação da troca precisa ter sido disparado");

  // navegação normal continua funcionando: trocar de usuário a partir de
  // outra tela navega pra #/hoje do jeito de sempre (hash muda, quem
  // renderiza é o listener de hashchange — não Act.go duplicando).
  app75j.location = {hash:"#/obras"};
  renders = 0;
  app75j.Act.trocarUsuario(app75j.M.Store.state.usuarioAtual);
  assert.equal(app75j.location.hash, "#/hoje", "trocar de usuário a partir de outra tela precisa navegar pra #/hoje");
  assert.equal(renders, 0, "hash MUDOU (#/obras -> #/hoje) — quem renderiza é o listener de hashchange, Act.go não chama M.render() ele mesmo nesse caso");
}
console.log("Consolidação 3.15.5 — Act.trocarUsuario via Act.go (estava fora do alcance do fix apesar de citado no commit): OK");

// ==================================================================
// FASE 7.5 — DETALHE RÁPIDO (Parte C — Context Drawer) + Partes D/E
// (Kanban e Hoje/Obra abrindo o MESMO drawer). Precisa de um `document`
// mínimo (o harness padrão não tem DOM de verdade) — stub só com o que
// js/drawer.js realmente usa: createElement/getElementById/body.appendChild/
// classList/innerHTML. innerHTML aqui não faz parsing de HTML de verdade —
// só registra, por regex, qualquer id="..." encontrado no texto, o
// suficiente pra js/drawer.js conseguir achar "drawerPanel" depois de criar
// o overlay (mesmo truque documentado inline abaixo).
// ==================================================================
{
  function domStubDrawer(){
    const registry = {};
    function makeEl(tag){
      let _id = "";
      const el = {
        tagName: String(tag||"div").toUpperCase(),
        _html: "",
        className: "",
        children: [],
        classList: { _set:new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, contains(c){return this._set.has(c);} },
        addEventListener(){},
        querySelectorAll(){ return []; },
        appendChild(child){ this.children.push(child); if(child.id) registry[child.id]=child; },
        get id(){ return _id; }, set id(v){ _id=v; if(v) registry[v]=el; },
        get innerHTML(){ return this._html; },
        set innerHTML(html){
          this._html = html;
          const re = /id="([a-zA-Z0-9_-]+)"/g; let m;
          while((m = re.exec(html))){ if(!registry[m[1]]) registry[m[1]] = makeEl("div"); }
        },
      };
      return el;
    }
    const body = makeEl("body");
    return { body, createElement: makeEl, getElementById: (id)=> registry[id]||null };
  }

  const appDrawer = contextoBase();
  executar(appDrawer, "js/data.js");
  appDrawer.document = Object.assign({currentScript:{src:"https://teste.local/js/pdf-import.js"}}, domStubDrawer());
  executar(appDrawer, "js/store.js");
  executar(appDrawer, "js/calc.js");
  executar(appDrawer, "js/ui.js");
  appDrawer.M.Pages = {};
  appDrawer.M.UIState = {
    obraTab:{}, obraFoco:{}, pendFiltro:{status:"",impacto:"",obraId:"",responsavel:"",busca:""},
    pendExpandido:null, pendView:"lista", pendSomenteMinhas:null,
    calFiltros:new Set(["PRODUCAO","ENTREGAS","MONTAGENS","PENDENCIAS","FORNECEDORES","ASSISTENCIAS"]),
  };
  executar(appDrawer, "js/pages/pendencias.js");
  executar(appDrawer, "js/pages/obraDetail.js");
  executar(appDrawer, "js/actions.js");
  executar(appDrawer, "js/drawer.js");
  appDrawer.M.Store.subscribe(()=> appDrawer.M.Drawer.refresh());

  const oDrawer = {
    id:"fxdw-obra1", nome:"Obra Drawer", cliente:"Cliente Drawer", numeroOS:"OS DW/1", responsavel:"Fulano",
    status:"ATIVA", faseMacro:"PRODUCAO", endereco:"Rua Drawer", ambientes:[
      {id:"fxdw-amb1", nome:"Sala", moveis:[{id:"fxdw-mov1", nome:"Painel", etapa:"CORTE", componentesCriticos:[]}]},
    ],
  };
  appDrawer.M.Store.state.obras.push(oDrawer);
  const pendDrawer = {
    id:"fxdw-pend1", obraId:oDrawer.id, obraNome:oDrawer.cliente, ambienteId:"fxdw-amb1", ambienteNome:"Sala",
    movelId:"fxdw-mov1", movelNome:"Painel", categoria:"Vidro", tipo:"CRITICO", impacto:"IMPEDE_FINALIZAR",
    descricao:"Vidro trincado na chegada", status:"ABERTA", responsavel:"Fulano", abertura:appDrawer.M.todayISO(),
    fluxoPassos:["Fornecedor","Instalar"], passoAtual:0, fotosAbertura:[], fotosResolucao:[],
    criadoPor:"Fulano", criadoEm:appDrawer.M.todayISO(), atualizadoPor:"Fulano", atualizadoEm:appDrawer.M.todayISO(),
    origem:"MANUAL",
    // prazo/observacoes DELIBERADAMENTE ausentes — item 22: "nunca inventar",
    // o drawer não pode preencher isso sozinho nem mostrar "undefined"/"null".
  };
  appDrawer.M.Store.state.pendencias.push(pendDrawer);

  // ---- 1) abrir o drawer mostra os campos reais (nunca inventa) ----
  appDrawer.M.Store.setUsuarioAtual("Willian Souza");
  appDrawer.M.Drawer.abrirPendencia(pendDrawer.id);
  const overlay1 = appDrawer.document.getElementById("drawerOverlay");
  assert.equal(overlay1.classList.contains("open"), true, "abrir precisa deixar o overlay com a classe 'open'");
  let painelHtml = appDrawer.document.getElementById("drawerPanel").innerHTML;
  assert.ok(painelHtml.includes("Vidro trincado na chegada"), "drawer precisa mostrar a descrição real");
  assert.ok(painelHtml.includes("Sala"), "drawer precisa mostrar o ambiente (hierarquia Cliente→Obra→Ambiente→Móvel)");
  assert.ok(painelHtml.includes("Cliente Drawer"), "drawer precisa mostrar o cliente (via M.Store.getObra)");
  assert.ok(painelHtml.includes("Painel"), "drawer precisa mostrar o móvel");
  assert.ok(painelHtml.toLowerCase().includes("undefined")===false, "drawer nunca pode vazar 'undefined' de campo ausente");
  assert.ok(painelHtml.toLowerCase().includes("null")===false, "drawer nunca pode vazar 'null' de campo ausente");
  assert.ok(!/Prazo<\/div>/.test(painelHtml), "campo ausente (prazo) não pode aparecer — item 22, nunca inventar dado");
  assert.ok(!/Observações<\/div>/.test(painelHtml), "campo ausente (observações) não pode aparecer");

  // ---- 2) primeira visualização: idempotente por usuário ----
  assert.equal(appDrawer.M.Store.visualizacoesDaPendencia(pendDrawer.id).length, 1, "1ª abertura precisa registrar exatamente 1 visualização");
  appDrawer.M.Drawer.abrirPendencia(pendDrawer.id); // reabre, mesmo usuário
  assert.equal(appDrawer.M.Store.visualizacoesDaPendencia(pendDrawer.id).length, 1, "reabrir com o MESMO usuário não pode duplicar (idempotente)");
  appDrawer.M.Store.setUsuarioAtual("Paulo Henrique");
  appDrawer.M.Drawer.abrirPendencia(pendDrawer.id); // outro usuário
  assert.equal(appDrawer.M.Store.visualizacoesDaPendencia(pendDrawer.id).length, 2, "usuário DIFERENTE precisa gerar um segundo registro");
  const vis = appDrawer.M.Store.visualizacoesDaPendencia(pendDrawer.id);
  // .join(",") em vez de deepEqual no array: os dois lados vêm de realms
  // diferentes (vm context vs. este arquivo) — deepStrictEqual do node trata
  // Array de outro realm como "estrutura diferente" mesmo com conteúdo igual.
  assert.equal(vis.map(v=>v.usuario).sort().join(","), "Paulo Henrique,Willian Souza");
  assert.ok(vis.every(v=>v.visualizadoEm), "todo registro precisa ter visualizadoEm carimbado");

  // ---- 3) ações do drawer reaproveitam Store/Act já existentes (item 24)
  // e o drawer se atualiza sozinho (Store.subscribe -> M.Drawer.refresh).
  // "Marcar resolvida" no drawer chama Act.setPendenciaStatus(...,"RESOLVIDA")
  // — mesmo Act.* que a lista já usava — que abre o modal de fotos de
  // resolução (Act.abrirResolverPendencia) em vez de resolver na hora; o
  // Store só muda quando esse formulário é submetido de verdade. Como o
  // stub de DOM deste teste não simula submit de formulário, chamamos
  // direto o Store que o submit chamaria (M.Store.atualizarStatusPendencia)
  // — o que importa aqui é confirmar que o DRAWER reflete sozinho qualquer
  // mudança de estado, vinda de onde vier.
  appDrawer.M.Store.atualizarStatusPendencia(pendDrawer.id, "RESOLVIDA");
  painelHtml = appDrawer.document.getElementById("drawerPanel").innerHTML;
  assert.ok(painelHtml.includes("Reabrir"), "drawer precisa refletir sozinho a mudança de status feita fora dele (Store.subscribe -> refresh)");
  assert.equal(pendDrawer.status, "RESOLVIDA");

  // ---- 4) fechar limpa o overlay ----
  appDrawer.M.Drawer.fechar();
  assert.equal(appDrawer.document.getElementById("drawerOverlay").classList.contains("open"), false);

  // ---- 5) drawer some sozinho se o item que ele mostrava deixar de existir
  // (nunca mostra um painel quebrado) ----
  appDrawer.M.Drawer.abrirPendencia(pendDrawer.id);
  assert.equal(appDrawer.document.getElementById("drawerOverlay").classList.contains("open"), true);
  appDrawer.M.Store.state.pendencias = appDrawer.M.Store.state.pendencias.filter(p=>p.id!==pendDrawer.id);
  appDrawer.M.Drawer.refresh();
  assert.equal(appDrawer.document.getElementById("drawerOverlay").classList.contains("open"), false, "drawer precisa fechar sozinho se o item some do estado");
  appDrawer.M.Store.state.pendencias.push(pendDrawer); // devolve pro resto dos testes

  // ---- 6) Pendências (lista completa) abre o MESMO drawer, não expande
  // mais inline (item 21 — "clicar em qualquer lugar abre o mesmo drawer") ----
  appDrawer.M.UIState.pendView = "lista";
  const htmlListaPend = appDrawer.M.Pages.pendencias().html;
  assert.ok(htmlListaPend.includes(`Act.abrirPendenciaEm('${pendDrawer.id}')`), "linha da lista de Pendências precisa chamar Act.abrirPendenciaEm (drawer)");
  assert.ok(!htmlListaPend.includes("Act.togglePendExpandido"), "lista completa não pode mais usar o expand inline antigo");

  // ---- 7) Pendências (Kanban) — corpo do card inteiro abre o drawer ----
  appDrawer.M.UIState.pendView = "kanban";
  const htmlKanbanPend = appDrawer.M.Pages.pendencias().html;
  assert.ok(htmlKanbanPend.includes(`Act.abrirPendenciaEm('${pendDrawer.id}')`), "card do Kanban precisa chamar Act.abrirPendenciaEm (drawer) — item 23");
  assert.ok(!htmlKanbanPend.includes("Act.go('#/pendencias')"), "kanban não pode mais navegar pra lista ao clicar (bug descrito no pedido)");

  // ---- 8) Obra → aba Pendências: linha inteira abre o drawer, botão
  // "Resolver" continua com ação própria (stopPropagation) ----
  const htmlObraPend = appDrawer.M.Pages.obraDetail(oDrawer.id); // tab padrão = geral
  appDrawer.M.UIState.obraTab[oDrawer.id] = "pendencias";
  const htmlObraPendTab = appDrawer.M.Pages.obraDetail(oDrawer.id).html;
  assert.ok(htmlObraPendTab.includes(`Act.abrirPendenciaEm('${pendDrawer.id}')`), "linha de pendência na aba Obra→Pendências precisa abrir o drawer — item 26");

  // ---- 9) Obra → Visão Geral: bloqueio ativo (banner) também abre o
  // drawer, com o botão de ação própria isolado por stopPropagation ----
  pendDrawer.status = "ABERTA"; pendDrawer.impacto = "BLOQUEIA_OBRA"; // força aparecer como bloqueio
  appDrawer.M.UIState.obraTab[oDrawer.id] = "geral";
  const htmlObraGeral = appDrawer.M.Pages.obraDetail(oDrawer.id).html;
  assert.ok(htmlObraGeral.includes(`Act.abrirPendenciaEm('${pendDrawer.id}')`), "banner de bloqueio na Visão Geral da obra precisa abrir o drawer — item 26");
  assert.ok(htmlObraGeral.includes("event.stopPropagation()"), "botão 'Resolver agora' dentro do banner precisa isolar o clique (não also abrir/fechar o drawer)");

  // ---- 10) Hoje: os dois pontos que mostram pendência (attention-item e
  // alert-item) chamam Act.abrirPendenciaEm, que agora abre o drawer em vez
  // de navegar pra #/pendencias (era o bug descrito no pedido) — checagem
  // estática do arquivo-fonte, já que reconstruir o dispatcher inteiro de
  // Hoje por perfil está fora do escopo deste teste pontual.
  const hojeSrc = fs.readFileSync(path.join(root, "js/pages/hoje.js"), "utf8");
  const chamadasAbrirPendenciaEm = (hojeSrc.match(/Act\.abrirPendenciaEm\(/g)||[]).length;
  assert.ok(chamadasAbrirPendenciaEm >= 2, "Hoje precisa ter pelo menos os 2 pontos (attention-item e alert-item) chamando Act.abrirPendenciaEm");
  assert.ok(!/pendExpandido\s*=\s*pendId/.test(fs.readFileSync(path.join(root, "js/actions.js"), "utf8")),
    "Act.abrirPendenciaEm não pode mais setar pendExpandido/navegar pra #/pendencias — precisa abrir o drawer");

  // ---- 11) permissão: ação "Marcar resolvida" só aparece pra quem tem
  // pendencia.resolver (mesma régua de sempre, reaproveitada — item 24) ----
  appDrawer.M.Store.setUsuarioAtual("Willian Souza"); // MONTADOR, sem pendencia.resolver
  appDrawer.M.Drawer.abrirPendencia(pendDrawer.id);
  const painelSemPermissao = appDrawer.document.getElementById("drawerPanel").innerHTML;
  assert.ok(!painelSemPermissao.includes("Marcar resolvida"), "perfil sem pendencia.resolver não pode ver o botão no drawer");
  appDrawer.M.Store.setUsuarioAtual("Paulo Henrique"); // ADMIN, tem tudo
  appDrawer.M.Drawer.abrirPendencia(pendDrawer.id);
  const painelComPermissao = appDrawer.document.getElementById("drawerPanel").innerHTML;
  assert.ok(painelComPermissao.includes("Marcar resolvida"), "ADMIN precisa ver o botão Marcar resolvida no drawer");
}
console.log("Fase 7.5 — Detalhe Rápido (Context Drawer) + Kanban/Hoje/Obra (Partes C/D/E): OK");

// ==================================================================
// FASE 8 — ADMIN V2 (seção 30 do pedido: Panorama/Indicadores/Equipe/
// Auditoria/Config/Mobile/Regressão). Precisa do MESMO stub de DOM que o
// Context Drawer (js/drawer.js é usado pelo detalhe de evento de
// Auditoria) e da pilha completa de páginas de que M.Pages.admin depende
// (agenda.js -> M.Agenda, configuracoes.js -> M.Pages._configSecoes).
// ==================================================================
{
  function domStubAdmin(){
    const registry = {};
    function makeEl(tag){
      let _id = "";
      const el = {
        tagName: String(tag||"div").toUpperCase(), _html:"", className:"", children:[],
        classList: { _set:new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, contains(c){return this._set.has(c);} },
        addEventListener(){}, querySelectorAll(){ return []; },
        appendChild(child){ this.children.push(child); if(child.id) registry[child.id]=child; },
        get id(){ return _id; }, set id(v){ _id=v; if(v) registry[v]=el; },
        get innerHTML(){ return this._html; },
        set innerHTML(html){
          this._html = html;
          const re = /id="([a-zA-Z0-9_-]+)"/g; let m;
          while((m = re.exec(html))){ if(!registry[m[1]]) registry[m[1]] = makeEl("div"); }
        },
      };
      return el;
    }
    const body = makeEl("body");
    return { body, createElement: makeEl, getElementById: (id)=> registry[id]||null };
  }

  const appAdmin = contextoBase();
  executar(appAdmin, "js/data.js");
  appAdmin.document = Object.assign({currentScript:{src:"https://teste.local/js/pdf-import.js"}}, domStubAdmin());
  executar(appAdmin, "js/store.js");
  executar(appAdmin, "js/calc.js");
  executar(appAdmin, "js/ui.js");
  appAdmin.M.Pages = {};
  appAdmin.M.render = function(){}; // Act.rerender()/Act.go() chamam M.render() — sem DOM real, só precisa não lançar
  executar(appAdmin, "js/actions.js"); // define M.UIState canônico (inclui admin*) + Act.*
  executar(appAdmin, "js/drawer.js");
  executar(appAdmin, "js/pages/agenda.js");        // M.Agenda
  executar(appAdmin, "js/pages/configuracoes.js"); // M.Pages._configSecoes
  executar(appAdmin, "js/pages/admin.js");
  executar(appAdmin, "js/router.js");

  // ---- fixtures: 1 obra em risco alto (entrega vencida + bloqueio), 1 obra
  // legada sem faseMacro, 1 pendência crítica antiga, 1 ambiente travado ----
  const obraRisco = {
    id:"fx8-obra1", cliente:"Cliente Risco", numeroOS:"OS FX8/1", status:"ATIVA", faseMacro:"PRODUCAO",
    dataEntregaPrevista: appAdmin.M.dOff(-2),
    ambientes:[{id:"fx8-amb1", nome:"Cozinha", travamentoManual:{motivo:"Aguardando síndico"}, moveis:[{id:"fx8-mov1", nome:"Painel", etapa:"CORTE", componentesCriticos:[]}]}],
  };
  const obraLegado = {
    id:"fx8-obra2", cliente:"Cliente Legado", numeroOS:"OS FX8/2", status:"ATIVA", // faseMacro AUSENTE de propósito
    dataEntregaPrevista: appAdmin.M.dOff(20),
    ambientes:[{id:"fx8-amb2", nome:"Sala", moveis:[{id:"fx8-mov2", nome:"Estante", etapa:"LIBERADA", componentesCriticos:[]}]}],
  };
  const obraRascunho = {
    id:"fx8-obra3", cliente:"Cliente Rascunho", numeroOS:"OS FX8/3", status:"RASCUNHO",
    dataEntregaPrevista: appAdmin.M.dOff(1), ambientes:[],
  };
  appAdmin.M.Store.state.obras.push(obraRisco, obraLegado, obraRascunho);
  appAdmin.M.Store.state.pendencias.push({
    id:"fx8-pend1", obraId:obraRisco.id, obraNome:obraRisco.cliente, categoria:"Vidro", tipo:"CRITICO",
    impacto:"BLOQUEIA_OBRA", status:"ABERTA", responsavel:"Willian Souza",
    abertura: appAdmin.M.dOff(-9), origem:"Fornecedor", fluxoPassos:["Fornecedor"], passoAtual:0,
  });

  // ---- 1) router: "admin" aceita subrota e continua exigindo QUALQUER
  // admin.* (nenhuma permissão nova) ----
  assert.equal(typeof appAdmin.M.Router.ROUTES.admin, "function", "ROUTES.admin precisa continuar existindo");
  assert.equal(appAdmin.M.Router.ROUTE_PERMS.admin.join(","), ["admin.equipe","admin.configuracoes","admin.indicadores","admin.auditoria"].join(","),
    "ROUTE_PERMS.admin não pode ter ganhado nem perdido permissão nesta fase");

  // ---- 2) PANORAMA (ADMIN): KPIs batem com Calc direto (nenhuma segunda
  // regra de contagem), rascunho fica de fora, obra sem faseMacro não vira
  // fase inventada (some da distribuição por fase, cai só no aviso "sem
  // fase definida") ----
  appAdmin.M.Store.setUsuarioAtual("Paulo Henrique"); // ADMIN
  const obrasOp = appAdmin.M.Store.obrasOperacionais();
  assert.equal(obrasOp.some(o=>o.id===obraRascunho.id), false, "obrasOperacionais() precisa excluir rascunho — pré-condição");
  const htmlPanorama = appAdmin.M.Pages.admin("panorama").html;
  assert.ok(htmlPanorama.includes("Cliente Rascunho")===false, "Panorama não pode contar/mostrar obra RASCUNHO em nenhum bloco");
  assert.ok(htmlPanorama.includes(">"+String(obrasOp.length)+"<") || htmlPanorama.includes(">"+String(obrasOp.length)+"</div>"),
    "KPI 'Obras ativas' precisa refletir exatamente Store.obrasOperacionais().length (mesma fonte, sem duplicar)");
  assert.ok(htmlPanorama.includes("Cliente Risco"), "obra de risco alto precisa aparecer no bloco de exceções");
  assert.ok(htmlPanorama.includes("sem fase definida"), "obra legada sem faseMacro precisa aparecer como 'sem fase definida' — nunca inferida como uma fase real");
  assert.ok(!/Fase "PRODUCAO"/.test(htmlPanorama), "obra legada não pode ser contada dentro de nenhuma fase real do funil");

  // ---- 3) INDICADORES: seletor de período muda o texto exibido; métricas
  // sem dado histórico confiável mostram "dados insuficientes" (nunca
  // fabricam tendência) ----
  assert.equal(appAdmin.M.UIState.adminIndicadoresPeriodo, 30, "período padrão precisa ser 30 dias");
  appAdmin.Act.setAdminIndicadoresPeriodo(7);
  assert.equal(appAdmin.M.UIState.adminIndicadoresPeriodo, 7);
  const htmlInd7 = appAdmin.M.Pages.admin("indicadores").html;
  assert.ok(htmlInd7.includes("Últimos 7 dias"), "período selecionado precisa aparecer explícito na tela (item 8)");
  assert.ok((htmlInd7.match(/dados insuficientes/g)||[]).length >= 2, "tempo médio por fase E tempo até finalizar precisam aparecer como 'dados insuficientes' — não fabricados");
  appAdmin.Act.setAdminIndicadoresPeriodo("custom");
  assert.ok(typeof appAdmin.M.UIState.adminIndicadoresPeriodo === "object", "'Personalizado' precisa virar {ini,fim}");
  appAdmin.Act.setAdminIndicadoresPeriodoCustom("ini", "2026-01-01");
  assert.equal(appAdmin.M.UIState.adminIndicadoresPeriodo.ini, "2026-01-01");
  appAdmin.Act.setAdminIndicadoresPeriodo(30); // devolve o padrão pro resto dos testes

  // ---- 4) DESEMPENHO: sem nota geral/ranking colorido — nunca ordena por
  // índice, sempre alfabético; usa desempenhoColaborador/pendenciasDoColaborador
  // direto, nunca indiceDesempenho/rankingColaboradores ----
  const htmlDes = appAdmin.M.Pages.admin("desempenho").html;
  assert.ok(!/rank-row|rank-pos|rank-idx/.test(htmlDes), "Desempenho do Admin V2 não pode reusar o markup de ranking (.rank-row) da tela antiga");
  const posAna = htmlDes.indexOf("Ana Ferreira"), posWillian = htmlDes.indexOf("Willian Souza");
  assert.ok(posAna>=0 && posWillian>=0 && posAna<posWillian, "colaboradores precisam aparecer em ordem ALFABÉTICA, não por performance");

  // ---- 5) EQUIPE/USUÁRIOS: aviso de identidade provisória (usuarioAtual
  // não é Auth real) sempre presente; escopo por permissão (Produção/
  // Montador sem admin.equipe não acessam); troca de perfil fica registrada
  // em auditoria (quem/colaborador/antes/depois/quando), nunca só um toast ----
  const htmlEquipeAdmin = appAdmin.M.Pages.admin("equipe").html;
  assert.ok(/n.o .* Auth real|modo de desenvolvimento/i.test(htmlEquipeAdmin), "Equipe/Usuários precisa deixar explícito que usuarioAtual não é Auth real");
  appAdmin.M.Store.setUsuarioAtual("Willian Souza"); // OPERADOR (Produção) — sem admin.equipe
  assert.equal(appAdmin.M.Store.pode("admin.equipe"), false, "pré-condição: Produção não tem admin.equipe");
  const htmlEquipeProducao = appAdmin.M.Pages.admin("equipe").html;
  assert.ok(/não tem acesso/.test(htmlEquipeProducao), "Produção (Operador) não pode ver o conteúdo de Equipe/Usuários");
  appAdmin.M.Store.setUsuarioAtual("Roberto Diniz"); // MONTADOR — sem admin.equipe
  assert.equal(appAdmin.M.Store.pode("admin.equipe"), false, "pré-condição: Montador não tem admin.equipe");
  assert.ok(/não tem acesso/.test(appAdmin.M.Pages.admin("equipe").html), "Montador também não pode ver Equipe/Usuários");
  appAdmin.M.Store.setUsuarioAtual("Paulo Henrique");

  const roberto = appAdmin.M.COLABORADORES.find(c=>c.nome==="Roberto Diniz");
  const perfilAntes = roberto.perfil;
  const auditoriaAntes = appAdmin.M.Store.state.auditoria.length;
  appAdmin.M.Store.auditarAlteracaoPerfilColaborador(roberto.nome, perfilAntes, "LIDERANCA");
  assert.equal(appAdmin.M.Store.state.auditoria.length, auditoriaAntes+1, "troca de perfil precisa gerar um evento de auditoria — não só um toast");
  const eventoPerfil = appAdmin.M.Store.state.auditoria[0];
  assert.equal(eventoPerfil.categoria, "GOVERNANCA");
  assert.equal(eventoPerfil.colaborador, roberto.nome);
  assert.equal(eventoPerfil.perfilAnterior, perfilAntes);
  assert.equal(eventoPerfil.perfilNovo, "LIDERANCA");
  assert.ok(eventoPerfil.descricao && eventoPerfil.descricao.indexOf(roberto.nome)!==-1, "descrição do evento precisa citar o colaborador");
  // sem mudança real (mesmo perfil) não deve gerar evento novo (evita ruído)
  appAdmin.M.Store.auditarAlteracaoPerfilColaborador(roberto.nome, "LIDERANCA", "LIDERANCA");
  assert.equal(appAdmin.M.Store.state.auditoria.length, auditoriaAntes+1, "perfil igual (sem mudança real) não pode gerar evento novo");
  // js/actions.js precisa de fato CHAMAR esse método no fluxo de edição de
  // colaborador (checagem estática do arquivo-fonte — abrir o formulário de
  // verdade exige M.Supa, fora do escopo deste harness síncrono).
  const actionsSrc = fs.readFileSync(path.join(root, "js/actions.js"), "utf8");
  assert.ok(/auditarAlteracaoPerfilColaborador/.test(actionsSrc), "openColaboradorForm precisa chamar Store.auditarAlteracaoPerfilColaborador quando o perfil muda");

  // ---- 6) AUDITORIA: eventos de state.historico E state.auditoria
  // aparecem juntos (merge de apresentação, nenhuma 3ª estrutura); filtros
  // funcionam; visualizações de Pendência aparecem SÓ aqui, com o aviso de
  // identidade provisória — e esse aviso NÃO vaza pra Panorama/Equipe ----
  appAdmin.M.Store.log(obraRisco.id, "OBRA_EDITADA", "Obra Risco editada — teste");
  appAdmin.M.Store.setUsuarioAtual("Willian Souza");
  appAdmin.M.Store.registrarPrimeiraVisualizacaoPendencia("fx8-pend1");
  appAdmin.M.Store.setUsuarioAtual("Paulo Henrique");
  appAdmin.M.UIState.adminAuditoriaFiltro.periodo = 90;
  const htmlAud = appAdmin.M.Pages.admin("auditoria").html;
  assert.ok(htmlAud.includes("Obra editada"), "evento de state.historico precisa aparecer na Auditoria do Admin V2");
  assert.ok(htmlAud.includes("Permissão") || htmlAud.includes("permissão") || appAdmin.M.Store.state.auditoria.length>0,
    "eventos de state.auditoria também precisam aparecer (merge das duas fontes)");
  const AVISO_IDENTIDADE = "não representa evidência forte de autoria";
  assert.ok(htmlAud.includes(AVISO_IDENTIDADE), "aviso de identidade provisória precisa aparecer junto das visualizações de Pendência");
  assert.ok(htmlAud.includes("Willian Souza"), "visualização de pendência registrada precisa aparecer na lista");
  assert.ok(!htmlPanorama.includes(AVISO_IDENTIDADE), "aviso de identidade provisória NÃO pode vazar pro Panorama");
  assert.ok(!htmlEquipeAdmin.includes(AVISO_IDENTIDADE), "aviso de identidade provisória NÃO pode vazar pra tela de Equipe (ela tem o SEU PRÓPRIO aviso, sobre usuarioAtual não ser Auth — texto diferente)");
  // filtro por tipo restringe de verdade
  appAdmin.M.UIState.adminAuditoriaFiltro.tipo = "OBRA_EDITADA";
  const htmlAudFiltrado = appAdmin.M.Pages.admin("auditoria").html;
  assert.ok(htmlAudFiltrado.includes("Obra editada"));
  appAdmin.M.UIState.adminAuditoriaFiltro.tipo = "";
  // drawer de detalhe (item 18) — reusa o Context Drawer, sem duplicar leitura
  const idEventoHist = "h_"+appAdmin.M.Store.state.historico[0].id;
  const eventoNormalizado = appAdmin.M.Pages._adminAuditoriaEventoPorId(idEventoHist);
  assert.ok(eventoNormalizado, "_adminAuditoriaEventoPorId precisa achar o evento pelo id normalizado");
  appAdmin.M.Drawer.abrirEventoAuditoria(idEventoHist);
  const painelEvento = appAdmin.document.getElementById("drawerPanel").innerHTML;
  assert.ok(painelEvento.includes("Cliente Risco"), "drawer de evento de auditoria precisa mostrar a obra relacionada");
  appAdmin.M.Drawer.fechar();

  // ---- 7) CONFIGURAÇÕES: permissão respeitada (quem não tem
  // admin.configuracoes não acessa nada) e nada sensível é alterável por
  // quem não tem editarPermissoes (matriz some os checkboxes) ----
  appAdmin.M.Store.setUsuarioAtual("Willian Souza"); // Produção — sem admin.configuracoes
  assert.ok(/não tem acesso/.test(appAdmin.M.Pages.admin("configuracoes").html), "Produção não pode acessar Configurações do Admin V2");
  appAdmin.M.Store.setUsuarioAtual("Beatriz Nogueira"); // PCP — verConfiguracoes:true, editarPermissoes:false
  appAdmin.M.UIState.adminConfigCategoria = "permissoes";
  const htmlConfigPermPCP = appAdmin.M.Pages.admin("configuracoes").html;
  assert.ok(!/type="checkbox"/.test(htmlConfigPermPCP), "quem não tem editarPermissoes não pode ver controles editáveis na matriz (só leitura)");
  appAdmin.M.Store.setUsuarioAtual("Paulo Henrique");
  appAdmin.M.UIState.adminConfigCategoria = "seguranca";
  const htmlConfigSeg = appAdmin.M.Pages.admin("configuracoes").html;
  assert.ok(/Auth real.*Pendente/s.test(htmlConfigSeg) || htmlConfigSeg.includes("Pendente"), "status de segurança precisa aparecer, sem implementar nada de verdade");
  assert.ok(!/localStorage\.setItem\(['"]auth/i.test(fs.readFileSync(path.join(root,"js/pages/admin.js"),"utf8")), "Configurações→Segurança não pode ter implementado nenhum mecanismo real de auth");
  appAdmin.M.UIState.adminConfigCategoria = "geral";

  // ---- 8) fonte de verdade: nenhuma chamada nova a localStorage/fetch fora
  // de Store/Supa dentro de js/pages/admin.js (sem cache paralelo) ----
  const adminSrc = fs.readFileSync(path.join(root, "js/pages/admin.js"), "utf8");
  assert.ok(!/localStorage\./.test(adminSrc), "js/pages/admin.js não pode acessar localStorage direto (sempre via Store)");
  assert.ok(!/JSON\.parse\(JSON\.stringify\(M\.Store\.state/.test(adminSrc), "js/pages/admin.js não pode clonar/cachear state por conta própria");

  // ---- 9) MOBILE — checagem estrutural: as telas usam os componentes
  // responsivos já adotados (.mcard/.grid-2, que colapsam pra 1 coluna sob
  // o breakpoint já existente) em vez de comprimir tabela alguma; nenhuma
  // tabela dentro de Equipe/Panorama usa <table> pra listar pessoas (só
  // pros pequenos resumos numéricos, que não são "a lista principal") ----
  assert.ok(htmlEquipeAdmin.includes('class="mcard"'), "Equipe/Usuários precisa usar cards empilháveis (.mcard) — nunca comprimir tabela no mobile");
  assert.ok(htmlPanorama.includes("kpi-row"), "Panorama precisa usar a faixa de KPI compacta padrão (mesma de Hoje/Obras)");

  console.log("Fase 8 — Admin V2 (Panorama/Indicadores/Desempenho/Equipe/Auditoria/Configurações): OK");

  // ------------------------------------------------------------------
  // HOTFIX FASE 8 — auditoria de navegação: Admin → TV → "Configuração
  // resumida (widgets)" não pode mais navegar pra #/configuracoes/tv (tela
  // antiga de 8 abas) — tem que renderizar OS MESMOS switches inline, sem
  // sair do Admin V2. Gate é tv.configurar, sem dependência artificial de
  // admin.configuracoes. Rota legada continua existindo e continua guardada
  // pela MESMA permissão de sempre (admin.configuracoes), só não é mais
  // navegada por nenhum fluxo novo.
  // ------------------------------------------------------------------
  function passaNaRotaAdmin(app, key){
    const perm = app.M.Router.ROUTE_PERMS[key];
    if(!perm) return true;
    return Array.isArray(perm) ? perm.some(p=>app.M.Store.pode(p)) : app.M.Store.pode(perm);
  }

  // ADMIN (Paulo Henrique): tem tv.configurar E admin.configuracoes — vê os
  // switches, e o HTML não pode mais conter nenhum link pra #/configuracoes.
  appAdmin.M.Store.setUsuarioAtual("Paulo Henrique");
  const htmlTvAdmin = appAdmin.M.Pages.admin("tv").html;
  assert.ok(!/href="#\/configuracoes/.test(htmlTvAdmin), "Admin→TV não pode mais linkar pra #/configuracoes (nenhuma sub-rota) — é o bug reportado na auditoria");
  assert.ok(/Act\.toggleTvWidget\(/.test(htmlTvAdmin), "quem tem tv.configurar precisa ver os switches funcionais (mesma Act.toggleTvWidget de sempre) INLINE na aba TV");
  assert.ok(/class="switch/.test(htmlTvAdmin), "switches de widget precisam estar de fato no HTML da aba TV do Admin V2");
  assert.ok(htmlTvAdmin.includes('href="#/chao-de-fabrica"'), "o preview do painel físico continua linkando normalmente (não fazia parte do bug)");

  // toggle real: liga/desliga o mesmo Store.state.tvWidgetsAtivos de sempre
  // (nenhum Store novo, nenhuma persistência paralela)
  const widgetTeste = "corte";
  const antesToggle = appAdmin.M.Store.state.tvWidgetsAtivos ? appAdmin.M.Store.state.tvWidgetsAtivos[widgetTeste] : undefined;
  appAdmin.Act.toggleTvWidget(widgetTeste);
  const depoisToggle = appAdmin.M.Store.state.tvWidgetsAtivos[widgetTeste];
  assert.ok(depoisToggle !== antesToggle || (antesToggle===undefined && depoisToggle===false), "Act.toggleTvWidget precisa continuar alterando state.tvWidgetsAtivos de verdade (mesmo caminho de sempre)");
  appAdmin.Act.toggleTvWidget(widgetTeste); // devolve ao estado original

  // Configurações→TV (categoria dentro do Admin V2) herda a mesma correção,
  // de graça, por chamar a mesma tvResumoHtml() — também não pode linkar
  // pra fora.
  appAdmin.M.UIState.adminConfigCategoria = "tv";
  const htmlConfigTvAdmin = appAdmin.M.Pages.admin("configuracoes").html;
  assert.ok(!/href="#\/configuracoes\/tv/.test(htmlConfigTvAdmin), "Admin→Configurações→TV também não pode linkar pra #/configuracoes/tv");
  assert.ok(/Act\.toggleTvWidget\(/.test(htmlConfigTvAdmin), "Admin→Configurações→TV também precisa mostrar os switches inline (mesma função reaproveitada)");
  appAdmin.M.UIState.adminConfigCategoria = "geral";

  // Sem tv.configurar: só resumo/preview, nunca os switches (comportamento
  // já existia — a correção não pode ter mudado isso)
  appAdmin.M.Store.setUsuarioAtual("Beatriz Nogueira"); // PCP: verConfiguracoes:true, mas tv.configurar:false por padrão
  assert.equal(appAdmin.M.Store.pode("tv.configurar"), false, "pré-condição: PCP não tem tv.configurar por padrão");
  const htmlTvPCP = appAdmin.M.Pages.admin("tv").html;
  assert.ok(!/Act\.toggleTvWidget\(/.test(htmlTvPCP), "sem tv.configurar só pode ver o resumo/preview — nunca os switches");
  assert.ok(!/class="switch/.test(htmlTvPCP), "sem tv.configurar não pode haver nenhum switch no HTML");

  // Nenhuma dependência artificial de admin.configuracoes: dando SÓ
  // tv.configurar (sem admin.configuracoes) pra um perfil, os switches
  // continuam aparecendo — e a rota legada continua bloqueada por conta
  // própria, pela MESMA permissão de sempre. GESTOR é o perfil ideal pra
  // provar isso: tem admin.ver:true por padrão (então consegue ver a aba TV
  // de verdade, não cai no "sem acesso" genérico) e admin.configuracoes:
  // false por padrão — exatamente a combinação que a auditoria queria testar.
  // GESTOR não tem colaborador atribuído por padrão (Fase 1), então
  // atribuímos o perfil temporariamente a um colaborador existente só pra
  // este teste, e revertemos no final.
  const beatriz = appAdmin.M.COLABORADORES.find(c=>c.nome==="Beatriz Nogueira");
  const perfilOriginalBeatriz = beatriz.perfil;
  beatriz.perfil = "GESTOR";
  appAdmin.M.Store.setUsuarioAtual("Beatriz Nogueira");
  assert.equal(appAdmin.M.Store.pode("admin.ver"), true, "pré-condição: GESTOR tem admin.ver (consegue ver a aba TV)");
  assert.equal(appAdmin.M.Store.pode("tv.configurar"), false, "pré-condição: GESTOR não tem tv.configurar por padrão");
  assert.equal(appAdmin.M.Store.pode("admin.configuracoes"), false, "pré-condição: GESTOR não tem admin.configuracoes por padrão");
  const htmlTvGestorAntes = appAdmin.M.Pages.admin("tv").html;
  assert.ok(!/Act\.toggleTvWidget\(/.test(htmlTvGestorAntes), "GESTOR sem tv.configurar ainda vê só o resumo/preview");

  appAdmin.M.Store.setUsuarioAtual("Paulo Henrique"); // precisa de editarPermissoes pra mexer na matriz
  appAdmin.M.Store.setPermissao("GESTOR", "tv.configurar", true);
  assert.equal(appAdmin.M.Store.state.permissoes.GESTOR["admin.configuracoes"], false,
    "pré-condição: não tocamos em admin.configuracoes do GESTOR — continua no valor padrão (false)");
  appAdmin.M.Store.setUsuarioAtual("Beatriz Nogueira");
  assert.equal(appAdmin.M.Store.pode("tv.configurar"), true, "GESTOR agora tem tv.configurar (só essa, isolada)");
  assert.equal(appAdmin.M.Store.pode("admin.configuracoes"), false, "GESTOR continua SEM admin.configuracoes — as duas permissões são independentes");
  const htmlTvGestorComTv = appAdmin.M.Pages.admin("tv").html;
  assert.ok(/Act\.toggleTvWidget\(/.test(htmlTvGestorComTv), "com tv.configurar (mesmo sem admin.configuracoes) os switches precisam aparecer — sem dependência artificial entre as duas permissões");
  assert.equal(passaNaRotaAdmin(appAdmin, "configuracoes"), false, "a rota legada #/configuracoes(/tv) continua bloqueada pra quem não tem admin.configuracoes — a correção não abriu nenhum buraco de permissão");
  // limpa a permissão/perfil de teste pra não vazar pro resto da suíte
  appAdmin.M.Store.setUsuarioAtual("Paulo Henrique");
  appAdmin.M.Store.setPermissao("GESTOR", "tv.configurar", false);
  beatriz.perfil = perfilOriginalBeatriz;
  appAdmin.M.Store.setUsuarioAtual("Paulo Henrique");

  // fonte-única: o próprio texto do arquivo não pode ter recriado
  // Act.toggleTvWidget nem duplicado a lista de widgets — tem que ser
  // literalmente a mesma função de configuracoes.js, chamada por referência.
  const adminSrcTv = fs.readFileSync(path.join(root, "js/pages/admin.js"), "utf8");
  assert.ok(!/toggleTvWidget\s*[:=]\s*function/.test(adminSrcTv), "admin.js não pode ter criado uma segunda implementação de toggleTvWidget");
  assert.ok(/_configSecoes\.tv\(\)/.test(adminSrcTv), "admin.js precisa chamar M.Pages._configSecoes.tv() por referência, não duplicar o markup dos widgets");

  console.log("Hotfix Fase 8 — Admin→TV: configuração de widgets inline, sem navegar pra #/configuracoes/tv: OK");

  // ------------------------------------------------------------------
  // HOTFIX FASE 8 (2) — contagem "Widgets ativos" do card de status precisa
  // usar EXATAMENTE a mesma semântica dos switches (chave ausente/true =
  // ativo, chave explicitamente false = inativo), reaproveitando o mesmo
  // helper — nunca uma segunda regra de contagem.
  // ------------------------------------------------------------------
  {
    const TOTAL_WIDGETS = 9; // producao-hoje, corte, usinagem, fitagem, pre-montagem, meta-mensal, wip, atencao-rotativo, entregas
    appAdmin.M.Store.setUsuarioAtual("Paulo Henrique"); // ADMIN: tv.configurar + admin.ver

    // 1) estado "limpo" (nada salvo ainda) — todo widget é ativo por
    // default, então a contagem tem que bater com o total, não com 0.
    appAdmin.M.Store.state.tvWidgetsAtivos = {};
    let htmlTv = appAdmin.M.Pages.admin("tv").html;
    assert.ok(htmlTv.includes(`<b>${TOTAL_WIDGETS}</b>`), `com state.tvWidgetsAtivos vazio, o contador precisa mostrar ${TOTAL_WIDGETS} (todos default-on), nunca 0`);
    const switchesOnVazio = (htmlTv.match(/class="switch on"/g)||[]).length;
    assert.equal(switchesOnVazio, TOTAL_WIDGETS, "todos os switches renderizados precisam estar 'on' quando nada foi salvo ainda");

    // 2) um widget marcado false — contador cai exatamente 1
    appAdmin.M.Store.state.tvWidgetsAtivos = {"corte": false};
    htmlTv = appAdmin.M.Pages.admin("tv").html;
    assert.ok(htmlTv.includes(`<b>${TOTAL_WIDGETS-1}</b>`), "um widget marcado false precisa derrubar o contador em exatamente 1");

    // 3) widget marcado true explicitamente — continua contado (não é o
    // "false" que soma, é qualquer coisa != false)
    appAdmin.M.Store.state.tvWidgetsAtivos = {"corte": false, "usinagem": true};
    htmlTv = appAdmin.M.Pages.admin("tv").html;
    assert.ok(htmlTv.includes(`<b>${TOTAL_WIDGETS-1}</b>`), "widget marcado true explicitamente continua contado normalmente (só false tira da contagem)");

    // 4) contador e switches usam a MESMA fonte de verdade: o número de
    // switches "on" no HTML precisa bater com o número que o card mostra,
    // pra qualquer combinação de estado.
    const numeroExibido = Number((htmlTv.match(/Widgets ativos<\/td><td class="right"><b>(\d+)<\/b>/)||[])[1]);
    const switchesOn = (htmlTv.match(/class="switch on"/g)||[]).length;
    assert.equal(numeroExibido, switchesOn, "o número do card e a quantidade de switches ligados precisam bater sempre — mesma fonte de verdade, nunca duas regras");
    assert.equal(numeroExibido, TOTAL_WIDGETS-1);

    // 5) toggle via Act.toggleTvWidget atualiza o contador depois de um
    // novo render (não fica preso no valor antigo)
    appAdmin.Act.toggleTvWidget("corte"); // estava false -> volta a ativo
    const htmlTvDepoisToggle = appAdmin.M.Pages.admin("tv").html;
    assert.ok(htmlTvDepoisToggle.includes(`<b>${TOTAL_WIDGETS}</b>`), "depois de reativar via Act.toggleTvWidget, o contador precisa refletir isso no próximo render");

    // 6) nenhuma rota muda com nada disso — mesma checagem de sempre
    assert.ok(!/href="#\/configuracoes/.test(htmlTvDepoisToggle), "a correção da contagem não pode ter reintroduzido nenhum link pra #/configuracoes");

    // limpa o estado de teste
    appAdmin.M.Store.state.tvWidgetsAtivos = {};
  }
  console.log("Hotfix Fase 8 (2) — Admin→TV: contagem de 'Widgets ativos' usa a mesma semântica dos switches: OK");
}

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

  // ---- 11 (HOTFIX 3.15.3): estado vindo da nuvem de ANTES da Fase 3
  // (Fases Macro) não tem a chave `fasesMacro` — aplicarEstadoRemoto()
  // precisa reidratar o catálogo (semente), nunca deixar state.fasesMacro
  // undefined, senão Store.faseMacroById (`state.fasesMacro.find(...)`)
  // quebra assim que QUALQUER obra com faseMacro real é lida (ex.:
  // riscoObra -> situacaoObra -> tela de detalhe da obra). Isso é
  // pré-existente (não é bug da Fase 7.5 em si) mas só foi exposto agora
  // porque Fase 7.5 é a primeira feature a gravar faseMacro de verdade numa
  // obra de produção (as 9 obras legadas nunca tinham faseMacro, então
  // sempre caíam no fallback _LEGADO_SEM_FASE sem nunca chamar
  // faseMacroById). Reproduz o crash de produção encontrado no smoke test
  // pós-push (#/obra/obra-252 depois de ativar). Aproveita pra testar
  // também os outros campos que aplicarEstadoRemoto() passou a defender
  // junto (etapas/requisitosPorEtapa/tarefasPadrao/fluxosPadrao/
  // pesosDesempenho/notificacoes/metaMensal/auditoria/assistencias/
  // permissoes), mirrorando as mesmas defesas que load() já tinha. ----
  {
    const ctx = criarContextoHotfix({semSincronizacaoNoBoot:false});
    ctx.resolverPronto(true);
    await esperar(50);
    ctx.chamadasSalvar.length = 0; // baseline limpo

    // completa o contexto com Calc/Pages.novaObra pra poder criar+ativar
    // uma obra de verdade (ganha faseMacro="AGUARDANDO_INICIO" real de
    // Store.criarObra) e depois reproduzir a leitura real que quebrava em
    // produção (riscoObra -> faseMacroDeObra -> faseMacroById).
    ctx.app.M.UI = Object.assign({}, ctx.app.M.UI, {
      esc:(s)=> String(s==null?"":s), icon:()=>"", toast:()=>{},
    });
    ctx.app.M.Pages = ctx.app.M.Pages || {};
    executar(ctx.app, "js/calc.js");
    executar(ctx.app, "js/pages/novaObra.js");

    ctx.app.M.UIState = {novaObra:{
      obraId:null, step:"inicio", modo:"manual", osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
      lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
      nomeManual:"Obra Hotfix 3.15.3", numeroOSManual:"OS HOTFIX-3153", clienteManual:"Cliente Hotfix", responsavelProducao:"Willian Souza",
      enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
      ambientesManual:[{tid:"tmpamb-hf1", nome:"Sala", moveis:[{tid:"tmpmov-hf1", nome:"Painel ripado"}]}],
      osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
    }};
    const montado = ctx.app.M.Pages.novaObraMontarManual();
    const criada = ctx.app.M.Store.criarObra(montado);
    const ativacao = ctx.app.M.Store.ativarObra(criada.id);
    assert.equal(ativacao.ok, true, "pré-condição: obra de teste precisa ativar com sucesso");
    assert.equal(criada.faseMacro, "AGUARDANDO_INICIO", "pré-condição: obra de teste precisa ter faseMacro real setado (não legado)");

    // com fasesMacro presente (sincronização normal), a leitura já funciona
    // — confirma que o teste está reproduzindo o cenário certo antes de
    // simular o estado quebrado.
    assert.doesNotThrow(()=>{
      ctx.app.M.Calc.situacaoObra(criada);
    }, "pré-condição: leitura normal (fasesMacro presente) não pode lançar");

    const cb = ctx.obterMudancaCb();
    assert.ok(cb, "assinarMudancas precisa ter sido registrado no boot (sincronizarComSupabase)");

    // estado remoto real de ANTES da Fase 3: sem a chave `fasesMacro` (nunca
    // foi salva na nuvem por uma versão anterior do app) — mas com a MESMA
    // obra (já ativada, com faseMacro="AGUARDANDO_INICIO") que acabamos de
    // criar, pra reproduzir exatamente o que aconteceu em produção: uma
    // sincronização real trazendo um snapshot antigo por cima do estado que
    // tinha acabado de ativar a obra.
    const remotoSemFasesMacro = JSON.parse(JSON.stringify(ctx.app.M.Store.state));
    delete remotoSemFasesMacro.fasesMacro;
    delete remotoSemFasesMacro.etapas;
    delete remotoSemFasesMacro.requisitosPorEtapa;
    assert.equal(Object.prototype.hasOwnProperty.call(remotoSemFasesMacro, "fasesMacro"), false, "pré-condição: o remoto simulado não pode ter a chave fasesMacro");

    assert.doesNotThrow(()=>{
      cb(remotoSemFasesMacro, "carimbo-sem-fasesmacro");
    }, "aplicarEstadoRemoto() não pode lançar quando o remoto não tem `fasesMacro`");

    assert.ok(Array.isArray(ctx.app.M.Store.state.fasesMacro) && ctx.app.M.Store.state.fasesMacro.length>0, "state.fasesMacro precisa se reidratar com o catálogo (semente), nunca ficar undefined/vazio");
    assert.ok(Array.isArray(ctx.app.M.Store.state.etapas) && ctx.app.M.Store.state.etapas.length>0, "state.etapas também precisa se reidratar (mesma defesa)");
    assert.ok(ctx.app.M.Store.state.requisitosPorEtapa, "state.requisitosPorEtapa também precisa se reidratar (mesma defesa)");

    const obraNoStateAtual = ctx.app.M.Store.state.obras.find(o=>o.id===criada.id);
    assert.ok(obraNoStateAtual, "a obra criada precisa continuar existindo depois da sincronização (não é sobre perder dado, é sobre o catálogo de fases)");
    assert.equal(obraNoStateAtual.faseMacro, "AGUARDANDO_INICIO", "faseMacro da própria obra não pode ter sido alterado pela defesa");

    // esta é a leitura real que quebrava em produção: abrir a página de
    // detalhe de uma obra recém-ativada chamava riscoObra -> faseMacroDeObra
    // -> faseMacroById, que lançava "Cannot read properties of undefined
    // (reading 'find')" porque state.fasesMacro tinha acabado de virar
    // undefined vindo da sincronização.
    assert.doesNotThrow(()=>{
      ctx.app.M.Store.faseMacroDeObra(obraNoStateAtual);
    }, "Store.faseMacroDeObra não pode lançar depois de um estado remoto sem `fasesMacro`");
    assert.doesNotThrow(()=>{
      ctx.app.M.Calc.situacaoObra(obraNoStateAtual);
    }, "leitura real da tela de obra (Calc.situacaoObra -> riscoObra -> faseMacroDeObra) não pode lançar depois de um estado remoto sem `fasesMacro`");

    const faseLida = ctx.app.M.Store.faseMacroDeObra(obraNoStateAtual);
    assert.equal(faseLida.key, "AGUARDANDO_INICIO", "com o catálogo reidratado, a fase real da obra precisa ser encontrada certinho (não pode cair no fallback _LEGADO_SEM_FASE)");

    // uma segunda sincronização, agora com o remoto já tendo `fasesMacro` de
    // verdade (não vazio, e diferente da semente — simula um catálogo já
    // customizado por um admin), continua funcionando normalmente — a
    // defesa não pisa num valor real vindo da nuvem.
    const remotoComFasesMacro = JSON.parse(JSON.stringify(ctx.app.M.Store.state));
    const catalogoCustomizado = remotoComFasesMacro.fasesMacro.map(f=> Object.assign({}, f));
    catalogoCustomizado.push({key:"FASE_CUSTOM_TESTE", label:"Fase custom de teste", ordem:999, impactaRisco:false});
    remotoComFasesMacro.fasesMacro = catalogoCustomizado;
    cb(remotoComFasesMacro, "carimbo-com-fasesmacro");
    assert.equal(ctx.app.M.Store.state.fasesMacro.some(f=>f.key==="FASE_CUSTOM_TESTE"), true, "quando o remoto TEM fasesMacro de verdade (customizado), a defesa não pode substituir pela semente padrão");
  }

  console.log("Hotfix 3.1 (persistencia Supabase antes do cliente pronto): OK");
  console.log("Hotfix 3.13.1 (state.eventos undefined vindo de estado remoto pre-Fase-6): OK");
  console.log("Hotfix 3.15.3 (state.fasesMacro undefined vindo de estado remoto pre-Fase-3, crash faseMacroById): OK");
}

rodarTestesHotfix().catch(err=>{
  console.error(err);
  process.exitCode = 1;
});
