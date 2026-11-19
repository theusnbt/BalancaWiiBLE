// Ambiente de navegador simulado para testar as páginas sem navegador nem plataforma.
// Carrega os scripts reais de web/src/js num contexto isolado (vm), com DOM, canvas,
// relógio e Bluetooth falsos.

const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

// BALANCA_JS permite rodar os testes contra outra cópia dos scripts (ex.: uma versão antiga)
const PASTA_JS=process.env.BALANCA_JS||path.join(__dirname,"..","web","src","js");

// O relógio da página anda ACELERACAO vezes mais rápido que o real: as esperas de
// reconexão (1,5 s) e de reenvio dos motores (1 s) cabem em poucos milissegundos.
const ACELERACAO=50;

function criarElemento(id){
    return {
        id,hidden:false,textContent:"",width:600,height:600,style:{},
        classList:{toggle(){},add(){},remove(){}},
        addEventListener(){},insertAdjacentHTML(){},replaceWith(){},appendChild(){},prepend(){},
        getContext:()=>criarContexto2D()
    };
}

// contexto 2D que aceita qualquer chamada de desenho sem fazer nada
function criarContexto2D(){
    const gradiente={addColorStop(){}};
    return new Proxy({},{
        get(alvo,prop){
            if(prop in alvo)return alvo[prop];
            if(prop==="createLinearGradient"||prop==="createRadialGradient")return ()=>gradiente;
            return ()=>{};
        },
        set(alvo,prop,valor){alvo[prop]=valor;return true;}
    });
}

// Abre uma página: scripts = nomes dos arquivos em web/src/js, na ordem do HTML.
function abrirPagina(scripts){
    const elementos=new Map();
    const aoCarregar=[];
    const quadros=[];
    const intervalos=[];
    const temporizadores=[];
    const inicio=performance.now();
    const inicioData=Date.now();
    const agora=()=>(performance.now()-inicio)*ACELERACAO;

    const documento={
        getElementById(id){
            if(!elementos.has(id))elementos.set(id,criarElemento(id));
            return elementos.get(id);
        },
        createElement:tag=>criarElemento(tag),
        addEventListener(tipo,fn){if(tipo==="DOMContentLoaded")aoCarregar.push(fn);},
        body:criarElemento("body")
    };

    const contexto={
        console:{log(){},warn(){},error(){}},
        document:documento,
        navigator:{},
        performance:{now:agora},
        // Date.now() parte da data real, como no navegador; performance.now() parte de 0
        Date:class extends Date{static now(){return inicioData+agora();}},
        setTimeout:(fn,ms=0,...a)=>{const t=setTimeout(fn,ms/ACELERACAO,...a);temporizadores.push(t);return t;},
        clearTimeout,
        setInterval:(fn,ms=0,...a)=>{const t=setInterval(fn,Math.max(1,ms/ACELERACAO),...a);intervalos.push(t);return t;},
        clearInterval,
        requestAnimationFrame:fn=>{quadros.push(fn);return quadros.length;},
        alert(){},
        // APIs do navegador que o vm não traz (Math, Promise etc. já existem no contexto)
        TextEncoder,TextDecoder,EventTarget,Event,DOMException,AbortController
    };
    contexto.window={addEventListener(){}};
    vm.createContext(contexto);

    for(const nome of scripts){
        const codigo=fs.readFileSync(path.join(PASTA_JS,nome),"utf8");
        vm.runInContext(codigo,contexto,{filename:nome});
    }

    const pagina={
        contexto,
        // lê ou escreve variáveis da página (inclusive const/let do topo dos scripts)
        valor:expr=>vm.runInContext(expr,contexto),
        definir(nome,valor){contexto.__valor=valor;vm.runInContext(`${nome}=__valor`,contexto);},
        elemento:id=>documento.getElementById(id),
        bluetooth(dispositivos){contexto.navigator.bluetooth={getDevices:async()=>dispositivos};},
        carregar(){aoCarregar.forEach(fn=>fn());},
        // roda um quadro de animação no instante t (ms)
        quadro(t){const fns=quadros.splice(0);fns.forEach(fn=>fn(t));},
        fechar(){intervalos.forEach(clearInterval);temporizadores.forEach(clearTimeout);}
    };
    return pagina;
}

// espera em tempo da página (já acelerado)
const esperar=msPagina=>new Promise(r=>setTimeout(r,msPagina/ACELERACAO));

// Dispositivo Bluetooth falso. temServico=false simula outro aparelho (ex.: fone).
function criarDispositivo(nome,temServico=true){
    const d=new EventTarget();
    d.name=nome;
    d.ligado=true;
    d.observando=false;
    d.tentativas=0;
    d.comandos=[];
    d.escritasSimultaneas=0;
    d.maxEscritasSimultaneas=0;
    d.atrasoEscrita=0;
    const peso=new EventTarget();
    peso.startNotifications=async()=>{};
    const cmd={
        writeValue:async bytes=>{
            d.escritasSimultaneas++;
            d.maxEscritasSimultaneas=Math.max(d.maxEscritasSimultaneas,d.escritasSimultaneas);
            if(d.atrasoEscrita)await esperar(d.atrasoEscrita);
            d.comandos.push(new TextDecoder().decode(bytes));
            d.escritasSimultaneas--;
        }
    };
    d.cmd=cmd;
    d.peso=peso;
    d.gatt={
        connected:false,
        connect:async()=>{
            d.tentativas++;
            if(!d.ligado)throw new DOMException("fora de alcance","NetworkError");
            d.gatt.connected=true;
            return{getPrimaryService:async()=>{
                if(!temServico)throw new DOMException("serviço não encontrado","NotFoundError");
                return{getCharacteristic:async uuid=>uuid.startsWith("1111")?peso:cmd};
            }};
        },
        disconnect(){
            if(!d.gatt.connected)return;
            d.gatt.connected=false;
            d.dispatchEvent(new Event("gattserverdisconnected"));
        }
    };
    d.watchAdvertisements=async({signal}={})=>{
        d.observando=true;
        signal?.addEventListener("abort",()=>{d.observando=false;});
    };
    d.anunciar=()=>{if(d.observando)d.dispatchEvent(new Event("advertisementreceived"));};
    // a plataforma "manda" um texto pela notificação de peso
    d.notificar=texto=>{
        const ev=new Event("characteristicvaluechanged");
        Object.defineProperty(ev,"target",{value:{value:new TextEncoder().encode(texto)}});
        peso.dispatchEvent(ev);
    };
    return d;
}

const PAGINAS={
    "cop.html":["reconexao.js","protocolo.js","cop.js"],
    "jogo.html":["reconexao.js","protocolo.js","jogo.js"],
    "bolinha.html":["reconexao.js","protocolo.js","bolinha.js"]
};

module.exports={abrirPagina,criarDispositivo,esperar,PAGINAS};
