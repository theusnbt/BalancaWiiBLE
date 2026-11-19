// Leitura dos pacotes de peso (web/src/js/protocolo.js)
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {abrirPagina}=require("./ambiente");

const pagina=abrirPagina(["protocolo.js"]);
const ler=(buffer,recebido)=>pagina.valor("lerPacotesPeso")(buffer,recebido);
// normaliza os arrays do contexto da página para comparar com deepEqual
const pesos=lido=>JSON.parse(JSON.stringify(lido.pesos));

test("pacote completo vira os 4 pesos",()=>{
    const lido=ler("","P,10.23,12.45,9.87,11.02\n");
    assert.deepEqual(pesos(lido),[[10.23,12.45,9.87,11.02]]);
    assert.equal(lido.resto,"");
});

test("pacote cortado em 20 bytes (MTU padrão) não vira peso",()=>{
    const lido=ler("","P,10.23,12.45,9.87,1");
    assert.deepEqual(pesos(lido),[]);
    assert.equal(lido.resto,"P,10.23,12.45,9.87,1","fica guardado esperando o fim");
});

test("pacote cortado + próximo pacote: o cortado é descartado, o seguinte é aceito",()=>{
    let lido=ler("","P,10.23,12.45,9.87,1");
    lido=ler(lido.resto,"P,10.20,12.40,9.90,11.00\n");
    assert.deepEqual(pesos(lido),[],"a linha juntada tem campos demais e é descartada");
    lido=ler(lido.resto,"P,10.25,12.41,9.85,11.05\n");
    assert.deepEqual(pesos(lido),[[10.25,12.41,9.85,11.05]]);
});

test("pacote dividido em duas notificações é remontado",()=>{
    let lido=ler("","P,10.23,12.4");
    assert.deepEqual(pesos(lido),[]);
    lido=ler(lido.resto,"5,9.87,11.02\n");
    assert.deepEqual(pesos(lido),[[10.23,12.45,9.87,11.02]]);
});

test("vários pacotes numa notificação",()=>{
    const lido=ler("","P,1,2,3,4\nP,5,6,7,8\nP,9");
    assert.deepEqual(pesos(lido),[[1,2,3,4],[5,6,7,8]]);
    assert.equal(lido.resto,"P,9");
});

test("balança sem tara (nan) descarta o pacote",()=>{
    assert.deepEqual(pesos(ler("","P,10.00,nan,9.00,11.00\n")),[]);
});

test("campo vazio não é lido como zero",()=>{
    assert.deepEqual(pesos(ler("","P,10.00,,9.00,11.00\n")),[]);
});

test("texto que não é pacote de peso é ignorado",()=>{
    assert.deepEqual(pesos(ler("","Recebido: I,0,0,0,0\nX,1,2,3,4\n")),[]);
});

test("texto sem fim de linha não cresce para sempre (firmware antigo)",()=>{
    let resto="";
    for(let i=0;i<50;i++)resto=ler(resto,"P,10.23,12.45,9.87,11.02").resto;
    assert.ok(resto.length<=200,`resto com ${resto.length} caracteres`);
});
