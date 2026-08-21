//cliente
#include <BLEDevice.h>
#include <BLEClient.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define PESO_UUID           "11111111-1111-1111-1111-111111111111"
#define CMD_UUID            "22222222-2222-2222-2222-222222222222"

BLERemoteCharacteristic *pesoCharacteristic = nullptr;
BLERemoteCharacteristic *cmdCharacteristic  = nullptr;
BLEClient *pClient                          = nullptr;

bool conectado  = false;
bool procurando = false;

// Callback chamado ao receber notificações de peso do Servidor
void notifyCallback(
    BLERemoteCharacteristic* pBLERemoteCharacteristic,
    uint8_t* pData,
    size_t length,
    bool isNotify)
{
    String dados = "";
    for (size_t i = 0; i < length; i++) {
        dados += (char)pData[i];
    }
    Serial.println(dados);
}

// Função dedicada para conectar ao Servidor BLE encontrado
bool conectarAoServidor(BLEAdvertisedDevice device) {
    Serial.print("Servidor encontrado! Tentando conectar em: ");
    Serial.println(device.getAddress().toString().c_str());

    pClient = BLEDevice::createClient();

    if (!pClient->connect(&device)) {
        Serial.println("Falha ao conectar.");
        return false;
    }

    BLERemoteService *service = pClient->getService(BLEUUID(SERVICE_UUID));
    if (service == nullptr) {
        Serial.println("Erro: Serviço BLE não encontrado!");
        pClient->disconnect();
        return false;
    }

    pesoCharacteristic = service->getCharacteristic(BLEUUID(PESO_UUID));
    cmdCharacteristic  = service->getCharacteristic(BLEUUID(CMD_UUID));

    if (pesoCharacteristic == nullptr || cmdCharacteristic == nullptr) {
        Serial.println("Erro: Características não encontradas!");
        pClient->disconnect();
        return false;
    }

    if (pesoCharacteristic->canNotify()) {
        pesoCharacteristic->registerForNotify(notifyCallback);
    }

    conectado = true;
    Serial.println(">>> CONECTADO COM SUCESSO AO SERVIDOR BLE! <<<");
    return true;
}

// Realiza o escaneamento dos dispositivos no ar
void procurarServidor() {
    procurando = true;
    Serial.println("Procurando Servidor BLE...");

    BLEScan* scan = BLEDevice::getScan();
    scan->setActiveScan(true);
    BLEScanResults* resultados = scan->start(3, false);

    for (int i = 0; i < resultados->getCount(); i++) {
        BLEAdvertisedDevice device = resultados->getDevice(i);

        if (device.haveServiceUUID() && device.getServiceUUID().equals(BLEUUID(SERVICE_UUID))) {
            if (conectarAoServidor(device)) {
                break;
            }
        }
    }
    
    scan->clearResults();
    procurando = false;
}

void setup() {
    Serial.begin(115200);
    
    // Aguarda 2 segundos para dar tempo de abrir/sincronizar o Monitor Serial
    delay(2000); 
    
    Serial.println("\n--- INICIANDO CLIENTE ESP32_PONTE ---");
    Serial.println("TESTE OK");

    BLEDevice::init("ESP32_BALANCA");
}

void loop() {
    // 1. Se desconectado, tenta buscar e conectar ao servidor
    if (!conectado && !procurando) {
        procurarServidor();
        delay(1000); // Aguarda 1s entre tentativas de scan
    }

    // 2. Se conectado, gerencia perda de conexão e envio de dados via Serial
    if (conectado) {
        if (!pClient->isConnected()) {
            conectado = false;
            Serial.println("Conexão perdida! Tentando reconectar...");
            return;
        }

        if (Serial.available()) {
            String comando = Serial.readStringUntil('\n');
            comando.trim();

            if (comando.length() > 0 && cmdCharacteristic != nullptr) {
                cmdCharacteristic->writeValue(comando.c_str());
            }
        }
    }
}