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

// Relógio: não pode voltar à antiga data fixa do protótipo.
const app = contextoBase();
executar(app, "js/data.js");
const agora = new Date();
const hojeEsperado = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,"0")}-${String(agora.getDate()).padStart(2,"0")}`;
assert.equal(app.M.todayISO(), hojeEsperado);

// PDF: subtotal prevalece e, sem subtotal, quantidade multiplica valor unitário.
executar(app, "js/pdf-import.js");
const doc = app.M.PdfImport.parseDocumento([
  "ORÇAMENTO Nº 2026/999", "Cliente: Teste Responsável: Willian Souza Telefone: 11 Email: teste@exemplo.com",
  "COZINHA", "Armário superior", "Quantidade: 2 Valor: R$ 100,00 Subtotal: R$ 200,00",
  "Total ambiente: R$ 200,00", "VALOR TOTAL DO ORÇAMENTO: R$ 250,00",
]);
assert.equal(doc.ambientes[0].itens[0].valorBruto, 200);
const combinado = app.M.PdfImport.combinar(doc, null);
assert.equal(combinado.valorBrutoTotal, 250);
assert.equal(combinado.itensOrc.reduce((s,i)=>s+i.valorBruto,0), 250);

const osSemValor = app.M.PdfImport.parseDocumento([
  "ORDEM DE SERVIÇO Nº 2026/998", "Cliente: Teste Responsável: Pessoa Externa Telefone: 11 Email: teste@exemplo.com",
  "SALA", "Painel", "Quantidade: 2", "OBSERVAÇÕES DO ORÇAMENTO",
]);
const combinadoSemValor = app.M.PdfImport.combinar(null, osSemValor);
assert.equal(combinadoSemValor.valorBrutoTotal, 0);
assert.equal(combinadoSemValor.temValores, false);

// Store: OS equivalente não pode entrar duas vezes.
executar(app, "js/store.js");
const existente = app.M.Store.state.obras[0];
const antes = app.M.Store.state.obras.length;
const duplicada = app.M.Store.criarObra({numeroOS:String(existente.numeroOS).replace("OS ", "os-")});
assert.equal(duplicada.ok, false);
assert.equal(duplicada.motivo, "OS_DUPLICADA");
assert.equal(app.M.Store.state.obras.length, antes);
const invalida = app.M.Store.criarObra({numeroOS:"OS 9999/1", responsavel:"Pessoa Externa", valorLiquido:100});
assert.equal(invalida.motivo, "RESPONSAVEL_INVALIDO");
assert.equal(app.M.Store.state.obras.length, antes);
const semPreco = app.M.Store.criarObra({
  id:"obra-teste", numeroOS:"OS 9999/2", cliente:"Teste", responsavel:"Willian Souza",
  valorBruto:0, valorLiquido:100, ambientes:[{
    id:"amb-teste", nome:"SALA", valorBrutoPct:1, moveis:[{
      id:"mov-teste", nome:"Painel", componentesCriticosIniciais:[], componentesCriticos:[], valorLiquido:100,
    }],
  }],
});
assert.equal(semPreco.ok, true);
assert.equal(semPreco.obra.valorBruto, 100);
assert.equal(semPreco.obra.fatorLiquido, 1);
assert.equal(semPreco.obra.ambientes[0].valorLiquido, 100);
assert.equal(semPreco.obra.ambientes[0].moveis[0].historicoEtapas.length, 1);
assert.equal(app.M.Store.moverEtapa("mov-teste", "MEDICAO", {ignorarRequisitos:true}).ok, true);
assert.equal(semPreco.obra.ambientes[0].moveis[0].historicoEtapas.length, 2);

// Indicadores: marcos são contados no mês em que ocorreram, sem somar a
// carteira inteira novamente todo mês.
executar(app, "js/calc.js");
const inicioMes = app.M.Calc.periodoMesAtual().inicio;
const mesAnterior = new Date(inicioMes+"T12:00:00");
mesAnterior.setDate(0);
const dataMesAnterior = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth()+1).padStart(2,"0")}-${String(mesAnterior.getDate()).padStart(2,"0")}`;
app.M.Store.allMoveis = ()=>[{m:{
  etapa:"EMBALAGEM", valorLiquido:100, dataEntradaEtapa:app.M.todayISO(),
  historicoEtapas:[
    {de:null, para:"LIBERADA", data:dataMesAnterior},
    {de:"LIBERADA", para:"EMBALAGEM", data:app.M.todayISO()},
  ],
}}];
const indicadores = app.M.Calc.indicadores();
assert.equal(indicadores.liberado, 0);
assert.equal(indicadores.produzido, 100);
assert.equal(indicadores.moveisProduzidos, 1);

console.log("Regressões críticas: OK");
