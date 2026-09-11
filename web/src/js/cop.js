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
const copXTempo=[],copYTempo=[];
let motoresLigados=false;

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
    atualizarSpace();
    atualizarTime();
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
    ctxSpace.strokeStyle="black";
    ctxSpace.lineWidth=2;
    ctxSpace.beginPath();
    ctxSpace.moveTo(0,cy);
    ctxSpace.lineTo(canvasSpace.width,cy);
    ctxSpace.stroke();
    ctxSpace.beginPath();
    ctxSpace.moveTo(cx,0);
    ctxSpace.lineTo(cx,canvasSpace.height);
    ctxSpace.stroke();
}

function desenharEixosTime(){
    if(!ctxTime)return;
    ctxTime.clearRect(0,0,canvasTime.width,canvasTime.height);
    const cx=canvasTime.width/2,cy=canvasTime.height/2;
    ctxTime.strokeStyle="black";
    ctxTime.lineWidth=2;
    ctxTime.beginPath();
    ctxTime.moveTo(0,cy);
    ctxTime.lineTo(canvasTime.width,cy);
    ctxTime.stroke();
    ctxTime.beginPath();
    ctxTime.moveTo(cx,0);
    ctxTime.lineTo(cx,canvasTime.height);
    ctxTime.stroke();
}

function atualizarSpace(){
    pontos.push({x:copX,y:copY});
    if(pontos.length>MAX_PONTOS_SPACE)pontos.shift();
    desenharSpace();
}

function desenharSpace(){
    desenharEixosSpace();
    const cx=canvasSpace.width/2,cy=canvasSpace.height/2,escala=170;
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

function atualizarTime(){
    copXTempo.push(copX);
    copYTempo.push(copY);
    const limite=Math.floor(canvasTime.width/2);
    if(copXTempo.length>limite){
        copXTempo.shift();
        copYTempo.shift();
    }
    desenharTime();
}

function desenharTime(){
    desenharEixosTime();
    const centro=canvasTime.height/2,escala=120;
    if(copXTempo.length){
        ctxTime.strokeStyle="red";
        ctxTime.lineWidth=2;
        ctxTime.beginPath();
        copXTempo.forEach((v,i)=>{
            const x=i*2,y=centro-v*escala;
            i?ctxTime.lineTo(x,y):ctxTime.moveTo(x,y);
        });
        ctxTime.stroke();
    }
    if(copYTempo.length){
        ctxTime.strokeStyle="blue";
        ctxTime.beginPath();
        copYTempo.forEach((v,i)=>{
            const x=i*2,y=centro-v*escala;
            i?ctxTime.lineTo(x,y):ctxTime.moveTo(x,y);
        });
        ctxTime.stroke();
    }
}

function limparGraficos(){
    pontos.length=0;
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
    // estados = array com 4 valores, 0 ou 1, ex: [1,1,1,1]
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