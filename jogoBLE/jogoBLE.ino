//server
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "HX711.h"

// --- Configuração das Balanças (Pinos Originais Mantidos) ---
HX711 scale1, scale2, scale3, scale4;

#define DT1 35 // Frente-Esquerda
#define DT2 32 // Atrás-Esquerda
#define DT3 27 // Frente-Direita
#define DT4 18 // Atrás-Direita

#define SCK1 16
#define SCK2 33
#define SCK3 17
#define SCK4 19

long lastRaw1 = 0, lastRaw2 = 0, lastRaw3 = 0, lastRaw4 = 0;

// --- Configuração dos Motores ---
const int MOTOR_PINS[] = {15, 12, 14, 13};
const int NUM_MOTORS = 4;
const int PWM_FREQ = 5000;
const int PWM_RESOLUTION = 8;

#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define PESO_UUID           "11111111-1111-1111-1111-111111111111"
#define CMD_UUID            "22222222-2222-2222-2222-222222222222"  //definindo o ble (troca de wifi para ble)

BLECharacteristic *pesoCharacteristic;
BLECharacteristic *cmdCharacteristic;
BLEService *pService;

// Controle de conexão BLE (substitui a antiga variável "numCliente" do WebSocket)
bool deviceConnected = false;

unsigned long lastSendTime = 0;
unsigned long lastMotorCommand = 0;
const int SEND_INTERVAL = 100; // Estabilizado em 10Hz (100ms) para sincronia com o HTML
const int MOTOR_TIMEOUT = 2000;

// --- Callback para saber quando um cliente BLE conecta/desconecta ---
class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) {
        deviceConnected = true;
        Serial.println("Cliente conectado.");
    }

    void onDisconnect(BLEServer *pServer) {
        deviceConnected = false;
        Serial.println("Cliente desconectado.");
        // Reinicia o advertising para permitir nova conexão
        pServer->getAdvertising()->start();
    }
};

// --- Callback para receber comandos dos motores via BLE ---
class CmdCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        
        String comando = pCharacteristic->getValue();

        comando.trim();

        Serial.print("Recebido: ");
        Serial.println(comando);

        if (comando.length() == 0)
            return;

        if (comando.startsWith("V,")) {

            int intensities[4];

            int parsed = sscanf(
                comando.c_str(),
                "V,%d,%d,%d,%d",
                &intensities[0],
                &intensities[1],
                &intensities[2],
                &intensities[3]
            );
            Serial.printf("Motores: %d %d %d %d\n",
              intensities[0],
              intensities[1],
              intensities[2],
              intensities[3]);

            if (parsed == 4) {

                for (int i = 0; i < NUM_MOTORS; i++) {

                    intensities[i] = constrain(intensities[i], 0, 100);

                    int pwm = map(intensities[i], 0, 100, 0, 255);

                    ledcWrite(MOTOR_PINS[i], pwm);

                    Serial.printf("Motor %d PWM = %d\n", i, pwm);

                    ledcWrite(MOTOR_PINS[i], pwm);
                }

                lastMotorCommand = millis();
            }
        }
    }
};

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("TESTE");
    Serial.println("Inicializando Balancas...");
    scale1.begin(DT1, SCK1);
    scale2.begin(DT2, SCK2);
    scale3.begin(DT3, SCK3);
    scale4.begin(DT4, SCK4);

    // Faz a tara inicial ao ligar (mantenha a balança sem peso neste momento)
    Serial.println("A efetuar Tara inicial...");
    bool tare1 = scale1.wait_ready_timeout(1000);
    bool tare2 = scale2.wait_ready_timeout(1000);
    bool tare3 = scale3.wait_ready_timeout(1000);
    bool tare4 = scale4.wait_ready_timeout(1000);

    if (tare1) scale1.tare(20); else Serial.println("ERRO: scale1 nao respondeu para tara!");
    if (tare2) scale2.tare(20); else Serial.println("ERRO: scale2 nao respondeu para tara!");
    if (tare3) scale3.tare(20); else Serial.println("ERRO: scale3 nao respondeu para tara!");
    if (tare4) scale4.tare(20); else Serial.println("ERRO: scale4 nao respondeu para tara!");

    // Configuração dos canais PWM para os motores (API nova do ESP32 Core 3.x)
    for (int i = 0; i < NUM_MOTORS; i++) {
        ledcAttach(MOTOR_PINS[i], PWM_FREQ, PWM_RESOLUTION);
        ledcWrite(MOTOR_PINS[i], 0); // Desligados no início
    }

    // Configura o Access por BLE
    BLEDevice::init("ESP32-BALANCA");

    BLEServer *server = BLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());

    BLEService *service = server->createService(SERVICE_UUID);

    pesoCharacteristic = service->createCharacteristic(
        PESO_UUID,
        BLECharacteristic::PROPERTY_READ |
        BLECharacteristic::PROPERTY_NOTIFY
    );

    pesoCharacteristic->addDescriptor(new BLE2902());

    pesoCharacteristic->setValue("P,0,0,0,0");

    service->start();

    BLEAdvertising *advertising = BLEDevice::getAdvertising();

    advertising->addServiceUUID(SERVICE_UUID);
    advertising->setScanResponse(true);

    BLEDevice::startAdvertising();

    Serial.println("==============================");
    Serial.println("ESP32-BALANCA");
    Serial.println("BLE iniciado!");
    Serial.println("Advertising iniciado!");
    Serial.println("==============================");
}

void loop() {
    Serial.println("Rodando...");
    delay(2000);
    unsigned long currentTime = millis();

    Serial.print(scale1.is_ready());
    Serial.print(" ");
    Serial.print(scale2.is_ready());
    Serial.print(" ");
    Serial.print(scale3.is_ready());
    Serial.print(" ");
    Serial.println(scale4.is_ready());

    // 1. LEITURA CONTINUA DOS SENSORES (Evita pular para zero)
    if (scale1.is_ready()) lastRaw1 = scale1.get_value(1);
    if (scale2.is_ready()) lastRaw2 = scale2.get_value(1);
    if (scale3.is_ready()) lastRaw3 = scale3.get_value(1);
    if (scale4.is_ready()) lastRaw4 = scale4.get_value(1);

    Serial.printf("%ld | %ld | %ld | %ld\n",
    lastRaw1,
    lastRaw2,
    lastRaw3,
    lastRaw4);
    

    // 2. ENVIO DOS DADOS PROCESSADOS VIA BLE
    if (currentTime - lastSendTime >= SEND_INTERVAL) {

        // p1..p4 precisam existir fora do "if (deviceConnected)" para
        // poderem ser usadas depois nos Serial.printf de debug
        float p1 = (-6.0 * 0.00001) * lastRaw1;
        float p2 = (-6.0 * 0.00001) * lastRaw2;
        float p3 = (-7.0 * 0.00001) * lastRaw3;
        float p4 = (-7.0 * 0.00001) * lastRaw4;

        if (deviceConnected) {

            // "P," identifica o pacote como Peso; o JS descarta esse
            // primeiro campo antes de interpretar os 4 valores
            String dadosBalanca = "P," +
                String(p1, 2) + "," +
                String(p2, 2) + "," +
                String(p3, 2) + "," +
                String(p4, 2);

            pesoCharacteristic->setValue(dadosBalanca.c_str());
            pesoCharacteristic->notify();
        }

        lastSendTime = currentTime;

        Serial.printf("Frente Esquerda: %.2f kg\n", p1);
        Serial.printf("Traseira Esquerda: %.2f kg\n", p2);
        Serial.printf("Frente Direita: %.2f kg\n", p3);
        Serial.printf("Traseira Direita: %.2f kg\n", p4);
    }

    // Timeout de segurança: se o PC parar de responder, desliga os motores
    if (currentTime - lastMotorCommand > MOTOR_TIMEOUT) {
        for (int i = 0; i < NUM_MOTORS; i++) {
            ledcWrite(MOTOR_PINS[i], 0);
        }
    }
}
