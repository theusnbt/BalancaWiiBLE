// Reconexão automática à plataforma já autorizada antes neste navegador.
//
// Usa navigator.bluetooth.getDevices() e watchAdvertisements(), que no Chrome/Edge
// podem exigir ativar chrome://flags/#enable-web-bluetooth-new-permissions-backend.
// Sem esse suporte não faz nada e o botão de conectar continua funcionando normalmente.
//
// aoEncontrar(dispositivo): função da página que conecta ao dispositivo encontrado.
// Ela deve lançar erro se o dispositivo não for a plataforma, e chamar
// pararReconexaoAutomatica() quando a conexão der certo.

const INTERVALO_ENTRE_TENTATIVAS=2000; // ms: evita tentar a cada anúncio (~10 por segundo)

let buscaAtiva=null;

async function reconectarAutomaticamente(aoEncontrar){
    if(!navigator.bluetooth?.getDevices)return false;
    pararReconexaoAutomatica();

    let dispositivos;
    try{
        dispositivos=await navigator.bluetooth.getDevices();
    }catch(erro){
        console.warn("Reconexão automática indisponível:",erro);
        return false;
    }
    if(!dispositivos.length)return false;

    console.log("Procurando plataforma já autorizada...");
    const busca={observados:[],conectando:false};
    buscaAtiva=busca;

    // tenta um dispositivo; outros aparelhos autorizados (fones etc.) são descartados
    const tentar=async(dispositivo,observado)=>{
        if(busca!==buscaAtiva||busca.conectando)return false;
        if(observado&&Date.now()-observado.ultimaTentativa<INTERVALO_ENTRE_TENTATIVAS)return false;
        busca.conectando=true;
        if(observado)observado.ultimaTentativa=Date.now();
        try{
            await aoEncontrar(dispositivo);
            return true;
        }catch(erro){
            if(erro?.name==="NotFoundError"){
                console.log("Ignorando",dispositivo.name,"(não é a plataforma)");
                if(observado)pararDeObservar(observado);
            }else{
                console.warn("Falha ao conectar em",dispositivo.name,erro);
            }
            return false;
        }finally{
            busca.conectando=false;
        }
    };

    for(const dispositivo of dispositivos){
        if(busca!==buscaAtiva)break;
        // sem watchAdvertisements, tenta conectar direto (funciona se a plataforma estiver ligada)
        if(!dispositivo.watchAdvertisements){
            if(await tentar(dispositivo,null))break;
            continue;
        }
        // espera o dispositivo "aparecer" no ar antes de conectar
        const observado={dispositivo,controle:new AbortController(),ultimaTentativa:0};
        observado.ouvinte=()=>tentar(dispositivo,observado);
        dispositivo.addEventListener("advertisementreceived",observado.ouvinte);
        busca.observados.push(observado);
        try{
            await dispositivo.watchAdvertisements({signal:observado.controle.signal});
        }catch(erro){
            console.warn("Não foi possível observar",dispositivo.name,erro);
        }
    }
    return true;
}

function pararDeObservar(observado){
    observado.controle.abort();
    observado.dispositivo.removeEventListener("advertisementreceived",observado.ouvinte);
}

function pararReconexaoAutomatica(){
    if(!buscaAtiva)return;
    buscaAtiva.observados.forEach(pararDeObservar);
    buscaAtiva=null;
}
