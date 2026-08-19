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

console.log("Regressoes criticas: OK");
