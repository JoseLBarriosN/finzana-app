
// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE
// =============================================

let currentUser = null;
let currentUserData = null;
let creditoActual = null;
let currentImportTab = 'clientes';
let reportData = null;
let cargaEnProgreso = false;
let currentSearchOperation = null;
let editingClientId = null;
let editingUserId = null;
let isOnline = true;
let inactivityTimer;
let grupoDePagoActual = null;
let currentChart = null;
let cobranzaRutaData = null;
let dropdownUpdateInProgress = false;
let clienteParaCredito = null;
const OFFLINE_STORAGE_KEY = 'cobranza_ruta_';
let mapInstance = null;
let directionsService = null;
let directionsRenderer = null;
let configSistema = { oferta13Semanas: false };
let waypointsComisionistas = [];
let carteraGlobalCache = [];

// Función Callback que Google Maps llama cuando carga
window.initMap = function() {
    console.log("🗺️ Google Maps API cargada.");
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
};

//========================================================//
      // ** CARGAR CONFIGURACION DE 13 SEMANAS ** //
//========================================================//
async function cargarConfiguracionSistema() {
    console.log("⚙️ Iniciando carga de configuración del sistema...");
    try {
        const docRef = db.collection('configuracion').doc('parametros_generales');
        const doc = await docRef.get();
        
        if (doc.exists) {
            configSistema = doc.data();
            console.log("✅ Configuración cargada desde DB:", configSistema);
        } else {
            console.warn("⚠️ No existe configuración en DB. Creando valores por defecto...");
            await docRef.set({ oferta13Semanas: false });
            configSistema = { oferta13Semanas: false };
        }
    } catch (error) {
        console.error("❌ Error CRÍTICO cargando configuración:", error);
        configSistema = { oferta13Semanas: false };
    }
}

/** Parsea de forma robusta una fecha que puede ser un string (ISO 8601, yyyy-mm-dd, etc.) **/
function parsearFecha(fechaInput) {
    if (!fechaInput) return null;
    if (fechaInput instanceof Date) return fechaInput;
    if (typeof fechaInput === 'object' && typeof fechaInput.toDate === 'function') return fechaInput.toDate();

    if (typeof fechaInput === 'string') {
        const fechaStr = fechaInput.trim();
        if (fechaStr.includes('T') && fechaStr.includes('Z') && fechaStr.length > 10) {
            const fecha = new Date(fechaStr);
            if (!isNaN(fecha.getTime())) return fecha;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
            const fecha = new Date(fechaStr + 'T00:00:00Z');
            if (!isNaN(fecha.getTime())) return fecha;
        }

        const separador = fechaStr.includes('/') ? '/' : '-';
        const partes = fechaStr.split('T')[0].split(separador);


        if (partes.length === 3) {
            const [p1, p2, p3] = partes.map(p => parseInt(p, 10));
            if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
                let anio, mes, dia;
                if (p3 > 1000 && p1 <= 31 && p2 <= 12) {
                    anio = p3; dia = p1; mes = p2;
                }
                else if (p1 > 1000 && p2 <= 12 && p3 <= 31) {
                    anio = p1; mes = p2; dia = p3;
                }
                else if (p3 > 1000 && p1 <= 12 && p2 <= 31) {
                    anio = p3; mes = p1; dia = p2;
                }


                if (anio && mes && dia && mes > 0 && mes <= 12 && dia > 0 && dia <= 31) {
                    const diasEnMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
                    if (dia <= diasEnMes) {
                        const fecha = new Date(Date.UTC(anio, mes - 1, dia));
                        if (!isNaN(fecha.getTime())) return fecha;
                    }
                }
            }
        }
    }

    console.warn("No se pudo parsear el formato de fecha:", fechaInput);
    return null;
}


/**
 * Formatea un objeto Date a un string DD/MM/YYYY para una visualización consistente.
 * @param {Date} dateObj El objeto Date a formatear.
 * @returns {string} La fecha formateada o 'N/A' si la entrada es inválida.
 */
function formatDateForDisplay(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        return 'N/A';
    }
    const dia = String(dateObj.getUTCDate()).padStart(2, '0');
    const mes = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const anio = dateObj.getUTCFullYear();
    return `${dia}/${mes}/${anio}`;
}


/**
 * Actualiza la UI para mostrar el estado actual de la conexión y gestiona filtros.
 */
function updateConnectionStatus() {
    const statusDiv = document.getElementById('connection-status');
    const logoutBtn = document.getElementById('logout-btn');
    if (!statusDiv || !logoutBtn) return;
    isOnline = navigator.onLine;
    const filtrosOnline = document.querySelectorAll('#sucursal_filtro, #estado_credito_filtro, #plazo_filtro, #curp_aval_filtro, #grupo_filtro, #tipo_colocacion_filtro');
    const botonesOnline = document.querySelectorAll('#btn-aplicar-filtros-reportes, #btn-exportar-csv, #btn-exportar-pdf, #btn-generar-grafico, #btn-verificar-duplicados, #btn-diagnosticar-pagos, #btn-agregar-poblacion, #btn-agregar-ruta');

    const progressContainer = document.getElementById('progress-container-fixed');
    const isProgressActive = progressContainer && progressContainer.classList.contains('visible');

    if (isProgressActive) {
        if (isOnline) {
            filtrosOnline.forEach(el => { if (el) el.disabled = false; });
            botonesOnline.forEach(el => { if (el) el.disabled = false; });
            if (currentUserData) aplicarPermisosUI(currentUserData.role);
            logoutBtn.disabled = false;
            logoutBtn.title = 'Cerrar Sesión';
            return;
        }
    }

    if (isOnline) {
        statusDiv.textContent = 'Conexión restablecida. Sincronizando datos...';
        statusDiv.className = 'connection-status online';
        statusDiv.classList.remove('hidden');
        document.body.classList.add('has-connection-status');
        logoutBtn.disabled = false;
        logoutBtn.title = 'Cerrar Sesión';
        filtrosOnline.forEach(el => { if (el) el.disabled = false; });
        botonesOnline.forEach(el => { if (el) el.disabled = false; });
        if (currentUserData) aplicarPermisosUI(currentUserData.role);
        setTimeout(() => {
            if (navigator.onLine) {
                statusDiv.textContent = 'Datos sincronizados correctamente.';             
                setTimeout(() => {                
                    if (navigator.onLine) {
                        statusDiv.classList.add('hidden');
                        document.body.classList.remove('has-connection-status');
                    }
                }, 2500);
            }
        }, 3000);
    } else {
        statusDiv.textContent = 'Modo sin conexión. Búsquedas por CURP, Nombre e ID Crédito habilitadas.';
        statusDiv.className = 'connection-status offline';
        statusDiv.classList.remove('hidden');
        document.body.classList.add('has-connection-status');
        logoutBtn.disabled = true;
        logoutBtn.title = 'No puedes cerrar sesión sin conexión';
        filtrosOnline.forEach(el => { if (el) el.disabled = true; });
        botonesOnline.forEach(el => { if (el) el.disabled = true; });
    }
}

// =============================================
// *** INICIO DE LA CORRECCIÓN: LÓGICA DE ESTADO/SEMANAS PAGADAS (REVISADA) ***
// =============================================

/**
 * Calcula el estado actual de un crédito (atraso, estado, etc.) basado en sus datos y pagos.
 * @param {object} credito El objeto de crédito de Firestore.
 * @param {Array<object>} pagos Un array de objetos de pago para ese crédito (DEBEN ESTAR ORDENADOS DESC POR FECHA).
 * @returns {object|null} Un objeto con { estado, semanasAtraso, pagoSemanal, saldoRestante, proximaFechaPago } o null si hay error.
 */
function _calcularEstadoCredito(credito, pagos) {
    // 1. Validaciones de seguridad
    if (!credito || !credito.montoTotal || !credito.plazo || credito.plazo <= 0 || !credito.fechaCreacion) {
        console.warn("Datos insuficientes para calcular estado:", credito?.id);
        return null;
    }

    // 2. DATOS FINANCIEROS (La verdad absoluta del dinero)
    const montoTotal = parseFloat(credito.montoTotal);
    const pagoSemanal = montoTotal / credito.plazo;
    
    // Sumamos todo lo que ha entrado, sin importar si fueron 10 pagos de $10 o 1 de $100
    let totalPagado = 0;
    if (pagos && pagos.length > 0) {
        totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0);
    }

    // Calculamos saldo con tolerancia de $1 para redondeos
    let saldoCalculado = montoTotal - totalPagado;
    if (saldoCalculado < 1) saldoCalculado = 0; 
    const saldoRestante = parseFloat(saldoCalculado.toFixed(2));

    // 3. SEMANAS PAGADAS (Financieras)
    // Respondemos: ¿Para cuántas semanas alcanza el dinero que ha dado?
    let semanasPagadasFinancieras = 0;
    if (pagoSemanal > 0) {
        // Floor asegura que solo contamos semanas COMPLETAMENTE pagadas
        semanasPagadasFinancieras = Math.floor((totalPagado + 0.1) / pagoSemanal);
    }

    // Tope visual: No decir "15 de 14" si no ha liquidado (aunque tenga saldo a favor)
    const semanasPagadasVisual = Math.min(semanasPagadasFinancieras, credito.plazo);

    // --- REGLA DE LIQUIDACIÓN ---
    // Solo si el saldo es 0 está liquidado.
    if (saldoRestante === 0) {
        return {
            estado: 'liquidado',
            semanasAtraso: 0,
            pagoSemanal: pagoSemanal,
            saldoRestante: 0,
            proximaFechaPago: 'N/A',
            semanasPagadas: credito.plazo 
        };
    }

    // 4. DATOS TEMPORALES (El tiempo transcurrido)
    const fechaCreacion = parsearFecha(credito.fechaCreacion);
    const hoy = new Date();
    // Normalizamos a UTC para evitar errores de horario de verano/invierno
    const hoyUTC = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
    const creacionUTC = new Date(Date.UTC(fechaCreacion.getUTCFullYear(), fechaCreacion.getUTCMonth(), fechaCreacion.getUTCDate()));

    const msTranscurridos = hoyUTC.getTime() - creacionUTC.getTime();
    // Semanas calendario que han pasado desde el inicio
    const semanasTranscurridas = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24 * 7));

    // 5. CÁLCULO DE EXIGIBILIDAD
    // Regla: El cliente debe pagar según el tiempo, pero nunca más del plazo total.
    // Si pasaron 20 semanas en un crédito de 14, solo le exigimos las 14.
    
    let semanasExigiblesPorTiempo = semanasTranscurridas;
    
    // Ajuste de gracia: Si es la semana 0 (recién creado), exigimos 0 para que nazca "al corriente"
    if (semanasExigiblesPorTiempo < 1) semanasExigiblesPorTiempo = 0;

    // El tope es el plazo del crédito
    let semanasExigiblesReales = Math.min(semanasExigiblesPorTiempo, credito.plazo);

    // 6. CÁLCULO DE ATRASO REAL
    // Atraso = Lo que debió pagar (Tiempo) - Lo que su dinero cubre (Financiero)
    let semanasAtraso = semanasExigiblesReales - semanasPagadasFinancieras;

    // Si pagó adelantado, el atraso es 0 (no negativo)
    if (semanasAtraso < 0) semanasAtraso = 0;

    // 7. DETERMINAR ESTATUS POR NIVEL DE DEUDA (NO POR FECHA DE PAGO)
    let estadoDisplay = 'al corriente';

    if (semanasAtraso === 0) {
        // Si no debe semanas completas, está al corriente
        estadoDisplay = 'al corriente';
        
        // REGLA ESPECIAL "VENCIDO PERO NO LIQUIDADO":
        // Si ya pasaron las 14 semanas (tiempo agotado) y aún hay saldo > 0...
        // Aunque semanasAtraso sea 0 (ej. pagó 13.9 semanas, floor es 13, exigible 14, atraso 1),
        // Si el tiempo ya venció y hay saldo, debe marcarse alerta.
        if (semanasTranscurridas >= credito.plazo && saldoRestante > 0) {
             // Si el atraso es pequeño (menos de 1 semana financiera), lo dejamos en atrasado leve
             // Si debe mucho dinero, caerá en los if de abajo.
             if (semanasAtraso < 1) estadoDisplay = 'atrasado'; 
        }

    } else if (semanasAtraso >= 1 && semanasAtraso <= 4) {
        estadoDisplay = 'atrasado';
    } else if (semanasAtraso > 4 && semanasAtraso <= 12) {
        estadoDisplay = 'cobranza';
    } else {
        estadoDisplay = 'juridico';
    }

    // 8. PRÓXIMA FECHA
    let proximaFechaPago = 'N/A';
    if (saldoRestante > 0) {
        const proximaFecha = new Date(fechaCreacion);
        // Proyectamos: Si pagó 5 semanas, la siguiente fecha es la semana 6
        proximaFecha.setUTCDate(proximaFecha.getUTCDate() + ((semanasPagadasFinancieras + 1) * 7));
        proximaFechaPago = formatDateForDisplay(proximaFecha);
    }

    return {
        estado: estadoDisplay,
        semanasAtraso: semanasAtraso,
        pagoSemanal: pagoSemanal,
        saldoRestante: saldoRestante,
        proximaFechaPago: proximaFechaPago,
        semanasPagadas: semanasPagadasVisual
    };
}

// =============================================
// LÓGICA DE SEGURIDAD, SESIÓN Y PERMISOS
// =============================================

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (currentUser) {
            alert("Sesión cerrada por inactividad.");
            auth.signOut();
        }
    }, 600000);
}

function setupSecurityListeners() {
    window.addEventListener('load', resetInactivityTimer);
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);
    document.addEventListener('touchstart', resetInactivityTimer);
    document.addEventListener('scroll', resetInactivityTimer);

    window.addEventListener('beforeunload', (event) => {
        if (cargaEnProgreso) {
            cancelarCarga();
        }
    });
}

/**
 * Muestra/oculta elementos del menú y ajusta filtros según el rol y oficina del usuario.
 * @param {string} role El rol del usuario (ej. 'Administrador', 'Gerencia', 'Área comercial').
 */
function aplicarPermisosUI(role) {
    if (!currentUserData) {
        console.warn("aplicarPermisosUI llamada sin currentUserData");
        document.querySelectorAll('.menu-card').forEach(card => card.style.display = 'none');
        return;
    }
    
    // 1. CONFIGURACIÓN DE VISTAS ESTÁNDAR
    const permisosMenu = {
        'Super Admin': ['all'],
        'Gerencia': ['all'],
        'Administrador': [
            'view-gestion-clientes', 'view-cliente', 'view-colocacion', 'view-cobranza',
            'view-pago-grupo', 'view-reportes', 'view-reportes-avanzados',
            'view-usuarios', 'view-importar', 'view-configuracion',
            'view-gestion-efectivo', 'view-reporte-contable',
            'view-hoja-corte'
        ],
        'Área comercial': [
            'view-gestion-clientes',
            'view-cliente',
            'view-colocacion',
            'view-cobranza',
            'view-pago-grupo',
            'view-registrar-gasto',
            'view-hoja-corte'
        ],
        'default': []
    };

    const userRoleKey = role === 'admin' ? 'Administrador' : role;
    const userPerms = permisosMenu[userRoleKey] || permisosMenu['default'];

    // 2. APLICACIÓN DE VISIBILIDAD (Con soporte para Botones Especiales)
    document.querySelectorAll('.menu-card').forEach(card => {
        const view = card.getAttribute('data-view');
        const cardId = card.id; // <--- NUEVO: Capturamos el ID del botón

        // A. Lógica Original (Basada en data-view)
        let visible = false;
        if (userPerms.includes('all') || (view && userPerms.includes(view))) {
            visible = true;
        }

        // B. Lógica para Botones Especiales (Por ID)
        
        // --- Botón MODO OFFLINE ---
        // Debe ser visible para Comercial y también para Admins/Super (para pruebas)
        if (cardId === 'btn-sync-offline-menu') {
            if (['Área comercial', 'Administrador', 'Super Admin', 'Gerencia'].includes(userRoleKey)) {
                visible = true;
            }
        }

        // --- Botón YUBIKEY TEST ---
        // Debe ser visible SOLO para Super Admin y Gerencia
        if (cardId === 'btn-yubikey-test') {
            if (['Super Admin', 'Gerencia'].includes(userRoleKey)) {
                visible = true;
            } else {
                visible = false; // Ocultar forzosamente a otros (ej. Administrador)
            }
        }

        // Aplicar estilo final
        card.style.display = visible ? 'block' : 'none';
    });

    // 3. LÓGICA DE FILTROS DE OFICINA (SE MANTIENE IGUAL)
    const userOffice = currentUserData.office;
    const filtrosOffice = [
        '#sucursal_filtro', '#sucursal_filtro_reporte', '#grafico_sucursal',
        '#office_cliente', '#nueva-poblacion-sucursal', '#nueva-ruta-sucursal',
        '#filtro-sucursal-usuario',
        '#nuevo-sucursal',
        '#reporte-contable-sucursal'
    ];

    const esAdminConAccesoTotal = (userRoleKey === 'Super Admin' || userRoleKey === 'Gerencia');
    if (userOffice && userOffice !== 'AMBAS' && !esAdminConAccesoTotal) {
        filtrosOffice.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.value = userOffice;
                el.disabled = true;
            }
        });
        
        _actualizarDropdownGrupo('grupo_filtro', userOffice, 'Todos');
        _actualizarDropdownGrupo('grupo_filtro_reporte', userOffice, 'Todos');
        _actualizarDropdownGrupo('grafico_grupo', userOffice, 'Todos');
        const officeClienteSelect = document.getElementById('office_cliente');
        if (officeClienteSelect) {
             handleOfficeChangeForClientForm.call(officeClienteSelect);
        }
        
        const nuevoSucursalSelect = document.getElementById('nuevo-sucursal');
        if (nuevoSucursalSelect) {
            _cargarRutasParaUsuario(userOffice);
        }
        
        const reporteSucursalSelect = document.getElementById('reporte-contable-sucursal');
        if (reporteSucursalSelect) {
            handleSucursalReporteContableChange.call(reporteSucursalSelect);
        }

    } else {
        filtrosOffice.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.disabled = false;
            }
        });
         if (!userOffice || userOffice === 'AMBAS') {
            _actualizarDropdownGrupo('grupo_filtro', '', 'Todos');
            _actualizarDropdownGrupo('grupo_filtro_reporte', '', 'Todos');
            _actualizarDropdownGrupo('grafico_grupo', '', 'Todos');
         }
    }

    // 4. LÓGICA DE CAMPOS ESPECÍFICOS (CURP, Exportar)
    const curpInput = document.getElementById('curp_cliente');
    if (curpInput) {
        const puedeEditarCURP = ['Super Admin', 'Gerencia', 'Administrador'].includes(userRoleKey);
        curpInput.readOnly = !puedeEditarCURP && (editingClientId !== null);
        const curpFieldNote = curpInput.closest('.form-group')?.querySelector('.field-note');
        if (curpFieldNote) {
            curpFieldNote.style.display = (editingClientId !== null) ? 'block' : 'none'; 
        }
    }

    const btnExportarTelefonos = document.getElementById('btn-exportar-telefonos');
    if (btnExportarTelefonos) {
        const puedeExportar = ['Super Admin', 'Gerencia'].includes(userRoleKey);
        btnExportarTelefonos.classList.toggle('hidden', !puedeExportar);
    }
}


/// ==================================================== ///
    /// FUNCIONES MOVIDAS ANTES DE DOM CONTENTLOADED ///
/// ==================================================== ///

//=========================================//
    // ** CARGAR TABLA DE CLIENTES ** //
//=========================================//
async function loadClientesTable() {
    if (cargaEnProgreso) {
        showStatus('status_gestion_clientes', 'Ya hay una búsqueda en progreso.', 'warning');
        return;
    }

    clearTimeout(inactivityTimer);
    cargaEnProgreso = true;
    currentSearchOperation = Date.now(); 
    const operationId = currentSearchOperation;

    const tbody = document.getElementById('tabla-clientes');
    const btnBuscar = document.querySelector('#btn-aplicar-filtros');
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Iniciando búsqueda...</td></tr>';
    showButtonLoading(btnBuscar, true, 'Buscando...');
    showFixedProgress(5, 'Iniciando...');

    let busquedaDetenida = false;
    let resultadosFinales = [];

    try {
        // --- 1. RECOLECCIÓN DE TODOS LOS FILTROS ---
        const filtros = {
            curp: document.getElementById('curp_filtro')?.value?.trim() || '',
            nombre: document.getElementById('nombre_filtro')?.value?.trim() || '',
            idCredito: document.getElementById('id_credito_filtro')?.value?.trim() || '',
            estado: document.getElementById('estado_credito_filtro')?.value || '', 
            // NUEVO: Agregamos Tipo de Colocación
            tipoColocacion: document.getElementById('tipo_colocacion_filtro')?.value || '', 
            curpAval: document.getElementById('curp_aval_filtro')?.value?.trim() || '',
            plazo: document.getElementById('plazo_filtro')?.value || '',
            grupo: document.getElementById('grupo_filtro')?.value || '',
            soloComisionistas: document.getElementById('comisionista_filtro')?.checked || false,
            fechaCredito: document.getElementById('fecha_credito_filtro')?.value || '', 
            fechaRegistro: document.getElementById('fecha_registro_filtro')?.value || '',
            userOffice: (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia') ? null : currentUserData?.office,
            office: document.getElementById('sucursal_filtro')?.value || '',
            ruta: (currentUserData?.role === 'Área comercial') ? currentUserData?.ruta : null
        };

        if (currentUserData?.role === 'Área comercial' && !currentUserData?.ruta) {
            throw new Error("Tu usuario no tiene ruta asignada.");
        }

        if (operationId !== currentSearchOperation) throw new Error("Cancelado");
        showFixedProgress(20, 'Consultando base de datos...');

        // --- 2. LÓGICA DE BÚSQUEDA ---
        
        // A) BÚSQUEDA POR ID CRÉDITO
        if (filtros.idCredito) {
             const creditos = await database.buscarCreditosPorHistoricalId(filtros.idCredito, { userOffice: filtros.userOffice, office: filtros.office });
             
             for (const cred of creditos) {
                if (operationId !== currentSearchOperation) { busquedaDetenida = true; break; }
                
                // Aplicar filtros directos al crédito
                if (filtros.tipoColocacion && cred.tipo !== filtros.tipoColocacion) continue;
                if (filtros.plazo && cred.plazo != filtros.plazo) continue;

                const cliente = await database.buscarClientePorCURP(cred.curpCliente, filtros.userOffice);
                if(cliente) {
                    // Calculamos estado AQUÍ para filtrar
                    const histId = cred.historicalIdCredito || cred.id;
                    const pagos = await database.getPagosPorCredito(histId, cred.office);
                    pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
                    const datosCalculados = _calcularEstadoCredito(cred, pagos);

                    // Filtro de Estado
                    if (filtros.estado && datosCalculados.estado !== filtros.estado) continue;

                    // Si pasa todo, guardamos con los datos ya calculados
                    resultadosFinales.push({ cliente, credito: cred, calculoPrecaragado: datosCalculados, pagos: pagos });
                }
             }

        } else {
            // B) BÚSQUEDA GENERAL
            const clientesEncontrados = await database.buscarClientes(filtros);
            
            const clientesFiltrados = clientesEncontrados.filter(c => {
                if (operationId !== currentSearchOperation) return false; 
                if (filtros.fechaRegistro) {
                    const rawDate = c.fechaRegistro || c.fechaCreacion;
                    if (String(rawDate).match(/^\d{8,15}$/)) return false; 
                    const fObj = parsearFecha(rawDate);
                    if (!fObj || isNaN(fObj.getTime())) return false;
                    return fObj.toISOString().split('T')[0] === filtros.fechaRegistro;
                }
                return true;
            });

            if (clientesFiltrados.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes.</td></tr>';
                showStatus('status_gestion_clientes', 'No se encontraron resultados.', 'info');
                showFixedProgress(100, 'Sin resultados');
                return; 
            }

            const total = clientesFiltrados.length;
            showFixedProgress(30, `Analizando ${total} clientes...`);

            // --- BUCLE PRINCIPAL ---
            for (const [index, cliente] of clientesFiltrados.entries()) {
                if (operationId !== currentSearchOperation) { busquedaDetenida = true; break; }
                if (filtros.soloComisionistas && !cliente.isComisionista) continue;

                const creditosCliente = await database.buscarCreditosPorCliente(cliente.curp, filtros.userOffice, filtros.fechaCredito);
                
                if (creditosCliente.length > 0) {
                    let algunCreditoPasa = false;

                    // Ordenar por fecha
                    creditosCliente.sort((a, b) => {
                        const tA = parsearFecha(a.fechaCreacion)?.getTime() || 0;
                        const tB = parsearFecha(b.fechaCreacion)?.getTime() || 0;
                        return tB - tA;
                    });
                    
                    // Revisar cada crédito contra los filtros
                    for (const cred of creditosCliente) {
                         // Filtros rápidos
                         if (filtros.plazo && cred.plazo != filtros.plazo) continue;
                         if (filtros.curpAval && (!cred.curpAval || !cred.curpAval.includes(filtros.curpAval))) continue;
                         if (filtros.tipoColocacion && cred.tipo !== filtros.tipoColocacion) continue;
                         if (filtros.fechaCredito) {
                            const fObj = parsearFecha(cred.fechaCreacion);
                            if(!fObj || fObj.toISOString().split('T')[0] !== filtros.fechaCredito) continue;
                         }

                         // Filtro PESADO (Estado)
                         // Si hay filtro de estado, calculamos. Si no, calculamos solo para mostrar info.
                         const histId = cred.historicalIdCredito || cred.id;
                         const pagos = await database.getPagosPorCredito(histId, cred.office);
                         pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
                         const datosCalculados = _calcularEstadoCredito(cred, pagos);

                         if (filtros.estado) {
                             if (!datosCalculados || datosCalculados.estado !== filtros.estado) continue;
                         }

                         // ¡PASA TODOS LOS FILTROS!
                         resultadosFinales.push({ 
                             cliente, 
                             credito: cred, 
                             calculoPrecaragado: datosCalculados, 
                             pagos: pagos
                         });
                         algunCreditoPasa = true;
                    }
                    
                    // Si el cliente no tiene créditos que pasen el filtro, PERO no estamos filtrando por características de crédito...
                    // (Ej: Busco solo por "Población Ocotlán", quiero ver al cliente aunque no tenga crédito activo o sus créditos sean viejos)
                    const filtrosActivosCredito = filtros.plazo || filtros.estado || filtros.curpAval || filtros.fechaCredito || filtros.idCredito || filtros.tipoColocacion;
                    
                    if (!algunCreditoPasa && !filtrosActivosCredito) {
                         // Mostramos al cliente "sin crédito activo" en la tabla
                         resultadosFinales.push({ cliente, credito: null, calculoPrecaragado: null, pagos: [] });
                    }

                } else {
                    // Cliente sin historial de créditos
                    const filtrosActivosCredito = filtros.plazo || filtros.estado || filtros.curpAval || filtros.fechaCredito || filtros.idCredito || filtros.tipoColocacion;
                    if (!filtrosActivosCredito) {
                        resultadosFinales.push({ cliente, credito: null });
                    }
                }

                // Barra progreso
                if (index % 5 === 0 || index === total - 1) {
                    const pct = 30 + Math.floor(((index + 1) / total) * 60); 
                    showFixedProgress(pct, `Procesando ${index + 1}/${total}...`);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }

        // --- RENDERIZADO FINAL ---
        showFixedProgress(95, 'Generando tabla...');
        
        resultadosFinales.sort((a, b) => {
            const tA = a.credito ? parsearFecha(a.credito.fechaCreacion)?.getTime() || 0 : 0;
            const tB = b.credito ? parsearFecha(b.credito.fechaCreacion)?.getTime() || 0 : 0;
            return tB - tA;
        });

        tbody.innerHTML = '';
        if (resultadosFinales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No se encontraron registros con los filtros combinados.</td></tr>';
            showStatus('status_gestion_clientes', 'No se encontraron resultados.', 'info');
        } else {
            for (const item of resultadosFinales) {
                if (operationId !== currentSearchOperation) { busquedaDetenida = true; break; }
                // Llamamos a render con los datos ya calculados (optimizacion)
                await renderFilaTablaClientes(tbody, item.cliente, item.credito, null, item.calculoPrecaragado, item.pagos);
            }
        }

        if (busquedaDetenida) {
            showFixedProgress(100, 'Detenido');
            showStatus('status_gestion_clientes', `⚠️ Búsqueda detenida.`, 'warning');
        } else {
            showFixedProgress(100, 'Completado');
            if(operationId === currentSearchOperation) {
                // Mensaje INFO (azul) para que no desaparezca
                showStatus('status_gestion_clientes', `Búsqueda completada. <strong>${resultadosFinales.length}</strong> registros encontrados.`, 'info');
            }
        }

    } catch (error) {
        if (error.message !== "Cancelado") {
            console.error('Error:', error);
            tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
            showStatus('status_gestion_clientes', error.message, 'error');
        }
    } finally {
        if (operationId === currentSearchOperation) {
            cargaEnProgreso = false;
            showButtonLoading(btnBuscar, false);
            setTimeout(hideFixedProgress, 1500);
        }
    }
}

//==================================//
    // ** RENDERIZAR FILA ** //
//==================================// 
async function renderFilaTablaClientes(tbody, cliente, credito, filtroEstado, calculoPrecaragado = null, pagosPrecaragados = null) {
    let infoCreditoHTML = '';

    if (credito) {
        const historicalId = credito.historicalIdCredito || credito.id;
        
        // OPTIMIZACIÓN: Si ya traemos los datos calculados desde loadClientesTable, los usamos.
        // Si no (fallback), los buscamos.
        let pagos = pagosPrecaragados;
        let estadoCalc = calculoPrecaragado;

        if (!pagos || !estadoCalc) {
            pagos = await database.getPagosPorCredito(historicalId, credito.office);
            pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
            estadoCalc = _calcularEstadoCredito(credito, pagos);
        }

        const ultimoPago = pagos.length > 0 ? pagos[0] : null;
        const fechaInicioCredito = formatDateForDisplay(parsearFecha(credito.fechaCreacion));
        const fechaUltimoPago = formatDateForDisplay(ultimoPago ? parsearFecha(ultimoPago.fecha) : null);
        const estadoClase = `status-${estadoCalc.estado.replace(/\s/g, '-')}`;
        const estadoHTML = `<span class="info-value ${estadoClase}">${estadoCalc.estado.toUpperCase()}</span>`;
        const semanasPagadas = estadoCalc.semanasPagadas || 0;
        
        // Construimos el HTML
        infoCreditoHTML = `
            <div class="credito-info">
                <div class="info-grid">
                    <div class="info-item"><span class="info-label">ID Crédito (Hist):</span><span class="info-value">${historicalId}</span></div>
                    <div class="info-item"><span class="info-label">Estado:</span>${estadoHTML}</div>
                    <div class="info-item"><span class="info-label">Saldo Actual:</span><span class="info-value">$${estadoCalc.saldoRestante.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                    <div class="info-item"><span class="info-label">Semanas Pagadas:</span><span class="info-value">${semanasPagadas} de ${credito.plazo || '?'}</span></div>
                    ${estadoCalc.semanasAtraso > 0 ? `<div class="info-item"><span class="info-label">Semanas Atraso:</span><span class="info-value">${estadoCalc.semanasAtraso}</span></div>` : ''}
                    <div class="info-item"><span class="info-label">Último Pago:</span><span class="info-value">${fechaUltimoPago}</span></div>
                    <div class="info-item"><span class="info-label">Nombre Aval:</span><span class="info-value">${credito.nombreAval || 'N/A'}</span></div>
                    <div class="info-item"><span class="info-label">CURP Aval:</span><span class="info-value">${credito.curpAval || 'N/A'}</span></div>
                    <div class="info-item"><span class="info-label">Tipo:</span><span class="info-value">${credito.tipo ? credito.tipo.toUpperCase() : 'N/A'}</span></div>
                </div>
                <button class="btn btn-sm btn-info" onclick="mostrarHistorialPagos('${historicalId}', '${credito.office}')" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-receipt"></i> Ver Historial de Pagos (${pagos.length})
                </button>
            </div>`;
            
    } else {
        infoCreditoHTML = `<div style="padding: 15px; text-align: center; background: #f8f9fa; border-radius: 8px; border: 1px dashed #ccc;">
            <span style="color: #6c757d; font-style: italic;">Cliente registrado sin crédito activo actualmente.</span>
        </div>`;
    }

    // JSON Stringify seguro para el botón editar
    const clienteJson = JSON.stringify(cliente).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
    const comisionistaBadge = cliente.isComisionista ? '<span class="comisionista-badge-cliente" title="Comisionista">★</span>' : '';
    const fechaRegistro = formatDateForDisplay(parsearFecha(cliente.fechaRegistro || cliente.fechaCreacion));

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>
            <b>${cliente.office || 'N/A'}</b><br>
            <small>Reg: ${fechaRegistro}</small>
        </td>
        <td>${cliente.curp}</td>
        <td>
            ${cliente.nombre} ${comisionistaBadge}<br>
            <a href="tel:${cliente.telefono}" class="tel-link" style="font-size: 0.85em; color: var(--primary); text-decoration: none;">
                <i class="fas fa-phone"></i> ${cliente.telefono || 'N/A'}
            </a>
        </td>
        <td>
            <div style="font-weight: bold;">${cliente.poblacion_grupo || 'N/A'}</div>
            <div style="font-size: 0.85em; color: gray;">Ruta: ${cliente.ruta || 'N/A'}</div>
            <div style="font-size: 0.8em; margin-top:4px; border-top:1px solid #eee;">Dom: ${cliente.domicilio || ''}</div>
        </td>
        <td>${infoCreditoHTML}</td>
        <td class="action-buttons">
             <button class="btn btn-sm btn-info" onclick='editCliente(${clienteJson})' title="Editar Cliente"><i class="fas fa-edit"></i></button>
             <button class="btn btn-sm btn-danger" onclick="deleteCliente('${cliente.id}', '${cliente.nombre}')" title="Eliminar Cliente"><i class="fas fa-trash"></i></button>
        </td>
    `;
    tbody.appendChild(tr);
}

//=======================================================//
    // ** INICIALIZAR VISTA GESTION DE CLIENTES ** //
//=======================================================//
function inicializarVistaGestionClientes() {
    const tbody = document.getElementById('tabla-clientes');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6">Utiliza los filtros para buscar y mostrar clientes/créditos.</td></tr>`;
    }
}

function limpiarFiltrosClientes() {
    if (cargaEnProgreso) {
        cancelarCarga();
    }
    const filtrosGrid = document.getElementById('filtros-grid');
    if (filtrosGrid) {
        filtrosGrid.querySelectorAll('input, select').forEach(el => {
            if (!el.disabled) {
                // Respetamos si hay filtros de oficina bloqueados por rol
                el.value = '';
            }
        });
        
        // Asegurar limpiar checkboxes como "Solo Comisionistas"
        filtrosGrid.querySelectorAll('input[type="checkbox"]').forEach(chk => {
             chk.checked = false;
        });
    }
    inicializarVistaGestionClientes();
    showStatus('status_gestion_clientes', 'Filtros limpiados. Ingresa nuevos criterios para buscar.', 'info');
}

//===============================================//
    // ** INICIALIZAR REPORTES AVANZADOS ** //
//===============================================//
function inicializarVistaReportesAvanzados() {
    const tbody = document.getElementById('tabla-reportes_avanzados');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10">Aplica los filtros para generar el reporte.</td></tr>';
    }
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate() + 1);
    const hoyISO = hoy.toISOString().split('T')[0];
    const haceUnMesISO = haceUnMes.toISOString().split('T')[0];

    const fechaInicio = document.getElementById('fecha_inicio_reporte');
    const fechaFin = document.getElementById('fecha_fin_reporte');

    if (fechaInicio) fechaInicio.value = haceUnMesISO;
    if (fechaFin) fechaFin.value = hoyISO;

    reportData = null;
    const estadisticasElement = document.getElementById('estadisticas-reporte');
    if (estadisticasElement) estadisticasElement.innerHTML = '';
    showStatus('status_reportes_avanzados', 'Filtros inicializados. Presiona "Generar Reporte".', 'info');
}

function limpiarFiltrosReportes() {
    if (cargaEnProgreso) {
        cancelarCarga();
    }
    const filtrosContainer = document.getElementById('filtros-reportes-avanzados');
    if (filtrosContainer) {
        filtrosContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date' && !el.disabled) {
                el.value = '';
            }
        });
    }
    inicializarVistaReportesAvanzados();
    showStatus('status_reportes_avanzados', 'Filtros limpiados. Selecciona nuevos criterios y genera el reporte.', 'info');
}

//=====================================//
    // ** REPORTES AVANZADOS ** //
//=====================================//
async function loadAdvancedReports() {
    if (cargaEnProgreso) {
        showStatus('status_reportes_avanzados', 'Ya hay una generación de reporte en progreso. Espera a que termine.', 'warning');
        return;
    }

    clearTimeout(inactivityTimer);
    
    cargaEnProgreso = true;
    currentSearchOperation = Date.now();
    const operationId = currentSearchOperation;

    showProcessingOverlay(true, 'Generando reporte avanzado...');
    showButtonLoading('#btn-aplicar-filtros-reportes', true, 'Generando...');
    showFixedProgress(20, 'Recopilando filtros...');
    const statusReportes = document.getElementById('status_reportes_avanzados');
    statusReportes.innerHTML = 'Aplicando filtros y buscando datos...';
    statusReportes.className = 'status-message status-info';
    document.getElementById('tabla-reportes_avanzados').innerHTML = '<tr><td colspan="10">Generando reporte...</td></tr>';
    document.getElementById('estadisticas-reporte').innerHTML = '';
    reportData = null;

    try {
        const filtros = {
            office: document.getElementById('sucursal_filtro_reporte')?.value || '',
            grupo: document.getElementById('grupo_filtro_reporte')?.value || '',
            ruta: document.getElementById('ruta_filtro_reporte')?.value || '',
            tipoCredito: document.getElementById('tipo_credito_filtro_reporte')?.value || '',
            estadoCredito: document.getElementById('estado_credito_filtro_reporte')?.value || '',
            tipoPago: document.getElementById('tipo_pago_filtro_reporte')?.value || '',
            fechaInicio: document.getElementById('fecha_inicio_reporte')?.value || '',
            fechaFin: document.getElementById('fecha_fin_reporte')?.value || '',
            curpCliente: document.getElementById('curp_filtro_reporte')?.value.trim().toUpperCase() || '',
            idCredito: document.getElementById('id_credito_filtro_reporte')?.value.trim() || '',
            userOffice: currentUserData?.office
        };

        if (filtros.fechaInicio && filtros.fechaFin && new Date(filtros.fechaInicio) > new Date(filtros.fechaFin)) {
            throw new Error("La fecha de inicio no puede ser posterior a la fecha de fin.");
        }

        showFixedProgress(50, 'Consultando base de datos...');
        const data = await database.generarReporteAvanzado(filtros);

        if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");

        reportData = data;

        showFixedProgress(80, 'Mostrando resultados...');
        mostrarReporteAvanzado(reportData);
        showFixedProgress(100, 'Reporte generado');

        showStatus('status_reportes_avanzados', `Reporte generado: ${reportData.length} registros encontrados.`, 'success');

    } catch (error) {
        if (error.message === "Búsqueda cancelada") {
            showStatus('status_reportes_avanzados', 'Generación de reporte cancelada.', 'warning');
            document.getElementById('tabla-reportes_avanzados').innerHTML = '<tr><td colspan="10">Generación cancelada.</td></tr>';
        } else {
            console.error('Error generando reporte avanzado:', error);
            showStatus('status_reportes_avanzados', `Error al generar el reporte: ${error.message}`, 'error');
            document.getElementById('tabla-reportes_avanzados').innerHTML = `<tr><td colspan="10">Error: ${error.message}</td></tr>`;
        }
        hideFixedProgress();
    } finally {
        if (operationId === currentSearchOperation) {
            cargaEnProgreso = false;
            showProcessingOverlay(false);
            showButtonLoading('#btn-aplicar-filtros-reportes', false);
            setTimeout(hideFixedProgress, 2000);
        }
    }
}

//===========================================//
    // ** MOSTRAR REPORTES AVANZADOS ** //
//===========================================//
function mostrarReporteAvanzado(data) {
    const tbody = document.getElementById('tabla-reportes_avanzados');
    const estadisticasElement = document.getElementById('estadisticas-reporte');
    if (!tbody || !estadisticasElement) return;

    tbody.innerHTML = '';
    estadisticasElement.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10">No se encontraron datos con los filtros aplicados.</td></tr>';
        return;
    }

    data.forEach(item => {
        const tr = document.createElement('tr');
        const fechaRegistro = formatDateForDisplay(parsearFecha(item.fechaRegistro));
        const fechaCreacion = formatDateForDisplay(parsearFecha(item.fechaCreacion));
        const fechaPago = formatDateForDisplay(parsearFecha(item.fecha));

        let rowContent = '';
        if (item.tipo === 'cliente') {
            rowContent = `<td>CLIENTE</td><td>${item.curp || ''}</td><td>${item.nombre || ''}</td><td>${item.poblacion_grupo || ''}</td><td>${item.ruta || ''}</td><td>${item.office || ''}</td><td>${fechaRegistro}</td><td>Registro</td><td>-</td><td>-</td>`;
        } else if (item.tipo === 'credito') {
            rowContent = `<td>CRÉDITO</td><td>${item.curpCliente || ''}</td><td>${item.nombreCliente || ''}</td><td>${item.poblacion_grupo || ''}</td><td>${item.ruta || ''}</td><td>${item.office || ''}</td><td>${fechaCreacion}</td><td>${item.tipo || 'Colocación'}</td><td>$${(item.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>$${(item.saldo !== undefined ? item.saldo : 'N/A').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
        } else if (item.tipo === 'pago') {
            rowContent = `<td>PAGO</td><td>${item.curpCliente || ''}</td><td>${item.nombreCliente || ''}</td><td>${item.poblacion_grupo || ''}</td><td>${item.ruta || ''}</td><td>${item.office || ''}</td><td>${fechaPago}</td><td>${item.tipoPago || 'Pago'}</td><td>$${(item.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>$${(item.saldoDespues !== undefined ? item.saldoDespues : 'N/A').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
        }
        tr.innerHTML = rowContent;
        tbody.appendChild(tr);
    });

    const totalRegistros = data.length;
    const totalClientes = new Set(data.filter(item => item.tipo === 'cliente').map(item => item.curp)).size;
    const totalCreditos = new Set(data.filter(item => item.tipo === 'credito').map(item => item.historicalIdCredito || item.id)).size;
    const totalPagos = data.filter(item => item.tipo === 'pago').length;
    const totalMontoPagos = data.filter(item => item.tipo === 'pago').reduce((sum, item) => sum + (item.monto || 0), 0);
    const totalMontoColocado = data.filter(item => item.tipo === 'credito').reduce((sum, item) => sum + (item.monto || 0), 0);

    estadisticasElement.innerHTML = `
        <div class="status-message status-info">
            <strong>Resumen del Reporte:</strong><br>
            Registros Totales: ${totalRegistros} |
            Clientes Únicos (en reporte): ${totalClientes} |
            Créditos Únicos (en reporte): ${totalCreditos} |
            Total Pagos: ${totalPagos} |
            Monto Total Pagado: $${totalMontoPagos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} |
             Monto Total Colocado (en reporte): $${totalMontoColocado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
    `;
}


//=========================================//
    // ** EXPORTAR REPORTES A CSV ** //
//=========================================//
function exportToCSV() {
    if (!reportData || reportData.length === 0) {
        showStatus('status_reportes_avanzados', 'No hay datos para exportar. Genera un reporte primero.', 'warning');
        return;
    }

    showProcessingOverlay(true, 'Generando archivo CSV...');
    showButtonLoading('#btn-exportar-csv', true, 'Generando...');
    showFixedProgress(50, 'Preparando datos...');

    try {
        const headers = ['Tipo', 'CURP', 'Nombre', 'Grupo/Población', 'Ruta', 'Sucursal', 'Fecha', 'Tipo Operación', 'Monto', 'Saldo', 'ID Crédito (Hist)'];
        let csvContent = headers.join(',') + '\n';

        showFixedProgress(70, 'Convirtiendo datos a CSV...');
        reportData.forEach(item => {
            let row = [];
            const fechaRegistro = formatDateForDisplay(parsearFecha(item.fechaRegistro));
            const fechaCreacion = formatDateForDisplay(parsearFecha(item.fechaCreacion));
            const fechaPago = formatDateForDisplay(parsearFecha(item.fecha));
            const idCreditoMostrar = item.historicalIdCredito || item.idCredito || item.id || '';

            const escapeCSV = (field) => {
                if (field === undefined || field === null) return '';
                let str = String(field);
                if (str.includes('"') || str.includes(',') || str.includes('\n')) {
                    str = `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            if (item.tipo === 'cliente') {
                row = ['CLIENTE', escapeCSV(item.curp), escapeCSV(item.nombre), escapeCSV(item.poblacion_grupo), escapeCSV(item.ruta), escapeCSV(item.office), fechaRegistro, 'Registro', '', '', ''];
            } else if (item.tipo === 'credito') {
                row = ['CRÉDITO', escapeCSV(item.curpCliente), escapeCSV(item.nombreCliente), escapeCSV(item.poblacion_grupo), escapeCSV(item.ruta), escapeCSV(item.office), fechaCreacion, escapeCSV(item.tipo || 'Colocación'), item.monto || 0, item.saldo !== undefined ? item.saldo : '', escapeCSV(idCreditoMostrar)];
            } else if (item.tipo === 'pago') {
                row = ['PAGO', escapeCSV(item.curpCliente), escapeCSV(item.nombreCliente), escapeCSV(item.poblacion_grupo), escapeCSV(item.ruta), escapeCSV(item.office), fechaPago, escapeCSV(item.tipoPago || 'Pago'), item.monto || 0, item.saldoDespues !== undefined ? item.saldoDespues : '', escapeCSV(idCreditoMostrar)];
            }

            csvContent += row.join(',') + '\n';
        });

        showFixedProgress(90, 'Creando archivo descargable...');
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.setAttribute('download', `reporte_finzana_${timestamp}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            alert("Tu navegador no soporta la descarga directa. El archivo CSV podría abrirse en una nueva pestaña.");
            const url = URL.createObjectURL(blob);
            window.open(url);
        }

        showFixedProgress(100, 'Archivo CSV exportado');
        showStatus('status_reportes_avanzados', 'Archivo CSV exportado exitosamente.', 'success');
    } catch (error) {
        console.error('Error exportando CSV:', error);
        showStatus('status_reportes_avanzados', `Error al exportar CSV: ${error.message}`, 'error');
        hideFixedProgress();
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('#btn-exportar-csv', false);
        setTimeout(hideFixedProgress, 2000);
    }
}

//=========================================//
    // ** EXPORTAR REPORTES A PDF ** //
//=========================================//
function exportToPDF() {
    if (!reportData || reportData.length === 0) {
        alert('No hay datos para exportar. Genera un reporte primero.');
        return;
    }

    showProcessingOverlay(true, 'Generando archivo PDF...');
    showButtonLoading('#btn-exportar-pdf', true, 'Generando...');
    showFixedProgress(30, 'Preparando contenido para PDF...');

    try {
        const tableElement = document.getElementById('tabla-reportes_avanzados');
        const titleElement = document.querySelector('#view-reportes-avanzados h2');
        const filtersElement = document.getElementById('filtros-reportes-avanzados');
        const statsElement = document.getElementById('estadisticas-reporte');

        if (!tableElement) {
            throw new Error('No se encontró la tabla del reporte para exportar.');
        }

        const contentForPdf = document.createElement('div');
        contentForPdf.style.padding = '20px';
        contentForPdf.style.fontFamily = 'Arial, sans-serif';
        contentForPdf.style.fontSize = '10px';

        if (titleElement) {
            const titleClone = titleElement.cloneNode(true);
            titleClone.style.textAlign = 'center';
            titleClone.style.marginBottom = '15px';
            contentForPdf.appendChild(titleClone);
        }

        if (filtersElement) {
            const filtersSummary = document.createElement('div');
            filtersSummary.style.marginBottom = '15px';
            filtersSummary.style.fontSize = '9px';
            filtersSummary.style.border = '1px solid #ccc';
            filtersSummary.style.padding = '10px';
            filtersSummary.innerHTML = '<strong>Filtros Aplicados:</strong><br>';
            filtersElement.querySelectorAll('input, select').forEach(el => {
                if (el.value && el.id) {
                    const label = filtersElement.querySelector(`label[for="${el.id}"]`)?.textContent || el.id;
                    filtersSummary.innerHTML += `${label}: ${el.selectedOptions ? el.selectedOptions[0].text : el.value}<br>`;
                }
            });
            contentForPdf.appendChild(filtersSummary);
        }

        if (statsElement) {
            const statsClone = statsElement.cloneNode(true);
            statsClone.style.marginBottom = '15px';
            statsClone.querySelector('div')?.classList.remove('status-message', 'status-info', 'status-success', 'status-warning', 'status-error');
            contentForPdf.appendChild(statsClone);
        }

        const tableClone = tableElement.cloneNode(true);
        const headers = tableClone.querySelector('thead tr');
        if (headers) {
            const th = document.createElement('th');
            th.textContent = 'ID Crédito (Hist)';
            headers.appendChild(th);
        }
        const rows = tableClone.querySelectorAll('tbody tr');
        rows.forEach((row, index) => {
            const item = reportData[index];
            const idCreditoMostrar = item.historicalIdCredito || item.idCredito || item.id || '';
            const td = document.createElement('td');
            td.textContent = idCreditoMostrar;
            row.appendChild(td);
        });

        tableClone.style.width = '100%';
        tableClone.style.borderCollapse = 'collapse';
        tableClone.querySelectorAll('th, td').forEach(cell => {
            cell.style.border = '1px solid #ddd';
            cell.style.padding = '4px 6px';
            cell.style.fontSize = '8px';
        });
        tableClone.querySelector('thead').style.backgroundColor = '#f2f2f2';
        contentForPdf.appendChild(tableClone);

        const opt = {
            margin: [1, 0.5, 1, 0.5],
            filename: `reporte_finzana_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'cm', format: 'a4', orientation: 'landscape' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        showFixedProgress(70, 'Generando PDF...');

        html2pdf().set(opt).from(contentForPdf).save()
            .then(() => {
                showFixedProgress(100, 'PDF generado');
                showStatus('status_reportes_avanzados', 'Archivo PDF exportado exitosamente.', 'success');
                showProcessingOverlay(false);
                showButtonLoading('#btn-exportar-pdf', false);
                setTimeout(hideFixedProgress, 2000);
            })
            .catch(error => {
                console.error('Error generando PDF con html2pdf:', error);
                throw new Error(`Error al generar PDF: ${error.message}`);
            });

    } catch (error) {
        console.error('Error preparando contenido para PDF:', error);
        showStatus('status_reportes_avanzados', `Error al exportar PDF: ${error.message}`, 'error');
        showProcessingOverlay(false);
        showButtonLoading('#btn-exportar-pdf', false);
        hideFixedProgress();
    }
}

// =============================================
// MANEJADORES DE EVENTOS ESPECÍFICOS
// =============================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const statusElement = document.getElementById('auth-status');
    const loginButton = e.target.querySelector('button[type="submit"]');

    showButtonLoading(loginButton, true, 'Iniciando...');
    statusElement.textContent = 'Iniciando sesión...';
    statusElement.className = 'status-message status-info';
    statusElement.classList.remove('hidden');

    try {
        await auth.signInWithEmailAndPassword(email, password);

    } catch (error) {
        console.error("Error de inicio de sesión:", error.code, error.message);
        let mensajeError = 'Error: Credenciales incorrectas o problema de conexión.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            mensajeError = 'Error: Correo electrónico o contraseña incorrectos.';
        } else if (error.code === 'auth/network-request-failed') {
            mensajeError = 'Error: No se pudo conectar al servidor. Verifica tu conexión a internet.';
        } else if (error.code === 'auth/too-many-requests') {
            mensajeError = 'Error: Demasiados intentos fallidos. Intenta más tarde.';
        }
        statusElement.textContent = mensajeError;
        statusElement.className = 'status-message status-error';
        showButtonLoading(loginButton, false);
    }
}

//==========================================//
    // ** MANEJAR CAMBIOS DE OFICINA ** //
//==========================================//
function handleOfficeChange() {
    const office = this.value;
    const isGDL = office === 'GDL';
    const gdlSection = document.getElementById('import-gdl-section');
    const leonSection = document.getElementById('import-leon-section');

    if (gdlSection) gdlSection.classList.toggle('hidden', !isGDL);
    if (leonSection) leonSection.classList.toggle('hidden', isGDL);

    currentImportTab = 'clientes';
    const activeSection = isGDL ? gdlSection : leonSection;
    if (activeSection) {
        activeSection.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
        activeSection.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));

        const clienteTab = activeSection.querySelector(`.import-tab[data-tab="clientes"]`);
        if (clienteTab) clienteTab.classList.add('active');

        const clienteContentId = `tab-${office.toLowerCase()}-clientes`;
        const clienteContent = document.getElementById(clienteContentId);
        if (clienteContent) clienteContent.classList.remove('hidden');
    }
    document.getElementById('resultado-importacion')?.classList.add('hidden');
    document.getElementById('estado-importacion').innerHTML = '';
    document.getElementById('detalle-importacion').innerHTML = '';
}

//==========================================//
    // ** MANEJO DE CLICK DE TABLAS ** //
//==========================================//
function handleTabClick() {
    const parentSection = this.closest('[id$="-section"]');
    if (!parentSection) return;

    parentSection.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    currentImportTab = this.getAttribute('data-tab');
    parentSection.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));

    const officePrefix = parentSection.id.includes('gdl') ? 'gdl' : 'leon';
    const targetTabContentId = `tab-${officePrefix}-${currentImportTab}`;
    const targetTabContent = document.getElementById(targetTabContentId);

    if (targetTabContent) {
        targetTabContent.classList.remove('hidden');
        const textareaId = `datos-importar-${officePrefix.toLowerCase()}-${currentImportTab}`;
        const textarea = document.getElementById(textareaId);
        if (textarea) textarea.value = '';
    }
    document.getElementById('resultado-importacion')?.classList.add('hidden');
    document.getElementById('estado-importacion').innerHTML = '';
    document.getElementById('detalle-importacion').innerHTML = '';
}

//===================================================================//
    // ** MANEJO DE CLICK DENTRO DE LISTAS DE CONFIGURACION ** //
//===================================================================//
async function handleConfigListClick(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const id = button.getAttribute('data-id');
    const nombre = button.getAttribute('data-nombre');
    const tipo = button.getAttribute('data-tipo');
    const listItem = button.closest('.config-list-item');
    const inputNombreRuta = listItem?.querySelector('.ruta-nombre-editable');

    if (button.classList.contains('btn-eliminar-config')) {
        const tipoItem = button.getAttribute('data-tipo');
        const nombreItem = button.getAttribute('data-nombre');
        handleEliminarConfig(tipoItem, id, nombreItem);
    }
    else if (button.classList.contains('btn-editar-ruta')) {
         if (!inputNombreRuta) return;
         inputNombreRuta.readOnly = false;
         inputNombreRuta.style.border = '1px solid #ccc';
         inputNombreRuta.style.background = '#fff';
         inputNombreRuta.focus();
         button.classList.add('hidden');
         listItem.querySelector('.btn-guardar-ruta')?.classList.remove('hidden');
         listItem.querySelector('.btn-cancelar-ruta')?.classList.remove('hidden');
    }
    else if (button.classList.contains('btn-cancelar-ruta')) {
        if (!inputNombreRuta) return;
        inputNombreRuta.value = button.getAttribute('data-original-nombre');
        inputNombreRuta.readOnly = true;
        inputNombreRuta.style.border = 'none';
        inputNombreRuta.style.background = 'transparent';
        button.classList.add('hidden');
        listItem.querySelector('.btn-guardar-ruta')?.classList.add('hidden');
        listItem.querySelector('.btn-editar-ruta')?.classList.remove('hidden');
    }
    else if (button.classList.contains('btn-guardar-ruta')) {
        if (!inputNombreRuta) return;
        const nuevoNombre = inputNombreRuta.value.trim();
        const originalNombre = listItem.querySelector('.btn-cancelar-ruta')?.getAttribute('data-original-nombre');

        if (!nuevoNombre) {
            showStatus('status_configuracion', 'El nombre de la ruta no puede estar vacío.', 'warning');
            return;
        }
        if (nuevoNombre.toUpperCase() === originalNombre.toUpperCase()) {
             listItem.querySelector('.btn-cancelar-ruta')?.click();
             return;
        }

        showProcessingOverlay(true, 'Actualizando nombre de ruta...');
        const resultado = await database.actualizarNombreRuta(id, nuevoNombre);
        showProcessingOverlay(false);

        if (resultado.success) {
             showStatus('status_configuracion', resultado.message, 'success');
             inputNombreRuta.readOnly = true;
             inputNombreRuta.style.border = 'none';
             inputNombreRuta.style.background = 'transparent';
             listItem.querySelector('.btn-cancelar-ruta')?.setAttribute('data-original-nombre', nuevoNombre.toUpperCase()); // Actualizar original
             button.classList.add('hidden');
             listItem.querySelector('.btn-cancelar-ruta')?.classList.add('hidden');
             listItem.querySelector('.btn-editar-ruta')?.classList.remove('hidden');
             await inicializarDropdowns();
        } else {
             showStatus('status_configuracion', `Error: ${resultado.message}`, 'error');
        }
    }
    else if (button.classList.contains('btn-editar-poblacion')) {
        const poblacionId = id;
        const poblacionNombre = button.getAttribute('data-nombre');
        const poblacionOffice = button.getAttribute('data-office');
        const rutaActual = button.getAttribute('data-ruta') || '';
        const rutasDisponibles = await database.obtenerRutas(poblacionOffice);
        const opcionesRutas = rutasDisponibles.map(r => r.nombre).sort();

        let selectHTML = `<label for="ruta-poblacion-select">Selecciona la nueva ruta para <strong>${poblacionNombre}</strong> (${poblacionOffice}):</label><br>`;
        selectHTML += `<select id="ruta-poblacion-select" style="width: 100%; margin-top: 10px;">`;
        selectHTML += `<option value="">-- Sin asignar --</option>`;
        opcionesRutas.forEach(rutaNombre => {
            selectHTML += `<option value="${rutaNombre}" ${rutaNombre === rutaActual ? 'selected' : ''}>${rutaNombre}</option>`;
        });
        selectHTML += `</select>`;
        selectHTML += `<br><br><button id="btn-confirmar-ruta-poblacion" class="btn btn-success">Guardar Cambio</button>`;

        document.getElementById('modal-title').textContent = 'Asignar Ruta a Población';
        document.getElementById('modal-body').innerHTML = selectHTML;
        document.getElementById('generic-modal').classList.remove('hidden');

         const btnConfirmar = document.getElementById('btn-confirmar-ruta-poblacion');
         if (btnConfirmar) {
             btnConfirmar.replaceWith(btnConfirmar.cloneNode(true));
             document.getElementById('btn-confirmar-ruta-poblacion').addEventListener('click', async () => {
                 const nuevaRuta = document.getElementById('ruta-poblacion-select').value || null;

                 showProcessingOverlay(true, 'Asignando ruta...');
                 const resultado = await database.asignarRutaAPoblacion(poblacionId, nuevaRuta);
                 showProcessingOverlay(false);
                 document.getElementById('generic-modal').classList.add('hidden');

                 if (resultado.success) {
                     showStatus('status_configuracion', resultado.message, 'success');
                     await loadConfiguracion();
                 } else {
                     showStatus('status_configuracion', `Error: ${resultado.message}`, 'error');
                 }
             });
         }
    }
}

//=================================================================//
    // ** CARGA DE POBLACIONES EN DROPDOWNS Y SE MUESTRAN ** //
//=================================================================//
async function handleCargarPoblaciones() {
    const statusEl = 'status_configuracion';
    
    showButtonLoading('#btn-cargar-poblaciones', true, 'Cargando...');
    
    try {
        const userOffice = currentUserData?.office;
        const esAdminTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');
        
        let oficinaFiltro = '';
        if (esAdminTotal && (!userOffice || userOffice === 'AMBAS')) {
            oficinaFiltro = '';
        } else if (userOffice && userOffice !== 'AMBAS') {
            oficinaFiltro = userOffice;
        } else {
            showStatus(statusEl, 'No tienes permisos para cargar poblaciones.', 'error');
            return;
        }
        
        const poblaciones = await database.obtenerPoblaciones(oficinaFiltro);
        const nombresPoblaciones = [...new Set(poblaciones.map(p => p.nombre))].sort();
        
        if (document.getElementById('poblacion_grupo_cliente')) {
            popularDropdown('poblacion_grupo_cliente', nombresPoblaciones, 'Selecciona población/grupo');
        }
        
        if (document.getElementById('grupo_filtro')) {
            popularDropdown('grupo_filtro', nombresPoblaciones, 'Todos');
        }
        
        if (document.getElementById('grupo_filtro_reporte')) {
            popularDropdown('grupo_filtro_reporte', nombresPoblaciones, 'Todos');
        }
        
        if (document.getElementById('grafico_grupo')) {
            popularDropdown('grafico_grupo', nombresPoblaciones, 'Todos');
        }
        
        showStatus(statusEl, `Se cargaron ${nombresPoblaciones.length} poblaciones en todos los dropdowns.`, 'success');
        console.log('Poblaciones cargadas en dropdowns:', nombresPoblaciones);
        
    } catch (error) {
        console.error("Error cargando poblaciones:", error);
        showStatus(statusEl, `Error al cargar poblaciones: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#btn-cargar-poblaciones', false);
    }
}

//============================================================//
    // ** CARGA DE RUTAS EN DROPDOWNS Y SE MUESTRAN ** //
//============================================================//
async function handleCargarRutas() {
    const statusEl = 'status_configuracion';
    
    showButtonLoading('#btn-cargar-rutas', true, 'Cargando...');
    
    try {
        const userOffice = currentUserData?.office;
        const esAdminTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');
        
        let oficinaFiltro = '';
        if (esAdminTotal && (!userOffice || userOffice === 'AMBAS')) {
            oficinaFiltro = '';
        } else if (userOffice && userOffice !== 'AMBAS') {
            oficinaFiltro = userOffice;
        } else {
            showStatus(statusEl, 'No tienes permisos para cargar rutas.', 'error');
            return;
        }
        
        const rutas = await database.obtenerRutas(oficinaFiltro);
        const nombresRutas = [...new Set(rutas.map(r => r.nombre))].sort();
        
        if (document.getElementById('ruta_cliente')) {
            popularDropdown('ruta_cliente', nombresRutas, 'Selecciona una ruta');
        }
        
        if (document.getElementById('ruta_filtro_reporte')) {
            popularDropdown('ruta_filtro_reporte', nombresRutas, 'Todas');
        }
        
        if (document.getElementById('nuevo-ruta')) {
            popularDropdown('nuevo-ruta', nombresRutas, '-- Sin asignar --');
        }
        
        showStatus(statusEl, `Se cargaron ${nombresRutas.length} rutas en todos los dropdowns.`, 'success');
        console.log('Rutas cargadas en dropdowns:', nombresRutas);
        
    } catch (error) {
        console.error("Error cargando rutas:", error);
        showStatus(statusEl, `Error al cargar rutas: ${error.message}`, 'error');
    } finally {
        showButtonLoading('#btn-cargar-rutas', false);
    }
}

/// ====================================================== ///
    //  NUEVAS FUNCIONES: EFECTIVO Y COMISIONES  ///
/// ====================================================== ///

//===============================================================//
    // ** CARGA DE AREA COMERCIAL EN GESTON DE EFECTIVO ** //
//===============================================================//
async function loadGestionEfectivo() {
    console.log("--- Ejecutando loadGestionEfectivo (Corregido) ---");
    const selectAgenteEntrega = document.getElementById('entrega-agente');
    const selectAgenteFiltro = document.getElementById('filtro-agente');
    const statusEntrega = document.getElementById('status_registrar_entrega');

    if (!selectAgenteEntrega || !selectAgenteFiltro) {
        console.error("loadGestionEfectivo: No se encontraron los dropdowns 'entrega-agente' o 'filtro-agente'.");
        return;
    }

    selectAgenteEntrega.innerHTML = '<option value="">Cargando...</option>';
    selectAgenteFiltro.innerHTML = '<option value="">Cargando...</option>';
    document.getElementById('resultados-gestion-efectivo').classList.add('hidden');
    document.getElementById('tabla-movimientos-efectivo').innerHTML = '<tr><td colspan="5">Selecciona un agente y rango de fechas.</td></tr>';
    document.getElementById('form-registrar-entrega').reset();

    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate() + 1);
    document.getElementById('filtro-fecha-inicio-efectivo').value = haceUnMes.toISOString().split('T')[0];
    document.getElementById('filtro-fecha-fin-efectivo').value = hoy.toISOString().split('T')[0];

    try {
        const resultado = await database.obtenerUsuarios();
        
        if (!resultado.success) {
            throw new Error(resultado.message || 'Error desconocido al obtener usuarios.');
        }

        let agentes = resultado.data || [];
        
        const adminOffice = currentUserData?.office;
        const adminRole = currentUserData?.role;
        const esAdminConAccesoTotal = (adminRole === 'Super Admin' || adminRole === 'Gerencia');

        agentes = agentes.filter(u =>
            u.role === 'Área comercial' &&
            (esAdminConAccesoTotal || adminOffice === 'AMBAS' || !adminOffice || u.office === u.office)
        );

        agentes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        if (agentes.length === 0) {
            const msg = (adminOffice && adminOffice !== 'AMBAS' && !esAdminConAccesoTotal) ? `No hay agentes para ${adminOffice}` : 'No hay agentes de Área Comercial';
            popularDropdown('entrega-agente', [], msg, true);
            popularDropdown('filtro-agente', [], msg, true);
        } else {
            const opciones = agentes.map(a => ({ value: a.id, text: `${a.name} (${a.office || 'Sin Oficina'})` }));
            popularDropdown('entrega-agente', opciones, 'Selecciona un agente', true);
            popularDropdown('filtro-agente', opciones, 'Selecciona un agente', true);
        }

        if (statusEntrega) showStatus(statusEntrega.id, 'Listo.', 'info');

    } catch (error) {
        console.error("Error cargando agentes para gestión efectivo:", error);
        if (statusEntrega) showStatus(statusEntrega.id, `Error cargando agentes: ${error.message}`, 'error');
        popularDropdown('entrega-agente', [], 'Error al cargar', true);
        popularDropdown('filtro-agente', [], 'Error al cargar', true);
    }
}

//===============================================================//
    // ** MANEJO DE FORMULARIO DE ENTREGA DE EFECTIVO ** //
//===============================================================//
async function handleRegistrarEntregaInicial(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const statusEl = document.getElementById('status_registrar_entrega');
    
    // Referencias al DOM
    const agenteId = document.getElementById('entrega-agente').value;
    const monto = parseFloat(document.getElementById('entrega-monto').value);
    const descripcion = document.getElementById('entrega-descripcion').value || 'Entrega inicial de efectivo';
    const fechaInput = document.getElementById('entrega-fecha').value; // <--- NUEVO CAMPO
    
    // Obtener oficina del texto del dropdown (GDL/LEON)
    const agenteSelect = document.getElementById('entrega-agente');
    const agenteTexto = agenteSelect.options[agenteSelect.selectedIndex].text;
    const officeAgente = agenteTexto.includes('(GDL)') ? 'GDL' : (agenteTexto.includes('(LEON)') ? 'LEON' : null);

    // Validaciones
    if (!agenteId || isNaN(monto) || monto <= 0 || !officeAgente || !fechaInput) {
        showStatus(statusEl.id, 'Todos los campos son obligatorios.', 'error');
        return;
    }

    // Construir Fecha ISO: Usamos la fecha elegida + la hora actual para mantener orden cronológico
    const ahora = new Date();
    // Formato YYYY-MM-DD + T + HH:MM:SS
    const fechaSeleccionada = new Date(fechaInput + 'T' + ahora.toTimeString().split(' ')[0]);
    const fechaISO = fechaSeleccionada.toISOString();

    showButtonLoading(btn, true, 'Registrando...');
    showStatus(statusEl.id, 'Registrando entrega...', 'info');

    try {
        const movimientoData = {
            userId: agenteId,
            fecha: fechaISO, // Usamos la fecha manual
            tipo: 'ENTREGA_INICIAL',
            monto: monto,
            descripcion: descripcion,
            registradoPor: currentUserData.email,
            office: officeAgente
        };

        const resultado = await database.agregarMovimientoEfectivo(movimientoData);
        if (!resultado.success) throw new Error(resultado.message);

        showStatus(statusEl.id, 'Entrega registrada exitosamente.', 'success');
        e.target.reset();
        
        // Restaurar fecha a hoy por defecto para el siguiente registro
        const offset = new Date().getTimezoneOffset() * 60000;
        const localDate = new Date(Date.now() - offset).toISOString().split('T')[0];
        document.getElementById('entrega-fecha').value = localDate;
        
        // Si estamos viendo la tabla del mismo agente, actualizar
        if (document.getElementById('filtro-agente').value === agenteId) {
            handleBuscarMovimientos();
        }

    } catch (error) {
        console.error("Error registrando entrega:", error);
        showStatus(statusEl.id, `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading(btn, false);
    }
}

//===============================================================//
    // ** REPORTE DE BALANCE POR AGENTE AREA COMERCIAL ** //
//===============================================================//
async function handleBuscarMovimientos() {
    const btn = document.getElementById('btn-buscar-movimientos');
    const statusEl = 'status_registrar_entrega';
    const agenteId = document.getElementById('filtro-agente').value;
    const fechaInicio = document.getElementById('filtro-fecha-inicio-efectivo').value;
    const fechaFin = document.getElementById('filtro-fecha-fin-efectivo').value;
    
    const resultadosDiv = document.getElementById('resultados-gestion-efectivo');
    const tbody = document.getElementById('tabla-movimientos-efectivo');
    const balanceContainer = document.getElementById('balance-container');

    if (!agenteId) {
        showStatus(statusEl, 'Por favor, selecciona un agente para buscar.', 'warning');
        return;
    }
    
    showButtonLoading(btn, true, 'Buscando...');
    showStatus(statusEl, 'Buscando movimientos...', 'info');
    resultadosDiv.classList.add('hidden');
    tbody.innerHTML = '<tr><td colspan="5">Buscando...</td></tr>';
    
    document.getElementById('balance-agente').textContent = '...';
    document.getElementById('balance-entregado').textContent = '...';
    document.getElementById('balance-gastos').textContent = '...';
    document.getElementById('balance-colocado').textContent = '...';
    document.getElementById('balance-final').textContent = '...';

    try {
        const adminOffice = currentUserData?.office;
        const esAdminTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');
        
        const filtros = {
            userId: agenteId,
            fechaInicio: fechaInicio ? (fechaInicio + 'T00:00:00Z') : null,
            fechaFin: fechaFin ? (fechaFin + 'T23:59:59Z') : null,
            office: (esAdminTotal || !adminOffice || adminOffice === 'AMBAS') ? null : adminOffice
        };

        const movimientos = await database.getMovimientosEfectivo(filtros);

        if (movimientos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No se encontraron movimientos para este agente en este rango de fechas.</td></tr>';
            showStatus(statusEl, 'No se encontraron movimientos.', 'info');
        } else {
            tbody.innerHTML = movimientos.map(mov => `
                <tr style="color: ${mov.monto > 0 ? 'var(--success)' : 'var(--danger)'};">
                    <td>${formatDateForDisplay(parsearFecha(mov.fecha))}</td>
                    <td>${mov.tipo || 'N/A'}</td>
                    <td>$${(mov.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${mov.descripcion || 'N/A'}</td>
                    <td>${mov.registradoPor || 'N/A'}</td>
                </tr>
            `).join('');
            showStatus(statusEl, `Se encontraron ${movimientos.length} movimientos.`, 'success');
        }
        
        let totalEntregado = 0;
        let totalGastos = 0;
        let totalColocado = 0;
        
        movimientos.forEach(mov => {
            if (mov.tipo === 'ENTREGA_INICIAL') {
                totalEntregado += (mov.monto || 0);
            } else if (mov.tipo === 'GASTO') {
                totalGastos += (mov.monto || 0);
            } else if (mov.tipo === 'COLOCACION') {
                totalColocado += (mov.monto || 0);
            }
        });
        
        const balanceFinal = totalEntregado + totalGastos + totalColocado;

        const agenteSelect = document.getElementById('filtro-agente');
        document.getElementById('balance-agente').textContent = agenteSelect.options[agenteSelect.selectedIndex].text;
        document.getElementById('balance-entregado').textContent = `$${totalEntregado.toFixed(2)}`;
        document.getElementById('balance-gastos').textContent = `$${totalGastos.toFixed(2)}`;
        document.getElementById('balance-colocado').textContent = `$${totalColocado.toFixed(2)}`;
        document.getElementById('balance-final').textContent = `$${balanceFinal.toFixed(2)}`;
        document.getElementById('balance-final').style.color = balanceFinal >= 0 ? 'var(--success)' : 'var(--danger)';

        resultadosDiv.classList.remove('hidden');

    } catch (error) {
        console.error("Error buscando movimientos:", error);
        showStatus(statusEl, `Error: ${error.message}`, 'error');
        tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
    } finally {
        showButtonLoading(btn, false);
    }
}

//==================================================//
    // ** FORMULARIO DE REGISTRO DE GASTO ** //
//==================================================//
async function handleRegistrarGasto(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const statusEl = document.getElementById('status_registrar_gasto');

    const monto = parseFloat(document.getElementById('gasto-monto').value);
    const descripcion = document.getElementById('gasto-descripcion').value.trim();
    const fechaInput = document.getElementById('gasto-fecha').value;

    if (isNaN(monto) || monto <= 0 || !descripcion || !fechaInput) {
        showStatus(statusEl.id, 'Todos los campos son obligatorios y el monto debe ser positivo.', 'error');
        return;
    }

    const fechaGasto = new Date(fechaInput + 'T12:00:00Z').toISOString();

    showButtonLoading(btn, true, 'Guardando...');
    showStatus(statusEl.id, 'Registrando gasto...', 'info');

    try {
        const movimientoData = {
            userId: currentUserData.id,
            fecha: fechaGasto,
            tipo: 'GASTO',
            monto: -monto,
            descripcion: descripcion,
            registradoPor: currentUserData.email,
            office: currentUserData.office
        };

        const resultado = await database.agregarMovimientoEfectivo(movimientoData);
        if (!resultado.success) throw new Error(resultado.message);

        let successMsg = 'Gasto registrado exitosamente.';
        if (!isOnline) successMsg += ' (Guardado localmente, se sincronizará).';
        showStatus(statusEl.id, successMsg, 'success');
        e.target.reset();

    } catch (error) {
        console.error("Error registrando gasto:", error);
        showStatus(statusEl.id, `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading(btn, false);
    }
}

//================================================//
    // ** MANEJO DE IMPORTACION DE DATOS ** //
//================================================//
async function handleImport() {
    const office = document.getElementById('office-select').value;
    const textareaId = `datos-importar-${office.toLowerCase()}-${currentImportTab}`;
    const textarea = document.getElementById(textareaId);
    const resultadoImportacionDiv = document.getElementById('resultado-importacion');
    const estadoImportacionDiv = document.getElementById('estado-importacion');
    const detalleImportacionDiv = document.getElementById('detalle-importacion');

    if (!textarea) {
        showStatus('estado-importacion', 'Error interno: No se encontró el área de texto para importar.', 'error');
        resultadoImportacionDiv?.classList.remove('hidden');
        return;
    }
    const csvData = textarea.value;
    if (!csvData.trim()) {
        showStatus('estado-importacion', 'No hay datos en el área de texto para importar.', 'warning');
        resultadoImportacionDiv?.classList.remove('hidden');
        detalleImportacionDiv.innerHTML = '';
        return;
    }

    showProcessingOverlay(true, `Importando ${currentImportTab} para ${office}...`);
    showButtonLoading('#btn-procesar-importacion', true, 'Importando...');
    showFixedProgress(0, `Iniciando importación de ${currentImportTab}...`);
    estadoImportacionDiv.innerHTML = 'Procesando archivo CSV...';
    estadoImportacionDiv.className = 'status-message status-info';
    detalleImportacionDiv.innerHTML = '';
    resultadoImportacionDiv?.classList.remove('hidden');

    try {
        const resultado = await database.importarDatosDesdeCSV(csvData, currentImportTab, office);
        showFixedProgress(100, 'Importación completada');
        let mensaje = `<b>Importación (${office} - ${currentImportTab}) finalizada:</b> ${resultado.importados} registros importados de ${resultado.total} líneas procesadas.`;

        if (resultado.errores && resultado.errores.length > 0) {
            mensaje += `<br><b>Se encontraron ${resultado.errores.length} errores u omisiones.</b>`;
            if (detalleImportacionDiv) {
                const erroresMostrados = resultado.errores.slice(0, 50);
                detalleImportacionDiv.innerHTML = `<strong>Detalle de errores/omisiones (primeros ${erroresMostrados.length}):</strong><ul>${erroresMostrados.map(e => `<li>${e}</li>`).join('')}</ul>`;
                if (resultado.errores.length > 50) {
                    detalleImportacionDiv.innerHTML += `<p><i>(${resultado.errores.length - 50} errores más omitidos)</i></p>`;
                }
            }
            showStatus('estado-importacion', mensaje, resultado.importados > 0 ? 'warning' : 'error');
        } else {
            if (detalleImportacionDiv) detalleImportacionDiv.innerHTML = 'No se encontraron errores.';
            showStatus('estado-importacion', mensaje, 'success');
        }
        textarea.value = '';
    } catch (error) {
        console.error('Error crítico en handleImport:', error);
        showFixedProgress(100, 'Error en importación');
        showStatus('estado-importacion', `Error crítico durante la importación: ${error.message}`, 'error');
        if (detalleImportacionDiv) detalleImportacionDiv.innerHTML = `Detalles técnicos: ${error.stack || error}`;
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('#btn-procesar-importacion', false);
        setTimeout(hideFixedProgress, 3000);
    }
}

//=====================================//
    // ** FORMATO DE CLIENTES ** //
//=====================================//
function resetClientForm() {
    editingClientId = null;
    const form = document.getElementById('form-cliente');
    if (form) form.reset();
    const titulo = document.querySelector('#view-cliente h2');
    if (titulo) titulo.textContent = 'Registrar Cliente';
    const submitButton = document.querySelector('#form-cliente button[type="submit"]');
    if (submitButton) submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';
    if (currentUserData) aplicarPermisosUI(currentUserData.role);
    const curpInput = document.getElementById('curp_cliente');
    if (curpInput) {
        curpInput.readOnly = false; 
        validarCURP(curpInput);
    }
  
    const officeInput = document.getElementById('office_cliente');
    if (officeInput && !officeInput.disabled) {
        officeInput.value = 'GDL';
    }

    handleOfficeChangeForClientForm.call(document.getElementById('office_cliente') || { value: officeInput.value });
    
    showStatus('status_cliente', '', 'info');
}

//============================================//
    // ** MANEJAR FORMATO DE CLIENTES ** //
//============================================//
async function handleClientForm(e) {
    e.preventDefault();
    
    // Referencias a inputs
    const curpInput = document.getElementById('curp_cliente');
    const curp = curpInput.value.trim().toUpperCase();
    const telefonoInput = document.getElementById('telefono_cliente');
    const telefono = telefonoInput.value.trim();
    const submitButton = e.target.querySelector('button[type="submit"]');

    // Validaciones
    if (!validarFormatoCURP(curp)) {
        showStatus('status_cliente', 'El formato del CURP es incorrecto (debe tener 18 caracteres).', 'error');
        curpInput.classList.add('input-error');
        return;
    } else {
        curpInput.classList.remove('input-error');
    }

    if (!telefono || telefono.length < 10) {
        showStatus('status_cliente', 'El teléfono es obligatorio y debe tener al menos 10 dígitos.', 'error');
        telefonoInput.classList.add('input-error');
        telefonoInput.focus();
        return;
    } else {
        telefonoInput.classList.remove('input-error');
    }

    const clienteData = {
        office: document.getElementById('office_cliente').value,
        curp,
        nombre: document.getElementById('nombre_cliente').value.trim(),
        domicilio: document.getElementById('domicilio_cliente').value.trim(),
        cp: document.getElementById('cp_cliente').value.trim(),
        telefono: telefono,
        poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value,
        ruta: document.getElementById('ruta_cliente').value,
        isComisionista: document.getElementById('comisionista_cliente').checked
    };

    if (!clienteData.nombre || !clienteData.domicilio || !clienteData.poblacion_grupo || !clienteData.ruta) {
        showStatus('status_cliente', 'Los campos con * son obligatorios.', 'error');
        return;
    }

    // Guardamos si era edición antes de guardar, para decidir a dónde ir después
    const eraEdicion = (editingClientId !== null);

    showButtonLoading(submitButton, true, eraEdicion ? 'Actualizando...' : 'Guardando...');
    showStatus('status_cliente', eraEdicion ? 'Actualizando datos...' : 'Registrando nuevo cliente...', 'info');

    try {
        let resultado;
        
        if (eraEdicion) {
            // Lógica de Edición (Validar cambio de CURP)
            if (!curpInput.readOnly) {
                const clienteOriginal = await database.obtenerClientePorId(editingClientId);
                if (clienteOriginal && clienteOriginal.curp !== curp) {
                    const existeNuevoCURP = await database.buscarClientePorCURP(curp);
                    if (existeNuevoCURP) {
                        throw new Error(`La nueva CURP (${curp}) ya pertenece a otro cliente.`);
                    }
                }
            }
            resultado = await database.actualizarCliente(editingClientId, clienteData, currentUser.email);
        } else {
            // Lógica de Creación
            resultado = await database.agregarCliente(clienteData, currentUser.email);
        }

        if (resultado.success) {
            let successMessage = eraEdicion ? 'Cliente actualizado exitosamente.' : 'Cliente registrado exitosamente.';
            if (!isOnline) {
                successMessage += ' (Datos guardados localmente).';
            }
            
            // --- AQUÍ ESTÁ EL CAMBIO CLAVE ---
            if (eraEdicion) {
                // CASO 1: Si editamos, volvemos a la lista (Comportamiento anterior)
                resetClientForm();
                showView('view-gestion-clientes');
                showStatus('status_gestion_clientes', successMessage, 'success');
                await loadClientesTable(); 
            } else {
                // CASO 2: Si es NUEVO, nos quedamos aquí para seguir capturando
                resetClientForm(); // Limpia los inputs
                // Mostramos el mensaje en el mismo formulario
                showStatus('status_cliente', successMessage + ' Puedes registrar otro.', 'success');
                
                // Opcional: Hacer scroll arriba o foco en el primer campo
                document.getElementById('curp_cliente').focus();
            }
            
        } else {
            throw new Error(resultado.message || 'Ocurrió un error desconocido.');
        }

    } catch (error) {
        console.error("Error en handleClientForm:", error);
        showStatus('status_cliente', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading(submitButton, false);
    }
}

//=====================================//
    // ** GESTION DE USUARIOS ** //
//=====================================//
async function mostrarFormularioUsuario(usuario = null) {
    const formContainer = document.getElementById('form-usuario-container');
    const formTitulo = document.getElementById('form-usuario-titulo');
    const form = document.getElementById('form-usuario');
    const passwordInput = document.getElementById('nuevo-password');
    const emailInput = document.getElementById('nuevo-email');
    const officeSelect = document.getElementById('nuevo-sucursal'); 
    const rutaSelect = document.getElementById('nuevo-ruta');

    if (!formContainer || !formTitulo || !form || !officeSelect) return;

    form.reset();
    let userOffice = '';

    if (usuario) {
        editingUserId = usuario.id;
        formTitulo.textContent = 'Editar Usuario';
        document.getElementById('nuevo-nombre').value = usuario.name || '';
        emailInput.value = usuario.email || '';
        emailInput.readOnly = true; 
        document.getElementById('nuevo-rol').value = usuario.role || '';
        userOffice = usuario.office || '';
        officeSelect.value = userOffice;
        passwordInput.required = false;
        passwordInput.placeholder = "Dejar en blanco para no cambiar";
    } else {
        editingUserId = null;
        formTitulo.textContent = 'Nuevo Usuario';
        emailInput.readOnly = false;
        passwordInput.required = true;
        passwordInput.placeholder = "Mínimo 6 caracteres";
        userOffice = '';
        officeSelect.value = '';
    }

    await _cargarRutasParaUsuario(userOffice);

    if (usuario && usuario.ruta && rutaSelect) {
         setTimeout(() => {
            rutaSelect.value = usuario.ruta;
         }, 100);
    }

    formContainer.classList.remove('hidden');
}

//=============================================//
    // ** OCULTAR FORMULATIO DE USUARIO ** //
//=============================================//
function ocultarFormularioUsuario() {
    editingUserId = null;
    const formContainer = document.getElementById('form-usuario-container');
    if (formContainer) {
        formContainer.classList.add('hidden');
        document.getElementById('form-usuario').reset();
        showStatus('status_usuarios', '', 'info');
    }
}

//=====================================//
    // ** DESHABILITAR USUARIO ** //
//=====================================//
async function disableUsuario(userId, userName) {
    if (!confirm(`¿Estás seguro de que deseas deshabilitar al usuario "${userName}"?`)) {
        return;
    }

    showProcessingOverlay(true, 'Deshabilitando usuario...');
    try {
        const resultado = await database.disableUsuario(userId);
        if (resultado.success) {
            showStatus('status_usuarios', `Usuario "${userName}" deshabilitado correctamente.`, 'success');
            await loadUsersTable();
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error deshabilitando usuario:", error);
        showStatus('status_usuarios', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}

//============================================//
    // ** MANEJAR FORMATO DE USUARIOS ** //
//============================================//
async function handleUserForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    
    // DEBUG: Confirmar que tenemos el ID
    console.log("💾 Intentando guardar usuario. ID en edición:", editingUserId); 

    showButtonLoading(submitButton, true, editingUserId ? 'Actualizando...' : 'Creando...');

    try {
        const nombre = document.getElementById('nuevo-nombre').value.trim();
        const rol = document.getElementById('nuevo-rol').value;
        const office = document.getElementById('nuevo-sucursal').value;
        const ruta = document.getElementById('nuevo-ruta').value || null;
        const password = document.getElementById('nuevo-password').value;

        if (!nombre || !rol || !office) throw new Error('Nombre, Rol y Oficina son obligatorios.');

        if (editingUserId) {
            // --- ACTUALIZACIÓN ---
            const userData = { name: nombre, role: rol, office: office, ruta: ruta };
            // Solo mandamos contraseña si se escribió algo
            // (Nota: actualizar contraseña requiere Cloud Functions o re-autenticación, aquí solo actualizamos datos)
            
            const res = await database.actualizarUsuario(editingUserId, userData);
            if (!res.success) throw new Error(res.message);
            
            showStatus('status_usuarios', 'Usuario actualizado correctamente.', 'success');

        } else {
            // --- CREACIÓN ---
            const email = document.getElementById('nuevo-email').value.trim();
            if (!email || !password) throw new Error('Email y contraseña requeridos para crear nuevo.');
            
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            await db.collection('users').doc(cred.user.uid).set({
                id: cred.user.uid, email, name: nombre, role: rol, office: office, ruta: ruta,
                createdAt: new Date().toISOString(), status: 'active'
            });
            showStatus('status_usuarios', 'Usuario creado exitosamente.', 'success');
        }

        ocultarFormularioUsuario();
        await loadUsersTable();

    } catch (error) {
        console.error("Error formulario usuario:", error);
        let msg = error.message;
        if (error.code === 'auth/email-already-in-use') {
            msg = 'Error: El sistema intentó crear (no editar) y el correo ya existe. Recarga la página.';
        }
        showStatus('status_usuarios', msg, 'error');
    } finally {
        showButtonLoading(submitButton, false);
    }
}

// ========================================= //
// ** CARGAR TABLA DE USUARIOS (CORREGIDA) ** //
// ========================================= //
async function loadUsersTable() {
    if (cargaEnProgreso) return;
    cargaEnProgreso = true;
    
    const tbody = document.getElementById('tabla-usuarios');
    const btnBuscar = document.querySelector('#btn-aplicar-filtros-usuarios');
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Cargando usuarios...</td></tr>';
    showButtonLoading(btnBuscar, true, 'Buscando...');
    showStatus('status_usuarios', '', 'info');

    try {
        const resultado = await database.obtenerUsuarios();
        
        if (!resultado.success) throw new Error(resultado.message);
        
        let usuarios = resultado.data || [];

        // --- GUARDAMOS EN CACHÉ GLOBAL (ESTO ES LA CLAVE) ---
        window.usuariosCache = usuarios; 

        // Filtros
        const filtroEmail = (document.getElementById('filtro-email-usuario')?.value || '').trim().toLowerCase();
        const filtroNombre = (document.getElementById('filtro-nombre-usuario')?.value || '').trim().toLowerCase();
        const filtroRol = document.getElementById('filtro-rol-usuario')?.value || '';
        const filtroOfficeUsuario = document.getElementById('filtro-sucursal-usuario')?.value || '';
        const adminOffice = currentUserData?.office;
        
        const usuariosFiltrados = usuarios.filter(usuario => {
            const emailMatch = !filtroEmail || (usuario.email && usuario.email.toLowerCase().includes(filtroEmail));
            const nombreMatch = !filtroNombre || (usuario.name && usuario.name.toLowerCase().includes(filtroNombre));
            const rolMatch = !filtroRol || usuario.role === filtroRol;
            const officeUiMatch = !filtroOfficeUsuario || usuario.office === filtroOfficeUsuario || (filtroOfficeUsuario === 'AMBAS' && usuario.office === 'AMBAS');
            const adminOfficeMatch = !adminOffice || adminOffice === 'AMBAS' || usuario.office === adminOffice || !usuario.office;
            return emailMatch && nombreMatch && rolMatch && officeUiMatch && adminOfficeMatch;
        });

        tbody.innerHTML = '';

        if (usuariosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No se encontraron usuarios.</td></tr>';
            showStatus('status_usuarios', 'No se encontraron usuarios.', 'info');
        } else {
            usuariosFiltrados.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            usuariosFiltrados.forEach(usuario => {
                const tr = document.createElement('tr');
                if (usuario.status === 'disabled') {
                    tr.style.opacity = '0.5';
                    tr.style.backgroundColor = '#f8f9fa';
                }

                const normalizedRole = (usuario.role || 'default').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const roleBadgeClass = `role-${normalizedRole.toLowerCase().replace(/\s/g, '-')}`;
                
                // --- CAMBIO CLAVE: PASAMOS SOLO EL ID ---
                tr.innerHTML = `
                    <td>${usuario.email || 'N/A'}</td>
                    <td>${usuario.name || 'N/A'}</td>
                    <td><span class="role-badge ${roleBadgeClass}">${usuario.role || 'Sin Rol'}</span></td>
                    <td>${usuario.office || 'N/A'}</td>
                    <td>${usuario.ruta || '--'}</td>
                    <td>${usuario.status === 'disabled' ? '<span class="badge badge-danger">Inactivo</span>' : '<span class="badge badge-success">Activo</span>'}</td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-info" onclick="prepararEdicionUsuario('${usuario.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${usuario.status !== 'disabled' ? 
                            `<button class="btn btn-sm btn-warning" onclick="disableUsuario('${usuario.id}', '${usuario.name || usuario.email}')" title="Deshabilitar">
                                <i class="fas fa-user-slash"></i>
                             </button>` : ''
                        }                        
                    </td>
                `;
                tbody.appendChild(tr);
            });
            showStatus('status_usuarios', `${usuariosFiltrados.length} usuarios encontrados.`, 'success');
        }

    } catch (error) {
        console.error("Error cargando usuarios:", error);
        tbody.innerHTML = `<tr><td colspan="7" style="color:red;">Error: ${error.message}</td></tr>`;
        showStatus('status_usuarios', `Error: ${error.message}`, 'error');
    } finally {
        cargaEnProgreso = false;
        showButtonLoading(btnBuscar, false);
    }
}

// ====================================== //
// ** PREPARAR EDICIÓN POR ID ** //
// ====================================== //
window.prepararEdicionUsuario = function(idUsuario) {
    console.log("🔍 Buscando usuario para editar, ID:", idUsuario);
    
    // Buscamos en la caché global que llenaremos en loadUsersTable
    const usuarioEncontrado = window.usuariosCache.find(u => u.id === idUsuario);
    
    if (usuarioEncontrado) {
        console.log("✅ Usuario encontrado:", usuarioEncontrado.email);
        mostrarFormularioUsuario(usuarioEncontrado);
    } else {
        console.error("❌ Error: No se encontró el usuario en memoria con ID:", idUsuario);
        alert("Error al cargar los datos del usuario. Por favor recarga la tabla.");
    }
};

/**
 * Limpia los filtros de la vista de Gestión de Usuarios.
 */
function limpiarFiltrosUsuarios() {
    // Si hay una carga en progreso, la cancelamos primero
    if (cargaEnProgreso) {
        console.warn("Limpiando filtros mientras cargaba...");
        cancelarCarga();
    }

    // Limpiar inputs de texto
    const emailInput = document.getElementById('filtro-email-usuario');
    const nombreInput = document.getElementById('filtro-nombre-usuario');
    const rolInput = document.getElementById('filtro-rol-usuario');
    const sucursalInput = document.getElementById('filtro-sucursal-usuario');

    if (emailInput) emailInput.value = '';
    if (nombreInput) nombreInput.value = '';
    if (rolInput) rolInput.value = '';

    // Limpiar sucursal solo si no está bloqueada por permisos
    if (sucursalInput && !sucursalInput.disabled) {
        sucursalInput.value = '';
    }

    // Recargar la vista inicial
    inicializarVistaUsuarios();
    showStatus('status_usuarios', 'Filtros limpiados. Ingresa nuevos criterios.', 'info');
}

/**
 * Resetea la tabla de usuarios a su estado inicial
 */
function inicializarVistaUsuarios() {
    const tbody = document.getElementById('tabla-usuarios');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Usa los filtros para buscar usuarios.</td></tr>';
    }
    
    // Ocultar formulario si está visible
    ocultarFormularioUsuario();
    
    // Limpiar filtros de texto
    if(document.getElementById('filtro-email-usuario')) document.getElementById('filtro-email-usuario').value = '';
    if(document.getElementById('filtro-nombre-usuario')) document.getElementById('filtro-nombre-usuario').value = '';
    if(document.getElementById('filtro-rol-usuario')) document.getElementById('filtro-rol-usuario').value = '';
    
    // Filtro sucursal (respetar si está deshabilitado por rol)
    const filtroSucursal = document.getElementById('filtro-sucursal-usuario');
    if (filtroSucursal && !filtroSucursal.disabled) {
        filtroSucursal.value = '';
    }

    // ============================================================
    // 🚀 LÓGICA DEL CONTROL GLOBAL (13 SEMANAS)
    // ============================================================
    const containerGlobal = document.getElementById('global-config-container');
    const checkboxGlobal = document.getElementById('toggle-13-global');
    const btnGuardar = document.getElementById('btn-guardar-config-global');

    // 1. Verificar Permisos (Solo Admins ven esto)
    const rolesAdmin = ['Super Admin', 'Gerencia', 'Administrador'];
    const esAdmin = currentUserData && rolesAdmin.includes(currentUserData.role);

    if (containerGlobal) {
        if (esAdmin) {
            containerGlobal.classList.remove('hidden'); // Mostrar caja azul
            containerGlobal.style.display = 'flex'; // Asegurar flex
            
            // 2. Poner el estado actual del sistema
            if (checkboxGlobal) {
                checkboxGlobal.checked = (configSistema.oferta13Semanas === true);
            }

            // 3. Reactivar Listener del Botón (Por si acaso se perdió)
            if (btnGuardar) {
                // Clonar para limpiar listeners viejos
                const newBtn = btnGuardar.cloneNode(true);
                btnGuardar.parentNode.replaceChild(newBtn, btnGuardar);
                newBtn.addEventListener('click', guardarConfiguracionGlobal);
            }

        } else {
            containerGlobal.classList.add('hidden'); // Ocultar a mortales
            containerGlobal.style.display = 'none';
        }
    }
}

/**
 * Guarda la configuración global desde la vista de Usuarios.
 */
async function guardarConfiguracionGlobal() {
    // OJO: Nuevo ID del checkbox
    const checkbox = document.getElementById('toggle-13-global');
    const btn = document.getElementById('btn-guardar-config-global');
    
    if (!checkbox) return;
    
    const nuevoEstado = checkbox.checked;
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        console.log(`🌎 Guardando configuración global: ${nuevoEstado}`);
        
        // 1. Guardar en Firebase
        await db.collection('configuracion').doc('parametros_generales').set({
            oferta13Semanas: nuevoEstado
        }, { merge: true });

        // 2. Actualizar memoria local
        configSistema.oferta13Semanas = nuevoEstado;

        // Feedback visual rápido
        // No usamos alert() para no ser intrusivos, cambiamos el texto del botón temporalmente
        btn.innerHTML = '<i class="fas fa-check"></i> ¡Guardado!';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('btn-success');
            btn.classList.add('btn-primary');
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error("Error guardando config:", error);
        alert("Error al guardar: " + error.message);
        checkbox.checked = !nuevoEstado; // Revertir
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/**
 * Carga los datos de un cliente en el formulario de edición.
 * @param {object} cliente El objeto cliente completo (incluyendo id).
 */
async function editCliente(cliente) {
    if (!cliente || !cliente.id) {
        console.error("editCliente: Datos de cliente inválidos o falta ID.", cliente);
        alert("Error al cargar datos del cliente para editar.");
        return;
    }
    console.log("Editando cliente:", cliente);
    editingClientId = cliente.id;

    document.getElementById('office_cliente').value = cliente.office || 'GDL';
    document.getElementById('curp_cliente').value = cliente.curp || '';
    document.getElementById('nombre_cliente').value = cliente.nombre || '';
    document.getElementById('domicilio_cliente').value = cliente.domicilio || '';
    document.getElementById('cp_cliente').value = cliente.cp || '';
    document.getElementById('telefono_cliente').value = cliente.telefono || '';
    document.getElementById('comisionista_cliente').checked = cliente.isComisionista || false;

    handleOfficeChangeForClientForm.call(document.getElementById('office_cliente'));
    setTimeout(async () => {
        const [poblacionesGdl, poblacionesLeon, rutasGdl, rutasLeon] = await Promise.all([
            database.obtenerPoblaciones('GDL'),
            database.obtenerPoblaciones('LEON'),
            database.obtenerRutas('GDL'),
            database.obtenerRutas('LEON')
        ]);

        const todasPoblaciones = [...new Set([...poblacionesGdl.map(p => p.nombre), ...poblacionesLeon.map(p => p.nombre)])].sort();
        const todasRutas = [...new Set([...rutasGdl.map(r => r.nombre), ...rutasLeon.map(r => r.nombre)])].sort();

        popularDropdown('poblacion_grupo_cliente', todasPoblaciones, 'Selecciona población/grupo');
        popularDropdown('ruta_cliente', todasRutas, 'Selecciona una ruta');

        document.getElementById('poblacion_grupo_cliente').value = cliente.poblacion_grupo || '';
        document.getElementById('ruta_cliente').value = cliente.ruta || '';
    }, 100);

    const curpInput = document.getElementById('curp_cliente');
    if (curpInput) {
        aplicarPermisosUI(currentUserData.role);
        validarCURP(curpInput);
    }

    const titulo = document.querySelector('#view-cliente h2');
    if (titulo) titulo.textContent = 'Editar Cliente';
    const submitButton = document.querySelector('#form-cliente button[type="submit"]');
    if (submitButton) submitButton.innerHTML = '<i class="fas fa-save"></i> Actualizar Cliente';

    showStatus('status_cliente', 'Editando datos del cliente.', 'info');
    showView('view-cliente');
}

/**
 * Elimina un cliente después de confirmación.
 * @param {string} id ID del cliente a eliminar.
 * @param {string} nombre Nombre del cliente para confirmación.
 */
async function deleteCliente(id, nombre) {
    if (!id) return;
    if (confirm(`¿Estás seguro de que deseas eliminar al cliente "${nombre}"?\nEsta acción no se puede deshacer y podría afectar créditos/pagos asociados.`)) {
        showProcessingOverlay(true, 'Eliminando cliente...');
        try {
            const resultado = await database.eliminarCliente(id);
            if (resultado.success) {
                showStatus('status_gestion_clientes', `Cliente "${nombre}" eliminado exitosamente.`, 'success');
                inicializarVistaGestionClientes();
                showStatus('status_gestion_clientes', `Cliente "${nombre}" eliminado. Filtra de nuevo para actualizar la vista.`, 'success');
            } else {
                throw new Error(resultado.message);
            }
        } catch (error) {
            console.error("Error eliminando cliente:", error);
            alert(`Error al eliminar cliente: ${error.message}`);
            showStatus('status_gestion_clientes', `Error al eliminar: ${error.message}`, 'error');
        } finally {
            showProcessingOverlay(false);
        }
    }
}

/**
 * Carga las rutas en el dropdown del formulario de usuario, filtradas por oficina.
 * @param {string} office La oficina seleccionada ('GDL', 'LEON', 'AMBAS', o '').
 */
async function _cargarRutasParaUsuario(office) { // <-- CAMBIO DE sucursal A office
    const rutaSelect = document.getElementById('nuevo-ruta');
    if (!rutaSelect) return;
    console.log(`--- _cargarRutasParaUsuario llamada con office: '${office}'`);

    rutaSelect.innerHTML = '<option value="">Cargando rutas...</option>';
    rutaSelect.disabled = true;

    try {
        if (office === 'AMBAS' || !office) { // <-- CAMBIO DE sucursal A office
             console.log("   Oficina AMBAS o vacía, deshabilitando rutas.");
             popularDropdown('nuevo-ruta', [], '-- Sin asignar --');
             rutaSelect.disabled = true;
             return;
        }

        const rutas = await database.obtenerRutas(office); // <-- CAMBIO DE sucursal A office
        console.log(`   Rutas obtenidas de DB:`, rutas);
        const rutasNombres = rutas.map(r => r.nombre).sort();
        console.log(`   Nombres de rutas a popular:`, rutasNombres);
        popularDropdown('nuevo-ruta', rutasNombres, '-- Sin asignar --');
        rutaSelect.disabled = false;
        console.log(`   Dropdown #nuevo-ruta actualizado.`);
    } catch (error) {
        console.error("Error cargando rutas para usuario:", error);
        popularDropdown('nuevo-ruta', [], 'Error al cargar');
    }
}

/**
 * Actualiza un dropdown de Grupo/Población filtrando por oficina
 */
async function _actualizarDropdownGrupo(selectId, office, placeholder) {
    // Prevenir actualizaciones duplicadas
    if (dropdownUpdateInProgress) {
        console.log(`--- Dropdown ${selectId} update skipped (already in progress)`);
        return;
    }
    
    dropdownUpdateInProgress = true;
    
    const selectElement = document.getElementById(selectId);
    if (!selectElement) {
        console.error(`!!! Dropdown con ID "${selectId}" NO ENCONTRADO.`);
        dropdownUpdateInProgress = false;
        return;
    }
    
    console.log(`--- Actualizando Dropdown "${selectId}" ---`);
    console.log(`   Oficina recibida: '${office}'`);

    const currentValue = selectElement.value;
    selectElement.innerHTML = `<option value="">Cargando...</option>`;
    selectElement.disabled = true;

    try {
        const poblaciones = await database.obtenerPoblaciones(office || null);
        console.log(`   Poblaciones obtenidas para "${selectId}":`, poblaciones.length);
        
        const nombres = [...new Set(poblaciones.map(p => p.nombre))].sort();
        console.log(`   Nombres a popular en "${selectId}":`, nombres.length);

        popularDropdown(selectId, nombres, placeholder);

        if (nombres.includes(currentValue)) {
            selectElement.value = currentValue;
        } else {
            selectElement.value = "";
        }
        console.log(`   Dropdown "${selectId}" actualizado.`);

    } catch (error) {
        console.error(`Error actualizando dropdown ${selectId}:`, error);
        popularDropdown(selectId, [], 'Error al cargar');
    } finally {
        selectElement.disabled = false;
        dropdownUpdateInProgress = false;
    }
}

// =============================================
// SECCIÓN DE CRÉDITOS (COLOCACIÓN)
// =============================================
async function handleSearchClientForCredit() {
    // 1. REFERENCIAS AL DOM
    const curpInput = document.getElementById('curp_colocacion'); 
    const statusColocacion = document.getElementById('status_colocacion');
    const formColocacion = document.getElementById('form-colocacion');
    const btnBuscar = document.getElementById('btnBuscarCliente_colocacion');
    const selectTipo = document.getElementById('tipo_colocacion'); 

    // Bloque de seguridad
    if (!curpInput || !statusColocacion || !selectTipo) {
        console.error("❌ ERROR UI: Faltan elementos ID en el HTML.");
        return;
    }

    const curp = curpInput.value.trim().toUpperCase();

    // 2. VALIDACIÓN DE PERFIL
    const userOffice = currentUserData ? currentUserData.office : null;
    if (!userOffice) {
         showStatus('status_colocacion', 'Error: Perfil incompleto. Recarga la página.', 'error');
         return;
    }

    // 3. VALIDACIÓN FORMATO
    if (curp.length < 10) { 
        showStatus('status_colocacion', 'Formato de CURP inválido.', 'error');
        curpInput.focus();
        return;
    }

    // 4. BÚSQUEDA
    showButtonLoading(btnBuscar, true, 'Verificando...');
    statusColocacion.innerHTML = 'Verificando historial...';
    statusColocacion.className = 'status-message status-info';
    
    // IMPORTANTE: Limpiamos la variable global antes de buscar uno nuevo
    window.clienteEnProceso = null; 

    try {
        const elegibilidad = await database.verificarElegibilidadCliente(curp, userOffice);

        // Limpiar UI previa
        if (formColocacion) formColocacion.classList.add('hidden');
        const inputMonto = document.getElementById('monto_colocacion');
        if (inputMonto) inputMonto.value = '';
        
        selectTipo.disabled = false; 
        selectTipo.value = 'nuevo'; 
        
        const avisoExistente = document.getElementById('aviso-renovacion-candado');
        if(avisoExistente) avisoExistente.remove();

        if (elegibilidad.elegible) {
            showStatus('status_colocacion', elegibilidad.mensaje, 'success');
            
            // --- OBTENER Y GUARDAR DATOS DEL CLIENTE ---
            const cliente = await database.buscarClientePorCURP(curp, userOffice);
            
            // =========================================================
            // 🔥 CORRECCIÓN CRÍTICA: GUARDAR EN MEMORIA GLOBAL 🔥
            // Sin esto, handleCreditForm falla con "Datos perdidos"
            // =========================================================
            window.clienteEnProceso = cliente; 
            console.log("✅ Cliente seleccionado en memoria:", window.clienteEnProceso);

            // Mostrar nombre en pantalla
            const inputNombre = document.getElementById('nombre_colocacion');
            if (inputNombre && cliente) inputNombre.value = cliente.nombre;

            // --- LÓGICA CANDADO DE RENOVACIÓN ---
            if (elegibilidad.esRenovacion) {
                const histId = elegibilidad.datosCreditoAnterior ? 
                              (elegibilidad.datosCreditoAnterior.historicalIdCredito || elegibilidad.datosCreditoAnterior.id) : null;
                
                let forzarRenovacion = false;
                
                if (histId) {
                   const pagosLiq = await database.db.collection('pagos')
                       .where('idCredito', '==', histId)
                       .where('office', '==', userOffice)
                       .where('tipoPago', '==', 'renovacion')
                       .limit(1).get();
                   
                   if (!pagosLiq.empty) forzarRenovacion = true;
                }

                if (forzarRenovacion || elegibilidad.forzarRenovacion) {
                    selectTipo.value = 'renovacion';
                    selectTipo.disabled = true; 
                    
                    const divTipo = selectTipo.parentElement;
                    let aviso = document.getElementById('aviso-renovacion-candado');
                    if (!aviso) {
                        aviso = document.createElement('small');
                        aviso.id = 'aviso-renovacion-candado';
                        divTipo.appendChild(aviso);
                    }
                    aviso.style.color = '#d63384';
                    aviso.style.fontWeight = 'bold';
                    aviso.style.display = 'block';
                    aviso.style.marginTop = '5px';
                    aviso.textContent = "🔒 Bloqueado en Renovación (Requisito del Sistema)";
                } else {
                    selectTipo.value = 'renovacion'; 
                }
            }

            if (formColocacion) formColocacion.classList.remove('hidden');

        } else {
            showStatus('status_colocacion', elegibilidad.message || elegibilidad.mensaje, 'error');
        }

    } catch (error) {
        console.error(error);
        showStatus('status_colocacion', 'Error al verificar: ' + error.message, 'error');
    } finally {
        showButtonLoading(btnBuscar, false);
    }
}

// CREDIT FORM
async function handleCreditForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    const statusColocacion = document.getElementById('status_colocacion');
    const curpAvalInput = document.getElementById('curpAval_colocacion');
    const curpAval = curpAvalInput.value.trim().toUpperCase();

    // 1. Validar cliente cargado
    if (!clienteParaCredito || clienteParaCredito.curp !== document.getElementById('curp_colocacion').value.trim().toUpperCase()) {
         showStatus('status_colocacion', 'Error: Se perdieron los datos del cliente. Por favor, busca al cliente de nuevo.', 'error');
         return;
    }

    // 2. Preparar datos
    const creditoData = {
        curpCliente: clienteParaCredito.curp,
        office: clienteParaCredito.office,
        tipo: document.getElementById('tipo_colocacion').value,
        monto: parseFloat(document.getElementById('monto_colocacion').value),
        plazo: parseInt(document.getElementById('plazo_colocacion').value),
        curpAval: curpAval,
        nombreAval: document.getElementById('nombreAval_colocacion').value.trim()
    };
    
    // Cálculos financieros
    let interesRate = 0;
    if (creditoData.plazo === 14) interesRate = 0.40;
    else if (creditoData.plazo === 13) interesRate = 0.30; 
    else if (creditoData.plazo === 10) interesRate = 0.00;

    creditoData.montoTotal = parseFloat((creditoData.monto * (1 + interesRate)).toFixed(2));
    creditoData.saldo = creditoData.montoTotal;

    // 3. Validaciones UI
    if (!creditoData.monto || creditoData.monto <= 0 || !creditoData.plazo || !creditoData.tipo || !creditoData.nombreAval) {
        showStatus('status_colocacion', 'Todos los campos son obligatorios.', 'error');
        return;
    }
    if (!validarFormatoCURP(creditoData.curpCliente)) {
        showStatus('status_colocacion', 'Error: CURP del cliente inválido.', 'error');
        return;
    }
    if (!validarFormatoCURP(curpAval)) {
        showStatus('status_colocacion', 'Error: El CURP del aval tiene formato inválido.', 'error');
        curpAvalInput.classList.add('input-error');
        return;
    } else {
        curpAvalInput.classList.remove('input-error');
    }

    // Feedback Visual Inicial
    showButtonLoading(submitButton, true, 'Procesando...');
    showFixedProgress(30, 'Verificando aval...');
    statusColocacion.innerHTML = 'Validando datos...';
    statusColocacion.className = 'status-message status-info';

    try {
        // 4. VERIFICACIÓN DE AVAL
        const checkAval = await database.verificarElegibilidadAval(creditoData.curpAval, creditoData.office);
        
        if (!checkAval.elegible) {
            throw new Error(`Problema con el Aval: ${checkAval.message}`);
        }

        // 5. GENERAR CRÉDITO
        showFixedProgress(60, 'Generando folio...');
        
        const resultado = await database.agregarCredito(
            creditoData, 
            currentUserData.email, 
            currentUserData
        );

        if (resultado.success) {
            showFixedProgress(100, '¡Completado!');
            
            const folio = resultado.data.historicalIdCredito;
            let mensajeFinal = '';

            if (resultado.offline) {
                mensajeFinal = `✅ CRÉDITO GUARDADO (OFFLINE)\n\n🆔 FOLIO: ${folio}\n\nListo para registrar otro crédito.`;
            } else {
                mensajeFinal = `✅ CRÉDITO GENERADO EXITOSAMENTE\n\n🆔 FOLIO: ${folio}\n\nListo para registrar otro crédito.`;
            }

            // Usamos ALERT para obligar al usuario a leer el folio
            alert(mensajeFinal);
            
            showStatus('status_colocacion', `Éxito. Último folio generado: ${folio}`, 'success');

            // --- CAMBIO: NO OCULTAR FORMULARIO, SOLO LIMPIAR PARA EL SIGUIENTE ---
            // 1. Limpiar campos del crédito específico
            document.getElementById('monto_colocacion').value = '';
            document.getElementById('montoTotal_colocacion').value = '';
            document.getElementById('curpAval_colocacion').value = '';
            document.getElementById('nombreAval_colocacion').value = '';
            
            // 2. Limpiar búsqueda de cliente (para obligar a buscar al siguiente)
            document.getElementById('curp_colocacion').value = '';
            document.getElementById('nombre_colocacion').value = '';
            document.getElementById('idCredito_colocacion').value = '';
            clienteParaCredito = null;
            
            // 3. Ocultar el formulario interno pero mantener la vista
            document.getElementById('form-colocacion').classList.add('hidden');
            
            // 4. Poner foco en el buscador de cliente
            document.getElementById('curp_colocacion').focus();

            // Nota: No llamamos a showView('view-gestion-clientes') para permanecer aquí.

        } else {
            throw new Error(resultado.message);
        }

    } catch (error) {
        console.error("Error en handleCreditForm:", error);
        showFixedProgress(100, 'Error');
        showStatus('status_colocacion', `Error: ${error.message}`, 'error');
        alert(`❌ No se pudo generar el crédito:\n${error.message}`);
    } finally {
        showButtonLoading(submitButton, false);
        setTimeout(hideFixedProgress, 1000);
    }
}


// =============================================
// SECCIÓN DE PAGOS (COBRANZA)
// =============================================
async function handleSearchCreditForPayment() {
    const idCreditoInput = document.getElementById('idCredito_cobranza');
    const historicalIdCredito = idCreditoInput.value.trim();
    const statusCobranza = document.getElementById('status_cobranza');
    const formCobranza = document.getElementById('form-cobranza');
    const btnBuscar = document.getElementById('btnBuscarCredito_cobranza');
    
    // Referencias al nuevo input de fecha
    const divFechaManual = document.getElementById('div-fecha-manual-container');
    const inputFechaManual = document.getElementById('fecha_cobranza_manual');

    creditoActual = null;

    if (!historicalIdCredito) {
        showStatus('status_cobranza', 'Por favor, ingresa un ID de crédito (histórico).', 'warning');
        formCobranza.classList.add('hidden');
        return;
    }

    showButtonLoading(btnBuscar, true, 'Buscando...');
    showFixedProgress(30, `Buscando crédito con ID ${historicalIdCredito}...`);
    statusCobranza.innerHTML = 'Buscando crédito...';
    statusCobranza.className = 'status-message status-info';
    formCobranza.classList.add('hidden');

    try {
        const creditosEncontrados = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { userOffice: currentUserData?.office });

        if (creditosEncontrados.length === 0) {
            showFixedProgress(100, 'Crédito no encontrado');
            throw new Error(`No se encontró ningún crédito con el ID histórico: ${historicalIdCredito} (en tu sucursal).`);
        }

        // Si hay duplicados, tomamos el más reciente
        if (creditosEncontrados.length > 1) {
            creditosEncontrados.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
            showStatus('status_cobranza', `Advertencia: Múltiples créditos con ID ${historicalIdCredito}. Se cargó el más reciente.`, 'warning');
        }

        creditoActual = creditosEncontrados[0];

        showFixedProgress(60, 'Obteniendo datos del cliente...');
        const cliente = await database.buscarClientePorCURP(creditoActual.curpCliente, currentUserData?.office);
        
        showFixedProgress(80, 'Calculando historial del crédito...');
        const pagos = await database.getPagosPorCredito(historicalIdCredito, creditoActual.office);
        pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));

        const historial = _calcularEstadoCredito(creditoActual, pagos);

        if (!historial) {
            throw new Error(`Error calculando historial del crédito.`);
        }

        // Llenar Formulario
        document.getElementById('nombre_cobranza').value = cliente ? cliente.nombre : (creditoActual.nombreCliente || 'Cliente Desconocido');
        document.getElementById('saldo_cobranza').value = `$${historial.saldoRestante.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('estado_cobranza').value = historial.estado.toUpperCase();
        document.getElementById('semanas_atraso_cobranza').value = historial.semanasAtraso || 0;
        document.getElementById('pago_semanal_cobranza').value = `$${historial.pagoSemanal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('fecha_proximo_pago_cobranza').value = historial.proximaFechaPago || 'N/A';
        
        const montoInput = document.getElementById('monto_cobranza');
        montoInput.value = historial.pagoSemanal > 0 ? historial.pagoSemanal.toFixed(2) : '';
        handleMontoPagoChange();

        // --- LÓGICA DE FECHA MANUAL (NUEVO) ---
        if (divFechaManual && inputFechaManual) {
            // Establecer fecha de hoy por defecto (Local)
            const hoyLocal = new Date();
            const offset = hoyLocal.getTimezoneOffset() * 60000;
            const fechaISO = new Date(hoyLocal.getTime() - offset).toISOString().split('T')[0];
            inputFechaManual.value = fechaISO;

            // Mostrar solo si NO es área comercial
            if (currentUserData.role === 'Área comercial') {
                divFechaManual.classList.add('hidden');
            } else {
                divFechaManual.classList.remove('hidden');
            }
        }
        // --------------------------------------

        showFixedProgress(100, 'Crédito encontrado');
        formCobranza.classList.remove('hidden');

        if (!statusCobranza.textContent.includes('Advertencia')) {
            showStatus('status_cobranza', `Crédito ${historicalIdCredito} encontrado.`, 'success');
        }

        montoInput.focus();
        montoInput.select();

    } catch (error) {
        console.error("Error buscando crédito:", error);
        showStatus('status_cobranza', `Error: ${error.message}`, 'error');
        formCobranza.classList.add('hidden');
        creditoActual = null;
        hideFixedProgress();
    } finally {
        showButtonLoading(btnBuscar, false);
        if (!document.querySelector('#status_cobranza.status-error')) {
            setTimeout(hideFixedProgress, 1500);
        }
    }
}

// ========================================= //
    // ** FUNCION DE PAGO INDIVIDUAL ** //
// ========================================= //
async function handlePaymentForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    const statusCobranza = document.getElementById('status_cobranza');

    if (!creditoActual || !creditoActual.id) {
        showStatus('status_cobranza', 'Error: No hay crédito seleccionado.', 'error');
        return;
    }
    const historicalId = creditoActual.historicalIdCredito || creditoActual.id;

    const montoInput = document.getElementById('monto_cobranza');
    const montoPago = parseFloat(montoInput.value);
    const tipoPago = document.getElementById('tipo_cobranza').value;

    if (isNaN(montoPago) || montoPago <= 0) {
        showStatus('status_cobranza', 'Error: El monto debe ser positivo.', 'error');
        montoInput.classList.add('input-error');
        return;
    } else {
        montoInput.classList.remove('input-error');
    }

    // --- CAPTURA DE FECHA MANUAL (NUEVO) ---
    let fechaPersonalizada = null;
    const inputFechaManual = document.getElementById('fecha_cobranza_manual');
    
    // Solo si el input es visible y el usuario NO es comercial
    if (currentUserData.role !== 'Área comercial' && inputFechaManual && inputFechaManual.value) {
        // Le agregamos la hora T12:00:00 para evitar problemas de zona horaria (UTC vs Local)
        fechaPersonalizada = inputFechaManual.value + 'T12:00:00';
    }
    // ---------------------------------------

    // --- REGLAS DE COMISIÓN (Tus reglas vigentes) ---
    let comision = 0;
    const plazo = creditoActual.plazo || 14;
    const estadoInput = document.getElementById('estado_cobranza'); 
    const estadoActual = estadoInput ? estadoInput.value.toLowerCase() : (creditoActual.estado || 'al corriente');

    if (plazo !== 10) { 
        if (estadoActual === 'al corriente' || estadoActual === 'liquidado' || estadoActual === 'adelantado') {
            
            if (tipoPago === 'normal' || tipoPago === 'adelanto') {
                const pagoSemanal = creditoActual.montoTotal / creditoActual.plazo;
                if (pagoSemanal > 0) {
                    const pagosCompletos = Math.floor((montoPago + 0.1) / pagoSemanal);
                    comision = pagosCompletos * 10;
                }
            } 
            else if (tipoPago === 'actualizado') {
                const pagoSemanal = creditoActual.montoTotal / creditoActual.plazo;
                if (pagoSemanal > 0 && montoPago >= (pagoSemanal - 0.9)) {
                    comision = 10;
                } else {
                    comision = 0;
                }
            }
        } else {
            comision = 0; // Bloqueo por estatus
        }
    }

    showButtonLoading(submitButton, true, 'Registrando...');
    showFixedProgress(50, 'Procesando pago...');
    statusCobranza.innerHTML = 'Registrando pago...';
    statusCobranza.className = 'status-message status-info';

    try {
        const pagoData = {
            idCredito: historicalId,
            monto: montoPago,
            tipoPago: tipoPago,
            comisionGenerada: comision, 
            origen: 'manual',
            // Enviamos la fecha personalizada (puede ser null, la DB lo manejará)
            fechaPersonalizada: fechaPersonalizada 
        };

        const resultado = await database.agregarPago(pagoData, currentUser.email, creditoActual.id);

        if (resultado.success) {
            showFixedProgress(100, 'Pago registrado');
            let successMsg = `¡Pago registrado! Comisión generada: $${comision}`;
            
            if (fechaPersonalizada) {
                successMsg += ` (Fecha: ${inputFechaManual.value})`;
            }
            if (!isOnline) successMsg += ' (Guardado localmente).';
            
            showStatus('status_cobranza', successMsg, 'success');
            document.getElementById('form-cobranza').classList.add('hidden');
            document.getElementById('idCredito_cobranza').value = '';
            creditoActual = null;
        } else {
            throw new Error(resultado.message);
        }

    } catch (error) {
        console.error("Error en handlePaymentForm:", error);
        showFixedProgress(100, 'Error al registrar');
        showStatus('status_cobranza', `Error al registrar pago: ${error.message}`, 'error');
    } finally {
        showButtonLoading(submitButton, false);
        setTimeout(hideFixedProgress, 2000);
    }
}

// ========================================= //
    // ** FUNCION DE MONTO DE PAGO ** //
// ========================================= //
async function handleMontoPagoChange() {
    if (!creditoActual) return;

    const montoInput = document.getElementById('monto_cobranza');
    const saldoDespuesInput = document.getElementById('saldoDespues_cobranza');
    if (!montoInput || !saldoDespuesInput) return;

    // *** CORRECCIÓN: Usar el saldo RECALCULADO para la UI ***
    const historicalId = creditoActual.historicalIdCredito || creditoActual.id;
    const pagos = await database.getPagosPorCredito(historicalId, creditoActual.office);
    pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
    const historial = _calcularEstadoCredito(creditoActual, pagos);
    
    const saldoActualParaUI = historial ? historial.saldoRestante : (creditoActual.saldo !== undefined ? creditoActual.saldo : 0);

    const monto = parseFloat(montoInput.value) || 0;
    const saldoDespues = saldoActualParaUI - monto;

    saldoDespuesInput.value = `$${saldoDespues.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const tolerancia = 0.015;
    if (monto > saldoActualParaUI + tolerancia) {
        montoInput.classList.add('input-error');
        montoInput.title = "El monto excede el saldo actual";
        showStatus('status_cobranza', 'Advertencia: El monto ingresado excede el saldo restante.', 'warning');
    } else {
        montoInput.classList.remove('input-error');
        montoInput.title = "";
        const statusCobranza = document.getElementById('status_cobranza');
        if (statusCobranza.classList.contains('status-warning') && statusCobranza.textContent.includes('excede')) {
            showStatus('status_cobranza', `Crédito ${historicalId} encontrado (${creditoActual.curpCliente}). Listo para registrar pago.`, 'success');
        }
    }
}

// =============================================
// SECCIÓN DE PAGO GRUPAL
// =============================================
async function handleCalcularCobranzaRuta() {
    console.log('🚀 Iniciando cálculo de ruta (Lógica Estricta 703)...');
    const start = Date.now(); 

    const container = document.getElementById('cobranza-ruta-container');
    const btnGuardar = document.getElementById('btn-guardar-cobranza-offline');
    const btnRegistrar = document.getElementById('btn-registrar-pagos-offline');
    const btnMapa = document.getElementById('btn-ver-ruta-maps');
    
    const checkboxes = document.querySelectorAll('.poblacion-check:checked');
    const poblacionesSeleccionadas = Array.from(checkboxes).map(cb => cb.value);

    if (poblacionesSeleccionadas.length === 0) {
        showStatus('status_pago_grupo', 'Selecciona al menos una población.', 'warning');
        return;
    }

    showProcessingOverlay(true, `Analizando ${poblacionesSeleccionadas.length} poblaciones...`);
    
    if (container) container.innerHTML = '';
    if (btnGuardar) btnGuardar.classList.add('hidden');
    if (btnRegistrar) btnRegistrar.classList.add('hidden');
    if (btnMapa) btnMapa.classList.add('hidden');
    waypointsComisionistas = []; 

    try {
        const userOffice = currentUserData.office;
        const allCreditosPendientes = [];

        // Carga de clientes
        const chunks = [];
        for (let i = 0; i < poblacionesSeleccionadas.length; i += 10) {
            chunks.push(poblacionesSeleccionadas.slice(i, i + 10));
        }

        const clientesPromises = chunks.map(chunk => 
            db.collection('clientes')
              .where('poblacion_grupo', 'in', chunk)
              .where('office', '==', userOffice)
              .get()
        );

        const clientesSnapshots = await Promise.all(clientesPromises);
        const todosLosClientes = clientesSnapshots.flatMap(snap => snap.docs.map(d => ({id: d.id, ...d.data()})));

        if (todosLosClientes.length === 0) throw new Error("No hay clientes en estas poblaciones.");

        const procesarCliente = async (cliente) => {
            // Mapa Waypoints... (se mantiene igual)
            if (cliente.isComisionista && cliente.domicilio && cliente.domicilio.length > 5) {
                const existe = waypointsComisionistas.some(w => w.poblacion === cliente.poblacion_grupo);
                if (!existe) {
                    const estadoMx = userOffice === 'GDL' ? 'Jalisco' : 'Guanajuato';
                    waypointsComisionistas.push({
                        poblacion: cliente.poblacion_grupo,
                        location: `${cliente.domicilio}, ${cliente.poblacion_grupo}, ${estadoMx}, México`,
                        nombre: cliente.nombre
                    });
                }
            }

            const creditos = await database.buscarCreditosPorCliente(cliente.curp, userOffice);
            
            for (const credito of creditos) {
                const histId = credito.historicalIdCredito || credito.id;
                const pagos = await database.getPagosPorCredito(histId, userOffice);
                // Ordenar pagos
                pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
                
                const estadoCalc = _calcularEstadoCredito(credito, pagos);

                if (estadoCalc && estadoCalc.estado !== 'liquidado') {
                    
                    // --- MATEMÁTICA ESTRICTA (CORRECCIÓN 703) ---
                    
                    // 1. Pago Semanal Fijo (Contrato)
                    const montoTotal = parseFloat(credito.montoTotal) || 0;
                    const plazo = parseInt(credito.plazo) || 14;
                    const pagoSemanalFijo = montoTotal / plazo; 
                    const saldoRestante = estadoCalc.saldoRestante;
                    
                    if (saldoRestante < 1) continue;

                    // 2. Calcular Adelantos "Picos"
                    const totalPagadoHist = pagos.reduce((sum, p) => sum + (p.monto || 0), 0);
                    
                    let adelantoAcumulado = 0;
                    if (pagoSemanalFijo > 0) {
                        adelantoAcumulado = totalPagadoHist % pagoSemanalFijo;
                        // Corrección decimal
                        if (Math.abs(pagoSemanalFijo - adelantoAcumulado) < 1) adelantoAcumulado = 0;
                        if (adelantoAcumulado < 1) adelantoAcumulado = 0;
                    }

                    // 3. DEFINIR MONTO SUGERIDO (Aquí está la corrección clave)
                    let montoSugerido = 0;

                    // Si el estado es "al corriente" (calculado por fechas en _calcularEstadoCredito),
                    // IGNORAMOS el hecho de que falten 2 o 3 pagos para liquidar.
                    // Solo pedimos 1 pago semanal.
                    if (estadoCalc.estado === 'al corriente' || estadoCalc.estado === 'adelantado') {
                        montoSugerido = pagoSemanalFijo - adelantoAcumulado;
                    } else {
                        // Solo si está ATRASADO pedimos el acumulado
                        const semanasAtraso = estadoCalc.semanasAtraso || 0;
                        // Si semanasAtraso es 0 (pero entró aquí por error), forzamos 1
                        const semanasCobrar = Math.max(1, semanasAtraso);
                        montoSugerido = (semanasCobrar * pagoSemanalFijo) - adelantoAcumulado;
                    }

                    // 4. Corrección de Negativos
                    // Si el adelanto cubre la semana (montoSugerido <= 0) y sigue al corriente,
                    // pedimos el complemento para la SIGUIENTE semana (o 0 si queremos dar vacaciones)
                    // En este caso, si ya cubrió la semana, sugerimos 0 o el remanente.
                    if (montoSugerido < 5) {
                        // Si ya está cubierto, pedimos la siguiente para que siga adelantando,
                        // o lo dejamos en 0. Para flujo de efectivo constante, sugerimos la siguiente.
                        montoSugerido += pagoSemanalFijo; 
                    }

                    // 5. Tope Final (Saldo)
                    if (montoSugerido > saldoRestante) {
                        montoSugerido = saldoRestante;
                    }

                    montoSugerido = parseFloat(montoSugerido.toFixed(2));

                    allCreditosPendientes.push({
                        firestoreId: credito.id,
                        historicalIdCredito: histId,
                        nombreCliente: cliente.nombre,
                        curpCliente: cliente.curp,
                        pagoSemanalAcumulado: montoSugerido,
                        saldoRestante: saldoRestante,
                        estadoCredito: estadoCalc.estado,
                        poblacion_grupo: cliente.poblacion_grupo,
                        office: credito.office,
                        plazo: plazo,
                        pagoSemanalUnitario: parseFloat(pagoSemanalFijo.toFixed(2)),
                        adelantoAcumulado: parseFloat(adelantoAcumulado.toFixed(2)) 
                    });
                }
            }
        };

        await Promise.all(todosLosClientes.map(cliente => procesarCliente(cliente)));

        if (allCreditosPendientes.length === 0) {
            throw new Error("No hay cobros pendientes en la selección.");
        }

        cobranzaRutaData = {};
        allCreditosPendientes.forEach(cred => {
            const grupo = cred.poblacion_grupo || 'Sin Grupo';
            if (!cobranzaRutaData[grupo]) cobranzaRutaData[grupo] = [];
            cobranzaRutaData[grupo].push(cred);
        });

        renderizarCobranzaRuta(cobranzaRutaData, container);

        // ... (resto de UI igual) ...
        const selectorCard = document.getElementById('selector-poblaciones-card');
        if (selectorCard) selectorCard.classList.add('closed');
        
        if(btnGuardar) btnGuardar.classList.remove('hidden');
        if(btnRegistrar) btnRegistrar.classList.remove('hidden');
        if (btnMapa && waypointsComisionistas.length > 0) {
            btnMapa.classList.remove('hidden');
            const newBtnMapa = btnMapa.cloneNode(true);
            btnMapa.parentNode.replaceChild(newBtnMapa, btnMapa);
            newBtnMapa.addEventListener('click', generarRutaMaps);
        }

        const seconds = ((Date.now() - start) / 1000).toFixed(1);
        showStatus('status_pago_grupo', `Cálculo completado en ${seconds}s.`, 'success');

    } catch (error) {
        console.error("Error ruta:", error);
        showStatus('status_pago_grupo', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}

//=======================================
// ** INICIALIZAR VISTA DE PAGO GRUPAL (VISIBILIDAD ASEGURADA) **
//=======================================
async function inicializarVistaPagoGrupal() {
    console.log("🚀 INICIANDO VISTA PAGO GRUPAL (Ordenada Alfabéticamente)");
    
    // Referencias UI
    const containerChecks = document.getElementById('checkboxes-poblaciones-container');
    const cardSelector = document.getElementById('selector-poblaciones-card');
    const statusPago = document.getElementById('status_pago_grupo');
    const btnGuardar = document.getElementById('btn-guardar-cobranza-offline');
    const btnRegistrar = document.getElementById('btn-registrar-pagos-offline');
    const containerResultados = document.getElementById('cobranza-ruta-container');
    const placeholder = document.getElementById('cobranza-ruta-placeholder');
    const btnVerMapa = document.getElementById('btn-ver-ruta-maps');

    // Reset UI
    if(containerResultados) containerResultados.innerHTML = '';
    if(statusPago) { statusPago.innerHTML = ''; statusPago.className = 'status-message hidden'; }
    if(btnGuardar) btnGuardar.classList.add('hidden');
    if(btnRegistrar) btnRegistrar.classList.add('hidden');
    if(btnVerMapa) btnVerMapa.classList.add('hidden');
    if(placeholder) placeholder.classList.remove('hidden');

    if (!currentUserData) {
        showStatus('status_pago_grupo', 'Error: Datos de usuario no cargados.', 'error');
        return;
    }

    // --- 1. LÓGICA DE DATOS GUARDADOS (OFFLINE) ---
    const keyOffline = OFFLINE_STORAGE_KEY + (currentUserData.ruta || 'sin_ruta');
    let datosGuardados = null;
    try {
        const rawData = localStorage.getItem(keyOffline);
        if (rawData) datosGuardados = JSON.parse(rawData);
    } catch(e) { console.error("Error localStorage", e); }

    if (datosGuardados && datosGuardados.data) {
        // ... (Lógica de datos guardados se mantiene igual) ...
        // [CÓDIGO DE DATOS GUARDADOS OMITIDO PARA BREVEDAD, DEJAR IGUAL AL ORIGINAL]
        // Solo asegúrate de que al cargar datos guardados llames a renderizarCobranzaRuta
        // que ya incluirá el ordenamiento en el siguiente paso.
        const fechaGuardado = new Date(datosGuardados.timestamp).toLocaleString();
        
        const aviso = document.createElement('div');
        aviso.className = 'alert alert-info';
        aviso.style.margin = '15px 0';
        aviso.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span><strong><i class="fas fa-save"></i> Ruta guardada (${fechaGuardado})</strong></span>
                <div>
                    <button id="btn-cargar-guardado" class="btn btn-sm btn-primary">Cargar</button>
                    <button id="btn-borrar-guardado" class="btn btn-sm btn-outline-danger"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        
        if(placeholder && placeholder.parentNode) {
            const prev = document.querySelector('.alert-info');
            if(prev) prev.remove();
            placeholder.parentNode.insertBefore(aviso, placeholder);
        }

        document.getElementById('btn-cargar-guardado').onclick = () => {
            cobranzaRutaData = datosGuardados.data;
            if(cardSelector) cardSelector.classList.add('hidden');
            if(placeholder) placeholder.classList.add('hidden');
            aviso.remove();
            renderizarCobranzaRuta(cobranzaRutaData, containerResultados);
            if(btnRegistrar) btnRegistrar.classList.remove('hidden');
            if(btnVerMapa) btnVerMapa.classList.remove('hidden');
            waypointsComisionistas = []; 
            showStatus('status_pago_grupo', 'Ruta local cargada.', 'success');
        };

        document.getElementById('btn-borrar-guardado').onclick = async () => {
            if(confirm("¿Borrar ruta guardada?")) {
                localStorage.removeItem(keyOffline);
                aviso.remove();
                containerResultados.innerHTML = '';
                showStatus('status_pago_grupo', 'Datos eliminados.', 'info');
                await inicializarVistaPagoGrupal();
            }
        };
    }

    // --- 2. SI NO HAY INTERNET ---
    if (!navigator.onLine) {
        showStatus('status_pago_grupo', 'Modo Offline. Solo datos guardados.', 'warning');
        if(cardSelector) cardSelector.classList.add('hidden');
        const btnCargar = document.getElementById('btn-cargar-guardado');
        if(btnCargar) btnCargar.click();
        return;
    }

    // --- 3. LÓGICA ONLINE (CARGAR SELECTORES) ---
    if (cardSelector) {
        cardSelector.classList.remove('hidden');
        cardSelector.style.display = 'block'; 
    }

    let rutaUsuario = currentUserData.ruta;
    let officeUsuario = currentUserData.office;

    if (!rutaUsuario) {
        showStatus('status_pago_grupo', 'Tu usuario no tiene ruta asignada.', 'error');
        return;
    }

    if (containerChecks) containerChecks.innerHTML = '<div class="spinner"></div> Cargando poblaciones...';

    const btnCalcular = document.getElementById('btn-calcular-seleccion');
    if(btnCalcular) {
        const newBtn = btnCalcular.cloneNode(true);
        btnCalcular.parentNode.replaceChild(newBtn, btnCalcular);
        newBtn.disabled = false;
        newBtn.addEventListener('click', handleCalcularCobranzaRuta);
    }

    try {
        let poblaciones = [];
        try {
            poblaciones = await database.obtenerPoblacionesPorRuta(rutaUsuario, officeUsuario);
        } catch (e) { console.error(e); }
        
        if (containerChecks) containerChecks.innerHTML = ''; 

        if (poblaciones.length === 0) {
            containerChecks.innerHTML = '<p>No hay poblaciones en tu ruta.</p>';
            return;
        }

        // --- CAMBIO 1: ORDENAR ALFABÉTICAMENTE ---
        poblaciones.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // --- BOTÓN "TODAS" ---
        const allDiv = document.createElement('div');
        allDiv.className = 'select-all-container';
        allDiv.innerHTML = `
            <label id="label-toggle-all" class="poblacion-select-card selected" 
                 style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 15px; margin-bottom: 10px;">
                <input type="checkbox" id="check-all-poblaciones" checked style="display:none;"> 
                <span style="font-weight:bold; font-size: 1rem; color:var(--primary);">
                    TODAS LAS POBLACIONES
                </span>
                <i id="icon-master-check" class="fas fa-check-circle check-icon" 
                   style="font-size: 1.4rem; color: #28a745; transition: color 0.2s;"></i>
            </label>
        `;
        containerChecks.appendChild(allDiv);

        // --- GRID DE POBLACIONES ---
        const gridDiv = document.createElement('div');
        gridDiv.className = 'poblacion-selector-grid';
        
        const actualizarVisualesMaestro = (isChecked) => {
            const masterLabel = document.getElementById('label-toggle-all');
            const masterIcon = document.getElementById('icon-master-check');
            const masterInput = document.getElementById('check-all-poblaciones');

            if(masterInput) masterInput.checked = isChecked;

            if (isChecked) {
                masterLabel.classList.add('selected');
                masterIcon.style.color = '#28a745';
                masterIcon.className = "fas fa-check-circle check-icon";
            } else {
                masterLabel.classList.remove('selected');
                masterIcon.style.color = '#ccc';
                masterIcon.className = "far fa-circle check-icon";
            }
        };

        poblaciones.forEach(pob => {
            const label = document.createElement('label');
            label.className = 'poblacion-select-card selected';
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.cursor = 'pointer';
            
            label.innerHTML = `
                <input type="checkbox" class="poblacion-check" value="${pob.nombre}" checked 
                       style="width: 18px; height: 18px; margin-right: 10px;"> 
                <span class="poblacion-name" style="flex-grow: 1;">${pob.nombre}</span> 
                <i class="fas fa-check-circle check-icon"></i>`;
            
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', function() {
                if(this.checked) label.classList.add('selected');
                else label.classList.remove('selected');
                
                const allChecks = document.querySelectorAll('.poblacion-check');
                const allChecked = Array.from(allChecks).every(c => c.checked);
                actualizarVisualesMaestro(allChecked);
            });
            
            gridDiv.appendChild(label);
        });
        containerChecks.appendChild(gridDiv);

        const masterInput = document.getElementById('check-all-poblaciones');
        if (masterInput) {
            masterInput.addEventListener('change', function() {
                const isChecked = this.checked;
                actualizarVisualesMaestro(isChecked);
                document.querySelectorAll('.poblacion-select-card').forEach(card => {
                    if (card.id !== 'label-toggle-all') {
                        const input = card.querySelector('input');
                        if (input) {
                            input.checked = isChecked;
                            input.dispatchEvent(new Event('change'));
                        }
                    }
                });
            });
        }

    } catch (error) {
        console.error(error);
        if(containerChecks) containerChecks.innerHTML = '<p class="text-danger">Error cargando poblaciones.</p>';
    }
}
    
/**
 * Registra los pagos seleccionados en la lista de ruta.
 * Captura el monto, el tipo de pago y la comisión calculada visualmente.
 */
async function handleRegistroPagoGrupal() {
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const container = document.getElementById('cobranza-ruta-container');
    
    // 1. Obtener solo los checkboxes marcados
    const checkboxes = container.querySelectorAll('.pago-grupal-check:checked');

    if (checkboxes.length === 0) {
        showStatus('status_pago_grupo', 'No has seleccionado ningún pago para registrar.', 'warning');
        return;
    }

    if (!confirm(`¿Estás seguro de registrar ${checkboxes.length} pagos?\n\nSe registrarán los montos y las comisiones mostradas en pantalla.`)) {
        return;
    }

    showProcessingOverlay(true, `Procesando ${checkboxes.length} transacciones...`);
    
    let exitosos = 0;
    let errores = 0;

    // 2. Procesar pago por pago
    // Usamos un bucle for...of para manejar las promesas secuencialmente (más seguro para transacciones de caja)
    for (const cb of checkboxes) {
        const idLink = cb.getAttribute('data-id-link'); // ID de Firestore para vincular inputs
        const firestoreId = cb.getAttribute('data-firestore-id');
        const histId = cb.getAttribute('data-hist-id');
        const nombre = cb.getAttribute('data-nombre');

        // Obtener elementos del DOM de esa fila específica
        const inputMonto = container.querySelector(`.pago-grupal-input[data-id-link="${idLink}"]`);
        const selectTipo = container.querySelector(`.pago-grupal-tipo[data-id-link="${idLink}"]`);
        const labelComision = document.getElementById(`comision-val-${idLink}`); // El <span> con el valor calculado

        // Extraer valores
        const monto = parseFloat(inputMonto.value);
        const tipoPago = selectTipo ? selectTipo.value : 'normal';
        const saldoMax = parseFloat(inputMonto.getAttribute('data-saldo-max'));
        
        // Extraer la comisión calculada (quitamos el signo de pesos)
        let comisionGenerada = 0;
        if (labelComision) {
            comisionGenerada = parseFloat(labelComision.textContent.replace('$', '').trim()) || 0;
        }

        // --- Validaciones Individuales ---
        if (monto <= 0 || isNaN(monto)) {
            console.warn(`Salto: Monto inválido para ${nombre}`);
            errores++;
            // Marcar visualmente el error
            inputMonto.style.border = '2px solid red';
            continue;
        }

        // Validación suave de sobrepago (puedes quitarla si permites saldo a favor)
        if (monto > (saldoMax + 0.5)) { // +0.50 de tolerancia por redondeos
            console.warn(`Advertencia: Monto excede saldo para ${nombre}`);
            // No detenemos, pero marcamos
            inputMonto.style.borderColor = '#ffc107'; 
        }

        try {
            // Construir objeto de datos
            const pagoData = {
                idCredito: histId,
                monto: monto,
                tipoPago: tipoPago,
                // ENVIAMOS LA COMISIÓN AL BACKEND
                // database.agregarPago deberá leer esto y crear el movimiento de salida si > 0
                comisionGenerada: comisionGenerada,
                origen: 'ruta_offline' // Marca para saber de dónde vino
            };

            // Llamada a la base de datos
            const result = await database.agregarPago(pagoData, currentUser.email, firestoreId);

            if (result.success) {
                exitosos++;
                
                // --- Feedback Visual de Éxito ---
                // 1. Deshabilitar controles para evitar doble envío
                cb.checked = false;
                cb.disabled = true;
                inputMonto.disabled = true;
                selectTipo.disabled = true;
                
                // 2. Cambiar estilo de la fila (Verde clarito)
                const fila = cb.closest('tr');
                fila.style.backgroundColor = '#d4edda';
                fila.style.transition = 'background-color 0.5s';
                
                // 3. Actualizar estado visual (opcional, cambiar texto)
                const estadoCell = fila.cells[1]; // Asumiendo que la columna 1 es estado
                if(estadoCell) estadoCell.innerHTML = '<span class="badge badge-success">PAGADO</span>';

            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error(`Error registrando pago de ${nombre}:`, error);
            errores++;
            // Feedback Visual de Error (Rojo clarito)
            const fila = cb.closest('tr');
            fila.style.backgroundColor = '#f8d7da';
            showStatus('status_pago_grupo', `Error en ${nombre}: ${error.message}`, 'error');
        }
    }

    showProcessingOverlay(false);

    // Mensaje Final
    if (exitosos > 0 && errores === 0) {
        showStatus('status_pago_grupo', `¡Éxito! Se registraron ${exitosos} pagos correctamente.`, 'success');
    } else if (exitosos > 0 && errores > 0) {
        showStatus('status_pago_grupo', `Proceso finalizado con advertencias. Registrados: ${exitosos}. Errores: ${errores}. Revisa las filas rojas.`, 'warning');
    } else if (errores > 0) {
        showStatus('status_pago_grupo', `Fallaron todos los intentos (${errores}). Revisa tu conexión.`, 'error');
    }
}

/**
 * Carga y muestra las estadísticas básicas del sistema.
 * @param {string} userSucursal La sucursal del usuario (opcional).
 */
async function loadBasicReports(userOffice = null) {
    console.log(`Cargando reportes básicos para sucursal: ${userOffice || 'Todas'}...`);
    const btnActualizar = document.getElementById('btn-actualizar-reportes');
    showButtonLoading(btnActualizar, true, 'Actualizando...');
    showStatus('status_reportes', 'Calculando estadísticas...', 'info');

    document.getElementById('total-clientes').textContent = '...';
    document.getElementById('total-creditos').textContent = '...';
    document.getElementById('total-cartera').textContent = '$...';
    document.getElementById('total-vencidos').textContent = '...';
    document.getElementById('pagos-registrados').textContent = '...';
    document.getElementById('cobrado-mes').textContent = '$...';
    document.getElementById('tasa-recuperacion').textContent = '...%';
    document.getElementById('total-comisiones').textContent = '$...';

    try {
        const reportes = await database.generarReportes(userOffice);

        document.getElementById('total-clientes').textContent = reportes.totalClientes?.toLocaleString() ?? 'Error';
        document.getElementById('total-creditos').textContent = reportes.totalCreditos?.toLocaleString() ?? 'Error';
        document.getElementById('total-cartera').textContent = `$${reportes.totalCartera?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 'Error'}`;
        document.getElementById('total-vencidos').textContent = reportes.totalVencidos?.toLocaleString() ?? 'Error';
        document.getElementById('pagos-registrados').textContent = reportes.pagosRegistrados?.toLocaleString() ?? 'Error';
        document.getElementById('cobrado-mes').textContent = `$${reportes.cobradoMes?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 'Error'}`;
        document.getElementById('tasa-recuperacion').textContent = `${reportes.tasaRecuperacion?.toFixed(1) ?? '0'}%`;
        document.getElementById('total-comisiones').textContent = `$${reportes.totalComisiones?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 'Error'}`;

        showStatus('status_reportes', 'Reportes actualizados correctamente.', 'success');

    } catch (error) {
        console.error("Error al cargar reportes básicos:", error);
        showStatus('status_reportes', `Error al cargar reportes: ${error.message}`, 'error');
        document.getElementById('total-clientes').textContent = 'Error';
        document.getElementById('total-creditos').textContent = 'Error';
        document.getElementById('total-cartera').textContent = 'Error';
        document.getElementById('total-vencidos').textContent = 'Error';
        document.getElementById('pagos-registrados').textContent = 'Error';
        document.getElementById('cobrado-mes').textContent = 'Error';
        document.getElementById('tasa-recuperacion').textContent = 'Error';
        document.getElementById('total-comisiones').textContent = 'Error';
    } finally {
        showButtonLoading(btnActualizar, false);
    }
}

//==============================================================//
    // ** RENDERIZAR LA LOGICA DE COMISIONES EN TIEMPO REAL **
//==============================================================//
function renderizarCobranzaRuta(data, container) {
    if (!data || Object.keys(data).length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">No hay datos para mostrar.</p>';
        return;
    }

    let html = '';
    // Ordenar grupos (poblaciones) alfabéticamente
    const grupos = Object.keys(data).sort((a, b) => a.localeCompare(b));

    grupos.forEach(grupo => {
        const creditos = data[grupo];
        // Ordenar créditos por ID descendente
        creditos.sort((a, b) => {
            const idA = (a.historicalIdCredito || '').toString();
            const idB = (b.historicalIdCredito || '').toString();
            return idB.localeCompare(idA, undefined, { numeric: true });
        });

        const grupoId = grupo.replace(/\s+/g, '_'); 
        
        html += `
            <div class="poblacion-group card" id="group-card-${grupoId}" style="margin-bottom: 15px; border: 1px solid #dee2e6; border-radius: 12px; overflow:hidden;">
                <div class="group-header-clickable" onclick="togglePoblacionGroup('${grupoId}')" 
                     style="background-color: #f8f9fa; padding: 12px 15px; border-bottom: 1px solid #ddd; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center;">
                        <i class="fas fa-chevron-down toggle-icon" id="icon-${grupoId}"></i>
                        <h4 style="margin:0; color:var(--primary); font-size: 1.1rem;">
                            ${grupo} 
                            <span style="font-weight:normal; font-size:0.8em; color:#666; margin-left: 5px;">(${creditos.length})</span>
                        </h4>
                    </div>
                    <label class="custom-check-wrapper header-check-wrapper" title="Marcar/Desmarcar Todos" onclick="event.stopPropagation()">
                        <span style="font-weight:bold; font-size: 0.9rem; color: #555; margin-right: 8px;">Marcar Todos</span>
                        <input type="checkbox" class="check-group-all" data-grupo="${grupo}" checked>
                        <i class="fas fa-check-circle custom-check-icon" style="font-size: 1.4rem;"></i>
                    </label>
                </div>
                
                <div id="content-${grupoId}" class="group-content-wrapper">
                    <div class="table-responsive">
                        <table class="cobranza-ruta-table table table-hover" id="tabla-grupo-${grupoId}" data-grupo-name="${grupo}" style="margin-bottom:0;">
                            <thead style="background:#fff;">
                                <tr>
                                    <th style="width:25%;">Cliente</th>
                                    <th style="width:15%;">Estado</th>
                                    <th style="width:15%;">Saldo Total</th>
                                    <th style="width:35%;">Tipo de Pago y Comisión</th>
                                    <th style="width:10%; text-align:center;">Registrar</th>
                                </tr>
                            </thead>
                            <tbody>`;

        creditos.forEach(cred => {
            const linkId = cred.firestoreId;
            const montoPagarSugerido = cred.pagoSemanalAcumulado; 
            const adelantoPrevio = cred.adelantoAcumulado || 0;
            
            // Normalizamos el estado para comparaciones
            const estadoRaw = (cred.estadoCredito || 'al corriente').toLowerCase(); 
            const estadoClase = `status-${estadoRaw.replace(/\s/g, '-')}`;
            const plazo = cred.plazo || 14;
            
            let pagoSemanalUnitario = cred.pagoSemanalUnitario;
            if (!pagoSemanalUnitario || pagoSemanalUnitario <= 0) {
                pagoSemanalUnitario = (cred.montoTotal && cred.plazo) ? (cred.montoTotal / cred.plazo) : 0;
            }

            // --- LÓGICA INICIAL DE COMISIÓN (Al cargar la tabla) ---
            let comisionInicial = 0;
            
            // Definir si tiene derecho a comisión por estatus
            const estatusPermiteComision = (estadoRaw === 'al corriente' || estadoRaw === 'adelantado' || estadoRaw === 'liquidado');

            // Solo calculamos si el plazo NO es comisionista (10) Y si el estatus lo permite
            if (plazo !== 10 && pagoSemanalUnitario > 0) {
                 if (estatusPermiteComision) {
                     // Lógica normal: Suma de dinero / Pago Semanal
                     const totalParaCalculo = montoPagarSugerido + adelantoPrevio;
                     const pagosCompletos = Math.floor((totalParaCalculo + 0.1) / pagoSemanalUnitario);
                     comisionInicial = pagosCompletos * 10;
                 } else {
                     // Si está en mora/atrasado/jurídico, nace en $0
                     comisionInicial = 0;
                 }
            }

            html += `
                <tr class="fila-cobro" data-plazo="${plazo}" data-grupo-id="${grupoId}" data-estado="${estadoRaw}" id="row-${linkId}">
                    <td style="vertical-align: middle;">
                        <div style="line-height: 1.3;">
                            <strong>${cred.nombreCliente}</strong><br>
                            <small class="text-muted" style="font-size: 0.75em;">${cred.curpCliente}</small><br>
                            <small style="color:#aaa; font-size: 0.75em;">ID: ${cred.historicalIdCredito}</small>
                            
                            <div style="margin-top:2px; border-top:1px dashed #eee; padding-top:2px;">
                                <span style="font-weight:600; color:#555; font-size:0.85em;">Pago Regular: ${formatMoney(pagoSemanalUnitario)}</span>
                            </div>

                            ${plazo === 10 ? '<span class="badge badge-warning" style="font-size:0.6em; margin-top:2px;">10 SEM</span>' : ''}
                            ${adelantoPrevio > 1 ? `<br><span class="badge badge-info" style="font-size:0.65em;">Adelanto previo: $${adelantoPrevio.toFixed(2)}</span>` : ''}
                        </div>
                    </td>
                    <td style="vertical-align: middle;">
                        <span class="info-value ${estadoClase}" style="font-size: 0.75rem; padding: 4px 8px;">${estadoRaw.toUpperCase()}</span>
                    </td>
                    
                    <td style="vertical-align: middle; font-weight: 500;">${formatMoney(cred.saldoRestante)}</td>
                    
                    <td class="input-cell" style="vertical-align: middle;">
                        <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                            <select class="pago-grupal-tipo form-control-sm" 
                                    data-id-link="${linkId}" 
                                    style="width: 60%; font-weight:bold; border-radius: 6px;"
                                    onchange="recalcularComision('${linkId}')">
                                <option value="normal" selected>Normal</option>
                                <option value="adelanto">Adelanto</option>
                                <option value="actualizado">Actualizado (Renovación)</option>
                                <option value="extraordinario">Extraordinario</option>
                                <option value="bancario">Bancario / Transferencia</option>
                            </select>
                            
                            <div style="position:relative; width: 40%;">
                                <span style="position:absolute; left:8px; top:5px; color:#666; font-size: 0.9em;">$</span>
                                <input type="number" class="pago-grupal-input form-control-sm" 
                                    value="${montoPagarSugerido.toFixed(2)}" 
                                    data-id-link="${linkId}"
                                    data-saldo-max="${cred.saldoRestante}"
                                    data-pago-semanal="${pagoSemanalUnitario.toFixed(2)}"
                                    data-adelanto-previo="${adelantoPrevio.toFixed(2)}"
                                    style="padding-left: 18px; width: 100%; border-radius: 6px; font-weight: bold;"
                                    oninput="recalcularComision('${linkId}')">
                            </div>
                        </div>
                        
                        <div class="comision-container" id="comision-box-${linkId}" style="font-size: 0.8em; color: ${comisionInicial > 0 ? '#28a745' : '#dc3545'}; display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                            <i class="fas fa-hand-holding-usd"></i> Comisión: 
                            <strong id="comision-val-${linkId}" class="valor-comision-fila">${formatMoney(comisionInicial)}</strong>
                        </div>
                    </td>

                    <td class="checkbox-cell" style="text-align:center; vertical-align:middle;">
                        <label class="custom-check-wrapper" title="Marcar para registrar">
                            <input type="checkbox" class="pago-grupal-check" 
                                id="check-${linkId}"
                                data-id-link="${linkId}" 
                                data-grupo-id="${grupoId}"
                                data-firestore-id="${cred.firestoreId}"
                                data-hist-id="${cred.historicalIdCredito}"
                                data-nombre="${cred.nombreCliente}"
                                checked
                                onchange="recalcularComision('${linkId}')">
                            <i class="fas fa-check-circle custom-check-icon"></i>
                        </label>
                    </td>
                </tr>
            `;
        });

        html += `</tbody>
                <tfoot style="background-color: #f1f3f5; font-weight: bold; border-top: 2px solid #dee2e6;">
                    <tr>
                        <td colspan="3" style="text-align: right; vertical-align: middle; color: #495057;">TOTALES ${grupo.toUpperCase()}:</td>
                        <td style="vertical-align: middle;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                                <span style="color: var(--primary);">Pagos: <span id="total-pagos-${grupoId}">$0.00</span></span>
                                <span style="color: #28a745;">Comisión: <span id="total-comis-${grupoId}">$0.00</span></span>
                            </div>
                        </td>
                        <td></td>
                    </tr>
                </tfoot>
            </table></div></div></div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.check-group-all').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const grp = e.target.getAttribute('data-grupo');
            const table = container.querySelector(`table[data-grupo-name="${grp}"]`);
            if(table) {
                table.querySelectorAll('.pago-grupal-check').forEach(cb => {
                    if (!cb.disabled) {
                        cb.checked = e.target.checked;
                        const idLink = cb.getAttribute('data-id-link');
                        recalcularComision(idLink); 
                    }
                });
            }
        });
    });

    grupos.forEach(grupo => {
        const grupoId = grupo.replace(/\s+/g, '_');
        recalcularTotalesGrupo(grupoId);
    });
}

//==============================================//
    // ** CALCULO DE COMISIONES EN COBRANZA **
//==============================================//
function recalcularComision(idLink) {
    const row = document.getElementById(`row-${idLink}`);
    if (!row) return;

    const select = row.querySelector('.pago-grupal-tipo');
    const inputMonto = row.querySelector('.pago-grupal-input');
    const checkbox = row.querySelector('.pago-grupal-check');
    const labelComision = document.getElementById(`comision-val-${idLink}`);
    const boxComision = document.getElementById(`comision-box-${idLink}`);
    const grupoId = row.getAttribute('data-grupo-id');
    const estado = (row.getAttribute('data-estado') || '').toLowerCase(); // Leemos el estado de la fila

    const tipo = select.value;
    const monto = parseFloat(inputMonto.value) || 0;
    const plazo = parseInt(row.getAttribute('data-plazo'));
    const isChecked = checkbox.checked;
    
    const pagoSemanalUnitario = parseFloat(inputMonto.getAttribute('data-pago-semanal')) || 0;
    const adelantoPrevio = parseFloat(inputMonto.getAttribute('data-adelanto-previo')) || 0;

    let comision = 0;
    let mensajeTooltip = "";

    // Control visual de habilitado/deshabilitado
    if (!isChecked) {
        row.style.opacity = '0.5';
        row.style.backgroundColor = '#f9f9f9';
        select.disabled = true;
        inputMonto.disabled = true;
    } else {
        row.style.opacity = '1';
        row.style.backgroundColor = '#fff';
        select.disabled = false;
        inputMonto.disabled = false;
    }

    // --- REGLAS DE NEGOCIO ---

    // 1. REGLA DE BLOQUEO POR ESTATUS (Prioridad Máxima)
    // Si NO está al corriente (ni liquidado/adelantado), la comisión es 0 SIEMPRE.
    const estatusPermiteComision = (estado === 'al corriente' || estado === 'adelantado' || estado === 'liquidado');

    if (!isChecked || monto <= 0 || plazo === 10 || pagoSemanalUnitario <= 0) {
        comision = 0;
    } 
    else if (!estatusPermiteComision) {
        comision = 0;
        mensajeTooltip = `Estatus '${estado.toUpperCase()}' no genera comisión.`;
    }
    else {
        // El cliente está al corriente, calculamos en base al dinero
        const totalConsiderado = monto + adelantoPrevio;
        
        // Calculamos cuántos pagos COMPLETOS se cubren
        // (Usamos 0.1 de tolerancia para decimales)
        const pagosCompletos = Math.floor((totalConsiderado + 0.1) / pagoSemanalUnitario);

        switch (tipo) {
            case 'normal':
            case 'adelanto':
                // Regla estándar: $10 por cada pago completo
                comision = pagosCompletos * 10;
                break;

            case 'actualizado': // Renovación
                // REGLA DE RENOVACIÓN (Nueva): 
                // Si cubre al menos 1 pago completo -> $10 fijos (no acumulables).
                // Si paga menos de 1 semana -> $0.
                if (pagosCompletos >= 1) {
                    comision = 10;
                } else {
                    comision = 0;
                }
                break;

            case 'extraordinario':
            case 'bancario':
                comision = 0;
                break;

            default:
                comision = 0;
        }
    }

    // Renderizar resultado
    labelComision.textContent = formatMoney(comision);
    
    if (comision > 0) {
        boxComision.style.color = '#28a745';
        labelComision.style.fontWeight = 'bold';
        labelComision.style.textDecoration = 'none';
        boxComision.title = "Comisión generada";
    } else {
        boxComision.style.color = '#dc3545'; // Rojo
        labelComision.style.fontWeight = 'normal';
        
        // Lógica visual para tachado (explicación del cero)
        if (isChecked && monto > 0 && plazo !== 10 && tipo !== 'bancario' && tipo !== 'extraordinario') {
             // Si el motivo es el estatus, se muestra en el tooltip
             // Si el motivo es falta de dinero, se indica también.
             labelComision.style.textDecoration = 'line-through';
             
             if (mensajeTooltip) {
                 boxComision.title = mensajeTooltip;
             } else {
                 const totalSuma = (monto + adelantoPrevio).toFixed(2);
                 boxComision.title = `Total (${totalSuma}) insuficiente para cubrir pago semanal (${pagoSemanalUnitario})`;
             }
        } else {
             labelComision.style.textDecoration = 'none';
             boxComision.title = "";
        }
    }

    if (grupoId) {
        recalcularTotalesGrupo(grupoId);
    }
}

//================================================//
    // **  CALCULAR TOTALES POR POBLACION ** //
//================================================//
function recalcularTotalesGrupo(grupoId) {
    const tabla = document.getElementById(`tabla-grupo-${grupoId}`);
    if (!tabla) return;

    let sumaPagos = 0;
    let sumaComisiones = 0;

    const filas = tabla.querySelectorAll('tbody tr.fila-cobro');

    filas.forEach(fila => {
        const checkbox = fila.querySelector('.pago-grupal-check');
        const inputMonto = fila.querySelector('.pago-grupal-input');
        const labelComision = fila.querySelector('.valor-comision-fila');

        if (checkbox && checkbox.checked && !checkbox.disabled) {
            const monto = parseFloat(inputMonto.value) || 0;
            const textoComision = labelComision.textContent.replace(/[^0-9.-]+/g, "");
            const comision = parseFloat(textoComision) || 0;

            sumaPagos += monto;
            sumaComisiones += comision;
        }
    });

    const spanPagos = document.getElementById(`total-pagos-${grupoId}`);
    const spanComis = document.getElementById(`total-comis-${grupoId}`);

    if (spanPagos) spanPagos.textContent = formatMoney(sumaPagos);
    if (spanComis) spanComis.textContent = formatMoney(sumaComisiones);
}

//===========================================//
    // **  GUARDAR COBRANZA CALCULADA ** //
//===========================================//
function handleGuardarCobranzaOffline() {
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const btnGuardar = document.getElementById('btn-guardar-cobranza-offline');

    if (!cobranzaRutaData || Object.keys(cobranzaRutaData).length === 0) {
        showStatus('status_pago_grupo', 'No hay datos de cobranza calculados para guardar.', 'warning');
        return;
    }
    if (!currentUserData || !currentUserData.ruta || !currentUserData.office) {
         showStatus('status_pago_grupo', 'Error: No se puede identificar la ruta u oficina del usuario...', 'error');
        return;
    }

    showButtonLoading(btnGuardar, true, 'Guardando...');
    try {
        const key = OFFLINE_STORAGE_KEY + currentUserData.ruta;
        const dataToSave = {
            ruta: currentUserData.ruta,
            office: currentUserData.office,
            timestamp: new Date().toISOString(),
            data: cobranzaRutaData
        };
        localStorage.setItem(key, JSON.stringify(dataToSave));
        showStatus('status_pago_grupo', `Lista de cobranza para ruta ${currentUserData.ruta} guardada localmente...`, 'success');
    } catch (error) {
        console.error("Error guardando cobranza offline:", error);
        showStatus('status_pago_grupo', `Error al guardar localmente: ${error.message}. Es posible que no haya suficiente espacio.`, 'error');
    } finally {
        showButtonLoading(btnGuardar, false);
    }
}

/// ================================================= ///
    /// SECCIÓN DE REPORTES GRÁFICOS (MODIFICADA) ///
/// ================================================= ///

//=================================//
    // ** GENERAR GRAFICO ** //
//=================================//
async function handleGenerarGrafico() {
    if (cargaEnProgreso) {
        showStatus('status_graficos', 'Ya hay una operación en progreso. Por favor, espera.', 'warning');
        return;
    }

    clearTimeout(inactivityTimer);
    
    cargaEnProgreso = true;
    showProcessingOverlay(true, 'Generando datos para el gráfico...');
    showButtonLoading('#btn-generar-grafico', true, 'Generando...');
    const statusGraficos = document.getElementById('status_graficos');
    const chartContainer = document.getElementById('grafico-container');
    chartContainer.innerHTML = '';

    try {
        const tipoReporte = document.getElementById('grafico_tipo_reporte').value;
        const fechaInicio = document.getElementById('grafico_fecha_inicio').value;
        const fechaFin = document.getElementById('grafico_fecha_fin').value;

        const oficinaSeleccionada = document.getElementById('grafico_sucursal').value;
        const esAdminConAccesoTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');

        const grupo = document.getElementById('grafico_grupo').value;
        const agruparPor = document.getElementById('grafico_agrupar_por').value;
        const tipoGrafico = document.getElementById('grafico_tipo_grafico').value;

        if (!tipoReporte || !fechaInicio || !fechaFin) {
            throw new Error("Por favor, selecciona el tipo de reporte y un rango de fechas.");
        }
        if (new Date(fechaInicio) > new Date(fechaFin)) {
            throw new Error("La fecha de inicio no puede ser posterior a la fecha de fin.");
        }

        statusGraficos.textContent = 'Obteniendo datos...';
        statusGraficos.className = 'status-message status-info';

        const { creditos, pagos } = await database.obtenerDatosParaGraficos({
            office: oficinaSeleccionada,
            grupo,
            fechaInicio,
            fechaFin,
            userOffice: esAdminConAccesoTotal ? null : currentUserData?.office
        });

        const colorPickers = document.querySelectorAll('#grafico-colores-container input[type="color"]');
        
        let coloresPersonalizados = [];
        if (colorPickers.length > 0) {
            colorPickers.forEach(picker => {
                coloresPersonalizados.push(picker.value);
            });
        }

        statusGraficos.textContent = 'Procesando datos para el gráfico...';

        let datasets = [];
        let labels = [];
        let labelPrefix = '';

        const colores = {
            GDL: coloresPersonalizados[0] || 'rgba(46, 139, 87, 0.7)',
            LEON: coloresPersonalizados[1] || 'rgba(30, 144, 255, 0.7)',
            GDL_border: coloresPersonalizados[0] || 'rgba(46, 139, 87, 1)',
            LEON_border: coloresPersonalizados[1] || 'rgba(30, 144, 255, 1)',
            RECUPERADO_GDL: coloresPersonalizados[2] || 'rgba(60, 179, 113, 0.7)',
            RECUPERADO_GDL_border: coloresPersonalizados[2] || 'rgba(60, 179, 113, 1)',
            RECUPERADO_LEON: coloresPersonalizados[3] || 'rgba(30, 144, 255, 0.5)',
            RECUPERADO_LEON_border: coloresPersonalizados[3] || 'rgba(30, 144, 255, 1)',
            default: coloresPersonalizados[0] || 'rgba(46, 139, 87, 0.7)',
            default_border: coloresPersonalizados[0] || 'rgba(46, 139, 87, 1)',
            default_recuperado: coloresPersonalizados[1] || 'rgba(60, 179, 113, 0.7)',
            default_recuperado_border: coloresPersonalizados[1] || 'rgba(60, 179, 113, 1)'
    };

        const agruparDatos = (data, campoFecha, campoValor, filtroOffice = null) => {
            const agrupados = {};
            const datosFiltrados = filtroOffice ? data.filter(item => item.office === filtroOffice) : data;

            datosFiltrados.forEach(item => {
                const fecha = parsearFecha(item[campoFecha]);
                if (!fecha || isNaN(fecha.getTime())) {
                    console.warn("Fecha inválida encontrada:", item[campoFecha], "en item:", item);
                    return;
                }
                let clave;
                const anio = fecha.getUTCFullYear();
                const mes = fecha.getUTCMonth();
                const dia = fecha.getUTCDate();

                if (agruparPor === 'anio') {
                    clave = `${anio}`;
                } else if (agruparPor === 'mes') {
                    clave = `${anio}-${String(mes + 1).padStart(2, '0')}`;
                } else { // semana
                    const fechaInicioSemana = new Date(Date.UTC(anio, mes, dia));
                    fechaInicioSemana.setUTCDate(fechaInicioSemana.getUTCDate() + 4 - (fechaInicioSemana.getUTCDay() || 7));
                    const inicioAnio = new Date(Date.UTC(anio, 0, 1));
                    const semana = Math.ceil((((fechaInicioSemana - inicioAnio) / 86400000) + 1) / 7);
                    clave = `${anio}-S${String(semana).padStart(2, '0')}`;
                }

                if (!agrupados[clave]) agrupados[clave] = 0;
                agrupados[clave] += parseFloat(item[campoValor] || 0);
            });
            return agrupados;
        };

        let dataToProcess = [];
        let campoFecha = '';
        let campoValor = '';
        let dataColocacion = [];
        let dataRecuperacion = [];
        if (tipoReporte === 'colocacion') {
            dataToProcess = creditos;
            campoFecha = 'fechaCreacion';
            campoValor = 'monto';
            labelPrefix = 'Monto Colocado';
        } else if (tipoReporte === 'recuperacion') {
            dataToProcess = pagos;
            campoFecha = 'fecha';
            campoValor = 'monto';
            labelPrefix = 'Monto Recuperado';
        } else if (tipoReporte === 'comportamiento') {
            labelPrefix = 'Monto por Tipo de Pago';
        } else if (tipoReporte === 'colocacion_vs_recuperacion') {
            dataColocacion = creditos;
            dataRecuperacion = pagos;
            labelPrefix = 'Monto';
        }

        if (tipoReporte === 'comportamiento') {
            const oficinasAProcesar = (oficinaSeleccionada === '') ? ['GDL', 'LEON'] : [oficinaSeleccionada];
            let datosAgrupados = {};
            oficinasAProcesar.forEach(suc => {
                const pagosSucursal = (oficinaSeleccionada === '') ? pagos.filter(p => p.office === suc) : pagos;
                pagosSucursal.forEach(pago => {
                    const tipo = (pago.tipoPago || 'normal').toLowerCase();
                    const clave = tipo.charAt(0).toUpperCase() + tipo.slice(1);
                    if (!datosAgrupados[clave]) datosAgrupados[clave] = {};
                    if (!datosAgrupados[clave][suc]) datosAgrupados[clave][suc] = 0;
                    datosAgrupados[clave][suc] += parseFloat(pago.monto || 0);
                });
            });
            labels = Object.keys(datosAgrupados).sort();
            datasets = oficinasAProcesar.map(suc => ({
                label: `${labelPrefix} (${suc})`,
                data: labels.map(label => datosAgrupados[label][suc] || 0),
                backgroundColor: colores[suc],
                borderColor: colores[`${suc}_border`],
                borderWidth: (tipoGrafico === 'line') ? 2 : 1,
                fill: (tipoGrafico === 'line') ? false : true,
                tension: (tipoGrafico === 'line') ? 0.1 : 0
            }));

        } else {
            if (oficinaSeleccionada === '') {
                
                if (tipoReporte === 'colocacion_vs_recuperacion') {
                    const colocadosGDL = agruparDatos(dataColocacion, 'fechaCreacion', 'monto', 'GDL');
                    const colocadosLEON = agruparDatos(dataColocacion, 'fechaCreacion', 'monto', 'LEON');
                    const recuperadosGDL = agruparDatos(dataRecuperacion, 'fecha', 'monto', 'GDL');
                    const recuperadosLEON = agruparDatos(dataRecuperacion, 'fecha', 'monto', 'LEON');
                    
                    labels = [...new Set([...Object.keys(colocadosGDL), ...Object.keys(colocadosLEON), ...Object.keys(recuperadosGDL), ...Object.keys(recuperadosLEON)])].sort();

                    datasets.push({
                        label: `Colocado (GDL)`,
                        data: labels.map(label => colocadosGDL[label] || 0),
                        backgroundColor: colores.GDL, borderColor: colores.GDL_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `Recuperado (GDL)`,
                        data: labels.map(label => recuperadosGDL[label] || 0),
                        backgroundColor: colores.RECUPERADO_GDL, borderColor: colores.RECUPERADO_GDL_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `Colocado (LEON)`,
                        data: labels.map(label => colocadosLEON[label] || 0),
                        backgroundColor: colores.LEON, borderColor: colores.LEON_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `Recuperado (LEON)`,
                        data: labels.map(label => recuperadosLEON[label] || 0),
                        backgroundColor: colores.RECUPERADO_LEON, borderColor: colores.RECUPERADO_LEON_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });

                } else {
                    const datosGDL = agruparDatos(dataToProcess, campoFecha, campoValor, 'GDL');
                    const datosLEON = agruparDatos(dataToProcess, campoFecha, campoValor, 'LEON');
                    labels = [...new Set([...Object.keys(datosGDL), ...Object.keys(datosLEON)])].sort();

                    datasets.push({
                        label: `${labelPrefix} (GDL)`,
                        data: labels.map(label => datosGDL[label] || 0),
                        backgroundColor: colores.GDL, borderColor: colores.GDL_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `${labelPrefix} (LEON)`,
                        data: labels.map(label => datosLEON[label] || 0),
                        backgroundColor: colores.LEON, borderColor: colores.LEON_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                }

            } else {
                
                if (tipoReporte === 'colocacion_vs_recuperacion') {
                    const colocados = agruparDatos(dataColocacion, 'fechaCreacion', 'monto');
                    const recuperados = agruparDatos(dataRecuperacion, 'fecha', 'monto');
                    labels = [...new Set([...Object.keys(colocados), ...Object.keys(recuperados)])].sort();

                    datasets.push({
                        label: `Colocado (${oficinaSeleccionada})`,
                        data: labels.map(label => colocados[label] || 0),
                        backgroundColor: colores.default, borderColor: colores.default_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                    datasets.push({
                        label: `Recuperado (${oficinaSeleccionada})`,
                        data: labels.map(label => recuperados[label] || 0),
                        backgroundColor: colores.default_recuperado, borderColor: colores.default_recuperado_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });

                } else {
                    const datosAgrupados = agruparDatos(dataToProcess, campoFecha, campoValor);
                    labels = Object.keys(datosAgrupados).sort();
                    datasets.push({
                        label: `${labelPrefix}${oficinaSeleccionada ? ` (${oficinaSeleccionada})` : ''}${grupo ? ` [${grupo}]` : ''}`,
                        data: labels.map(label => datosAgrupados[label]),
                        backgroundColor: colores.default, borderColor: colores.default_border,
                        borderWidth: (tipoGrafico === 'line') ? 2 : 1, fill: (tipoGrafico === 'line') ? false : true, tension: (tipoGrafico === 'line') ? 0.1 : 0
                    });
                }
            }
        }
       
        if ((tipoGrafico === 'pie' || tipoGrafico === 'doughnut') && datasets.length === 1) {
            datasets[0].backgroundColor = labels.map((_, index) => `hsl(${index * (360 / labels.length)}, 70%, 60%)`);
            datasets[0].borderColor = '#fff';
        }

        if (labels.length === 0) {
            statusGraficos.textContent = 'No se encontraron datos para graficar con los filtros seleccionados.';
            statusGraficos.className = 'status-message status-info';
            return;
        }

        const datosParaGrafico = { labels, datasets };

        chartContainer.innerHTML = '<canvas id="myChart"></canvas>';
        const ctx = document.getElementById('myChart').getContext('2d');

        if (currentChart) {
            currentChart.destroy();
        }

        currentChart = new Chart(ctx, {
            type: tipoGrafico,
            data: datosParaGrafico,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: `Gráfico de ${labelPrefix}` },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                const value = (tipoGrafico === 'pie' || tipoGrafico === 'doughnut') ? context.parsed : context.parsed.y;
                                if (value !== null) {
                                    label += new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: !(tipoGrafico === 'pie' || tipoGrafico === 'doughnut'),
                        title: { display: true, text: (tipoReporte === 'comportamiento') ? 'Tipo de Pago' : (agruparPor.charAt(0).toUpperCase() + agruparPor.slice(1)) }
                    },
                    y: {
                        display: !(tipoGrafico === 'pie' || tipoGrafico === 'doughnut'),
                        beginAtZero: true,
                        title: { display: true, text: 'Monto ($)' },
                        ticks: {
                            callback: function (value) {
                                return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
                            }
                        }
                    }
                }
            }
        });

        statusGraficos.textContent = 'Gráfico generado exitosamente.';
        statusGraficos.className = 'status-message status-success';

    } catch (error) {
        console.error("Error al generar el gráfico:", error);
        statusGraficos.textContent = `Error al generar gráfico: ${error.message}`;
        statusGraficos.className = 'status-message status-error';
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }
        chartContainer.innerHTML = '<p style="text-align: center; color: var(--danger);">No se pudo generar el gráfico.</p>';
    } finally {
        cargaEnProgreso = false;
        showProcessingOverlay(false);
        showButtonLoading('#btn-generar-grafico', false);
    }
}

/// ============================================================= ///
    /// NUEVA INTERFAZ DE GESTIÓN - CONFIGURACIÓN (REHECHA) ///
/// ============================================================= ///

//===============================================================//
    // ** CARGA LA CONFIGURACIÓN DE RUTAS Y POBLACIONES ** //
//===============================================================//
async function loadConfiguracion() {
    console.log("🚀 EJECUTANDO loadConfiguracion - INICIO");
    const statusEl = 'status_configuracion';
    
    if (!currentUserData || !['Super Admin', 'Gerencia', 'Administrador'].includes(currentUserData.role)) {
        showStatus(statusEl, 'No tienes permisos para acceder a esta sección.', 'error');
        return;
    }

    let officeFiltro = null;
    if (currentUserData.role === 'Administrador' && currentUserData.office && currentUserData.office !== 'AMBAS') {
        officeFiltro = currentUserData.office;
    }
    
    console.log(`📍 Filtro oficina: ${officeFiltro || 'TODAS'}`);
    showStatus(statusEl, 'Cargando catálogos...', 'info');

    try {
        console.log("📋 Cargando interfaz de poblaciones...");
        await cargarInterfazPoblaciones(officeFiltro);
        
        console.log("🛣️ Cargando interfaz de rutas...");
        await cargarInterfazRutas(officeFiltro);
        
        console.log("🔧 Configurando tabs...");
        setupNuevosTabsConfiguracion();
        
        showStatus(statusEl, '✅ Poblaciones y rutas cargadas correctamente', 'success');
        console.log("🎉 loadConfiguracion - COMPLETADO EXITOSAMENTE");
        
    } catch (error) {
        console.error("❌ Error en loadConfiguracion:", error);
        showStatus(statusEl, `❌ Error al cargar: ${error.message}`, 'error');
    }
}

//======================================================//
    // ** GENERA BOTONES DE POBLACIONES Y RUTAS ** //
//======================================================//
function setupNuevosTabsConfiguracion() {
    const tabsContainer = document.querySelector('#view-configuracion .tabs');
    if (tabsContainer) {
        const newTabsContainer = tabsContainer.cloneNode(true);
        tabsContainer.parentNode.replaceChild(newTabsContainer, tabsContainer);
    }

    document.querySelectorAll('#view-configuracion .tab-button').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('#view-configuracion .tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('#view-configuracion .tab-content').forEach(content => content.classList.remove('active'));
            
            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
    console.log("Listeners de Tabs de Configuración aplicados.");
}

// =============================================
// LÓGICA DE POBLACIONES
// =============================================

//===============================================//
    // ** CARGAR INTERFAZ DE POBLACIONES ** //
//===============================================//
async function cargarInterfazPoblaciones(officeFiltro) {
    const container = document.getElementById('tabla-poblaciones-container');
    if (!container) {
        console.error("No se encontró el contenedor de poblaciones");
        return;
    }

    console.log("=== DEBUG CARGAR POBLACIONES ===");
    console.log("Office filtro:", officeFiltro);
    
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div><p>Cargando poblaciones...</p></div>`;

    try {
        console.log("Llamando a database.obtenerPoblaciones...");
        const poblaciones = await database.obtenerPoblaciones(officeFiltro);
        console.log("Poblaciones obtenidas:", poblaciones);
        
        if (!poblaciones || !Array.isArray(poblaciones)) {
            throw new Error("Datos de poblaciones inválidos: " + typeof poblaciones);
        }

        console.log(`Se obtuvieron ${poblaciones.length} poblaciones`);
        
        const headerHTML = `
            <div class="config-header">
                <h3>Poblaciones (${poblaciones.length})</h3>
                <div class="header-actions">
                    <div class="search-box">
                        <input type="text" id="search-poblaciones" placeholder="Buscar población..." class="form-control">
                        <i class="fas fa-search"></i>
                    </div>
                    <button class="btn btn-success" onclick="mostrarModalPoblacion()">
                        <i class="fas fa-plus"></i> Nueva Población
                    </button>
                </div>
            </div>
        `;

        if (poblaciones.length === 0) {
            container.innerHTML = headerHTML + `
                <div class="empty-state">
                    <i class="fas fa-map-marker-alt"></i>
                    <h3>No hay poblaciones registradas</h3>
                    <p>No se encontraron poblaciones ${officeFiltro ? `para tu oficina (${officeFiltro})` : 'en el sistema'}.</p>
                </div>
            `;
            configurarBusquedaPoblaciones();
            return;
        }

        const poblacionesPorOficina = {};
        const oficinasAMostrar = [];

        if (officeFiltro) {
            poblacionesPorOficina[officeFiltro] = poblaciones;
            oficinasAMostrar.push(officeFiltro);
        } else {
            poblacionesPorOficina['GDL'] = poblaciones.filter(p => p.office === 'GDL');
            poblacionesPorOficina['LEON'] = poblaciones.filter(p => p.office === 'LEON');
            poblacionesPorOficina['OTROS'] = poblaciones.filter(p => p.office !== 'GDL' && p.office !== 'LEON');
            oficinasAMostrar.push('GDL', 'LEON', 'OTROS');
        }

        let html = headerHTML;
        
        if (!officeFiltro) {
            html += `
                <div class="filter-tabs">
                    <button class="filter-tab active" data-office="all">Todas</button>
                    <button class="filter-tab" data-office="GDL">Guadalajara</button>
                    <button class="filter-tab" data-office="LEON">León</button>
                    <button class="filter-tab" data-office="OTROS">Sin Asignar / Otros</button>
                </div>
            `;
        }
        
        html += `<div class="poblaciones-grid">`;

        for (const office of oficinasAMostrar) {
            const poblacionesOffice = poblacionesPorOficina[office];
            
            if (poblacionesOffice && poblacionesOffice.length > 0) {
                let officeTitle = office;
                if(office === 'OTROS') officeTitle = 'Sin Asignar / Otros';
                else if (office === 'GDL') officeTitle = 'Guadalajara';
                else if (office === 'LEON') officeTitle = 'León';

                html += `<div class="office-section" data-office="${office}">`;
                if (!officeFiltro) {
                    html += `<h4 class="office-title">${officeTitle} (${poblacionesOffice.length})</h4>`;
                }
                html += `<div class="poblaciones-list">`;
                
                poblacionesOffice.sort((a,b) => (a.nombre || '').localeCompare(b.nombre || ''));
                
                poblacionesOffice.forEach(poblacion => {
                    html += crearTarjetaPoblacion(poblacion);
                });
                
                html += `</div></div>`;
            }
        }

        html += `</div>`;
        container.innerHTML = html;

        configurarBusquedaPoblaciones();
        if (!officeFiltro) {
            configurarFiltrosPoblaciones();
        }

    } catch (error) {
        console.error("ERROR en cargarInterfazPoblaciones:", error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <h3>Error al cargar las poblaciones</h3>
                <p>${error.message}</p>
                <button class="btn btn-secondary" onclick="cargarInterfazPoblaciones('${officeFiltro}')">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }
}

//==============================================//
    // ** CREAR AL TARJETA DE POBLACION ** //
//==============================================//
function crearTarjetaPoblacion(poblacion) {
    const id = poblacion.id || 'ID_DESCONOCIDO';
    const nombre = poblacion.nombre || 'SIN NOMBRE';
    const office = poblacion.office || 'OTROS';
    const ruta = poblacion.ruta || '';

    const displayOffice = (office === 'GDL' || office === 'LEON') ? office : 'OTROS';

    const rutaDisplay = ruta
        ? `<span class="ruta-tag" title="Ruta asignada">${ruta}</span>`
        : `<span class="no-ruta-tag" title="Sin ruta asignada">Sin ruta</span>`;

    return `
        <div class="poblacion-card" data-id="${id}" data-office="${displayOffice}" data-nombre="${nombre.toLowerCase()}">
            <div class="poblacion-header">
                <h5 class="poblacion-nombre">${nombre}</h5>
                <span class="office-badge ${displayOffice}">${displayOffice}</span>
            </div>
            <div class="poblacion-content">
                <div class="ruta-asignacion">
                    ${rutaDisplay}
                </div>
            </div>
            <div class="poblacion-actions">
                <button class="btn btn-sm btn-outline-primary btn-asignar-ruta" 
                        data-id="${id}" 
                        data-nombre="${nombre}" 
                        data-office="${office}"
                        title="Asignar/Cambiar Ruta">
                    <i class="fas fa-route"></i> Asignar Ruta
                </button>
                <button class="btn btn-sm btn-outline-danger btn-eliminar-poblacion" 
                        data-id="${id}" 
                        data-nombre="${nombre}"
                        title="Eliminar Población">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

//=======================================================//
    // ** BUSQUEDA EN TIEMPO REAL DE POBLACIONES ** //
//=======================================================//
function configurarBusquedaPoblaciones() {
    const searchInput = document.getElementById('search-poblaciones');
    if (!searchInput) return;

    searchInput.replaceWith(searchInput.cloneNode(true));
    document.getElementById('search-poblaciones').addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const cards = document.querySelectorAll('#tab-poblaciones .poblacion-card');
        const activeFilter = document.querySelector('#tab-poblaciones .filter-tab.active')?.getAttribute('data-office') || 'all';
        
        let visibleCount = 0;
        cards.forEach(card => {
            const nombre = card.getAttribute('data-nombre');
            const office = card.getAttribute('data-office');
            const matchesSearch = !searchTerm || nombre.includes(searchTerm);
            const matchesFilter = activeFilter === 'all' || office === activeFilter;
            
            if (matchesSearch && matchesFilter) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        document.querySelectorAll('#tab-poblaciones .office-section').forEach(section => {
            const visibleCardsInSection = section.querySelectorAll('.poblacion-card[style*="display: flex"]').length;
            section.style.display = visibleCardsInSection > 0 ? 'block' : 'none';
        });
    });
}

//=========================================================//
    // ** FILTROS DE OFICINA PARA LAS POBLACIONES ** //
//=========================================================//
function configurarFiltrosPoblaciones() {
    document.querySelectorAll('#tab-poblaciones .filter-tab').forEach(tab => {
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        
        newTab.addEventListener('click', function() {
            document.querySelectorAll('#tab-poblaciones .filter-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const searchInput = document.getElementById('search-poblaciones');
            searchInput.dispatchEvent(new Event('input'));
        });
    });
}

// =============================================
// LÓGICA DE RUTAS
// =============================================

//===========================================//
    // ** CARGA LA INTERFAZ DE RUTAS ** //
//===========================================//
async function cargarInterfazRutas(officeFiltro) {
    const container = document.getElementById('tabla-rutas-container');
    if (!container) {
        console.error("No se encontró el contenedor de rutas");
        return;
    }

    console.log("=== DEBUG CARGAR RUTAS ===");
    console.log("Office filtro:", officeFiltro);
    
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div><p>Cargando rutas...</p></div>`;

    try {
        console.log("Llamando a database.obtenerRutas...");
        const rutas = await database.obtenerRutas(officeFiltro);
        console.log("Rutas obtenidas:", rutas);
        
        if (!rutas || !Array.isArray(rutas)) {
            throw new Error("Datos de rutas inválidos: " + typeof rutas);
        }

        console.log(`Se obtuvieron ${rutas.length} rutas`);
        
        const headerHTML = `
            <div class="config-header">
                <h3>Rutas (${rutas.length})</h3>
                <div class="header-actions">
                    <div class="search-box">
                        <input type="text" id="search-rutas" placeholder="Buscar ruta..." class="form-control">
                        <i class="fas fa-search"></i>
                    </div>
                    <button class="btn btn-success" onclick="mostrarModalRuta()">
                        <i class="fas fa-plus"></i> Nueva Ruta
                    </button>
                </div>
            </div>
        `;

        if (rutas.length === 0) {
            container.innerHTML = headerHTML + `
                <div class="empty-state">
                    <i class="fas fa-route"></i>
                    <h3>No hay rutas registradas</h3>
                    <p>No se encontraron rutas ${officeFiltro ? `para tu oficina (${officeFiltro})` : 'en el sistema'}.</p>
                </div>
            `;
            configurarBusquedaRutas();
            return;
        }

        const rutasPorOficina = {};
        const oficinasAMostrar = [];

        if (officeFiltro) {
            rutasPorOficina[officeFiltro] = rutas;
            oficinasAMostrar.push(officeFiltro);
        } else {
            rutasPorOficina['GDL'] = rutas.filter(r => r.office === 'GDL');
            rutasPorOficina['LEON'] = rutas.filter(r => r.office === 'LEON');
            rutasPorOficina['OTROS'] = rutas.filter(r => r.office !== 'GDL' && r.office !== 'LEON');
            oficinasAMostrar.push('GDL', 'LEON', 'OTROS');
        }

        let html = headerHTML + `<div class="rutas-grid">`;

        for (const office of oficinasAMostrar) {
            const rutasOffice = rutasPorOficina[office];
            
            if (rutasOffice && rutasOffice.length > 0) {
                let officeTitle = office;
                if(office === 'OTROS') officeTitle = 'Sin Asignar / Otros';
                else if (office === 'GDL') officeTitle = 'Guadalajara';
                else if (office === 'LEON') officeTitle = 'León';

                html += `<div class="office-section" data-office="${office}">`;
                if (!officeFiltro) {
                    html += `<h4 class="office-title">${officeTitle} (${rutasOffice.length})</h4>`;
                }
                html += `<div class="rutas-list">`;
                rutasOffice.sort((a,b) => (a.nombre || '').localeCompare(b.nombre || ''));
                
                rutasOffice.forEach(ruta => {
                    html += crearTarjetaRuta(ruta);
                });

                html += `</div>`;
                html += `</div>`;
            }
        }

        html += `</div>`;
        container.innerHTML = html;

        configurarBusquedaRutas();
        configurarEdicionRutas();
    
    } catch (error) {
        console.error("ERROR en cargarInterfazRutas:", error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <h3>Error al cargar las rutas</h3>
                <p>${error.message}</p>
                <button class="btn btn-secondary" onclick="cargarInterfazRutas('${officeFiltro}')">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }
}

//=============================================//
    // ** LISTENER DE BOTONES DE RUTAS ** //
//=============================================//
function configurarEdicionRutas() {
    document.querySelectorAll('#tab-rutas .btn-editar-ruta').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', function() {
            const card = this.closest('.ruta-card');
            const nombreElement = card.querySelector('.ruta-nombre-editable');
            const originalNombre = nombreElement.textContent.trim();
            
            card.querySelector('.btn-cancelar-ruta').setAttribute('data-original-nombre', originalNombre);

            nombreElement.contentEditable = true;
            nombreElement.classList.add('editing');
            nombreElement.focus();
            document.execCommand('selectAll',false,null);

            this.classList.add('hidden');
            card.querySelector('.btn-guardar-ruta').classList.remove('hidden');
            card.querySelector('.btn-cancelar-ruta').classList.remove('hidden');
            card.querySelector('.btn-outline-danger').classList.add('hidden');
        });
    });

    document.querySelectorAll('#tab-rutas .btn-cancelar-ruta').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', function() {
            const card = this.closest('.ruta-card');
            const nombreElement = card.querySelector('.ruta-nombre-editable');
            const originalNombre = this.getAttribute('data-original-nombre');
            
            nombreElement.textContent = originalNombre;
            nombreElement.contentEditable = false;
            nombreElement.classList.remove('editing');
            
            this.classList.add('hidden');
            card.querySelector('.btn-guardar-ruta').classList.add('hidden');
            card.querySelector('.btn-editar-ruta').classList.remove('hidden');
            card.querySelector('.btn-outline-danger').classList.remove('hidden');
        });
    });

    document.querySelectorAll('#tab-rutas .btn-guardar-ruta').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async function() {
            const card = this.closest('.ruta-card');
            const nombreElement = card.querySelector('.ruta-nombre-editable');
            const rutaId = card.getAttribute('data-id');
            const nuevoNombre = nombreElement.textContent.trim().toUpperCase();
            const originalNombre = card.querySelector('.btn-cancelar-ruta').getAttribute('data-original-nombre');

            if (!nuevoNombre) {
                showStatus('status_configuracion', 'El nombre de la ruta no puede estar vacío.', 'error');
                nombreElement.focus();
                return;
            }

            if (nuevoNombre === originalNombre.toUpperCase()) {
                card.querySelector('.btn-cancelar-ruta').click();
                return;
            }

            showProcessingOverlay(true, 'Actualizando ruta...');
            const resultado = await database.actualizarNombreRuta(rutaId, nuevoNombre);
            showProcessingOverlay(false);

            if (resultado.success) {
                showStatus('status_configuracion', 'Ruta actualizada. Se recargarán ambas listas.', 'success');
                await loadConfiguracion(); 
            } else {
                showStatus('status_configuracion', `Error: ${resultado.message}`, 'error');
                card.querySelector('.btn-cancelar-ruta').click();
            }
        });
    });
}

//=======================================//
    // ** CREA LA TARJETA DE RUTA ** //
//=======================================//
function crearTarjetaRuta(ruta) {
    const id = ruta.id || 'ID_DESCONOCIDO';
    const nombre = ruta.nombre || 'SIN NOMBRE';
    const office = ruta.office || 'OTROS';
    const displayOffice = (office === 'GDL' || office === 'LEON') ? office : 'OTROS';
    const nombreEscapado = String(nombre).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

    return `
        <div class="ruta-card" data-id="${id}" data-office="${displayOffice}" data-nombre="${nombre.toLowerCase()}">
            <div class="ruta-header">
                <div class="ruta-nombre-editable" contenteditable="false">${nombre}</div>
                <span class="office-badge ${displayOffice}">${displayOffice}</span>
            </div>
            <div class="ruta-actions">
                <button class="btn btn-sm btn-outline-info btn-editar-ruta" title="Editar Nombre">
                    <i class="fas fa-edit"></i> Editar
                </button>
                                <button class="btn btn-sm btn-outline-success btn-guardar-ruta hidden" title="Guardar">
                    <i class="fas fa-check"></i> Guardar
                </button>
                <button class="btn btn-sm btn-outline-secondary btn-cancelar-ruta hidden" title="Cancelar" data-original-nombre="${nombreEscapado}">
                    <i class="fas fa-times"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarRuta('${id}', '${nombreEscapado}', '${office}')" title="Eliminar Ruta">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

//====================================================//
    // ** BUSQUEDA EN TIEMPO REAL PARA RATUTAS ** //
//====================================================//
function configurarBusquedaRutas() {
    const searchInput = document.getElementById('search-rutas');
    if (!searchInput) return;
    
    searchInput.replaceWith(searchInput.cloneNode(true));
    document.getElementById('search-rutas').addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const cards = document.querySelectorAll('#tab-rutas .ruta-card');
        
        cards.forEach(card => {
            const nombre = card.getAttribute('data-nombre');
            const matchesSearch = !searchTerm || nombre.includes(searchTerm);
            card.style.display = matchesSearch ? 'flex' : 'none';
        });

        document.querySelectorAll('#tab-rutas .office-section').forEach(section => {
            const visibleCardsInSection = section.querySelectorAll('.ruta-card[style*="display: flex"]').length;
            section.style.display = visibleCardsInSection > 0 ? 'block' : 'none';
        });
    });
}

// =============================================
// LÓGICA DE MODALES Y ACCIONES (CRUD)
// =============================================

//==============================================//
    // ** MODAL PARA AGREGAR POBLACIONES ** //
//==============================================//
function mostrarModalPoblacion() {
    const userRole = currentUserData?.role;
    const userOffice = currentUserData?.office;
    const isAdminRestringido = (userRole === 'Administrador' && userOffice && userOffice !== 'AMBAS');
    
    let officeOptionsHTML = '';
    if (isAdminRestringido) {
        officeOptionsHTML = `<option value="${userOffice}" selected>${userOffice}</option>`;
    } else {
        officeOptionsHTML = `
            <option value="" selected disabled>Selecciona una oficina...</option>
            <option value="GDL">Guadalajara</option>
            <option value="LEON">León</option>
        `;
    }

    document.getElementById('modal-title').textContent = 'Nueva Población';
    document.getElementById('modal-body').innerHTML = `
        <form id="form-nueva-poblacion">
            <div class="form-group">
                <label for="modal-poblacion-nombre">Nombre de la Población:</label>
                <input type="text" id="modal-poblacion-nombre" class="form-control" required 
                       placeholder="Ej: Colonia Centro, Villa Jardín...">
            </div>
            <div class="form-group">
                <label for="modal-poblacion-office">Sucursal:</label>
                <select id="modal-poblacion-office" class="form-control" required ${isAdminRestringido ? 'disabled' : ''}>
                    ${officeOptionsHTML}
                </select>
            </div>
            <div class="modal-actions">
                <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Guardar</button>
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('generic-modal').classList.add('hidden')">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </form>
    `;
    
    const form = document.getElementById('form-nueva-poblacion');
    form.onsubmit = (e) => {
        e.preventDefault();
        agregarPoblacionDesdeModal();
    };
    
    document.getElementById('generic-modal').classList.remove('hidden');
    document.getElementById('modal-poblacion-nombre').focus();
}

//===========================================//
    // ** MODAL PARA AGREGAR UNA RUTA ** //
//===========================================//
function mostrarModalRuta() {
    const userRole = currentUserData?.role;
    const userOffice = currentUserData?.office;
    const isAdminRestringido = (userRole === 'Administrador' && userOffice && userOffice !== 'AMBAS');
    
    let officeOptionsHTML = '';
    if (isAdminRestringido) {
        officeOptionsHTML = `<option value="${userOffice}" selected>${userOffice}</option>`;
    } else {
        officeOptionsHTML = `
            <option value="" selected disabled>Selecciona una oficina...</option>
            <option value="GDL">Guadalajara</option>
            <option value="LEON">León</option>
        `;
    }

    document.getElementById('modal-title').textContent = 'Nueva Ruta';
    document.getElementById('modal-body').innerHTML = `
        <form id="form-nueva-ruta">
            <div class="form-group">
                <label for="modal-ruta-nombre">Nombre de la Ruta:</label>
                <input type="text" id="modal-ruta-nombre" class="form-control" required 
                       placeholder="Ej: Ruta Norte, Ruta Centro...">
            </div>
            <div class="form-group">
                <label for="modal-ruta-office">Sucursal:</label>
                <select id="modal-ruta-office" class="form-control" required ${isAdminRestringido ? 'disabled' : ''}>
                    ${officeOptionsHTML}
                </select>
            </div>
            <div class="modal-actions">
                <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Guardar</button>
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('generic-modal').classList.add('hidden')">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </form>
    `;
    
    const form = document.getElementById('form-nueva-ruta');
    form.onsubmit = (e) => {
        e.preventDefault();
        agregarRutaDesdeModal();
    };
    
    document.getElementById('generic-modal').classList.remove('hidden');
    document.getElementById('modal-ruta-nombre').focus();
}

//===========================================//
    // ** GUARDADO DE NUEVA POBLACION ** //
//===========================================//
async function agregarPoblacionDesdeModal() {
    const nombreInput = document.getElementById('modal-poblacion-nombre');
    const officeInput = document.getElementById('modal-poblacion-office');
    const nombre = nombreInput.value.trim();
    const office = officeInput.value;

    if (!nombre || !office) {
        alert('Por favor completa todos los campos');
        return;
    }

    showProcessingOverlay(true, 'Agregando población...');
    try {
        const resultado = await database.agregarPoblacion(nombre, office);
        
        if (resultado.success) {
            document.getElementById('generic-modal').classList.add('hidden');
            showStatus('status_configuracion', 'Población agregada correctamente', 'success');
            const officeFiltro = (currentUserData.role === 'Administrador' && currentUserData.office !== 'AMBAS') ? currentUserData.office : null;
            await cargarInterfazPoblaciones(officeFiltro);
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error agregando población:", error);
        alert(`Error: ${error.message}`);
    } finally {
        showProcessingOverlay(false);
    }
}

//======================================//
    // ** GUARDADO DE NUEVA RUTA ** //
//======================================//
async function agregarRutaDesdeModal() {
    const nombreInput = document.getElementById('modal-ruta-nombre');
    const officeInput = document.getElementById('modal-ruta-office');
    const nombre = nombreInput.value.trim();
    const office = officeInput.value;

    if (!nombre || !office) {
        alert('Por favor completa todos los campos');
        return;
    }

    showProcessingOverlay(true, 'Agregando ruta...');
    try {
        const resultado = await database.agregarRuta(nombre, office);
        
        if (resultado.success) {
            document.getElementById('generic-modal').classList.add('hidden');
            showStatus('status_configuracion', 'Ruta agregada correctamente', 'success');
            const officeFiltro = (currentUserData.role === 'Administrador' && currentUserData.office !== 'AMBAS') ? currentUserData.office : null;
            await cargarInterfazRutas(officeFiltro);
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error agregando ruta:", error);
        alert(`Error: ${error.message}`);
    } finally {
        showProcessingOverlay(false);
    }
}

//================================================//
    // ** ASIGNAR UNA RUTA A UNA POBLACION** //
//================================================//
async function asignarRutaPoblacion(poblacionId, poblacionNombre, poblacionOffice) {
    console.log("=== ASIGNAR RUTA POBLACIÓN ===");
    console.log("Población ID:", poblacionId);
    console.log("Población Nombre:", poblacionNombre);
    console.log("Población Office:", poblacionOffice);
    
    showProcessingOverlay(true, 'Cargando rutas disponibles...');
    try {
        const rutasDisponibles = await database.obtenerRutas(poblacionOffice);
        const opcionesRutas = rutasDisponibles.map(r => r.nombre).sort();

        let selectHTML = `
            <div class="asignacion-ruta-modal">
                <p>Asignar ruta a: <strong>${poblacionNombre}</strong> (${poblacionOffice})</p>
                
                <div class="form-group" style="text-align: left;">
                    <label for="ruta-poblacion-select">Selecciona la ruta:</label>
                    <select id="ruta-poblacion-select" class="form-control">
                        <option value="">-- Sin asignar --</option>
        `;

        opcionesRutas.forEach(rutaNombre => {
            selectHTML += `<option value="${rutaNombre}">${rutaNombre}</option>`;
        });

        selectHTML += `
                    </select>
                </div>
                
                <div class="modal-actions">
                    <button id="btn-confirmar-ruta-poblacion" class="btn btn-success">
                        <i class="fas fa-save"></i> Guardar
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('generic-modal').classList.add('hidden')">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        `;

        showProcessingOverlay(false);
        document.getElementById('modal-title').textContent = 'Asignar Ruta';
        document.getElementById('modal-body').innerHTML = selectHTML;
        document.getElementById('generic-modal').classList.remove('hidden');
        const btnConfirmar = document.getElementById('btn-confirmar-ruta-poblacion');
        btnConfirmar.replaceWith(btnConfirmar.cloneNode(true));
        const nuevoBtnConfirmar = document.getElementById('btn-confirmar-ruta-poblacion');
        nuevoBtnConfirmar.onclick = async () => {
            const nuevaRuta = document.getElementById('ruta-poblacion-select').value || null;
            showProcessingOverlay(true, 'Asignando ruta...');
            try {
                const resultado = await database.asignarRutaAPoblacion(poblacionId, nuevaRuta);
                if (resultado.success) {
                    document.getElementById('generic-modal').classList.add('hidden');
                    showStatus('status_configuracion', resultado.message, 'success');
                    const officeFiltro = (currentUserData.role === 'Administrador' && currentUserData.office !== 'AMBAS') ? currentUserData.office : null;
                    await cargarInterfazPoblaciones(officeFiltro);
                } else {
                    throw new Error(resultado.message);
                }
            } catch (error) {
                console.error("Error asignando ruta:", error);
                alert(`Error: ${error.message}`);
            } finally {
                showProcessingOverlay(false);
            }
        };
    } catch (error) {
        console.error("Error en asignarRutaPoblacion:", error);
        showProcessingOverlay(false);
        alert(`Error al cargar rutas: ${error.message}`);
    }
}

//=================================//
    // ** ELEGIR POBLACIÓN ** //
//=================================//
async function eliminarPoblacion(id, nombre) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la población "${nombre}"?\nEsta acción no se puede deshacer.`)) {
        return;
    }

    showProcessingOverlay(true, 'Eliminando población...');
    try {
        const resultado = await database.eliminarPoblacion(id);
        
        if (resultado.success) {
            showStatus('status_configuracion', `Población "${nombre}" eliminada correctamente`, 'success');
            const officeFiltro = (currentUserData.role === 'Administrador' && currentUserData.office !== 'AMBAS') ? currentUserData.office : null;
            await cargarInterfazPoblaciones(officeFiltro);
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error eliminando población:", error);
        showStatus('status_configuracion', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}

//==================================//
    // ** ELMIINAR UNA RUTA ** //
//==================================//
async function eliminarRuta(id, nombre, office) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la ruta "${nombre}"?\nEsta acción también la quitará de todas las poblaciones asignadas.`)) {
        return;
    }

    showProcessingOverlay(true, 'Eliminando ruta...');
    try {
        const resultado = await database.eliminarRuta(id, nombre, office);
        
        if (resultado.success) {
            showStatus('status_configuracion', `Ruta "${nombre}" eliminada y des-asignada.`, 'success');
            await loadConfiguracion(); 
        } else {
            throw new Error(resultado.message);
        }
    } catch (error) {
        console.error("Error eliminando ruta:", error);
        showStatus('status_configuracion', `Error: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
    }
}


//=================================//
    // ** FUNCION SHOWVIEW ** //
//=================================//
async function showView(viewId) {
    console.log(`🚀 Navegando a: ${viewId}`);
    
    // 1. Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
        view.style.display = 'none'; // Forzar ocultamiento visual
    });
    
    // 2. Mostrar la vista objetivo
    const targetView = document.getElementById(viewId);
    if (!targetView) {
        console.error(`❌ Error: No existe la vista con ID "${viewId}"`);
        const menu = document.getElementById('view-main-menu');
        if (menu) {
            menu.classList.remove('hidden');
            menu.style.display = 'block';
        }
        return;
    }
    
    targetView.classList.remove('hidden');
    targetView.style.display = 'block';
    
    // Scroll al inicio para mejorar UX
    window.scrollTo(0, 0);

    console.log(`✅ Vista ${viewId} mostrada.`);
    
    // --- HELPER LOCAL PARA OBTENER FECHA "HOY" ---
    const obtenerFechaLocalYMD = () => {
        const ahora = new Date();
        const offset = ahora.getTimezoneOffset() * 60000;
        const local = new Date(ahora.getTime() - offset);
        return local.toISOString().split('T')[0];
    };

    try {
        switch(viewId) {
            
            // --- NUEVO: GESTIÓN DE CLIENTES (CARGA EN MEMORIA) ---
            case 'view-gestion-clientes':
                // 1. Inicialización estándar
                inicializarVistaGestionClientes();
                
                // 2. Filtros de Oficina (si aplica)
                const officeCli = (currentUserData?.office && currentUserData?.office !== 'AMBAS') ? currentUserData.office : '';
                if(typeof _actualizarDropdownGrupo === 'function') {
                    _actualizarDropdownGrupo('grupo_filtro', officeCli, 'Todos');
                }

                // 3. CARGA DE DATOS PARA BÚSQUEDA OFFLINE (VITAL)
                if (typeof cargarDatosGestionClientes === 'function') {
                    // Esto lee el disco y llena la variable global 'carteraGlobalCache'
                    await cargarDatosGestionClientes(); 
                } else {
                    console.warn("⚠️ Falta la función cargarDatosGestionClientes en app.js");
                }
                break;

            case 'view-configuracion':
                await loadConfiguracion();
                break;
                
            case 'view-reportes':
                loadBasicReports(currentUserData?.office);
                break;
                
            case 'view-reportes-avanzados':
                inicializarVistaReportesAvanzados();
                const officeAdv = (currentUserData?.office && currentUserData?.office !== 'AMBAS') ? currentUserData.office : '';
                if(typeof _actualizarDropdownGrupo === 'function') {
                    await _actualizarDropdownGrupo('grupo_filtro_reporte', officeAdv, 'Todos');
                }
                if(typeof popularDropdown === 'function') {
                    const rutasRep = (await database.obtenerRutas(officeAdv)).map(r => r.nombre).sort();
                    popularDropdown('ruta_filtro_reporte', rutasRep, 'Todas');
                }
                break;
                
            case 'view-cliente':
                if (!editingClientId) { 
                    resetClientForm(); 
                } else {
                    const officeSelect = document.getElementById('office_cliente');
                    if(officeSelect && typeof handleOfficeChangeForClientForm === 'function') {
                        handleOfficeChangeForClientForm.call(officeSelect);
                    }
                }
                break;

            case 'view-pago-grupo':
                console.log("⚡ Ejecutando inicialización de Pago Grupal...");
                if(typeof inicializarVistaPagoGrupal === 'function') {
                    await inicializarVistaPagoGrupal(); 
                } else {
                    console.error("❌ Error: No se encuentra la función inicializarVistaPagoGrupal");
                }
                break;

            case 'view-hoja-corte':
                await inicializarVistaHojaCorte();
                break;

            case 'view-reportes-graficos':
                if(document.getElementById('grafico_fecha_inicio')) {
                    // Calcular fechas locales
                    const hoyDate = new Date();
                    const offset = hoyDate.getTimezoneOffset() * 60000;
                    const hoyLocal = new Date(hoyDate.getTime() - offset);
                    
                    const haceMesDate = new Date();
                    haceMesDate.setMonth(haceMesDate.getMonth() - 1);
                    const haceMesLocal = new Date(haceMesDate.getTime() - offset);

                    document.getElementById('grafico_fecha_inicio').value = haceMesLocal.toISOString().split('T')[0];
                    document.getElementById('grafico_fecha_fin').value = hoyLocal.toISOString().split('T')[0];
                    
                    const officeGraf = (currentUserData?.office && currentUserData?.office !== 'AMBAS') ? currentUserData.office : '';
                    if(typeof handleSucursalGraficoChange === 'function') {
                        handleSucursalGraficoChange.call(document.getElementById('grafico_sucursal') || { value: officeGraf });
                    }
                    
                    if (window.currentChart) {
                        window.currentChart.destroy();
                        window.currentChart = null;
                    }
                    const chartContainer = document.getElementById('grafico-container');
                    if(chartContainer) chartContainer.innerHTML = '';
                    showStatus('status_graficos', 'Selecciona los filtros y genera un gráfico.', 'info');
                }
                break;
                
            case 'view-gestion-efectivo':
                await loadGestionEfectivo();
                break;
                
            case 'view-reporte-contable':
                await inicializarVistaReporteContable();
                break;

            case 'view-colocacion':
                const formCol = document.getElementById('form-colocacion');
                if(formCol) formCol.classList.add('hidden');
                const inputCurp = document.getElementById('curp_colocacion');
                if(inputCurp) inputCurp.value = '';
                showStatus('status_colocacion', 'Ingresa la CURP del cliente para buscar.', 'info');
                break;

            case 'view-cobranza':
                const formCob = document.getElementById('form-cobranza');
                if(formCob) formCob.classList.add('hidden');
                const inputId = document.getElementById('idCredito_cobranza');
                if(inputId) inputId.value = '';
                showStatus('status_cobranza', 'Ingresa el ID del crédito (histórico) para buscar.', 'info');
                window.creditoActual = null;
                break;

            case 'view-usuarios':
                inicializarVistaUsuarios();
                break;

            case 'view-multicreditos':
                // PROTECCIÓN ROL
                if (currentUserData.role === 'Área comercial') {
                    alert("No tienes permiso para ver esta sección.");
                    showView('view-main-menu');
                    return;
                }
                inicializarVistaMulticreditos();
                break;
                
            default:
                break;
        }
    } catch (error) {
        console.error(`❌ Error crítico al inicializar la vista ${viewId}:`, error);
        showStatus('connection-status', `Error al cargar la vista: ${error.message}`, 'error');
    }
}

//=================================//
    // ** MOSTRAR STATUS** //
//=================================//
function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message;
        element.classList.remove('status-success', 'status-error', 'status-info', 'status-warning', 'hidden');
        if (type === 'success') element.classList.add('status-success');
        else if (type === 'error') element.classList.add('status-error');
        else if (type === 'warning') element.classList.add('status-warning');
        else element.classList.add('status-info');

        if (type === 'success') {
            setTimeout(() => {
                if (element.innerHTML === message && element.classList.contains('status-success')) {
                    element.classList.add('hidden');
                }
            }, 5000);
        }
    } else {
        console.warn(`Elemento de estado con ID "${elementId}" no encontrado.`);
    }
}

//=================================//
    // ** PRECESANDO OVERLAY ** //
//=================================//
function showProcessingOverlay(show, message = 'Procesando...') {
    if (show && typeof resetInactivityTimer === 'function') {
        resetInactivityTimer();
    }
    let overlay = document.getElementById('processing-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'processing-overlay';
        overlay.className = 'processing-overlay hidden';
        overlay.innerHTML = `<div class="processing-spinner"></div><div id="processing-message" class="processing-message"></div>`;
        document.body.appendChild(overlay);
    }
    const messageElement = document.getElementById('processing-message');

    if (show) {
        if (messageElement) messageElement.textContent = message;
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showButtonLoading(selector, show, loadingText = '') {
    const button = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if (!button || button.tagName !== 'BUTTON') {
        console.warn("showButtonLoading: Selector no es un botón:", selector);
        return;
    }

    if (show) {
        if (!button.hasAttribute('data-original-text')) {
            button.setAttribute('data-original-text', button.innerHTML);
        }
        button.innerHTML = `<span class="btn-spinner"></span> ${loadingText}`;
        button.classList.add('btn-loading');
        button.disabled = true;
    } else {
        const originalText = button.getAttribute('data-original-text');
        if (originalText !== null) {
            button.innerHTML = originalText;
            button.removeAttribute('data-original-text');
        }
        button.classList.remove('btn-loading');
        button.disabled = false;
    }
}

// =============================================
// FUNCIONES DE BARRA DE PROGRESO Y UTILIDADES
// =============================================


//=================================//
    // ** BARRA DE CARGA ** //
//=================================//
function showFixedProgress(percentage, message = '') {
    if (typeof resetInactivityTimer === 'function') resetInactivityTimer();

    let progressContainer = document.getElementById('progress-container-fixed');
    
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'progress-container-fixed';
        progressContainer.className = 'hidden';
        
        progressContainer.innerHTML = `
            <div class="progress-content-wrapper">
                <div id="progress-text-fixed" class="progress-text-fixed">Iniciando...</div>
                <div class="progress-bar-background">
                    <div id="progress-bar-fixed" class="progress-bar-fixed" style="width: 0%;"></div>
                </div>
            </div>
            <button id="btn-cancelar-carga-fixed" class="btn-cancelar-carga-fixed" title="Detener operación">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.insertBefore(progressContainer, document.body.firstChild);
        
        document.getElementById('btn-cancelar-carga-fixed').addEventListener('click', cancelarCarga);
    }

    const progressBar = document.getElementById('progress-bar-fixed');
    const progressText = document.getElementById('progress-text-fixed');
    
    const validPercentage = Math.max(0, Math.min(100, percentage));
    
    if (progressBar) progressBar.style.width = validPercentage + '%';
    if (progressText) progressText.textContent = `${message} (${validPercentage.toFixed(0)}%)`;
    
    progressContainer.classList.remove('hidden');
    progressContainer.classList.add('visible');
    document.body.classList.add('has-progress');
}

//=======================================//
    // ** OCULTAR BARRA DE PROGRESO ** 
//=======================================//
function hideFixedProgress() {
    const progressContainer = document.getElementById('progress-container-fixed');
    if (progressContainer) {
        progressContainer.classList.remove('visible');
        progressContainer.classList.add('hidden');
        setTimeout(() => {
            const pb = document.getElementById('progress-bar-fixed');
            if(pb) pb.style.width = '0%';
        }, 300);
    }
    document.body.classList.remove('has-progress');
}

//============================//
    // ** CANCELAR CARGA** 
//============================//
function cancelarCarga(e) {
    if(e) e.preventDefault();

    if (!cargaEnProgreso) {
        hideFixedProgress();
        return;
    }

    console.warn("🛑 FUERZA BRUTA: Cancelando operación...");

    // 1. CAMBIAR TOKEN (Rompe el bucle lógico)
    currentSearchOperation = Date.now(); 
    
    // 2. DESBLOQUEO INMEDIATO DE UI (No esperar al finally)
    cargaEnProgreso = false;
    
    hideFixedProgress();
    showProcessingOverlay(false);
    
    // Restaurar TODOS los botones de carga inmediatamente
    document.querySelectorAll('.btn-loading').forEach(btn => {
        // Restaurar texto original si existe
        const originalText = btn.getAttribute('data-original-text');
        if (originalText) {
            btn.innerHTML = originalText;
            btn.removeAttribute('data-original-text');
        }
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    });

    // Mostrar mensaje visual en la tabla
    const tbody = document.getElementById('tabla-clientes');
    if(tbody) {
        // Si la tabla estaba vacía o cargando, mostramos mensaje
        if (tbody.rows.length < 2 || tbody.innerHTML.includes('Buscando')) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#dc3545; font-weight:bold;">🚫 Operación cancelada.</td></tr>';
        }
    }
    
    showStatus('status_gestion_clientes', 'Operación detenida manualmente.', 'warning');
}

//===========================================================//
    // ** CÁLCULO DE MONTO TOTAL BASADO EN EL PLAZO ** //
//===========================================================//
function calcularMontoTotalColocacion() {
    const montoInput = document.getElementById('monto_colocacion');
    const plazoInput = document.getElementById('plazo_colocacion');
    const montoTotalInput = document.getElementById('montoTotal_colocacion');
    if (!montoInput || !montoTotalInput || !plazoInput) return;

    const monto = parseFloat(montoInput.value) || 0;
    const plazo = parseInt(plazoInput.value) || 0;

    let interesRate = 0;
    if (plazo === 14) interesRate = 0.40;
    else if (plazo === 13) interesRate = 0.30;
    else if (plazo === 10) interesRate = 0.00;

    const montoTotal = monto * (1 + interesRate);

    montoTotalInput.value = (monto > 0 && plazo > 0)
        ? `$${montoTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '';

    const fieldNote = montoTotalInput.nextElementSibling;
    if (fieldNote && fieldNote.classList.contains('field-note')) {
        fieldNote.textContent = `Incluye ${interesRate * 100}% de interés`;
    }
}


function validarCURP(inputElement) {
    if (!inputElement) return;
    inputElement.value = inputElement.value.toUpperCase().substring(0, 18);

    if (inputElement.value.length === 0) {
        inputElement.classList.remove('input-error', 'input-success');
    } else if (validarFormatoCURP(inputElement.value)) {
        inputElement.classList.remove('input-error');
        inputElement.classList.add('input-success');
    } else {
        inputElement.classList.remove('input-success');
        inputElement.classList.add('input-error');
    }
}

//==========================================//
    // ** VAIDAR FORMATO DE LA CURP ** //
//==========================================//
function validarFormatoCURP(curp) {
    const curpRegex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
    return typeof curp === 'string' && curp.length === 18 && curpRegex.test(curp.toUpperCase());
}

const popularDropdown = (elementId, options, placeholder, isObjectValueKey = false) => {
    const select = document.getElementById(elementId);
    if (!select) {
        console.warn(`Dropdown con ID "${elementId}" no encontrado.`);
        return;
    }
    const selectedValue = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(option => {
        const optionElement = document.createElement('option');
        if (isObjectValueKey) {
            optionElement.value = option.value;
            optionElement.textContent = option.text;
        } else {
            optionElement.value = option;
            optionElement.textContent = option;
        }
        select.appendChild(optionElement);
    });
    if (Array.from(select.options).some(opt => opt.value === selectedValue)) {
        select.value = selectedValue;
    } else {
        select.value = "";
    }

    console.log(`Dropdown ${elementId} actualizado con ${options?.length || 0} opciones`);
};

//=============================================//
    // ** MANEJAR EL CAMBIO DE OFICINA ** //
//=============================================//
async function handleOfficeChangeForClientForm() {
    const office = this.value || document.getElementById('office_cliente')?.value;
    console.log(`handleOfficeChangeForClientForm: Office = ${office}`);
    const rutaSelect = document.getElementById('ruta_cliente');
    const poblacionSelect = document.getElementById('poblacion_grupo_cliente');
    if (!rutaSelect || !poblacionSelect) return;
    const userRole = currentUserData?.role;
    const userRuta = currentUserData?.ruta;
    const esAreaComercialConRuta = (userRole === 'Área comercial' && userRuta);
    poblacionSelect.innerHTML = '<option value="">Cargando poblaciones...</option>';
    rutaSelect.innerHTML = '<option value="">Cargando rutas...</option>';

    try {
     
        if (editingClientId) {
            console.log("Modo EDICIÓN: Cargando todas las poblaciones y rutas.");
            const [todasPoblacionesDB, todasRutasDB] = await Promise.all([
                database.obtenerPoblaciones(),
                database.obtenerRutas()
            ]);
            const todasPoblacionesNombres = [...new Set(todasPoblacionesDB.map(p => p.nombre))].sort();
            const todasRutasNombres = [...new Set(todasRutasDB.map(r => r.nombre))].sort();

            popularDropdown('poblacion_grupo_cliente', todasPoblacionesNombres, 'Selecciona población/grupo');
            popularDropdown('ruta_cliente', todasRutasNombres, 'Selecciona una ruta');
            
            rutaSelect.disabled = false; 
            
            return; 
        }
        
        const poblacionesDeOficina = await database.obtenerPoblaciones(office);
        
        if (esAreaComercialConRuta) {
            console.log(`Modo NUEVO (Área Comercial): Filtrando por ruta ${userRuta}`);   
            const poblacionesFiltradas = poblacionesDeOficina
                .filter(p => p.ruta === userRuta)
                .map(p => p.nombre)
                .sort();

            if (poblacionesFiltradas.length === 0) {
                 console.warn(`El usuario de Área Comercial no tiene poblaciones asignadas a su ruta '${userRuta}' en la oficina '${office}'.`);
                 showStatus('status_cliente', `Advertencia: No hay poblaciones asignadas a tu ruta (${userRuta}) en esta oficina. Contacta a un administrador.`, 'warning');
            }

            popularDropdown('poblacion_grupo_cliente', poblacionesFiltradas, 'Selecciona población de tu ruta');
            popularDropdown('ruta_cliente', [userRuta], userRuta);
            
            rutaSelect.value = userRuta;
            rutaSelect.disabled = true;

        } else {
            
            console.log("Modo NUEVO (Admin/Otros): Cargando todas las rutas y poblaciones de la oficina.");
            const rutasDeOficina = await database.obtenerRutas(office);
            const poblacionesNombres = poblacionesDeOficina.map(p => p.nombre).sort();
            const rutasNombres = rutasDeOficina.map(r => r.nombre).sort();

            popularDropdown('poblacion_grupo_cliente', poblacionesNombres, 'Selecciona población/grupo');
            popularDropdown('ruta_cliente', rutasNombres, 'Selecciona una ruta');  
            rutaSelect.disabled = false;
        }

    } catch (error) {
        console.error('Error en handleOfficeChangeForClientForm:', error);
        showStatus('status_cliente', 'Error al cargar poblaciones o rutas.', 'error');
        popularDropdown('poblacion_grupo_cliente', [], 'Error al cargar');
        popularDropdown('ruta_cliente', [], 'Error al cargar');
    }
}

//=======================================================//
    // ** CAMBIO DE OFICINA EN REPORTES GRAFICOS ** //
//=======================================================//
async function handleSucursalGraficoChange() {
    const office = this.value;

    const poblaciones = await database.obtenerPoblaciones(office || null);
    const poblacionesNombres = [...new Set(poblaciones.map(p => p.nombre))].sort();

    popularDropdown('grafico_grupo', poblacionesNombres, 'Todos');
}

//===========================================//
    // ** CARGA DE RUTAS POR OFICINA ** //
//===========================================//
async function _cargarRutasParaUsuario(office) {
    const rutaSelect = document.getElementById('nuevo-ruta');
    if (!rutaSelect) return;

    rutaSelect.innerHTML = '<option value="">Cargando rutas...</option>';
    rutaSelect.disabled = true;

    try {
        if (office === 'AMBAS' || !office) {
            popularDropdown('nuevo-ruta', [], '-- Sin asignar --');
            rutaSelect.disabled = true;
            return;
        }

        const rutas = await database.obtenerRutas(office);
        const rutasNombres = rutas.map(r => r.nombre).sort();
        popularDropdown('nuevo-ruta', rutasNombres, '-- Sin asignar --');
        rutaSelect.disabled = false;

    } catch (error) {
        console.error("Error cargando rutas para usuario:", error);
        popularDropdown('nuevo-ruta', [], 'Error al cargar');
    }
}

//==========================================================//
    // ** INICIALIZA DROPDOWNS DINAMICO Y ESTATICOS ** //
//==========================================================//
async function inicializarDropdowns() {
    console.log('===> Inicializando dropdowns ESTÁTICOS...');
    
    try {
        const tiposCredito = ['NUEVO', 'RENOVACION', 'REINGRESO'];
        const montos = [3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000];
        const plazosCredito = [10, 13, 14].sort((a, b) => a - b);
        const estadosCredito = ['al corriente', 'atrasado', 'cobranza', 'juridico', 'liquidado'];
        
        // --- ACTUALIZADO: NUEVOS TIPOS DE PAGO ---
        const tiposPago = ['normal', 'adelanto', 'extraordinario', 'actualizado', 'bancario'];
        // -----------------------------------------

        const roles = [
            { value: 'Super Admin', text: 'Super Admin' },
            { value: 'Gerencia', text: 'Gerencia' },
            { value: 'Administrador', text: 'Administrador' },
            { value: 'Área comercial', text: 'Área comercial' }
        ];
        const tiposReporteGrafico = [
            { value: 'colocacion', text: 'Colocación (Monto)' },
            { value: 'recuperacion', text: 'Recuperación (Pagos)' },
            { value: 'comportamiento', text: 'Comportamiento de Pago (Tipos)' },
            { value: 'colocacion_vs_recuperacion', text: 'Colocación vs. Recuperación' }
        ];

        // --- Dropdowns estáticos ---
        popularDropdown('tipo_colocacion', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Selecciona tipo', true);
        popularDropdown('monto_colocacion', montos.map(m => ({ value: m, text: `$${m.toLocaleString()}` })), 'Selecciona monto', true);
        popularDropdown('plazo_colocacion', plazosCredito.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
        popularDropdown('tipo_colocacion_filtro', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
        popularDropdown('plazo_filtro', plazosCredito.map(p => ({ value: p, text: `${p} semanas` })), 'Todos', true);
        popularDropdown('estado_credito_filtro', estadosCredito.map(e => ({ value: e, text: e.charAt(0).toUpperCase() + e.slice(1) })), 'Todos', true);
        popularDropdown('filtro-rol-usuario', roles, 'Todos los roles', true);
        popularDropdown('nuevo-rol', roles, 'Seleccione un rol', true);
        popularDropdown('tipo_credito_filtro_reporte', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
        popularDropdown('estado_credito_filtro_reporte', estadosCredito.map(e => ({ value: e, text: e.toUpperCase() })), 'Todos', true);
        
        // Dropdown de Tipos de Pago (Reportes)
        popularDropdown('tipo_pago_filtro_reporte', tiposPago.map(t => ({ value: t, text: t.toUpperCase() })), 'Todos', true);
        
        popularDropdown('grafico_tipo_reporte', tiposReporteGrafico, 'Selecciona un reporte', true);

        // --- Dropdowns dinámicos (vacíos inicialmente) ---
        popularDropdown('poblacion_grupo_cliente', [], 'Selecciona población/grupo');
        popularDropdown('ruta_cliente', [], 'Selecciona una ruta');
        popularDropdown('ruta_filtro_reporte', [], 'Todos');
        popularDropdown('nuevo-ruta', [], '-- Sin asignar --');
        popularDropdown('grupo_filtro', [], 'Todos');
        popularDropdown('grupo_filtro_reporte', [], 'Todos');
        popularDropdown('grafico_grupo', [], 'Todos');

        console.log('===> Dropdowns ESTATICOS inicializados correctamente');

    } catch (error) {
        console.error('Error inicializando dropdowns estáticos:', error);
    }
}

//===============================================//
    // ** HABILITAR PLAZO DE 13 SEMANAS ** //
//===============================================//
function actualizarPlazosSegunCliente(esComisionista, esRenovacion) {
    const plazoSelect = document.getElementById('plazo_colocacion');
    if(!plazoSelect) return;

    let plazos = [];

    // 1. Regla Comisionista (10)
    if (esComisionista) {
        plazos.push(10);
    }

    // 2. Regla General (14)
    plazos.push(14);

    // 3. REGLA 13 SEMANAS (GLOBAL)
    // Verificamos la variable en memoria que cargamos al inicio
    console.log("🔍 Verificando oferta 13 semanas. Estado Global:", configSistema.oferta13Semanas);
    
    if (configSistema && configSistema.oferta13Semanas === true) {
        plazos.push(13);
    }

    // Ordenar y Renderizar
    plazos.sort((a, b) => a - b);
    popularDropdown('plazo_colocacion', plazos.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
}

//=====================================//
    // ** MANEJO DE DUPLICADOS ** //
//=====================================//
async function handleVerificarDuplicados() {
    showProcessingOverlay(true, 'Buscando clientes duplicados (por CURP + Oficina)...');
    showButtonLoading('#btn-verificar-duplicados', true);
    const statusUsuarios = document.getElementById('status_usuarios');
    statusUsuarios.textContent = 'Buscando duplicados...';
    statusUsuarios.className = 'status-message status-info';

    try {
        const resultado = await database.encontrarClientesDuplicados();
        if (!resultado.success) throw new Error(resultado.message);

        const { idsParaEliminar, duplicadosEncontrados, curpsAfectadas } = resultado;

        if (idsParaEliminar.length === 0) {
            showStatus('status_usuarios', '¡Verificación completa! No se encontraron clientes duplicados (misma CURP y Oficina).', 'success');
        } else {
            const confirmacion = confirm(
                `Se encontraron ${duplicadosEncontrados} registros duplicados (clientes con misma CURP y Oficina).\n` +
                `CURPs afectadas: ${curpsAfectadas.join(', ')}\n\n` +
                `Se conservará el registro más reciente de cada grupo duplicado y se eliminarán los ${idsParaEliminar.length} registros más antiguos.\n\n` +
                `¿Deseas proceder con la limpieza? Esta acción no se puede deshacer.`
            );

            if (confirmacion) {
                showProcessingOverlay(true, `Eliminando ${idsParaEliminar.length} registros duplicados...`);
                statusUsuarios.textContent = 'Eliminando duplicados...';
                const resEliminacion = await database.ejecutarEliminacionDuplicados(idsParaEliminar);
                if (resEliminacion.success) {
                    showStatus('status_usuarios', resEliminacion.message, 'success');
                    await loadUsersTable();
                } else {
                    throw new Error(resEliminacion.message);
                }
            } else {
                showStatus('status_usuarios', 'Operación de limpieza de duplicados cancelada por el usuario.', 'info');
            }
        }
    } catch (error) {
        console.error("Error al verificar/eliminar duplicados:", error);
        showStatus('status_usuarios', `Error durante la verificación/eliminación de duplicados: ${error.message}`, 'error');
    } finally {
        showProcessingOverlay(false);
        showButtonLoading('#btn-verificar-duplicados', false);
    }
}

//===========================================//
    // ** MOSTRAR HISTORIAL DE PAGOS ** //
//===========================================//
async function mostrarHistorialPagos(historicalIdCredito, office) {
    const modal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalTitle || !modalBody) {
        console.error("Elementos del modal no encontrados.");
        alert("Error al intentar mostrar el historial. Faltan elementos en la página.");
        return;
    }

    modalTitle.textContent = `Historial de Pagos (Crédito: ${historicalIdCredito} - Suc: ${office})`;
    modalBody.innerHTML = '<div class="spinner" style="margin: 20px auto; border-top-color: var(--primary);"></div><p style="text-align: center;">Cargando historial...</p>';
    modal.classList.remove('hidden');

    try {
        const creditos = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { office: office });
        if (creditos.length === 0) {
            throw new Error(`No se encontró el crédito con ID histórico ${historicalIdCredito} en la sucursal ${office}.`);
        }
        creditos.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
        const credito = creditos[0];
        const creditoJsonString = JSON.stringify(credito).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        const cliente = await database.buscarClientePorCURP(credito.curpCliente);
        const pagos = await database.getPagosPorCredito(historicalIdCredito, office);

        pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0)); 
        const estadoCalculado = _calcularEstadoCredito(credito, pagos);
        const saldoReal = estadoCalculado ? estadoCalculado.saldoRestante : (credito.saldo || 0);
        const estadoReal = estadoCalculado ? estadoCalculado.estado : (credito.estado || 'desconocido');

        // =============================================
        // --- 🚀 INICIO LÓGICA DE PERMISOS ---
        // =============================================
        const role = currentUserData?.role;
        const userOffice = currentUserData?.office;
        const creditOffice = credito.office;

        const esAdminTotal = (role === 'Super Admin' || role === 'Gerencia');
        const esAdminOficina = (role === 'Administrador' && (userOffice === creditOffice || userOffice === 'AMBAS'));
        const esComercialOficina = (role === 'Área comercial' && (userOffice === creditOffice || userOffice === 'AMBAS'));
        const canEditCredit = esAdminTotal || esAdminOficina;
        const canDeleteCredit = esAdminTotal || esAdminOficina;
        const canEditPayment = esAdminTotal || esAdminOficina || esComercialOficina;
        const canDeletePayment = esAdminTotal || esAdminOficina;

        let creditActionsHTML = '';
        if (canEditCredit || canDeleteCredit) {
            creditActionsHTML += '<div class="modal-credit-actions">';
            if (canEditCredit) {
                creditActionsHTML += `<button class="btn btn-sm btn-info btn-modal-action" onclick='handleEditarCredito(${creditoJsonString})'><i class="fas fa-edit"></i> Editar Crédito</button>`;
            }
            if (canDeleteCredit) {
                creditActionsHTML += `<button class="btn btn-sm btn-danger btn-modal-action" onclick="handleEliminarCredito('${credito.id}', '${historicalIdCredito}', '${credito.office}')"><i class="fas fa-trash"></i> Eliminar Crédito</button>`;
            }
            creditActionsHTML += '</div>';
        }
        // --- 🔚 FIN LÓGICA DE PERMISOS ---
        // =============================================

        let resumenHTML = `
            <div class="info-grid" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 5px;">
                <div class="info-item"><span class="info-label">Cliente:</span><span class="info-value">${cliente ? cliente.nombre : 'N/A'} (${credito.curpCliente})</span></div>
                <div class="info-item"><span class="info-label">ID Crédito (Hist.):</span><span class="info-value">${credito.historicalIdCredito || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Oficina:</span><span class="info-value">${credito.office || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Monto Total:</span><span class="info-value">$${(credito.montoTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div class="info-item"><span class="info-label">Saldo Calculado:</span><span class="info-value" style="color: ${saldoReal === 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">$${saldoReal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div class="info-item"><span class="info-label">Estado Calculado:</span><span class="info-value status-${estadoReal.replace(/\s/g, '-')}">${estadoReal.toUpperCase()}</span></div>
                <div class="info-item"><span class="info-label">Fecha Inicio:</span><span class="info-value">${formatDateForDisplay(parsearFecha(credito.fechaCreacion))}</span></div>
            </div>
            ${creditActionsHTML} `;

        let tablaHTML = '';
        if (pagos.length === 0) {
            tablaHTML = '<p class="status-message status-info">Este crédito no tiene pagos registrados.</p>';
        } else {
            pagos.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0));

            let saldoActual = credito.montoTotal || 0;
            let totalPagado = 0;
            const tableRows = pagos.map(pago => {
                const montoPago = pago.monto || 0;
                totalPagado += montoPago;
                saldoActual -= montoPago; 

                if (saldoActual < 0.005) {
                    saldoActual = 0;
                }
                const saldoDespuesCalculado = `$${saldoActual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const pagoJsonString = JSON.stringify(pago).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                let paymentActionsHTML = '<div class="action-buttons-modal">';
                if (canEditPayment) {
                    paymentActionsHTML += `<button class="btn btn-sm btn-info btn-modal-action" onclick='handleEditarPago(${pagoJsonString}, ${creditoJsonString})' title="Editar Pago"><i class="fas fa-edit"></i></button>`;
                }
                if (canDeletePayment) {
                    const pagoFecha = formatDateForDisplay(parsearFecha(pago.fecha));
                    paymentActionsHTML += `<button class="btn btn-sm btn-danger btn-modal-action" onclick="handleEliminarPago('${pago.id}', '${credito.id}', ${montoPago}, '${credito.office}', '${pagoFecha}')" title="Eliminar Pago"><i class="fas fa-trash"></i></button>`;
                }
                paymentActionsHTML += '</div>';

                return `
                    <tr>
                        <td>${formatDateForDisplay(parsearFecha(pago.fecha))}</td>
                        <td>$${montoPago.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>${pago.tipoPago || 'normal'}</td>
                        <td>${saldoDespuesCalculado}</td>
                        <td>${pago.registradoPor || 'N/A'}</td>
                        <td>${paymentActionsHTML}</td> </tr>
                `;
            }).join('');

            tablaHTML = `
                <p style="text-align: right; font-size: 14px; color: var(--gray);">Total Pagado (suma historial): <strong style="color: var(--success);">$${totalPagado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                <table class="payment-history-table">
                    <thead>
                        <tr>
                            <th>Fecha Pago</th>
                            <th>Monto</th>
                            <th>Tipo</th>
                            <th>Saldo Después (Calculado)</th>
                            <th>Registrado Por</th>
                            <th>Acciones</th> </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            `;
        }
        modalBody.innerHTML = resumenHTML + tablaHTML;

    } catch (error) {
        console.error("Error al mostrar historial de pagos:", error);
        modalBody.innerHTML = `<p class="status-message status-error">Error al cargar el historial: ${error.message}</p>`;
    }
}

//=====================================//
    // ** DIAGNOSTICO DE PAGOS ** //
//=====================================//
async function handleDiagnosticarPagos() {
    const historicalIdCredito = document.getElementById('diagnostico-id-credito').value.trim();
    const statusEl = document.getElementById('status-diagnostico');
    const resultEl = document.getElementById('resultado-diagnostico');
    const outputEl = document.getElementById('diagnostico-json-output');
    const button = document.getElementById('btn-diagnosticar-pagos');

    if (!historicalIdCredito) {
        statusEl.textContent = 'Por favor, ingresa un ID de crédito (histórico).';
        statusEl.className = 'status-message status-warning';
        statusEl.classList.remove('hidden');
        resultEl.classList.add('hidden');
        return;
    }

    showButtonLoading(button, true, 'Verificando...');
    statusEl.textContent = 'Buscando créditos asociados al ID...';
    statusEl.className = 'status-message status-info';
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');

    try {
        const creditosAsociados = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { userOffice: null });

        if (creditosAsociados.length === 0) {
            statusEl.textContent = `Diagnóstico: No se encontró NINGÚN crédito con el ID Histórico ${historicalIdCredito}.`;
            statusEl.className = 'status-message status-warning';
            outputEl.textContent = '[]';
            resultEl.classList.remove('hidden');
            showButtonLoading(button, false);
            return;
        }

        statusEl.textContent = `Se encontraron ${creditosAsociados.length} créditos. Buscando pagos para cada uno...`;
        const diagnosticoCompleto = {};
        let totalPagosEncontrados = 0;

        for (const credito of creditosAsociados) {
            const curp = credito.curpCliente;
            const office = credito.office;
            const clave = `Cliente: ${curp} (Sucursal: ${office})`;
            const pagos = await database.getPagosPorCredito(historicalIdCredito, curp);
            totalPagosEncontrados += pagos.length;
            
            pagos.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0));
            
            diagnosticoCompleto[clave] = {
                firestoreCreditoId: credito.id,
                totalPagos: pagos.length,
                pagos: pagos.map(p => ({
                    ...p,
                    fecha_formateada: formatDateForDisplay(parsearFecha(p.fecha)),
                    monto: p.monto?.toFixed(2),
                    saldoDespues: typeof p.saldoDespues === 'number' ? p.saldoDespues.toFixed(2) : p.saldoDespues
                }))
            };
        }

        if (totalPagosEncontrados === 0) {
             statusEl.textContent = `Diagnóstico completo: Se encontraron ${creditosAsociados.length} créditos, pero 0 pagos asociados (usando el filtro de CURP).`;
            statusEl.className = 'status-message status-warning';
        } else {
            statusEl.textContent = `Diagnóstico completo: ¡Éxito! Se encontraron ${totalPagosEncontrados} pagos distribuidos en ${creditosAsociados.length} créditos.`;
            statusEl.className = 'status-message status-success';
        }
        
        outputEl.textContent = JSON.stringify(diagnosticoCompleto, null, 2);
        resultEl.classList.remove('hidden');

    } catch (error) {
        console.error("Error en diagnóstico:", error);
        statusEl.textContent = `Error al consultar la base de datos: ${error.message}`;
        statusEl.className = 'status-message status-error';
        resultEl.classList.add('hidden');
    } finally {
        showButtonLoading(button, false);
    }
}


//============================================//
    // ** INICIALIZA REPORTE CONTABLE ** //
//============================================//
async function inicializarVistaReporteContable() {
    const statusEl = 'status_reporte_contable';
    const selectSucursal = document.getElementById('reporte-contable-sucursal');
    const selectAgente = document.getElementById('reporte-contable-agente');
    const btnGenerar = document.getElementById('btn-generar-reporte-contable');
    const btnImprimir = document.getElementById('btn-imprimir-reporte-contable');
    const wrapper = document.getElementById('reporte-contable-wrapper');

    wrapper.classList.add('hidden');
    btnImprimir.classList.add('hidden');
    showStatus(statusEl, 'Selecciona los filtros para generar un reporte.', 'info');
    
    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    document.getElementById('reporte-contable-fecha-inicio').value = primerDiaMes.toISOString().split('T')[0];
    document.getElementById('reporte-contable-fecha-fin').value = hoy.toISOString().split('T')[0];

    const userOffice = currentUserData?.office;
    const esAdminTotal = (currentUserData?.role === 'Super Admin' || currentUserData?.role === 'Gerencia');

    if (esAdminTotal && (!userOffice || userOffice === 'AMBAS')) {
        selectSucursal.disabled = false;
        selectSucursal.value = '';
    } else if (userOffice && userOffice !== 'AMBAS') {
        selectSucursal.value = userOffice;
        selectSucursal.disabled = true;
    } else {
        selectSucursal.value = '';
        selectSucursal.disabled = true;
        showStatus(statusEl, 'No tienes una oficina asignada para generar reportes.', 'error');
    }
    
    await handleSucursalReporteContableChange();
}

//=====================================================//
// ** CARGA DE AGENTES EN REPORTE CONTABLE (CORREGIDO) ** //
//=====================================================//
async function handleSucursalReporteContableChange() {
    const statusEl = 'status_reporte_contable';
    const selectSucursal = document.getElementById('reporte-contable-sucursal');
    const selectAgente = document.getElementById('reporte-contable-agente');

    // Validación de seguridad: Si los elementos no están en el DOM, salir
    if (!selectSucursal || !selectAgente) return;

    const office = selectSucursal.value;

    // Limpiar dropdown
    selectAgente.innerHTML = '<option value="">Cargando...</option>';
    selectAgente.disabled = true;

    // --- PARCHE DE SEGURIDAD ABSOLUTO ---
    // Si el usuario es Comercial, NO tiene permiso para listar usuarios.
    // Le asignamos su propio nombre y terminamos la función.
    const rolActual = currentUserData ? currentUserData.role : '';
    // Normalizamos para detectar variaciones (con acento, sin acento, mayúsculas)
    const rolNormalizado = rolActual.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    if (rolNormalizado.includes('comercial') || rolNormalizado.includes('ventas')) {
        console.log("🛡️ Rol comercial detectado: Asignando usuario actual y saliendo.");
        selectAgente.innerHTML = `<option value="${currentUserData.id}" selected>${currentUserData.name || 'Mi Usuario'}</option>`;
        selectAgente.disabled = true; // Bloqueado, solo puede verse a sí mismo
        return; // <--- IMPORTANTE: Detiene la ejecución aquí.
    }
    // ------------------------------------

    if (!office) {
        selectAgente.innerHTML = '<option value="">Selecciona una sucursal</option>';
        return;
    }

    try {
        const resultado = await database.obtenerUsuarios();
        
        if (!resultado.success) {
            console.warn("No se pudieron cargar usuarios:", resultado.message);
            selectAgente.innerHTML = '<option value="">(Sin permisos)</option>';
            return;
        }

        const agentes = resultado.data.filter(u =>
            u.role === 'Área comercial' && u.office === office
        ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const opciones = agentes.map(a => ({ value: a.id, text: a.name }));
        popularDropdown('reporte-contable-agente', opciones, 'Todos los Agentes', true);
        selectAgente.disabled = false;
        
    } catch (error) {
        console.error("Error no crítico cargando agentes:", error);
        selectAgente.innerHTML = '<option value="">Error al cargar</option>';
    }
}

//======================================================//
    // ** REPORTE CONTABLE GENERADO POR FILTROS ** //
//======================================================//
async function handleGenerarReporteContable() {
    const statusEl = 'status_reporte_contable';
    const btnGenerar = document.getElementById('btn-generar-reporte-contable');
    const btnImprimir = document.getElementById('btn-imprimir-reporte-contable');
    const wrapper = document.getElementById('reporte-contable-wrapper');
    
    showButtonLoading(btnGenerar, true, 'Generando...');
    showStatus(statusEl, 'Buscando movimientos y comisiones...', 'info');
    showFixedProgress(10, 'Buscando movimientos y comisiones...');
    
    wrapper.classList.add('hidden');
    btnImprimir.classList.add('hidden');

    const agenteOptions = Array.from(document.getElementById('reporte-contable-agente').options);
    const agenteMap = new Map(agenteOptions.map(opt => [opt.value, opt.text]));
    if(currentUserData) {
        agenteMap.set(currentUserData.id, currentUserData.name);
    }

    cargaEnProgreso = true; 
    currentSearchOperation = Date.now();
    const operationId = currentSearchOperation;
    clearTimeout(inactivityTimer);

    try {
        const filtros = {
            office: document.getElementById('reporte-contable-sucursal').value,
            userId: document.getElementById('reporte-contable-agente').value || null,
            fechaInicio: document.getElementById('reporte-contable-fecha-inicio').value,
            fechaFin: document.getElementById('reporte-contable-fecha-fin').value
        };

        if (!filtros.office) throw new Error("Debes seleccionar una sucursal.");
        if (!filtros.fechaInicio || !filtros.fechaFin) throw new Error("Debes seleccionar un rango de fechas.");

        showFixedProgress(40, 'Consultando base de datos...');
        const resultado = await database.getMovimientosParaReporte(filtros);
        
        if (operationId !== currentSearchOperation) throw new Error("Operación cancelada");
        if (!resultado.success) throw new Error(resultado.message);

        const movimientos = resultado.data;

        showFixedProgress(80, 'Procesando y agrupando datos...');
        
        let totalEntregas = 0;
        let totalColocacion = 0;  
        let totalGastos = 0;   
        let totalComisiones = 0; 
        let balanceFinal = 0;

        const movimientosPorAgente = {};

        movimientos.forEach(mov => {
            const agenteId = mov.userId || 'sin_agente';
            if (!movimientosPorAgente[agenteId]) {
                movimientosPorAgente[agenteId] = [];
            }
            movimientosPorAgente[agenteId].push(mov);

            const monto = mov.monto || 0;
            balanceFinal += monto;

            if (mov.tipo === 'ENTREGA_INICIAL') {
                totalEntregas += monto;
            } else if (mov.tipo === 'COLOCACION') {
                totalColocacion += monto;
            } else if (mov.tipo === 'GASTO') {
                totalGastos += monto;
            } else if (mov.tipo && mov.tipo.startsWith('COMISION')) {
                totalComisiones += monto;
            }
        });
        
        const agenteSeleccionado = filtros.userId ? (agenteMap.get(filtros.userId) || filtros.userId) : 'Todos los Agentes';
        document.getElementById('reporte-contable-titulo').textContent = `Reporte de Flujo de Efectivo - ${filtros.office}`;
        document.getElementById('reporte-contable-subtitulo').textContent = 
            `Periodo: ${formatDateForDisplay(parsearFecha(filtros.fechaInicio))} al ${formatDateForDisplay(parsearFecha(filtros.fechaFin))} | Agente: ${agenteSeleccionado}`;

        const resumenEl = document.getElementById('reporte-contable-resumen');
        resumenEl.innerHTML = `
            <div class="info-item"><span class="info-label">Total Entregado (Admin -> Agente):</span><span class="info-value" style="color: var(--success);">$${totalEntregas.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
            <div class="info-item"><span class="info-label">Total Comisiones (Automáticas):</span><span class="info-value" style="color: var(--success);">$${totalComisiones.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
            <div class="info-item"><span class="info-label">Total Colocado (Agente -> Cliente):</span><span class="info-value" style="color: var(--danger);">$${totalColocacion.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
            <div class="info-item"><span class="info-label">Total Gastos (Manuales):</span><span class="info-value" style="color: var(--warning);">$${totalGastos.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
            <div class="info-item"><span class="info-label">Balance Final (Entradas - Salidas):</span><span class="info-value" style="font-weight: bold; color: ${balanceFinal >= 0 ? 'var(--success)' : 'var(--danger)'};">$${balanceFinal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></div>
        `;

        const detalleEl = document.getElementById('reporte-contable-detalle');
        let detalleHtml = '';

        if (!filtros.userId) {
            for (const agenteId in movimientosPorAgente) {
                const nombreAgente = agenteMap.get(agenteId) || agenteId;
                detalleHtml += `<h5>Agente: ${nombreAgente}</h5>`;
                detalleHtml += renderTablaMovimientos(movimientosPorAgente[agenteId]);
            }
        } else {
            detalleHtml += renderTablaMovimientos(movimientos);
        }

        detalleEl.innerHTML = detalleHtml;

        wrapper.classList.remove('hidden');
        btnImprimir.classList.remove('hidden');
        showFixedProgress(100, 'Reporte generado');
        showStatus(statusEl, `Reporte generado con ${movimientos.length} movimientos (incl. comisiones). Listo para imprimir.`, 'success');

    } catch (error) {
        if (error.message === "Operación cancelada") {
            showStatus(statusEl, 'Reporte cancelado por el usuario.', 'warning');
        } else {
            console.error("Error generando reporte contable:", error);
            showStatus(statusEl, `Error: ${error.message}`, 'error');
        }
        wrapper.classList.add('hidden');
        btnImprimir.classList.add('hidden');
        hideFixedProgress();
    } finally {
        if (operationId === currentSearchOperation) cargaEnProgreso = false;
        showButtonLoading(btnGenerar, false);
        setTimeout(hideFixedProgress, 2000);
        resetInactivityTimer();
    }
}

//========================================================//
    // ** HELPER PARA RENDERIZAR REPORTE CONTABLE ** //
//========================================================//
function renderTablaMovimientos(movimientos) {
    let rows = '';
    movimientos.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0));

    movimientos.forEach(mov => {
        const monto = mov.monto || 0;
        rows += `
            <tr>
                <td>${formatDateForDisplay(parsearFecha(mov.fecha))}</td>
                <td>${mov.tipo || 'N/A'}</td>
                <td class="monto" style="color: ${monto > 0 ? 'var(--success)' : 'var(--danger)'};">
                    $${monto.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                </td>
                <td>${mov.descripcion || ''}</td>
                <td>${mov.registradoPor || 'N/A'}</td>
            </tr>
        `;
    });

    return `
        <table class="reporte-contable-tabla">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th>Descripción</th>
                    <th>Registrado Por (Admin)</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="5">No se encontraron movimientos.</td></tr>'}
            </tbody>
        </table>
    `;
}

//=======================================================//
    // ** EXTRAER TELEFONOS DE LISTA DE CLIENTES ** //
//=======================================================//
function handleExportarTelefonos() {
    const tbody = document.getElementById('tabla-clientes');
    if (!tbody) {
        alert("Error: No se encontró la tabla de clientes.");
        return;
    }

    const rows = tbody.querySelectorAll('tr');
    const telefonos = new Set();
    let clientesSinTelefono = 0;
    let clientesEncontrados = 0;

    rows.forEach(row => {
        const editButton = row.querySelector('button[onclick^="editCliente"]');
        if (editButton) {
            clientesEncontrados++;
            try {
                const onclickAttr = editButton.getAttribute('onclick');
                const jsonString = onclickAttr.substring(
                    onclickAttr.indexOf('(') + 1, 
                    onclickAttr.lastIndexOf(')')
                )
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'");
                
                const cliente = JSON.parse(jsonString);

                if (cliente && cliente.telefono) {
                    let telefonoLimpio = cliente.telefono.replace(/\D/g, '');
                    if (telefonoLimpio.length > 10) {
                        if (telefonoLimpio.startsWith('521')) {
                            telefonoLimpio = telefonoLimpio.substring(3);
                        } else if (telefonoLimpio.startsWith('52')) {
                            telefonoLimpio = telefonoLimpio.substring(2);
                        }
                    }

                    if (telefonoLimpio.length === 10) {
                        telefonos.add(telefonoLimpio);
                    } else if (telefonoLimpio.length > 0) {
                        console.warn(`Teléfono no estándar (se omite): ${cliente.telefono} (Limpio: ${telefonoLimpio})`);
                        clientesSinTelefono++;
                    } else {
                        clientesSinTelefono++;
                    }
                } else {
                    clientesSinTelefono++;
                }
            } catch (e) {
                console.error("Error parseando JSON del cliente en la fila:", e, row);
            }
        }
    });

    if (telefonos.size === 0) {
        alert(`No se encontraron números de teléfono válidos en los ${clientesEncontrados} clientes de la búsqueda actual.`);
        return;
    }

    const modal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = `Exportar Teléfonos (${telefonos.size} números únicos)`;
    modalBody.innerHTML = `
        <p>Se encontraron <strong>${telefonos.size}</strong> números de teléfono únicos de los <strong>${clientesEncontrados}</strong> clientes en la tabla.</p>
        <p>(${clientesSinTelefono} clientes no tenían un número de teléfono válido registrado).</p>
        <p>Copia esta lista para usarla en una lista de difusión de WhatsApp:</p>
        <textarea id="telefonos-export-textarea" rows="10" style="width: 100%; font-size: 14px; padding: 10px; margin-top: 15px;" readonly>${Array.from(telefonos).join('\n')}</textarea>
        <button id="btn-copiar-telefonos" class="btn btn-primary" style="margin-top: 15px;"><i class="fas fa-copy"></i> Copiar al Portapapeles</button>
    `;
    modal.classList.remove('hidden');

    const btnCopiar = document.getElementById('btn-copiar-telefonos');
    if (btnCopiar) {
        btnCopiar.replaceWith(btnCopiar.cloneNode(true));
        document.getElementById('btn-copiar-telefonos').addEventListener('click', () => {
            const textarea = document.getElementById('telefonos-export-textarea');
            textarea.select();
            
            try {
                navigator.clipboard.writeText(textarea.value).then(() => {
                    const btn = document.getElementById('btn-copiar-telefonos');
                    btn.innerHTML = '<i class="fas fa-check"></i> Copiado';
                    setTimeout(() => {
                        btn.innerHTML = '<i class="fas fa-copy"></i> Copiar al Portapapeles';
                    }, 2000);
                }).catch(err => {
                    console.error('Error al copiar (API Clipboard): ', err);
                    document.execCommand('copy');
                    const btn = document.getElementById('btn-copiar-telefonos');
                    btn.innerHTML = '<i class="fas fa-check"></i> Copiado (Fallback)';
                    setTimeout(() => {
                        btn.innerHTML = '<i class="fas fa-copy"></i> Copiar al Portapapeles';
                    }, 2000);
                });
            } catch (err) {
                console.error('Error al copiar: ', err);
                alert('No se pudo copiar automáticamente. Por favor, copia el texto manualmente.');
            }
        });
    }
}

// ============================================================
// ***  FUNCIONES (EDICIÓN/ELIMINACIÓN DE CRÉDITOS Y PAGOS) ***
// ============================================================

// ==================================
// ** MODAL PARA EDITAR UN CREDITO ** 
// ==================================
function handleEditarCredito(credito) {
    if (typeof credito === 'string') {
        credito = JSON.parse(credito.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
    }
    console.log("Editando crédito:", credito);

    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = `Editar Crédito (ID: ${credito.historicalIdCredito})`;
    modalBody.innerHTML = `
        <form id="form-editar-credito">
            <div class="info-grid" style="margin-bottom: 20px;">
                <div class="form-group">
                    <label for="edit-credito-monto">Monto Prestado ($)</label>
                    <input type="number" id="edit-credito-monto" class="form-control" value="${credito.monto || 0}" step="0.01">
                </div>
                <div class="form-group">
                    <label for="edit-credito-plazo">Plazo (Semanas)</label>
                    <input type="number" id="edit-credito-plazo" class="form-control" value="${credito.plazo || 0}" step="1">
                </div>
                <div class="form-group">
                    <label for="edit-credito-tipo">Tipo</label>
                    <select id="edit-credito-tipo" class="form-control">
                        <option value="nuevo" ${credito.tipo === 'nuevo' ? 'selected' : ''}>Nuevo</option>
                        <option value="renovacion" ${credito.tipo === 'renovacion' ? 'selected' : ''}>Renovación</option>
                        <option value="reingreso" ${credito.tipo === 'reingreso' ? 'selected' : ''}>Reingreso</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="edit-credito-fecha">Fecha Creación (YYYY-MM-DD)</label>
                    <input type="text" id="edit-credito-fecha" class="form-control" 
                           value="${credito.fechaCreacion ? new Date(credito.fechaCreacion).toISOString().split('T')[0] : ''}">
                </div>
                <div class="form-group">
                    <label for="edit-credito-nombre-aval">Nombre Aval</label>
                    <input type="text" id="edit-credito-nombre-aval" class="form-control" value="${credito.nombreAval || ''}">
                </div>
                <div class="form-group">
                    <label for="edit-credito-curp-aval">CURP Aval</label>
                    <input type="text" id="edit-credito-curp-aval" class="form-control" value="${credito.curpAval || ''}" maxlength="18">
                </div>
            </div>
            <div id="status-edit-credito" class="status-message hidden"></div>
            <div class="modal-actions" style="justify-content: flex-end;">
                <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Guardar Cambios</button>
            </div>
        </form>
    `;

    document.getElementById('form-editar-credito').onsubmit = (e) => {
        e.preventDefault();
        guardarCambiosCredito(credito.id, credito.historicalIdCredito, credito.office);
    };
}

// ===================================
// ** GUARDAR CAMBIOS DE UN CREDITO ** 
// ===================================
async function guardarCambiosCredito(creditoId, historicalId, office) {
    const statusEl = document.getElementById('status-edit-credito');
    
    if (!confirm("¿Estás seguro de que deseas GUARDAR estos cambios en el crédito?\n\nEsta acción modificará los datos permanentemente.")) {
        showStatus(statusEl.id, 'Edición cancelada.', 'info');
        return;
    }

    showStatus(statusEl.id, 'Guardando...', 'info');

    try {
        const fechaCreacionRaw = document.getElementById('edit-credito-fecha').value;
        const fechaCreacionISO = fechaCreacionRaw ? new Date(fechaCreacionRaw + 'T12:00:00Z').toISOString() : null;
        
        if (!fechaCreacionISO) {
            throw new Error("La fecha de creación es inválida.");
        }

        const dataToUpdate = {
            monto: parseFloat(document.getElementById('edit-credito-monto').value),
            plazo: parseInt(document.getElementById('edit-credito-plazo').value),
            tipo: document.getElementById('edit-credito-tipo').value,
            fechaCreacion: fechaCreacionISO,
            nombreAval: document.getElementById('edit-credito-nombre-aval').value,
            curpAval: document.getElementById('edit-credito-curp-aval').value.toUpperCase(),
        };
        
        const resultado = await database.actualizarCredito(creditoId, dataToUpdate);
        if (!resultado.success) throw new Error(resultado.message);

        showStatus(statusEl.id, 'Crédito actualizado. Recargando historial...', 'success');
        setTimeout(() => {
            mostrarHistorialPagos(historicalId, office);
            loadClientesTable();
        }, 1500);

    } catch (error) {
        console.error("Error guardando crédito:", error);
        showStatus(statusEl.id, `Error: ${error.message}`, 'error');
    }
}

// ===============================
// ** MODAL APRA EDITAR UN PAGO ** 
// ===============================
function handleEditarPago(pago, credito) {
    if (typeof pago === 'string') {
        pago = JSON.parse(pago.replace(/&apos;/g, "'").replace(/"/g, '"'));
    }
    if (typeof credito === 'string') {
        credito = JSON.parse(credito.replace(/&apos;/g, "'").replace(/"/g, '"'));
    }
    console.log("Editando pago:", pago);

    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const fechaPago = pago.fecha ? new Date(pago.fecha).toISOString().split('T')[0] : '';

    modalTitle.textContent = `Editar Pago (ID: ${pago.id.substring(0, 8)}...)`;
    modalBody.innerHTML = `
        <form id="form-editar-pago">
            <p>Crédito: <strong>${credito.historicalIdCredito}</strong> | Cliente: <strong>${credito.nombreCliente || credito.curpCliente}</strong></p>
            <div class="info-grid" style="margin-bottom: 20px;">
                <div class="form-group">
                    <label for="edit-pago-monto">Monto Pagado ($)</label>
                    <input type="number" id="edit-pago-monto" class="form-control" value="${pago.monto || 0}" step="0.01">
                </div>
                <div class="form-group">
                    <label for="edit-pago-fecha">Fecha de Pago (YYYY-MM-DD)</label>
                    <input type="text" id="edit-pago-fecha" class="form-control" value="${fechaPago}">
                </div>
                <div class="form-group">
                    <label for="edit-pago-tipo">Tipo de Pago</label>
                    <select id="edit-pago-tipo" class="form-control">
                        <option value="normal" ${pago.tipoPago === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="extraordinario" ${pago.tipoPago === 'extraordinario' ? 'selected' : ''}>Extraordinario</option>
                        <option value="actualizado" ${pago.tipoPago === 'actualizado' ? 'selected' : ''}>Actualizado</option>
                        <option value="grupal" ${pago.tipoPago === 'grupal' ? 'selected' : ''}>Grupal</option>
                    </select>
                </div>
            </div>
            <div id="status-edit-pago" class="status-message hidden"></div>
            <div class="modal-actions" style="justify-content: flex-end;">
                <button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Guardar Cambios</button>
            </div>
        </form>
    `;

    document.getElementById('form-editar-pago').onsubmit = (e) => {
        e.preventDefault();
        guardarCambiosPago(pago.id, credito.id, pago.monto, credito.historicalIdCredito, credito.office);
    };
}

// =======================================================
// ** GUARDAR LOS CAMBIOS DE UN PAGO Y RECALCULAR SALDO ** 
// =======================================================
async function guardarCambiosPago(pagoId, creditoId, montoOriginal, historicalId, office) {
    const statusEl = document.getElementById('status-edit-pago');

    if (!confirm("¿Estás seguro de que deseas GUARDAR los cambios en este pago?\n\nEsta acción modificará el pago y recalculará el saldo del crédito.")) {
        showStatus(statusEl.id, 'Edición cancelada.', 'info');
        return;
    }

    showStatus(statusEl.id, 'Guardando y recalculando saldo...', 'info');

    try {
        const nuevoMonto = parseFloat(document.getElementById('edit-pago-monto').value);
        const nuevaFechaRaw = document.getElementById('edit-pago-fecha').value;
        const nuevaFechaISO = nuevaFechaRaw ? new Date(nuevaFechaRaw + 'T12:00:00Z').toISOString() : null;
        
        if (!nuevaFechaISO) throw new Error("La fecha de pago es inválida.");
        if (isNaN(nuevoMonto) || nuevoMonto <= 0) throw new Error("El monto debe ser un número positivo.");

        const dataToUpdate = {
            monto: nuevoMonto,
            fecha: nuevaFechaISO,
            tipoPago: document.getElementById('edit-pago-tipo').value
        };

        const diferenciaMonto = nuevoMonto - montoOriginal;
        const resultado = await database.actualizarPago(pagoId, creditoId, dataToUpdate, diferenciaMonto);
        if (!resultado.success) throw new Error(resultado.message);

        showStatus(statusEl.id, 'Pago actualizado. Recargando historial...', 'success');
        setTimeout(() => {
            mostrarHistorialPagos(historicalId, office);
            loadClientesTable();
        }, 1500);

    } catch (error) {
        console.error("Error guardando pago:", error);
        showStatus(statusEl.id, `Error: ${error.message}`, 'error');
    }
}

// =============================================================
// ** CONFIRMACION DE ELMINACION DE CREDITO Y TODOS SUS PAGOS ** 
// =============================================================
async function handleEliminarCredito(creditoId, historicalId, office) {
    if (!confirm(`ADVERTENCIA:\n\n¿Estás seguro de eliminar el crédito ${historicalId}?\n\nEsta acción es PERMANENTE y eliminará también TODOS sus pagos, comisiones y movimientos asociados.\n\nEsta acción NO se puede deshacer.`)) {
        return;
    }
    
    showProcessingOverlay(true, 'Eliminando crédito y todos sus registros...');
    
    try {
        const resultado = await database.eliminarCredito(creditoId, historicalId, office);
        if (!resultado.success) throw new Error(resultado.message);

        showStatus('status_gestion_clientes', `Crédito ${historicalId} y ${resultado.pagosEliminados} pagos fueron eliminados.`, 'success');
        
    } catch (error) {
        console.error("Error eliminando crédito:", error);
        showStatus('status_gestion_clientes', `Error: ${error.message}`, 'error');
    } finally {
        document.getElementById('generic-modal').classList.add('hidden');
        showProcessingOverlay(false);
        await loadClientesTable();
    }
}

// =============================================
// ** CONFIRMACION DE PAGO Y RECALCULAR SALDO ** 
// =============================================
async function handleEliminarPago(pagoId, creditoId, monto, office, fecha) {
    if (!confirm(`ADVERTENCIA:\n\n¿Estás seguro de eliminar este pago?\n- Monto: $${monto}\n- Fecha: ${fecha}\n\nEsta acción REEMBOLSARÁ $${monto} al saldo del crédito y NO se puede deshacer.`)) {
        return;
    }
    
    showProcessingOverlay(true, 'Eliminando pago y recalculando saldo...');

    try {
        const resultado = await database.eliminarPago(pagoId, creditoId, monto, office);
        if (!resultado.success) throw new Error(resultado.message);

        showProcessingOverlay(false);
        const historicalId = resultado.historicalIdCredito || '';
        mostrarHistorialPagos(historicalId, office);
        loadClientesTable();

    } catch (error) {
        console.error("Error eliminando pago:", error);
        showProcessingOverlay(false);
        document.getElementById('modal-body').innerHTML = `<p class="status-message status-error">Error: ${error.message}</p>`;
    }
}

// ================================================
// ** FORMATO DE MONEDA CON COMA Y DOS DECIMALES ** 
// ================================================
function formatMoney(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '$0.00';
    return '$' + parseFloat(amount).toLocaleString('es-MX', {
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2
    });
}

// ===================================================
// CONFIGURACIÓN DE EVENT LISTENERS PARA CONFIGURACIÓN
// ===================================================

function configurarEventListenersConfiguracion() {
    console.log("🔧 Configurando event listeners para configuración...");
    document.addEventListener('click', function(e) {
        if (e.target.closest('.btn-asignar-ruta')) {
            const button = e.target.closest('.btn-asignar-ruta');
            const poblacionId = button.getAttribute('data-id');
            const poblacionNombre = button.getAttribute('data-nombre');
            const poblacionOffice = button.getAttribute('data-office');  
            console.log("📍 Asignar ruta a población:", { poblacionId, poblacionNombre, poblacionOffice });
            asignarRutaPoblacion(poblacionId, poblacionNombre, poblacionOffice);
        }
        
        if (e.target.closest('.btn-eliminar-poblacion')) {
            const button = e.target.closest('.btn-eliminar-poblacion');
            const poblacionId = button.getAttribute('data-id');
            const poblacionNombre = button.getAttribute('data-nombre');
            
            console.log("🗑️ Eliminar población:", { poblacionId, poblacionNombre });
            eliminarPoblacion(poblacionId, poblacionNombre);
        }
    });

    const searchPoblaciones = document.getElementById('search-poblaciones');
    if (searchPoblaciones) {
        searchPoblaciones.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            const cards = document.querySelectorAll('#tab-poblaciones .poblacion-card');
            const activeFilter = document.querySelector('#tab-poblaciones .filter-tab.active')?.getAttribute('data-office') || 'all';
            
            let visibleCount = 0;
            cards.forEach(card => {
                const nombre = card.getAttribute('data-nombre');
                const office = card.getAttribute('data-office');
                const matchesSearch = !searchTerm || nombre.includes(searchTerm);
                const matchesFilter = activeFilter === 'all' || office === activeFilter;
                
                if (matchesSearch && matchesFilter) {
                    card.style.display = 'flex';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });

            document.querySelectorAll('#tab-poblaciones .office-section').forEach(section => {
                const visibleCards = section.querySelectorAll('.poblacion-card[style*="display: flex"]').length;
                section.style.display = visibleCards > 0 ? 'block' : 'none';
            });
        });
    }

    document.querySelectorAll('#tab-poblaciones .filter-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('#tab-poblaciones .filter-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const searchInput = document.getElementById('search-poblaciones');
            if (searchInput) searchInput.dispatchEvent(new Event('input'));
        });
    });

    const searchRutas = document.getElementById('search-rutas');
    if (searchRutas) {
        searchRutas.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            const cards = document.querySelectorAll('#tab-rutas .ruta-card');
            
            cards.forEach(card => {
                const nombre = card.getAttribute('data-nombre');
                const matchesSearch = !searchTerm || nombre.includes(searchTerm);
                card.style.display = matchesSearch ? 'flex' : 'none';
            });

            document.querySelectorAll('#tab-rutas .office-section').forEach(section => {
                const visibleCards = section.querySelectorAll('.ruta-card[style*="display: flex"]').length;
                section.style.display = visibleCards > 0 ? 'block' : 'none';
            });
        });
    }

    console.log("✅ Event listeners de configuración configurados");
}

// ============================================
// ** CARGAR INTERFAZ DE RUTAS Y POBLACIONES ** 
// ============================================
async function loadConfiguracion() {
    console.log("🚀 EJECUTANDO loadConfiguracion - INICIO");
    const statusEl = 'status_configuracion';
    
    if (!currentUserData || !['Super Admin', 'Gerencia', 'Administrador'].includes(currentUserData.role)) {
        showStatus(statusEl, 'No tienes permisos para acceder a esta sección.', 'error');
        return;
    }

    let officeFiltro = null;
    if (currentUserData.role === 'Administrador' && currentUserData.office && currentUserData.office !== 'AMBAS') {
        officeFiltro = currentUserData.office;
    }
    
    console.log(`📍 Filtro oficina: ${officeFiltro || 'TODAS'}`);
    showStatus(statusEl, 'Cargando catálogos...', 'info');

    try {
        console.log("📋 Cargando interfaz de poblaciones...");
        await cargarInterfazPoblaciones(officeFiltro);
        
        console.log("🛣️ Cargando interfaz de rutas...");
        await cargarInterfazRutas(officeFiltro);
        
        console.log("🔧 Configurando tabs y event listeners...");
        setupNuevosTabsConfiguracion();
        configurarEventListenersConfiguracion();
        
        showStatus(statusEl, '✅ Poblaciones y rutas cargadas correctamente', 'success');
        console.log("🎉 loadConfiguracion - COMPLETADO EXITOSAMENTE");
        
    } catch (error) {
        console.error("❌ Error en loadConfiguracion:", error);
        showStatus(statusEl, `❌ Error al cargar: ${error.message}`, 'error');
    }
}

// =========================
// ** REGISTRO DE YUBIKEY ** 
// =========================
async function registrarYubiKey() {
    if (!currentUserData || !currentUserData.id) {
        alert("Error: Debes estar logueado para registrar una llave.");
        return;
    }
    
    console.log("Iniciando registro de YubiKey...");
    showProcessingOverlay(true, "Preparando registro de llave...");

    try {
        const challengeBuffer = new Uint8Array(32);
        crypto.getRandomValues(challengeBuffer);

        const createOptions = {
            publicKey: {
                rp: {
                    name: "Finzana App",
                    id: window.location.hostname
                },
                user: {
                    id: new TextEncoder().encode(currentUserData.id),
                    name: currentUserData.email,
                    displayName: currentUserData.name
                },
                challenge: challengeBuffer,
                pubKeyCredParams: [
                    { type: "public-key", alg: -7 },
                    { type: "public-key", alg: -257 }
                ],
                timeout: 60000,
                attestation: "direct"
            }
        };

        const credential = await navigator.credentials.create(createOptions);
        const credentialIdBase64URL = btoa(
            String.fromCharCode.apply(null, new Uint8Array(credential.rawId))
        ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

        console.log("Llave registrada, ID de credencial:", credentialIdBase64URL);
        showProcessingOverlay(true, "Guardando credencial...");

        await db.collection('users').doc(currentUserData.id).update({
            yubiKeyCredentialId: credentialIdBase64URL
        });
        
        currentUserData.yubiKeyCredentialId = credentialIdBase64URL;

        showProcessingOverlay(false);
        alert("¡Éxito! Tu llave de seguridad ha sido registrada.");

    } catch (error) {
        showProcessingOverlay(false);
        console.error("Error al registrar YubiKey:", error);
        alert(`Error al registrar: ${error.message}`);
    }
}

//==================================//
    // ** VERIFICAR YUBIKEY ** //
//==================================//
async function verificarYubiKey() {
    if (!currentUserData || !currentUserData.yubiKeyCredentialId) {
        alert("Error: No hay llave de seguridad registrada para este usuario.");
        return false;
    }

    console.log("Iniciando verificación de YubiKey...");
    showProcessingOverlay(true, "Esperando llave de seguridad...");
    
    try {
        const challengeBuffer = new Uint8Array(32);
        crypto.getRandomValues(challengeBuffer);
        const credentialIdBase64URL = currentUserData.yubiKeyCredentialId;
        const credentialIdBuffer = Uint8Array.from(
            atob(credentialIdBase64URL.replace(/-/g, "+").replace(/_/g, "/")), 
            c => c.charCodeAt(0)
        ).buffer;

        const getOptions = {
            publicKey: {
                challenge: challengeBuffer,
                rpId: window.location.hostname,
                allowCredentials: [{
                    type: "public-key",
                    id: credentialIdBuffer
                }],
                userVerification: "discouraged"
            }
        };

        const assertion = await navigator.credentials.get(getOptions);
        if (!assertion) {
            throw new Error("La verificación falló o fue cancelada.");
        }

        console.log("¡YubiKey verificada!");
        showProcessingOverlay(false);
        return true;

    } catch (error) {
        showProcessingOverlay(false);
        console.error("Error al verificar YubiKey:", error);
        alert(`Error de verificación: ${error.message}`);
        return false;
    }
}

//============================================//
    // ** INICIAR VISTAHOJA DE CORTE ** //
//============================================//
async function inicializarVistaHojaCorte() {
    console.log("Inicializando Hoja de Corte...");
    
    // A. FECHA (Zona Horaria Local)
    const fechaCorte = document.getElementById('corte-fecha');
    const getFechaLocalISO = () => {
        const ahora = new Date();
        const offset = ahora.getTimezoneOffset() * 60000;
        const local = new Date(ahora.getTime() - offset);
        return local.toISOString().split('T')[0];
    };
    if (fechaCorte && !fechaCorte.value) fechaCorte.value = getFechaLocalISO();

    // B. ELEMENTOS UI
    const containerFiltro = document.getElementById('container-corte-agente');
    const selectAgente = document.getElementById('corte-filtro-agente');
    const containerResumen = document.getElementById('corte-resumen-cards');
    const tbody = document.querySelector('#tabla-corte-detalle tbody');

    // C. LIMPIEZA VISUAL
    if(containerResumen) containerResumen.innerHTML = '';
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Selecciona fecha y genera corte.</td></tr>';

    if (!currentUserData) return;

    // D. LÓGICA DE ROLES
    const rolRaw = (currentUserData.role || '').toLowerCase();
    const esComercial = rolRaw.includes('comercial') || rolRaw.includes('ventas');
    const esAdminTotal = rolRaw.includes('super') || rolRaw.includes('gerencia');
    const miOficina = currentUserData.office;

    if (esComercial) {
        // Comercial: Ocultar filtro
        if(containerFiltro) containerFiltro.classList.add('hidden');
    } else {
        // Admin: Mostrar filtro y cargar
        if(containerFiltro) containerFiltro.classList.remove('hidden');
        
        if (selectAgente) {
            // 1. Construimos el HTML base (Esto BORRA cualquier duplicado previo)
            let opcionesHTML = '<option value="">-- Todos los Movimientos --</option>';
            
            try {
                const res = await database.obtenerUsuarios();
                if (res.success) {
                    // 2. Filtramos y Ordenamos
                    const agentes = res.data.filter(u => {
                        const r = (u.role || '').toLowerCase();
                        const esVendedor = r.includes('comercial') || r.includes('ventas');
                        if (!esVendedor) return false;
                        
                        // Si soy SuperAdmin o tengo permiso AMBAS, veo todo
                        if (esAdminTotal || miOficina === 'AMBAS') return true;
                        
                        // Si soy Admin normal, solo mi oficina
                        return u.office === miOficina;
                    }).sort((a,b) => a.name.localeCompare(b.name));

                    // 3. Generamos el HTML de las opciones (Usando Set para evitar IDs repetidos si la BD está sucia)
                    const idsUsados = new Set();
                    
                    agentes.forEach(agente => {
                        if (!idsUsados.has(agente.id)) {
                            idsUsados.add(agente.id);
                            // Agregamos texto a la cadena
                            const texto = esAdminTotal ? `${agente.name} (${agente.office})` : agente.name;
                            opcionesHTML += `<option value="${agente.id}">${texto}</option>`;
                        }
                    });
                }
            } catch (e) { console.error("Error usuarios", e); }

            // 4. ASIGNACIÓN FINAL (Esto sobreescribe el select completo)
            selectAgente.innerHTML = opcionesHTML;
        }
    }
}

//===============================//
    // ** HOJA DE CORTE ** //
//===============================//
async function loadHojaCorte() {
    const fechaInput = document.getElementById('corte-fecha');
    const fecha = fechaInput.value;
    const selectAgente = document.getElementById('corte-filtro-agente');
    
    if (!fecha) { alert('Selecciona una fecha.'); return; }

    showProcessingOverlay(true, 'Generando corte de caja...');

    try {
        // Lógica de Filtro por Usuario
        const rolNormalizado = (currentUserData.role || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let userIdFiltro = null;

        if (rolNormalizado.includes('comercial') || rolNormalizado.includes('ventas')) {
            // Caso 1: Soy Comercial -> FORZAR mi ID
            userIdFiltro = currentUserData.id;
        } else {
            // Caso 2: Soy Admin -> Usar lo que seleccioné en el dropdown (o null para 'Todos')
            userIdFiltro = selectAgente.value || null;
        }
        
        console.log(`Generando corte para: Oficina=${currentUserData.office}, Usuario=${userIdFiltro || 'TODOS'}`);

        // Llamada a la base de datos
        const datos = await database.obtenerDatosHojaCorte(fecha, currentUserData.office, userIdFiltro);

        // Renderizar en pantalla
        renderizarResultadosCorte(datos);

    } catch (error) {
        console.error("Error Hoja Corte:", error);
        alert("Error al generar el corte: " + error.message);
    } finally {
        showProcessingOverlay(false);
    }
}

//==========================================//
    // ** RENDERIZAR HOJA DE CORTE ** //
//==========================================//

function renderizarResultadosCorte(datos) {
    const containerResumen = document.getElementById('corte-resumen-cards');
    // Obtenemos el contenedor padre para reemplazar la tabla completa si es necesario
    const tableContainer = document.querySelector('#tabla-corte-detalle').parentNode; 
    
    // Variables para totales globales
    let totalEntradas = 0;
    let totalSalidas = 0;
    
    // Subtotales globales para tarjetas
    let subCobranza = 0; 
    let subPolizas = 0; 
    let subColocacion = 0; 
    let subGastos = 0; 
    let subComisiones = 0; 
    let subFondeo = 0;

    // 1. Agrupar datos por población
    const gruposPoblacion = {};

    datos.forEach(item => {
        // Normalizar y clasificar
        let monto = Math.abs(item.monto || 0); 
        let esEntrada = false; 
        let concepto = '';
        
        if (item.categoria === 'COBRANZA') {
            esEntrada = true; concepto = 'COBRANZA'; subCobranza += monto;
        } else if (item.tipo === 'INGRESO_POLIZA') {
            esEntrada = true; concepto = 'PÓLIZA'; subPolizas += monto;
        } else if (item.tipo === 'ENTREGA_INICIAL') {
            esEntrada = true; concepto = 'FONDEO'; subFondeo += monto;
        } else if (item.tipo === 'COLOCACION') {
            esEntrada = false; concepto = 'COLOCACIÓN'; subColocacion += monto;
        } else if (item.tipo === 'GASTO') {
            esEntrada = false; concepto = 'GASTO'; subGastos += monto;
        } else if (item.tipo && item.tipo.includes('COMISION')) {
            esEntrada = false; concepto = 'COMISIÓN'; subComisiones += monto;
        } else {
            esEntrada = (item.monto >= 0); 
            monto = Math.abs(item.monto);
            concepto = 'OTRO';
        }

        if (esEntrada) totalEntradas += monto; else totalSalidas += monto;

        // Obtener población (Si no tiene, agrupamos en 'GENERAL')
        const poblacion = item.poblacion || 'GENERAL / OFICINA';
        
        if (!gruposPoblacion[poblacion]) {
            gruposPoblacion[poblacion] = [];
        }

        gruposPoblacion[poblacion].push({ 
            hora: new Date(item.rawDate), 
            concepto, 
            descripcion: item.descripcion || '-', 
            monto, 
            esEntrada, 
            ref: item.registradoPor || '-' 
        });
    });

    const efectivoEnMano = totalEntradas - totalSalidas;

    // 2. Renderizar Tarjetas de Resumen (Globales)
    containerResumen.innerHTML = `
        <div class="card" style="border-left: 5px solid var(--info); flex: 1;">
            <h5 style="color:#666; margin:0;">EFECTIVO EN MANO</h5>
            <h2 style="color:var(--dark); font-weight:bold; margin:5px 0;">$${efectivoEnMano.toLocaleString('es-MX', {minimumFractionDigits: 2})}</h2>
        </div>
        <div class="card" style="border-left: 5px solid var(--success); flex: 1;">
            <h5 style="color:#666; margin:0;">ENTRADAS (+)</h5>
            <h3 style="color:var(--success); margin:5px 0;">$${totalEntradas.toLocaleString('es-MX', {minimumFractionDigits: 2})}</h3>
            <div style="font-size:0.8em;">Cobranza: $${subCobranza.toLocaleString()} | Pólizas: $${subPolizas.toLocaleString()} | Fondeo: $${subFondeo.toLocaleString()}</div>
        </div>
        <div class="card" style="border-left: 5px solid var(--danger); flex: 1;">
            <h5 style="color:#666; margin:0;">SALIDAS (-)</h5>
            <h3 style="color:var(--danger); margin:5px 0;">$${totalSalidas.toLocaleString('es-MX', {minimumFractionDigits: 2})}</h3>
            <div style="font-size:0.8em;">Colocación: $${subColocacion.toLocaleString()} | Comis: $${subComisiones.toLocaleString()} | Gastos: $${subGastos.toLocaleString()}</div>
        </div>
    `;

    // 3. Renderizar Tablas Agrupadas por Población
    let htmlTablas = '';
    
    // Ordenar nombres de población alfabéticamente
    const nombresPoblacion = Object.keys(gruposPoblacion).sort();

    if (nombresPoblacion.length === 0) {
        htmlTablas = '<div style="text-align:center; padding:20px;">No hay movimientos para este criterio.</div>';
    } else {
        nombresPoblacion.forEach(pob => {
            const movimientos = gruposPoblacion[pob];
            movimientos.sort((a, b) => a.hora - b.hora); // Orden cronológico

            // Calcular subtotales por población para mostrar en el encabezado
            const totalPob = movimientos.reduce((acc, m) => acc + (m.esEntrada ? m.monto : -m.monto), 0);
            const colorTotal = totalPob >= 0 ? 'var(--success)' : 'var(--danger)';

            htmlTablas += `
                <div class="poblacion-corte-group" style="margin-bottom: 25px; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden;">
                    <h4 style="background: #e9ecef; padding: 10px 15px; margin: 0; display:flex; justify-content:space-between; align-items: center; border-bottom: 1px solid #dee2e6;">
                        <span style="color: var(--primary);"><i class="fas fa-map-marker-alt"></i> ${pob}</span>
                        <span style="font-size:0.9em; font-weight:bold; color: ${colorTotal}">Neto Población: $${totalPob.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                    </h4>
                    <div class="table-responsive">
                        <table class="table" style="width: 100%; border-collapse: collapse; margin-bottom: 0;">
                            <thead>
                                <tr style="background-color: #fff;">
                                    <th style="padding: 8px; border-bottom: 2px solid #eee; width: 80px;">Hora</th>
                                    <th style="padding: 8px; border-bottom: 2px solid #eee;">Concepto</th>
                                    <th style="padding: 8px; border-bottom: 2px solid #eee;">Descripción</th>
                                    <th style="padding: 8px; border-bottom: 2px solid #eee; color: var(--success); text-align:right;">Entrada (+)</th>
                                    <th style="padding: 8px; border-bottom: 2px solid #eee; color: var(--danger); text-align:right;">Salida (-)</th>
                                    <th style="padding: 8px; border-bottom: 2px solid #eee;">Ref.</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            movimientos.forEach(row => {
                const horaStr = row.hora.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const entradaStr = row.esEntrada ? `$${row.monto.toFixed(2)}` : '';
                const salidaStr = !row.esEntrada ? `$${row.monto.toFixed(2)}` : '';

                htmlTablas += `
                    <tr>
                        <td style="text-align:center; color:#666; font-size:0.85em; border-bottom: 1px solid #eee;">${horaStr}</td>
                        <td style="border-bottom: 1px solid #eee;"><strong>${row.concepto}</strong></td>
                        <td style="font-size:0.9em; border-bottom: 1px solid #eee;">${row.descripcion}</td>
                        <td style="color:var(--success); text-align:right; border-bottom: 1px solid #eee;">${entradaStr}</td>
                        <td style="color:var(--danger); text-align:right; border-bottom: 1px solid #eee;">${salidaStr}</td>
                        <td style="font-size:0.8em; color:#888; border-bottom: 1px solid #eee;">${row.ref}</td>
                    </tr>
                `;
            });

            htmlTablas += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });
    }

    // Inyectar el HTML generado en el contenedor
    // Nota: El ID original 'tabla-corte-detalle' es una tabla, así que reemplazamos su contenedor padre
    // o el contenido si es un div wrapper.
    
    // Si estás en la vista de Hoja de Corte
    const detalleContainer = document.getElementById('reporte-contable-detalle'); // Vista Reporte Contable (Admin)
    if (detalleContainer) {
        detalleContainer.innerHTML = htmlTablas;
    } else {
        // Vista Hoja de Corte (Usuario)
        // Buscamos el div padre de la tabla original para reemplazarlo o inyectar dentro
        // Asumiendo estructura: <div class="card"> <h3>...</h3> <div class="table-responsive"> <table id="tabla-corte-detalle">...
        const table = document.getElementById('tabla-corte-detalle');
        if (table) {
            const responsiveDiv = table.parentElement;
            responsiveDiv.innerHTML = htmlTablas;
        }
    }
}

// ==========================================
// FUNCIONES DE GOOGLE MAPS (RUTA ÓPTIMA)
// ==========================================

async function generarRutaMaps() {
    if (waypointsComisionistas.length === 0) {
        alert("No hay direcciones de comisionistas cargadas.");
        return;
    }

    const modal = document.getElementById('map-modal');
    const detailsDiv = document.getElementById('route-details');
    const closeBtn = document.getElementById('close-map-btn');
    
    if(modal) modal.classList.remove('hidden');
    if(detailsDiv) detailsDiv.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div> Optimizando ruta...</div>';
    if(closeBtn) {
        closeBtn.onclick = () => modal.classList.add('hidden');
    }

    if (!mapInstance) {
        const mapDiv = document.getElementById("google-map");
        if (!mapDiv) return;

        const defaultCenter = { lat: 20.6597, lng: -103.3496 };
        mapInstance = new google.maps.Map(mapDiv, {
            zoom: 12,
            center: defaultCenter,
            mapTypeControl: false,
            streetViewControl: false
        });
        directionsRenderer.setMap(mapInstance);
        
    }

    showProcessingOverlay(true, "Obteniendo tu ubicación...");

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const origen = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                calcularRutaGoogle(origen);
            },
            () => {
                usarOficinaComoOrigen();
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    } else {
        usarOficinaComoOrigen();
    }
}

function usarOficinaComoOrigen() {
    console.warn("GPS no disponible. Usando oficina.");
    const office = currentUserData?.office || 'GDL';
    const direccionOficina = (office === 'GDL') 
        ? "Av Vallarta 2440, Guadalajara, Jalisco" 
        : "Centro, León, Guanajuato";
    
    calcularRutaGoogle(direccionOficina);
}

function calcularRutaGoogle(origen) {
    showProcessingOverlay(true, "Google Maps está optimizando tu ruta...");

    const waypointsGoogle = waypointsComisionistas.map(w => ({
        location: w.location,
        stopover: true
    }));

    const waypointsFinales = waypointsGoogle.slice(0, 23); 

    const request = {
        origin: origen,
        destination: origen,
        waypoints: waypointsFinales,
        optimizeWaypoints: true,
        travelMode: 'DRIVING'
    };

    if(!directionsService) directionsService = new google.maps.DirectionsService();

    directionsService.route(request, function(result, status) {
        showProcessingOverlay(false);

        if (status === 'OK') {
            directionsRenderer.setDirections(result);
            
            const route = result.routes[0];
            const order = route.waypoint_order;
            let totalDist = 0;
            let totalSecs = 0;

            route.legs.forEach(leg => {
                totalDist += leg.distance.value;
                totalSecs += leg.duration.value;
            });
            
            const km = (totalDist / 1000).toFixed(1);
            const horas = Math.floor(totalSecs / 3600);
            const min = Math.round((totalSecs % 3600) / 60);
            const tiempoStr = horas > 0 ? `${horas}h ${min}min` : `${min}min`;

            let html = `
                <div style="margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #eee;">
                    <h4 style="margin:0; color:var(--primary);">🏁 Ruta Optimizada</h4>
                    <span style="font-size:0.9em;"><strong>${km} km</strong> estimadoss | Tiempo conducción: <strong>${tiempoStr}</strong></span>
                </div>
                <ol style="margin:0; padding-left:25px; list-style: decimal;">
            `;
            
            for (let i = 0; i < order.length; i++) {
                const idxOriginal = order[i];
                const punto = waypointsComisionistas[idxOriginal];
                
                const linkNav = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(punto.location)}`;
                
                html += `
                    <li style="margin-bottom:8px;">
                        <strong>${punto.poblacion}</strong> <br>
                        <small style="color:#666;">${punto.location}</small>
                        <a href="${linkNav}" target="_blank" style="margin-left:5px; text-decoration:none;">🚗 Ir</a>
                    </li>
                `;
            }
            html += `</ol>`;

            document.getElementById('route-details').innerHTML = html;

        } else {
            console.error("Error Maps:", status);
            alert('Google Maps no pudo calcular la ruta. Verifica las direcciones de las comisionistas.\nError: ' + status);
            document.getElementById('route-details').innerHTML = `<p class="status-error">Error: ${status}</p>`;
        }
    });
}

// --- Función para colapsar/expandir el Selector Principal ---
function toggleSelectorMain() {
    const card = document.getElementById('selector-poblaciones-card');
    if (card) {
        // Reutilizamos la clase 'closed' y el CSS que ya creamos para las otras tarjetas
        card.classList.toggle('closed');
    }
}

// --- Función para colapsar/expandir grupos de población ---
function togglePoblacionGroup(grupoId) {
    const card = document.getElementById(`group-card-${grupoId}`);
    if (card) {
        card.classList.toggle('closed');
    }
}

// ==================================================================== //
        //** MANEJO DEL BOTÓN "MODO OFFLINE" (SINCRONIZACIÓN) **//
// ==================================================================== //
async function handleSincronizacionOffline() {
    // 1. Validaciones básicas
    if (!navigator.onLine) {
        alert("⚠️ Necesitas conexión a internet para descargar los datos.");
        return;
    }

    if (!currentUserData) {
        alert("⚠️ Espera a que cargue tu sesión de usuario.");
        return;
    }

    // 2. Confirmación visual
    if(!confirm("¿Deseas descargar los datos para trabajar sin internet?\n\nEsto descargará clientes, créditos y configuraciones de tu ruta.")) {
        return;
    }

    showProcessingOverlay(true, "📥 Descargando cartera de clientes...\nPor favor espera.");

    try {
        // 3. Llamada a la base de datos
        const resultado = await database.sincronizarDatosComercial(
            currentUserData.office, 
            currentUserData.ruta
        );

        if (resultado.success) {
            alert(`✅ ¡Sincronización Exitosa!\n\nSe descargaron ${resultado.total} registros.\n\nYa puedes desconectarte y:\n- Registrar nuevos clientes\n- Generar créditos\n- Gestionar cobranza`);
        } else {
            alert(`❌ Error al sincronizar: ${resultado.message}`);
        }

    } catch (error) {
        console.error(error);
        alert("❌ Ocurrió un error inesperado de conexión.");
    } finally {
        showProcessingOverlay(false);
    }
}

// ================================================ //
    //** REPORTE MULTICRÉDITOS (HISTÓRICO) **//
// ================================================ //
async function inicializarVistaMulticreditos() {
    // 1. RESTRICCIÓN DE SEGURIDAD
    if (currentUserData.role === 'Área comercial') {
        alert("Acceso denegado. Vista restringida.");
        showView('view-main-menu');
        return;
    }

    const selectSucursal = document.getElementById('multicredito-sucursal');
    const btnBuscar = document.getElementById('btn-generar-multicreditos');

    // Preseleccionar oficina del usuario si aplica
    if (currentUserData.office && currentUserData.office !== 'AMBAS') {
        selectSucursal.value = currentUserData.office;
        selectSucursal.disabled = true;
    }

    // Configurar listener (clonando para evitar duplicados)
    const newBtn = btnBuscar.cloneNode(true);
    btnBuscar.parentNode.replaceChild(newBtn, btnBuscar);
    
    newBtn.addEventListener('click', async () => {
        const office = selectSucursal.value;
        await generarReporteMulticreditos(office);
    });
}

// ============================================ //
    // ** GENERAR REPORTE MULTICREDITO** //
// ============================================ //
async function generarReporteMulticreditos(office) {
    const container = document.getElementById('multicreditos-resultados');
    container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Analizando historial completo...</p></div>';

    try {
        const { arbol, totalCasos } = await database.obtenerReporteMulticreditos(office);

        if (!arbol || totalCasos === 0) {
            container.innerHTML = `
                <div class="alert alert-success" style="text-align:center; margin-top:20px;">
                    <i class="fas fa-check-circle fa-2x"></i><br>
                    <strong>¡Todo limpio!</strong><br>
                    No se encontraron clientes con más de 1 créditos activos en ${office}.
                </div>`;
            return;
        }

        let html = `<div class="alert alert-warning">Se encontraron <strong>${totalCasos}</strong> clientes con exceso de créditos activos.</div>`;

        // NIVEL 1: RUTA
        const rutasOrdenadas = Object.keys(arbol).sort();
        
        for (const ruta of rutasOrdenadas) {
            html += `
            <details style="margin-bottom: 10px; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
                <summary style="background: #343a40; color: white; padding: 10px; cursor: pointer; font-weight: bold;">
                    <i class="fas fa-route"></i> RUTA: ${ruta}
                </summary>
                <div style="padding: 10px; background: #f8f9fa;">
            `;

            // NIVEL 2: POBLACIÓN
            const poblaciones = arbol[ruta];
            const pobsOrdenadas = Object.keys(poblaciones).sort();

            for (const pob of pobsOrdenadas) {
                html += `
                <div style="margin-left: 15px; margin-bottom: 10px; border-left: 3px solid #6f42c1; padding-left: 10px;">
                    <h5 style="color: #6f42c1; border-bottom: 1px solid #ccc;">${pob}</h5>
                `;

                // NIVEL 3: CLIENTE
                const clientes = poblaciones[pob];
                for (const cliente of clientes) {
                    html += `
                    <div style="background: white; padding: 10px; margin-bottom: 10px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong><i class="fas fa-user"></i> ${cliente.nombre}</strong>
                            <span class="badge badge-danger">${cliente.creditos.length} Créditos Activos</span>
                        </div>
                        <div style="font-size: 0.85em; color: #666;">CURP: ${cliente.curp}</div>
                        
                        <div style="margin-top: 10px;">
                    `;

                    for (const cred of cliente.creditos) {
                        const saldo = cred.saldo !== undefined ? cred.saldo : cred.montoTotal;
                        const pctPagado = cred.montoTotal > 0 ? (1 - (saldo/cred.montoTotal)) * 100 : 0;
                        const fechaCred = parsearFecha(cred.fechaCreacion)?.toLocaleDateString('es-MX') || 'N/A';

                        html += `
                            <details id="details-${cred.id}" ontoggle="cargarPagosHist('details-${cred.id}', '${cred.historicalIdCredito}', '${office}')" 
                                style="margin-bottom: 5px; border: 1px solid #e9ecef; border-radius: 4px;">
                                <summary style="padding: 8px; cursor: pointer; background: #fff; font-size: 0.9em;">
                                    <div style="display:flex; justify-content:space-between;">
                                        <span><strong>ID: ${cred.historicalIdCredito}</strong> | ${fechaCred} | $${cred.monto} (14 sem)</span>
                                        <span style="color: ${pctPagado >= 80 ? 'green' : 'red'};">Saldo: $${saldo.toFixed(2)} (${pctPagado.toFixed(0)}%)</span>
                                    </div>
                                </summary>
                                <div class="pagos-container" style="padding: 10px; background: #fafafa; font-size: 0.85em;">
                                    <i class="fas fa-spinner fa-spin"></i> Cargando pagos...
                                </div>
                            </details>
                        `;
                    }
                    html += `</div></div>`; // Fin cliente
                }
                html += `</div>`; // Fin población
            }
            html += `</div></details>`; // Fin ruta
        }

        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

// =============================================================== //
    // ** CARGA INICIAL AL ENTRAR A LA VISTA DE GESTIÓN ** //
// =============================================================== //
async function cargarDatosGestionClientes() {
    if (!currentUserData) return;

    // Mostrar spinner rápido
    const tableBody = document.getElementById('tabla-clientes-body');
    if(tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-sync fa-spin"></i> Cargando datos...</td></tr>';

    // Llamamos a la función de database.js
    // Esto lee el disco y llena la variable global
    carteraGlobalCache = await database.obtenerCarteraLocalParaBusqueda(currentUserData.office);
    
    // Una vez cargados, aplicamos los filtros iniciales (muestra todo por defecto)
    aplicarFiltrosMemoria(); 
}

// ================================= //
    // ** MOTOR DE FILTRADO ** //
// ================================= //
function aplicarFiltrosMemoria() {
    // A. Leer Inputs del HTML
    const textoGeneral = document.getElementById('busqueda_general')?.value.toLowerCase().trim() || '';
    const filtroGrupo = document.getElementById('filtro_grupo')?.value || 'todos';
    const filtroEstado = document.getElementById('filtro_estado_credito')?.value || 'todos';
    // Si tienes filtros de fecha:
    // const fechaIni = document.getElementById('filtro_fecha_inicio')?.value;
    // const fechaFin = document.getElementById('filtro_fecha_fin')?.value;

    console.log(`🔍 Filtrando ${carteraGlobalCache.length} registros...`);

    // B. Filtrar el Array Global
    const resultados = carteraGlobalCache.filter(item => {
        
        // 1. Filtro de Texto (Busca en Nombre, CURP, Folio)
        if (textoGeneral) {
            const matchNombre = item.nombreBusqueda.includes(textoGeneral);
            const matchCurp = item.curpBusqueda.includes(textoGeneral.toUpperCase());
            const matchFolio = item.folioCredito.includes(textoGeneral); // Busca por ID de crédito
            
            if (!matchNombre && !matchCurp && !matchFolio) return false;
        }

        // 2. Filtro de Grupo / Población
        if (filtroGrupo !== 'todos' && filtroGrupo !== '') {
            // Comparación flexible (ignorando mayúsculas)
            if (item.poblacionBusqueda !== filtroGrupo.toLowerCase()) return false;
        }

        // 3. Filtro de Estado de Crédito
        if (filtroEstado !== 'todos') {
            if (filtroEstado === 'sin_credito') {
                if (item.tieneCredito) return false;
            } else {
                // Debe tener crédito Y coincidir el estado (ej: 'al corriente', 'atrasado')
                if (!item.tieneCredito || item.estadoCredito !== filtroEstado) return false;
            }
        }

        return true; // Pasó todos los filtros
    });

    // C. Ordenar resultados (Opcional: Alfabético)
    resultados.sort((a, b) => a.nombreBusqueda.localeCompare(b.nombreBusqueda));

    // D. Mandar a pintar la tabla
    renderTablaClientes(resultados);
}

// ===================================== //
    // ** RENDERIZADO DE TABLA ** //
// ===================================== //
function renderTablaClientes(listaDatos) {
    const tbody = document.getElementById('tabla-clientes-body');
    const contadorEl = document.getElementById('total-registros-clientes'); // Si tienes un contador
    
    if (!tbody) return;
    tbody.innerHTML = ''; // Limpiar tabla

    if (contadorEl) contadorEl.innerText = listaDatos.length;

    if (listaDatos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    <i class="fas fa-search me-2"></i> No se encontraron resultados
                </td>
            </tr>`;
        return;
    }

    // Limitamos a mostrar 50 o 100 para no trabar el renderizado si hay miles
    const limiteVisual = 100;
    const datosVisibles = listaDatos.slice(0, limiteVisual);

    datosVisibles.forEach(item => {
        const c = item.cliente;
        const cr = item.credito;
        
        // Determinar Badge de Estado
        let estadoBadge = '<span class="badge bg-secondary">Sin Crédito</span>';
        if (item.tieneCredito) {
            let color = 'primary';
            if (cr.estado === 'atrasado') color = 'danger';
            if (cr.estado === 'liquidado') color = 'success';
            estadoBadge = `<span class="badge bg-${color}">${cr.estado.toUpperCase()}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="fw-bold text-primary" style="cursor:pointer;" onclick="verDetalleCliente('${c.id}')">
                    ${c.nombre}
                </div>
                <small class="text-muted d-block">${c.curp}</small>
                ${item.folioCredito ? `<small class="text-info fw-bold"><i class="fas fa-receipt"></i> ${item.folioCredito}</small>` : ''}
            </td>
            <td>${c.poblacion_grupo || '-'}</td>
            <td>${c.ruta || '-'}</td>
            <td>${estadoBadge}</td>
            <td class="text-end fw-bold">${item.saldo > 0 ? `$${item.saldo.toFixed(2)}` : '-'}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-primary" onclick="verDetalleCliente('${c.id}')">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (listaDatos.length > limiteVisual) {
        const trInfo = document.createElement('tr');
        trInfo.innerHTML = `<td colspan="6" class="text-center text-muted small">
            Mostrando primeros ${limiteVisual} de ${listaDatos.length}. Refina tu búsqueda.
        </td>`;
        tbody.appendChild(trInfo);
    }
}

// ================================================ //
    // ** Función global para cargar pagos ** //
// ================================================ //
window.cargarPagosHist = async function(detailsId, historicalId, office) {
    const details = document.getElementById(detailsId);
    if (!details.open) return; // Solo cargar si se abre
    
    const container = details.querySelector('.pagos-container');
    if (container.getAttribute('data-loaded') === 'true') return; // Ya cargado

    try {
        const pagos = await database.obtenerPagosParaReporte(historicalId, office); // Reutilizamos o usamos el helper
        // Nota: Si no existe, crear 'obtenerPagosParaReporte' en database o usar 'getPagosPorCredito'
        
        if (pagos.length === 0) {
            container.innerHTML = '<em>Sin pagos registrados.</em>';
        } else {
            let tabla = '<table style="width:100%; text-align:left;"><thead><tr><th>Fecha</th><th>Monto</th><th>Tipo</th></tr></thead><tbody>';
            pagos.forEach(p => {
                const f = parsearFecha(p.fecha)?.toLocaleDateString('es-MX') || '-';
                tabla += `<tr><td>${f}</td><td>$${p.monto}</td><td>${p.tipoPago}</td></tr>`;
            });
            tabla += '</tbody></table>';
            container.innerHTML = tabla;
        }
        container.setAttribute('data-loaded', 'true');
    } catch (e) {
        container.innerHTML = 'Error cargando pagos.';
    }
};

// =============================================
// INICIALIZACIÓN Y EVENT LISTENERS PRINCIPALES
// =============================================
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM cargado, inicializando aplicación...');

    // 1. Configurar escuchadores de eventos (botones, inputs)
    setupEventListeners();
    setupSecurityListeners();

    // 2. Escuchar cambios en la autenticación (Login/Logout)
    auth.onAuthStateChanged(async user => {
        console.log('Estado de autenticación cambiado:', user ? user.uid : 'No user');
        
        const loadingOverlay = document.getElementById('loading-overlay');
        const loginScreen = document.getElementById('login-screen');
        const mainApp = document.getElementById('main-app');

        // Ocultar el spinner de carga inicial del HTML
        if (loadingOverlay) loadingOverlay.classList.add('hidden');

        if (user) {
            // --- USUARIO LOGUEADO ---
            currentUser = user;

            try {
                // A. Obtener datos del perfil del usuario (Rol, Oficina, Ruta)
                currentUserData = await database.obtenerUsuarioPorId(user.uid);

                if (currentUserData && !currentUserData.error) {
                    // Actualizar UI de cabecera
                    document.getElementById('user-name').textContent = currentUserData.name || user.email;
                    document.getElementById('user-role-display').textContent = currentUserData.role || 'Rol Desconocido';

                    // ============================================================
                    // B. CARGAR CONFIGURACIÓN GLOBAL (CRUCIAL PARA 13 SEMANAS)
                    // ============================================================
                    // Es vital llamar a esto ANTES de inicializarDropdowns
                    await cargarConfiguracionSistema(); 
                    
                    // C. Inicializar Dropdowns Estáticos (Ahora ya saben si mostrar el 13)
                    await inicializarDropdowns();

                    // D. Aplicar permisos visuales según el rol
                    aplicarPermisosUI(currentUserData.role);

                    // E. Manejo de MFA (YubiKey) o Entrada Directa
                    if (currentUserData.mfaEnabled === true) {
                        // Si tiene MFA activo, verificamos antes de mostrar la App
                        loginScreen.classList.add('hidden');
                        showProcessingOverlay(true, "Verificando llave de seguridad...");
                        
                        const mfaExitoso = await verificarYubiKey();
                        
                        if (mfaExitoso) {
                            showProcessingOverlay(false);
                            mainApp.classList.remove('hidden');
                            updateConnectionStatus();
                            resetInactivityTimer();
                            showView('view-main-menu');
                        } else {
                            showProcessingOverlay(false);
                            alert("Falló la verificación de seguridad. Cerrando sesión.");
                            auth.signOut();
                        }
                    } else {
                        // Usuario normal: Entrar directo
                        loginScreen.classList.add('hidden');
                        mainApp.classList.remove('hidden');
                        updateConnectionStatus();
                        resetInactivityTimer();
                        showView('view-main-menu');
                    }

                } else {
                    console.warn("Datos de usuario incompletos o error de lectura.");
                    alert("Error al cargar tu perfil. Verifica tu conexión o contacta a soporte.");
                    auth.signOut();
                }

            } catch (error) {
                console.error("Error crítico al inicializar:", error);
                // Si falla algo crítico, regresamos al login por seguridad
                if(mainApp) mainApp.classList.add('hidden');
                if(loginScreen) loginScreen.classList.remove('hidden');
            }

        } else {
            // --- USUARIO DESLOGUEADO ---
            currentUser = null;
            currentUserData = null;
            configSistema = { oferta13Semanas: false }; // Resetear config global por seguridad

            clearTimeout(inactivityTimer);
            
            if (mainApp) mainApp.classList.add('hidden');
            if (loginScreen) loginScreen.classList.remove('hidden');

            // Restaurar botón de login
            const loginButton = document.querySelector('#login-form button[type="submit"]');
            if (loginButton) showButtonLoading(loginButton, false);

            const authStatus = document.getElementById('auth-status');
            if (authStatus) {
                authStatus.textContent = '';
                authStatus.classList.add('hidden');
            }
        }
    });
});

///==============================================///
  ///  EVENT LISTENERS ---- DISPARADORES ///
///==============================================///
function setupEventListeners() {
    console.log('Configurando event listeners...');
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('¿Estás seguro de que deseas cerrar la sesión?')) {
                auth.signOut();
            }
        });
    }

    const btnRegisterYubiKey = document.getElementById('btn-register-yubikey');
    if (btnRegisterYubiKey) {
        btnRegisterYubiKey.addEventListener('click', registrarYubiKey);
    }

    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function () {
            if (this.type === 'button' && this.closest('#form-cliente') && !editingClientId) {
            } else if (this.closest('.menu-card')) {
                if (this.getAttribute('data-view') === 'view-cliente') {
                    resetClientForm();
                }
            }
            showView(this.getAttribute('data-view'));
        });
    });

    // Gestión Clientes
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnAplicarFiltros) btnAplicarFiltros.addEventListener('click', loadClientesTable);
    const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');
    if (btnLimpiarFiltros) btnLimpiarFiltros.addEventListener('click', limpiarFiltrosClientes);
    const sucursalFiltroClientes = document.getElementById('sucursal_filtro');
    if (sucursalFiltroClientes) {
        sucursalFiltroClientes.addEventListener('change', (e) => _actualizarDropdownGrupo('grupo_filtro', e.target.value, 'Todos'));
    }

    // Gestión Usuarios
    const btnAplicarFiltrosUsuarios = document.getElementById('btn-aplicar-filtros-usuarios');
    if (btnAplicarFiltrosUsuarios) btnAplicarFiltrosUsuarios.addEventListener('click', loadUsersTable);
    const btnLimpiarFiltrosUsuarios = document.getElementById('btn-limpiar-filtros-usuarios');
    if (btnLimpiarFiltrosUsuarios) btnLimpiarFiltrosUsuarios.addEventListener('click', limpiarFiltrosUsuarios);
    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    if (btnNuevoUsuario) btnNuevoUsuario.addEventListener('click', () => mostrarFormularioUsuario());
    const btnVerificarDuplicados = document.getElementById('btn-verificar-duplicados');
    if (btnVerificarDuplicados) btnVerificarDuplicados.addEventListener('click', handleVerificarDuplicados);
    const btnCancelarUsuario = document.getElementById('btn-cancelar-usuario');
    if (btnCancelarUsuario) btnCancelarUsuario.addEventListener('click', ocultarFormularioUsuario);
    const formUsuario = document.getElementById('form-usuario');
    if (formUsuario) formUsuario.addEventListener('submit', handleUserForm);
    const officeUsuarioForm = document.getElementById('nuevo-sucursal'); // <-- CAMBIO DE sucursalUsuarioForm A officeUsuarioForm
    if (officeUsuarioForm) {
        officeUsuarioForm.addEventListener('change', (e) => _cargarRutasParaUsuario(e.target.value));
    }
    // const btnDiagnosticarPagos = document.getElementById('btn-diagnosticar-pagos'); // Ya eliminado

    // Importar
    const officeSelect = document.getElementById('office-select');
    if (officeSelect) officeSelect.addEventListener('change', handleOfficeChange);
    document.querySelectorAll('.import-tab').forEach(tab => tab.addEventListener('click', handleTabClick));
    const btnProcesarImportacion = document.getElementById('btn-procesar-importacion');
    if (btnProcesarImportacion) btnProcesarImportacion.addEventListener('click', handleImport);
    // const btnLimpiarDatos = document.getElementById('btn-limpiar-datos'); // Sin cambios

    // Registrar Cliente
    const formCliente = document.getElementById('form-cliente');
    if (formCliente) formCliente.addEventListener('submit', handleClientForm);
    const curpCliente = document.getElementById('curp_cliente');
    if (curpCliente) curpCliente.addEventListener('input', () => validarCURP(curpCliente));
    const officeCliente = document.getElementById('office_cliente'); // Listener ya existente y correcto
    if (officeCliente) officeCliente.addEventListener('change', handleOfficeChangeForClientForm);

    // Generar Crédito
    const btnBuscarClienteColocacion = document.getElementById('btnBuscarCliente_colocacion');
    if (btnBuscarClienteColocacion) btnBuscarClienteColocacion.addEventListener('click', handleSearchClientForCredit);
    const formCreditoSubmit = document.getElementById('form-credito-submit');
    if (formCreditoSubmit) formCreditoSubmit.addEventListener('submit', handleCreditForm);
    const curpAvalColocacion = document.getElementById('curpAval_colocacion');
    if (curpAvalColocacion) curpAvalColocacion.addEventListener('input', () => validarCURP(curpAvalColocacion));
    const montoColocacion = document.getElementById('monto_colocacion');
    if (montoColocacion) montoColocacion.addEventListener('change', calcularMontoTotalColocacion);
    const plazoColocacion = document.getElementById('plazo_colocacion');
    if (plazoColocacion) plazoColocacion.addEventListener('change', calcularMontoTotalColocacion);

    // Registrar Pago
    const btnBuscarCreditoCobranza = document.getElementById('btnBuscarCredito_cobranza');
    if (btnBuscarCreditoCobranza) btnBuscarCreditoCobranza.addEventListener('click', handleSearchCreditForPayment);
    const formPagoSubmit = document.getElementById('form-pago-submit');
    if (formPagoSubmit) formPagoSubmit.addEventListener('submit', handlePaymentForm);
    const montoCobranza = document.getElementById('monto_cobranza');
    if (montoCobranza) montoCobranza.addEventListener('input', handleMontoPagoChange);

    // Pago Grupal
    // *** NUEVOS LISTENERS PARA COBRANZA RUTA ***
    const btnCalcularRuta = document.getElementById('btn-calcular-cobranza-ruta');
    if (btnCalcularRuta) btnCalcularRuta.addEventListener('click', handleCalcularCobranzaRuta);

    const btnGuardarOffline = document.getElementById('btn-guardar-cobranza-offline');
    if (btnGuardarOffline) btnGuardarOffline.addEventListener('click', handleGuardarCobranzaOffline);

    const btnRegistrarOffline = document.getElementById('btn-registrar-pagos-offline');
     // O se podría añadir aquí y llamar a handleRegistroPagoGrupal directamente
     if (btnRegistrarOffline) btnRegistrarOffline.addEventListener('click', handleRegistroPagoGrupal); // Llamar a la función existente

    // Reportes Básicos
    const btnActualizarReportes = document.getElementById('btn-actualizar-reportes');
    if (btnActualizarReportes) btnActualizarReportes.addEventListener('click', () => loadBasicReports(currentUserData?.office));

    // Reportes Avanzados
    const btnAplicarFiltrosReportes = document.getElementById('btn-aplicar-filtros-reportes');
    if (btnAplicarFiltrosReportes) btnAplicarFiltrosReportes.addEventListener('click', loadAdvancedReports);
    const btnExportarCsv = document.getElementById('btn-exportar-csv');
    if (btnExportarCsv) btnExportarCsv.addEventListener('click', exportToCSV);
    const btnExportarPdf = document.getElementById('btn-exportar-pdf');
    if (btnExportarPdf) btnExportarPdf.addEventListener('click', exportToPDF);
    const btnLimpiarFiltrosReportes = document.getElementById('btn-limpiar-filtros-reportes');
    if (btnLimpiarFiltrosReportes) btnLimpiarFiltrosReportes.addEventListener('click', limpiarFiltrosReportes);
    const sucursalFiltroReportes = document.getElementById('sucursal_filtro_reporte');
    if (sucursalFiltroReportes) {
        sucursalFiltroReportes.addEventListener('change', (e) => {
             _actualizarDropdownGrupo('grupo_filtro_reporte', e.target.value, 'Todos');
        });
    }

    // Reportes Gráficos
    const btnGenerarGrafico = document.getElementById('btn-generar-grafico');
    if (btnGenerarGrafico) btnGenerarGrafico.addEventListener('click', handleGenerarGrafico);
    const sucursalGrafico = document.getElementById('grafico_sucursal');
    if (sucursalGrafico) {
        sucursalGrafico.addEventListener('change', (e) => _actualizarDropdownGrupo('grafico_grupo', e.target.value, 'Todos'));
    }

    // ---- Configuración ----
        const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => document.getElementById('generic-modal').classList.add('hidden'));
    const modalOverlay = document.getElementById('generic-modal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) {
                modalOverlay.classList.add('hidden');
            }
        });
    }

    const formRegistrarGasto = document.getElementById('form-registrar-gasto');
    if (formRegistrarGasto) {
        formRegistrarGasto.addEventListener('submit', handleRegistrarGasto);
    }

    const formRegistrarEntrega = document.getElementById('form-registrar-entrega');
    if (formRegistrarEntrega) {
        formRegistrarEntrega.addEventListener('submit', handleRegistrarEntregaInicial);
    }

    const btnBuscarMovimientos = document.getElementById('btn-buscar-movimientos');
    if (btnBuscarMovimientos) {
        btnBuscarMovimientos.addEventListener('click', handleBuscarMovimientos);
    }

    const btnGenerarReporteContable = document.getElementById('btn-generar-reporte-contable');
    if (btnGenerarReporteContable) btnGenerarReporteContable.addEventListener('click', handleGenerarReporteContable);

    const btnImprimirReporteContable = document.getElementById('btn-imprimir-reporte-contable');
    if (btnImprimirReporteContable) btnImprimirReporteContable.addEventListener('click', () => window.print());

    const sucursalReporteContable = document.getElementById('reporte-contable-sucursal');
    if (sucursalReporteContable) sucursalReporteContable.addEventListener('change', handleSucursalReporteContableChange);

    const btnExportarTelefonos = document.getElementById('btn-exportar-telefonos');
    if (btnExportarTelefonos) btnExportarTelefonos.addEventListener('click', handleExportarTelefonos); 

    // LISTENER para botón Generar Corte
    const btnGenerarCorte = document.getElementById('btn-generar-corte');
    if(btnGenerarCorte) {
    btnGenerarCorte.addEventListener('click', loadHojaCorte);

    }

    // LISTENER botón buscar Cliente Offline
    const btnSyncOffline = document.getElementById('btn-sync-offline');

    if (btnSyncOffline) {
        btnSyncOffline.addEventListener('click', async () => {
        // 1. Validar conexión
        if (!navigator.onLine) {
            alert("⚠️ Necesitas internet para descargar los datos por primera vez.");
            return;
        }

        if (!currentUserData) {
            alert("⚠️ Espera a que cargue tu sesión.");
            return;
        }

        // 2. Feedback Visual (Bloquear pantalla)
        showProcessingOverlay(true, "📥 Descargando cartera de clientes y créditos...\nEsto puede tardar unos segundos.");

        try {
            // 3. Ejecutar Sincronización
            const resultado = await database.sincronizarDatosComercial(
                currentUserData.office, 
                currentUserData.ruta
            );

            if (resultado.success) {
                // Éxito
                alert(`✅ ¡Listo! Datos sincronizados.\n\n${resultado.total} registros guardados en tu dispositivo.\n\nYa puedes apagar tus datos y trabajar: Registrar Clientes, Cobrar y Ver Gestión.`);
            } else {
                // Error controlado
                alert(`❌ Error al sincronizar: ${resultado.message}`);
            }

        } catch (error) {
            console.error(error);
            alert("❌ Ocurrió un error de conexión inesperado.");
        } finally {
            showProcessingOverlay(false);
        }
    });
}
    
}

console.log('app.js cargado correctamente y listo.');













