const SERVICE_UUID="12345678-1234-1234-1234-1234567890ab";
const PESO_UUID="11111111-1111-1111-1111-111111111111";
const CMD_UUID="22222222-2222-2222-2222-222222222222";

let canvasTime,ctxTime,canvasSpace,ctxSpace;
let statsTimeEl,statsSpaceEl;
let bleDevice=null,bleCharacteristic=null,cmdCharacteristic=null;
let tentativasReconexao=0;
const MAX_TENTATIVAS_RECONEXAO=5,TEMPO_RECONEXAO=1500;
let bufferBLE="";
let FE=0,TE=0,FD=0,TD=0,copX=0,copY=0;
const PESO_MINIMO_TOTAL=1;
const pontos=[],MAX_PONTOS_SPACE=500;

let lastDrawTime=0;
const DRAW_INTERVAL=50;

const ESCALA_SPACE=170;
const PLATAFORMA_METADE_X_CM=21.5;
const PLATAFORMA_METADE_Y_CM=21.5;

const ESCALA_TEMPO=120;
const JANELA_TEMPO_S=10;

const COR_EIXO="#38bdf8";

const tempoAmostras=[],copXTempo=[],copYTempo=[];
let tempoInicio=null;

const NOMES_MOTORES=["Frente Esquerda","Trás Esquerda","Frente Direita","Trás Direita"];
const motoresEstado=[0,0,0,0];

document.addEventListener("DOMContentLoaded",()=>{
    canvasTime=document.getElementById("time");
    canvasSpace=document.getElementById("space");
    if(!canvasTime||!canvasSpace)return console.error("Canvas não encontrado.");
    ctxTime=canvasTime.getContext("2d");
    ctxSpace=canvasSpace.getContext("2d");

    canvasTime.insertAdjacentHTML("afterend",'<div id="statsTime" style="text-align:center;margin-top:8px;font-family:sans-serif;font-size:13px;color:#7dd3fc;">Tempo: 0.0s | Distância: 0.0cm</div>');
    canvasSpace.insertAdjacentHTML("afterend",'<div id="statsSpace" style="text-align:center;margin-top:8px;font-family:sans-serif;font-size:13px;color:#7dd3fc;">X: 0.0cm | Y: 0.0cm</div>');
    statsTimeEl=document.getElementById("statsTime");
    statsSpaceEl=document.getElementById("statsSpace");

    criarBotoesMotores();

    desenharEixosTime();
    desenharEixosSpace();
});

function criarBotoesMotores(){
    const container=document.createElement("div");
    container.id="motoresContainer";
    container.style.display="flex";
    container.style.gap="8px";
    container.style.justifyContent="center";
    container.style.flexWrap="wrap";
    container.style.margin="8px 0";

    NOMES_MOTORES.forEach((nome,indice)=>{
        const btn=document.createElement("button");
        btn.id="btnMotor"+indice;
        btn.textContent="Ligar "+nome;
        btn.style.padding="8px 14px";
        btn.style.borderRadius="8px";
        btn.style.border="none";
        btn.style.background=COR_EIXO;
        btn.style.color="#0f172a";
        btn.style.fontWeight="bold";
        btn.style.cursor="pointer";
        btn.addEventListener("click",()=>toggleMotor(indice));
        container.appendChild(btn);
    });

    const antigo=document.getElementById("btnMotores");
    if(antigo){
        antigo.replaceWith(container);
    }else{
        document.body.prepend(container);
    }
}

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

function desenharEixosSpace(){
    if(!ctxSpace)return;
    ctxSpace.clearRect(0,0,canvasSpace.width,canvasSpace.height);
    const cx=canvasSpace.width/2,cy=canvasSpace.height/2;

    ctxSpace.strokeStyle=COR_EIXO;
    ctxSpace.lineWidth=2;
    ctxSpace.beginPath();
    ctxSpace.moveTo(0,cy);
    ctxSpace.lineTo(canvasSpace.width,cy);
    ctxSpace.stroke();
    ctxSpace.beginPath();
    ctxSpace.moveTo(cx,0);
    ctxSpace.lineTo(cx,canvasSpace.height);
    ctxSpace.stroke();

    ctxSpace.fillStyle=COR_EIXO;
    ctxSpace.font="bold 12px sans-serif";
    ctxSpace.textBaseline="middle";

    ctxSpace.textAlign="right";
    ctxSpace.fillText("X aumenta ▶",canvasSpace.width-6,cy-10);
    ctxSpace.textAlign="left";
    ctxSpace.fillText("◀ X diminui",6,cy-10);

    ctxSpace.textAlign="left";
    ctxSpace.textBaseline="top";
    ctxSpace.fillText("Y aumenta ▲",cx+8,4);
    ctxSpace.textBaseline="bottom";
    ctxSpace.fillText("▼ Y diminui",cx+8,canvasSpace.height-4);
}

function atualizarSpace(){
    pontos.push({x:copX,y:copY});
    if(pontos.length>MAX_PONTOS_SPACE)pontos.shift();
    desenharSpace();
    atualizarStatsSpace();
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

function atualizarStatsSpace(){
    if(!statsSpaceEl)return;
    const xCm=copX*PLATAFORMA_METADE_X_CM;
    const yCm=copY*PLATAFORMA_METADE_Y_CM;
    statsSpaceEl.textContent=`X: ${xCm.toFixed(1)}cm | Y: ${yCm.toFixed(1)}cm`;
}

function desenharEixosTime(){
    if(!ctxTime)return;
    ctxTime.clearRect(0,0,canvasTime.width,canvasTime.height);

    const xLinha=canvasTime.width-1;
    ctxTime.strokeStyle=COR_EIXO;
    ctxTime.lineWidth=2;
    ctxTime.beginPath();
    ctxTime.moveTo(xLinha,0);
    ctxTime.lineTo(xLinha,canvasTime.height);
    ctxTime.stroke();

    ctxTime.fillStyle=COR_EIXO;
    ctxTime.font="bold 12px sans-serif";
    ctxTime.textAlign="right";

    ctxTime.textBaseline="top";
    ctxTime.fillText(`▲ +${PLATAFORMA_METADE_X_CM}cm aumenta`,xLinha-6,4);
    ctxTime.textBaseline="bottom";
    ctxTime.fillText(`▼ -${PLATAFORMA_METADE_X_CM}cm diminui`,xLinha-6,canvasTime.height-4);
}

function atualizarTime(){
    const agora=performance.now();
    if(tempoInicio===null)tempoInicio=agora;

    tempoAmostras.push(agora);
    copXTempo.push(copX);
    copYTempo.push(copY);

    const limiteAntigo=agora-JANELA_TEMPO_S*1000;
    while(tempoAmostras.length&&tempoAmostras[0]<limiteAntigo){
        tempoAmostras.shift();
        copXTempo.shift();
        copYTempo.shift();
    }

    desenharTime();
    atualizarStatsTime();
}

function desenharTime(){
    desenharEixosTime();
    if(!tempoAmostras.length)return;

    const agora=performance.now();
    const centro=canvasTime.height/2;
    const pxPorSegundo=canvasTime.width/JANELA_TEMPO_S;

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

function atualizarStatsTime(){
    if(!statsTimeEl)return;
    const decorrido=tempoInicio!==null?(performance.now()-tempoInicio)/1000:0;
    const distCm=Math.hypot(copX*PLATAFORMA_METADE_X_CM,copY*PLATAFORMA_METADE_Y_CM);
    statsTimeEl.textContent=`Tempo: ${decorrido.toFixed(1)}s | Distância: ${distCm.toFixed(1)}cm`;
}

function limparGraficos(){
    pontos.length=0;
    tempoAmostras.length=0;
    copXTempo.length=0;
    copYTempo.length=0;
    copX=copY=0;
    tempoInicio=null;
    desenharEixosSpace();
    desenharEixosTime();
    atualizarStatsSpace();
    atualizarStatsTime();
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

function toggleMotor(indice){
    motoresEstado[indice]=motoresEstado[indice]?0:1;
    enviarComandoMotores(motoresEstado);

    const btn=document.getElementById("btnMotor"+indice);
    if(btn){
        btn.textContent=(motoresEstado[indice]?"Desligar ":"Ligar ")+NOMES_MOTORES[indice];
    }
}