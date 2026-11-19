// Reconexão automática nas três páginas (web/src/js/reconexao.js + conexão de cada página)
const {test,describe}=require("node:test");
const assert=require("node:assert/strict");
const {abrirPagina,criarDispositivo,esperar,PAGINAS}=require("./ambiente");

// abre a página com estes aparelhos já autorizados no navegador
async function abrir(nomePagina,dispositivos){
    const pagina=abrirPagina(PAGINAS[nomePagina]);
    pagina.bluetooth(dispositivos);
    pagina.carregar();
    await esperar(50);
    const conectadoA=d=>pagina.valor("cmdCharacteristic")===d.cmd;
    return {pagina,conectadoA};
}

for(const nomePagina of Object.keys(PAGINAS)){
    describe(nomePagina,()=>{
        test("conecta sozinha quando a plataforma aparece",async t=>{
            const plataforma=criarDispositivo("ESP32-BALANCA");
            const {pagina,conectadoA}=await abrir(nomePagina,[plataforma]);
            t.after(()=>pagina.fechar());

            plataforma.anunciar();
            await esperar(100);
            assert.ok(conectadoA(plataforma));
            assert.equal(plataforma.observando,false,"a busca deve parar depois de conectar");
        });

        test("outro aparelho autorizado (fone) não atrapalha",async t=>{
            const fone=criarDispositivo("Fone",false);
            const plataforma=criarDispositivo("ESP32-BALANCA");
            const {pagina,conectadoA}=await abrir(nomePagina,[fone,plataforma]);
            t.after(()=>pagina.fechar());

            fone.anunciar();
            await esperar(100);
            plataforma.anunciar();
            await esperar(100);
            assert.ok(conectadoA(plataforma));
            assert.equal(fone.gatt.connected,false,"não pode ficar conectada ao fone");
        });

        test("fone anunciando sem parar é tentado uma vez só",async t=>{
            const fone=criarDispositivo("Fone",false);
            const {pagina}=await abrir(nomePagina,[fone,criarDispositivo("ESP32-BALANCA")]);
            t.after(()=>pagina.fechar());

            for(let i=0;i<20;i++){fone.anunciar();await esperar(100);}
            assert.equal(fone.tentativas,1);
        });

        test("queda rápida: reconecta dentro das tentativas",async t=>{
            const plataforma=criarDispositivo("ESP32-BALANCA");
            const {pagina,conectadoA}=await abrir(nomePagina,[plataforma]);
            t.after(()=>pagina.fechar());

            plataforma.anunciar();
            await esperar(100);
            plataforma.gatt.disconnect();
            await esperar(2000);
            assert.ok(conectadoA(plataforma));
        });

        test("plataforma desligada por muito tempo reconecta quando volta",async t=>{
            const plataforma=criarDispositivo("ESP32-BALANCA");
            const {pagina,conectadoA}=await abrir(nomePagina,[plataforma]);
            t.after(()=>pagina.fechar());

            plataforma.anunciar();
            await esperar(100);
            plataforma.ligado=false;
            plataforma.gatt.disconnect();
            await esperar(10000);            // passa das 5 tentativas de 1,5 s
            assert.equal(conectadoA(plataforma),false);

            plataforma.ligado=true;
            plataforma.anunciar();
            await esperar(100);
            assert.ok(conectadoA(plataforma));
        });

        test("conectar pelo botão para a busca automática",async t=>{
            const plataforma=criarDispositivo("ESP32-BALANCA");
            const {pagina,conectadoA}=await abrir(nomePagina,[plataforma]);
            t.after(()=>pagina.fechar());

            await pagina.valor("conectarDispositivo")(plataforma);
            assert.ok(conectadoA(plataforma));
            assert.equal(plataforma.observando,false);
        });

        test("navegador sem o recurso: não quebra",async t=>{
            const pagina=abrirPagina(PAGINAS[nomePagina]);
            t.after(()=>pagina.fechar());
            pagina.carregar();
            assert.equal(await pagina.valor("reconectarAutomaticamente")(()=>{}),false);
        });
    });
}
