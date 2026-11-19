// Jogo do Equilíbrio e Bolinha no Buraco: motores conforme a balança
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {abrirPagina,criarDispositivo,esperar,PAGINAS}=require("./ambiente");

// motores na ordem FE, TE, FD, TD
const intensidades=comando=>comando.slice(2).split(",").map(Number);

async function abrirConectada(nomePagina){
    const pagina=abrirPagina(PAGINAS[nomePagina]);
    pagina.carregar();
    const plataforma=criarDispositivo("ESP32-BALANCA");
    await pagina.valor("conectarDispositivo")(plataforma);
    return {pagina,plataforma};
}

// manda pacotes como o firmware: 10 por segundo, terminados em "\n"
async function enviarPesos(plataforma,pacote,quantidade){
    for(let i=0;i<quantidade;i++){
        plataforma.notificar(pacote+"\n");
        await esperar(100);
    }
}

test("Equilíbrio: inclinado para a direita vibra só os motores da direita",async t=>{
    const {pagina,plataforma}=await abrirConectada("jogo.html");
    t.after(()=>pagina.fechar());

    await enviarPesos(plataforma,"P,10,10,30,30",15);
    const [fe,te,fd,td]=intensidades(plataforma.comandos.at(-1));
    assert.equal(fe,0);
    assert.equal(te,0);
    assert.ok(fd>0&&td>0,`direita deveria vibrar: ${plataforma.comandos.at(-1)}`);
});

test("Equilíbrio: inclinado para a frente vibra só os motores da frente",async t=>{
    const {pagina,plataforma}=await abrirConectada("jogo.html");
    t.after(()=>pagina.fechar());

    await enviarPesos(plataforma,"P,30,10,30,10",15);
    const [fe,te,fd,td]=intensidades(plataforma.comandos.at(-1));
    assert.ok(fe>0&&fd>0);
    assert.equal(te,0);
    assert.equal(td,0);
});

test("Equilíbrio: no centro nada vibra",async t=>{
    const {pagina,plataforma}=await abrirConectada("jogo.html");
    t.after(()=>pagina.fechar());

    await enviarPesos(plataforma,"P,15,15,15,15",15);
    assert.equal(plataforma.comandos.at(-1),"I,0,0,0,0");
});

test("Equilíbrio: sem ninguém na plataforma (ruído abaixo de 10 kg) os motores desligam",async t=>{
    const {pagina,plataforma}=await abrirConectada("jogo.html");
    t.after(()=>pagina.fechar());

    await enviarPesos(plataforma,"P,10,10,30,30",10);
    await enviarPesos(plataforma,"P,0.8,-0.3,1.2,0.4",10);
    assert.equal(plataforma.comandos.at(-1),"I,0,0,0,0");
});

test("Bolinha: cair no buraco da frente-direita vibra só o motor desse canto",async t=>{
    const {pagina,plataforma}=await abrirConectada("bolinha.html");
    t.after(()=>pagina.fechar());

    // inclina para a frente-direita e roda a animação até a bolinha cair
    let tempo=0;
    for(let i=0;i<600&&pagina.valor("bola.estado")!=="caindo";i++){
        if(i%6===0)plataforma.notificar("P,22,8,32,12\n");
        tempo+=1000/60;
        pagina.quadro(tempo);
    }
    assert.equal(pagina.valor("bola.estado"),"caindo","a bolinha não caiu em 10 s");
    assert.equal(pagina.valor("bola.buraco"),2,"deveria ser o buraco Frente Direita");
    await esperar(50);
    assert.equal(plataforma.comandos.at(-1),"I,0,0,255,0");

    await esperar(1000); // TEMPO_VIBRACAO = 700 ms
    assert.equal(plataforma.comandos.at(-1),"I,0,0,0,0","a vibração precisa parar");
    assert.equal(pagina.elemento("placar").textContent,"Bolinhas no buraco: 1");
});

test("Bolinha: sem ninguém na plataforma o tabuleiro volta a ficar reto",async t=>{
    const {pagina,plataforma}=await abrirConectada("bolinha.html");
    t.after(()=>pagina.fechar());

    await enviarPesos(plataforma,"P,10,10,30,30",10);
    assert.ok(pagina.valor("alvoX")>0.3);
    await enviarPesos(plataforma,"P,0.5,0.2,-0.4,0.1",15);
    assert.ok(Math.abs(pagina.valor("alvoX"))<0.01,`alvoX=${pagina.valor("alvoX")}`);
});
