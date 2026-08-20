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
