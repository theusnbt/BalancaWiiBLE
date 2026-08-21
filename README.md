# ⚖️ BalançaWiiBLE (ESP32-JOGO)

![Status](https://img.shields.io/badge/Status-Desenvolvimento-blue)
![Plataforma](https://img.shields.io/badge/Plataforma-ESP32-lightgrey)
![Conectividade](https://img.shields.io/badge/Conectividade-BLE-00599C)

## 📝 Sobre o Projeto
O **BalançaWiiBLE** é um sistema embarcado interativo construído em torno do microcontrolador ESP32. Desenvolvido para funcionar como uma plataforma de equilíbrio (balance board), o projeto capta e processa a distribuição de peso do usuário em tempo real. 

Através da leitura de quatro células de carga, o firmware calcula precisamente o **Centro de Pressão (COP)** e transmite esses dados via Bluetooth Low Energy (BLE) para uma interface web interativa. O sistema também incorpora feedback háptico através de motores de vibração, elevando a imersão da experiência.

---

## ✨ Funcionalidades Principais

* **Leitura de Precisão:** Interface com 4 células de carga através de módulos amplificadores HX711 para alta fidelidade na leitura de massa.
* **Processamento Matemático:** Cálculo nativo do Centro de Pressão (COP) feito diretamente no ESP32.
* **Transmissão BLE:** Comunicação otimizada enviando notificações em tempo real. O dispositivo é identificável na rede sob o nome **`ESP32-JOGO`**.
* **Interface Web Sincronizada:** Integração com uma página web que renderiza visualmente o deslocamento do COP.
* **Feedback Físico:** Controle de motores de vibração via sinal PWM, ativados mediante eventos específicos da plataforma.

---

## 🛠️ Hardware Necessário

Para replicar ou trabalhar neste projeto, você precisará dos seguintes componentes:
* 1x Placa de Desenvolvimento ESP32
* 4x Células de Carga (compatíveis com o peso estimado do usuário)
* Módulos Amplificadores HX711
* Motores de Vibração (Micro motores / Coin motors)
* Fonte de alimentação adequada, protoboard e jumpers

---

## 💻 Estrutura de Software e Instalação

O código principal do microcontrolador encontra-se no arquivo `jogoBLE.ino` e foi desenhado para ser compilado na **Arduino IDE**.

### Pré-requisitos
1. Arduino IDE instalada e configurada com o pacote de placas ESP32.
2. Biblioteca `HX711` instalada pelo Gerenciador de Bibliotecas.
3. Bibliotecas padrão de Bluetooth Low Energy (BLE) do ESP32.

### Passos de Configuração
1. **Clone o repositório:** Extraia os arquivos fonte e abra-os na IDE.
2. **Montagem do Circuito:** Conecte os pinos `DT` e `SCK` dos módulos HX711 aos pinos GPIO definidos no código. Ligue as saídas PWM aos drivers/transistores dos motores de vibração.
3. **Upload:** Conecte o ESP32 ao computador, selecione a porta correta na IDE e faça o upload do `jogoBLE.ino`.
4. **Pareamento:** Abra a interface web e conceda permissões de pareamento Bluetooth. Conecte-se ao dispositivo `ESP32-JOGO`.
