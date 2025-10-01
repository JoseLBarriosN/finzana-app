// finzana-logic.js - LÓGICA DE NEGOCIO DE FINZANA
class FinzanaLogic {
    constructor() {
        this.sheetId = '185946550'; // ← REEMPLAZAR CON TU SHEET ID REAL
    }

    // 1. CÁLCULO DE PAGOS SEMANALES (Tu fórmula original)
    calcularPagoSemanal(monto, plazoSemanas, tasaInteres = 0.15) {
        // Fórmula de Finzana: Pago semanal fijo
        const interesTotal = monto * tasaInteres;
        const montoTotal = monto + interesTotal;
        const pagoSemanal = montoTotal / plazoSemanas;

        return Math.round(pagoSemanal * 100) / 100; // Redondear a 2 decimales
    }

    // 2. REGISTRO DE PAGOS CON COMISIÓN
    calcularComision(montoPago, tipoPago = 'normal') {
        const porcentajes = {
            'normal': 0.10,    // 10% para pagos normales
            'extraordinario': 0.05, // 5% para pagos extraordinarios
            'actualizado': 0.08 // 8% para pagos actualizados
        };

        const comision = montoPago * (porcentajes[tipoPago] || 0.10);
        return Math.round(comision * 100) / 100;
    }

    // 3. GESTIÓN DE CLIENTES POR COBRADOR
    async obtenerClientesPorCobrador(cobradorId) {
        try {
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Clientes!A:Z',
            });

            const clientes = response.result.values || [];
            return clientes.filter(cliente => cliente[6] === cobradorId); // Columna 6 = cobrador
        } catch (error) {
            console.error('Error obteniendo clientes:', error);
            return [];
        }
    }

    // 4. REPORTE DE MOROSIDAD
    async generarReporteMorosidad(fechaCorte = new Date()) {
        try {
            const [creditos, pagos] = await Promise.all([
                this.obtenerDatosSheet('Creditos!A:Z'),
                this.obtenerDatosSheet('Pagos!A:Z')
            ]);

            const morosidad = [];

            creditos.forEach(credito => {
                const pagosCredito = pagos.filter(pago => pago[1] === credito[0]); // ID crédito
                const estaMoroso = this.verificarMorosidad(credito, pagosCredito, fechaCorte);

                if (estaMoroso) {
                    morosidad.push({
                        cliente: credito[1],
                        monto: credito[2],
                        diasMoroso: this.calcularDiasMorosidad(credito, pagosCredito, fechaCorte),
                        ultimoPago: this.obtenerUltimoPago(pagosCredito)
                    });
                }
            });

            return morosidad;
        } catch (error) {
            console.error('Error generando reporte:', error);
            return [];
        }
    }

    // 5. GUARDAR DATOS EN GOOGLE SHEETS
    async guardarPago(datosPago) {
        try {
            const response = await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: this.sheetId,
                range: 'Pagos!A:Z',
                valueInputOption: 'RAW',
                resource: {
                    values: [[
                        datosPago.id,
                        datosPago.creditoId,
                        datosPago.fecha,
                        datosPago.monto,
                        datosPago.comision,
                        datosPago.tipoPago,
                        datosPago.cobrador,
                        new Date().toISOString()
                    ]]
                }
            });

            console.log('✅ Pago guardado en Sheets:', response);
            return true;
        } catch (error) {
            console.error('❌ Error guardando pago:', error);
            return false;
        }
    }

    // 🔄 MÉTODOS AUXILIARES
    async obtenerDatosSheet(range) {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range: range,
        });
        return response.result.values || [];
    }

    verificarMorosidad(credito, pagos, fechaCorte) {
        // Lógica específica de morosidad de Finzana
        const fechaVencimiento = new Date(credito[4]); // Columna fecha vencimiento
        return fechaCorte > fechaVencimiento && pagos.length === 0;
    }

    calcularDiasMorosidad(credito, pagos, fechaCorte) {
        const fechaVencimiento = new Date(credito[4]);
        return Math.floor((fechaCorte - fechaVencimiento) / (1000 * 60 * 60 * 24));
    }

    obtenerUltimoPago(pagos) {
        return pagos.length > 0 ? pagos[pagos.length - 1][2] : 'Sin pagos'; // Fecha último pago
    }
}

export default FinzanaLogic;