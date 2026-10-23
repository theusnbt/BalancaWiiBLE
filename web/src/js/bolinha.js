const SERVICE_UUID="12345678-1234-1234-1234-1234567890ab";
const PESO_UUID="11111111-1111-1111-1111-111111111111";
const CMD_UUID="22222222-2222-2222-2222-222222222222";

let bleDevice=null,bleCharacteristic=null,cmdCharacteristic=null;
let tentativasReconexao=0;
const MAX_TENTATIVAS_RECONEXAO=5,TEMPO_RECONEXAO=1500;
let bufferBLE="";
const PESO_MINIMO_TOTAL=1;

// --- Inclinação vinda da balança ---
const SUAVIZACAO=0.3;       // média móvel exponencial (0..1): menor = tendência mais suave
const ZONA_PARADA=0.03;     // |COP| abaixo disso conta como balança reta
const INCLINACAO_MAX=0.6;   // |COP| considerado inclinação máxima
const ANGULO_MAX_GRAUS=14;  // quanto o tabuleiro gira na tela na inclinação máxima

// --- Física da bolinha (unidades do tabuleiro: vai de -1 a 1) ---
const ACELERACAO=3.2;       // aceleração na inclinação máxima
const ATRITO=1.3;           // quanto a velocidade diminui por segundo
const QUIQUE=0.4;           // energia que sobra ao bater na borda
const RAIO_BOLA=0.075;
const RAIO_BURACO=0.15;
const POS_BURACO=0.82;      // distância dos buracos ao centro; perto o bastante do canto para a bolinha não ficar presa atrás deles

// Um buraco em cada canto, na mesma ordem dos motores (FE, TE, FD, TD)
const BURACOS=[
    {x:-POS_BURACO,y:-POS_BURACO,nome:"Frente Esquerda"},
    {x:-POS_BURACO,y:POS_BURACO,nome:"Trás Esquerda"},
    {x:POS_BURACO,y:-POS_BURACO,nome:"Frente Direita"},
    {x:POS_BURACO,y:POS_BURACO,nome:"Trás Direita"}
];

const TEMPO_QUEDA=450;      // ms da animação da bolinha caindo
const TEMPO_REAPARECER=900; // ms até a bolinha voltar ao centro
const TEMPO_VIBRACAO=700;   // ms de vibração no canto do buraco

let alvoX=0,alvoY=0;        // inclinação da balança (suavizada)
let inclX=0,inclY=0;        // inclinação desenhada (segue a balança aos poucos)
const bola={x:0,y:0,vx:0,vy:0,escala:0,estado:"aparecendo",buraco:null,inicio:0};
let pontos=0,ultimoQuadro=null,timerVibracao=null;

let canvas,ctx;

document.addEventListener("DOMContentLoaded",()=>{
    canvas=document.getElementById("tabuleiro");
    ctx=canvas.getContext("2d");

    // segurança: nunca deixar motores ligados ao sair da página
    window.addEventListener("pagehide",()=>enviarIntensidades([0,0,0,0]));

    reiniciarBola();
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
    alvoX=alvoY=0;
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

    // sem ninguém na plataforma: o tabuleiro volta a ficar reto
    if(!Number.isFinite(total)||Math.abs(total)<PESO_MINIMO_TOTAL){
        alvoX+=(0-alvoX)*SUAVIZACAO;
        alvoY+=(0-alvoY)*SUAVIZACAO;
        return;
    }
    alvoX+=(((FD+TD)-(FE+TE))/total-alvoX)*SUAVIZACAO;
    alvoY+=(((FE+FD)-(TE+TD))/total-alvoY)*SUAVIZACAO;
}

async function enviarIntensidades(valores){
    if(!cmdCharacteristic)return;
    try{
        await cmdCharacteristic.writeValue(new TextEncoder().encode("I,"+valores.join(",")));
    }catch(erro){
        console.error("Erro ao enviar intensidades:",erro);
    }
}

// vibra só o motor do canto onde a bolinha caiu
function vibrarCanto(indice){
    const valores=[0,0,0,0];
    valores[indice]=255;
    enviarIntensidades(valores);
    clearTimeout(timerVibracao);
    timerVibracao=setTimeout(()=>enviarIntensidades([0,0,0,0]),TEMPO_VIBRACAO);
}

// ================= FÍSICA =================

// Converte o COP em inclinação de -1 a 1, com uma pequena zona parada no meio
function normalizarInclinacao(v){
    const sinal=Math.sign(v),abs=Math.abs(v);
    if(abs<ZONA_PARADA)return 0;
    return sinal*Math.min(1,(abs-ZONA_PARADA)/(INCLINACAO_MAX-ZONA_PARADA));
}

function reiniciarBola(){
    Object.assign(bola,{x:0,y:0,vx:0,vy:0,escala:0,estado:"aparecendo",buraco:null});
}

function animar(agora){
    const dt=ultimoQuadro!==null?Math.min(0.05,(agora-ultimoQuadro)/1000):0;
    ultimoQuadro=agora;

    inclX+=(normalizarInclinacao(alvoX)-inclX)*0.15;
    inclY+=(normalizarInclinacao(alvoY)-inclY)*0.15;
    // frente (COP Y positivo) fica para cima na tela
    canvas.style.transform=`rotateX(${inclY*ANGULO_MAX_GRAUS}deg) rotateY(${inclX*ANGULO_MAX_GRAUS}deg)`;

    atualizarBola(dt,agora);
    desenhar();
    requestAnimationFrame(animar);
}

function atualizarBola(dt,agora){
    if(bola.estado==="aparecendo"){
        bola.escala=Math.min(1,bola.escala+dt*3);
        if(bola.escala>=1)bola.estado="rolando";
        return;
    }

    if(bola.estado==="caindo"){
        const t=Math.min(1,(agora-bola.inicio)/TEMPO_QUEDA);
        const b=BURACOS[bola.buraco];
        bola.x+=(b.x-bola.x)*0.25;
        bola.y+=(b.y-bola.y)*0.25;
        bola.escala=1-t;
        if(agora-bola.inicio>=TEMPO_REAPARECER)reiniciarBola();
        return;
    }

    // na tela o eixo Y cresce para baixo (para trás), por isso o sinal invertido
    bola.vx+=inclX*ACELERACAO*dt;
    bola.vy+=-inclY*ACELERACAO*dt;
    const amortecimento=Math.exp(-ATRITO*dt);
    bola.vx*=amortecimento;
    bola.vy*=amortecimento;
    bola.x+=bola.vx*dt;
    bola.y+=bola.vy*dt;

    const limite=1-RAIO_BOLA;
    if(Math.abs(bola.x)>limite){bola.x=Math.sign(bola.x)*limite;bola.vx*=-QUIQUE;}
    if(Math.abs(bola.y)>limite){bola.y=Math.sign(bola.y)*limite;bola.vy*=-QUIQUE;}

    // cai quando o centro da bolinha entra no buraco
    const indice=BURACOS.findIndex(b=>Math.hypot(bola.x-b.x,bola.y-b.y)<RAIO_BURACO);
    if(indice>=0){
        bola.estado="caindo";
        bola.buraco=indice;
        bola.inicio=agora;
        pontos++;
        document.getElementById("placar").textContent=`Bolinhas no buraco: ${pontos}`;
        vibrarCanto(indice);
    }
}

// ================= DESENHO =================

function desenhar(){
    const w=canvas.width,h=canvas.height;
    const meio=w/2,escala=w/2;
    const px=v=>meio+v*escala;
    ctx.clearRect(0,0,w,h);

    // tabuleiro
    const fundo=ctx.createLinearGradient(0,0,w,h);
    fundo.addColorStop(0,"#c3cecb");
    fundo.addColorStop(1,"#a9b8b3");
    ctx.fillStyle=fundo;
    ctx.fillRect(0,0,w,h);

    // borda interna
    ctx.strokeStyle="#93a5ab";
    ctx.lineWidth=10;
    ctx.strokeRect(5,5,w-10,h-10);

    // marca do centro
    ctx.strokeStyle="rgba(76,99,117,0.35)";
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.arc(meio,meio,RAIO_BOLA*escala*1.6,0,Math.PI*2);
    ctx.stroke();

    // buracos
    BURACOS.forEach(b=>{
        const x=px(b.x),y=px(b.y),r=RAIO_BURACO*escala;
        const g=ctx.createRadialGradient(x,y-r*0.3,r*0.1,x,y,r);
        g.addColorStop(0,"#1f2b30");
        g.addColorStop(1,"#3d4d54");
        ctx.fillStyle=g;
        ctx.beginPath();
        ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fill();
        ctx.strokeStyle="#7f9399";
        ctx.lineWidth=4;
        ctx.stroke();
    });

    if(bola.escala<=0.01)return;

    // sombra e bolinha
    const x=px(bola.x),y=px(bola.y),r=RAIO_BOLA*escala*bola.escala;
    ctx.fillStyle="rgba(30,45,50,0.25)";
    ctx.beginPath();
    ctx.ellipse(x+r*0.25,y+r*0.35,r,r*0.85,0,0,Math.PI*2);
    ctx.fill();

    const g=ctx.createRadialGradient(x-r*0.35,y-r*0.35,r*0.1,x,y,r);
    g.addColorStop(0,"#bfe6dc");
    g.addColorStop(1,"#4f9e8b");
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
}
