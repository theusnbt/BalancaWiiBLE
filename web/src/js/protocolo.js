// Leitura dos pacotes de peso enviados pela plataforma: "P,fe,te,fd,td\n".
//
// Só aceita pacotes completos, terminados em "\n". Um pacote cortado pelo Bluetooth
// chega sem o fim, se junta ao próximo e a linha resultante é descartada, em vez de
// virar um peso errado (ex.: "11.02" cortado para "1").

const TAMANHO_MAXIMO_BUFFER=200; // texto sem "\n" além disso é lixo (ex.: firmware antigo, sem "\n")

// Junta o texto recebido ao que sobrou da notificação anterior.
// Devolve os pesos [FE,TE,FD,TD] de cada pacote completo e o resto ainda incompleto.
function lerPacotesPeso(buffer,recebido){
    const linhas=(buffer+recebido).split("\n");
    let resto=linhas.pop();
    if(resto.length>TAMANHO_MAXIMO_BUFFER)resto="";

    const pesos=[];
    for(const linha of linhas){
        const partes=linha.trim().split(",");
        if(partes.length!==5||partes[0]!=="P")continue;
        // campo vazio viraria 0 com Number(""); "nan" vem de balança sem tara
        const valores=partes.slice(1).map(v=>v.trim()===""?NaN:Number(v));
        if(valores.every(Number.isFinite))pesos.push(valores);
    }
    return {pesos,resto};
}
