// Página COP: motores manuais e leitura dos pesos (web/src/js/cop.js)
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {abrirPagina,criarDispositivo,esperar,PAGINAS}=require("./ambiente");

async function abrirConectada(){
    const pagina=abrirPagina(PAGINAS["cop.html"]);
    pagina.carregar();
    const plataforma=criarDispositivo("ESP32-BALANCA");
    await pagina.valor("conectarDispositivo")(plataforma);
    return {pagina,plataforma};
}

test("motor ligado pelo botão é reenviado antes do desligamento automático de 2 s",async t=>{
    const {pagina,plataforma}=await abrirConectada();
    t.after(()=>pagina.fechar());

    pagina.valor("toggleMotor")(0);
    await esperar(3500);

    const ligados=plataforma.comandos.filter(c=>c==="V,1,0,0,0");
    assert.ok(ligados.length>=3,`só ${ligados.length} comandos em 3,5 s: o ESP32 desligaria o motor`);
    assert.equal(pagina.elemento("btnMotor0").textContent,"Desligar Frente Esquerda");
});

test("depois de desligar pelo botão, o reenvio para",async t=>{
    const {pagina,plataforma}=await abrirConectada();
    t.after(()=>pagina.fechar());

    pagina.valor("toggleMotor")(1);
    await esperar(1200);
    pagina.valor("toggleMotor")(1);
    await esperar(100);
    const antes=plataforma.comandos.length;
    await esperar(3000);

    assert.equal(plataforma.comandos.at(-1),"V,0,0,0,0");
    assert.equal(plataforma.comandos.length,antes,"continuou mandando comandos com tudo desligado");
});

test("se a conexão cai, os botões voltam a mostrar os motores desligados",async t=>{
    const {pagina,plataforma}=await abrirConectada();
    t.after(()=>pagina.fechar());

    pagina.valor("toggleMotor")(2);
    plataforma.ligado=false;
    plataforma.gatt.disconnect();

    assert.equal(pagina.elemento("btnMotor2").textContent,"Ligar Frente Direita");
    assert.deepEqual(JSON.parse(JSON.stringify(pagina.valor("motoresEstado"))),[0,0,0,0]);
});

test("comandos dos motores nunca são escritos ao mesmo tempo",async t=>{
    const {pagina,plataforma}=await abrirConectada();
    t.after(()=>pagina.fechar());
    plataforma.atrasoEscrita=300; // escrita BLE lenta

    for(let i=0;i<4;i++)pagina.valor("toggleMotor")(i);
    await esperar(2500);

    assert.equal(plataforma.maxEscritasSimultaneas,1);
    assert.equal(plataforma.comandos.at(-1),"V,1,1,1,1","o último estado precisa chegar");
});

test("pacote cortado não altera o COP",async t=>{
    const {pagina,plataforma}=await abrirConectada();
    t.after(()=>pagina.fechar());

    plataforma.notificar("P,10.23,12.45,9.87,11.02\n");
    const copValido=pagina.valor("copX");
    assert.ok(Math.abs(copValido-(-0.041))<0.001);

    plataforma.notificar("P,10.23,12.45,9.87,1");      // cortado: o último peso viraria 1 kg
    assert.equal(pagina.valor("TD"),11.02,"o pacote cortado foi aceito");
    assert.equal(pagina.valor("copX"),copValido);

    plataforma.notificar("P,10.23,12.45,9.87,11.02\n"); // junta com o cortado e é descartado
    assert.equal(pagina.valor("copX"),copValido);
});
