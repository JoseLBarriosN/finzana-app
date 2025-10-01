// Finzana - Sistema de Gestión de Créditos
// ID: 185946550
// Google Sheets: 1sLQI0YWLGKSvDMjONkOwIBLY6_0zr7Lk8QUrLcdO-Hc

class FinzanaSistema {
    constructor() {
        this.usuarios = JSON.parse(localStorage.getItem('finzana_usuarios')) || this.crearUsuariosIniciales();
        this.clientas = JSON.parse(localStorage.getItem('finzana_clientas')) || [];
        this.creditos = JSON.parse(localStorage.getItem('finzana_creditos')) || [];
        this.pagos = JSON.parse(localStorage.getItem('finzana_pagos')) || [];
        this.configuracion = JSON.parse(localStorage.getItem('finzana_config')) || {};
        this.usuarioActual = null;

        // Configuración de Google Sheets
        this.googleSheetsId = '1sLQI0YWLGKSvDMjONkOwIBLY6_0zr7Lk8QUrLcdO-Hc';
        this.apiKey = 'AIzaSyAsBdhcY48jMt-PE259q1QRYj_KhlWPjq4'; // Necesitarás una API key real
        this.sheetsData = {
            CLIENTAS: [],
            COLOCACIÓN: [],
            COBRANZA: [],
            TABLAS: []
        };

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.cargarConfiguracionSheets();
        this.verificarLogin();
        this.verificarPagosAutomaticos();
    }

    bindEvents() {
        // Eventos de login y usuarios
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarUsuario();
        });

        document.getElementById('showRegister').addEventListener('click', () => {
            this.toggleLoginRegister();
            this.cargarOpcionesDesdeSheets('userType', 'tipos_usuario');
        });

        // Navegación
        document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.verificarPermiso(btn.dataset.permission)) {
                    this.mostrarTab(btn.dataset.tab);
                }
            });
        });

        // Sheets tabs
        document.querySelectorAll('.sheet-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.mostrarSheetTab(btn.dataset.sheet);
            });
        });

        // Sincronización
        document.getElementById('syncGoogleSheets').addEventListener('click', () => {
            this.sincronizarCompleta();
        });

        document.getElementById('loadSheetsBtn').addEventListener('click', () => {
            this.cargarDatosSheetsCompleto();
        });

        // Formularios
        document.getElementById('clienteForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.registrarCliente();
        });

        // Cargar dropdowns desde Sheets
        this.cargarOpcionesDesdeSheets('grupo', 'grupos');
        this.cargarOpcionesDesdeSheets('semanas', 'semanas_credito');
        this.cargarOpcionesDesdeSheets('newUserType', 'tipos_usuario');
    }

    // CONFIGURACIÓN DESDE GOOGLE SHEETS
    async cargarConfiguracionSheets() {
        try {
            // Cargar datos de la hoja TABLAS para configuración
            const tablasData = await this.obtenerDatosSheets('TABLAS');
            this.procesarConfiguracionTablas(tablasData);

        } catch (error) {
            console.warn('No se pudo cargar configuración de Sheets, usando valores por defecto', error);
            this.configuracionPorDefecto();
        }
    }

    procesarConfiguracionTablas(tablasData) {
        // Procesar la hoja TABLAS para obtener configuraciones
        this.configuracion.grupos = ['Grupo A', 'Grupo B', 'Grupo C']; // Ejemplo
        this.configuracion.semanas = [10, 15, 20];
        this.configuracion.tipos_usuario = [
            { valor: 'admin', nombre: 'Administrador' },
            { valor: 'colocador', nombre: 'Colocador' },
            { valor: 'cobrador', nombre: 'Cobrador' }
        ];

        this.guardarConfiguracion();
    }

    configuracionPorDefecto() {
        this.configuracion = {
            grupos: ['Grupo 1', 'Grupo 2', 'Grupo 3'],
            semanas: [10, 15, 20],
            tipos_usuario: [
                { valor: 'admin', nombre: 'Administrador' },
                { valor: 'colocador', nombre: 'Colocador' },
                { valor: 'cobrador', nombre: 'Cobrador' }
            ],
            tasa_interes: 0.30
        };
        this.guardarConfiguracion();
    }

    cargarOpcionesDesdeSheets(selectId, tipoConfig) {
        const select = document.getElementById(selectId);
        if (!select || !this.configuracion[tipoConfig]) return;

        select.innerHTML = '<option value="">Seleccionar...</option>';

        this.configuracion[tipoConfig].forEach(item => {
            const option = document.createElement('option');
            option.value = typeof item === 'object' ? item.valor : item;
            option.textContent = typeof item === 'object' ? item.nombre : item;
            select.appendChild(option);
        });
    }

    // INTEGRACIÓN CON GOOGLE SHEETS
    async obtenerDatosSheets(hoja) {
        try {
            // URL para acceder a los datos de Google Sheets como CSV
            const url = `https://docs.google.com/spreadsheets/d/${this.googleSheetsId}/gviz/tq?tqx=out:csv&sheet=${hoja}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Error al cargar datos');

            const csvText = await response.text();
            return this.parseCSV(csvText);

        } catch (error) {
            console.error(`Error al obtener datos de la hoja ${hoja}:`, error);
            return [];
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

        const datos = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
            const fila = {};

            headers.forEach((header, index) => {
                fila[header] = values[index] || '';
            });

            datos.push(fila);
        }

        return datos;
    }

    async cargarDatosSheetsCompleto() {
        try {
            this.mostrarAlerta('Cargando datos desde Google Sheets...', 'info');

            // Cargar todas las hojas
            const [clientas, colocacion, cobranza, tablas] = await Promise.all([
                this.obtenerDatosSheets('CLIENTAS'),
                this.obtenerDatosSheets('COLOCACIÓN'),
                this.obtenerDatosSheets('COBRANZA'),
                this.obtenerDatosSheets('TABLAS')
            ]);

            this.sheetsData.CLIENTAS = clientas;
            this.sheetsData['COLOCACIÓN'] = colocacion;
            this.sheetsData.COBRANZA = cobranza;
            this.sheetsData.TABLAS = tablas;

            // Actualizar interfaz
            this.actualizarVistaSheets();
            this.actualizarEstadísticasSheets();

            this.mostrarAlerta('Datos de Google Sheets cargados correctamente', 'success');

        } catch (error) {
            console.error('Error al cargar datos de Sheets:', error);
            this.mostrarAlerta('Error al cargar datos de Google Sheets', 'error');
        }
    }

    actualizarVistaSheets() {
        // Actualizar cada pestaña de sheets
        Object.keys(this.sheetsData).forEach(hoja => {
            const headerId = `${hoja.toLowerCase().replace('ó', 'o')}SheetsHeader`;
            const bodyId = `${hoja.toLowerCase().replace('ó', 'o')}SheetsBody`;

            const thead = document.getElementById(headerId);
            const tbody = document.getElementById(bodyId);

            if (thead && tbody && this.sheetsData[hoja].length > 0) {
                // Actualizar encabezados
                const headers = Object.keys(this.sheetsData[hoja][0]);
                thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

                // Actualizar datos
                tbody.innerHTML = this.sheetsData[hoja].map(fila =>
                    `<tr>${headers.map(h => `<td>${fila[h] || ''}</td>`).join('')}</tr>`
                ).join('');
            }
        });
    }

    actualizarEstadísticasSheets() {
        document.getElementById('sheetsClientasCount').textContent = this.sheetsData.CLIENTAS.length;
        document.getElementById('sheetsCreditosCount').textContent = this.sheetsData['COLOCACIÓN'].length;
        document.getElementById('sheetsPagosCount').textContent = this.sheetsData.COBRANZA.length;
        document.getElementById('lastSyncTime').textContent = new Date().toLocaleString();
    }

    // MÉTODOS PRINCIPALES
    async registrarCliente() {
        const cliente = {
            curp: document.getElementById('curp').value.toUpperCase().trim(),
            nombre: document.getElementById('nombre').value.trim(),
            telefono: document.getElementById('telefono').value.trim(),
            grupo: document.getElementById('grupo').value,
            direccion: document.getElementById('direccion').value.trim(),
            fechaRegistro: new Date().toISOString(),
            registradoPor: this.usuarioActual.username,
            fuente: 'sistema'
        };

        // Validaciones
        if (this.clientas.find(c => c.curp === cliente.curp)) {
            this.mostrarAlerta('El CURP ya está registrado en el sistema', 'error');
            return;
        }

        try {
            // Guardar en sistema local
            this.clientas.push(cliente);
            this.guardarClientas();

            // Sincronizar con Google Sheets
            await this.sincronizarClienteSheets(cliente);

            this.mostrarAlerta('Cliente registrado y sincronizado con Google Sheets', 'success');
            this.ocultarFormulario('cliente');
            this.mostrarClientas();

        } catch (error) {
            console.error('Error al registrar cliente:', error);
            this.mostrarAlerta('Cliente guardado localmente, pero error al sincronizar con Sheets', 'warning');
        }
    }

    async sincronizarClienteSheets(cliente) {
        // En un entorno real, aquí iría el código para escribir en Google Sheets
        // Por ahora simulamos la sincronización
        console.log('Sincronizando cliente con Sheets:', cliente);

        // Simular escritura en Sheets
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Actualizar datos locales de sheets
        this.sheetsData.CLIENTAS.push({
            'CURP': cliente.curp,
            'NOMBRE': cliente.nombre,
            'TELÉFONO': cliente.telefono,
            'GRUPO': cliente.grupo,
            'DIRECCIÓN': cliente.direccion,
            'FECHA_REGISTRO': new Date().toLocaleDateString()
        });
    }

    // ... (otros métodos de sincronización)

    // MÉTODOS DE INTERFAZ
    mostrarSheetTab(hoja) {
        // Ocultar todos los contenidos de sheets
        document.querySelectorAll('.sheet-content').forEach(content => {
            content.classList.remove('active');
        });

        // Desactivar todos los botones
        document.querySelectorAll('.sheet-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Mostrar contenido seleccionado
        document.getElementById(`sheet-${hoja}`).classList.add('active');
        document.querySelector(`[data-sheet="${hoja}"]`).classList.add('active');
    }

    // ... (resto de métodos del sistema)

    guardarConfiguracion() {
        localStorage.setItem('finzana_config', JSON.stringify(this.configuracion));
    }

    guardarUsuarios() {
        localStorage.setItem('finzana_usuarios', JSON.stringify(this.usuarios));
    }

    guardarClientas() {
        localStorage.setItem('finzana_clientas', JSON.stringify(this.clientas));
    }

    // ... (otros métodos de guardado)
}

// Inicializar sistema
document.addEventListener('DOMContentLoaded', function () {
    window.finzana = new FinzanaSistema();
});