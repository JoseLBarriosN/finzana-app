// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN CON FIREBASE - CORREGIDO COMPLETO
// =============================================

let currentUser = null;
let currentUserData = null; // Para almacenar los datos del usuario logueado
let creditoActual = null; // Almacenará el objeto COMPLETO del crédito seleccionado (incluyendo Firestore ID y historicalIdCredito)
let currentImportTab = 'clientes';
let reportData = null;
let cargaEnProgreso = false;
let currentSearchOperation = null;
let editingClientId = null;
let editingUserId = null;
let isOnline = true;
let inactivityTimer; // Temporizador para el cierre de sesión por inactividad
let grupoDePagoActual = null; // Para la nueva función de pago grupal
let currentChart = null; // Para la nueva función de gráficos

/**
 * Parsea de forma robusta una fecha que puede ser un string (ISO 8601, yyyy-mm-dd, etc.)
 * o un objeto Timestamp de Firestore. Esta función es la clave para corregir las fechas existentes en la DB.
 * @param {string|object} fechaInput La cadena de texto o el objeto de fecha.
 * @returns {Date|null} Un objeto Date válido o null si el formato es incorrecto.
 */
function parsearFecha(fechaInput) {
    if (!fechaInput) return null;
    if (fechaInput instanceof Date) return fechaInput;
    if (typeof fechaInput === 'object' && typeof fechaInput.toDate === 'function') return fechaInput.toDate(); // Soporte para Timestamps de Firestore

    if (typeof fechaInput === 'string') {
        const fechaStr = fechaInput.trim();
        // Prioridad 1: Formato ISO 8601 (el más confiable) YYYY-MM-DDTHH:mm:ss.sssZ
        if (fechaStr.includes('T') && fechaStr.includes('Z') && fechaStr.length > 10) {
            const fecha = new Date(fechaStr);
            if (!isNaN(fecha.getTime())) return fecha;
        }

        // Prioridad 2: YYYY-MM-DD (sin hora)
        if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
            const fecha = new Date(fechaStr + 'T00:00:00Z'); // Interpretar como UTC
            if (!isNaN(fecha.getTime())) return fecha;
        }


        // Prioridad 3: Formatos con guiones o slashes (DD-MM-YYYY, MM/DD/YYYY etc.)
        const separador = fechaStr.includes('/') ? '/' : '-';
        const partes = fechaStr.split('T')[0].split(separador); // Ignorar hora si la hubiera


        if (partes.length === 3) {
            const [p1, p2, p3] = partes.map(p => parseInt(p, 10));
            if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
                let anio, mes, dia;
                // Intentar DD-MM-YYYY
                if (p3 > 1000 && p1 <= 31 && p2 <= 12) {
                    anio = p3; dia = p1; mes = p2;
                }
                // Intentar YYYY-MM-DD (ya cubierto arriba, pero por si acaso)
                else if (p1 > 1000 && p2 <= 12 && p3 <= 31) {
                    anio = p1; mes = p2; dia = p3;
                }
                // Intentar MM-DD-YYYY
                else if (p3 > 1000 && p1 <= 12 && p2 <= 31) {
                    anio = p3; mes = p1; dia = p2;
                }


                if (anio && mes && dia && mes > 0 && mes <= 12 && dia > 0 && dia <= 31) {
                    // Verificar validez del día para el mes y año
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
    // Usar UTC para evitar problemas de zona horaria al mostrar
    const dia = String(dateObj.getUTCDate()).padStart(2, '0');
    const mes = String(dateObj.getUTCMonth() + 1).padStart(2, '0'); // Meses son 0-11
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
    // Habilitar/deshabilitar filtros que dependen de queries más complejos online
    const filtrosOnline = document.querySelectorAll('#sucursal_filtro, #estado_credito_filtro, #plazo_filtro, #curp_aval_filtro, #grupo_filtro, #tipo_colocacion_filtro');
    const botonesOnline = document.querySelectorAll('#btn-aplicar-filtros-reportes, #btn-exportar-csv, #btn-exportar-pdf, #btn-generar-grafico, #btn-verificar-duplicados'); // Añadir más si aplica

    if (isOnline) {
        statusDiv.textContent = 'Conexión restablecida. Sincronizando datos...';
        statusDiv.className = 'connection-status online';
        statusDiv.classList.remove('hidden'); // Asegurar que sea visible
        logoutBtn.disabled = false;
        logoutBtn.title = 'Cerrar Sesión';
        filtrosOnline.forEach(el => { if (el) el.disabled = false; });
        botonesOnline.forEach(el => { if (el) el.disabled = false; });

        // Mensaje temporal de sincronización
        setTimeout(() => {
            // Verificar si sigue online antes de mostrar "sincronizado"
            if (navigator.onLine) {
                statusDiv.textContent = 'Datos sincronizados correctamente.';
                // Ocultar después de un tiempo
                setTimeout(() => {
                    // Solo ocultar si sigue online
                    if (navigator.onLine) {
                        statusDiv.classList.add('hidden');
                    }
                }, 2500);
            }
        }, 3000);
    } else {
        statusDiv.textContent = 'Modo sin conexión. Búsquedas por CURP, Nombre e ID Crédito habilitadas.';
        statusDiv.className = 'connection-status offline';
        statusDiv.classList.remove('hidden'); // Asegurar que sea visible
        logoutBtn.disabled = true;
        logoutBtn.title = 'No puedes cerrar sesión sin conexión';
        filtrosOnline.forEach(el => { if (el) el.disabled = true; });
        botonesOnline.forEach(el => { if (el) el.disabled = true; });
    }
}

// =============================================
// *** INICIO DE LA CORRECCIÓN 1: FUNCIÓN FALTANTE ***
// =============================================

/**
 * Calcula el estado actual de un crédito (atraso, estado, etc.) basado en sus pagos.
 * @param {object} credito El objeto de crédito de Firestore.
 * @param {Array<object>} pagos Un array de objetos de pago para ese crédito.
 * @returns {object|null} Un objeto con { estado, semanasAtraso, pagoSemanal, saldoRestante, proximaFechaPago } o null si hay error.
 */
function _calcularEstadoCredito(credito, pagos) {
    if (!credito || !credito.montoTotal || !credito.plazo || credito.plazo <= 0 || !credito.fechaCreacion) {
        console.warn("Datos de crédito insuficientes para calcular estado:", credito);
        return null; // Datos insuficientes
    }

    const pagoSemanal = credito.montoTotal / credito.plazo;
    const saldoRestante = credito.saldo !== undefined ? credito.saldo : 0; // Usar saldo del objeto crédito

    // 1. Estado Liquidado
    if (credito.estado === 'liquidado' || saldoRestante <= 0.01) {
        return {
            estado: 'liquidado',
            semanasAtraso: 0,
            pagoSemanal: pagoSemanal,
            saldoRestante: saldoRestante,
            proximaFechaPago: 'N/A'
        };
    }

    const fechaCreacion = parsearFecha(credito.fechaCreacion);
    if (!fechaCreacion) {
        console.warn("Fecha de creación de crédito inválida:", credito.fechaCreacion);
        return null; // Fecha inválida
    }

    const hoy = new Date();
    // Calcular semanas transcurridas desde el inicio
    const msTranscurridos = hoy.getTime() - fechaCreacion.getTime();
    const semanasTranscurridas = Math.floor(msTranscurridos / (1000 * 60 * 60 * 24 * 7));

    // Calcular semanas pagadas (basado en monto total pagado)
    const montoPagadoTotal = credito.montoTotal - saldoRestante; // Más preciso que sumar pagos
    let semanasPagadas = 0;
    if (pagoSemanal > 0) {
        semanasPagadas = Math.floor(montoPagadoTotal / pagoSemanal);
    }
    
    // Asegurar que las semanas pagadas no superen el plazo
    semanasPagadas = Math.min(semanasPagadas, credito.plazo);

    // Calcular semanas de atraso
    let semanasAtraso = semanasTranscurridas - semanasPagadas;
    semanasAtraso = Math.max(0, semanasAtraso); // No puede ser negativo
    
    // Si el crédito ya terminó (semanas transcurridas > plazo) y no está liquidado, el atraso es el restante
    if (semanasTranscurridas >= credito.plazo) {
         // El atraso es el total del plazo menos lo que pagó
        semanasAtraso = credito.plazo - semanasPagadas;
    }

    let estado;
    // Definir estado basado en el atraso (esta es la lógica de negocio)
    if (semanasAtraso === 0) {
        estado = 'al corriente';
    } else if (semanasAtraso >= 1 && semanasAtraso <= 4) {
        estado = 'atrasado';
    } else if (semanasAtraso >= 5 && semanasAtraso <= 8) {
        estado = 'cobranza';
    } else { // 9 o más
        estado = 'juridico';
    }

    // Calcular próxima fecha de pago
    let proximaFechaPago = 'N/A';
    if (semanasPagadas < credito.plazo) {
        const proximaFecha = new Date(fechaCreacion);
        proximaFecha.setUTCDate(proximaFecha.getUTCDate() + (semanasPagadas + 1) * 7);
        proximaFechaPago = formatDateForDisplay(proximaFecha);
    }

    return {
        estado: estado,
        semanasAtraso: semanasAtraso,
        pagoSemanal: pagoSemanal,
        saldoRestante: saldoRestante,
        proximaFechaPago: proximaFechaPago
    };
}

// =============================================
// *** FIN DE LA CORRECCIÓN 1 ***
// =============================================

// =============================================
// LÓGICA DE SEGURIDAD Y SESIÓN
// =============================================

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        if (currentUser) {
            alert("Sesión cerrada por inactividad.");
            auth.signOut();
        }
    }, 600000); // 10 minutos (10 * 60 * 1000 ms)
}

function setupSecurityListeners() {
    // Resetear en varias interacciones del usuario
    window.addEventListener('load', resetInactivityTimer);
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);
    document.addEventListener('touchstart', resetInactivityTimer);
    document.addEventListener('scroll', resetInactivityTimer); // Añadir scroll

    // Cancelar operaciones en progreso al intentar cerrar/recargar
    window.addEventListener('beforeunload', (event) => {
        if (cargaEnProgreso) {
            // No podemos *detener* el cierre, pero podemos intentar cancelar la operación interna
            cancelarCarga();
            // Algunos navegadores podrían mostrar un diálogo si se retorna un string,
            // pero su comportamiento es inconsistente.
            // event.returnValue = 'Hay una operación en progreso. ¿Seguro que quieres salir?';
            // return event.returnValue;
        }
    });
}

// =============================================
// FUNCIONES MOVIDAS ANTES DE DOMContentLoaded
// =============================================

// --- Funciones de Gestión de Clientes ---
async function loadClientesTable() {
    if (cargaEnProgreso) {
        showStatus('status_gestion_clientes', 'Ya hay una búsqueda en progreso. Por favor, espera.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    currentSearchOperation = Date.now();
    const operationId = currentSearchOperation;

    const tbody = document.getElementById('tabla-clientes');
    tbody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
    // =============================================
    // *** INICIO DE LA CORRECCIÓN 3 (Instancia 1) ***
    // =============================================
    showButtonLoading('#btn-aplicar-filtros', true, 'Buscando...');
    // =============================================
    // *** FIN DE LA CORRECCIÓN 3 (Instancia 1) ***
    // =============================================
    showFixedProgress(10, 'Iniciando búsqueda...');

    try {
        const filtros = {
            sucursal: document.getElementById('sucursal_filtro')?.value || '',
            curp: document.getElementById('curp_filtro')?.value?.trim() || '',
            nombre: document.getElementById('nombre_filtro')?.value?.trim() || '',
            idCredito: document.getElementById('id_credito_filtro')?.value?.trim() || '',
            estado: document.getElementById('estado_credito_filtro')?.value || '',
            curpAval: document.getElementById('curp_aval_filtro')?.value?.trim() || '',
            plazo: document.getElementById('plazo_filtro')?.value || '',
            grupo: document.getElementById('grupo_filtro')?.value || ''
        };

        const hayFiltros = Object.values(filtros).some(val => val && val.trim() !== '');
        if (!hayFiltros) {
            tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda.</td></tr>';
            throw new Error("Búsqueda vacía");
        }

        let creditosAMostrar = [];
        const clientesMap = new Map(); // Cache para client data

        showFixedProgress(25, 'Obteniendo datos base...');

        if (filtros.idCredito) {
            // --- PATH 1: Search by Credit ID (Historical ID) ---
            // Usar la función que busca por historicalIdCredito
            creditosAMostrar = await database.buscarCreditosPorHistoricalId(filtros.idCredito);
        } else if (filtros.curp || filtros.nombre || filtros.grupo || filtros.sucursal) {
            // --- PATH 2: Search by Client Filters ---
            const clientesIniciales = await database.buscarClientes({
                sucursal: filtros.sucursal,
                curp: filtros.curp, // Puede ser individual o múltiple separado por comas
                nombre: filtros.nombre,
                grupo: filtros.grupo
            });


            if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
            if (clientesIniciales.length === 0) throw new Error("No se encontraron clientes.");

            showFixedProgress(40, `Buscando créditos para ${clientesIniciales.length} clientes...`);

            let progress = 40;
            for (const [index, cliente] of clientesIniciales.entries()) {
                if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
                clientesMap.set(cliente.curp, cliente); // Cache client data
                const creditosDelCliente = await database.buscarCreditosPorCliente(cliente.curp);
                creditosAMostrar.push(...creditosDelCliente);

                progress = 40 + Math.round((index / clientesIniciales.length) * 30); // Ajustar progreso
                showFixedProgress(progress, `Revisando cliente ${index + 1} de ${clientesIniciales.length}`);
            }
        } else if (filtros.curpAval || filtros.plazo || filtros.estado) {
            // --- PATH 3: Search by Credit-Only Filters ---
            showFixedProgress(40, `Buscando créditos por filtros...`);
            // Nota: El filtro de estado de la DB puede no estar 100% actualizado,
            // la validación real se hace después con _calcularEstadoCredito
            creditosAMostrar = await database.buscarCreditos({
                // Pasar filtros relevantes a buscarCreditos
                estado: filtros.estado,
                curpAval: filtros.curpAval,
                plazo: filtros.plazo
                // No pasamos idCredito aquí porque ya se manejó
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6">Combinación de filtros no soportada o vacía.</td></tr>';
            throw new Error("Filtros inválidos");
        }


        if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");
        if (creditosAMostrar.length === 0) throw new Error("No se encontraron créditos que coincidan con los filtros iniciales.");

        showFixedProgress(70, `Procesando ${creditosAMostrar.length} créditos...`);
        tbody.innerHTML = '';
        let resultadosEncontrados = 0;
        let creditosProcesados = 0;

        // Ordenar créditos por fecha de creación, más reciente primero
        creditosAMostrar.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));

        for (const credito of creditosAMostrar) {
            if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");

            creditosProcesados++;
            const progress = 70 + Math.round((creditosProcesados / creditosAMostrar.length) * 30);
            showFixedProgress(progress, `Procesando crédito ${creditosProcesados} de ${creditosAMostrar.length}...`);

            // 1. Get Client Data (from cache or DB)
            let cliente = clientesMap.get(credito.curpCliente);
            if (!cliente) {
                cliente = await database.buscarClientePorCURP(credito.curpCliente);
                if (cliente) {
                    clientesMap.set(cliente.curp, cliente);
                } else {
                    // Crear un objeto cliente temporal si no se encuentra
                    cliente = { id: null, nombre: 'Cliente no encontrado', curp: credito.curpCliente, poblacion_grupo: credito.poblacion_grupo || 'N/A', office: credito.office || 'N/A', isComisionista: false };
                    console.warn(`No se encontró cliente para CURP ${credito.curpCliente} asociado al crédito ID Firestore ${credito.id}`);
                }
            }

            // 2. Get Payments & Calculate Status (using historicalIdCredito)
            const historicalId = credito.historicalIdCredito || credito.id; // Usar historical si existe, si no, el de Firestore (para nuevos)
            const pagos = await database.getPagosPorCredito(historicalId); // Busca pagos por ID histórico
            const estadoCalculado = _calcularEstadoCredito(credito, pagos); // Calcula estado basado en datos del crédito y sus pagos


            if (!estadoCalculado) {
                console.warn(`No se pudo calcular el estado para el crédito ID Firestore ${credito.id} (Histórico: ${historicalId})`);
                continue; // Saltar créditos con datos inconsistentes que impiden calcular estado
            }


            // 3. Apply secondary filters (filters not fully applied in the initial DB query)
            if (filtros.estado && estadoCalculado.estado !== filtros.estado) continue;
            if (filtros.plazo && credito.plazo != filtros.plazo) continue;
            if (filtros.curpAval && (!credito.curpAval || !credito.curpAval.toUpperCase().includes(filtros.curpAval.toUpperCase()))) continue;
            if (filtros.sucursal && cliente.office !== filtros.sucursal) continue; // Re-verificar sucursal del cliente
            if (filtros.grupo && cliente.poblacion_grupo !== filtros.grupo) continue; // Re-verificar grupo del cliente
            // Si se buscó por CURP/Nombre y la query inicial fue amplia (muchos clientes), re-verificar aquí
            if (filtros.curp && !filtros.curp.includes(',') && cliente.curp !== filtros.curp.toUpperCase()) continue;
            if (filtros.nombre && !(cliente.nombre || '').toLowerCase().includes(filtros.nombre.toLowerCase())) continue;
            // Si se buscó por ID histórico, ya está filtrado


            resultadosEncontrados++;

            // --- Build the Row ---

            const fechaInicioCredito = formatDateForDisplay(parsearFecha(credito.fechaCreacion));

            // Fecha del Último Pago de ESTE crédito (histórico)
            // Ordenar pagos de este crédito por fecha
            pagos.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
            const ultimoPago = pagos.length > 0 ? pagos[0] : null;
            const fechaUltimoPago = formatDateForDisplay(ultimoPago ? parsearFecha(ultimoPago.fecha) : null);

            const comisionistaBadge = cliente.isComisionista ? '<span class="comisionista-badge-cliente" title="Comisionista">★</span>' : '';
            const estadoClase = `status-${estadoCalculado.estado.replace(/\s/g, '-')}`;
            const estadoHTML = `<span class="info-value ${estadoClase}">${estadoCalculado.estado.toUpperCase()}</span>`;

            // Semanas pagadas (basado en monto pagado y pago semanal)
            let semanasPagadas = 0;
            const montoPagadoTotal = pagos.reduce((sum, pago) => sum + (pago.monto || 0), 0);
            if (estadoCalculado.pagoSemanal > 0) {
                semanasPagadas = Math.floor(montoPagadoTotal / estadoCalculado.pagoSemanal);
            }
            // Si está liquidado, mostrar plazo completo
            if (estadoCalculado.estado === 'liquidado' && credito.plazo) {
                semanasPagadas = credito.plazo;
            }

            // Saldo restante (basado en saldo del objeto crédito, que es el más actualizado)
            const saldoRestante = credito.saldo !== undefined ? credito.saldo : Math.max(0, (credito.montoTotal || 0) - montoPagadoTotal);


            // Botón de Historial de Pagos (pasa historicalId y CURP)
            const infoCreditoHTML = `
                <div class="credito-info">
                    <div class="info-grid">
                        <div class="info-item"><span class="info-label">ID Crédito (Hist):</span><span class="info-value">${historicalId}</span></div>
                        <div class="info-item"><span class="info-label">Estado:</span>${estadoHTML}</div>
                        <div class="info-item"><span class="info-label">Saldo Actual:</span><span class="info-value">$${saldoRestante.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                        <div class="info-item"><span class="info-label">Semanas Pagadas:</span><span class="info-value">${semanasPagadas} de ${credito.plazo || '?'}</span></div>
                        ${estadoCalculado.semanasAtraso > 0 ? `<div class="info-item"><span class="info-label">Semanas Atraso:</span><span class="info-value">${estadoCalculado.semanasAtraso}</span></div>` : ''}
                        <div class="info-item"><span class="info-label">Último Pago:</span><span class="info-value">${fechaUltimoPago}</span></div>
                        <div class="info-item"><span class="info-label">Nombre Aval:</span><span class="info-value">${credito.nombreAval || 'N/A'}</span></div>
                         <div class="info-item"><span class="info-label">CURP Aval:</span><span class="info-value">${credito.curpAval || 'N/A'}</span></div>
                    </div>
                    <button class="btn btn-sm btn-info" onclick="mostrarHistorialPagos('${historicalId}', '${credito.curpCliente}')" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-receipt"></i> Ver Historial de Pagos (${pagos.length})
                    </button>
                </div>`;

            // Construir fila HTML
            const rowHTML = `
                <tr>
                    <td><b>${cliente.office || 'N/A'}</b><br><small>Inicio Créd.: ${fechaInicioCredito}</small></td>
                    <td>${cliente.curp}</td>
                    <td>${cliente.nombre} ${comisionistaBadge}</td>
                    <td>${cliente.poblacion_grupo}</td>
                    <td>${infoCreditoHTML}</td>
                    <td class="action-buttons">
                        ${cliente.id ? `<button class="btn btn-sm btn-info" onclick="editCliente('${cliente.id}')" title="Editar Cliente"><i class="fas fa-edit"></i></button>` : ''}
                        ${cliente.id ? `<button class="btn btn-sm btn-danger" onclick="deleteCliente('${cliente.id}', '${cliente.nombre}')" title="Eliminar Cliente"><i class="fas fa-trash"></i></button>` : ''}
                        </td>
                </tr>`;
            tbody.insertAdjacentHTML('beforeend', rowHTML); // Usar insertAdjacentHTML para mejor rendimiento
        }

        if (resultadosEncontrados === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron créditos que coincidan con todos los criterios de filtro aplicados.</td></tr>';
        }

        showFixedProgress(100, `Búsqueda completada: ${resultadosEncontrados} resultados encontrados.`);

    } catch (error) {
        // Manejar errores conocidos de forma más amigable
        if (error.message === "Búsqueda cancelada") {
            tbody.innerHTML = '<tr><td colspan="6">Búsqueda cancelada por el usuario.</td></tr>';
            showStatus('status_gestion_clientes', 'Búsqueda cancelada.', 'info');
        } else if (error.message === "Búsqueda vacía" || error.message === "Filtros inválidos") {
            tbody.innerHTML = '<tr><td colspan="6">Por favor, especifica al menos un criterio de búsqueda válido.</td></tr>';
            showStatus('status_gestion_clientes', 'Especifica filtros para buscar.', 'warning');
        } else if (error.message === "No se encontraron clientes.") {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron clientes que coincidan con los filtros iniciales.</td></tr>';
            showStatus('status_gestion_clientes', 'No se encontraron clientes.', 'info');
        } else if (error.message === "No se encontraron créditos que coincidan con los filtros iniciales.") {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron créditos para los clientes/filtros especificados.</td></tr>';
            showStatus('status_gestion_clientes', 'No se encontraron créditos asociados.', 'info');
        } else {
            // Error inesperado
            console.error('Error en loadClientesTable:', error);
            tbody.innerHTML = `<tr><td colspan="6">Error al cargar los datos: ${error.message}. Revisa la consola para más detalles.</td></tr>`;
            showStatus('status_gestion_clientes', `Error: ${error.message}`, 'error');
        }
    } finally {
        // Asegurar que los indicadores de carga se detengan solo si esta operación específica terminó
        if (operationId === currentSearchOperation) {
            cargaEnProgreso = false;
            // =============================================
            // *** INICIO DE LA CORRECCIÓN 3 (Instancia 2) ***
            // =============================================
            showButtonLoading('#btn-aplicar-filtros', false);
            // =============================================
            // *** FIN DE LA CORRECCIÓN 3 (Instancia 2) ***
            // =============================================
            setTimeout(hideFixedProgress, 2000); // Ocultar barra después de un tiempo
        }
    }
}

function inicializarVistaGestionClientes() {
    const tbody = document.getElementById('tabla-clientes');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6">Utiliza los filtros para buscar y mostrar clientes/créditos.</td></tr>`;
    }
    // No resetear formulario de cliente aquí, se hace al ir a la vista 'view-cliente'
    // resetClientForm();
}

function limpiarFiltrosClientes() {
    if (cargaEnProgreso) {
        cancelarCarga(); // Cancelar búsqueda si está en progreso
    }
    // Limpiar campos del formulario de filtros
    const filtrosGrid = document.getElementById('filtros-grid');
    if (filtrosGrid) {
        filtrosGrid.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date') { // No limpiar fechas? O sí? Decisión: limpiarlas también.
                el.value = '';
            } else {
                el.value = ''; // Limpiar fechas
            }
        });
    }
    // Limpiar tabla y mensaje de estado
    inicializarVistaGestionClientes();
    showStatus('status_gestion_clientes', 'Filtros limpiados. Ingresa nuevos criterios para buscar.', 'info');
}

// --- Funciones de Reportes Avanzados ---
function inicializarVistaReportesAvanzados() {
    const tbody = document.getElementById('tabla-reportes_avanzados');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10">Aplica los filtros para generar el reporte.</td></tr>';
    }
    // Establecer fechas por defecto (ej. último mes)
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate() + 1); // +1 para incluir hoy si es el mismo día del mes anterior
    const hoyISO = hoy.toISOString().split('T')[0];
    const haceUnMesISO = haceUnMes.toISOString().split('T')[0];

    const fechaInicio = document.getElementById('fecha_inicio_reporte');
    const fechaFin = document.getElementById('fecha_fin_reporte');

    if (fechaInicio) fechaInicio.value = haceUnMesISO;
    if (fechaFin) fechaFin.value = hoyISO;

    // Limpiar datos de reporte anterior y estadísticas
    reportData = null;
    const estadisticasElement = document.getElementById('estadisticas-reporte');
    if (estadisticasElement) estadisticasElement.innerHTML = '';
    showStatus('status_reportes_avanzados', 'Filtros inicializados. Presiona "Generar Reporte".', 'info');
}

function limpiarFiltrosReportes() {
    if (cargaEnProgreso) {
        cancelarCarga(); // Cancelar si se está generando un reporte
    }

    // Limpiar campos de filtro
    const filtrosContainer = document.getElementById('filtros-reportes-avanzados');
    if (filtrosContainer) {
        filtrosContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date') { // No resetear fechas aquí, lo hace inicializarVista
                el.value = '';
            }
        });
    }

    // Resetear fechas y tabla
    inicializarVistaReportesAvanzados();
    showStatus('status_reportes_avanzados', 'Filtros limpiados. Selecciona nuevos criterios y genera el reporte.', 'info');
}

async function loadAdvancedReports() {
    if (cargaEnProgreso) {
        showStatus('status_reportes_avanzados', 'Ya hay una generación de reporte en progreso. Espera a que termine.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    currentSearchOperation = Date.now(); // Usar para cancelación si es necesario
    const operationId = currentSearchOperation;


    showProcessingOverlay(true, 'Generando reporte avanzado...');
    showButtonLoading('btn-aplicar-filtros-reportes', true, 'Generando...');
    showFixedProgress(20, 'Recopilando filtros...');
    const statusReportes = document.getElementById('status_reportes_avanzados');
    statusReportes.innerHTML = 'Aplicando filtros y buscando datos...';
    statusReportes.className = 'status-message status-info';
    // Limpiar tabla y estadísticas previas
    document.getElementById('tabla-reportes_avanzados').innerHTML = '<tr><td colspan="10">Generando reporte...</td></tr>';
    document.getElementById('estadisticas-reporte').innerHTML = '';
    reportData = null; // Limpiar datos anteriores


    try {
        // Recoger filtros de la UI
        const filtros = {
            sucursal: document.getElementById('sucursal_filtro_reporte')?.value || '',
            grupo: document.getElementById('grupo_filtro_reporte')?.value || '',
            ruta: document.getElementById('ruta_filtro_reporte')?.value || '',
            tipoCredito: document.getElementById('tipo_credito_filtro_reporte')?.value || '',
            estadoCredito: document.getElementById('estado_credito_filtro_reporte')?.value || '',
            tipoPago: document.getElementById('tipo_pago_filtro_reporte')?.value || '',
            fechaInicio: document.getElementById('fecha_inicio_reporte')?.value || '',
            fechaFin: document.getElementById('fecha_fin_reporte')?.value || '',
            curpCliente: document.getElementById('curp_filtro_reporte')?.value.trim().toUpperCase() || '',
            idCredito: document.getElementById('id_credito_filtro_reporte')?.value.trim() || '' // ID Histórico
        };


        // Validación simple de fechas
        if (filtros.fechaInicio && filtros.fechaFin && new Date(filtros.fechaInicio) > new Date(filtros.fechaFin)) {
            throw new Error("La fecha de inicio no puede ser posterior a la fecha de fin.");
        }


        showFixedProgress(50, 'Consultando base de datos...');
        // Llamar a la función de database.js
        const data = await database.generarReporteAvanzado(filtros);

        // Verificar si la operación fue cancelada mientras se esperaba
        if (operationId !== currentSearchOperation) throw new Error("Búsqueda cancelada");

        reportData = data; // Guardar datos para exportación

        showFixedProgress(80, 'Mostrando resultados...');
        mostrarReporteAvanzado(reportData); // Función para dibujar la tabla
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
        hideFixedProgress(); // Ocultar progreso en error también
    } finally {
        // Asegurar que se detenga el estado de carga solo si esta operación terminó
        if (operationId === currentSearchOperation) {
            cargaEnProgreso = false;
            showProcessingOverlay(false);
            showButtonLoading('btn-aplicar-filtros-reportes', false);
            setTimeout(hideFixedProgress, 2000); // Ocultar barra después de un tiempo
        }
    }
}

function mostrarReporteAvanzado(data) {
    const tbody = document.getElementById('tabla-reportes_avanzados');
    const estadisticasElement = document.getElementById('estadisticas-reporte');
    if (!tbody || !estadisticasElement) return;

    tbody.innerHTML = ''; // Limpiar tabla
    estadisticasElement.innerHTML = ''; // Limpiar estadísticas

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10">No se encontraron datos con los filtros aplicados.</td></tr>';
        return;
    }

    // Renderizar filas de la tabla
    data.forEach(item => {
        const tr = document.createElement('tr');

        // Formatear fechas
        const fechaRegistro = formatDateForDisplay(parsearFecha(item.fechaRegistro));
        const fechaCreacion = formatDateForDisplay(parsearFecha(item.fechaCreacion));
        const fechaPago = formatDateForDisplay(parsearFecha(item.fecha));
        // Usar ID histórico si existe
        const idCreditoMostrar = item.historicalIdCredito || item.idCredito || item.id || '';


        let rowContent = '';
        if (item.tipo === 'cliente') {
            rowContent = `
                <td>CLIENTE</td>
                <td>${item.curp || ''}</td>
                <td>${item.nombre || ''}</td>
                <td>${item.poblacion_grupo || ''}</td>
                <td>${item.ruta || ''}</td>
                <td>${item.office || ''}</td>
                <td>${fechaRegistro}</td>
                <td>Registro</td>
                <td>-</td>
                <td>-</td>
                <td>-</td> `;
        } else if (item.tipo === 'credito') {
            rowContent = `
                <td>CRÉDITO</td>
                <td>${item.curpCliente || ''}</td>
                <td>${item.nombreCliente || ''}</td>
                <td>${item.poblacion_grupo || ''}</td>
                <td>${item.ruta || ''}</td>
                <td>${item.office || ''}</td>
                <td>${fechaCreacion}</td>
                <td>${item.tipo || 'Colocación'}</td>
                <td>$${(item.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>$${(item.saldo !== undefined ? item.saldo : 'N/A').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                 <td>${idCreditoMostrar}</td>
            `;
        } else if (item.tipo === 'pago') {
            rowContent = `
                <td>PAGO</td>
                <td>${item.curpCliente || ''}</td>
                <td>${item.nombreCliente || ''}</td>
                <td>${item.poblacion_grupo || ''}</td>
                <td>${item.ruta || ''}</td>
                <td>${item.office || ''}</td>
                <td>${fechaPago}</td>
                <td>${item.tipoPago || 'Pago'}</td>
                <td>$${(item.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>$${(item.saldoDespues !== undefined ? item.saldoDespues : 'N/A').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                 <td>${idCreditoMostrar}</td>
            `;
        }

        tr.innerHTML = rowContent;
        tbody.appendChild(tr);
    });

    // Calcular y mostrar estadísticas
    const totalRegistros = data.length;
    const totalClientes = new Set(data.filter(item => item.tipo === 'cliente').map(item => item.curp)).size; // Contar clientes únicos
    const totalCreditos = new Set(data.filter(item => item.tipo === 'credito').map(item => item.historicalIdCredito || item.id)).size; // Contar créditos únicos
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

function exportToCSV() {
    if (!reportData || reportData.length === 0) {
        showStatus('status_reportes_avanzados', 'No hay datos para exportar. Genera un reporte primero.', 'warning');
        return;
    }

    showProcessingOverlay(true, 'Generando archivo CSV...');
    showButtonLoading('btn-exportar-csv', true, 'Generando...');
    showFixedProgress(50, 'Preparando datos...');

    try {
        // Añadir ID Histórico al header y a las filas
        const headers = ['Tipo', 'CURP', 'Nombre', 'Grupo/Población', 'Ruta', 'Sucursal', 'Fecha', 'Tipo Operación', 'Monto', 'Saldo', 'ID Crédito (Hist)'];
        let csvContent = headers.join(',') + '\n';

        showFixedProgress(70, 'Convirtiendo datos a CSV...');
        reportData.forEach(item => {
            let row = [];
            const fechaRegistro = formatDateForDisplay(parsearFecha(item.fechaRegistro));
            const fechaCreacion = formatDateForDisplay(parsearFecha(item.fechaCreacion));
            const fechaPago = formatDateForDisplay(parsearFecha(item.fecha));
            const idCreditoMostrar = item.historicalIdCredito || item.idCredito || item.id || '';
            // Función auxiliar para escapar comas y comillas en campos de texto
            const escapeCSV = (field) => {
                if (field === undefined || field === null) return '';
                let str = String(field);
                // Si contiene comillas, coma o nueva línea, encerrar entre comillas y duplicar comillas internas
                if (str.includes('"') || str.includes(',') || str.includes('\n')) {
                    str = `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };


            if (item.tipo === 'cliente') {
                row = [
                    'CLIENTE',
                    escapeCSV(item.curp),
                    escapeCSV(item.nombre),
                    escapeCSV(item.poblacion_grupo),
                    escapeCSV(item.ruta),
                    escapeCSV(item.office),
                    fechaRegistro,
                    'Registro',
                    '', // Monto
                    '', // Saldo
                    '' // ID Crédito
                ];
            } else if (item.tipo === 'credito') {
                row = [
                    'CRÉDITO',
                    escapeCSV(item.curpCliente),
                    escapeCSV(item.nombreCliente),
                    escapeCSV(item.poblacion_grupo),
                    escapeCSV(item.ruta),
                    escapeCSV(item.office),
                    fechaCreacion,
                    escapeCSV(item.tipo || 'Colocación'),
                    item.monto || 0,
                    item.saldo !== undefined ? item.saldo : '',
                    escapeCSV(idCreditoMostrar)
                ];
            } else if (item.tipo === 'pago') {
                row = [
                    'PAGO',
                    escapeCSV(item.curpCliente),
                    escapeCSV(item.nombreCliente),
                    escapeCSV(item.poblacion_grupo),
                    escapeCSV(item.ruta),
                    escapeCSV(item.office),
                    fechaPago,
                    escapeCSV(item.tipoPago || 'Pago'),
                    item.monto || 0,
                    item.saldoDespues !== undefined ? item.saldoDespues : '',
                    escapeCSV(idCreditoMostrar)
                ];
            }

            csvContent += row.join(',') + '\n';
        });

        showFixedProgress(90, 'Creando archivo descargable...');
        // Crear Blob con BOM para mejor compatibilidad Excel con acentos/ñ
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) { // Check for download attribute support
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.setAttribute('download', `reporte_finzana_${timestamp}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url); // Liberar memoria
        } else {
            // Fallback para navegadores antiguos (puede abrir en la misma pestaña)
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
        showButtonLoading('btn-exportar-csv', false);
        setTimeout(hideFixedProgress, 2000);
    }
}

function exportToPDF() {
    if (!reportData || reportData.length === 0) {
        alert('No hay datos para exportar. Genera un reporte primero.');
        return;
    }

    showProcessingOverlay(true, 'Generando archivo PDF...');
    showButtonLoading('btn-exportar-pdf', true, 'Generando...');
    showFixedProgress(30, 'Preparando contenido para PDF...');

    try {
        const tableElement = document.getElementById('tabla-reportes_avanzados');
        const titleElement = document.querySelector('#view-reportes-avanzados h2');
        const filtersElement = document.getElementById('filtros-reportes-avanzados'); // Para incluir filtros aplicados
        const statsElement = document.getElementById('estadisticas-reporte');


        if (!tableElement) {
            throw new Error('No se encontró la tabla del reporte para exportar.');
        }

        // Crear un contenedor temporal para el contenido del PDF
        const contentForPdf = document.createElement('div');
        contentForPdf.style.padding = '20px'; // Añadir padding
        contentForPdf.style.fontFamily = 'Arial, sans-serif'; // Fuente común para PDF
        contentForPdf.style.fontSize = '10px'; // Tamaño base más pequeño para PDF


        // Añadir Título
        if (titleElement) {
            const titleClone = titleElement.cloneNode(true);
            titleClone.style.textAlign = 'center';
            titleClone.style.marginBottom = '15px';
            contentForPdf.appendChild(titleClone);
        }


        // Añadir Resumen de Filtros (Opcional, pero útil)
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

        // Añadir Estadísticas
        if (statsElement) {
            const statsClone = statsElement.cloneNode(true);
            statsClone.style.marginBottom = '15px';
            // Quitar clases de status message para que no tenga fondo/borde de color
            statsClone.querySelector('div')?.classList.remove('status-message', 'status-info', 'status-success', 'status-warning', 'status-error');
            contentForPdf.appendChild(statsClone);
        }


        // Clonar tabla y ajustar estilos para PDF
        const tableClone = tableElement.cloneNode(true);
        tableClone.style.width = '100%';
        tableClone.style.borderCollapse = 'collapse';
        tableClone.querySelectorAll('th, td').forEach(cell => {
            cell.style.border = '1px solid #ddd';
            cell.style.padding = '4px 6px';
            cell.style.fontSize = '9px'; // Reducir tamaño de fuente en tabla
        });
        tableClone.querySelector('thead').style.backgroundColor = '#f2f2f2';
        contentForPdf.appendChild(tableClone);


        const opt = {
            margin: [1, 1, 1, 1], // Márgenes en cm (top, left, bottom, right)
            filename: `reporte_finzana_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true }, // scale mejora calidad, useCORS si hay imágenes externas
            jsPDF: { unit: 'cm', format: 'a4', orientation: 'landscape' }, // Hoja A4 horizontal
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } // Intentar evitar cortes feos
        };

        showFixedProgress(70, 'Generando PDF...');

        // Usar html2pdf
        html2pdf().set(opt).from(contentForPdf).save()
            .then(() => {
                showFixedProgress(100, 'PDF generado');
                showStatus('status_reportes_avanzados', 'Archivo PDF exportado exitosamente.', 'success');
                showProcessingOverlay(false);
                showButtonLoading('btn-exportar-pdf', false);
                setTimeout(hideFixedProgress, 2000);
            })
            .catch(error => {
                console.error('Error generando PDF con html2pdf:', error);
                throw new Error(`Error al generar PDF: ${error.message}`); // Re-lanzar para el catch principal
            });

    } catch (error) {
        console.error('Error preparando contenido para PDF:', error);
        showStatus('status_reportes_avanzados', `Error al exportar PDF: ${error.message}`, 'error');
        showProcessingOverlay(false);
        showButtonLoading('btn-exportar-pdf', false);
        hideFixedProgress();
    }
    // No usar finally aquí porque html2pdf().save() es asíncrono y necesitamos el .then/.catch
}

// =============================================
// INICIALIZACIÓN Y EVENT LISTENERS PRINCIPALES
// =============================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM cargado, inicializando aplicación...');
    inicializarDropdowns(); // Poblar selects estáticos
    setupEventListeners(); // Configurar todos los listeners
    setupSecurityListeners(); // Configurar timer de inactividad, etc.

    // Listener para estado de autenticación (ya incluye la lógica de mostrar/ocultar vistas)
    auth.onAuthStateChanged(async user => {
        console.log('Estado de autenticación cambiado:', user ? user.uid : 'No user');
        const loadingOverlay = document.getElementById('loading-overlay');
        const loginScreen = document.getElementById('login-screen');
        const mainApp = document.getElementById('main-app');

        loadingOverlay.classList.add('hidden'); // Ocultar carga inicial

        if (user) {
            currentUser = user;
            try {
                currentUserData = await database.obtenerUsuarioPorId(user.uid);


                if (currentUserData) {
                    document.getElementById('user-name').textContent = currentUserData.name || user.email;
                    document.getElementById('user-role-display').textContent = currentUserData.role || 'Rol Desconocido';
                    // Podrías habilitar/deshabilitar vistas aquí según el rol
                    // Ejemplo: toggleAdminFeatures(currentUserData.role === 'admin');
                } else {
                    console.warn(`No se encontraron datos en Firestore para el usuario ${user.uid}`);
                    document.getElementById('user-name').textContent = user.email;
                    document.getElementById('user-role-display').textContent = 'Datos no encontrados';
                    // Considerar cerrar sesión si los datos son obligatorios
                    // auth.signOut();
                }


                loginScreen.classList.add('hidden');
                mainApp.classList.remove('hidden');
                showView('view-main-menu'); // Mostrar menú principal por defecto
                updateConnectionStatus(); // Actualizar estado de conexión
                resetInactivityTimer(); // Iniciar temporizador de inactividad


            } catch (error) {
                console.error("Error al obtener datos del usuario:", error);
                // Manejar el error, quizás mostrar un mensaje y cerrar sesión
                document.getElementById('user-name').textContent = user.email;
                document.getElementById('user-role-display').textContent = 'Error al cargar datos';
                // Opcional: Cerrar sesión si no se pueden cargar datos críticos
                // auth.signOut();
            }


        } else {
            currentUser = null;
            currentUserData = null;
            clearTimeout(inactivityTimer); // Detener temporizador
            mainApp.classList.add('hidden');
            loginScreen.classList.remove('hidden');
            // Limpiar cualquier estado residual de la app si es necesario
            const authStatus = document.getElementById('auth-status');
            if (authStatus) authStatus.textContent = ''; // Limpiar mensaje de error de login
        }
    });
});

function setupEventListeners() {
    console.log('Configurando event listeners...');
    // Conexión online/offline
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    // Login / Logout
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());

    // Navegación principal (botones con data-view)
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function () {
            // Si el botón está dentro del formulario de cliente y es tipo button, resetear
            if (this.type === 'button' && this.closest('#form-cliente') && !editingClientId) {
                // resetClientForm(); // Resetear solo si NO se está editando
            } else if (this.closest('.menu-card')) {
                // Si viene de una tarjeta de menú, asegurar que se resetea si va a vista de cliente nuevo
                if (this.getAttribute('data-view') === 'view-cliente') {
                    resetClientForm();
                }
            }
            showView(this.getAttribute('data-view'));
        });
    });


    // --- Gestión de Clientes ---
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnAplicarFiltros) btnAplicarFiltros.addEventListener('click', loadClientesTable); // ESTA ES LA LÍNEA DEL ERROR ANTERIOR
    const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');
    if (btnLimpiarFiltros) btnLimpiarFiltros.addEventListener('click', limpiarFiltrosClientes); // ESTA ES LA LÍNEA DEL ERROR ANTERIOR

    // --- Gestión de Usuarios ---
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
    // **NUEVO** Herramienta de Diagnóstico
    const btnDiagnosticarPagos = document.getElementById('btn-diagnosticar-pagos');
    if (btnDiagnosticarPagos) btnDiagnosticarPagos.addEventListener('click', handleDiagnosticarPagos);


    // --- Importar Datos ---
    const officeSelect = document.getElementById('office-select');
    if (officeSelect) officeSelect.addEventListener('change', handleOfficeChange);
    document.querySelectorAll('.import-tab').forEach(tab => tab.addEventListener('click', handleTabClick));
    const btnProcesarImportacion = document.getElementById('btn-procesar-importacion');
    if (btnProcesarImportacion) btnProcesarImportacion.addEventListener('click', handleImport);
    const btnLimpiarDatos = document.getElementById('btn-limpiar-datos'); // Botón experimental
    if (btnLimpiarDatos) {
        btnLimpiarDatos.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas limpiar TODA la base de datos en la nube? Esta acción es experimental y no se puede deshacer.')) {
                // !! ADVERTENCIA !! Esto debería estar protegido y no ser accesible fácilmente
                // Preferiblemente usar Cloud Functions o hacerlo manualmente en consola Firebase.
                showStatus('estado-importacion', 'Acción peligrosa. La limpieza masiva debe hacerse desde la consola de Firebase o Cloud Functions.', 'error');
                // await database.limpiarColeccion('pagos'); // Ejemplo (necesitaría implementar limpiarColeccion)
                // await database.limpiarColeccion('creditos');
                // await database.limpiarColeccion('clientes');
                // showStatus('estado-importacion', 'Colecciones limpiadas (simulado).', 'warning');
            }
        });
    }

    // --- Registrar Cliente ---
    const formCliente = document.getElementById('form-cliente');
    if (formCliente) formCliente.addEventListener('submit', handleClientForm);
    const curpCliente = document.getElementById('curp_cliente');
    if (curpCliente) curpCliente.addEventListener('input', () => validarCURP(curpCliente));
    const officeCliente = document.getElementById('office_cliente');
    if (officeCliente) officeCliente.addEventListener('change', handleOfficeChangeForClientForm); // Para actualizar grupos

    // --- Generar Crédito (Colocación) ---
    const btnBuscarClienteColocacion = document.getElementById('btnBuscarCliente_colocacion');
    if (btnBuscarClienteColocacion) btnBuscarClienteColocacion.addEventListener('click', handleSearchClientForCredit);
    const formCreditoSubmit = document.getElementById('form-credito-submit');
    if (formCreditoSubmit) formCreditoSubmit.addEventListener('submit', handleCreditForm);
    const curpAvalColocacion = document.getElementById('curpAval_colocacion');
    if (curpAvalColocacion) curpAvalColocacion.addEventListener('input', () => validarCURP(curpAvalColocacion)); // Validar CURP aval
    const montoColocacion = document.getElementById('monto_colocacion');
    if (montoColocacion) montoColocacion.addEventListener('change', calcularMontoTotalColocacion);
    const plazoColocacion = document.getElementById('plazo_colocacion');
    // No necesita listener, se usa al calcular monto total o al guardar

    // --- Registrar Pago (Cobranza) ---
    const btnBuscarCreditoCobranza = document.getElementById('btnBuscarCredito_cobranza');
    if (btnBuscarCreditoCobranza) btnBuscarCreditoCobranza.addEventListener('click', handleSearchCreditForPayment);
    const formPagoSubmit = document.getElementById('form-pago-submit');
    if (formPagoSubmit) formPagoSubmit.addEventListener('submit', handlePaymentForm);
    const montoCobranza = document.getElementById('monto_cobranza');
    if (montoCobranza) montoCobranza.addEventListener('input', handleMontoPagoChange); // Calcular saldo después

    // --- Pago Grupal ---
    const btnBuscarGrupoPago = document.getElementById('btn-buscar-grupo-pago');
    if (btnBuscarGrupoPago) btnBuscarGrupoPago.addEventListener('click', handleBuscarGrupoParaPago);
    const btnRegistrarPagoGrupal = document.getElementById('btn-registrar-pago-grupal');
    if (btnRegistrarPagoGrupal) btnRegistrarPagoGrupal.addEventListener('click', handleRegistroPagoGrupal);


    // --- Reportes Básicos ---
    const btnActualizarReportes = document.getElementById('btn-actualizar-reportes');
    if (btnActualizarReportes) btnActualizarReportes.addEventListener('click', () => loadBasicReports());

    // --- Reportes Avanzados ---
    const btnAplicarFiltrosReportes = document.getElementById('btn-aplicar-filtros-reportes');
    if (btnAplicarFiltrosReportes) btnAplicarFiltrosReportes.addEventListener('click', loadAdvancedReports); // ESTA ES LA LÍNEA DEL NUEVO ERROR
    const btnExportarCsv = document.getElementById('btn-exportar-csv');
    if (btnExportarCsv) btnExportarCsv.addEventListener('click', exportToCSV);
    const btnExportarPdf = document.getElementById('btn-exportar-pdf');
    if (btnExportarPdf) btnExportarPdf.addEventListener('click', exportToPDF);
    const btnLimpiarFiltrosReportes = document.getElementById('btn-limpiar-filtros-reportes');
    if (btnLimpiarFiltrosReportes) btnLimpiarFiltrosReportes.addEventListener('click', limpiarFiltrosReportes);

    // --- Reportes Gráficos ---
    const btnGenerarGrafico = document.getElementById('btn-generar-grafico');
    if (btnGenerarGrafico) btnGenerarGrafico.addEventListener('click', handleGenerarGrafico);
    const sucursalGrafico = document.getElementById('grafico_sucursal');
    if (sucursalGrafico) sucursalGrafico.addEventListener('change', handleSucursalGraficoChange); // Actualizar grupos

    // --- Modal Genérico ---
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => document.getElementById('generic-modal').classList.add('hidden'));
    // Cerrar modal si se hace clic fuera del contenido
    const modalOverlay = document.getElementById('generic-modal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) { // Solo si el clic es en el overlay mismo
                modalOverlay.classList.add('hidden');
            }
        });
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
    statusElement.classList.remove('hidden'); // Asegurar visibilidad


    try {
        await auth.signInWithEmailAndPassword(email, password);
        // El onAuthStateChanged se encargará de ocultar login y mostrar app
        statusElement.textContent = '¡Inicio de sesión exitoso!';
        statusElement.className = 'status-message status-success';
        // No ocultar inmediatamente para que el usuario vea el mensaje
        setTimeout(() => {
            if (!currentUser) { // Si por alguna razón onAuthStateChanged no se disparó rápido
                statusElement.classList.add('hidden');
            }
        }, 1500);


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
        showButtonLoading(loginButton, false); // Restaurar botón en caso de error
    }
    // No necesitamos finally showButtonLoading(false) aquí si onAuthStateChanged lo maneja
}

function handleOfficeChange() {
    const office = this.value;
    const isGDL = office === 'GDL';
    const gdlSection = document.getElementById('import-gdl-section');
    const leonSection = document.getElementById('import-leon-section');

    if (gdlSection) gdlSection.classList.toggle('hidden', !isGDL);
    if (leonSection) leonSection.classList.toggle('hidden', isGDL);

    // Resetear a la pestaña 'clientes' y activarla visualmente
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
    // Limpiar resultados anteriores al cambiar de oficina
    document.getElementById('resultado-importacion')?.classList.add('hidden');
    document.getElementById('estado-importacion').innerHTML = '';
    document.getElementById('detalle-importacion').innerHTML = '';
}


function handleTabClick() {
    const parentSection = this.closest('[id$="-section"]'); // Encuentra gdl-section o leon-section
    if (!parentSection) return;

    // Quitar 'active' de todas las pestañas en esta sección
    parentSection.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
    // Añadir 'active' a la pestaña clickeada
    this.classList.add('active');

    // Obtener el tipo de datos de la pestaña (clientes, colocacion, cobranza)
    currentImportTab = this.getAttribute('data-tab');

    // Ocultar todos los contenidos de pestañas en esta sección
    parentSection.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));

    // Construir el ID del contenido a mostrar
    const officePrefix = parentSection.id.includes('gdl') ? 'gdl' : 'leon';
    const targetTabContentId = `tab-${officePrefix}-${currentImportTab}`;
    const targetTabContent = document.getElementById(targetTabContentId);

    // Mostrar el contenido correspondiente
    if (targetTabContent) {
        targetTabContent.classList.remove('hidden');
        // Limpiar el textarea correspondiente al mostrar la pestaña
        const textareaId = `datos-importar-${officePrefix.toLowerCase()}-${currentImportTab}`;
        const textarea = document.getElementById(textareaId);
        if (textarea) textarea.value = '';
    }
    // Limpiar resultados anteriores al cambiar de pestaña
    document.getElementById('resultado-importacion')?.classList.add('hidden');
    document.getElementById('estado-importacion').innerHTML = '';
    document.getElementById('detalle-importacion').innerHTML = '';
}


async function handleImport() {
    const office = document.getElementById('office-select').value;
    // Construir ID del textarea basado en la oficina y pestaña activa
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
        detalleImportacionDiv.innerHTML = ''; // Limpiar detalles
        return;
    }

    // Mostrar indicadores de progreso
    showProcessingOverlay(true, `Importando ${currentImportTab} para ${office}...`);
    // =============================================
    // *** INICIO DE LA CORRECCIÓN 3 (Instancia 3) ***
    // =============================================
    showButtonLoading('#btn-procesar-importacion', true, 'Importando...');
    // =============================================
    // *** FIN DE LA CORRECCIÓN 3 (Instancia 3) ***
    // =============================================
    showFixedProgress(0, `Iniciando importación de ${currentImportTab}...`);
    estadoImportacionDiv.innerHTML = 'Procesando archivo CSV...';
    estadoImportacionDiv.className = 'status-message status-info';
    detalleImportacionDiv.innerHTML = '';
    resultadoImportacionDiv?.classList.remove('hidden');


    try {
        // Llamar a la función de importación de database.js
        const resultado = await database.importarDatosDesdeCSV(csvData, currentImportTab, office);

        // Actualizar progreso
        showFixedProgress(100, 'Importación completada');

        let mensaje = `<b>Importación (${office} - ${currentImportTab}) finalizada:</b> ${resultado.importados} registros importados de ${resultado.total} líneas procesadas.`;

        if (resultado.errores && resultado.errores.length > 0) {
            mensaje += `<br><b>Se encontraron ${resultado.errores.length} errores u omisiones.</b>`;
            if (detalleImportacionDiv) {
                // Limitar el número de errores mostrados para no colapsar la UI
                const erroresMostrados = resultado.errores.slice(0, 50);
                detalleImportacionDiv.innerHTML = `<strong>Detalle de errores/omisiones (primeros ${erroresMostrados.length}):</strong><ul>${erroresMostrados.map(e => `<li>${e}</li>`).join('')}</ul>`;
                if (resultado.errores.length > 50) {
                    detalleImportacionDiv.innerHTML += `<p><i>(${resultado.errores.length - 50} errores más omitidos)</i></p>`;
                }
            }
            // Mostrar estado como warning si hubo errores pero algunos se importaron, error si falló todo
            showStatus('estado-importacion', mensaje, resultado.importados > 0 ? 'warning' : 'error');
        } else {
            if (detalleImportacionDiv) detalleImportacionDiv.innerHTML = 'No se encontraron errores.';
            showStatus('estado-importacion', mensaje, 'success');
        }

        // Limpiar textarea después de importar
        textarea.value = '';

    } catch (error) {
        console.error('Error crítico en handleImport:', error);
        showFixedProgress(100, 'Error en importación'); // Marcar como completado con error
        showStatus('estado-importacion', `Error crítico durante la importación: ${error.message}`, 'error');
        if (detalleImportacionDiv) detalleImportacionDiv.innerHTML = `Detalles técnicos: ${error.stack || error}`;
    } finally {
        // Ocultar indicadores de progreso
        showProcessingOverlay(false);
        // =============================================
        // *** INICIO DE LA CORRECCIÓN 3 (Instancia 4) ***
        // =============================================
        showButtonLoading('#btn-procesar-importacion', false);
        // =============================================
        // *** FIN DE LA CORRECCIÓN 3 (Instancia 4) ***
        // =============================================
        // Ocultar barra de progreso después de un tiempo
        setTimeout(hideFixedProgress, 3000);
    }
}


function resetClientForm() {
    editingClientId = null; // Asegurar que no estamos editando
    const form = document.getElementById('form-cliente');
    if (form) form.reset();

    // Resetear título y texto del botón
    const titulo = document.querySelector('#view-cliente h2');
    if (titulo) titulo.textContent = 'Registrar Cliente';
    const submitButton = document.querySelector('#form-cliente button[type="submit"]');
    if (submitButton) submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';

    // Resetear estado de solo lectura de CURP
    const curpInput = document.getElementById('curp_cliente');
    curpInput.readOnly = !(currentUserData && (currentUserData.role === 'admin' || currentUserData.role === 'supervisor'));


    // Resetear validación visual de CURP
    validarCURP(curpInput);


    // Resetear dropdown de población/grupo a la oficina por defecto (GDL)
    handleOfficeChangeForClientForm.call(document.getElementById('office_cliente') || { value: 'GDL' });


    // Limpiar mensaje de estado
    showStatus('status_cliente', '', 'info'); // Limpia el mensaje anterior
}


async function handleClientForm(e) {
    e.preventDefault();
    const curpInput = document.getElementById('curp_cliente');
    const curp = curpInput.value.trim().toUpperCase();
    const submitButton = e.target.querySelector('button[type="submit"]');

    // Validar CURP
    if (!validarFormatoCURP(curp)) {
        showStatus('status_cliente', 'El formato del CURP es incorrecto (debe tener 18 caracteres y seguir el patrón).', 'error');
        curpInput.classList.add('input-error'); // Marcar campo con error
        return;
    } else {
        curpInput.classList.remove('input-error');
    }

    // Recoger datos del formulario
    const clienteData = {
        office: document.getElementById('office_cliente').value,
        curp,
        nombre: document.getElementById('nombre_cliente').value.trim(),
        domicilio: document.getElementById('domicilio_cliente').value.trim(),
        cp: document.getElementById('cp_cliente').value.trim(),
        telefono: document.getElementById('telefono_cliente').value.trim(),
        poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value,
        ruta: document.getElementById('ruta_cliente').value,
        isComisionista: document.getElementById('comisionista_cliente').checked
    };

    // Validar campos obligatorios
    if (!clienteData.nombre || !clienteData.domicilio || !clienteData.poblacion_grupo || !clienteData.ruta) {
        showStatus('status_cliente', 'Los campos con * son obligatorios.', 'error');
        // Marcar campos vacíos (opcional)
        return;
    }

    showButtonLoading(submitButton, true, editingClientId ? 'Actualizando...' : 'Guardando...');
    showStatus('status_cliente', editingClientId ? 'Actualizando datos del cliente...' : 'Registrando nuevo cliente...', 'info');

    try {
        let resultado;
        if (editingClientId) {
            // --- Lógica de Actualización ---
            // Si se puede editar CURP y ha cambiado, verificar que no exista ya en otro cliente
            if (!curpInput.readOnly) {
                const clienteOriginal = await database.obtenerClientePorId(editingClientId);
                if (clienteOriginal && clienteOriginal.curp !== curp) {
                    const existeNuevoCURP = await database.buscarClientePorCURP(curp);
                    if (existeNuevoCURP) {
                        throw new Error(`La nueva CURP (${curp}) ya pertenece a otro cliente (${existeNuevoCURP.nombre}).`);
                    }
                }
            }
            resultado = await database.actualizarCliente(editingClientId, clienteData, currentUser.email);
        } else {
            // --- Lógica de Creación ---
            // La verificación de CURP existente ahora está dentro de database.agregarCliente
            resultado = await database.agregarCliente(clienteData, currentUser.email);
        }

        // Manejar resultado
        if (resultado.success) {
            let successMessage = editingClientId ? 'Cliente actualizado exitosamente.' : 'Cliente registrado exitosamente.';
            if (!isOnline) {
                successMessage += ' (Datos guardados localmente, se sincronizarán al conectar).';
            }
            // Mostrar mensaje en la vista de gestión (a donde redirigimos)
            showStatus('status_gestion_clientes', successMessage, 'success');
            resetClientForm(); // Limpiar formulario
            showView('view-gestion-clientes'); // Volver a la tabla
            loadClientesTable(); // Recargar tabla para ver cambios/nuevo cliente
        } else {
            // Mostrar error en el formulario actual
            throw new Error(resultado.message || 'Ocurrió un error desconocido.');
        }

    } catch (error) {
        console.error("Error en handleClientForm:", error);
        showStatus('status_cliente', `Error: ${error.message}`, 'error');
    } finally {
        showButtonLoading(submitButton, false); // Restaurar botón
    }
}

// =============================================
// GESTIÓN DE USUARIOS
// =============================================
function mostrarFormularioUsuario(usuario = null) {
    const formContainer = document.getElementById('form-usuario-container');
    const formTitulo = document.getElementById('form-usuario-titulo');
    const form = document.getElementById('form-usuario');
    const passwordInput = document.getElementById('nuevo-password');
    const emailInput = document.getElementById('nuevo-email');
    if (!formContainer || !formTitulo || !form) return;
    form.reset();
    if (usuario) {
        editingUserId = usuario.id;
        formTitulo.textContent = 'Editar Usuario';
        document.getElementById('nuevo-nombre').value = usuario.name || '';
        emailInput.value = usuario.email || '';
        emailInput.readOnly = true; // No permitir cambiar email al editar
        document.getElementById('nuevo-rol').value = usuario.role || '';
        passwordInput.required = false; // Contraseña opcional al editar
        passwordInput.placeholder = "Dejar en blanco para no cambiar";
    } else {
        editingUserId = null;
        formTitulo.textContent = 'Nuevo Usuario';
        emailInput.readOnly = false; // Permitir escribir email al crear
        passwordInput.required = true; // Contraseña obligatoria al crear
        passwordInput.placeholder = "Mínimo 6 caracteres"; // Placeholder para nuevo
    }
    formContainer.classList.remove('hidden'); // Mostrar el formulario
}


function ocultarFormularioUsuario() {
    editingUserId = null; // Resetear ID de edición
    const formContainer = document.getElementById('form-usuario-container');
    if (formContainer) {
        formContainer.classList.add('hidden'); // Ocultar
        document.getElementById('form-usuario').reset(); // Limpiar campos
        showStatus('status_usuarios', '', 'info'); // Limpiar mensajes de estado
    }
}


async function handleUserForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    const statusUsuarios = document.getElementById('status_usuarios');

    showButtonLoading(submitButton, true, editingUserId ? 'Actualizando...' : 'Creando...');
    statusUsuarios.textContent = editingUserId ? 'Actualizando usuario...' : 'Creando nuevo usuario...';
    statusUsuarios.className = 'status-message status-info';

    try {
        if (editingUserId) {
            // --- Actualizar Usuario Existente ---
            const userData = {
                name: document.getElementById('nuevo-nombre').value.trim(),
                role: document.getElementById('nuevo-rol').value,
                // No actualizamos email aquí
            };
            if (!userData.name || !userData.role) {
                throw new Error('Nombre y Rol son obligatorios.');
            }
            // Considerar actualizar contraseña si se proporcionó una nueva
            // const newPassword = document.getElementById('nuevo-password').value;
            // if (newPassword) { /* lógica para actualizar contraseña */ }

            const resultado = await database.actualizarUsuario(editingUserId, userData);
            if (!resultado.success) throw new Error(resultado.message);

            let message = resultado.message;
            if (!isOnline) message += ' (Guardado localmente, se sincronizará).';
            showStatus('status_usuarios', message, 'success');
            ocultarFormularioUsuario();
            await loadUsersTable(); // Recargar tabla

        } else {
            // --- Crear Nuevo Usuario ---
            const email = document.getElementById('nuevo-email').value.trim();
            const password = document.getElementById('nuevo-password').value;
            const nombre = document.getElementById('nuevo-nombre').value.trim();
            const rol = document.getElementById('nuevo-rol').value;

            if (!email || !password || !nombre || !rol) {
                throw new Error('Todos los campos son obligatorios para crear un usuario.');
            }
            if (password.length < 6) {
                throw new Error('La contraseña debe tener al menos 6 caracteres.');
            }
            if (!isOnline) {
                throw new Error("La creación de nuevos usuarios requiere conexión a internet.");
            }

            // Crear usuario en Firebase Authentication
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Crear documento en Firestore
            await db.collection('users').doc(user.uid).set({
                id: user.uid, // Guardar el UID también en el documento
                email,
                name: nombre,
                role: rol,
                createdAt: new Date().toISOString(),
                status: 'active'
            });

            showStatus('status_usuarios', 'Usuario creado exitosamente.', 'success');
            ocultarFormularioUsuario();
            await loadUsersTable(); // Recargar tabla
        }
    } catch (error) {
        console.error("Error en handleUserForm:", error);
        let mensajeError = `Error: ${error.message}`;
        // Errores específicos de Firebase Auth
        if (error.code === 'auth/email-already-in-use') mensajeError = 'Error: El correo electrónico ya está registrado.';
        if (error.code === 'auth/weak-password') mensajeError = 'Error: La contraseña es demasiado débil (mínimo 6 caracteres).';
        if (error.code === 'auth/invalid-email') mensajeError = 'Error: El formato del correo electrónico no es válido.';
        showStatus('status_usuarios', mensajeError, 'error');
    } finally {
        showButtonLoading(submitButton, false); // Restaurar botón
    }
}


async function loadUsersTable() {
    if (cargaEnProgreso) {
        showStatus('status_usuarios', 'Ya hay una búsqueda en progreso, por favor espera.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    const tbody = document.getElementById('tabla-usuarios');
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner" style="margin: 20px auto; border-top-color: var(--primary);"></div></td></tr>'; // Spinner
    // =============================================
    // *** INICIO DE LA CORRECCIÓN 3 (Instancia 5) ***
    // =============================================
    showButtonLoading('#btn-aplicar-filtros-usuarios', true, 'Buscando...');
    // =============================================
    // *** FIN DE LA CORRECCIÓN 3 (Instancia 5) ***
    // =============================================
    showStatus('status_usuarios', '', 'info'); // Limpiar mensaje previo


    try {
        const resultado = await database.obtenerUsuarios();
        if (!resultado.success) throw new Error(resultado.message);
        let usuarios = resultado.data || [];


        // Aplicar filtros de la UI
        const filtroEmail = (document.getElementById('filtro-email-usuario')?.value || '').trim().toLowerCase();
        const filtroNombre = (document.getElementById('filtro-nombre-usuario')?.value || '').trim().toLowerCase();
        const filtroRol = document.getElementById('filtro-rol-usuario')?.value || '';


        const usuariosFiltrados = usuarios.filter(usuario => {
            const emailMatch = !filtroEmail || (usuario.email && usuario.email.toLowerCase().includes(filtroEmail));
            const nombreMatch = !filtroNombre || (usuario.name && usuario.name.toLowerCase().includes(filtroNombre));
            const rolMatch = !filtroRol || usuario.role === filtroRol;
            return emailMatch && nombreMatch && rolMatch;
        });


        tbody.innerHTML = ''; // Limpiar tabla antes de llenar


        if (usuariosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No se encontraron usuarios que coincidan con los filtros.</td></tr>';
            showStatus('status_usuarios', 'No se encontraron usuarios.', 'info');
        } else {
            // Ordenar por nombre
            usuariosFiltrados.sort((a, b) => (a.name || '').localeCompare(b.name || ''));


            usuariosFiltrados.forEach(usuario => {
                const tr = document.createElement('tr');
                // Atenuar visualmente si está deshabilitado
                if (usuario.status === 'disabled') {
                    tr.style.opacity = '0.5';
                    tr.title = 'Usuario deshabilitado';
                }

                // Badge de rol con clase específica
                const roleBadgeClass = `role-${(usuario.role || 'default').toLowerCase()}`;

                // Escapar datos de usuario para el onclick
                // Convertir a string JSON, luego escapar comillas simples para HTML
                const usuarioJsonString = JSON.stringify(usuario).replace(/'/g, "&apos;").replace(/"/g, "&quot;");


                tr.innerHTML = `
                    <td>${usuario.email || 'N/A'}</td>
                    <td>${usuario.name || 'N/A'}</td>
                    <td><span class="role-badge ${roleBadgeClass}">${usuario.role || 'Sin Rol'}</span></td>
                    <td>${usuario.office || 'N/A'}</td>
                    <td>${usuario.status === 'disabled' ? 'Deshabilitado' : 'Activo'}</td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-info" onclick='editUsuario(${usuarioJsonString})' title="Editar"><i class="fas fa-edit"></i></button>
                        ${usuario.status !== 'disabled' ? `<button class="btn btn-sm btn-warning" onclick="disableUsuario('${usuario.id}', '${usuario.name || usuario.email}')" title="Deshabilitar"><i class="fas fa-user-slash"></i></button>` : ''}
                        </td>
                `;
                tbody.appendChild(tr);
            });
            showStatus('status_usuarios', `${usuariosFiltrados.length} usuarios encontrados.`, 'success');
        }
    } catch (error) {
        console.error("Error cargando tabla de usuarios:", error);
        tbody.innerHTML = `<tr><td colspan="6">Error al cargar usuarios: ${error.message}</td></tr>`;
        showStatus('status_usuarios', `Error: ${error.message}`, 'error');
    } finally {
        cargaEnProgreso = false;
        // =============================================
        // *** INICIO DE LA CORRECCIÓN 3 (Instancia 6) ***
        // =============================================
        showButtonLoading('#btn-aplicar-filtros-usuarios', false); // Restaurar botón de búsqueda
        // =============================================
        // *** FIN DE LA CORRECCIÓN 3 (Instancia 6) ***
        // =============================================
    }
}

function limpiarFiltrosUsuarios() {
    if (cargaEnProgreso) {
        console.warn("Intento de limpiar filtros mientras carga estaba en progreso. Cancelando carga.");
        cancelarCarga(); // Intentar cancelar si hay algo en progreso
    }
    // Limpiar campos de filtro
    document.getElementById('filtro-email-usuario').value = '';
    document.getElementById('filtro-nombre-usuario').value = '';
    document.getElementById('filtro-rol-usuario').value = '';

    // Recargar tabla sin filtros
    loadUsersTable();
    showStatus('status_usuarios', 'Filtros limpiados.', 'info');
}

function editUsuario(usuario) {
    // Asegurarse de que el objeto 'usuario' es válido
    if (typeof usuario !== 'object' || usuario === null) {
        console.error("Intento de editar usuario con datos inválidos:", usuario);
        alert("Error: No se pudieron cargar los datos del usuario para editar.");
        return;
    }
    mostrarFormularioUsuario(usuario);
}

async function disableUsuario(id, nombre) {
    // Confirmación
    if (!confirm(`¿Estás seguro de que deseas deshabilitar al usuario "${nombre}"?\n\nEl usuario no podrá iniciar sesión.`)) {
        return; // Cancelado por el usuario
    }

    showProcessingOverlay(true, 'Deshabilitando usuario...'); // Indicador visual

    try {
        const resultado = await database.deshabilitarUsuario(id);
        if (resultado.success) {
            let message = resultado.message;
            if (!isOnline) message += ' (Acción registrada localmente, se aplicará al conectar).';
            showStatus('status_usuarios', message, 'success');
            await loadUsersTable(); // Recargar tabla para reflejar el cambio
        } else {
            throw new Error(resultado.message); // Lanzar error si falló
        }
    } catch (error) {
        console.error("Error al deshabilitar usuario:", error);
        alert(`Error al deshabilitar usuario: ${error.message}`); // Mostrar error al usuario
        showStatus('status_usuarios', `Error: ${error.message}`, 'error'); // Mostrar en status también
    } finally {
        showProcessingOverlay(false); // Ocultar indicador
    }
}

// =============================================
// SECCIÓN DE CRÉDITOS (COLOCACIÓN)
// =============================================

async function handleSearchClientForCredit() {
    const curpInput = document.getElementById('curp_colocacion');
    const curp = curpInput.value.trim().toUpperCase();
    const statusColocacion = document.getElementById('status_colocacion');
    const formColocacion = document.getElementById('form-colocacion');
    const btnBuscar = document.getElementById('btnBuscarCliente_colocacion');


    if (!validarFormatoCURP(curp)) {
        showStatus('status_colocacion', 'El CURP debe tener 18 caracteres y formato válido.', 'error');
        formColocacion.classList.add('hidden'); // Ocultar formulario si CURP es inválido
        return;
    }


    showButtonLoading(btnBuscar, true, 'Buscando...');
    showFixedProgress(30, 'Buscando cliente...');
    statusColocacion.innerHTML = 'Buscando cliente...';
    statusColocacion.className = 'status-message status-info';
    formColocacion.classList.add('hidden'); // Ocultar mientras busca


    try {
        const cliente = await database.buscarClientePorCURP(curp);


        if (!cliente) {
            showFixedProgress(100, 'Cliente no encontrado');
            throw new Error('Cliente no encontrado en la base de datos. Por favor, regístrelo primero.');
        }


        showFixedProgress(70, 'Verificando elegibilidad...');
        statusColocacion.innerHTML = 'Cliente encontrado. Verificando elegibilidad para crédito...';
        const elegibilidad = await database.verificarElegibilidadCliente(curp);


        if (!elegibilidad.elegible) {
            showFixedProgress(100, 'Cliente no elegible');
            throw new Error(elegibilidad.message); // Lanzar error con el motivo
        }


        // Cliente encontrado y elegible
        showFixedProgress(100, 'Cliente elegible');
        actualizarPlazosSegunCliente(cliente.isComisionista || false); // Ajustar plazos disponibles


        const creditoActivo = await database.buscarCreditoActivoPorCliente(curp); // Buscar si ya tiene uno activo
        const mensaje = creditoActivo ? 'Cliente encontrado y elegible para RENOVACIÓN.' : 'Cliente encontrado y elegible para crédito NUEVO.';
        showStatus('status_colocacion', mensaje, 'success');


        // Llenar datos y mostrar formulario
        document.getElementById('nombre_colocacion').value = cliente.nombre;
        document.getElementById('idCredito_colocacion').value = 'Se asignará automáticamente'; // O manejar ID histórico si aplica
        // Resetear campos específicos del crédito
        document.getElementById('tipo_colocacion').value = '';
        document.getElementById('monto_colocacion').value = '';
        document.getElementById('plazo_colocacion').value = ''; // Se actualiza con actualizarPlazosSegunCliente
        document.getElementById('montoTotal_colocacion').value = '';
        document.getElementById('curpAval_colocacion').value = '';
        document.getElementById('nombreAval_colocacion').value = '';
        validarCURP(document.getElementById('curpAval_colocacion')); // Resetear validación visual aval


        formColocacion.classList.remove('hidden');


    } catch (error) {
        console.error("Error buscando cliente para crédito:", error);
        showStatus('status_colocacion', `Error: ${error.message}`, 'error');
        formColocacion.classList.add('hidden'); // Asegurar que el form esté oculto en caso de error
        hideFixedProgress(); // Ocultar barra si hubo error rápido
    } finally {
        showButtonLoading(btnBuscar, false);
        // Ocultar barra de progreso después de un tiempo si no hubo error antes
        if (!document.querySelector('#status_colocacion.status-error')) {
            setTimeout(hideFixedProgress, 1500);
        }
    }
}


async function handleCreditForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    const statusColocacion = document.getElementById('status_colocacion');


    // Recoger datos del formulario
    const curpAvalInput = document.getElementById('curpAval_colocacion');
    const curpAval = curpAvalInput.value.trim().toUpperCase();
    const creditoData = {
        curpCliente: document.getElementById('curp_colocacion').value.trim().toUpperCase(), // Asegurar CURP cliente
        tipo: document.getElementById('tipo_colocacion').value,
        monto: parseFloat(document.getElementById('monto_colocacion').value),
        plazo: parseInt(document.getElementById('plazo_colocacion').value),
        curpAval: curpAval,
        nombreAval: document.getElementById('nombreAval_colocacion').value.trim()
    };


    // Validaciones básicas
    if (!creditoData.monto || creditoData.monto <= 0 || !creditoData.plazo || !creditoData.tipo || !creditoData.nombreAval) {
        showStatus('status_colocacion', 'Error: Todos los campos del crédito son obligatorios (Monto, Plazo, Tipo, Nombre Aval).', 'error');
        return;
    }
    if (!validarFormatoCURP(creditoData.curpCliente)) {
        showStatus('status_colocacion', 'Error: CURP del cliente inválido.', 'error');
        return;
    }
    if (!validarFormatoCURP(curpAval)) {
        showStatus('status_colocacion', 'Error: El CURP del aval debe tener 18 caracteres y formato válido.', 'error');
        curpAvalInput.classList.add('input-error');
        return;
    } else {
        curpAvalInput.classList.remove('input-error');
    }


    showButtonLoading(submitButton, true, 'Generando...');
    showFixedProgress(50, 'Validando y generando crédito...');
    statusColocacion.innerHTML = 'Validando elegibilidad y generando crédito...';
    statusColocacion.className = 'status-message status-info';

    try {
        // La validación de elegibilidad ahora está DENTRO de agregarCredito
        const resultado = await database.agregarCredito(creditoData, currentUser.email);


        if (resultado.success) {
            showFixedProgress(100, 'Crédito generado');
            let successMessage = `¡Crédito generado exitosamente! ID Firestore: ${resultado.data.id}.`;
            // Si tuviéramos historicalId aquí, lo mostraríamos:
            // if (resultado.data.historicalIdCredito) successMessage += ` (ID Histórico: ${resultado.data.historicalIdCredito})`;


            if (!isOnline) {
                successMessage += ' (Datos guardados localmente, se sincronizarán al conectar).';
            }
            showStatus('status_colocacion', successMessage, 'success');


            // Limpiar y ocultar formulario
            e.target.reset(); // Limpia el form de crédito
            document.getElementById('form-colocacion').classList.add('hidden');
            document.getElementById('curp_colocacion').value = ''; // Limpia la CURP de búsqueda
            document.getElementById('nombre_colocacion').value = '';


        } else {
            // Error devuelto por agregarCredito (elegibilidad u otro)
            throw new Error(resultado.message);
        }

    } catch (error) {
        console.error("Error en handleCreditForm:", error);
        showFixedProgress(100, 'Error al generar'); // Marcar como completado con error
        showStatus('status_colocacion', `Error al generar crédito: ${error.message}`, 'error');
    } finally {
        showButtonLoading(submitButton, false);
        setTimeout(hideFixedProgress, 2000); // Ocultar barra después de un tiempo
    }
}


// =============================================
// SECCIÓN DE PAGOS (COBRANZA)
// =============================================

async function handleSearchCreditForPayment() {
    const idCreditoInput = document.getElementById('idCredito_cobranza');
    const historicalIdCredito = idCreditoInput.value.trim(); // Este es el ID histórico
    const statusCobranza = document.getElementById('status_cobranza');
    const formCobranza = document.getElementById('form-cobranza');
    const btnBuscar = document.getElementById('btnBuscarCredito_cobranza');

    creditoActual = null; // Resetear crédito seleccionado

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
        // Buscar créditos que coincidan con el ID histórico
        const creditosEncontrados = await database.buscarCreditosPorHistoricalId(historicalIdCredito);

        if (creditosEncontrados.length === 0) {
            showFixedProgress(100, 'Crédito no encontrado');
            throw new Error(`No se encontró ningún crédito con el ID histórico: ${historicalIdCredito}`);
        }

        // Si se encuentran MÚLTIPLES créditos con el MISMO ID histórico (de diferentes clientes/sucursales)
        if (creditosEncontrados.length > 1) {
            console.warn(`Se encontraron ${creditosEncontrados.length} créditos con el ID histórico ${historicalIdCredito}. Mostrando el más reciente.`);
            // Ordenar por fecha de creación para tomar el más reciente como predeterminado
            creditosEncontrados.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
            // Aquí podríamos implementar lógica para que el usuario seleccione cuál quiere,
            // pero por ahora tomamos el más reciente.
            showStatus('status_cobranza', `Advertencia: Se encontraron ${creditosEncontrados.length} créditos con ID ${historicalIdCredito}. Se cargó el más reciente (${creditosEncontrados[0].curpCliente}).`, 'warning');
        }

        creditoActual = creditosEncontrados[0]; // Guardamos el objeto completo { id: firestoreId, ..., historicalIdCredito: ... }

        showFixedProgress(60, 'Obteniendo datos del cliente...');
        const cliente = await database.buscarClientePorCURP(creditoActual.curpCliente);
        if (!cliente) {
            console.warn(`No se encontró cliente para CURP ${creditoActual.curpCliente} del crédito ${historicalIdCredito}`);
        }


        // =============================================
        // *** INICIO DE LA CORRECCIÓN 2 ***
        // =============================================
        showFixedProgress(80, 'Calculando historial del crédito...');
        // Usar el historicalIdCredito para obtener los pagos
        const historicalId = creditoActual.historicalIdCredito || creditoActual.id; // Asegurar que tenemos el historicalId
        const pagos = await database.getPagosPorCredito(historicalId); // Obtener los pagos
        
        // Calcular el historial/estado usando la función helper que acabamos de agregar
        const historial = _calcularEstadoCredito(creditoActual, pagos); 

        if (!historial) {
            // Esto podría pasar si el crédito encontrado tiene datos inconsistentes
            console.error("No se pudo calcular el historial para el crédito:", creditoActual);
            throw new Error(`No se pudo calcular el historial del crédito ${historicalId}. Verifica los datos del crédito (monto, plazo, fecha).`);
        }
        // =============================================
        // *** FIN DE LA CORRECCIÓN 2 ***
        // =============================================

        // Llenar formulario con datos del historial
        document.getElementById('nombre_cobranza').value = cliente ? cliente.nombre : (creditoActual.nombreCliente || 'Cliente Desconocido');
        document.getElementById('saldo_cobranza').value = `$${historial.saldoRestante.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('estado_cobranza').value = historial.estado.toUpperCase();
        document.getElementById('semanas_atraso_cobranza').value = historial.semanasAtraso || 0;
        document.getElementById('pago_semanal_cobranza').value = `$${historial.pagoSemanal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('fecha_proximo_pago_cobranza').value = historial.proximaFechaPago || 'N/A';
        // Sugerir el monto del pago semanal, pero permitir editarlo
        const montoInput = document.getElementById('monto_cobranza');
        montoInput.value = historial.pagoSemanal > 0 ? historial.pagoSemanal.toFixed(2) : '';
        handleMontoPagoChange(); // Calcular saldo después con el valor sugerido

        showFixedProgress(100, 'Crédito encontrado');
        formCobranza.classList.remove('hidden'); // Mostrar formulario de pago

        // Mensaje de éxito, limpiar advertencia previa si la hubo
        if (!statusCobranza.textContent.includes('Advertencia')) {
            showStatus('status_cobranza', `Crédito ${historicalIdCredito} encontrado (${creditoActual.curpCliente}). Listo para registrar pago.`, 'success');
        }

        // Poner foco en el monto para agilizar
        montoInput.focus();
        montoInput.select();


    } catch (error) {
        console.error("Error buscando crédito para pago:", error);
        showStatus('status_cobranza', `Error: ${error.message}`, 'error');
        formCobranza.classList.add('hidden');
        creditoActual = null; // Asegurar que no quede crédito seleccionado
        hideFixedProgress();
    } finally {
        showButtonLoading(btnBuscar, false);
        if (!document.querySelector('#status_cobranza.status-error')) {
            setTimeout(hideFixedProgress, 1500);
        }
    }
}


async function handlePaymentForm(e) {
    e.preventDefault();
    const submitButton = e.target.querySelector('button[type="submit"]');
    const statusCobranza = document.getElementById('status_cobranza');


    if (!creditoActual || !creditoActual.id || !(creditoActual.historicalIdCredito || creditoActual.id)) { // Usar ID de firestore o histórico como fallback
        showStatus('status_cobranza', 'Error: No hay un crédito válido seleccionado. Por favor, busca el crédito de nuevo.', 'error');
        return;
    }
    const historicalId = creditoActual.historicalIdCredito || creditoActual.id; // ID a guardar en el pago


    const montoInput = document.getElementById('monto_cobranza');
    const montoPago = parseFloat(montoInput.value);
    const tipoPago = document.getElementById('tipo_cobranza').value;


    if (isNaN(montoPago) || montoPago <= 0) {
        showStatus('status_cobranza', 'Error: El monto del pago debe ser un número positivo.', 'error');
        montoInput.classList.add('input-error');
        return;
    } else {
        montoInput.classList.remove('input-error');
    }

    // Verificar si el monto excede el saldo (usando el saldo del objeto creditoActual)
    const saldoActual = creditoActual.saldo !== undefined ? creditoActual.saldo : 0;
    if (montoPago > saldoActual + 0.01) { // Margen pequeño
        showStatus('status_cobranza', `Error: El monto del pago ($${montoPago.toFixed(2)}) excede el saldo restante ($${saldoActual.toFixed(2)}).`, 'error');
        montoInput.classList.add('input-error');
        return;
    }


    showButtonLoading(submitButton, true, 'Registrando...');
    showFixedProgress(50, 'Procesando pago...');
    statusCobranza.innerHTML = 'Registrando pago...';
    statusCobranza.className = 'status-message status-info';


    try {
        const pagoData = {
            idCredito: historicalId, // Guardar el ID histórico/original en el pago
            monto: montoPago,
            tipoPago: tipoPago
            // curpCliente y office se añadirán dentro de database.agregarPago
        };


        // Pasar el ID único de Firestore a agregarPago para que actualice el documento correcto
        const resultado = await database.agregarPago(pagoData, currentUser.email, creditoActual.id);


        if (resultado.success) {
            showFixedProgress(100, 'Pago registrado');
            let successMsg = '¡Pago registrado exitosamente!';
            if (!isOnline) successMsg += ' (Guardado localmente).';
            showStatus('status_cobranza', successMsg, 'success');


            // Limpiar y ocultar formulario
            document.getElementById('form-cobranza').classList.add('hidden');
            document.getElementById('idCredito_cobranza').value = ''; // Limpiar campo de búsqueda
            creditoActual = null; // Deseleccionar crédito


        } else {
            // Error devuelto por agregarPago (ej. monto excede saldo, error de transacción)
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


function handleMontoPagoChange() {
    // Si no hay crédito cargado, no hacer nada
    if (!creditoActual || creditoActual.saldo === undefined) return;

    const montoInput = document.getElementById('monto_cobranza');
    const saldoDespuesInput = document.getElementById('saldoDespues_cobranza');
    const saldoActual = creditoActual.saldo; // Usar el saldo del objeto cargado

    if (!montoInput || !saldoDespuesInput) return;

    const monto = parseFloat(montoInput.value) || 0;
    const saldoDespues = saldoActual - monto;

    // Formatear para mostrar
    saldoDespuesInput.value = `$${saldoDespues.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Validar visualmente si el monto excede el saldo
    if (monto > saldoActual + 0.01) { // Margen pequeño
        montoInput.classList.add('input-error');
        montoInput.title = "El monto excede el saldo actual";
        // Mostrar advertencia persistente si excede
        showStatus('status_cobranza', 'Advertencia: El monto ingresado excede el saldo restante.', 'warning');
    } else {
        montoInput.classList.remove('input-error');
        montoInput.title = "";
        // Limpiar advertencia si estaba visible y ya no aplica, solo si no hay otro error
        const statusCobranza = document.getElementById('status_cobranza');
        if (statusCobranza.classList.contains('status-warning') && statusCobranza.textContent.includes('excede')) {
            // Volver a mensaje de 'listo para registrar' si es el caso
            const historicalId = creditoActual.historicalIdCredito || creditoActual.id;
            showStatus('status_cobranza', `Crédito ${historicalId} encontrado (${creditoActual.curpCliente}). Listo para registrar pago.`, 'success');
        }
    }
}


// =============================================
// SECCIÓN DE PAGO GRUPAL
// =============================================
async function handleBuscarGrupoParaPago() {
    const grupoSelect = document.getElementById('grupo_pago_grupal');
    const grupo = grupoSelect.value;
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const btnBuscar = document.getElementById('btn-buscar-grupo-pago');
    const detailsDiv = document.getElementById('grupo-pago-details');


    if (!grupo) {
        showStatus('status_pago_grupo', 'Por favor, selecciona un grupo.', 'warning');
        detailsDiv.classList.add('hidden'); // Ocultar detalles si no hay grupo
        return;
    }


    showButtonLoading(btnBuscar, true, 'Calculando...');
    showProcessingOverlay(true, `Buscando créditos activos en el grupo ${grupo}...`);
    statusPagoGrupo.innerHTML = 'Calculando cobranza para el grupo...';
    statusPagoGrupo.className = 'status-message status-info';
    detailsDiv.classList.add('hidden'); // Ocultar detalles mientras busca
    grupoDePagoActual = null; // Resetear grupo actual


    try {
        // 1. Buscar clientes en el grupo
        const clientesDelGrupo = await database.buscarClientes({ grupo: grupo });


        if (clientesDelGrupo.length === 0) {
            throw new Error(`No se encontraron clientes registrados en el grupo '${grupo}'.`);
        }


        // 2. Para cada cliente, buscar su crédito activo (no liquidado)
        let totalClientesActivos = 0;
        let totalACobrarSemanal = 0;
        let creditosParaPagar = [];
        let clientesConErrores = [];


        for (const cliente of clientesDelGrupo) {
            // Usar buscarCreditoActivoPorCliente que ya filtra por no liquidados y toma el más reciente
            const creditoActivo = await database.buscarCreditoActivoPorCliente(cliente.curp);


            if (creditoActivo && creditoActivo.saldo > 0.01) { // Solo si hay crédito activo con saldo
                // Calcular pago semanal para este crédito
                if (creditoActivo.montoTotal && creditoActivo.plazo && creditoActivo.plazo > 0) {
                    const pagoSemanal = creditoActivo.montoTotal / creditoActivo.plazo;
                    totalClientesActivos++;
                    totalACobrarSemanal += pagoSemanal;
                    creditosParaPagar.push({
                        firestoreId: creditoActivo.id, // ID Único de Firestore
                        historicalIdCredito: creditoActivo.historicalIdCredito || creditoActivo.id, // ID Histórico
                        curpCliente: cliente.curp,
                        nombreCliente: cliente.nombre,
                        pagoSemanal: pagoSemanal
                    });
                } else {
                    console.warn(`Crédito ${creditoActivo.historicalIdCredito || creditoActivo.id} de ${cliente.curp} tiene datos inconsistentes (monto/plazo).`);
                    clientesConErrores.push(`${cliente.nombre} (${cliente.curp}) - Datos inconsistentes`);
                }
            }
        }


        if (totalClientesActivos === 0) {
            let msg = `No se encontraron créditos activos con saldo pendiente en el grupo '${grupo}'.`;
            if (clientesConErrores.length > 0) {
                msg += ` ${clientesConErrores.length} clientes tuvieron créditos con datos inconsistentes.`
            }
            throw new Error(msg);
        }


        // Guardar datos calculados
        grupoDePagoActual = {
            grupo: grupo,
            creditos: creditosParaPagar,
            totalCalculado: totalACobrarSemanal
        };


        // Mostrar resultados
        document.getElementById('total-clientes-grupo').textContent = totalClientesActivos;
        document.getElementById('total-a-cobrar-grupo').textContent = `$${totalACobrarSemanal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('monto-recibido-grupo').value = totalACobrarSemanal.toFixed(2); // Sugerir monto


        detailsDiv.classList.remove('hidden');
        let successMsg = `Se encontraron ${totalClientesActivos} créditos activos para cobrar esta semana en el grupo '${grupo}'.`;
        if (clientesConErrores.length > 0) {
            successMsg += ` (${clientesConErrores.length} con datos inconsistentes omitidos).`;
            showStatus('status_pago_grupo', successMsg, 'warning');
        } else {
            showStatus('status_pago_grupo', successMsg, 'success');
        }


    } catch (error) {
        console.error("Error al buscar grupo para pago:", error);
        showStatus('status_pago_grupo', `Error: ${error.message}`, 'error');
        detailsDiv.classList.add('hidden'); // Ocultar si hay error
        grupoDePagoActual = null; // Resetear
    } finally {
        showButtonLoading(btnBuscar, false);
        showProcessingOverlay(false);
    }
}


async function handleRegistroPagoGrupal() {
    const btnRegistrar = document.getElementById('btn-registrar-pago-grupal');
    const statusPagoGrupo = document.getElementById('status_pago_grupo');
    const montoRecibidoInput = document.getElementById('monto-recibido-grupo');


    if (!grupoDePagoActual || !grupoDePagoActual.creditos || grupoDePagoActual.creditos.length === 0) {
        showStatus('status_pago_grupo', 'Error: No hay un grupo calculado o no hay créditos para registrar.', 'error');
        return;
    }


    const montoRecibido = parseFloat(montoRecibidoInput.value);
    const { creditos, totalCalculado, grupo } = grupoDePagoActual;


    if (isNaN(montoRecibido) || montoRecibido <= 0) {
        showStatus('status_pago_grupo', 'Error: El monto total recibido debe ser un número positivo.', 'error');
        montoRecibidoInput.classList.add('input-error');
        return;
    } else {
        montoRecibidoInput.classList.remove('input-error');
    }


    // Advertencia si el monto es menor, pero permitir continuar (se registrará pago parcial proporcionalmente?)
    // O mejor, exigir el monto completo para el pago grupal simple.
    if (montoRecibido < totalCalculado - 0.01) { // Pequeño margen
        showStatus('status_pago_grupo', `Advertencia: El monto recibido ($${montoRecibido.toFixed(2)}) es menor al total calculado ($${totalCalculado.toFixed(2)}). El pago grupal solo registra el pago semanal completo. Registra faltantes individualmente.`, 'warning');
        // Decisión: No continuar si el monto es menor para evitar confusión.
        return;
    }
    // Permitir que sea mayor (pagos extra)? Por ahora, no. El pago grupal aplica solo el semanal.
    if (montoRecibido > totalCalculado + 0.01) {
        showStatus('status_pago_grupo', `Advertencia: El monto recibido ($${montoRecibido.toFixed(2)}) es mayor al total calculado ($${totalCalculado.toFixed(2)}). Solo se registrará el pago semanal ($${totalCalculado.toFixed(2)}). Registra pagos extraordinarios individualmente.`, 'warning');
        // Continuar, pero solo registrar el pago semanal.
    }


    showButtonLoading(btnRegistrar, true, 'Registrando...');
    showProcessingOverlay(true, `Registrando ${creditos.length} pagos para el grupo ${grupo}...`);
    statusPagoGrupo.innerHTML = 'Registrando pagos grupales...';
    statusPagoGrupo.className = 'status-message status-info';


    try {
        let pagosRegistrados = 0;
        const erroresRegistro = [];


        // Procesar en lotes más pequeños para mayor robustez
        const MAX_BATCH_SIZE = 100; // Reducir tamaño de lote para transacciones
        for (let i = 0; i < creditos.length; i += MAX_BATCH_SIZE) {
            const chunk = creditos.slice(i, i + MAX_BATCH_SIZE);
            const batch = db.batch();


            // Obtener datos actuales de los créditos en el chunk
            const firestoreIdsChunk = chunk.map(c => c.firestoreId);
            const creditosSnapshot = await db.collection('creditos').where(firebase.firestore.FieldPath.documentId(), 'in', firestoreIdsChunk).get();
            const creditosDataMap = new Map();
            creditosSnapshot.forEach(doc => {
                creditosDataMap.set(doc.id, doc.data());
            });


            for (const creditoInfo of chunk) {
                const creditoActualData = creditosDataMap.get(creditoInfo.firestoreId);


                if (creditoActualData && creditoActualData.saldo > 0.01) { // Doble check
                    const pagoMonto = creditoInfo.pagoSemanal; // Usar el pago semanal calculado
                    const nuevoSaldo = creditoActualData.saldo - pagoMonto;


                    // Referencia al documento de crédito
                    const creditoRef = db.collection('creditos').doc(creditoInfo.firestoreId);
                    batch.update(creditoRef, {
                        saldo: nuevoSaldo,
                        estado: (nuevoSaldo <= 0.01) ? 'liquidado' : creditoActualData.estado, // Mantener estado si no liquida
                        modificadoPor: currentUser.email,
                        fechaModificacion: new Date().toISOString()
                    });


                    // Crear nuevo documento de pago
                    const pagoRef = db.collection('pagos').doc(); // ID automático
                    batch.set(pagoRef, {
                        idCredito: creditoInfo.historicalIdCredito, // ID Histórico
                        monto: pagoMonto,
                        tipoPago: 'grupal',
                        fecha: new Date().toISOString(),
                        saldoDespues: nuevoSaldo,
                        registradoPor: currentUser.email,
                        office: creditoActualData.office, // Añadir datos relevantes al pago
                        curpCliente: creditoActualData.curpCliente,
                        grupo: grupo // Guardar el grupo al que pertenecía el pago
                    });
                    pagosRegistrados++;
                } else if (!creditoActualData) {
                    erroresRegistro.push(`No se encontró el crédito con ID Firestore ${creditoInfo.firestoreId} para ${creditoInfo.curpCliente}`);
                } else {
                    // Ya estaba liquidado o sin saldo
                    console.log(`Crédito ${creditoInfo.historicalIdCredito} ya liquidado, omitiendo pago grupal.`);
                }
            }


            // Ejecutar el batch
            await batch.commit();
            console.log(`Lote de ${chunk.length} pagos grupales procesado.`);
            // Pausa breve entre lotes si hay muchos
            if (i + MAX_BATCH_SIZE < creditos.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } // Fin del bucle for (lotes)


        let finalMessage = `¡Éxito! Se registraron ${pagosRegistrados} pagos grupales para el grupo '${grupo}'.`;
        let finalStatusType = 'success';


        if (erroresRegistro.length > 0) {
            finalMessage += ` Se encontraron ${erroresRegistro.length} errores: ${erroresRegistro.join(', ')}`;
            finalStatusType = 'warning';
            console.error("Errores durante registro de pago grupal:", erroresRegistro);
        }


        showStatus('status_pago_grupo', finalMessage, finalStatusType);


        // Limpiar
        document.getElementById('grupo-pago-details').classList.add('hidden');
        document.getElementById('grupo_pago_grupal').value = '';
        montoRecibidoInput.value = '';
        grupoDePagoActual = null;


    } catch (error) {
        console.error("Error crítico al registrar pago grupal:", error);
        showStatus('status_pago_grupo', `Error crítico al registrar los pagos: ${error.message}. Es posible que algunos pagos no se hayan completado.`, 'error');
    } finally {
        showButtonLoading(btnRegistrar, false);
        showProcessingOverlay(false);
    }
}


// =============================================
// SECCIÓN DE REPORTES GRÁFICOS
// =============================================

async function handleGenerarGrafico() {
    if (cargaEnProgreso) {
        showStatus('status_graficos', 'Ya hay una operación en progreso. Por favor, espera.', 'warning');
        return;
    }
    cargaEnProgreso = true;
    showProcessingOverlay(true, 'Generando datos para el gráfico...');
    // =============================================
    // *** INICIO DE LA CORRECCIÓN 3 (Instancia 7) ***
    // =============================================
    showButtonLoading('#btn-generar-grafico', true, 'Generando...');
    // =============================================
    // *** FIN DE LA CORRECCIÓN 3 (Instancia 7) ***
    // =============================================
    const statusGraficos = document.getElementById('status_graficos');
    const chartContainer = document.getElementById('grafico-container');
    chartContainer.innerHTML = ''; // Limpiar gráfico anterior

    try {
        // Recoger filtros
        const tipoReporte = document.getElementById('grafico_tipo_reporte').value;
        const fechaInicio = document.getElementById('grafico_fecha_inicio').value;
        const fechaFin = document.getElementById('grafico_fecha_fin').value;
        const sucursal = document.getElementById('grafico_sucursal').value;
        const grupo = document.getElementById('grafico_grupo').value;
        const agruparPor = document.getElementById('grafico_agrupar_por').value;
        const tipoGrafico = document.getElementById('grafico_tipo_grafico').value;

        if (!tipoReporte || !fechaInicio || !fechaFin) {
            throw new Error("Por favor, selecciona el tipo de reporte y un rango de fechas.");
        }
        // Validar rango de fechas?
        if (new Date(fechaInicio) > new Date(fechaFin)) {
            throw new Error("La fecha de inicio no puede ser posterior a la fecha de fin.");
        }


        statusGraficos.textContent = 'Obteniendo datos...';
        statusGraficos.className = 'status-message status-info';

        // Obtener datos filtrados
        const { creditos, pagos } = await database.obtenerDatosParaGraficos({ sucursal, grupo, fechaInicio, fechaFin });

        statusGraficos.textContent = 'Procesando datos para el gráfico...';

        let datosAgrupados = {};
        let labelPrefix = ''; // Para el título del dataset

        // --- Lógica de Agrupación ---
        const agruparDatos = (data, campoFecha, campoValor) => {
            const agrupados = {};
            data.forEach(item => {
                const fecha = parsearFecha(item[campoFecha]);
                if (!fecha || isNaN(fecha.getTime())) {
                    console.warn("Fecha inválida encontrada:", item[campoFecha], "en item:", item);
                    return; // Saltar item con fecha inválida
                }


                let clave;
                const anio = fecha.getUTCFullYear();
                const mes = fecha.getUTCMonth(); // 0-11
                const dia = fecha.getUTCDate();


                // Cálculo de la semana del año (ISO 8601 week date)
                const fechaInicioSemana = new Date(Date.UTC(anio, mes, dia));
                fechaInicioSemana.setUTCDate(fechaInicioSemana.getUTCDate() + 4 - (fechaInicioSemana.getUTCDay() || 7)); // Jueves de la semana
                const inicioAnio = new Date(Date.UTC(anio, 0, 1));
                const semana = Math.ceil((((fechaInicioSemana - inicioAnio) / 86400000) + 1) / 7);


                if (agruparPor === 'anio') {
                    clave = `${anio}`;
                } else if (agruparPor === 'mes') {
                    clave = `${anio}-${String(mes + 1).padStart(2, '0')}`; // Mes 1-12
                } else { // 'semana'
                    clave = `${anio}-S${String(semana).padStart(2, '0')}`;
                }


                if (!agrupados[clave]) {
                    agrupados[clave] = 0;
                }
                agrupados[clave] += parseFloat(item[campoValor] || 0); // Asegurar que es número
            });
            return agrupados;
        };


        // --- Procesamiento según Tipo de Reporte ---
        if (tipoReporte === 'colocacion') {
            datosAgrupados = agruparDatos(creditos, 'fechaCreacion', 'monto');
            labelPrefix = 'Monto Colocado';
        } else if (tipoReporte === 'recuperacion') {
            datosAgrupados = agruparDatos(pagos, 'fecha', 'monto');
            labelPrefix = 'Monto Recuperado';
        } else if (tipoReporte === 'comportamiento') {
            // Agrupar pagos por tipo
            datosAgrupados = pagos.reduce((acc, pago) => {
                const tipo = (pago.tipoPago || 'normal').toLowerCase();
                // Capitalizar primera letra para la etiqueta
                const clave = tipo.charAt(0).toUpperCase() + tipo.slice(1);
                if (!acc[clave]) acc[clave] = 0;
                acc[clave] += parseFloat(pago.monto || 0);
                return acc;
            }, {});
            labelPrefix = 'Monto por Tipo de Pago';
        } else {
            throw new Error("Tipo de reporte gráfico no reconocido.");
        }


        // Preparar datos para Chart.js
        const labels = Object.keys(datosAgrupados).sort(); // Ordenar etiquetas (fechas/semanas/tipos)
        const dataValues = labels.map(label => datosAgrupados[label]);


        if (labels.length === 0) {
            statusGraficos.textContent = 'No se encontraron datos para graficar con los filtros seleccionados.';
            statusGraficos.className = 'status-message status-info';
            return; // No generar gráfico vacío
        }


        // Configuración de colores (simple, se puede mejorar)
        const baseColor = 'rgba(46, 139, 87, 0.6)'; // Verde Finzana semitransparente
        const borderColor = 'rgba(46, 139, 87, 1)'; // Verde Finzana sólido


        // Generar colores diferentes para gráficos de pastel/dona
        const backgroundColors = (tipoGrafico === 'pie' || tipoGrafico === 'doughnut')
            ? labels.map((_, index) => `hsl(${index * (360 / labels.length)}, 70%, 60%)`)
            : baseColor;


        const datosParaGrafico = {
            labels,
            datasets: [{
                label: `${labelPrefix}${sucursal ? ` (${sucursal})` : ''}${grupo ? ` [${grupo}]` : ''}`,
                data: dataValues,
                backgroundColor: backgroundColors,
                borderColor: borderColor,
                borderWidth: (tipoGrafico === 'line') ? 2 : 1,
                fill: (tipoGrafico === 'line') ? false : true, // No rellenar bajo la línea por defecto
                tension: (tipoGrafico === 'line') ? 0.1 : 0 // Suavizar línea ligeramente
            }]
        };

        // Crear el canvas y el gráfico
        chartContainer.innerHTML = '<canvas id="myChart"></canvas>';
        const ctx = document.getElementById('myChart').getContext('2d');

        if (currentChart) {
            currentChart.destroy(); // Destruir instancia anterior
        }

        currentChart = new Chart(ctx, {
            type: tipoGrafico,
            data: datosParaGrafico,
            options: {
                responsive: true,
                maintainAspectRatio: false, // Permitir que el canvas se ajuste al contenedor
                plugins: {
                    legend: {
                        position: 'top', // Posición de la leyenda
                    },
                    title: {
                        display: true,
                        text: `Gráfico de ${labelPrefix}` // Título del gráfico
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    // Formatear como moneda
                                    label += new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    // Ocultar escalas para pie/doughnut
                    x: {
                        display: !(tipoGrafico === 'pie' || tipoGrafico === 'doughnut'),
                        title: {
                            display: true,
                            text: agruparPor.charAt(0).toUpperCase() + agruparPor.slice(1) // Eje X = Semana/Mes/Año
                        }
                    },
                    y: {
                        display: !(tipoGrafico === 'pie' || tipoGrafico === 'doughnut'),
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Monto ($)' // Eje Y = Monto
                        },
                        ticks: {
                            // Formatear ticks del eje Y como moneda
                            callback: function (value, index, values) {
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
            currentChart.destroy(); // Limpiar si hubo error
            currentChart = null;
        }
        chartContainer.innerHTML = '<p style="text-align: center; color: var(--danger);">No se pudo generar el gráfico.</p>'; // Mensaje en lugar del canvas
    } finally {
        cargaEnProgreso = false;
        showProcessingOverlay(false);
        // =============================================
        // *** INICIO DE LA CORRECCIÓN 3 (Instancia 8) ***
        // =============================================
        showButtonLoading('#btn-generar-grafico', false);
        // =============================================
        // *** FIN DE LA CORRECCIÓN 3 (Instancia 8) ***
        // =============================================
    }
}


// =============================================
// FUNCIONES DE VISTA Y AUXILIARES GENERALES
// =============================================

function showView(viewId) {
    console.log(`Navegando a vista: ${viewId}`);
    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));

    // Mostrar la vista objetivo
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        // Disparar evento personalizado para que las vistas puedan reaccionar (ej. cargar datos)
        const event = new CustomEvent('viewshown', { detail: { viewId } });
        targetView.dispatchEvent(event);
        console.log(`Vista ${viewId} mostrada.`);
    } else {
        console.error(`Error: No se encontró la vista con ID ${viewId}`);
        // Opcional: Mostrar vista de error o volver al menú principal
        const fallbackView = document.getElementById('view-main-menu');
        if (fallbackView) fallbackView.classList.remove('hidden');
    }
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message; // Usar innerHTML permite tags como <b>
        // Asegurar que solo una clase de tipo de status esté presente
        element.classList.remove('status-success', 'status-error', 'status-info', 'status-warning', 'hidden'); // Quitar hidden también
        if (type === 'success') {
            element.classList.add('status-success');
        } else if (type === 'error') {
            element.classList.add('status-error');
        } else if (type === 'warning') {
            element.classList.add('status-warning');
        } else { // 'info' o por defecto
            element.classList.add('status-info');
        }
        // Opcional: Ocultar automáticamente mensajes de éxito después de un tiempo
        if (type === 'success') {
            setTimeout(() => {
                // Solo ocultar si el mensaje no ha cambiado mientras tanto y sigue siendo success
                if (element.innerHTML === message && element.classList.contains('status-success')) {
                    element.classList.add('hidden'); // Ocultar con clase
                }
            }, 5000); // Ocultar éxito después de 5 segundos
        }
    } else {
        console.warn(`Elemento de estado con ID "${elementId}" no encontrado.`);
    }
}


function showProcessingOverlay(show, message = 'Procesando...') {
    let overlay = document.getElementById('processing-overlay');
    // Crear si no existe
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'processing-overlay';
        overlay.className = 'processing-overlay hidden'; // Empezar oculto
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
    if (!button) {
        console.warn("showButtonLoading: Botón no encontrado con selector:", selector);
        return;
    }

    if (show) {
        // Guardar texto original si no se ha guardado ya
        if (!button.hasAttribute('data-original-text')) {
            button.setAttribute('data-original-text', button.innerHTML);
        }
        // Mostrar spinner y texto opcional
        button.innerHTML = `<span class="btn-spinner"></span> ${loadingText}`;
        button.classList.add('btn-loading'); // Aplicar clase para estilos
        button.disabled = true; // Deshabilitar botón
    } else {
        // Restaurar texto original y habilitar
        const originalText = button.getAttribute('data-original-text');
        if (originalText !== null) { // Restaurar solo si se guardó
            button.innerHTML = originalText;
            button.removeAttribute('data-original-text'); // Limpiar atributo
        }
        button.classList.remove('btn-loading');
        button.disabled = false;
    }
}

// Asegúrate de tener estos estilos en styles.css para el spinner del botón:
/*
.btn-loading .btn-spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    margin-right: 0.5em;
    vertical-align: text-bottom;
}
.btn-loading > *:not(.btn-spinner) { // Ocultar otros iconos/texto mientras carga
    opacity: 0;
}
*/

// =============================================
// FUNCIONES DE BARRA DE PROGRESO Y UTILIDADES
// =============================================

function showFixedProgress(percentage, message = '') {
    let progressContainer = document.getElementById('progress-container-fixed');
    // Crear si no existe
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'progress-container-fixed';
        progressContainer.className = 'progress-container-fixed hidden'; // Empezar oculto
        progressContainer.innerHTML = `
            <div id="progress-text-fixed" class="progress-text-fixed"></div>
            <div id="progress-bar-fixed" class="progress-bar-fixed" style="width: 0%;"></div>
            <button id="btn-cancelar-carga-fixed" class="btn-cancelar-carga-fixed" title="Cancelar operación">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.insertBefore(progressContainer, document.body.firstChild);
        document.getElementById('btn-cancelar-carga-fixed').addEventListener('click', cancelarCarga);
    }

    // Actualizar elementos
    const progressBar = document.getElementById('progress-bar-fixed');
    const progressText = document.getElementById('progress-text-fixed');

    // Validar porcentaje
    const validPercentage = Math.max(0, Math.min(100, percentage));


    if (progressBar) progressBar.style.width = validPercentage + '%';
    if (progressText) progressText.textContent = message;

    // Mostrar contenedor
    progressContainer.classList.remove('hidden');
    progressContainer.style.display = 'flex'; // Asegurar display flex
    document.body.classList.add('has-progress'); // Añadir padding al body si es necesario
}

function hideFixedProgress() {
    const progressContainer = document.getElementById('progress-container-fixed');
    if (progressContainer) {
        progressContainer.classList.add('hidden'); // Ocultar con clase
        progressContainer.style.display = 'none'; // Asegurar ocultación
        // Resetear barra para la próxima vez
        const progressBar = document.getElementById('progress-bar-fixed');
        if (progressBar) progressBar.style.width = '0%';
        const progressText = document.getElementById('progress-text-fixed');
        if (progressText) progressText.textContent = '';


    }
    document.body.classList.remove('has-progress'); // Quitar padding
}

function cancelarCarga() {
    console.warn("Operación cancelada por el usuario.");
    // Marcar la operación actual como cancelada para que los bucles se detengan
    currentSearchOperation = null;
    cargaEnProgreso = false; // Forzar estado a no en progreso

    // Ocultar indicadores visuales
    hideFixedProgress();
    showProcessingOverlay(false);

    // Restaurar botones que podrían estar en estado de carga (usando selector más general)
    document.querySelectorAll('.btn-loading').forEach(button => {
        showButtonLoading(button, false);
    });


    // Mostrar mensaje de cancelación en la vista activa (si es relevante)
    const activeView = document.querySelector('.view:not(.hidden)');
    if (activeView) {
        const statusElement = activeView.querySelector('.status-message'); // Buscar cualquier status message
        const statusElementId = statusElement?.id || (activeView.id ? `status_${activeView.id.replace('view-', '')}` : null);


        if (statusElementId) {
            showStatus(statusElementId, 'Operación cancelada por el usuario.', 'warning');
        }
        // Resetear tabla si es la de gestión de clientes
        if (activeView.id === 'view-gestion-clientes') {
            const tabla = document.getElementById('tabla-clientes');
            if (tabla) tabla.innerHTML = '<tr><td colspan="6">Búsqueda cancelada. Utiliza los filtros para buscar de nuevo.</td></tr>';
        }
    }
}


function calcularMontoTotalColocacion() {
    const montoInput = document.getElementById('monto_colocacion');
    const montoTotalInput = document.getElementById('montoTotal_colocacion');
    if (!montoInput || !montoTotalInput) return;


    const monto = parseFloat(montoInput.value) || 0;
    const montoTotal = monto * 1.3; // Calcular con 30%


    // Formatear como moneda para mostrar
    montoTotalInput.value = monto > 0
        ? `$${montoTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '';
}


function validarCURP(inputElement) {
    if (!inputElement) return;
    // Convertir a mayúsculas y limitar longitud
    inputElement.value = inputElement.value.toUpperCase().substring(0, 18);

    // Validación visual simple (longitud)
    if (inputElement.value.length === 0) {
        inputElement.classList.remove('input-error', 'input-success'); // Sin estilo si está vacío
    } else if (validarFormatoCURP(inputElement.value)) { // Usar validación con Regex
        inputElement.classList.remove('input-error');
        inputElement.classList.add('input-success'); // Verde si tiene formato correcto
    } else {
        inputElement.classList.remove('input-success');
        inputElement.classList.add('input-error'); // Rojo si no
    }
}


function validarFormatoCURP(curp) {
    // Verifica longitud y patrón básico (4 letras, 6 números, H/M, 5 letras, homoclave(A-Z0-9), dígito verificador)
    const curpRegex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
    return typeof curp === 'string' && curp.length === 18 && curpRegex.test(curp.toUpperCase());
}


const popularDropdown = (elementId, options, placeholder, isObjectValueKey = false) => {
    const select = document.getElementById(elementId);
    if (!select) {
        console.warn(`Dropdown con ID "${elementId}" no encontrado.`);
        return;
    }

    // Guardar valor seleccionado si existe
    const selectedValue = select.value;


    select.innerHTML = `<option value="">${placeholder}</option>`; // Opción por defecto


    options.forEach(option => {
        const optionElement = document.createElement('option');
        if (isObjectValueKey) {
            optionElement.value = option.value; // ej: { value: 'admin', text: 'Administrador' }
            optionElement.textContent = option.text;
        } else {
            optionElement.value = option; // ej: ['GDL', 'LEON']
            optionElement.textContent = option;
        }
        select.appendChild(optionElement);
    });


    // Intentar restaurar valor seleccionado
    if (select.querySelector(`option[value="${selectedValue}"]`)) {
        select.value = selectedValue;
    }
};


function handleOfficeChangeForClientForm() {
    const office = this.value || document.getElementById('office_cliente')?.value; // Obtener oficina
    const poblacionesGdl = ['LA CALERA', 'ATEQUIZA', 'SAN JACINTO', 'PONCITLAN', 'OCOTLAN', 'ARENAL', 'AMATITAN', 'ACATLAN DE JUAREZ', 'BELLAVISTA', 'SAN ISIDRO MAZATEPEC', 'TALA', 'CUISILLOS', 'HUAXTLA', 'NEXTIPAC', 'SANTA LUCIA', 'JAMAY', 'LA BARCA', 'SAN JUAN DE OCOTAN', 'TALA 2', 'EL HUMEDO', 'NEXTIPAC 2', 'ZZ PUEBLO'].sort();
    const poblacionesLeon = ["ARANDAS", "ARANDAS [E]", "BAJIO DE BONILLAS", "BAJIO DE BONILLAS [E]", "CAPULIN", "CARDENAS", "CARDENAS [E]", "CERRITO DE AGUA CALIENTE", "CERRITO DE AGUA CALIENTE [E]", "CORRALEJO", "CORRALEJO [E]", "CUERAMARO", "CUERAMARO [E]", "DOLORES HIDALGO", "EL ALACRAN", "EL EDEN", "EL FUERTE", "EL MEZQUITILLO", "EL MEZQUITILLO [E]", "EL PALENQUE", "EL PALENQUE [E]", "EL PAXTLE", "EL TULE", "EL TULE [E]", "ESTACION ABASOLO", "ESTACION ABASOLO [E]", "ESTACION CORRALEJO", "ESTACION CORRALEJO [E]", "ESTACION JOAQUIN", "ESTACION JOAQUIN [E]", "EX ESTACION CHIRIMOYA", "EX ESTacion CHIRIMOYA [E]", "GAVIA DE RIONDA", "GODOY", "GODOY [E]", "IBARRA", "IBARRA [E]", "LA ALDEA", "LA CARROZA", "LA CARROZA [E]", "LA ESCONDIDA", "LA SANDIA", "LA SANDIA [E]", "LAGUNA DE GUADALUPE", "LAS CRUCES", "LAS CRUCES [E]", "LAS MASAS", "LAS MASAS [E]", "LAS PALOMAS", "LAS TIRITAS", "LOMA DE LA ESPERANZA", "LOMA DE LA ESPERANZA [E]", "LOS DOLORES", "LOS GALVANES", "LOS GALVANES [E]", "MAGUEY BLANCO", "MEDRANOS", "MEXICANOS", "MEXICANOS [E]", "MINERAL DE LA LUZ", "MISION DE ABAJO", "MISION DE ABAJO [E]", "MISION DE ARRIBA", "MISION DE ARRIBA [E]", "NORIA DE ALDAY", "OCAMPO", "PURISIMA DEL RINCON", "PURISima DEL RINCON [E]", "RANCHO NUEVO DE LA CRUZ", "RANCHO NUEVO DE LA CRUZ [E]", "RANCHO VIEJO", "RIO LAJA", "RIO LAJA [E]", "SAN ANDRES DE JALPA", "SAN ANDRES DE JALPA [E]", "SAN BERNARDO", "SAN BERNARDO [E]", "SAN CRISTOBAL", "SAN CRISTOBAL [E]", "SAN GREGORIO", "SAN GREGORIO [E]", "SAN ISIDRO DE CRESPO", "SAN ISIDRO DE CRESPO [E]", "SAN JOSE DE BADILLO", "SAN JOSE DE BADILLO [E]", "SAN JOSE DEL RODEO", "SAN JOSE DEL RODEO [E]", "SAN JUAN DE LA PUERTA", "SAN JUAN DE LA PUERTA [E]", "SANTA ANA DEL CONDE", "SANTA ROSA", "SANTA ROSA [E]", "SANTA ROSA PLAN DE AYALA", "SANTA ROSA PLAN DE AYALA [E]", "SANTO DOMINGO", "SERRANO", "TENERIA DEL SANTUARIO", "TENERIA DEL SANTUARIO [E]", "TIERRAS BLANCAS", "TIERRAS BLANCAS [E]", "TREJO", "TREJO [E]", "TUPATARO", "TUPATARO [E]", "VALTIERRILLA", "VALTIERRILLA 2", "VALTIERRILLA [E]", "VAQUERIAS", "VILLA DE ARRIAGA", "VILLA DE ARRIAGA [E]"].sort();


    // Si estamos editando, mostrar todas las poblaciones posibles para permitir cambiar cliente de oficina
    const poblaciones = editingClientId
        ? [...new Set([...poblacionesGdl, ...poblacionesLeon])].sort()
        : (office === 'LEON' ? poblacionesLeon : poblacionesGdl);


    popularDropdown('poblacion_grupo_cliente', poblaciones, 'Selecciona población/grupo');
}


function handleSucursalGraficoChange() {
    const office = this.value; // 'GDL', 'LEON', o ''
    const poblacionesGdl = ['LA CALERA', 'ATEQUIZA', 'SAN JACINTO', 'PONCITLAN', 'OCOTLAN', 'ARENAL', 'AMATITAN', 'ACATLAN DE JUAREZ', 'BELLAVISTA', 'SAN ISIDRO MAZATEPEC', 'TALA', 'CUISILLOS', 'HUAXTLA', 'NEXTIPAC', 'SANTA LUCIA', 'JAMAY', 'LA BARCA', 'SAN JUAN DE OCOTAN', 'TALA 2', 'EL HUMEDO', 'NEXTIPAC 2', 'ZZ PUEBLO'].sort();
    const poblacionesLeon = ["ARANDAS", "ARANDAS [E]", "BAJIO DE BONILLAS", "BAJIO DE BONILLAS [E]", "CAPULIN", "CARDENAS", "CARDENAS [E]", "CERRITO DE AGUA CALIENTE", "CERRITO DE AGUA CALIENTE [E]", "CORRALEJO", "CORRALEJO [E]", "CUERAMARO", "CUERAMARO [E]", "DOLORES HIDALGO", "EL ALACRAN", "EL EDEN", "EL FUERTE", "EL MEZQUITILLO", "EL MEZQUITILLO [E]", "EL PALENQUE", "EL PALENQUE [E]", "EL PAXTLE", "EL TULE", "EL TULE [E]", "ESTACION ABASOLO", "ESTACION ABASOLO [E]", "ESTACION CORRALEJO", "ESTACION CORRALEJO [E]", "ESTACION JOAQUIN", "ESTACION JOAQUIN [E]", "EX ESTACION CHIRIMOYA", "EX ESTacion CHIRIMOYA [E]", "GAVIA DE RIONDA", "GODOY", "GODOY [E]", "IBARRA", "IBARRA [E]", "LA ALDEA", "LA CARROZA", "LA CARROZA [E]", "LA ESCONDIDA", "LA SANDIA", "LA SANDIA [E]", "LAGUNA DE GUADALUPE", "LAS CRUCES", "LAS CRUCES [E]", "LAS MASAS", "LAS MASAS [E]", "LAS PALOMAS", "LAS TIRITAS", "LOMA DE LA ESPERANZA", "LOMA DE LA ESPERANZA [E]", "LOS DOLORES", "LOS GALVANES", "LOS GALVANES [E]", "MAGUEY BLANCO", "MEDRANOS", "MEXICANOS", "MEXICANOS [E]", "MINERAL DE LA LUZ", "MISION DE ABAJO", "MISION DE ABAJO [E]", "MISION DE ARRIBA", "MISION DE ARRIBA [E]", "NORIA DE ALDAY", "OCAMPO", "PURISIMA DEL RINCON", "PURISima DEL RINCON [E]", "RANCHO NUEVO DE LA CRUZ", "RANCHO NUEVO DE LA CRUZ [E]", "RANCHO VIEJO", "RIO LAJA", "RIO LAJA [E]", "SAN ANDRES DE JALPA", "SAN ANDRES DE JALPA [E]", "SAN BERNARDO", "SAN BERNARDO [E]", "SAN CRISTOBAL", "SAN CRISTOBAL [E]", "SAN GREGORIO", "SAN GREGORIO [E]", "SAN ISIDRO DE CRESPO", "SAN ISIDRO DE CRESPO [E]", "SAN JOSE DE BADILLO", "SAN JOSE DE BADILLO [E]", "SAN JOSE DEL RODEO", "SAN JOSE DEL RODEO [E]", "SAN JUAN DE LA PUERTA", "SAN JUAN DE LA PUERTA [E]", "SANTA ANA DEL CONDE", "SANTA ROSA", "SANTA ROSA [E]", "SANTA ROSA PLAN DE AYALA", "SANTA ROSA PLAN DE AYALA [E]", "SANTO DOMINGO", "SERRANO", "TENERIA DEL SANTUARIO", "TENERIA DEL SANTUARIO [E]", "TIERRAS BLANCAS", "TIERRAS BLANCAS [E]", "TREJO", "TREJO [E]", "TUPATARO", "TUPATARO [E]", "VALTIERRILLA", "VALTIERRILLA 2", "VALTIERRILLA [E]", "VAQUERIAS", "VILLA DE ARRIAGA", "VILLA DE ARRIAGA [E]"].sort();


    let poblacionesDisponibles;
    if (office === 'GDL') {
        poblacionesDisponibles = poblacionesGdl;
    } else if (office === 'LEON') {
        poblacionesDisponibles = poblacionesLeon;
    } else { // 'Ambas' o ''
        poblacionesDisponibles = [...new Set([...poblacionesGdl, ...poblacionesLeon])].sort();
    }
    popularDropdown('grafico_grupo', poblacionesDisponibles, 'Todos');
}

// Inicializar dropdowns principales al cargar
function inicializarDropdowns() {
    console.log('Inicializando dropdowns...');
    // Definir listas de opciones
    const poblacionesGdl = ['LA CALERA', 'ATEQUIZA', 'SAN JACINTO', 'PONCITLAN', 'OCOTLAN', 'ARENAL', 'AMATITAN', 'ACATLAN DE JUAREZ', 'BELLAVISTA', 'SAN ISIDRO MAZATEPEC', 'TALA', 'CUISILLOS', 'HUAXTLA', 'NEXTIPAC', 'SANTA LUCIA', 'JAMAY', 'LA BARCA', 'SAN JUAN DE OCOTAN', 'TALA 2', 'EL HUMEDO', 'NEXTIPAC 2', 'ZZ PUEBLO'].sort();
    const poblacionesLeon = ["ARANDAS", "ARANDAS [E]", "BAJIO DE BONILLAS", "BAJIO DE BONILLAS [E]", "CAPULIN", "CARDENAS", "CARDENAS [E]", "CERRITO DE AGUA CALIENTE", "CERRITO DE AGUA CALIENTE [E]", "CORRALEJO", "CORRALEJO [E]", "CUERAMARO", "CUERAMARO [E]", "DOLORES HIDALGO", "EL ALACRAN", "EL EDEN", "EL FUERTE", "EL MEZQUITILLO", "EL MEZQUITILLO [E]", "EL PALENQUE", "EL PALENQUE [E]", "EL PAXTLE", "EL TULE", "EL TULE [E]", "ESTACION ABASOLO", "ESTACION ABASOLO [E]", "ESTACION CORRALEJO", "ESTACION CORRALEJO [E]", "ESTACION JOAQUIN", "ESTACION JOAQUIN [E]", "EX ESTACION CHIRIMOYA", "EX ESTacion CHIRIMOYA [E]", "GAVIA DE RIONDA", "GODOY", "GODOY [E]", "IBARRA", "IBARRA [E]", "LA ALDEA", "LA CARROZA", "LA CARROZA [E]", "LA ESCONDIDA", "LA SANDIA", "LA SANDIA [E]", "LAGUNA DE GUADALUPE", "LAS CRUCES", "LAS CRUCES [E]", "LAS MASAS", "LAS MASAS [E]", "LAS PALOMAS", "LAS TIRITAS", "LOMA DE LA ESPERANZA", "LOMA DE LA ESPERANZA [E]", "LOS DOLORES", "LOS GALVANES", "LOS GALVANES [E]", "MAGUEY BLANCO", "MEDRANOS", "MEXICANOS", "MEXICANOS [E]", "MINERAL DE LA LUZ", "MISION DE ABAJO", "MISION DE ABAJO [E]", "MISION DE ARRIBA", "MISION DE ARRIBA [E]", "NORIA DE ALDAY", "OCAMPO", "PURISIMA DEL RINCON", "PURISima DEL RINCON [E]", "RANCHO NUEVO DE LA CRUZ", "RANCHO NUEVO DE LA CRUZ [E]", "RANCHO VIEJO", "RIO LAJA", "RIO LAJA [E]", "SAN ANDRES DE JALPA", "SAN ANDRES DE JALPA [E]", "SAN BERNARDO", "SAN BERNARDO [E]", "SAN CRISTOBAL", "SAN CRISTOBAL [E]", "SAN GREGORIO", "SAN GREGORIO [E]", "SAN ISIDRO DE CRESPO", "SAN ISIDRO DE CRESPO [E]", "SAN JOSE DE BADILLO", "SAN JOSE DE BADILLO [E]", "SAN JOSE DEL RODEO", "SAN JOSE DEL RODEO [E]", "SAN JUAN DE LA PUERTA", "SAN JUAN DE LA PUERTA [E]", "SANTA ANA DEL CONDE", "SANTA ROSA", "SANTA ROSA [E]", "SANTA ROSA PLAN DE AYALA", "SANTA ROSA PLAN DE AYALA [E]", "SANTO DOMINGO", "SERRANO", "TENERIA DEL SANTUARIO", "TENERIA DEL SANTUARIO [E]", "TIERRAS BLANCAS", "TIERRAS BLANCAS [E]", "TREJO", "TREJO [E]", "TUPATARO", "TUPATARO [E]", "VALTIERRILLA", "VALTIERRILLA 2", "VALTIERRILLA [E]", "VAQUERIAS", "VILLA DE ARRIAGA", "VILLA DE ARRIAGA [E]"].sort();
    const todasLasPoblaciones = [...new Set([...poblacionesGdl, ...poblacionesLeon])].sort();
    const rutas = ['AUDITORIA', 'SUPERVISION', 'ADMINISTRACION', 'DIRECCION', 'COMERCIAL', 'COBRANZA', 'R1', 'R2', 'R3', 'JC1', 'RX'].sort();
    const tiposCredito = ['NUEVO', 'RENOVACION', 'REINGRESO'];
    const montos = [3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000];
    const plazosCredito = [10, 13, 14].sort((a, b) => a - b); // Incluir 10 para comisionistas
    const estadosCredito = ['al corriente', 'atrasado', 'cobranza', 'juridico', 'liquidado'];
    const tiposPago = ['normal', 'extraordinario', 'actualizado', 'grupal']; // Añadir grupal
    const sucursales = ['GDL', 'LEON'];
    const roles = [
        { value: 'admin', text: 'Administrador' },
        { value: 'supervisor', text: 'Supervisor' },
        { value: 'cobrador', text: 'Cobrador' },
        { value: 'consulta', text: 'Consulta' },
        { value: 'comisionista', text: 'Comisionista' } // Asegurar que esté aquí
    ];
    const tiposReporteGrafico = [
        { value: 'colocacion', text: 'Colocación (Monto)' },
        { value: 'recuperacion', text: 'Recuperación (Pagos)' },
        { value: 'comportamiento', text: 'Comportamiento de Pago (Tipos)' },
    ];


    // --- Poblar Dropdowns ---

    // Formulario Cliente
    popularDropdown('poblacion_grupo_cliente', poblacionesGdl, 'Selecciona población/grupo'); // Por defecto GDL
    popularDropdown('ruta_cliente', rutas, 'Selecciona una ruta');

    // Formulario Colocación
    popularDropdown('tipo_colocacion', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Selecciona tipo', true);
    popularDropdown('monto_colocacion', montos.map(m => ({ value: m, text: `$${m.toLocaleString()}` })), 'Selecciona monto', true);
    // Plazos se llenan dinámicamente en handleSearchClientForCredit

    // Filtros Gestión Clientes
    popularDropdown('grupo_filtro', todasLasPoblaciones, 'Todos');
    popularDropdown('tipo_colocacion_filtro', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
    popularDropdown('plazo_filtro', plazosCredito.map(p => ({ value: p, text: `${p} semanas` })), 'Todos', true);
    popularDropdown('estado_credito_filtro', estadosCredito.map(e => ({ value: e, text: e.charAt(0).toUpperCase() + e.slice(1) })), 'Todos', true);


    // Filtros y Formulario Usuarios
    popularDropdown('filtro-rol-usuario', roles, 'Todos los roles', true);
    popularDropdown('nuevo-rol', roles, 'Seleccione un rol', true);


    // Formulario Pago Grupal
    popularDropdown('grupo_pago_grupal', todasLasPoblaciones, 'Selecciona un Grupo');


    // Filtros Reportes Avanzados
    // popularDropdown('sucursal_filtro_reporte', sucursales, 'Todas'); // Asumiendo que ya tienes <option value="GDL">...
    popularDropdown('grupo_filtro_reporte', todasLasPoblaciones, 'Todos');
    popularDropdown('ruta_filtro_reporte', rutas, 'Todas');
    popularDropdown('tipo_credito_filtro_reporte', tiposCredito.map(t => ({ value: t.toLowerCase(), text: t })), 'Todos', true);
    popularDropdown('estado_credito_filtro_reporte', estadosCredito.map(e => ({ value: e, text: e.toUpperCase() })), 'Todos', true); // Estatus capitalizado
    popularDropdown('tipo_pago_filtro_reporte', tiposPago.map(t => ({ value: t, text: t.toUpperCase() })), 'Todos', true);


    // Filtros Reportes Gráficos
    popularDropdown('grafico_tipo_reporte', tiposReporteGrafico, 'Selecciona un reporte', true);
    popularDropdown('grafico_grupo', todasLasPoblaciones, 'Todos'); // Inicializar con todas
}


// Función auxiliar para actualizar plazos disponibles en colocación
function actualizarPlazosSegunCliente(esComisionista) {
    const plazosDisponibles = esComisionista ? [10] : [13, 14]; // Lógica de negocio
    popularDropdown('plazo_colocacion', plazosDisponibles.map(p => ({ value: p, text: `${p} semanas` })), 'Selecciona plazo', true);
}


// Listener para el evento 'viewshown' para cargar datos específicos de cada vista
document.addEventListener('viewshown', function (e) {
    const viewId = e.detail.viewId;
    console.log(`Evento viewshown disparado para: ${viewId}`);

    // Limpiar mensajes de estado al cambiar de vista (opcional, cuidado con no borrar mensajes importantes)
    document.querySelectorAll('.status-message').forEach(el => {
        // No limpiar el de conexión ni los de dentro de un modal activo
        if (el.id !== 'connection-status' && !el.closest('#generic-modal:not(.hidden)')) {
            el.innerHTML = '';
            el.className = 'status-message hidden';
        }
    });


    switch (viewId) {
        case 'view-reportes':
            loadBasicReports(); // Cargar reportes básicos al entrar
            break;
        case 'view-reportes-avanzados':
            inicializarVistaReportesAvanzados(); // Poner fechas por defecto
            break;
        case 'view-usuarios':
            loadUsersTable(); // Cargar tabla de usuarios
            // Limpiar herramienta de diagnóstico
            document.getElementById('diagnostico-id-credito').value = '';
            document.getElementById('status-diagnostico').classList.add('hidden');
            document.getElementById('resultado-diagnostico').classList.add('hidden');
            break;
        case 'view-gestion-clientes':
            inicializarVistaGestionClientes(); // Limpiar tabla, no cargar datos aún
            break;
        case 'view-cliente':
            // Si NO estamos editando, asegurar que el formulario esté limpio
            if (!editingClientId) {
                resetClientForm();
            }
            // Si estamos editando, los datos ya se cargaron en la función editCliente
            break;
        case 'view-colocacion':
            // Limpiar campos de búsqueda y formulario al entrar
            document.getElementById('curp_colocacion').value = '';
            document.getElementById('form-colocacion').classList.add('hidden');
            showStatus('status_colocacion', 'Ingresa la CURP del cliente para buscar.', 'info');
            break;
        case 'view-cobranza':
            // Limpiar campos de búsqueda y formulario al entrar
            document.getElementById('idCredito_cobranza').value = '';
            document.getElementById('form-cobranza').classList.add('hidden');
            showStatus('status_cobranza', 'Ingresa el ID del crédito (histórico) para buscar.', 'info');
            creditoActual = null; // Deseleccionar crédito
            break;
        case 'view-pago-grupo':
            // Limpiar formulario de pago grupal al entrar
            document.getElementById('grupo_pago_grupal').value = '';
            document.getElementById('grupo-pago-details').classList.add('hidden');
            document.getElementById('monto-recibido-grupo').value = '';
            showStatus('status_pago_grupo', 'Selecciona un grupo para calcular la cobranza.', 'info');
            grupoDePagoActual = null;
            break;
        case 'view-reportes-graficos':
            // Inicializar fechas por defecto (ej. último año)
            const hoyGraf = new Date();
            const haceUnAnio = new Date(hoyGraf.getFullYear() - 1, hoyGraf.getMonth(), hoyGraf.getDate() + 1); // +1 para incluir hoy
            const hoyISO = hoyGraf.toISOString().split('T')[0];
            const haceUnAnioISO = haceUnAnio.toISOString().split('T')[0];

            document.getElementById('grafico_fecha_inicio').value = haceUnAnioISO;
            document.getElementById('grafico_fecha_fin').value = hoyISO;
            // Actualizar grupos según la sucursal seleccionada (por defecto 'Ambas')
            handleSucursalGraficoChange.call(document.getElementById('grafico_sucursal') || { value: '' });
            // Limpiar gráfico anterior y mensaje
            if (currentChart) {
                currentChart.destroy();
                currentChart = null;
            }
            document.getElementById('grafico-container').innerHTML = '';
            showStatus('status_graficos', 'Selecciona los filtros y genera un gráfico.', 'info');
            break;
        // Añadir casos para otras vistas si necesitan inicialización
        case 'view-importar':
            // Resetear a GDL y pestaña clientes por defecto
            document.getElementById('office-select').value = 'GDL';
            handleOfficeChange.call(document.getElementById('office-select'));
            break;
        case 'view-main-menu':
            // Podría limpiarse algún estado global aquí si fuera necesario
            break;
    }
});


// *** MANEJO DE DUPLICADOS ***
async function handleVerificarDuplicados() {
    showProcessingOverlay(true, 'Buscando clientes duplicados (por CURP + Oficina)...');
    // =============================================
    // *** INICIO DE LA CORRECCIÓN 3 (Instancia 9) ***
    // =============================================
    showButtonLoading('#btn-verificar-duplicados', true);
    // =============================================
    // *** FIN DE LA CORRECCIÓN 3 (Instancia 9) ***
    // =============================================
    const statusUsuarios = document.getElementById('status_usuarios');
    statusUsuarios.textContent = 'Buscando duplicados...';
    statusUsuarios.className = 'status-message status-info';

    try {
        const resultado = await database.encontrarClientesDuplicados();
        if (!resultado.success) {
            throw new Error(resultado.message);
        }

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
                statusUsuarios.className = 'status-message status-info';


                const resEliminacion = await database.ejecutarEliminacionDuplicados(idsParaEliminar);


                if (resEliminacion.success) {
                    showStatus('status_usuarios', resEliminacion.message, 'success');
                    await loadUsersTable(); // Recargar tabla de usuarios por si acaso, aunque afecta clientes
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
        // =============================================
        // *** INICIO DE LA CORRECCIÓN 3 (Instancia 10) ***
        // =============================================
        showButtonLoading('#btn-verificar-duplicados', false);
        // =============================================
        // *** FIN DE LA CORRECCIÓN 3 (Instancia 10) ***
        // =============================================
    }
}

// ====================================================================
// ** FUNCIÓN PARA MOSTRAR HISTORIAL DE PAGOS (MODIFICADA) **
// ====================================================================
/**
 * Muestra un modal con el historial de pagos de un crédito específico.
 * Usa el ID Histórico y la CURP para identificar el crédito correcto.
 * @param {string} historicalIdCredito El ID histórico del crédito a consultar.
 * @param {string} curpCliente La CURP del cliente asociado a este crédito específico.
 */
async function mostrarHistorialPagos(historicalIdCredito, curpCliente) {
    const modal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalTitle || !modalBody) {
        console.error("Elementos del modal no encontrados.");
        alert("Error al intentar mostrar el historial. Faltan elementos en la página.");
        return;
    }

    // Mostrar modal con estado de carga
    modalTitle.textContent = `Historial de Pagos (Crédito: ${historicalIdCredito})`;
    modalBody.innerHTML = '<div class="spinner" style="margin: 20px auto; border-top-color: var(--primary);"></div><p style="text-align: center;">Cargando historial...</p>';
    modal.classList.remove('hidden');

    try {
        // 1. Buscar el crédito específico usando historicalId y CURP para desambiguar
        const creditos = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { curpCliente: curpCliente });
        if (creditos.length === 0) {
            throw new Error(`No se encontró el crédito con ID histórico ${historicalIdCredito} para el cliente ${curpCliente}.`);
        }
        // Si hubiera más de uno (no debería con CURP), tomar el más reciente
        creditos.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
        const credito = creditos[0]; // El crédito específico { id: firestoreId, ..., historicalIdCredito: ... }

        // 2. Buscar datos del cliente (para nombre)
        const cliente = await database.buscarClientePorCURP(credito.curpCliente);

        // 3. Buscar los pagos asociados al historicalIdCredito
        const pagos = await database.getPagosPorCredito(historicalIdCredito); // Usa historicalId

        // --- Renderizar Contenido del Modal ---

        // Información Resumen del Crédito
        let resumenHTML = `
            <div class="info-grid" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <div class="info-item"><span class="info-label">Cliente:</span><span class="info-value">${cliente ? cliente.nombre : 'N/A'} (${credito.curpCliente})</span></div>
                 <div class="info-item"><span class="info-label">ID Crédito (Hist.):</span><span class="info-value">${credito.historicalIdCredito || 'N/A'}</span></div>
                 <div class="info-item"><span class="info-label">Oficina:</span><span class="info-value">${credito.office || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Monto Total:</span><span class="info-value">$${(credito.montoTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                 <div class="info-item"><span class="info-label">Saldo Actual:</span><span class="info-value" style="color: var(--danger); font-weight: bold;">$${(credito.saldo || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                 <div class="info-item"><span class="info-label">Fecha Inicio:</span><span class="info-value">${formatDateForDisplay(parsearFecha(credito.fechaCreacion))}</span></div>
            </div>
         `;


        // Tabla de Pagos
        let tablaHTML = '';
        if (pagos.length === 0) {
            tablaHTML = '<p class="status-message status-info">Este crédito no tiene pagos registrados.</p>';
        } else {
            // Ordenar pagos por fecha, del más antiguo al más reciente para ver secuencia
            pagos.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0));


            let totalPagado = 0;
            const tableRows = pagos.map(pago => {
                totalPagado += pago.monto || 0;
                const saldoDespuesFormateado = (pago.saldoDespues !== undefined && pago.saldoDespues !== null)
                    ? `$${pago.saldoDespues.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : 'N/A'; // Mostrar N/A si no está definido
                return `
                    <tr>
                        <td>${formatDateForDisplay(parsearFecha(pago.fecha))}</td>
                        <td>$${(pago.monto || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>${pago.tipoPago || 'normal'}</td>
                        <td>${saldoDespuesFormateado}</td>
                        <td>${pago.registradoPor || 'N/A'}</td>
                    </tr>
                `;
            }).join('');


            // Añadir fila de total al final (opcional)
            // const totalRow = `<tfoot><tr><td colspan="1"><strong>Total Pagado:</strong></td><td><strong>$${totalPagado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td><td colspan="3"></td></tr></tfoot>`;


            tablaHTML = `
                 <p style="text-align: right; font-size: 14px; color: var(--gray);">Total Pagado (suma de este historial): <strong style="color: var(--success);">$${totalPagado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
                <table class="payment-history-table">
                    <thead>
                        <tr>
                            <th>Fecha Pago</th>
                            <th>Monto</th>
                            <th>Tipo</th>
                            <th>Saldo Después</th>
                            <th>Registrado Por</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                 </table>
            `;
        }


        // Actualizar cuerpo del modal
        modalBody.innerHTML = resumenHTML + tablaHTML;


    } catch (error) {
        console.error("Error al mostrar historial de pagos:", error);
        modalBody.innerHTML = `<p class="status-message status-error">Error al cargar el historial: ${error.message}</p>`;
    }
}


// ====================================================================
// ** FUNCIÓN PARA LA HERRAMIENTA DE DIAGNÓSTICO (ACTUALIZADA) **
// ====================================================================
async function handleDiagnosticarPagos() {
    const historicalIdCredito = document.getElementById('diagnostico-id-credito').value.trim(); // Es el ID histórico
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
    statusEl.textContent = 'Buscando pagos en la base de datos...';
    statusEl.className = 'status-message status-info';
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden'); // Ocultar resultados previos

    try {
        // Usar la función getPagosPorCredito que ahora busca por historicalIdCredito
        const pagos = await database.getPagosPorCredito(historicalIdCredito);

        if (pagos.length === 0) {
            statusEl.textContent = `Diagnóstico completo: Se encontraron 0 pagos para el ID Histórico ${historicalIdCredito}. Verifica si el ID es correcto o si los pagos se importaron asociados a otro ID.`;
            statusEl.className = 'status-message status-warning';
            outputEl.textContent = '[]'; // Mostrar array vacío
            resultEl.classList.remove('hidden'); // Mostrar área de resultados vacía
        } else {
            statusEl.textContent = `Diagnóstico completo: ¡Éxito! Se encontraron ${pagos.length} pagos para el ID Histórico ${historicalIdCredito}.`;
            statusEl.className = 'status-message status-success';

            // Ordenar por fecha para mejor visualización en el diagnóstico
            pagos.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0));

            // Formatear el JSON para que sea legible, incluyendo fechas formateadas
            outputEl.textContent = JSON.stringify(pagos.map(p => ({
                ...p,
                fecha_formateada: formatDateForDisplay(parsearFecha(p.fecha)), // Añadir fecha legible
                monto: p.monto?.toFixed(2), // Asegurar formato decimal
                saldoDespues: p.saldoDespues?.toFixed(2) // Asegurar formato decimal
            })), null, 2); // Indentación de 2 espacios

            resultEl.classList.remove('hidden'); // Mostrar área de resultados con el JSON
        }

    } catch (error) {
        console.error("Error en diagnóstico:", error);
        statusEl.textContent = `Error al consultar la base de datos: ${error.message}`;
        statusEl.className = 'status-message status-error';
        resultEl.classList.add('hidden'); // Ocultar resultados si hay error
    } finally {
        showButtonLoading(button, false); // Restaurar botón
    }
}


console.log('app.js cargado correctamente y listo.');
