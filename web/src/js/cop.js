const SERVICE_UUID="12345678-1234-1234-1234-1234567890ab";
const PESO_UUID="11111111-1111-1111-1111-111111111111";
const CMD_UUID="22222222-2222-2222-2222-222222222222";

let canvasTime,ctxTime,canvasSpace,ctxSpace;
let bleDevice=null,bleCharacteristic=null,cmdCharacteristic=null;
let tentativasReconexao=0;
const MAX_TENTATIVAS_RECONEXAO=5,TEMPO_RECONEXAO=1500;
let bufferBLE="";
let FE=0,TE=0,FD=0,TD=0,copX=0,copY=0;
const PESO_MINIMO_TOTAL=1;
const pontos=[],MAX_PONTOS_SPACE=500;
let motoresLigados=false;

let lastDrawTime=0;
const DRAW_INTERVAL=50; // ms entre cada redesenho no canvas

// --- Configuração física da plataforma (AJUSTE PARA O TAMANHO REAL) ---
const ESCALA_SPACE=170; // pixels por unidade de copX/copY (-1 a 1) no gráfico de espaço
const PLATAFORMA_METADE_X_CM=21.5; // metade da largura real da plataforma, em cm
const PLATAFORMA_METADE_Y_CM=21.5; // metade do comprimento real da plataforma, em cm
const INTERVALO_TICK_CM=5; // de quantos em quantos cm desenhar uma marcação

// --- Configuração do gráfico de tempo ---
const ESCALA_TEMPO=120; // pixels por unidade de copX/copY (-1 a 1) no gráfico de tempo
const JANELA_TEMPO_S=10; // quantos segundos ficam visíveis no gráfico
const INTERVALO_TICK_S=1; // de quantos em quantos segundos desenhar uma marcação

const tempoAmostras=[],copXTempo=[],copYTempo=[]; // arrays paralelos

document.addEventListener("DOMContentLoaded",()=>{
    canvasTime=document.getElementById("time");
    canvasSpace=document.getElementById("space");
    if(!canvasTime||!canvasSpace)return console.error("Canvas não encontrado.");
    ctxTime=canvasTime.getContext("2d");
    ctxSpace=canvasSpace.getContext("2d");
    desenharEixosTime();
    desenharEixosSpace();
});

async function conectionBLE() {
    try {
        if (!navigator.bluetooth) {
            throw new Error("Web Bluetooth não é suportado.");
        }

        console.log("Abrindo seletor BLE...");

        bleDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID]
        });

        console.log("Dispositivo encontrado:", bleDevice.name);

        bleDevice.addEventListener('gattserverdisconnected', onDisconnectedBLE);

        const server = await bleDevice.gatt.connect();
        console.log("GATT conectado!");

        const service = await server.getPrimaryService(SERVICE_UUID);
        console.log("Serviço encontrado!");

        bleCharacteristic =
            await service.getCharacteristic(PESO_UUID);

        console.log("Characteristic de peso encontrada!");

        await bleCharacteristic.startNotifications();

        bleCharacteristic.addEventListener(
            "characteristicvaluechanged",
            receberPesos
        );

        cmdCharacteristic =
            await service.getCharacteristic(CMD_UUID);

        console.log("Characteristic de comando encontrada!");

        tentativasReconexao = 0;

        console.log("🟢 Conectado!");

    } catch (erro) {
        console.error("🔴 Erro BLE:", erro);
    }
}

function onDisconnectedBLE(){
    console.warn("🔴 BLE desconectado.");
    bleCharacteristic=null;
    cmdCharacteristic=null;
    if(tentativasReconexao<MAX_TENTATIVAS_RECONEXAO){
        tentativasReconexao++;
        setTimeout(reconectarBLE,TEMPO_RECONEXAO);
    }
}

async function reconectarBLE(){
    if(!bleDevice)return;
    try{
        const server=await bleDevice.gatt.connect();
        const service=await server.getPrimaryService(SERVICE_UUID);

        bleCharacteristic=await service.getCharacteristic(PESO_UUID);
        await bleCharacteristic.startNotifications();
        bleCharacteristic.removeEventListener("characteristicvaluechanged",receberPesos);
        bleCharacteristic.addEventListener("characteristicvaluechanged",receberPesos);

        cmdCharacteristic=await service.getCharacteristic(CMD_UUID);

        tentativasReconexao=0;
        console.log("🟢 Reconectado!");
    }catch(erro){
        console.error("Erro ao reconectar:",erro);
        if(tentativasReconexao<MAX_TENTATIVAS_RECONEXAO){
            tentativasReconexao++;
            setTimeout(reconectarBLE,TEMPO_RECONEXAO);
        }
    }
}

function receberPesos(event){
    try{
        const dados=new TextDecoder().decode(event.target.value);
        bufferBLE+=dados;
        if(bufferBLE.includes("\n")){
            const mensagens=bufferBLE.split("\n");
            bufferBLE=mensagens.pop();
            mensagens.forEach(m=>processarPacoteBLE(m.trim()));
        }else{
            const match=bufferBLE.match(/P,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
            if(match){
                processarPacoteBLE(match[0]);
                bufferBLE=bufferBLE.substring(bufferBLE.indexOf(match[0])+match[0].length);
            }
        }
    }catch(erro){
        console.error("Erro ao receber BLE:",erro);
    }
}

function processarPacoteBLE(dados){
    if(!dados.startsWith("P,"))return;
    const partes=dados.split(",");
    if(partes.length!==5)return;
    const valores=partes.slice(1).map(Number);
    if(valores.length!==4||valores.some(v=>!Number.isFinite(v)))return;
    [FE,TE,FD,TD]=valores;
    if(!calcularCOP())return;

    const agora=performance.now();
    if(agora-lastDrawTime>=DRAW_INTERVAL){
        atualizarSpace();
        atualizarTime();
        lastDrawTime=agora;
    }
}

function calcularCOP(){
    const total=FE+TE+FD+TD;
    if(!Number.isFinite(total)||Math.abs(total)<PESO_MINIMO_TOTAL)return false;
    copX=((FD+TD)-(FE+TE))/total;
    copY=((FE+FD)-(TE+TD))/total;
    return Number.isFinite(copX)&&Number.isFinite(copY);
}

// ================= GRÁFICO DE ESPAÇO (cm) =================

function desenharEixosSpace(){
    if(!ctxSpace)return;
    ctxSpace.clearRect(0,0,canvasSpace.width,canvasSpace.height);
    const cx=canvasSpace.width/2,cy=canvasSpace.height/2;

    const pxPorCmX=ESCALA_SPACE/PLATAFORMA_METADE_X_CM;
    const pxPorCmY=ESCALA_SPACE/PLATAFORMA_METADE_Y_CM;

    // Eixos principais (destacados)
    ctxSpace.strokeStyle="#000000";
    ctxSpace.lineWidth=2.5;
    ctxSpace.beginPath();
    ctxSpace.moveTo(0,cy);
    ctxSpace.lineTo(canvasSpace.width,cy);
    ctxSpace.stroke();
    ctxSpace.beginPath();
    ctxSpace.moveTo(cx,0);
    ctxSpace.lineTo(cx,canvasSpace.height);
    ctxSpace.stroke();

    // Marcações (ticks) e rótulos em cm
    ctxSpace.strokeStyle="#999999";
    ctxSpace.lineWidth=1;
    ctxSpace.fillStyle="#333333";
    ctxSpace.font="10px sans-serif";
    ctxSpace.textAlign="center";
    ctxSpace.textBaseline="top";

    // Eixo X: positivo para a direita
    for(let cm=-PLATAFORMA_METADE_X_CM;cm<=PLATAFORMA_METADE_X_CM;cm+=INTERVALO_TICK_CM){
        if(Math.abs(cm)<0.001)continue;
        const x=cx+cm*pxPorCmX;
        ctxSpace.beginPath();
        ctxSpace.moveTo(x,cy-4);
        ctxSpace.lineTo(x,cy+4);
        ctxSpace.stroke();
        ctxSpace.fillText(cm.toFixed(0),x,cy+6);
    }

    // Eixo Y: positivo para cima, negativo para baixo
    ctxSpace.textAlign="left";
    ctxSpace.textBaseline="middle";
    for(let cm=-PLATAFORMA_METADE_Y_CM;cm<=PLATAFORMA_METADE_Y_CM;cm+=INTERVALO_TICK_CM){
        if(Math.abs(cm)<0.001)continue;
        const y=cy-cm*pxPorCmY;
        ctxSpace.beginPath();
        ctxSpace.moveTo(cx-4,y);
        ctxSpace.lineTo(cx+4,y);
        ctxSpace.stroke();
        ctxSpace.fillText(cm.toFixed(0),cx+6,y);
    }

    // Rótulos dos eixos
    ctxSpace.fillStyle="#000000";
    ctxSpace.font="12px sans-serif";
    ctxSpace.textAlign="right";
    ctxSpace.textBaseline="bottom";
    ctxSpace.fillText("X (cm)",canvasSpace.width-4,cy-6);
    ctxSpace.textAlign="left";
    ctxSpace.fillText("Y (cm)",cx+6,12);
}

function atualizarSpace(){
    pontos.push({x:copX,y:copY});
    if(pontos.length>MAX_PONTOS_SPACE)pontos.shift();
    desenharSpace();
}

function desenharSpace(){
    desenharEixosSpace();
    const cx=canvasSpace.width/2,cy=canvasSpace.height/2,escala=ESCALA_SPACE;
    if(!pontos.length)return;
    ctxSpace.strokeStyle="blue";
    ctxSpace.lineWidth=2;
    ctxSpace.beginPath();
    pontos.forEach((p,i)=>{
        const x=cx+p.x*escala,y=cy-p.y*escala;
        i?ctxSpace.lineTo(x,y):ctxSpace.moveTo(x,y);
    });
    ctxSpace.stroke();
    const p=pontos[pontos.length-1];
    ctxSpace.fillStyle="red";
    ctxSpace.beginPath();
    ctxSpace.arc(cx+p.x*escala,cy-p.y*escala,5,0,Math.PI*2);
    ctxSpace.fill();
}

// ================= GRÁFICO DE TEMPO (segundos / cm) =================

function desenharEixosTime(){
    if(!ctxTime)return;
    ctxTime.clearRect(0,0,canvasTime.width,canvasTime.height);
    const centro=canvasTime.height/2;
    const pxPorSegundo=canvasTime.width/JANELA_TEMPO_S;
    const pxPorCmX=ESCALA_TEMPO/PLATAFORMA_METADE_X_CM;

    // Eixo horizontal (centro vertical, referência 0 cm)
    ctxTime.strokeStyle="#000000";
    ctxTime.lineWidth=2.5;
    ctxTime.beginPath();
    ctxTime.moveTo(0,centro);
    ctxTime.lineTo(canvasTime.width,centro);
    ctxTime.stroke();

    // Eixo vertical (borda direita = "agora")
    ctxTime.beginPath();
    ctxTime.moveTo(canvasTime.width-1,0);
    ctxTime.lineTo(canvasTime.width-1,canvasTime.height);
    ctxTime.stroke();

    // Marcações de tempo (eixo X, em segundos, "agora" na direita)
    ctxTime.strokeStyle="#999999";
    ctxTime.lineWidth=1;
    ctxTime.fillStyle="#333333";
    ctxTime.font="10px sans-serif";
    ctxTime.textAlign="center";
    ctxTime.textBaseline="top";
    for(let s=0;s<=JANELA_TEMPO_S;s+=INTERVALO_TICK_S){
        const x=canvasTime.width-s*pxPorSegundo;
        ctxTime.beginPath();
        ctxTime.moveTo(x,centro-4);
        ctxTime.lineTo(x,centro+4);
        ctxTime.stroke();
        ctxTime.fillText("-"+s+"s",x,centro+6);
    }

    // Marcações verticais (cm), assumindo mesma metade de plataforma do eixo X
    ctxTime.textAlign="left";
    ctxTime.textBaseline="middle";
    for(let cm=-PLATAFORMA_METADE_X_CM;cm<=PLATAFORMA_METADE_X_CM;cm+=INTERVALO_TICK_CM){
        if(Math.abs(cm)<0.001)continue;
        const y=centro-cm*pxPorCmX;
        if(y<0||y>canvasTime.height)continue;
        ctxTime.beginPath();
        ctxTime.moveTo(0,y);
        ctxTime.lineTo(canvasTime.width,y);
        ctxTime.stroke();
        ctxTime.fillText(cm.toFixed(0),2,y);
    }

    // Rótulos dos eixos
    ctxTime.fillStyle="#000000";
    ctxTime.font="12px sans-serif";
    ctxTime.textAlign="right";
    ctxTime.textBaseline="bottom";
    ctxTime.fillText("Tempo (s)",canvasTime.width-4,centro-6);
    ctxTime.textAlign="left";
    ctxTime.fillText("cm",4,12);
}

function atualizarTime(){
    const agora=performance.now();

    tempoAmostras.push(agora);
    copXTempo.push(copX);
    copYTempo.push(copY);

    // Remove amostras fora da janela de tempo visível
    const limiteAntigo=agora-JANELA_TEMPO_S*1000;
    while(tempoAmostras.length&&tempoAmostras[0]<limiteAntigo){
        tempoAmostras.shift();
        copXTempo.shift();
        copYTempo.shift();
    }

    desenharTime();
}

function desenharTime(){
    desenharEixosTime();
    if(!tempoAmostras.length)return;

    const agora=performance.now();
    const centro=canvasTime.height/2;
    const pxPorSegundo=canvasTime.width/JANELA_TEMPO_S;

    // copX/copY (razão -1 a 1) plotados usando a mesma escala do eixo cm (ESCALA_TEMPO)
    ctxTime.strokeStyle="red";
    ctxTime.lineWidth=2;
    ctxTime.beginPath();
    tempoAmostras.forEach((t,i)=>{
        const x=canvasTime.width-(agora-t)/1000*pxPorSegundo;
        const y=centro-copXTempo[i]*ESCALA_TEMPO;
        i?ctxTime.lineTo(x,y):ctxTime.moveTo(x,y);
    });
    ctxTime.stroke();

    ctxTime.strokeStyle="blue";
    ctxTime.beginPath();
    tempoAmostras.forEach((t,i)=>{
        const x=canvasTime.width-(agora-t)/1000*pxPorSegundo;
        const y=centro-copYTempo[i]*ESCALA_TEMPO;
        i?ctxTime.lineTo(x,y):ctxTime.moveTo(x,y);
    });
    ctxTime.stroke();
}

// ================= UTILITÁRIOS =================

function limparGraficos(){
    pontos.length=0;
    tempoAmostras.length=0;
    copXTempo.length=0;
    copYTempo.length=0;
    copX=copY=0;
    desenharEixosSpace();
    desenharEixosTime();
}

function desconectarBLE(){
    if(bleDevice?.gatt?.connected)bleDevice.gatt.disconnect();
}

function statusBLE(){
    console.log(
        bleDevice?.gatt?.connected
        ?"🟢 BLE conectado: "+bleDevice.name
        :"🔴 BLE desconectado."
    );
}

async function enviarComandoMotores(estados) {
    if (!cmdCharacteristic) {
        console.warn("Característica de comando não disponível. Conecte-se primeiro.");
        return;
    }
    try {
        const comando = "V," + estados.join(",");
        const encoder = new TextEncoder();
        await cmdCharacteristic.writeValue(encoder.encode(comando));
        console.log("Comando enviado:", comando);
    } catch (erro) {
        console.error("Erro ao enviar comando:", erro);
    }
}

function toggleMotores() {
    motoresLigados = !motoresLigados;
    const estado = motoresLigados ? 1 : 0;
    enviarComandoMotores([estado, estado, estado, estado]);

    const botao = document.getElementById("btnMotores");
    if (botao) {
        botao.textContent = motoresLigados ? "Desligar Motores" : "Ligar Motores";
    }
}