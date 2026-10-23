// Reconexão automática à plataforma já autorizada antes neste navegador.
//
// Usa navigator.bluetooth.getDevices() e watchAdvertisements(), que no Chrome/Edge
// podem exigir ativar chrome://flags/#enable-web-bluetooth-new-permissions-backend.
// Sem esse suporte não faz nada e o botão de conectar continua funcionando normalmente.
//
// aoEncontrar(dispositivo): função da página que conecta ao dispositivo encontrado.
async function reconectarAutomaticamente(aoEncontrar){
    if(!navigator.bluetooth?.getDevices)return false;

    let dispositivos;
    try{
        dispositivos=await navigator.bluetooth.getDevices();
    }catch(erro){
        console.warn("Reconexão automática indisponível:",erro);
        return false;
    }
    if(!dispositivos.length)return false;

    console.log("Procurando plataforma já autorizada...");
    const controles=[];
    let encontrado=false;

    const conectar=async dispositivo=>{
        if(encontrado)return;
        encontrado=true;
        controles.forEach(c=>c.abort());
        try{
            await aoEncontrar(dispositivo);
        }catch(erro){
            console.error("Erro na reconexão automática:",erro);
            encontrado=false;
        }
    };

    for(const dispositivo of dispositivos){
        // sem watchAdvertisements, tenta conectar direto (funciona se a plataforma estiver ligada)
        if(!dispositivo.watchAdvertisements){
            await conectar(dispositivo);
            if(encontrado)break;
            continue;
        }
        // espera a plataforma "aparecer" no ar antes de conectar
        const controle=new AbortController();
        controles.push(controle);
        dispositivo.addEventListener("advertisementreceived",()=>conectar(dispositivo),{once:true});
        try{
            await dispositivo.watchAdvertisements({signal:controle.signal});
        }catch(erro){
            console.warn("Não foi possível observar",dispositivo.name,erro);
        }
    }
    return true;
}
