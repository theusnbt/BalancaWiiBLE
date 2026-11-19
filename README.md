# ⚖️ BalançaWiiBLE

![Status](https://img.shields.io/badge/Status-Desenvolvimento-blue)
![Plataforma](https://img.shields.io/badge/Plataforma-ESP32-lightgrey)
![Conectividade](https://img.shields.io/badge/Conectividade-BLE-00599C)

## 📝 Sobre o Projeto

O **BalançaWiiBLE** é uma plataforma de equilíbrio (balance board) construída com um **ESP32**, quatro células de carga e quatro motores de vibração, pensada para a **reabilitação de pacientes com deficiência corporal**.

O ESP32 lê o peso em cada canto da plataforma e envia os valores via **Bluetooth Low Energy (BLE)** para páginas web que rodam no navegador. A partir desses valores é calculado o **Centro de Pressão (COP)**, ou seja, para onde o corpo do paciente está inclinado. Com isso o sistema oferece:

* uma tela técnica, para o profissional acompanhar o COP em gráficos;
* jogos simples, com visual calmo, que o paciente controla apenas inclinando o corpo;
* **feedback háptico**: os motores nos cantos da plataforma vibram conforme a inclinação ou quando algo acontece no jogo.

---

## ✨ Funcionalidades

* **Leitura de peso** em 4 células de carga com módulos HX711, com tara automática ao ligar.
* **Envio contínuo via BLE** a 10 leituras por segundo.
* **Cálculo do COP** no navegador, nos eixos esquerda/direita (X) e frente/trás (Y).
* **Página COP:** gráfico do COP no tempo, gráfico do caminho do COP no espaço, estatísticas em centímetros e botões para ligar cada motor manualmente.
* **Jogo do Equilíbrio:** mostra a inclinação da balança e faz os motores vibrarem mais forte quanto mais o paciente se inclina para um lado.
* **Bolinha no Buraco:** uma balança virtual inclina junto com a plataforma real e o paciente leva uma bolinha até um dos 4 buracos nos cantos.
* **Motores com intensidade variável (PWM)**, com desligamento automático por segurança.

---

## 🛠️ Hardware

* 1x placa de desenvolvimento **ESP32**
* 4x **células de carga**, uma em cada canto da plataforma
* 4x módulos amplificadores **HX711**
* 4x **motores de vibração** (micro motores / coin motors), cada um com transistor ou driver
* Fonte de alimentação adequada, protoboard e jumpers

### Ligações (pinos do ESP32)

| Canto              | HX711 `DT` | HX711 `SCK` | Motor |
|--------------------|:----------:|:-----------:|:-----:|
| Frente Esquerda    | 35         | 16          | 4     |
| Trás Esquerda      | 32         | 33          | 25    |
| Frente Direita     | 27         | 17          | 14    |
| Trás Direita       | 18         | 19          | 13    |

> Os motores devem ser ligados através de um transistor/driver, com um diodo de proteção (ex.: 1N4007) em paralelo com cada motor. O ESP32 não fornece corrente suficiente para acionar o motor diretamente, e ligá-lo direto no pino pode queimar a placa.

> O motor Trás Esquerda usava o **GPIO 12**, que define a tensão da memória do ESP32 no boot: com ele em nível alto a placa não inicia. Ele passou para o **GPIO 25**.

---

## 📂 Estrutura do Projeto

```
BalancaWiiBLE/
├── BLE/
│   ├── jogoBLE/jogoBLE.ino     # firmware principal da plataforma (servidor BLE)
│   └── ponteBLE/ponteBLE.ino   # firmware opcional: ESP32 "ponte" BLE ↔ Serial
├── tests/                      # testes automatizados das páginas (node --test)
└── web/
    ├── cop.html                # tela técnica: gráficos do COP e controle manual dos motores
    ├── jogo.html               # Jogo do Equilíbrio
    ├── bolinha.html            # Bolinha no Buraco
    └── src/
        ├── css/                # estilos de cada página
        └── js/                 # lógica de cada página (BLE, cálculo, desenho)
                                # + reconexao.js e protocolo.js, compartilhados pelas três páginas
```

---

## 💻 Instalação

### 1. Firmware da plataforma (`jogoBLE.ino`)

1. Instale a **Arduino IDE** com o pacote de placas **ESP32** (Espressif).
2. Instale a biblioteca **HX711** pelo Gerenciador de Bibliotecas. As bibliotecas BLE já vêm com o pacote do ESP32.
3. Monte o circuito conforme a tabela de ligações.
4. Abra `BLE/jogoBLE/jogoBLE.ino`, selecione a placa e a porta e faça o upload.
5. **Deixe a plataforma vazia ao ligar o ESP32**: a tara das balanças é feita nos primeiros segundos.

Ao iniciar, o dispositivo aparece no Bluetooth com o nome **`ESP32-BALANCA`**.

> As páginas só aceitam pacotes terminados em `\n`. Se as páginas conectam mas nada se mexe, o ESP32 provavelmente está com um firmware antigo: grave o `jogoBLE.ino` atual.

### 2. Páginas web

O **Web Bluetooth** só funciona no **Google Chrome** ou **Microsoft Edge** e exige que a página seja aberta por `http://localhost` ou `https://`. Abrir o arquivo direto (`file://`) não funciona.

Algumas formas de servir a pasta `web/`:

* **VS Code + Live Server:** clique com o botão direito em `web/cop.html` → *Open with Live Server* (o projeto já define a porta 5501).
* **Python:**

```bash
python3 -m http.server 8080 --directory web
```

Depois acesse `http://localhost:8080/cop.html` (ou `jogo.html` / `bolinha.html`).

### 3. Conexão automática (opcional)

Por segurança, o navegador sempre exige **um clique em "Conectar" na primeira vez**. Depois disso, as páginas tentam **reconectar sozinhas** à plataforma já autorizada assim que são abertas (`web/src/js/reconexao.js`). Assim não é preciso conectar de novo ao trocar de página.

No Chrome/Edge esse recurso pode precisar ser ativado:

1. Acesse `chrome://flags/#enable-web-bluetooth-new-permissions-backend` (no Edge, `edge://flags/...`).
2. Mude para **Enabled** e reinicie o navegador.

Sem essa opção, nada muda: o botão "Conectar plataforma" continua funcionando normalmente.

> A autorização vale por endereço. `localhost:5501` (Live Server) e `localhost:8080` (Python) são autorizados separadamente.

---

## 🎮 Como Usar

### Página COP (`cop.html`): para o profissional

1. Clique em **Conectar plataforma (BLE)** e escolha o dispositivo.
2. Acompanhe os gráficos:
   * **Gráfico de Tempo:** COP em X (vermelho) e em Y (azul) nos últimos 10 segundos.
   * **Gráfico de Espaço:** o caminho percorrido pelo COP sobre a plataforma.
3. Use os botões **Ligar/Desligar** para testar cada motor individualmente.
4. Pelos links no topo é possível abrir os jogos.

### Jogo do Equilíbrio (`jogo.html`)

* Clique em **Conectar plataforma**. O botão some após a conexão.
* Uma bolinha mostra para onde o paciente está inclinado.
* Fora da área central, os motores do lado da inclinação vibram, **mais forte quanto maior a inclinação**. Ao voltar para o centro, a vibração para.

### Bolinha no Buraco (`bolinha.html`)

* Clique em **Conectar plataforma**.
* A balança virtual inclina junto com a plataforma real e a bolinha rola para o lado mais baixo.
* Leve a bolinha até um dos **4 buracos nos cantos**. Ao cair, o placar aumenta, o **motor daquele canto vibra** e a bolinha volta ao centro.

---

## 📡 Protocolo BLE

| Item                         | UUID                                   | Direção             |
|------------------------------|----------------------------------------|---------------------|
| Serviço                      | `12345678-1234-1234-1234-1234567890ab` | —                   |
| Peso (`READ`, `NOTIFY`)      | `11111111-1111-1111-1111-111111111111` | ESP32 → navegador   |
| Comando (`WRITE`)            | `22222222-2222-2222-2222-222222222222` | navegador → ESP32   |

**Mensagens (texto):**

| Mensagem         | Significado                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `P,fe,te,fd,td\n`| Peso em kg de cada canto (Frente Esq., Trás Esq., Frente Dir., Trás Dir.). Um canto que não respondeu na tara vai como `nan` |
| `V,a,b,c,d`      | Liga (`1`) ou desliga (`0`) cada motor, na mesma ordem dos cantos            |
| `I,a,b,c,d`      | Intensidade de cada motor, de `0` (desligado) a `255` (máxima)               |

**Segurança:** se o ESP32 ficar **2 segundos sem receber comandos**, todos os motores são desligados. Por isso a página COP reenvia o estado dos motores ligados a cada segundo. As páginas também desligam os motores ao serem fechadas.

**Pacotes cortados:** com o tamanho padrão do Bluetooth (MTU de 23), uma notificação leva no máximo 20 bytes e o pacote de peso passa disso. O firmware pede um MTU maior (`BLEDevice::setMTU(185)`), e as páginas (`protocolo.js`) só aceitam pacotes completos, terminados em `\n`, descartando qualquer pacote cortado ou com `nan`.

### Cálculo do COP

```
total = FE + TE + FD + TD
X = ((FD + TD) − (FE + TE)) / total     → positivo = direita
Y = ((FE + FD) − (TE + TD)) / total     → positivo = frente
```

Os valores vão de −1 a 1. A página COP converte para centímetros considerando metade da plataforma igual a 21,5 cm.

---

## ⚙️ Ajustes

| Onde                       | Constante                         | Para que serve                                                       |
|----------------------------|-----------------------------------|----------------------------------------------------------------------|
| `jogoBLE.ino`              | fatores `p1`…`p4` no `loop()`     | calibração de cada célula de carga (conversão leitura → kg)          |
| `jogoBLE.ino`              | `SEND_INTERVAL`, `MOTOR_TIMEOUT`  | frequência de envio e tempo do desligamento de segurança             |
| `jogo.js`                  | `ZONA_CENTRAL`, `ALCANCE_MAX`     | tamanho da área sem vibração e inclinação de vibração máxima         |
| `jogo.js` / `bolinha.js`   | `PWM_MIN`                         | menor intensidade que ainda faz o motor girar                        |
| `jogo.js`                  | `SUAVIDADE_DESENHO`               | velocidade com que a bolinha acompanha a inclinação na tela          |
| `bolinha.js`               | `ACELERACAO`, `ATRITO`            | quão rápido a bolinha rola e quão rápido ela para                    |
| `bolinha.js`               | `RAIO_BURACO`, `ZONA_PARADA`      | tamanho dos buracos e inclinação mínima para a bolinha se mover      |

---

## 🔌 Ponte BLE ↔ Serial (opcional)

O `ponteBLE.ino` transforma um segundo ESP32 em cliente BLE: ele procura a plataforma, conecta automaticamente e:

* imprime na Serial cada pacote `P,...` recebido;
* envia para a plataforma qualquer comando digitado na Serial (por exemplo `I,255,0,0,0`).

Útil para testar a plataforma sem o navegador ou para integrá-la a outros programas pelo cabo USB.

---

## 🧪 Testes

Os testes carregam os scripts reais das páginas num navegador simulado (sem plataforma, sem Chrome) e verificam a leitura dos pacotes, os motores da página COP, a reconexão automática nas três páginas e os motores dos dois jogos. Precisam só do **Node.js 20 ou mais novo**, sem instalar nada:

```bash
node --test tests/
```

O firmware não tem testes automáticos; confira se ele compila pela Arduino IDE (**Verificar**) antes de gravar.

---

## 🩺 Solução de Problemas

* **O dispositivo não aparece na lista do Bluetooth:** confira se o ESP32 está ligado e se nenhuma outra página/aparelho já está conectado a ele.
* **"Este navegador não suporta Bluetooth":** use Chrome ou Edge e abra a página por `localhost`/`https`.
* **Os pesos não zeram ou o COP fica deslocado:** reinicie o ESP32 com a plataforma **vazia** para refazer a tara.
* **Mensagem "ERRO: scaleX nao respondeu para tara!" no Monitor Serial:** verifique as ligações `DT`/`SCK` do HX711 correspondente. Enquanto isso, aquele canto é enviado como `nan` e as páginas ficam paradas em vez de mostrar pesos errados; reinicie o ESP32 depois de corrigir.
* **Motor não vibra com inclinação leve:** aumente `PWM_MIN`.
* **ESP32 não inicia com os motores ligados:** confira se o motor Trás Esquerda está no **GPIO 25** e não mais no 12. O GPIO 12 influencia o boot do ESP32 e, em nível alto, impede a placa de iniciar.
* **Motor ligado pela página COP desliga sozinho:** a página reenvia o comando a cada segundo; se mesmo assim desligar, a conexão Bluetooth está caindo (veja o console do navegador).
