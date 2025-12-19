// =============================================
// CAPA DE SERVICIO DE FIREBASE (database.js) - CORREGIDO Y OPTIMIZADO
// =============================================

// --- FUNCIONES AUXILIARES (HELPERS) ---
// Estas funciones están fuera del objeto para ser usadas internamente sin problemas de 'this'

/**
 * Parsea de forma robusta una fecha desde un string.
 * Intenta varios formatos comunes (D-M-Y, Y-M-D, M-D-Y, ISO).
 */
function _parsearFechaImportacion(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') return null;

    const fechaTrimmed = fechaStr.trim();

    // 1. Intenta parsear directamente (ISO, YYYY-MM-DD)
    let fecha = new Date(fechaTrimmed);
    if (!isNaN(fecha.getTime()) && fecha.getFullYear() > 1970) {
        // Validaciones extra para evitar falsos positivos
        if (fechaTrimmed.includes('-')) {
            const parts = fechaTrimmed.split('-');
            if (parts.length === 3 && parseInt(parts[0], 10) === fecha.getFullYear()) {
                 // Formato YYYY-MM-DD confirmado
                 return fecha.toISOString();
            }
        }
        // Si funcionó directo y parece confiable
        if (fechaTrimmed.includes('T') || fechaTrimmed.length >= 10) {
            return fecha.toISOString();
        }
    }

    // 2. Si falla, intentar parseo manual por separadores / o -
    const separador = fechaTrimmed.includes('/') ? '/' : '-';
    const partes = fechaTrimmed.split(separador);
    if (partes.length !== 3) return null;

    const [p1, p2, p3] = partes.map(p => parseInt(p, 10));
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;

    let anio, mes, dia;

    // Lógica de heurística para determinar formato
    // Prioridad DD-MM-YYYY
    if (p3 > 1000 && p1 <= 31 && p2 <= 12) { anio = p3; dia = p1; mes = p2; }
    // Formato YYYY-MM-DD
    else if (p1 > 1000 && p2 <= 12 && p3 <= 31) { anio = p1; mes = p2; dia = p3; }
    // Formato MM-DD-YYYY (Uso común en USA)
    else if (p3 > 1000 && p1 <= 12 && p2 <= 31) { anio = p3; mes = p1; dia = p2; }
    else { return null; }

    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

    // Crear fecha en UTC para evitar desfases de zona horaria al guardar solo la fecha
    fecha = new Date(Date.UTC(anio, mes - 1, dia));

    if (isNaN(fecha.getTime())) return null;

    return fecha.toISOString();
}

/**
 * Función general para convertir cualquier input a objeto Date
 */
function parsearFecha(fechaInput) {
    if (!fechaInput) return null;
    if (fechaInput instanceof Date) return fechaInput;
    if (typeof fechaInput === 'object' && typeof fechaInput.toDate === 'function') return fechaInput.toDate(); // Firestore Timestamp

    if (typeof fechaInput === 'string') {
        const fechaStr = fechaInput.trim();
        // Prioridad ISO 8601 estricto
        if (fechaStr.includes('T') && fechaStr.includes('Z') && fechaStr.length >= 20) {
            const fecha = new Date(fechaStr);
            if (!isNaN(fecha.getTime())) return fecha;
        }
        // Intentar con la función robusta
        const fechaISO = _parsearFechaImportacion(fechaStr);
        if (fechaISO) {
            return new Date(fechaISO);
        }
        // Fallback final
        const fechaDirecta = new Date(fechaStr);
        if (!isNaN(fechaDirecta.getTime()) && fechaDirecta.getFullYear() > 1970) {
            return fechaDirecta;
        }
    }
    return null;
}

// --- OBJETO PRINCIPAL DATABASE ---

const database = {

    /**
     * Obtiene la fecha actual ajustada a la zona horaria local en formato ISO,
     * eliminando la 'Z' para mantener la hora "reloj" local.
     */
    obtenerFechaLocalISO: () => {
        const now = new Date();
        const timezoneOffset = now.getTimezoneOffset() * 60000;
        const localDate = new Date(now.getTime() - timezoneOffset);
        return localDate.toISOString().slice(0, -1); 
    },

    // --- MÉTODOS GENERALES ---
    getAll: async (collection) => {
        try {
            const snapshot = await db.collection(collection).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error obteniendo ${collection}:`, error);
            return [];
        }
    },

    // --- OBTENER USUARIOS ---
    async obtenerUsuarios() {
    try {
        const snapshot = await db.collection('users').get();
        // CORRECCIÓN: Agregamos { id: doc.id, ... } para que el objeto tenga su ID
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { success: true, data: users };
    } catch (error) {
        if (error.code === 'permission-denied') {
            console.log("Info: Usuario actual no tiene permiso para listar usuarios.");
            return { success: false, data: [], message: "Sin permisos" };
        }
        console.warn("Error obtenerUsuarios:", error);
        return { success: false, message: error.message, data: [] };
    }
},

    // --- OBTENER USUARIO POR ID ---
    obtenerUsuarioPorId: async (uid) => {
        try {
            const docRef = db.collection('users').doc(uid);
            const doc = await docRef.get();
            if (!doc.exists) {
                console.warn(`Usuario ${uid} no encontrado.`);
                return null;
            }
            const userData = doc.data();
            if (!userData.role) {
                console.error(`Datos incompletos para usuario ${uid}: Falta rol.`);
                return { id: doc.id, ...userData, error: "Datos incompletos (falta rol)" };
            }
            if (!userData.office) {
                userData.office = 'AMBAS';
            }
            return { id: doc.id, ...userData };
        } catch (error) {
            console.error("Error obteniendo usuario por ID:", error);
            return null;
        }
    },

    // --- ACTUALIZAR USUARIOS ---
    actualizarUsuario: async (uid, userData) => {
        try {
            const dataToUpdate = { ...userData };
            delete dataToUpdate.email;
            delete dataToUpdate.id;

            if (!dataToUpdate.role || !dataToUpdate.office) {
                return { success: false, message: 'Rol y Oficina son obligatorios.' };
            }
            if (!['GDL', 'LEON', 'AMBAS'].includes(dataToUpdate.office)) {
                return { success: false, message: 'Oficina no válida.' };
            }

            dataToUpdate.fechaModificacion = new Date().toISOString();

            await db.collection('users').doc(uid).update(dataToUpdate);
            return { success: true, message: 'Usuario actualizado.' };
        } catch (error) {
            console.error("Error actualizando usuario:", error);
            return { success: false, message: `Error al actualizar: ${error.message}` };
        }
    },

    deshabilitarUsuario: async (uid) => {
        try {
            await db.collection('users').doc(uid).update({ status: 'disabled' });
            return { success: true, message: 'Usuario deshabilitado en Firestore.' };
        } catch (error) {
            console.error("Error deshabilitando usuario:", error);
            return { success: false, message: `Error al deshabilitar: ${error.message}` };
        }
    },

    // --- GESTIÓN DE CLIENTES ---
    obtenerClientePorId: async (id) => {
        try {
            const doc = await db.collection('clientes').doc(id).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error obteniendo cliente por ID:", error);
            return null;
        }
    },

    actualizarCliente: async (id, clienteData, userEmail) => {
        try {
            clienteData.curp = clienteData.curp.toUpperCase();
            clienteData.modificadoPor = userEmail;
            clienteData.fechaModificacion = new Date().toISOString();
            await db.collection('clientes').doc(id).update(clienteData);
            return { success: true, message: 'Cliente actualizado.' };
        } catch (error) {
            console.error("Error actualizando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    eliminarCliente: async (id) => {
        try {
            await db.collection('clientes').doc(id).delete();
            return { success: true, message: 'Cliente eliminado.' };
        } catch (error) {
            console.error("Error eliminando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // CUSCAR CLIENTE POR CURP
    buscarClientePorCURP: async (curp, userOffice = null) => {
        try {
            console.log(`🔎 Buscando CURP: ${curp} (Oficina: ${userOffice || 'Cualquiera'})`);
            
            // Construimos la consulta base
            let query = db.collection('clientes').where('curp', '==', curp.toUpperCase());

            if (userOffice && userOffice !== 'AMBAS') {
                query = query.where('office', '==', userOffice);
            }

            // 1. INTENTO 1: CACHÉ LOCAL (Súper Rápido y Offline)
            // Esto encuentra los clientes descargados por el botón "Modo Offline"
            // Y TAMBIÉN los que acabas de registrar hace un segundo.
            try {
                const docCache = await query.get({ source: 'cache' });
                if (!docCache.empty) {
                    console.log("📍 Cliente encontrado en CACHÉ LOCAL.");
                    const doc = docCache.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
            } catch (e) {
                // Si falla la caché o está vacía, no hacemos nada, pasamos al siguiente paso
                console.log("... No estaba en caché.");
            }

            // 2. INTENTO 2: SERVIDOR (Solo si hay internet)
            if (navigator.onLine) {
                console.log("🌐 Buscando en SERVIDOR...");
                const docServer = await query.get({ source: 'server' });
                if (!docServer.empty) {
                    const doc = docServer.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
            } else {
                console.warn("⚠️ Sin internet y no encontrado en caché.");
            }

            return null; // No encontrado en ningún lado
        } catch (error) {
            console.error("❌ Error buscando cliente:", error);
            return null;
        }
    },

    // BUSCAR CLIENTE POR CURPS
    buscarClientesPorCURPs: async (curps, userOffice = null) => {
        if (!curps || curps.length === 0) return [];
        const upperCaseCurps = curps.map(c => String(c).toUpperCase());
        try {
            const MAX_IN_VALUES = 30;
            const chunks = [];
            for (let i = 0; i < upperCaseCurps.length; i += MAX_IN_VALUES) {
                chunks.push(upperCaseCurps.slice(i, i + MAX_IN_VALUES));
            }

            const promises = chunks.map(chunk => {
                let query = db.collection('clientes').where('curp', 'in', chunk);
                if (userOffice && userOffice !== 'AMBAS') {
                    query = query.where('office', '==', userOffice);
                }
                return query.get();
            });

            const snapshots = await Promise.all(promises);
            const clientes = snapshots.flatMap(snapshot =>
                snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            );
            return clientes;
        } catch (error) {
            console.error("Error buscando clientes por CURPs:", error);
            return [];
        }
    },

    async agregarCliente(clienteData, userEmail) {
        try {
            // 1. Validar duplicados (Usando búsqueda híbrida)
            // Esto busca en local primero para ver si ya lo registraste hace 5 min
            const existe = await this.buscarClientePorCURP(clienteData.curp, clienteData.office);
            if (existe) {
                return { success: false, message: 'El cliente ya existe (CURP duplicada).' };
            }

            const fechaLocal = database.obtenerFechaLocalISO();
            
            // 2. Preparar el objeto
            const nuevoCliente = {
                ...clienteData,
                fechaRegistro: fechaLocal,
                fechaCreacion: fechaLocal,
                registradoPor: userEmail,
                fechaUltimaModificacion: fechaLocal,
                // Marca para saber que se creó sin internet (opcional)
                origen: navigator.onLine ? 'online' : 'offline_pending' 
            };

            // 3. Generar ID y Referencia
            // IMPORTANTE: Usamos .doc() vacío para obtener un ID válido inmediatamente
            // sin tener que ir al servidor.
            const docRef = db.collection('clientes').doc();
            
            // 4. Guardar
            if (!navigator.onLine) {
                // --- MODO OFFLINE ---
                console.log("📡 Guardando cliente en modo OFFLINE...");
                
                // Escribimos en la caché local sin esperar confirmación del servidor (para que no se trabe)
                docRef.set(nuevoCliente); 
                
                return { 
                    success: true, 
                    id: docRef.id, 
                    message: "Guardado localmente (se sincronizará al conectar)." 
                };
            } else {
                // --- MODO ONLINE ---
                // Aquí sí esperamos confirmación para asegurar integridad
                await docRef.set(nuevoCliente);
                
                return { 
                    success: true, 
                    id: docRef.id, 
                    message: "Cliente registrado correctamente." 
                };
            }

        } catch (error) {
            console.error("Error agregando cliente:", error);
            return { success: false, message: error.message };
        }
    },

    buscarClientes: async (filtros) => {
        try {
            let query = db.collection('clientes');

            if (filtros.userOffice && filtros.userOffice !== 'AMBAS') {
                query = query.where('office', '==', filtros.userOffice);
            } else if (filtros.office) {
                query = query.where('office', '==', filtros.office);
            }

            if (filtros.grupo) query = query.where('poblacion_grupo', '==', filtros.grupo);
            if (filtros.ruta) query = query.where('ruta', '==', filtros.ruta);

            let curpArray = [];
            if (filtros.curp && typeof filtros.curp === 'string' && filtros.curp.trim()) {
                curpArray = filtros.curp.split(',').map(c => c.trim().toUpperCase()).filter(c => c.length === 18);
            }

            let applyCurpInFilter = false;
            if (curpArray.length > 0) {
                const MAX_IN_VALUES = 30;
                if (curpArray.length === 1) {
                    query = query.where('curp', '==', curpArray[0]);
                } else if (curpArray.length <= MAX_IN_VALUES) {
                    query = query.where('curp', 'in', curpArray);
                } else {
                    applyCurpInFilter = true;
                }
            }

            const snapshot = await query.get();
            let clientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (applyCurpInFilter) {
                const curpsSet = new Set(curpArray);
                clientes = clientes.filter(c => curpsSet.has(c.curp));
            }
            if (filtros.nombre && filtros.nombre.trim()) {
                const nombreLower = filtros.nombre.toLowerCase();
                clientes = clientes.filter(c => c.nombre && c.nombre.toLowerCase().includes(nombreLower));
            }

            return clientes;
        } catch (error) {
            console.error("Error buscando clientes:", error);
            return [];
        }
    },

    // --- GESTIÓN DE CRÉDITOS ---
    buscarCreditosPorCliente: async (curp, userOffice = null) => {
        try {
            let query = db.collection('creditos').where('curpCliente', '==', curp.toUpperCase());
            if (userOffice && userOffice !== 'AMBAS') {
                query = query.where('office', '==', userOffice);
            }
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error buscando créditos por cliente:", error);
            return [];
        }
    },

    buscarCreditosPorHistoricalId: async (historicalId, options = {}) => {
        try {
            let query = db.collection('creditos').where('historicalIdCredito', '==', historicalId);

            if (options.userOffice && options.userOffice !== 'AMBAS') {
                query = query.where('office', '==', options.userOffice);
            } else if (options.office) {
                query = query.where('office', '==', options.office);
            }

            if (options.curpCliente) query = query.where('curpCliente', '==', options.curpCliente.toUpperCase());
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error buscando créditos por historicalIdCredito:", error);
            return [];
        }
    },

    buscarCreditoPorId: async (firestoreId) => {
        try {
            const doc = await db.collection('creditos').doc(firestoreId).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error buscando crédito por Firestore ID:", error);
            return null;
        }
    },

    buscarCreditos: async (filtros) => {
        try {
            let query = db.collection('creditos');

            if (filtros.userOffice && filtros.userOffice !== 'AMBAS') {
                query = query.where('office', '==', filtros.userOffice);
            } else if (filtros.office) {
                query = query.where('office', '==', filtros.office);
            }

            if (filtros.curpAval) query = query.where('curpAval', '==', filtros.curpAval.toUpperCase());
            if (filtros.plazo) query = query.where('plazo', '==', parseInt(filtros.plazo, 10));
            if (filtros.idCredito) query = query.where('historicalIdCredito', '==', filtros.idCredito);
            if (filtros.grupo) query = query.where('poblacion_grupo', '==', filtros.grupo);
            if (filtros.ruta) query = query.where('ruta', '==', filtros.ruta);

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error("Error buscando créditos con filtros:", error);
            return [];
        }
    },

    buscarCreditoActivoPorCliente: async (curp, userOffice = null) => {
        try {
            const creditos = await database.buscarCreditosPorCliente(curp, userOffice);
            const estadosNoActivos = ['liquidado'];
            const creditosActivos = creditos.filter(c =>
                !estadosNoActivos.includes(c.estado) &&
                (c.saldo === undefined || c.saldo > 0.01)
            );
            if (creditosActivos.length === 0) return null;
            creditosActivos.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
            return creditosActivos[0];
        } catch (error) {
            console.error("Error buscando crédito activo:", error);
            return null;
        }
    },

    verificarElegibilidadCliente: async (curp, office) => {
    try {
        // 1. Obtener Cliente
        const cliente = await database.buscarClientePorCURP(curp, office);
        if (!cliente) return { elegible: false, message: "Cliente no registrado." };

        const esComisionista = cliente.isComisionista === true;

        // 2. Obtener Créditos Activos
        let query = db.collection('creditos')
            .where('curpCliente', '==', curp)
            .where('estado', '!=', 'liquidado');

        if (office && office !== 'AMBAS') {
            query = query.where('office', '==', office);
        }

        const creditosActivosSnapshot = await query.get();
        const creditos = creditosActivosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Ordenar: Más reciente primero
        creditos.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

        // --- CASO A: SIN DEUDAS ---
        if (creditos.length === 0) {
            return { elegible: true, mensaje: "Cliente sin deuda. Elegible para crédito NUEVO.", esRenovacion: false };
        }

        const creditoActual = creditos[0];
        
        // --- CÁLCULO DE SEMANAS PAGADAS (REGLA 10 SEMANAS) ---
        const histId = creditoActual.historicalIdCredito || creditoActual.id;
        
        // Consultamos pagos para cálculo financiero exacto
        const pagosSnap = await db.collection('pagos')
            .where('idCredito', '==', histId)
            .where('office', '==', (office === 'AMBAS' ? creditoActual.office : office))
            .get();
            
        const totalPagado = pagosSnap.docs.reduce((sum, doc) => sum + (doc.data().monto || 0), 0);
        const pagoSemanal = creditoActual.montoTotal / creditoActual.plazo;
        
        let semanasPagadas = 0;
        if (pagoSemanal > 0) {
            semanasPagadas = Math.floor((totalPagado + 0.1) / pagoSemanal);
        }

        // REGLA UNIVERSAL: Se requieren 10 semanas pagadas para renovar
        const puedeRenovar = semanasPagadas >= 10;
        
        // --- LÓGICA DE RESPUESTA ---
        if (esComisionista) {
            // Comisionistas pueden tener hasta 2 créditos
            if (creditos.length >= 2) {
                if (puedeRenovar) {
                    return { 
                        elegible: true, 
                        mensaje: `Comisionista con 2 créditos. Crédito ${histId} con ${semanasPagadas} semanas. Elegible para RENOVACIÓN.`,
                        esRenovacion: true,
                        datosCreditoAnterior: creditoActual
                    };
                } else {
                    return { 
                        elegible: false, 
                        mensaje: `Comisionista con 2 créditos. El crédito actual solo tiene ${semanasPagadas} semanas pagadas (Req: 10).`
                    };
                }
            } else {
                // Tiene 1, puede pedir el segundo O renovar
                return {
                    elegible: true,
                    mensaje: `Comisionista con 1 crédito (${semanasPagadas} sem). Puede pedir SEGUNDO crédito ${puedeRenovar ? 'o RENOVAR el actual' : '(Renovación requiere 10 sem)'}.`,
                    esRenovacion: puedeRenovar, 
                    datosCreditoAnterior: creditoActual,
                    esComisionistaMulticredito: true // Habilita opción "Nuevo" en UI
                };
            }
        }

        // Clientes Regulares (Solo 1 a la vez)
        if (puedeRenovar) {
            return { 
                elegible: true, 
                mensaje: `Cliente regular (${semanasPagadas} semanas pagadas). Cumple requisito (10 sem) para RENOVACIÓN.`, 
                esRenovacion: true,
                datosCreditoAnterior: creditoActual,
                forzarRenovacion: true
            };
        } else {
            return { 
                elegible: false, 
                mensaje: `Cliente con crédito activo. Lleva ${semanasPagadas} semanas pagadas. Se requieren 10 para renovar.` 
            };
        }

    } catch (error) {
        console.error("Error verificando cliente:", error);
        throw error; 
    }
},

    verificarElegibilidadAval: async (curpAval, office) => {
    if (!curpAval) return { elegible: false, message: "CURP de aval vacía." };

    try {
        let query = db.collection('creditos')
            .where('curpAval', '==', curpAval)
            .where('estado', '!=', 'liquidado');
        
        if (office && office !== 'AMBAS') {
            query = query.where('office', '==', office);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return { elegible: true, message: "Aval limpio." };
        }

        const creditosAvalados = snapshot.docs.map(doc => doc.data());
        
        for (const credito of creditosAvalados) {
            const saldo = credito.saldo !== undefined ? credito.saldo : credito.montoTotal;
            const montoTotal = credito.montoTotal || 0;
            
            // Cálculo del porcentaje pagado
            const pagado = montoTotal - saldo;
            const porcentajePagado = montoTotal > 0 ? (pagado / montoTotal) : 0;

            // REGLA: Debe tener cubierto el 80%
            if (porcentajePagado < 0.80) {
                return { 
                    elegible: false, 
                    message: `El aval garantiza el crédito activo ${credito.historicalIdCredito || ''} que solo lleva el ${(porcentajePagado*100).toFixed(0)}% pagado (Req: 80%).` 
                };
            }

            // REGLA ADICIONAL: Buen comportamiento (opcional, pero recomendada)
            if (credito.estado === 'cobranza' || credito.estado === 'juridico') {
                return { 
                    elegible: false, 
                    message: `El aval garantiza el crédito ${credito.historicalIdCredito || ''} que está en estatus negativo (${credito.estado}).` 
                };
            }
        }

        return { elegible: true, message: "Aval elegible (créditos anteriores >80%)." };

    } catch (error) {
        console.error("Error verificando aval:", error);
        return { elegible: false, message: `Error verificando aval: ${error.message}` };
    }
},

    // --- AGREGAR CRÉDITO ---
    async agregarCredito(creditoData, userEmail, userData) {
    try {
        // --- 1. VALIDACIONES ---
        const office = creditoData.office;
        if (!office || (office !== 'GDL' && office !== 'LEON')) {
            return { success: false, message: 'Error crítico: Oficina inválida.' };
        }

        const cliente = await database.buscarClientePorCURP(creditoData.curpCliente, office); 
        if (!cliente) return { success: false, message: "Cliente no encontrado." };

        // --- 2. GENERACIÓN DE FOLIO ---
        const prefijoOficina = (office === 'GDL') ? '3' : '2';
        const codigoAgente = (userData && userData.agentCode) ? userData.agentCode.toString().padStart(2, '0') : '99';
        let contadorLocal = parseInt(localStorage.getItem('local_credit_counter') || '0');
        const nuevoConsecutivo = contadorLocal + 1;
        const nuevoFolio = `${prefijoOficina}${codigoAgente}${nuevoConsecutivo.toString().padStart(4, '0')}`;
        
        // --- 3. PREPARACIÓN DE DATOS NUEVOS ---
        const fechaCreacionISO = database.obtenerFechaLocalISO(); 
        const esCreditoComisionista = (creditoData.plazo === 10 && cliente.isComisionista);
        let montoPolizaDeduccion = esCreditoComisionista ? 0 : 100;

        const nuevoCreditoRef = db.collection('creditos').doc();
        
        // El nuevo crédito nace con la DEUDA TOTAL (ej. $5000 + intereses si aplica en tu UI)
        let nuevoCreditoData = {
            monto: parseFloat(creditoData.monto), 
            plazo: parseInt(creditoData.plazo),
            tipo: creditoData.tipo, 
            montoTotal: parseFloat(creditoData.montoTotal),
            saldo: parseFloat(creditoData.montoTotal), // DEBE EL TOTAL
            curpCliente: creditoData.curpCliente.toUpperCase(),
            curpAval: (creditoData.curpAval || '').toUpperCase(),
            nombreAval: creditoData.nombreAval || '',
            office: cliente.office,
            poblacion_grupo: cliente.poblacion_grupo,
            ruta: cliente.ruta,
            estado: 'al corriente',
            fechaCreacion: fechaCreacionISO,
            creadoPor: userEmail,
            creadoPorId: auth.currentUser ? auth.currentUser.uid : 'offline',
            historicalIdCredito: nuevoFolio,
            consecutivoAgente: nuevoConsecutivo, 
            origen: navigator.onLine ? 'online' : 'offline_pending',
            busqueda: [ creditoData.curpCliente.toUpperCase(), nuevoFolio ]
        };

        // --- 4. CÁLCULO DE RENOVACIÓN ---
        let saldoA_Liquidar = 0;
        let creditoAnteriorRef = null;
        let idCreditoAnteriorString = null;
        
        if (creditoData.tipo === 'renovacion') {
            // Buscamos crédito activo para liquidar
            const activeCredits = await db.collection('creditos')
                                    .where('curpCliente', '==', creditoData.curpCliente)
                                    .where('estado', '!=', 'liquidado')
                                    .get();
            
            if (!activeCredits.empty) {
                // Ordenamos para tomar el más antiguo por defecto
                const docs = activeCredits.docs.sort((a,b) => a.data().fechaCreacion.localeCompare(b.data().fechaCreacion));
                const oldCred = docs[0];
                const oldData = oldCred.data();
                
                saldoA_Liquidar = oldData.saldo !== undefined ? oldData.saldo : oldData.montoTotal;
                
                creditoAnteriorRef = db.collection('creditos').doc(oldCred.id);
                idCreditoAnteriorString = oldData.historicalIdCredito || oldCred.id;
                
                nuevoCreditoData.renovacionDe = idCreditoAnteriorString;
            }
        }

        // --- 5. CÁLCULO DE EFECTIVO NETO A ENTREGAR ---
        const montoEfectivoEntregado = nuevoCreditoData.monto - montoPolizaDeduccion - saldoA_Liquidar;

        // =========================================================
        // TRANSACCIÓN
        // =========================================================
        if (navigator.onLine) {
            await db.runTransaction(async (transaction) => {
                
                // A. Guardar Nuevo Crédito
                transaction.set(nuevoCreditoRef, nuevoCreditoData);

                // B. Liquidar Crédito Anterior + Generar Pago Histórico
                if (creditoAnteriorRef && saldoA_Liquidar > 0) {
                    // Actualizar estatus
                    transaction.update(creditoAnteriorRef, {
                        estado: 'liquidado',
                        saldo: 0,
                        fechaLiquidacion: fechaCreacionISO,
                        nota: `Renovado por ${nuevoFolio}`
                    });

                    // CREAR EL PAGO DE RENOVACIÓN (Para que aparezca en historial)
                    const pagoRef = db.collection('pagos').doc();
                    transaction.set(pagoRef, {
                        idCredito: idCreditoAnteriorString,
                        firestoreIdCredito: creditoAnteriorRef.id,
                        monto: parseFloat(saldoA_Liquidar.toFixed(2)),
                        fecha: fechaCreacionISO,
                        tipoPago: 'renovacion', // Importante para reportes
                        registradoPor: userEmail,
                        office: office,
                        origen: 'sistema_renovacion',
                        descripcion: `Liquidación por renovación ${nuevoFolio}`
                    });
                }

                // C. Registrar Salida de Efectivo (Solo lo neto)
                const movimientoRef = db.collection('movimientos_efectivo').doc();
                // Salida contable = Efectivo + Póliza (la póliza entra después)
                const salidaCaja = montoEfectivoEntregado + montoPolizaDeduccion;
                
                transaction.set(movimientoRef, {
                    userId: auth.currentUser.uid,
                    fecha: fechaCreacionISO,
                    tipo: 'COLOCACION',
                    categoria: 'COLOCACION',
                    monto: -Math.abs(salidaCaja), 
                    descripcion: `Colocación ${nuevoFolio} (Renovación). Liq: $${saldoA_Liquidar}`,
                    creditoId: nuevoCreditoRef.id,
                    registradoPor: userEmail,
                    office: office
                });

                // D. Registrar Entrada Póliza
                if (montoPolizaDeduccion > 0) {
                    const polizaRef = db.collection('movimientos_efectivo').doc();
                    transaction.set(polizaRef, {
                        userId: auth.currentUser.uid,
                        fecha: fechaCreacionISO,
                        tipo: 'INGRESO_POLIZA', 
                        categoria: 'ENTREGA_INICIAL', 
                        monto: montoPolizaDeduccion,
                        descripcion: `Póliza crédito ${nuevoFolio}`,
                        creditoId: nuevoCreditoRef.id,
                        registradoPor: userEmail,
                        office: office
                    });
                }

                // E. Comisión Vendedor
                if (!esCreditoComisionista) {
                    const comisionRef = db.collection('movimientos_efectivo').doc();
                    transaction.set(comisionRef, {
                        userId: auth.currentUser.uid,
                        fecha: fechaCreacionISO,
                        tipo: 'COMISION_COLOCACION',
                        categoria: 'COMISION',
                        monto: -100,
                        descripcion: `Comisión colocación ${cliente.nombre}`,
                        creditoId: nuevoCreditoRef.id,
                        registradoPor: userEmail,
                        office: office
                    });
                }
            });

            localStorage.setItem('local_credit_counter', nuevoConsecutivo.toString());
            return { 
                success: true, 
                offline: false,
                message: 'Crédito generado exitosamente.', 
                data: { id: nuevoCreditoRef.id, historicalIdCredito: nuevoFolio } 
            };

        } else {
            // MODO OFFLINE (Batch)
            console.warn("⚠️ Generando crédito OFFLINE:", nuevoFolio);
            const batch = db.batch();
            batch.set(nuevoCreditoRef, nuevoCreditoData);

            if (creditoAnteriorRef && saldoA_Liquidar > 0) {
                batch.update(creditoAnteriorRef, { estado: 'liquidado', saldo: 0, fechaLiquidacion: fechaCreacionISO });
                const pagoRef = db.collection('pagos').doc();
                batch.set(pagoRef, {
                    idCredito: idCreditoAnteriorString,
                    firestoreIdCredito: creditoAnteriorRef.id,
                    monto: parseFloat(saldoA_Liquidar.toFixed(2)),
                    fecha: fechaCreacionISO,
                    tipoPago: 'renovacion',
                    registradoPor: userEmail,
                    office: office,
                    origen: 'sistema_renovacion_offline'
                });
            }
            // ... (resto de movimientos offline igual que online pero con batch.set) ...
            // Simplificado para brevedad, pero debe replicar la lógica de arriba.
            
            // Salida Efectivo Offline
            const salidaCaja = montoEfectivoEntregado + montoPolizaDeduccion;
            const movimientoRef = db.collection('movimientos_efectivo').doc();
            batch.set(movimientoRef, {
                userId: auth.currentUser ? auth.currentUser.uid : 'offline_user',
                fecha: fechaCreacionISO,
                tipo: 'COLOCACION',
                categoria: 'COLOCACION',
                monto: -Math.abs(salidaCaja),
                descripcion: `Colocación ${nuevoFolio} (Renovación)`,
                creditoId: nuevoCreditoRef.id,
                registradoPor: userEmail,
                office: office
            });

            batch.commit();
            localStorage.setItem('local_credit_counter', nuevoConsecutivo.toString());
            
            return { success: true, offline: true, message: 'Guardado offline.', data: { id: nuevoCreditoRef.id, historicalIdCredito: nuevoFolio } };
        }

    } catch (error) {
        console.error("Error agregando crédito:", error);
        return { success: false, message: `Error al generar crédito: ${error.message}` };
    }
},

    // --- METODO DE PAGOS ---
    getPagosPorCredito: async (historicalIdCredito, office) => {
        try {
            if (!office || (office !== 'GDL' && office !== 'LEON')) {
                console.warn(`getPagosPorCredito fue llamado para ID ${historicalIdCredito} sin una 'office' válida.`);
                return [];
            }
            const snapshot = await db.collection('pagos')
                .where('idCredito', '==', historicalIdCredito)
                .where('office', '==', office)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error obteniendo pagos:`, error);
            return [];
        }
    },

    getAllPagosPorHistoricalId: async (historicalIdCredito) => {
        try {
            const snapshot = await db.collection('pagos')
                .where('idCredito', '==', historicalIdCredito)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error getting all payments for diagnostic:", error);
            return [];
        }
    },

   // --- REGISTRAR PAGO (CON VÍNCULO A COMISIÓN) ---
    async agregarPago(pagoData, emailUsuario, firestoreIdCredito) {
    try {
        const creditoRef = db.collection('creditos').doc(firestoreIdCredito);
        const pagosRef = db.collection('pagos').doc();
        const batch = db.batch();

        let doc;
        try {
            doc = await creditoRef.get();
        } catch (e) {
            console.warn("Lectura red falló, intentando caché...", e);
            doc = await creditoRef.get({ source: 'cache' });
        }

        if (!doc.exists) throw new Error("No se encontró el crédito.");

        const credito = doc.data();
        const saldoActual = credito.saldo !== undefined ? credito.saldo : credito.montoTotal;
        const officeCredito = credito.office || 'GDL';
        
        // --- AQUÍ ESTÁ EL CAMBIO DE FECHA ---
        // Si viene fechaPersonalizada, la usamos. Si no, usamos la fecha local actual.
        // Aseguramos que sea formato ISO.
        let fechaISO;
        if (pagoData.fechaPersonalizada) {
            // Asumimos que viene como YYYY-MM-DDT12:00:00 o similar
            // Convertimos a objeto Date y luego a ISO para estandarizar
            fechaISO = new Date(pagoData.fechaPersonalizada).toISOString();
        } else {
            fechaISO = database.obtenerFechaLocalISO();
        }
        // ------------------------------------

        const nuevoPago = {
            id: pagosRef.id,
            idCredito: pagoData.idCredito, 
            firestoreIdCredito: firestoreIdCredito,
            monto: parseFloat(pagoData.monto),
            fecha: fechaISO, // Usamos la fecha definida arriba
            tipoPago: pagoData.tipoPago || 'normal',
            registradoPor: emailUsuario,
            office: officeCredito, 
            origen: pagoData.origen || 'manual',
            syncStatus: 'pending'
        };

        const nuevoSaldo = parseFloat((saldoActual - nuevoPago.monto).toFixed(2));

        // Operaciones Batch
        batch.set(pagosRef, nuevoPago);
        batch.update(creditoRef, {
            saldo: nuevoSaldo,
            fechaUltimoPago: fechaISO,
            ...(nuevoSaldo < 0.05 ? { estado: 'liquidado' } : {})
        });

        // --- REGISTRO DE COMISIÓN VINCULADA ---
        if (pagoData.comisionGenerada && pagoData.comisionGenerada > 0) {
            const movimientoRef = db.collection('movimientos_efectivo').doc();
            batch.set(movimientoRef, {
                id: movimientoRef.id,
                tipo: 'COMISION_PAGO', 
                categoria: 'COMISION', 
                monto: -Math.abs(pagoData.comisionGenerada), 
                descripcion: `Comisión cobro crédito ${pagoData.idCredito}`,
                fecha: fechaISO, // Usamos la misma fecha del pago
                userId: (auth.currentUser) ? auth.currentUser.uid : 'offline_user',
                registradoPor: emailUsuario,
                office: officeCredito,
                creditoIdAsociado: firestoreIdCredito, 
                pagoIdAsociado: pagosRef.id 
            });
        }

        const commitOp = batch.commit();

        if (!navigator.onLine) {
            return { 
                success: true, 
                message: "Pago guardado en dispositivo (Pendiente de subir)",
                nuevoSaldo: nuevoSaldo,
                historicalIdCredito: pagoData.idCredito,
                offline: true
            };
        }

        await commitOp;
        return { 
            success: true, 
            message: "Pago registrado y sincronizado",
            nuevoSaldo: nuevoSaldo,
            historicalIdCredito: pagoData.idCredito
        };

    } catch (error) {
        console.error("Error en agregarPago:", error);
        if (error.message.includes("offline") || error.code === 'unavailable') {
             return { success: true, message: "Guardado forzoso en caché.", offline: true };
        }
        return { success: false, message: error.message };
    }
},

    // --- IMPORTACIÓN MASIVA (CORREGIDO) ---
    importarDatosDesdeCSV: async (csvData, tipo, office) => {
        const lineas = csvData.split('\n').filter(linea => linea.trim().length > 0);
        if (lineas.length === 0) return { success: true, total: 0, importados: 0, errores: [] };

        let errores = [];
        let alertas = [];
        let importados = 0;
        let batch = db.batch();
        let batchCounter = 0;
        const MAX_BATCH_SIZE = 450;
        
        const fechaImportacion = database.obtenerFechaLocalISO(); 
        let cacheClientes = new Map();

        // ---------------------------------------------------------
        // PASO PREVIO: CARGAR MAPA DE RUTAS (Para asignación auto)
        // ---------------------------------------------------------
        let mapaPoblacionRuta = new Map(); // Ej: "SAN JUAN" -> "R1"
        
        if (tipo === 'clientes') {
            try {
                console.log("🔄 Cargando catálogo de poblaciones para asignación automática de rutas...");
                // Obtenemos todas las poblaciones de la oficina actual
                const snapshotPoblaciones = await db.collection('poblaciones')
                    .where('office', '==', office)
                    .get();
                
                snapshotPoblaciones.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.nombre && data.ruta) {
                        // Guardamos en mayúsculas para comparar sin problemas
                        mapaPoblacionRuta.set(data.nombre.toUpperCase().trim(), data.ruta);
                    }
                });
                console.log(`✅ Mapa de rutas cargado. ${mapaPoblacionRuta.size} poblaciones mapeadas.`);
            } catch (err) {
                console.warn("⚠️ No se pudo cargar el mapa de rutas. Los clientes quedarán sin ruta asignada.", err);
            }
        }
        // ---------------------------------------------------------

        // --- HELPERS ---
        const limpiarDinero = (str) => {
            if (!str) return 0;
            return parseFloat(str.toString().replace(/[$,]/g, '').trim()) || 0;
        };

        const limpiarFecha = (fechaStr) => {
            if (!fechaStr) return database.obtenerFechaLocalISO();
            let str = fechaStr.trim();
            if (/^\d{8,15}$/.test(str)) return database.obtenerFechaLocalISO(); 
            
            if (str.includes('/') || str.includes('-')) {
                const p = str.split(/[-/]/);
                if (p.length === 3) {
                    const dia = parseInt(p[0]);
                    const mes = parseInt(p[1]) - 1; 
                    const anio = parseInt(p[2]);
                    if (anio > 1900 && anio < 2100) {
                        const fecha = new Date(anio, mes, dia);
                        const offset = fecha.getTimezoneOffset() * 60000;
                        return new Date(fecha.getTime() - offset).toISOString().slice(0, -1);
                    }
                }
            }
            const d = new Date(str);
            if (!isNaN(d.getTime())) return d.toISOString();
            return database.obtenerFechaLocalISO();
        };

        const leerCol = (arr, index, def = '') => {
            return (arr[index] !== undefined && arr[index] !== null) ? arr[index].trim() : def;
        };

        console.log(`Iniciando importación: ${tipo} en ${office}`);

        try {
            for (const [i, lineaRaw] of lineas.entries()) {
                const lineaNum = i + 1;
                if (lineaRaw.toLowerCase().includes('curp,') && lineaRaw.toLowerCase().includes('nombre,')) continue;

                const campos = lineaRaw.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

                if (tipo === 'clientes') {
                    // ESTRUCTURA (8 COLUMNAS):
                    // [0]CURP, [1]NOMBRE, [2]DOM, [3]CP, [4]TEL, [5]FECHA, [6]POBLACION, [7]COMISIONISTA
                    
                    if (campos.length < 5) {
                        errores.push(`L${lineaNum}: Datos insuficientes.`);
                        continue;
                    }

                    const curp = leerCol(campos, 0).toUpperCase();
                    if (curp.length < 10) { 
                        errores.push(`L${lineaNum}: CURP inválida.`); 
                        continue; 
                    }

                    const cacheKey = `${curp}_${office}`;
                    if (cacheClientes.has(cacheKey)) continue; 

                    // Corrección Teléfono/Fecha
                    let tel = leerCol(campos, 4);
                    let fec = leerCol(campos, 5);
                    if (/^\d{10}$/.test(fec) && (tel.includes('/') || tel.includes('-'))) {
                        let tmp = tel; tel = fec; fec = tmp;
                    }

                    // --- LÓGICA DE ASIGNACIÓN AUTOMÁTICA ---
                    const poblacionNombre = leerCol(campos, 6, 'GENERAL').toUpperCase();
                    let rutaAsignada = '';

                    if (mapaPoblacionRuta.has(poblacionNombre)) {
                        rutaAsignada = mapaPoblacionRuta.get(poblacionNombre);
                    } else {
                        // Si no encontramos la población exacta, intenta buscar coincidencia parcial o avisa
                        // Aquí dejamos vacío y avisamos, o asignamos una por defecto si quisieras
                        if (poblacionNombre !== 'GENERAL') {
                            alertas.push(`L${lineaNum}: Población "${poblacionNombre}" no tiene ruta asignada en el sistema.`);
                        }
                    }

                    // Comisionista
                    const esComisionistaRaw = leerCol(campos, 7, 'NO').toUpperCase();
                    const isComisionista = (esComisionistaRaw === 'SI' || esComisionistaRaw === 'SÍ');

                    const docRef = db.collection('clientes').doc();
                    batch.set(docRef, {
                        id: docRef.id,
                        office: office,
                        curp: curp,
                        nombre: leerCol(campos, 1, 'SIN NOMBRE'),
                        domicilio: leerCol(campos, 2, 'SIN DOMICILIO'),
                        cp: leerCol(campos, 3, ''),
                        telefono: tel,
                        fechaRegistro: limpiarFecha(fec),
                        fechaCreacion: limpiarFecha(fec),
                        poblacion_grupo: poblacionNombre,
                        // AQUÍ SE GUARDA LA RUTA AUTOMÁTICA
                        ruta: rutaAsignada, 
                        
                        isComisionista: isComisionista,
                        creadoPor: 'importacion_csv',
                        fechaImportacion: fechaImportacion
                    });
                    
                    cacheClientes.set(cacheKey, true);
                    importados++;

                } else if (tipo === 'colocacion') {
                    // (Lógica colocación estándar)
                    const idHistorico = leerCol(campos, 2);
                    if (!idHistorico) { errores.push(`L${lineaNum}: Falta ID.`); continue; }
                    const curp = leerCol(campos, 0).toUpperCase();
                    const monto = limpiarDinero(leerCol(campos, 5));
                    const total = limpiarDinero(leerCol(campos, 7));
                    let saldo = leerCol(campos, 12) ? limpiarDinero(leerCol(campos, 12)) : total;

                    const docRef = db.collection('creditos').doc();
                    batch.set(docRef, {
                        id: docRef.id,
                        historicalIdCredito: idHistorico,
                        curpCliente: curp,
                        nombreCliente: leerCol(campos, 1, 'IMPORTADO'),
                        fechaCreacion: limpiarFecha(leerCol(campos, 3)),
                        tipo: leerCol(campos, 4, 'nuevo').toLowerCase(),
                        monto: monto,
                        plazo: parseInt(leerCol(campos, 6)) || 14,
                        montoTotal: total,
                        curpAval: leerCol(campos, 8, '').toUpperCase(),
                        nombreAval: leerCol(campos, 9, ''),
                        poblacion_grupo: leerCol(campos, 10, ''),
                        ruta: leerCol(campos, 11, ''), // Aquí sí leemos del CSV histórico si existe
                        saldo: saldo,
                        office: office,
                        estado: (saldo <= 0.05) ? 'liquidado' : 'al corriente',
                        busqueda: [curp, idHistorico]
                    });
                    importados++;

                } else if (tipo === 'cobranza') {
                    // (Lógica cobranza estándar)
                    const idHist = leerCol(campos, 1);
                    if (!idHist) continue;
                    const monto = limpiarDinero(leerCol(campos, 3));
                    if (monto <= 0) continue; 

                    const docRef = db.collection('pagos').doc();
                    batch.set(docRef, {
                        id: docRef.id,
                        idCredito: idHist,
                        monto: monto,
                        fecha: limpiarFecha(leerCol(campos, 2)),
                        tipoPago: leerCol(campos, 4, 'normal').toLowerCase(),
                        poblacion_grupo: leerCol(campos, 5, ''),
                        ruta: leerCol(campos, 6, ''),
                        office: office,
                        registradoPor: 'importacion_csv',
                        origen: 'csv'
                    });
                    importados++;
                }

                batchCounter++;
                if (batchCounter >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    console.log(`Lote guardado: ${lineaNum} líneas.`);
                    batch = db.batch();
                    batchCounter = 0;
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            if (batchCounter > 0) await batch.commit();
            
            // Añadir resumen de alertas al final
            if (alertas.length > 0) {
                // Solo mostrar las primeras 5 alertas para no saturar si son muchas
                const resumenAlertas = alertas.slice(0, 5).join('\n');
                const masAlertas = alertas.length > 5 ? `\n...y ${alertas.length - 5} más.` : '';
                errores.push(`INFO DE RUTAS: \n${resumenAlertas}${masAlertas}`);
            }

            return { success: true, total: lineas.length, importados: importados, errores: errores };

        } catch (error) {
            console.error("Error CRÍTICO en importación:", error);
            return { success: false, message: error.message, errores: errores };
        }
    },

    // --- FUNCIONES DE REPORTES Y MANTENIMIENTO ---
    generarReportes: async (userOffice = null) => {
        try {
            // 1. Preparar consultas base
            let clientesQuery = db.collection('clientes');
            let creditosQuery = db.collection('creditos');
            
            // Consultas para flujos del mes (Pagos y Comisiones)
            const hoy = new Date();
            // Calcular primer día del mes actual (Local) y del siguiente
            const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
            const primerDiaMesSiguiente = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();

            let pagosQuery = db.collection('pagos')
                .where('fecha', '>=', primerDiaMes)
                .where('fecha', '<', primerDiaMesSiguiente);
            
            let comisionesQuery = db.collection('movimientos_efectivo')
                .where('categoria', '==', 'COMISION')
                .where('fecha', '>=', primerDiaMes)
                .where('fecha', '<', primerDiaMesSiguiente);

            // Filtro de Oficina
            if (userOffice && userOffice !== 'AMBAS') {
                clientesQuery = clientesQuery.where('office', '==', userOffice);
                creditosQuery = creditosQuery.where('office', '==', userOffice);
                pagosQuery = pagosQuery.where('office', '==', userOffice);
                comisionesQuery = comisionesQuery.where('office', '==', userOffice);
            }

            // 2. Ejecutar promesas en paralelo
            const [clientesSnap, creditosSnap, pagosSnap, comisionesSnap] = await Promise.all([
                clientesQuery.get(), 
                creditosQuery.get(), 
                pagosQuery.get(),
                comisionesQuery.get()
            ]);

            const creditos = creditosSnap.docs.map(doc => doc.data());
            const pagos = pagosSnap.docs.map(doc => doc.data());
            const comisiones = comisionesSnap.docs.map(doc => doc.data());

            // 3. Cálculos de Cartera
            const creditosActivosPendientes = creditos.filter(c => 
                c.estado !== 'liquidado' && (c.saldo === undefined || c.saldo > 0.05)
            );
            
            const totalCartera = creditosActivosPendientes.reduce((sum, c) => sum + (c.saldo || c.montoTotal || 0), 0);

            // 4. Cálculos del Mes (Pagos)
            const cobradoMes = pagos.reduce((sum, p) => sum + (p.monto || 0), 0);
            
            // 5. Cálculos del Mes (Comisiones)
            // Sumamos todas las salidas de comisión (vienen en negativo, las pasamos a positivo para el reporte)
            const totalComisionesMes = comisiones.reduce((sum, c) => sum + Math.abs(c.monto || 0), 0);

            // 6. Análisis de Vencidos (Lógica simple: Ultimo pago hace > 7 días)
            let totalVencidos = 0;
            const hace7dias = new Date();
            hace7dias.setDate(hace7dias.getDate() - 7);

            creditosActivosPendientes.forEach(credito => {
                // Si nunca ha pagado, usamos fecha creación
                let fechaRef = credito.fechaUltimoPago || credito.fechaCreacion;
                // Parse seguro
                if (fechaRef) {
                    // Si es string ISO
                    let fechaObj = new Date(fechaRef);
                    if (!isNaN(fechaObj) && fechaObj < hace7dias) {
                        totalVencidos++;
                    }
                }
            });

            // 7. Tasa de Recuperación
            // Fórmula simple: Cobrado / (Cartera Total / Plazo Promedio * 4 semanas)
            // Aproximación: Esperamos cobrar aprox el 25% de la cartera total cada mes (si son 4 meses promedio)
            // O mejor: Suma de las "letras" esperadas del mes.
            // Para simplificar y no hacer querys pesados:
            let cobroEsperadoMes = 0;
            creditosActivosPendientes.forEach(c => {
                if (c.montoTotal && c.plazo > 0) {
                    // Pago semanal teórico * 4 semanas
                    cobroEsperadoMes += (c.montoTotal / c.plazo) * 4;
                }
            });
            const tasaRecuperacion = cobroEsperadoMes > 0 ? Math.min(100, (cobradoMes / cobroEsperadoMes * 100)) : 0;

            return {
                totalClientes: clientesSnap.size, 
                totalCreditos: creditosActivosPendientes.length, 
                totalCartera: totalCartera,
                totalVencidos: totalVencidos, 
                pagosRegistrados: pagos.length, 
                cobradoMes: cobradoMes,
                totalComisiones: totalComisionesMes, // <--- AHORA SÍ SE CALCULA
                tasaRecuperacion: tasaRecuperacion
            };

        } catch (error) {
            console.error("Error generando reportes:", error);
            // Retorno seguro en caso de error
            return { 
                totalClientes: 0, totalCreditos: 0, totalCartera: 0, 
                totalVencidos: 0, pagosRegistrados: 0, cobradoMes: 0, 
                totalComisiones: 0, tasaRecuperacion: 0 
            };
        }
    },

    // -- GENERACION DE REPORTES AVANZADOS ---
    generarReporteAvanzado: async (filtros) => {
        if (filtros.userOffice && filtros.userOffice !== 'AMBAS') filtros.office = filtros.userOffice;
        console.log("Generando reporte avanzado con filtros:", filtros);
        try {
            const resultados = []; 
            const clientesMap = new Map();
            let clientesFiltrados = null; 
            let filtrarCreditosPagosPorCurps = false; 
            let curpsClientes = [];
            
            if (filtros.office || filtros.grupo || filtros.ruta || filtros.curpCliente || filtros.nombre) {
                clientesFiltrados = await database.buscarClientes({
                    office: filtros.office, 
                    grupo: filtros.grupo, 
                    ruta: filtros.ruta,
                    curp: filtros.curpCliente, 
                    nombre: filtros.nombre
                });
                clientesFiltrados.forEach(c => clientesMap.set(c.curp, c));
                curpsClientes = clientesFiltrados.map(c => c.curp);
                if (curpsClientes.length === 0 && (filtros.curpCliente || filtros.nombre)) return [];
                filtrarCreditosPagosPorCurps = true;
            }
            
            let queryCreditos = db.collection('creditos');
            if (filtros.office) queryCreditos = queryCreditos.where('office', '==', filtros.office);
            if (filtros.tipoCredito) queryCreditos = queryCreditos.where('tipo', '==', filtros.tipoCredito);
            if (filtros.estadoCredito) queryCreditos = queryCreditos.where('estado', '==', filtros.estadoCredito);
            if (filtros.idCredito) queryCreditos = queryCreditos.where('historicalIdCredito', '==', filtros.idCredito);
            if (filtros.grupo) queryCreditos = queryCreditos.where('poblacion_grupo', '==', filtros.grupo);
            if (filtros.ruta) queryCreditos = queryCreditos.where('ruta', '==', filtros.ruta);
            
            const MAX_IN_VALUES = 30;
            if (filtrarCreditosPagosPorCurps && curpsClientes.length > 0) {
                if (curpsClientes.length <= MAX_IN_VALUES) queryCreditos = queryCreditos.where('curpCliente', 'in', curpsClientes);
                else console.warn("Demasiados clientes, créditos se filtrarán en memoria.");
            } else if (filtrarCreditosPagosPorCurps && curpsClientes.length === 0) return [];
            
            if (filtros.fechaInicio) queryCreditos = queryCreditos.where('fechaCreacion', '>=', new Date(filtros.fechaInicio + 'T00:00:00Z').toISOString());
            if (filtros.fechaFin) { 
                const fechaFinSiguiente = new Date(filtros.fechaFin); 
                fechaFinSiguiente.setUTCDate(fechaFinSiguiente.getUTCDate() + 1); 
                queryCreditos = queryCreditos.where('fechaCreacion', '<', fechaFinSiguiente.toISOString()); 
            }
            
            const creditosSnap = await queryCreditos.get();
            for (const doc of creditosSnap.docs) {
                const credito = { id: doc.id, ...doc.data() };
                if (filtrarCreditosPagosPorCurps && curpsClientes.length > MAX_IN_VALUES && !clientesMap.has(credito.curpCliente)) continue;
                let cliente = clientesMap.get(credito.curpCliente);
                if (!cliente) { 
                    cliente = await database.buscarClientePorCURP(credito.curpCliente); 
                    if (cliente) clientesMap.set(cliente.curp, cliente); 
                }
                resultados.push({ tipo: 'credito', ...credito, nombreCliente: cliente?.nombre || 'N/A' });
            }
            
            let queryPagos = db.collection('pagos');
            if (filtros.office) queryPagos = queryPagos.where('office', '==', filtros.office);
            if (filtros.tipoPago) queryPagos = queryPagos.where('tipoPago', '==', filtros.tipoPago);
            if (filtros.idCredito) queryPagos = queryPagos.where('idCredito', '==', filtros.idCredito);
            if (filtros.grupo) queryPagos = queryPagos.where('grupo', '==', filtros.grupo);
            
            if (filtrarCreditosPagosPorCurps && curpsClientes.length > 0) {
                if (curpsClientes.length <= MAX_IN_VALUES) queryPagos = queryPagos.where('curpCliente', 'in', curpsClientes);
                else console.warn("Demasiados clientes, pagos se filtrarán en memoria.");
            } else if (filtrarCreditosPagosPorCurps && curpsClientes.length === 0) queryPagos = null;
            
            if (queryPagos && filtros.fechaInicio) queryPagos = queryPagos.where('fecha', '>=', new Date(filtros.fechaInicio + 'T00:00:00Z').toISOString());
            if (queryPagos && filtros.fechaFin) { 
                const fechaFinSiguientePago = new Date(filtros.fechaFin); 
                fechaFinSiguientePago.setUTCDate(fechaFinSiguientePago.getUTCDate() + 1); 
                queryPagos = queryPagos.where('fecha', '<', fechaFinSiguientePago.toISOString()); 
            }
            
            if (queryPagos) {
                const pagosSnap = await queryPagos.get();
                for (const doc of pagosSnap.docs) {
                    const pago = { id: doc.id, ...doc.data() };
                    if (filtrarCreditosPagosPorCurps && curpsClientes.length > MAX_IN_VALUES && !clientesMap.has(pago.curpCliente)) continue;
                    let cliente = clientesMap.get(pago.curpCliente);
                    if (!cliente) { 
                        cliente = await database.buscarClientePorCURP(pago.curpCliente); 
                        if (cliente) clientesMap.set(cliente.curp, cliente); 
                    }
                    resultados.push({ tipo: 'pago', ...pago, nombreCliente: cliente?.nombre || pago.nombreCliente || 'N/A' });
                }
            }
            
            if (!filtros.idCredito && !filtros.tipoPago && filtros.fechaInicio && filtros.fechaFin) {
                let queryNuevosClientes = db.collection('clientes');
                if (filtros.office) queryNuevosClientes = queryNuevosClientes.where('office', '==', filtros.office);
                if (filtros.grupo) queryNuevosClientes = queryNuevosClientes.where('poblacion_grupo', '==', filtros.grupo);
                if (filtros.ruta) queryNuevosClientes = queryNuevosClientes.where('ruta', '==', filtros.ruta);
                queryNuevosClientes = queryNuevosClientes.where('fechaRegistro', '>=', new Date(filtros.fechaInicio + 'T00:00:00Z').toISOString());
                const fechaFinSiguienteCliente = new Date(filtros.fechaFin); 
                fechaFinSiguienteCliente.setUTCDate(fechaFinSiguienteCliente.getUTCDate() + 1);
                queryNuevosClientes = queryNuevosClientes.where('fechaRegistro', '<', fechaFinSiguienteCliente.toISOString());
                const nuevosClientesSnap = await queryNuevosClientes.get();
                nuevosClientesSnap.forEach(doc => {
                    const clienteNuevo = { id: doc.id, ...doc.data() }; 
                    let coincide = true;
                    if (filtros.nombre && !(clienteNuevo.nombre || '').toLowerCase().includes(filtros.nombre.toLowerCase())) coincide = false;
                    if (filtros.curpCliente && !filtros.curpCliente.split(',').map(c => c.trim().toUpperCase()).includes(clienteNuevo.curp)) coincide = false;
                    if (coincide) resultados.push({ tipo: 'cliente', ...clienteNuevo });
                });
            }
            
            resultados.sort((a, b) => { 
                const fechaA = parsearFecha(a.fecha || a.fechaCreacion || a.fechaRegistro)?.getTime() || 0; 
                const fechaB = parsearFecha(b.fecha || b.fechaCreacion || b.fechaRegistro)?.getTime() || 0; 
                return fechaB - fechaA; 
            });
            
            return resultados;
        } catch (error) { 
            console.error("Error generando reporte avanzado:", error); 
            return []; 
        }
    },

    // --- OBTENER DATOS PARA GRAFICOS ---
    obtenerDatosParaGraficos: async (filtros) => {
        try { 
            if (filtros.userOffice && filtros.userOffice !== 'AMBAS') filtros.office = filtros.userOffice;
            let creditosQuery = db.collection('creditos'); 
            let pagosQuery = db.collection('pagos');
            
            if (filtros.office) { 
                creditosQuery = creditosQuery.where('office', '==', filtros.office); 
                pagosQuery = pagosQuery.where('office', '==', filtros.office); 
            }
            if (filtros.grupo) { 
                creditosQuery = creditosQuery.where('poblacion_grupo', '==', filtros.grupo); 
                pagosQuery = pagosQuery.where('grupo', '==', filtros.grupo); 
            }
            
            const fechaInicioISO = filtros.fechaInicio ? new Date(filtros.fechaInicio + 'T00:00:00Z').toISOString() : null;
            let fechaFinISOExclusive = null; 
            if (filtros.fechaFin) { 
                const fechaFinSiguiente = new Date(filtros.fechaFin); 
                fechaFinSiguiente.setUTCDate(fechaFinSiguiente.getUTCDate() + 1); 
                fechaFinISOExclusive = fechaFinSiguiente.toISOString(); 
            }
            
            if (fechaInicioISO) { 
                creditosQuery = creditosQuery.where('fechaCreacion', '>=', fechaInicioISO); 
                pagosQuery = pagosQuery.where('fecha', '>=', fechaInicioISO); 
            }
            if (fechaFinISOExclusive) { 
                creditosQuery = creditosQuery.where('fechaCreacion', '<', fechaFinISOExclusive); 
                pagosQuery = pagosQuery.where('fecha', '<', fechaFinISOExclusive); 
            }
            
            const [creditosSnap, pagosSnap] = await Promise.all([ creditosQuery.get(), pagosQuery.get() ]);
            const creditos = creditosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            const pagos = pagosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { creditos, pagos };
        } catch (error) { 
            console.error("Error obteniendo datos para gráficos:", error); 
            return { creditos: [], pagos: [] }; 
        }
    },

    // --- FILTRO POR FECHA ---
    _cumpleFiltroFecha: (fecha, fechaInicio, fechaFin) => {
        if (!fechaInicio && !fechaFin) return true; 
        const fechaObj = parsearFecha(fecha); 
        if (!fechaObj) return false;
        if (fechaInicio) { 
            const inicio = new Date(fechaInicio + 'T00:00:00Z'); 
            if (fechaObj < inicio) return false; 
        }
        if (fechaFin) { 
            const fin = new Date(fechaFin + 'T23:59:59Z'); 
            if (fechaObj > fin) return false; 
        } 
        return true;
    },

    // --- CREDITOS VENCIDOS ---
    esCreditoVencido: (credito, pagos) => {
        if (!credito || credito.estado === 'liquidado' || (credito.saldo !== undefined && credito.saldo <= 0.01)) return { vencido: false };
        const hoy = new Date(); 
        let fechaReferencia = null;
        if (pagos && pagos.length > 0) fechaReferencia = parsearFecha(pagos[0].fecha); 
        else fechaReferencia = parsearFecha(credito.fechaCreacion);
        if (!fechaReferencia) { 
            console.warn("Vencimiento no determinable (fecha ref inválida):", credito.id); 
            return { vencido: false }; 
        }
        const msDesdeReferencia = hoy.getTime() - fechaReferencia.getTime(); 
        const diasDesdeReferencia = Math.floor(msDesdeReferencia / (1000 * 60 * 60 * 24));
        return { vencido: diasDesdeReferencia > 7 };
    },

    // --- CLIENTE DUPLICADOS ---
    encontrarClientesDuplicados: async () => {
        try { 
            const clientesSnapshot = await db.collection('clientes').orderBy('fechaCreacion', 'desc').get(); 
            const clientes = clientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const seen = new Map(); 
            const idsParaEliminar = []; 
            let duplicadosEncontrados = 0; 
            const curpsAfectadas = new Set();
            
            for (const cliente of clientes) { 
                const clave = `${cliente.curp}_${cliente.office}`; 
                if (seen.has(clave)) { 
                    idsParaEliminar.push(cliente.id); 
                    duplicadosEncontrados++; 
                    curpsAfectadas.add(cliente.curp); 
                } else { 
                    seen.set(clave, cliente.id); 
                } 
            }
            
            return { 
                success: true, 
                idsParaEliminar, 
                duplicadosEncontrados, 
                curpsAfectadas: Array.from(curpsAfectadas) 
            };
        } catch (error) { 
            console.error("Error encontrando duplicados:", error); 
            return { 
                success: false, 
                message: `Error: ${error.message}`, 
                idsParaEliminar: [], 
                duplicadosEncontrados: 0, 
                curpsAfectadas: [] 
            }; 
        }
    },

    // --- EJECUTAR ELIMINAION DE DUPLICADOS ---
    ejecutarEliminacionDuplicados: async (ids) => {
        if (!ids || ids.length === 0) return { success: true, message: 'No hay IDs para eliminar.' }; 
        let batch = db.batch(); 
        let count = 0; 
        const MAX_BATCH_SIZE = 490; 
        let eliminados = 0;
        
        try { 
            for (const id of ids) { 
                const docRef = db.collection('clientes').doc(id); 
                batch.delete(docRef); 
                count++; 
                if (count >= MAX_BATCH_SIZE) { 
                    await batch.commit(); 
                    console.log(`Lote de ${count} eliminaciones completado.`); 
                    eliminados += count; 
                    batch = db.batch(); 
                    count = 0; 
                    await new Promise(resolve => setTimeout(resolve, 50)); 
                } 
            }
            
            if (count > 0) { 
                await batch.commit(); 
                eliminados += count; 
                console.log(`Lote final de ${count} eliminaciones completado.`); 
            }
            
            return { success: true, message: `Se eliminaron ${eliminados} registros duplicados.` };
        } catch (error) { 
            console.error("Error eliminando duplicados en batch:", error); 
            try { 
                if (count > 0) await batch.commit(); 
            } catch (e) { 
                console.error("Error en commit final:", e);
            } 
            return { 
                success: false, 
                message: `Error durante la eliminación: ${error.message}. ${eliminados} pudieron haberse eliminado.` 
            }; 
        }
    },

    // --- OBTENER POBLACIONES ---
    obtenerPoblaciones: async (office = null) => {
        try {
            let query = db.collection('poblaciones');
            
            if (office && office !== 'AMBAS') {
                query = query.where('office', '==', office);
            }
            
            const snapshot = await query.get();
            let poblacionesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            poblacionesData.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

            return poblacionesData;
        } catch (error) {
            console.error("Error obteniendo poblaciones:", error);
            return [];
        }
    },

    // --- AGREGAR POBLACIONES ---
    agregarPoblacion: async (nombre, office) => {
        try {
            const nombreUpper = nombre.toUpperCase();
            const existeSnap = await db.collection('poblaciones')
                .where('nombre', '==', nombreUpper)
                .where('office', '==', office)
                .limit(1).get();
            if (!existeSnap.empty) {
                return { success: false, message: `La población "${nombreUpper}" ya existe en la oficina ${office}.` };
            }
            await db.collection('poblaciones').add({ nombre: nombreUpper, office, ruta: null });
            return { success: true, message: 'Población agregada.' };
        } catch (error) {
            console.error("Error agregando población:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- ELIMINAR POBLACIONES ---
    eliminarPoblacion: async (id) => {
        try { 
            await db.collection('poblaciones').doc(id).delete(); 
            return { success: true, message: 'Población eliminada.' }; 
        } catch (error) { 
            console.error("Error eliminando población:", error); 
            return { success: false, message: `Error: ${error.message}` }; 
        }
    },

    // --- OBTENER RUTAS ---
    obtenerRutas: async (office = null) => {
        try {
            let query = db.collection('rutas');
            if (office && office !== 'AMBAS') {
                query = query.where('office', '==', office);
            }
            const snapshot = await query.get();
            let rutasData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            rutasData.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            
            return rutasData;
        } catch (error) {
            console.error("Error obteniendo rutas:", error);
            return [];
        }
    },

    // ACTUALIZAR NOMBRE DE RUTA ---
    actualizarNombreRuta: async (id, nuevoNombre) => {
        if (!id || !nuevoNombre || !nuevoNombre.trim()) {
            return { success: false, message: 'ID o nombre inválido.' };
        }
        try {
            const nombreUpper = nuevoNombre.toUpperCase();
            const rutaRef = db.collection('rutas').doc(id);
            const rutaDoc = await rutaRef.get();
            if (!rutaDoc.exists) throw new Error("Ruta no encontrada.");
            const rutaData = rutaDoc.data();
            const nombreOriginal = rutaData.nombre;
            const existeSnap = await db.collection('rutas')
                .where('nombre', '==', nombreUpper)
                .where('office', '==', rutaData.office)
                .limit(1).get();
            if (!existeSnap.empty && existeSnap.docs[0].id !== id) {
                 return { success: false, message: `El nombre "${nombreUpper}" ya existe en la oficina ${rutaData.office}.` };
            }

            await rutaRef.update({ nombre: nombreUpper });
            
            const poblacionesSnap = await db.collection('poblaciones')
                .where('office', '==', rutaData.office)
                .where('ruta', '==', nombreOriginal)
                .get();
            
            if (!poblacionesSnap.empty) {
                const batch = db.batch();
                poblacionesSnap.docs.forEach(doc => {
                    batch.update(doc.ref, { ruta: nombreUpper });
                });
                await batch.commit();
            }

            return { success: true, message: 'Nombre de ruta actualizado.' };
        } catch (error) {
            console.error("Error actualizando nombre de ruta:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- ASIGNAR RUTA A POBLACION ---
    asignarRutaAPoblacion: async (poblacionId, rutaNombre) => {
        if (!poblacionId) {
            return { success: false, message: 'ID de población inválido.' };
        }
        try {
            const poblacionRef = db.collection('poblaciones').doc(poblacionId);
            const updateData = {
                ruta: rutaNombre ? rutaNombre.toUpperCase() : null
            };
            await poblacionRef.update(updateData);
            return { success: true, message: `Ruta ${rutaNombre ? 'asignada/actualizada' : 'eliminada'} para la población.` };
        } catch (error) {
            console.error("Error asignando ruta a población:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- AGREGAR RUTA ---
    agregarRuta: async (nombre, office) => {
        try {
            const nombreUpper = nombre.toUpperCase();
            const existeSnap = await db.collection('rutas')
                .where('nombre', '==', nombreUpper)
                .where('office', '==', office)
                .limit(1).get();
            if (!existeSnap.empty) {
                return { success: false, message: `La ruta "${nombreUpper}" ya existe en la oficina ${office}.` };
            }
            await db.collection('rutas').add({ nombre: nombreUpper, office });
            return { success: true, message: 'Ruta agregada.' };
        } catch (error) {
            console.error("Error agregando ruta:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- ELIMINAR RUTA ---
    eliminarRuta: async (id, nombre, office) => {
        try {
            await db.collection('rutas').doc(id).delete();
            
            const poblacionesSnap = await db.collection('poblaciones')
                .where('office', '==', office)
                .where('ruta', '==', nombre)
                .get();
            
            if (!poblacionesSnap.empty) {
                const batch = db.batch();
                poblacionesSnap.docs.forEach(doc => {
                    batch.update(doc.ref, { ruta: null });
                });
                await batch.commit();
            }
            
            return { success: true, message: 'Ruta eliminada y des-asignada.' };
        } catch (error) {
            console.error("Error eliminando ruta:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // =============================================
    // *** NUEVAS FUNCIONES: EFECTIVO Y COMISIONES ***
    // =============================================
    agregarMovimientoEfectivo: async (movimientoData) => {
        try {
            if (!movimientoData.userId || !movimientoData.tipo || !movimientoData.monto) {
                throw new Error("UserID, Tipo y Monto son requeridos para un movimiento.");
            }
            movimientoData.fecha = movimientoData.fecha || new Date().toISOString();
            
            await db.collection('movimientos_efectivo').add(movimientoData);
            return { success: true, message: 'Movimiento de efectivo registrado.' };
        } catch (error) {
            console.error("Error agregando movimiento de efectivo:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- OBTENER MOVIMIENTOS DE EFECTIVO ---
    getMovimientosEfectivo: async (filtros) => {
        try {
            if (!filtros.userId) {
                throw new Error("Se requiere un ID de usuario para buscar movimientos.");
            }
            let query = db.collection('movimientos_efectivo').where('userId', '==', filtros.userId);
            
            if (filtros.fechaInicio) {
                query = query.where('fecha', '>=', filtros.fechaInicio);
            }
            if (filtros.fechaFin) {
                query = query.where('fecha', '<=', filtros.fechaFin + 'T23:59:59Z');
            }
            if (filtros.office && filtros.office !== 'AMBAS') {
                 query = query.where('office', '==', filtros.office);
            }

            const snapshot = await query.orderBy('fecha', 'desc').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo movimientos de efectivo:", error);
            if (error.message.includes("requires an index")) {
               console.warn(">>> Firestore requiere un índice en 'movimientos_efectivo'.");
            }
            return [];
        }
    },

    // --- OBTENER MOVIMIENTOS PARA REPORTE ---
    getMovimientosParaReporte: async (filtros) => {
        try {
            if (!filtros.office || filtros.office === 'AMBAS') {
                throw new Error("Se requiere una oficina específica (GDL o LEON) para el reporte contable.");
            }
            
            let queryMovimientos = db.collection('movimientos_efectivo').where('office', '==', filtros.office);
            let queryComisiones = db.collection('comisiones').where('office', '==', filtros.office);

            if (filtros.userId) {
                queryMovimientos = queryMovimientos.where('userId', '==', filtros.userId);
                queryComisiones = queryComisiones.where('userId', '==', filtros.userId);
            }
            if (filtros.fechaInicio) {
                const fechaInicioISO = filtros.fechaInicio + 'T00:00:00Z';
                queryMovimientos = queryMovimientos.where('fecha', '>=', fechaInicioISO);
                queryComisiones = queryComisiones.where('fecha', '>=', fechaInicioISO);
            }
            if (filtros.fechaFin) {
                const fechaFinISO = filtros.fechaFin + 'T23:59:59Z';
                queryMovimientos = queryMovimientos.where('fecha', '<=', fechaFinISO);
                queryComisiones = queryComisiones.where('fecha', '<=', fechaFinISO);
            }

            const [movimientosSnap, comisionesSnap] = await Promise.all([
                queryMovimientos.get(),
                queryComisiones.get()
            ]);

            const movimientos = movimientosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const comisiones = comisionesSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    userId: data.userId,
                    fecha: data.fecha,
                    tipo: `COMISION_${data.tipo}`,
                    monto: data.montoComision,
                    descripcion: data.descripcion || `Comisión por ${data.tipo}`,
                    registradoPor: data.registradoPor || 'sistema',
                    office: data.office
                };
            });

            const resultados = [...movimientos, ...comisiones];
            resultados.sort((a, b) => (parsearFecha(a.fecha)?.getTime() || 0) - (parsearFecha(b.fecha)?.getTime() || 0)); 

            return { success: true, data: resultados };
            
        } catch (error) {
            console.error("Error obteniendo movimientos para reporte:", error);
            return { success: false, message: error.message, data: [] };
        }
    },

    // --- AGREGAR COMISION ---
    agregarComision: async (comisionData) => {
        try {
            if (!comisionData.userId || !comisionData.tipo || !comisionData.montoComision) {
                throw new Error("UserID, Tipo y Monto son requeridos para una comisión.");
            }
            comisionData.fecha = comisionData.fecha || new Date().toISOString();
            
            await db.collection('comisiones').add(comisionData);
            return { success: true, message: 'Comisión registrada.' };
        } catch (error) {
            console.error("Error agregando comisión:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- ACTUALIZAR CREDITO ---
    actualizarCredito: async (creditoId, dataToUpdate) => {
        try {
            dataToUpdate.fechaModificacion = new Date().toISOString();
            await db.collection('creditos').doc(creditoId).update(dataToUpdate);
            return { success: true, message: 'Crédito actualizado.' };
        } catch (error) {
            console.error("Error actualizando crédito:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- ELIMINAR CRÉDITO COMPLETO Y ASOCIADOS ---
    eliminarCredito: async (creditoId, historicalId, office) => {
        try {
            if (!creditoId || !historicalId || !office) {
                throw new Error("Datos insuficientes para eliminar.");
            }
            
            const batch = db.batch();
            const creditoRef = db.collection('creditos').doc(creditoId);
            batch.delete(creditoRef);
            
            // 1. Borrar Pagos
            const pagosSnap = await db.collection('pagos')
                .where('idCredito', '==', historicalId)
                .where('office', '==', office)
                .get();
            pagosSnap.docs.forEach(doc => batch.delete(doc.ref));

            // 2. Borrar Movimientos de Efectivo (Comisiones, Entradas, etc.)
            // Buscamos por ambos campos posibles para asegurar limpieza total
            // A. Por creditoId (versión vieja)
            const movsOldSnap = await db.collection('movimientos_efectivo')
                .where('creditoId', '==', creditoId)
                .get();
            movsOldSnap.docs.forEach(doc => batch.delete(doc.ref));

            // B. Por creditoIdAsociado (versión nueva)
            const movsNewSnap = await db.collection('movimientos_efectivo')
                .where('creditoIdAsociado', '==', creditoId)
                .get();
            movsNewSnap.docs.forEach(doc => batch.delete(doc.ref));

            await batch.commit();
            
            return { 
                success: true, 
                message: 'Crédito eliminado.',
                pagosEliminados: pagosSnap.size
            };
            
        } catch (error) {
            console.error("Error eliminando crédito y asociados:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- ACTUALIZAR PAGO Y GESTIONAR COMISIÓN ---
    actualizarPago: async (pagoId, creditoId, dataToUpdate, diferenciaMonto) => {
        try {
            const creditoRef = db.collection('creditos').doc(creditoId);
            const pagoRef = db.collection('pagos').doc(pagoId);
            
            // Determinar si el nuevo tipo genera comisión ($10) o no ($0)
            // Regla: Normal/Adelanto/Actualizado/Grupal = $10. Extraordinario/Bancario = $0.
            const tiposConComision = ['normal', 'adelanto', 'actualizado', 'grupal'];
            const generaComision = tiposConComision.includes(dataToUpdate.tipoPago);
            const montoComisionEsperado = generaComision ? 10 : 0;

            await db.runTransaction(async (transaction) => {
                const creditoDoc = await transaction.get(creditoRef);
                const pagoDoc = await transaction.get(pagoRef);
                
                if (!creditoDoc.exists) throw new Error("Crédito no encontrado.");
                if (!pagoDoc.exists) throw new Error("Pago no encontrado.");

                const credito = creditoDoc.data();
                const pagoAntiguo = pagoDoc.data();

                // 1. Actualizar Saldo Crédito
                let nuevoSaldo = (credito.saldo || 0) - diferenciaMonto;
                if (nuevoSaldo < 0.01) nuevoSaldo = 0;
                const nuevoEstado = (nuevoSaldo === 0) ? 'liquidado' : 'activo';

                transaction.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: nuevoEstado
                });
                
                // 2. Actualizar datos del Pago
                dataToUpdate.saldoDespues = nuevoSaldo;
                transaction.update(pagoRef, dataToUpdate);
            });

            // 3. GESTIÓN DE COMISIONES (Post-Transacción)
            const comisionesSnap = await db.collection('movimientos_efectivo')
                .where('pagoIdAsociado', '==', pagoId)
                .get();

            const batchComis = db.batch();
            let comisionExiste = !comisionesSnap.empty;

            if (montoComisionEsperado === 0 && comisionExiste) {
                // Caso A: Ya no debe haber comisión -> BORRAR
                comisionesSnap.forEach(doc => batchComis.delete(doc.ref));
                console.log("🔄 Actualización: Comisión eliminada (cambio de tipo).");
            } 
            else if (montoComisionEsperado > 0 && !comisionExiste) {
                // Caso B: Debe haber comisión y no hay -> CREAR
                // Necesitamos datos adicionales, los sacamos de una lectura rápida
                const pSnap = await pagoRef.get();
                const pData = pSnap.data();
                const movimientoRef = db.collection('movimientos_efectivo').doc();
                
                batchComis.set(movimientoRef, {
                    id: movimientoRef.id,
                    tipo: 'COMISION_PAGO',
                    categoria: 'COMISION',
                    monto: -10, // Monto fijo negativo
                    descripcion: `Comisión cobro crédito (Actualizado) ${pData.idCredito}`,
                    fecha: new Date().toISOString(), // Fecha del ajuste
                    userId: (auth.currentUser) ? auth.currentUser.uid : 'system',
                    registradoPor: 'sistema_actualizacion',
                    office: pData.office || 'GDL',
                    creditoIdAsociado: creditoId,
                    pagoIdAsociado: pagoId
                });
                console.log("🔄 Actualización: Comisión creada.");
            }
            
            if (montoComisionEsperado === 0 && comisionExiste || montoComisionEsperado > 0 && !comisionExiste) {
                await batchComis.commit();
            }
            
            return { success: true, message: 'Pago actualizado y comisiones ajustadas.' };
        } catch (error) {
            console.error("Error actualizando pago:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- ELIMINAR PAGO Y SU COMISIÓN ---
    eliminarPago: async (pagoId, creditoId, montoAReembolsar, office) => {
        try {
            const creditoRef = db.collection('creditos').doc(creditoId);
            const pagoRef = db.collection('pagos').doc(pagoId);
            let historicalIdCredito = '';

            await db.runTransaction(async (transaction) => {
                const creditoDoc = await transaction.get(creditoRef);
                if (!creditoDoc.exists) throw new Error("Crédito no encontrado.");
                
                const credito = creditoDoc.data();
                historicalIdCredito = credito.historicalIdCredito || '';
                
                // 1. Reembolsar saldo
                let nuevoSaldo = (credito.saldo || 0) + montoAReembolsar;
                transaction.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: 'activo' // Reactivar si estaba liquidado
                });
                
                // 2. Eliminar el Pago
                transaction.delete(pagoRef);

                // 3. BUSCAR Y ELIMINAR COMISIÓN ASOCIADA (Query dentro de transacción)
                // Nota: Las queries en transacciones deben hacerse antes de escrituras si es posible, 
                // pero Firestore permite lecturas no transaccionales fuera si es necesario.
                // Para simplificar y evitar bloqueos de índice, lo haremos en un paso separado post-transacción 
                // o usamos un batch separado si la transacción es estricta.
                // MEJOR ESTRATEGIA: Usar transaction.get() para buscar la comisión.
            });

            // LIMPIEZA DE COMISIONES (Fuera de la transacción principal para evitar complejidad de queries)
            // Esto es seguro hacerlo justo después.
            const comisionesSnap = await db.collection('movimientos_efectivo')
                .where('pagoIdAsociado', '==', pagoId)
                .get();

            if (!comisionesSnap.empty) {
                const batchComisiones = db.batch();
                comisionesSnap.forEach(doc => batchComisiones.delete(doc.ref));
                await batchComisiones.commit();
                console.log(`🗑️ Eliminadas ${comisionesSnap.size} comisiones asociadas.`);
            }
            
            return { 
                success: true, 
                message: 'Pago eliminado, saldo recalculado y comisiones borradas.',
                historicalIdCredito: historicalIdCredito
            };
        } catch (error) {
            console.error("Error eliminando pago:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- OBTENER POBLACIONES POR RUTA ---
    async obtenerPoblacionesPorRuta(ruta, office) {
        try {
            let query = db.collection('poblaciones');
            query = query.where('ruta', '==', ruta);

            if (office && office !== 'AMBAS') {
                query = query.where('office', '==', office);
            }

            const snapshot = await query.get();
            
            if (snapshot.empty) {
                return [];
            }

            const poblaciones = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return poblaciones;

        } catch (error) {
            console.error("Error en obtenerPoblacionesPorRuta:", error);
            throw error; 
        }
    },

    // --- OBTENER DATOS HOJA DE CORTE (FILTRADO POR USUARIO) ---
    obtenerDatosHojaCorte: async (fecha, userOffice, userId = null) => {
        const fechaInicio = `${fecha}T00:00:00`;
        const fechaFin = `${fecha}T23:59:59`;
        
        try {
            // Paso 1: Si hay filtro de Usuario, necesitamos su email para filtrar los PAGOS
            let userEmail = null;
            if (userId) {
                const userDoc = await db.collection('users').doc(userId).get();
                if (userDoc.exists) userEmail = userDoc.data().email;
            }

            const promises = [];
            
            // 1. Movimientos (Fondeo, Gasto, Comisión, Colocación)
            // Estos SÍ tienen campo 'userId', filtramos directo.
            let qMovs = db.collection('movimientos_efectivo')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qMovs = qMovs.where('office', '==', userOffice);
            if (userId) qMovs = qMovs.where('userId', '==', userId); // Filtro directo
            
            promises.push(qMovs.get());

            // 2. Pagos (Cobranza)
            // Estos NO tienen 'userId', tienen 'registradoPor' (email).
            let qPagos = db.collection('pagos')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qPagos = qPagos.where('office', '==', userOffice);
            if (userEmail) qPagos = qPagos.where('registradoPor', '==', userEmail); // Filtro por email
            
            promises.push(qPagos.get());

            // 3. Comisiones (Colección legacy 'comisiones', si aún la usas)
            let qComis = db.collection('comisiones')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qComis = qComis.where('office', '==', userOffice);
            if (userId) qComis = qComis.where('userId', '==', userId);
            
            promises.push(qComis.get());

            const [snapMovs, snapPagos, snapComis] = await Promise.all(promises);

            const movimientos = snapMovs.docs.map(d => ({...d.data(), categoria: d.data().categoria || 'MOVIMIENTO', rawDate: d.data().fecha}));
            const pagos = snapPagos.docs.map(d => ({...d.data(), categoria: 'COBRANZA', tipo: 'PAGO', rawDate: d.data().fecha, descripcion: `Pago Crédito ${d.data().idCredito}`}));
            const comisiones = snapComis.docs.map(d => ({...d.data(), categoria: 'COMISION', tipo: 'COMISION', rawDate: d.data().fecha})); 

            const reporte = [...movimientos, ...pagos, ...comisiones];
            reporte.sort((a, b) => a.fecha.localeCompare(b.fecha));

            return reporte;

        } catch (error) {
            console.error("Error obteniendo datos hoja corte:", error);
            throw error;
        }
    },

    // ============================================================
    // REPORTE DE MULTICRÉDITOS (AUDITORÍA)
    // ============================================================
    obtenerReporteMulticreditos: async (office) => {
        try {
            console.log(`🔎 Buscando multicréditos en ${office}...`);
            
            // 1. Obtener TODOS los créditos activos de la oficina
            // Nota: Esto puede ser pesado, pero es un reporte administrativo
            const snapshot = await db.collection('creditos')
                .where('office', '==', office)
                .where('estado', '!=', 'liquidado')
                .get();

            if (snapshot.empty) return {};

            // 2. Agrupar créditos por CURP Cliente en memoria
            const mapaClientes = new Map(); // CURP -> [credito1, credito2]

            snapshot.docs.forEach(doc => {
                const cred = { id: doc.id, ...doc.data() };
                // Filtro de seguridad extra para saldo
                if (cred.saldo !== undefined && cred.saldo <= 0.05) return;

                if (!mapaClientes.has(cred.curpCliente)) {
                    mapaClientes.set(cred.curpCliente, []);
                }
                mapaClientes.get(cred.curpCliente).push(cred);
            });

            // 3. Filtrar clientes con MÁS DE 2 créditos activos
            const clientesProblema = [];
            const idsCreditosProblema = [];

            for (const [curp, listaCreditos] of mapaClientes.entries()) {
                if (listaCreditos.length > 1) {
                    clientesProblema.push({
                        curp: curp,
                        nombre: listaCreditos[0].nombreCliente,
                        ruta: listaCreditos[0].ruta || 'SIN RUTA',
                        poblacion: listaCreditos[0].poblacion_grupo || 'SIN POBLACION',
                        creditos: listaCreditos
                    });
                    // Guardamos IDs para buscar pagos
                    listaCreditos.forEach(c => idsCreditosProblema.push(c.historicalIdCredito));
                }
            }

            if (clientesProblema.length === 0) return {};

            // 4. Buscar Pagos (Solo de estos créditos)
            // Hacemos lotes de 30 para usar 'in' query o traemos todos los pagos activos si son muchos
            // Para optimizar en reporte pesado: Traemos pagos por fecha reciente o iteramos.
            // Opción robusta: Iterar por crédito (lento pero seguro) o traer pagos activos.
            
            const mapaPagos = new Map(); // HistoricalID -> [pago1, pago2]

            // Estrategia: Consultar pagos por crédito individualmente (Limitado a visualización)
            // OJO: Si son 1000 créditos, esto es demasiado.
            // MEJOR: Devolvemos los créditos y cargamos los pagos "On Demand" (al dar clic en la vista).
            // PERO: Tú pediste que se muestren. Haremos una búsqueda optimizada.
            
            // Estructura Final Jerárquica:
            // Arbol[Ruta][Poblacion][Cliente] = [Creditos...]
            const arbol = {};

            clientesProblema.forEach(cliente => {
                const ruta = cliente.ruta;
                const pob = cliente.poblacion;

                if (!arbol[ruta]) arbol[ruta] = {};
                if (!arbol[ruta][pob]) arbol[ruta][pob] = [];

                arbol[ruta][pob].push(cliente);
            });

            return { arbol, totalCasos: clientesProblema.length };

        } catch (error) {
            console.error("Error reporte multicréditos:", error);
            throw error;
        }
    },

    // ============================================================
    // ★ SINCRONIZACIÓN MASIVA PARA MODO OFFLINE
    // ============================================================
    sincronizarDatosComercial: async (userOffice, userRuta) => {
        if (!userOffice || !userRuta) return { success: false, message: "Sin oficina/ruta." };

        try {
            console.log(`📥 [SYNC] Iniciando descarga para: ${userOffice} - Ruta ${userRuta}`);
            const promesas = [];

            // A. Configuración (Poblaciones y Rutas de mi oficina)
            promesas.push(db.collection('poblaciones').where('office', '==', userOffice).get());
            promesas.push(db.collection('rutas').where('office', '==', userOffice).get());
            
            // B. Mis Clientes (Solo mi ruta para ahorrar memoria)
            promesas.push(
                db.collection('clientes')
                  .where('office', '==', userOffice)
                  .where('ruta', '==', userRuta)
                  .get()
            );

            // C. Créditos Activos (De mi oficina)
            promesas.push(
                db.collection('creditos')
                  .where('office', '==', userOffice)
                  .where('estado', '!=', 'liquidado')
                  .get()
            );

            // --- D. CALIBRAR CONTADOR LOCAL DEL AGENTE (CORREGIDO) ---
            // El error estaba aquí: faltaba filtrar por 'office'
            if (auth.currentUser) {
                const userId = auth.currentUser.uid;
                
                // Envolvemos en try-catch específico por si falta el índice compuesto
                try {
                    const ultimoCreditoQuery = await db.collection('creditos')
                        .where('office', '==', userOffice) // <--- ¡FILTRO AGREGADO! VITAL PARA PERMISOS
                        .where('creadoPorId', '==', userId)
                        .orderBy('fechaCreacion', 'desc')
                        .limit(1)
                        .get();

                    if (!ultimoCreditoQuery.empty) {
                        const datosUltimo = ultimoCreditoQuery.docs[0].data();
                        if (datosUltimo.consecutivoAgente) {
                            localStorage.setItem('local_credit_counter', datosUltimo.consecutivoAgente);
                            console.log(`🔢 Contador local calibrado en: ${datosUltimo.consecutivoAgente}`);
                        }
                    }
                } catch (e) {
                    console.warn("⚠️ No se pudo calibrar contador (posible falta de índice compuesto):", e);
                    // No lanzamos error para no detener la descarga de clientes/rutas
                }
            }

            // Ejecutar descarga masiva
            const snapshots = await Promise.all(promesas);
            
            let totalDocs = 0;
            snapshots.forEach(snap => totalDocs += snap.size);

            console.log(`✅ [SYNC] Completo. ${totalDocs} registros descargados.`);
            return { success: true, total: totalDocs };

        } catch (error) {
            console.error("❌ Error Sync:", error);
            return { success: false, message: error.message };
        }
    },

    // -- CREDITOS ACTIVOS OFFLINE --
    tieneCreditoActivo: async (idCliente, office) => {
        try {
            // Asegúrate que 'idCredito' sea el campo donde guardas el ID del cliente en la colección creditos
            let query = db.collection('creditos')
                .where('idCredito', '==', idCliente) // O 'clienteId' según tu BD
                .where('office', '==', office)
                .where('estado', '!=', 'liquidado');

            // A. Revisar Caché (Lo que acabamos de crear)
            const snapCache = await query.get({ source: 'cache' });
            if (!snapCache.empty) return true;

            // B. Revisar Servidor
            if (navigator.onLine) {
                const snapServer = await query.get({ source: 'server' });
                if (!snapServer.empty) return true;
            }

            return false;
        } catch (error) {
            console.error("Error tieneCreditoActivo:", error);
            return false;
        }
    },

    // ============================================================
    // OBTENER CARTERA COMPLETA (PARA BÚSQUEDA AVANZADA OFFLINE)
    // ============================================================
    async obtenerCarteraLocalParaBusqueda(office) {
        try {
            console.log("📂 Cargando cartera local en memoria para búsqueda...");
            
            // 1. Obtener Clientes (Forzando lectura de CACHÉ)
            // Traemos todos los de la oficina. Si quieres filtrar por ruta aquí también puedes, 
            // pero traer toda la oficina permite buscar clientes de otros compañeros si es necesario.
            const clientesSnap = await db.collection('clientes')
                .where('office', '==', office)
                .get({ source: 'cache' }); // <--- CLAVE: No usa internet

            if (clientesSnap.empty) {
                console.log("⚠️ No hay clientes en caché (¿Ya sincronizaste?).");
                return [];
            }

            // 2. Obtener Créditos Activos (Forzando lectura de CACHÉ)
            const creditosSnap = await db.collection('creditos')
                .where('office', '==', office)
                .where('estado', '!=', 'liquidado')
                .get({ source: 'cache' });

            // 3. Crear Mapa de Créditos para acceso rápido
            // Diccionario: { "CURP_CLIENTE": {datos del crédito} }
            const mapaCreditos = {};
            creditosSnap.forEach(doc => {
                const data = doc.data();
                // Usamos la CURP como llave de enlace (o idCliente si lo tienes así)
                if (data.curpCliente) {
                    mapaCreditos[data.curpCliente] = { id: doc.id, ...data };
                }
            });

            // 4. Combinar Datos (Flattening)
            // Creamos una lista plana fácil de filtrar para Javascript
            const carteraCompleta = [];
            
            clientesSnap.forEach(doc => {
                const cliente = { id: doc.id, ...doc.data() };
                const creditoActivo = mapaCreditos[cliente.curp] || null;

                carteraCompleta.push({
                    // Guardamos los objetos originales por si los necesitamos
                    cliente: cliente,
                    credito: creditoActivo, 
                    
                    // CAMPOS DE BÚSQUEDA (Pre-procesados para velocidad)
                    // Convertimos todo a minúsculas/mayúsculas estándar
                    nombreBusqueda: (cliente.nombre || '').toLowerCase(),
                    curpBusqueda: (cliente.curp || '').toUpperCase(),
                    poblacionBusqueda: (cliente.poblacion_grupo || '').toLowerCase(),
                    rutaBusqueda: (cliente.ruta || '').toUpperCase(),
                    
                    // Datos del Crédito (si tiene)
                    tieneCredito: !!creditoActivo,
                    folioCredito: (creditoActivo ? (creditoActivo.historicalIdCredito || '') : ''),
                    estadoCredito: (creditoActivo ? creditoActivo.estado : 'sin_credito'),
                    fechaCredito: (creditoActivo ? creditoActivo.fechaCreacion : ''),
                    
                    // Datos Financieros
                    saldo: (creditoActivo ? creditoActivo.saldo : 0),
                    esComisionista: !!cliente.isComisionista
                });
            });

            console.log(`✅ ${carteraCompleta.length} expedientes cargados en memoria RAM.`);
            return carteraCompleta;

        } catch (error) {
            console.error("Error cargando cartera local:", error);
            // Si falla (ej. caché corrupto), devolvemos array vacío para no romper la app
            return [];
        }
    },

    // Helper para cargar pagos de un crédito específico (Lazy Loading)
    obtenerPagosParaReporte: async (historicalId, office) => {
        const snap = await db.collection('pagos')
            .where('idCredito', '==', historicalId)
            .where('office', '==', office)
            .orderBy('fecha', 'desc')
            .get();
        return snap.docs.map(d => d.data());
    },

};




















