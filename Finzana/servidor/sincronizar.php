<?php
require_once 'vendor/autoload.php';

// Configurar Google Sheets API
$client = new Google_Client();
$client->setAuthConfig('credentials.json');
$client->addScope(Google_Service_Sheets::SPREADSHEETS);

$service = new Google_Service_Sheets($client);
$spreadsheetId = 'TU_SHEET_ID';

header('Content-Type: application/json');

if ($_POST['action'] === 'guardar_cliente') {
    $cliente = json_decode($_POST['cliente'], true);
    
    $values = [
        [date('Y-m-d H:i:s'), $cliente['curp'], $cliente['nombre'], $cliente['domicilio'], $cliente['telefono'], $cliente['poblacion_grupo'], $cliente['ruta']]
    ];
    
    $body = new Google_Service_Sheets_ValueRange(['values' => $values]);
    $result = $service->spreadsheets_values->append($spreadsheetId, 'Clientes!A:G', $body, ['valueInputOption' => 'RAW']);
    
    echo json_encode(['success' => true]);
}
?>