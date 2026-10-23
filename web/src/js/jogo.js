const SERVICE_UUID="12345678-1234-1234-1234-1234567890ab";
const PESO_UUID="11111111-1111-1111-1111-111111111111";
const CMD_UUID="22222222-2222-2222-2222-222222222222";

let bleDevice=null,bleCharacteristic=null,cmdCharacteristic=null;
let tentativasReconexao=0;
const MAX_TENTATIVAS_RECONEXAO=5,TEMPO_RECONEXAO=1500;
let bufferBLE="";
const PESO_MINIMO_TOTAL=10; // kg: abaixo disso não há ninguém na plataforma (evita que o ruído da balança vazia vire movimento)

// --- Vibração conforme a inclinação ---
const ZONA_CENTRAL=0.08;    // |COP| abaixo disso não vibra
const ALCANCE_MAX=0.6;      // |COP| a partir do qual a vibração é máxima
const PWM_MIN=90;           // menor PWM que ainda faz o motor girar
const PWM_MAX=255;
const SUAVIZACAO=0.5;       // média móvel exponencial (0..1): menor = mais suave, porém com mais atraso
const INTERVALO_ENVIO=150;  // ms entre comandos (abaixo do MOTOR_TIMEOUT do ESP32)

let incX=0,incY=0,comPeso=false;
// posição e opacidade desenhadas: seguem os valores reais aos poucos, para o movimento ficar suave
let bolaX=0,bolaY=0,bolaOpacidade=0;
const SUAVIDADE_DESENHO=0.25;
let ultimoEnvio=0,enviando=false;
const intensidades=[0,0,0,0]; // ordem FE, TE, FD, TD (igual aos MOTOR_PINS do ESP32)

let canvasAlvo,ctxAlvo;

document.addEventListener("DOMContentLoaded",()=>{
    canvasAlvo=document.getElementById("alvo");
    ctxAlvo=canvasAlvo.getContext("2d");

    // segurança: nunca deixar motores ligados ao sair da página
    window.addEventListener("pagehide",()=>enviarIntensidades([0,0,0,0],true));

    requestAnimationFrame(animar);
    reconectarAutomaticamente(conectarDispositivo);
});

// ================= BLE =================

async function conectarPlataforma(){
    try{
        if(!navigator.bluetooth){
            alert("Este navegador não suporta Bluetooth. Use o Google Chrome ou o Microsoft Edge.");
            return;
        }
        const dispositivo=await navigator.bluetooth.requestDevice({
            filters:[{services:[SERVICE_UUID]}]
        });
        await conectarDispositivo(dispositivo);
    }catch(erro){
        console.error("Erro BLE:",erro);
    }
    atualizarBotao();
}

// usada pelo botão e pela reconexão automática (reconexao.js)
async function conectarDispositivo(dispositivo){
    if(cmdCharacteristic)return;
    bleDevice=dispositivo;
    bleDevice.removeEventListener("gattserverdisconnected",onDesconectado);
    bleDevice.addEventListener("gattserverdisconnected",onDesconectado);
    await prepararConexao();
    tentativasReconexao=0;
    atualizarBotao();
}

async function prepararConexao(){
    const server=await bleDevice.gatt.connect();
    const service=await server.getPrimaryService(SERVICE_UUID);

    bleCharacteristic=await service.getCharacteristic(PESO_UUID);
    await bleCharacteristic.startNotifications();
    bleCharacteristic.removeEventListener("characteristicvaluechanged",receberPesos);
    bleCharacteristic.addEventListener("characteristicvaluechanged",receberPesos);

    cmdCharacteristic=await service.getCharacteristic(CMD_UUID);
}

function onDesconectado(){
    console.warn("BLE desconectado.");
    bleCharacteristic=null;
    cmdCharacteristic=null;
    comPeso=false;
    if(tentativasReconexao<MAX_TENTATIVAS_RECONEXAO){
        tentativasReconexao++;
        setTimeout(reconectar,TEMPO_RECONEXAO);
    }else{
        atualizarBotao();
    }
}

async function reconectar(){
    if(!bleDevice)return;
    try{
        await prepararConexao();
        tentativasReconexao=0;
    }catch(erro){
        console.error("Erro ao reconectar:",erro);
        if(tentativasReconexao<MAX_TENTATIVAS_RECONEXAO){
            tentativasReconexao++;
            setTimeout(reconectar,TEMPO_RECONEXAO);
        }
    }
    atualizarBotao();
}

// o botão só aparece enquanto não houver conexão
function atualizarBotao(){
    document.getElementById("btnConectar").hidden=!!cmdCharacteristic;
}

function receberPesos(event){
    try{
        bufferBLE+=new TextDecoder().decode(event.target.value);
        if(bufferBLE.includes("\n")){
            const mensagens=bufferBLE.split("\n");
            bufferBLE=mensagens.pop();
            mensagens.forEach(m=>processarPacote(m.trim()));
        }else{
            const match=bufferBLE.match(/P,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
            if(match){
                processarPacote(match[0]);
                bufferBLE=bufferBLE.substring(bufferBLE.indexOf(match[0])+match[0].length);
            }
        }
    }catch(erro){
        console.error("Erro ao receber BLE:",erro);
    }
}

function processarPacote(dados){
    if(!dados.startsWith("P,"))return;
    const valores=dados.split(",").slice(1).map(Number);
    if(valores.length!==4||valores.some(v=>!Number.isFinite(v)))return;
    const [FE,TE,FD,TD]=valores;
    const total=FE+TE+FD+TD;

    // sem ninguém na plataforma: motores desligados e sem bolinha
    if(!Number.isFinite(total)||total<PESO_MINIMO_TOTAL){
        intensidades.fill(0);
        enviarIntensidades(intensidades,false);
        comPeso=false;
        return;
    }
    // fora de -1..1 só acontece com leitura negativa de alguma célula; limita à borda da plataforma
    atualizarInclinacao(limitar(((FD+TD)-(FE+TE))/total),limitar(((FE+FD)-(TE+TD))/total));
}

function limitar(v){
    return Math.max(-1,Math.min(1,v));
}

// Envia "I,a,b,c,d" com limite de taxa; evita escritas BLE sobrepostas
async function enviarIntensidades(valores,forcar){
    if(!cmdCharacteristic)return;
    const agora=performance.now();
    if(!forcar&&(enviando||agora-ultimoEnvio<INTERVALO_ENVIO))return;
    enviando=true;
    ultimoEnvio=agora;
    try{
        await cmdCharacteristic.writeValue(new TextEncoder().encode("I,"+valores.join(",")));
    }catch(erro){
        console.error("Erro ao enviar intensidades:",erro);
    }finally{
        enviando=false;
    }
}

// ================= INCLINAÇÃO =================

// Converte o deslocamento (0..1) em PWM, respeitando zona central e PWM mínimo do motor
function intensidadeMotor(deslocamento){
    const t=Math.min(1,Math.max(0,(deslocamento-ZONA_CENTRAL)/(ALCANCE_MAX-ZONA_CENTRAL)));
    return t>0?Math.round(PWM_MIN+t*(PWM_MAX-PWM_MIN)):0;
}

function atualizarInclinacao(copX,copY){
    incX+=(copX-incX)*SUAVIZACAO;
    incY+=(copY-incY)*SUAVIZACAO;

    const direita=intensidadeMotor(incX),esquerda=intensidadeMotor(-incX);
    const frente=intensidadeMotor(incY),tras=intensidadeMotor(-incY);
    intensidades[0]=Math.max(esquerda,frente);
    intensidades[1]=Math.max(esquerda,tras);
    intensidades[2]=Math.max(direita,frente);
    intensidades[3]=Math.max(direita,tras);
    enviarIntensidades(intensidades,false);
    comPeso=true;
}

function animar(){
    bolaX+=(incX-bolaX)*SUAVIDADE_DESENHO;
    bolaY+=(incY-bolaY)*SUAVIDADE_DESENHO;
    bolaOpacidade+=((comPeso?1:0)-bolaOpacidade)*SUAVIDADE_DESENHO;
    desenharAlvo();
    requestAnimationFrame(animar);
}

function desenharAlvo(){
    const w=canvasAlvo.width,h=canvasAlvo.height;
    const cx=w/2,cy=h/2,raio=w/2-40;
    const pxPorUnidade=raio/ALCANCE_MAX;
    ctxAlvo.clearRect(0,0,w,h);

    // anéis suaves de referência
    [1,0.66,0.33].forEach((f,i)=>{
        ctxAlvo.fillStyle=["#b4c0bd","#aab8b3","#9fb0aa"][i];
        ctxAlvo.beginPath();
        ctxAlvo.arc(cx,cy,raio*f,0,Math.PI*2);
        ctxAlvo.fill();
    });
    ctxAlvo.strokeStyle="#93a5ab";
    ctxAlvo.lineWidth=2;
    ctxAlvo.beginPath();
    ctxAlvo.arc(cx,cy,raio,0,Math.PI*2);
    ctxAlvo.stroke();

    // cruz de referência
    ctxAlvo.setLineDash([6,10]);
    ctxAlvo.beginPath();
    ctxAlvo.moveTo(cx-raio,cy);
    ctxAlvo.lineTo(cx+raio,cy);
    ctxAlvo.moveTo(cx,cy-raio);
    ctxAlvo.lineTo(cx,cy+raio);
    ctxAlvo.stroke();
    ctxAlvo.setLineDash([]);

    // rótulos de direção
    ctxAlvo.fillStyle="#4c6375";
    ctxAlvo.font="600 22px 'Segoe UI', system-ui, Arial, sans-serif";
    ctxAlvo.textAlign="center";
    ctxAlvo.textBaseline="middle";
    ctxAlvo.fillText("Frente",cx,20);
    ctxAlvo.fillText("Trás",cx,h-20);
    ctxAlvo.save();
    ctxAlvo.translate(20,cy);
    ctxAlvo.rotate(-Math.PI/2);
    ctxAlvo.fillText("Esquerda",0,0);
    ctxAlvo.restore();
    ctxAlvo.save();
    ctxAlvo.translate(w-20,cy);
    ctxAlvo.rotate(Math.PI/2);
    ctxAlvo.fillText("Direita",0,0);
    ctxAlvo.restore();

    if(bolaOpacidade<0.01)return;

    // bolinha = inclinação atual (limitada à borda do círculo)
    const raioBola=28,limite=raio-raioBola;
    let bx=bolaX*pxPorUnidade,by=-bolaY*pxPorUnidade;
    const dist=Math.hypot(bx,by);
    if(dist>limite){bx*=limite/dist;by*=limite/dist;}
    const x=cx+bx,y=cy+by;

    ctxAlvo.globalAlpha=bolaOpacidade;
    const brilho=ctxAlvo.createRadialGradient(x,y,raioBola*0.6,x,y,raioBola*2.4);
    brilho.addColorStop(0,"rgba(70,150,132,0.35)");
    brilho.addColorStop(1,"rgba(70,150,132,0)");
    ctxAlvo.fillStyle=brilho;
    ctxAlvo.beginPath();
    ctxAlvo.arc(x,y,raioBola*2.4,0,Math.PI*2);
    ctxAlvo.fill();

    ctxAlvo.fillStyle="#5aa996";
    ctxAlvo.strokeStyle="#f2f6f5";
    ctxAlvo.lineWidth=5;
    ctxAlvo.beginPath();
    ctxAlvo.arc(x,y,raioBola,0,Math.PI*2);
    ctxAlvo.fill();
    ctxAlvo.stroke();
    ctxAlvo.globalAlpha=1;
}
