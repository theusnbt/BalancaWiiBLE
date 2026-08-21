// Função assíncrona responsável por conectar ao ESP32 via BLE
CD async function conectarBLE() {

    // Abre a janela do navegador para o usuário escolher um dispositivo BLE
    // Apenas dispositivos que possuam o SERVICE_UUID serão exibidos
    CD const device = await navigator.bluetooth.requestDevice({
        filters: [{
            services: [SERVICE_UUID]
        }]
    });

    // Realiza a conexão GATT com o dispositivo selecionado
    CD const server = await device.gatt.connect();

    // Obtém o serviço BLE responsável pelo envio dos pesos
    CD const service = await server.getPrimaryService(SERVICE_UUID);

    // Obtém a característica que contém os dados das balanças
    CD const characteristic = await service.getCharacteristic(PESO_UUID);

    // Habilita as notificações dessa característica
    // Assim, sempre que o ESP32 enviar novos dados, o navegador será avisado
    CD await characteristic.startNotifications();

    // Define qual função será executada quando uma notificação chegar
    // Nesse caso, a função receberPesos()
    CD characteristic.addEventListener(
        "characteristicvaluechanged",
        receberPesos
    );

    // Mensagem informando que a conexão foi realizada com sucesso
    CD console.log("Conectado!");
}