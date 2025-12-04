// =============================================
// CAPA DE SERVICIO DE FIREBASE (database.js) - CORREGIDO COMPLETO
// =============================================

/**
CONVERTIR A FECHA LOCAL
**/
const database = {
    obtenerFechaLocalISO: () => {
        const now = new Date();
        const timezoneOffset = now.getTimezoneOffset() * 60000;
        const localDate = new Date(now.getTime() - timezoneOffset);
        return localDate.toISOString().slice(0, -1); 
    },

/**
 * Parsea de forma robusta una fecha desde un string de importación.
 * Intenta varios formatos comunes (D-M-Y, Y-M-D, M-D-Y) para máxima compatibilidad.
 * @param {string} fechaStr La cadena de texto de la fecha.
 * @returns {string|null} Un string en formato ISO 8601 válido o null si el formato es incorrecto.
 */
function _parsearFechaImportacion(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') return null;

    const fechaTrimmed = fechaStr.trim();

    // Intenta parsear directamente si es un formato estándar (ISO, YYYY-MM-DD)
    let fecha = new Date(fechaTrimmed);
    if (!isNaN(fecha.getTime())) {
        if (fecha.getFullYear() > 1970 && (fechaTrimmed.includes('-') || fechaTrimmed.includes('/'))) {
            if (fechaTrimmed.includes('-')) {
                const parts = fechaTrimmed.split('-');
                if (parts.length === 3 && parseInt(parts[0], 10) === fecha.getFullYear()) {
                    // Formato YYYY-MM-DD
                    if (parseInt(parts[1], 10) === fecha.getMonth() + 1 && parseInt(parts[2], 10) === fecha.getDate()) {
                        return fecha.toISOString();
                    }
                }
            } else if (fechaTrimmed.includes('/')) {
                const parts = fechaTrimmed.split('/');
                if (parts.length === 3) {
                    // Asumir MM/DD/YYYY si el primero es <= 12
                    if (parseInt(parts[0], 10) <= 12 && parseInt(parts[0], 10) === fecha.getMonth() + 1 && parseInt(parts[1], 10) === fecha.getDate()) {
                        return fecha.toISOString();
                    }
                    // Asumir DD/MM/YYYY si el segundo es <= 12
                    if (parseInt(parts[1], 10) <= 12 && parseInt(parts[1], 10) === fecha.getMonth() + 1 && parseInt(parts[0], 10) === fecha.getDate()) {
                        const dia = parseInt(parts[0], 10);
                        const mes = parseInt(parts[1], 10);
                        const anio = parseInt(parts[2], 10);
                        if (anio > 1970 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
                            const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));
                            if (!isNaN(fechaUTC.getTime()) && fechaUTC.getUTCDate() === dia) {
                                return fechaUTC.toISOString();
                            }
                        }
                    }
                }
            }
        }
    }

    // Si el parseo directo falló o fue ambiguo, intentar formatos específicos DD-MM-YYYY, YYYY-MM-DD, MM-DD-YYYY
    const separador = fechaTrimmed.includes('/') ? '/' : '-';
    const partes = fechaTrimmed.split(separador);
    if (partes.length !== 3) return null;

    const [p1, p2, p3] = partes.map(p => parseInt(p, 10));
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;

    let anio, mes, dia;

    // Prioridad DD-MM-YYYY
    if (p3 > 1000 && p1 <= 31 && p2 <= 12) { anio = p3; dia = p1; mes = p2; }
    // Formato YYYY-MM-DD
    else if (p1 > 1000 && p2 <= 12 && p3 <= 31) { anio = p1; mes = p2; dia = p3; }
    // Formato MM-DD-YYYY
    else if (p3 > 1000 && p1 <= 12 && p2 <= 31) { anio = p3; mes = p1; dia = p2; }
    else { return null; }

    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

    fecha = new Date(Date.UTC(anio, mes - 1, dia));

    if (isNaN(fecha.getTime()) || fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
        console.warn(`Fecha inválida (post-parseo): ${fechaStr} -> ${anio}-${mes}-${dia}`);
        return null;
    }

    return fecha.toISOString();
}

// Función auxiliar para parsear fechas de forma segura (usada internamente por database.js)
function parsearFecha(fechaInput) {
    if (!fechaInput) return null;
    if (fechaInput instanceof Date) return fechaInput;
    if (typeof fechaInput === 'object' && typeof fechaInput.toDate === 'function') return fechaInput.toDate(); // Timestamps Firestore

    if (typeof fechaInput === 'string') {
        const fechaStr = fechaInput.trim();
        // Prioridad ISO 8601
        if (fechaStr.includes('T') && fechaStr.includes('Z') && fechaStr.length >= 20) {
            const fecha = new Date(fechaStr);
            if (!isNaN(fecha.getTime())) return fecha;
        }
        // Intentar con la función robusta
        const fechaISO = _parsearFechaImportacion(fechaStr);
        if (fechaISO) {
            const fecha = new Date(fechaISO);
            if (!isNaN(fecha.getTime())) return fecha;
        }
        // Fallback directo (menos fiable)
        const fechaDirecta = new Date(fechaStr);
        if (!isNaN(fechaDirecta.getTime()) && fechaDirecta.getFullYear() > 1970) {
            console.warn("Parseo directo usado como fallback:", fechaInput);
            return fechaDirecta;
        }
    }
    console.error("No se pudo parsear fecha interna:", fechaInput);
    return null;
}

const database = {
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
            const users = snapshot.docs.map(doc => doc.data());
            return { success: true, data: users };
        } catch (error) {
            if (error.code === 'permission-denied') {
                console.log("Info: Usuario actual no tiene permiso para listar usuarios (normal para agentes).");
                return { success: false, data: [], message: "Sin permisos" };
            }
            console.warn("Error obtenerUsuarios:", error);
            return { success: false, message: error.message, data: [] };
        }
    },

    // --- OBTENER USUARIOS POR ID ---
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
            // AHORA USA 'office', ASIGNA 'AMBAS' SI FALTA
            if (!userData.office) {
                console.warn(`Usuario ${uid} no tiene 'office' definida. Asignando 'AMBAS' por defecto.`);
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

    // --- DESHABILITAR USUARIOS ---
    deshabilitarUsuario: async (uid) => {
        try {
            await db.collection('users').doc(uid).update({ status: 'disabled' });
            return { success: true, message: 'Usuario deshabilitado en Firestore.' };
        } catch (error) {
            console.error("Error deshabilitando usuario:", error);
            return { success: false, message: `Error al deshabilitar: ${error.message}` };
        }
    },

    // --- OBTENER CLIENTES POR ID ---
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

    // --- ACTUALIZAR CLIENTES ---
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

    // --- ELIMINAR CLIENTE ---
    eliminarCliente: async (id) => {
        try {
            await db.collection('clientes').doc(id).delete();
            return { success: true, message: 'Cliente eliminado.' };
        } catch (error) {
            console.error("Error eliminando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- BUSCAR CLIENTES POR CURP ---
    buscarClientePorCURP: async (curp, userOffice = null) => {
        try {
            let query = db.collection('clientes').where('curp', '==', curp.toUpperCase());

            if (userOffice && userOffice !== 'AMBAS') {
                query = query.where('office', '==', userOffice);
            }

            const snapshot = await query.limit(1).get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error buscando cliente por CURP:", error);
            return null;
        }
    },

    // --- BUSCAR CLIENTES POR CURPS 2 ---
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

    // --- AGREGAR CLIENTES NUEVOS ---
    async agregarCliente(clienteData, userEmail) {
        try {
            const existingCliente = await this.buscarClientePorCURP(clienteData.curp);
            if (existingCliente) {
                return { success: false, message: 'El cliente con esta CURP ya existe.' };
            }

            // --- USAR FECHA LOCAL ---
            const fechaLocal = this.obtenerFechaLocalISO();
            
            const nuevoCliente = {
                ...clienteData,
                fechaRegistro: fechaLocal, // <--- CAMBIO
                fechaCreacion: fechaLocal, // <--- CAMBIO
                registradoPor: userEmail,
                fechaUltimaModificacion: fechaLocal
            };

            const docRef = await db.collection('clientes').add(nuevoCliente);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error("Error agregando cliente:", error);
            return { success: false, message: error.message };
        }
    },

    // --- BUSCAR CLIENTES ---
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

    // --- BUSCAR CREDITOS POR CLIENTE ---
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

    // --- BUSCAR CREDITOS POR ID HISTORICO ---
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

    // --- BUSCAR CREDITO POR ID ---
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

    // --- BUSCAR CREDITOS ---
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

    // --- BUSCAR CREDITOS ACTIVOS POR CLIENTE ---
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

    // --- VERIFICAR ELEGIBILIDAD DE CLIENTE ---
    async verificarElegibilidadCliente(curp, office) {
        try {
            let query = db.collection('creditos')
                .where('curpCliente', '==', curp)
                .where('estado', '!=', 'liquidado');

            if (office && office !== 'AMBAS') {
                query = query.where('office', '==', office);
            }

            const creditosActivosSnapshot = await query.get();

            if (creditosActivosSnapshot.empty) {
                return { elegible: true, mensaje: "Cliente sin créditos activos.", esRenovacion: false };
            }

            const creditos = creditosActivosSnapshot.docs.map(doc => doc.data());
            creditos.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
            
            const creditoActual = creditos[0];
            const saldo = creditoActual.saldo !== undefined ? creditoActual.saldo : creditoActual.montoTotal;
            const montoTotal = creditoActual.montoTotal;
            const idCreditoVisual = creditoActual.historicalIdCredito || creditoActual.id;
            
            const porcentajePagado = montoTotal > 0 ? ((montoTotal - saldo) / montoTotal) : 0;

            if (porcentajePagado >= 0.80) {
                return { 
                    elegible: true, 
                    mensaje: `Crédito activo (${idCreditoVisual}) al ${(porcentajePagado*100).toFixed(1)}%. Elegible para RENOVACIÓN.`, 
                    esRenovacion: true,
                    datosCreditoAnterior: creditoActual
                };
            } else {
                return { 
                    elegible: false, 
                    mensaje: `El cliente tiene el crédito activo ${idCreditoVisual} con saldo de $${saldo.toFixed(2)}. Solo ha liquidado el ${(porcentajePagado*100).toFixed(1)}% (Mínimo requerido: 80%).`,
                    esRenovacion: false
                };
            }

        } catch (error) {
            console.error("Error verificando cliente:", error);
            if (error.code === 'failed-precondition') {
                 console.warn("⚠️ FALTA ÍNDICE CLIENTE: Revisa la consola (F12) para el link.");
            }
            throw error; 
        }
    },

    // --- VERIFICAR ELEGIBILIDAD DE AVAL ---
    async verificarElegibilidadAval(curpAval, office) {
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
                const porcentajePagado = montoTotal > 0 ? (1 - (saldo / montoTotal)) : 0;
                const buenComportamiento = (credito.estado === 'al corriente' || credito.estado === 'adelantado');

                if (porcentajePagado < 0.80) {
                    return { 
                        elegible: false, 
                        message: `El aval ya garantiza el crédito activo ${credito.historicalIdCredito || ''} que solo lleva el ${(porcentajePagado*100).toFixed(0)}% pagado.` 
                    };
                }

                if (!buenComportamiento) {
                    return { 
                        elegible: false, 
                        message: `El aval garantiza el crédito ${credito.historicalIdCredito || ''} que tiene atrasos o mal comportamiento.` 
                    };
                }
            }

            return { elegible: true, message: "Aval elegible." };

        } catch (error) {
            console.error("Error verificando aval:", error);
            
            if (error.code === 'failed-precondition') {
                console.warn("⚠️ FALTA ÍNDICE: Abre la consola del navegador (F12) y haz clic en el enlace largo para crearlo.");
                return { elegible: false, message: "Falta crear un índice en la base de datos para esta consulta." };
            }
            
            return { elegible: false, message: `Error de permisos verificando aval: ${error.message}` };
        }
    },

    /**
     * Genera un nuevo crédito.
     * INCLUYE: Fecha Local, Póliza como Entrada y Comisiones.
     */
    async agregarCredito(creditoData, userEmail) {
        try {
            // 1. Validaciones
            const office = creditoData.office;
            if (!office || (office !== 'GDL' && office !== 'LEON')) {
                return { success: false, message: 'Error crítico: Oficina inválida.' };
            }

            if ((creditoData.tipo === 'renovacion' || creditoData.tipo === 'reingreso') && creditoData.plazo !== 14 && creditoData.plazo !== 13) {
                return { success: false, message: 'Plazo no permitido para renovación.' };
            }
            
            const elegibilidadCliente = await this.verificarElegibilidadCliente(creditoData.curpCliente, office);
            if (!elegibilidadCliente.elegible) return { success: false, message: elegibilidadCliente.mensaje };
            
            if (creditoData.curpAval) {
                const elegibilidadAval = await this.verificarElegibilidadAval(creditoData.curpAval, office); 
                if (!elegibilidadAval.elegible) return { success: false, message: `Problema con el Aval: ${elegibilidadAval.message}` };
            }
            
            const cliente = await this.buscarClientePorCURP(creditoData.curpCliente, office); 
            if (!cliente) return { success: false, message: "Cliente no encontrado." };
            
            if (creditoData.plazo === 10 && !cliente.isComisionista) {
                return { success: false, message: "Solo comisionistas pueden acceder a 10 semanas." };
            }
            
            // 2. Datos del Crédito (USANDO FECHA LOCAL)
            const fechaCreacionISO = this.obtenerFechaLocalISO(); // <--- CAMBIO DE FECHA
            
            const nuevoCreditoData = {
                monto: parseFloat(creditoData.monto),
                plazo: parseInt(creditoData.plazo),
                tipo: creditoData.tipo,
                montoTotal: parseFloat(creditoData.montoTotal),
                saldo: parseFloat(creditoData.saldo),
                curpCliente: creditoData.curpCliente.toUpperCase(),
                curpAval: (creditoData.curpAval || '').toUpperCase(),
                nombreAval: creditoData.nombreAval || '',
                office: cliente.office,
                poblacion_grupo: cliente.poblacion_grupo,
                ruta: cliente.ruta,
                estado: 'al corriente',
                fechaCreacion: fechaCreacionISO,
                creadoPor: userEmail,
                busqueda: [
                    creditoData.curpCliente.toUpperCase(),
                    (creditoData.curpAval || '').toUpperCase()
                ]
            };

            // 3. Referencias
            const contadorRef = db.doc(`contadores/${office}`);
            const nuevoCreditoRef = db.collection('creditos').doc();

            // 4. Saldo Anterior
            let saldoCreditoAnterior = 0;
            let creditoAnteriorRef = null;
            
            if (elegibilidadCliente.esRenovacion && elegibilidadCliente.datosCreditoAnterior) {
                const creditoAnterior = elegibilidadCliente.datosCreditoAnterior;
                if (creditoAnterior.id !== nuevoCreditoRef.id) {
                    saldoCreditoAnterior = creditoAnterior.saldo !== undefined ? creditoAnterior.saldo : creditoAnterior.montoTotal;
                    creditoAnteriorRef = db.collection('creditos').doc(creditoAnterior.id);
                }
            }

            // 5. Cálculos
            const esCreditoComisionista = (creditoData.plazo === 10 && cliente.isComisionista);
            let montoPolizaDeduccion = 0;
            if (!esCreditoComisionista) montoPolizaDeduccion = 100; 
            
            const montoEfectivoEntregado = nuevoCreditoData.monto - montoPolizaDeduccion - saldoCreditoAnterior;

            // 6. Transacción
            let nuevoHistoricalId = null; 

            await db.runTransaction(async (transaction) => {
                const contadorDoc = await transaction.get(contadorRef);
                let ultimoId = (!contadorDoc.exists) ? ((office === 'GDL') ? 30000000 : 20000000) : contadorDoc.data().ultimoId;
                nuevoHistoricalId = ultimoId + 1;
                transaction.set(contadorRef, { ultimoId: nuevoHistoricalId }, { merge: true });

                nuevoCreditoData.historicalIdCredito = String(nuevoHistoricalId);
                nuevoCreditoData.busqueda.push(String(nuevoHistoricalId));
                transaction.set(nuevoCreditoRef, nuevoCreditoData);

                if (creditoAnteriorRef) {
                    transaction.update(creditoAnteriorRef, {
                        estado: 'liquidado',
                        saldo: 0,
                        fechaLiquidacion: fechaCreacionISO,
                        nota: `Renovado por ${nuevoHistoricalId}`
                    });
                }

                // a. Registrar SALIDA TOTAL (Monto solicitado)
                const salidaBruta = montoEfectivoEntregado + montoPolizaDeduccion;

                const movimientoEfectivo = {
                    userId: (await auth.currentUser).uid,
                    fecha: fechaCreacionISO,
                    tipo: 'COLOCACION',
                    categoria: 'COLOCACION',
                    monto: -Math.abs(salidaBruta), // NEGATIVO
                    descripcion: `Colocación a ${cliente.nombre} (${nuevoHistoricalId})`,
                    creditoId: nuevoCreditoRef.id,
                    registradoPor: userEmail,
                    office: office
                };
                const movimientoRef = db.collection('movimientos_efectivo').doc();
                transaction.set(movimientoRef, movimientoEfectivo);

                // b. Registrar ENTRADA PÓLIZA (+$100)
                if (montoPolizaDeduccion > 0) {
                    const polizaData = {
                        userId: (await auth.currentUser).uid,
                        fecha: fechaCreacionISO,
                        tipo: 'INGRESO_POLIZA', 
                        categoria: 'ENTREGA_INICIAL', 
                        monto: montoPolizaDeduccion, // POSITIVO
                        descripcion: `Cobro de Póliza - Crédito ${nuevoHistoricalId}`,
                        creditoId: nuevoCreditoRef.id,
                        registradoPor: userEmail,
                        office: office
                    };
                    const polizaRef = db.collection('movimientos_efectivo').doc();
                    transaction.set(polizaRef, polizaData);
                }

                // c. Registrar COMISIÓN VENDEDOR (-$100)
                if (!esCreditoComisionista) {
                    const comisionData = {
                        userId: (await auth.currentUser).uid,
                        fecha: fechaCreacionISO,
                        tipo: 'COMISION_COLOCACION',
                        categoria: 'COMISION',
                        monto: -100, // NEGATIVO (Salida)
                        descripcion: `Comisión colocación ${cliente.nombre} (${nuevoHistoricalId})`,
                        creditoId: nuevoCreditoRef.id,
                        registradoPor: userEmail,
                        office: office
                    };
                    const comisionRef = db.collection('movimientos_efectivo').doc();
                    transaction.set(comisionRef, comisionData);
                }
            }); 
            
            return { 
                success: true, 
                message: 'Crédito generado exitosamente.', 
                data: { id: nuevoCreditoRef.id, historicalIdCredito: String(nuevoHistoricalId) } 
            };

        } catch (error) {
            console.error("Error agregando crédito:", error);
            return { success: false, message: `Error al generar crédito: ${error.message}` };
        }
    },

    // --- METODO DE PAGOS ---
    getPagosPorCredito: async (historicalIdCredito, office) => {
        try {
            if (!office || (office !== 'GDL' && office !== 'LEON')) {
                console.warn(`getPagosPorCredito fue llamado para ID ${historicalIdCredito} sin una 'office' (sucursal) válida. Devolviendo vacío.`);
                return [];
            }
            const snapshot = await db.collection('pagos')
                .where('idCredito', '==', historicalIdCredito)
                .where('office', '==', office)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error obteniendo pagos por historicalIdCredito (${historicalIdCredito}) y Office (${office}):`, error);
            return [];
        }
    },

    // --- PAGO POR ID HISTORICO ---
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

   // --- REGISTRAR PAGO ---
    async agregarPago(pagoData, emailUsuario, firestoreIdCredito) {
        try {
            const creditoRef = db.collection('creditos').doc(firestoreIdCredito);
            const pagosRef = db.collection('pagos').doc();
            const batch = db.batch();

            const doc = await creditoRef.get();
            if (!doc.exists) throw new Error("No se encontró el crédito.");
            const credito = doc.data();
            const saldoActual = credito.saldo !== undefined ? credito.saldo : credito.montoTotal;
            const officeCredito = credito.office || 'GDL';

            // --- USAR FECHA LOCAL ---
            const fechaISO = this.obtenerFechaLocalISO();
            
            const nuevoPago = {
                id: pagosRef.id,
                idCredito: pagoData.idCredito, 
                firestoreIdCredito: firestoreIdCredito,
                monto: parseFloat(pagoData.monto),
                fecha: fechaISO, // <--- CAMBIO
                tipoPago: pagoData.tipoPago || 'normal',
                registradoPor: emailUsuario,
                office: officeCredito, 
                origen: pagoData.origen || 'manual'
            };

            const nuevoSaldo = parseFloat((saldoActual - nuevoPago.monto).toFixed(2));

            batch.set(pagosRef, nuevoPago);
            batch.update(creditoRef, {
                saldo: nuevoSaldo,
                fechaUltimoPago: fechaISO,
                ...(nuevoSaldo < 0.05 ? { estado: 'liquidado' } : {})
            });

            if (pagoData.comisionGenerada && pagoData.comisionGenerada > 0) {
                const movimientoRef = db.collection('movimientos_efectivo').doc();
                const nuevaComision = {
                    id: movimientoRef.id,
                    tipo: 'COMISION_PAGO', 
                    categoria: 'COMISION', 
                    monto: -Math.abs(pagoData.comisionGenerada), 
                    descripcion: `Comisión cobro crédito ${pagoData.idCredito}`,
                    fecha: fechaISO, // <--- CAMBIO
                    userId: currentUserData ? currentUserData.id : null,
                    registradoPor: emailUsuario,
                    office: officeCredito,
                    creditoIdAsociado: firestoreIdCredito
                };
                batch.set(movimientoRef, nuevaComision);
            }

            await batch.commit();
            return { 
                success: true, 
                message: "Pago registrado correctamente",
                nuevoSaldo: nuevoSaldo,
                historicalIdCredito: pagoData.idCredito
            };

        } catch (error) {
            console.error("Error en agregarPago:", error);
            return { success: false, message: error.message };
        }
    },

    // --- IMPORTACIÓN MASIVA ---
    importarDatosDesdeCSV: async (csvData, tipo, office) => {
        const lineas = csvData.split('\n').filter(linea => linea.trim() && linea.includes(','));
        if (lineas.length === 0) return { success: true, total: 0, importados: 0, errores: [] };

        let errores = [];
        let importados = 0;
        let batch = db.batch();
        let batchCounter = 0;
        const MAX_BATCH_SIZE = 450; // Reducido un poco por seguridad (limite es 500)
        
        // 1. USAR FECHA LOCAL
        // const fechaImportacion = new Date().toISOString(); // <-- REEMPLAZADO
        const fechaImportacion = database.obtenerFechaLocalISO(); // <-- CORRECTO (Usa 'this.' si es método interno, o 'database.' si es externo)
        
        let cacheClientes = new Map();
        let cacheCreditos = new Map();

        // HELPER LOCAL PARA FECHAS (Blindado)
        const limpiarFecha = (fechaStr) => {
            if (!fechaStr) return database.obtenerFechaLocalISO();
            let str = fechaStr.trim();
            if (/^\d{8,15}$/.test(str)) return database.obtenerFechaLocalISO(); // Es un teléfono
            
            // Convertir DD-MM-YYYY a ISO Local
            if (str.includes('/') || str.includes('-')) {
                const p = str.split(/[-/]/);
                if (p.length === 3) {
                    // Asumimos DD-MM-YYYY
                    const dia = parseInt(p[0]);
                    const mes = parseInt(p[1]) - 1;
                    const anio = parseInt(p[2]);
                    if(anio > 1900) {
                        const fecha = new Date(anio, mes, dia);
                        // Ajuste manual a ISO local
                        const offset = fecha.getTimezoneOffset() * 60000;
                        return new Date(fecha.getTime() - offset).toISOString().slice(0, -1);
                    }
                }
            }
            // Intento directo
            const d = new Date(str);
            if (!isNaN(d.getTime())) return d.toISOString();
            return database.obtenerFechaLocalISO();
        };

        try {
            console.log(`Iniciando importación tipo ${tipo} para ${office}. Líneas: ${lineas.length}`);

            for (const [i, linea] of lineas.entries()) {
                const lineaNum = i + 1;
                // Ignorar encabezados
                if (linea.toLowerCase().includes('curp,') && linea.toLowerCase().includes('nombre,')) continue;

                const campos = linea.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

                if (tipo === 'clientes') {
                    if (campos.length < 5) { 
                        errores.push(`L${lineaNum}: Faltan columnas.`); 
                        continue; 
                    }
                    const curp = campos[0].toUpperCase();
                    if (!curp || curp.length < 10) { // Validación CURP más laxa para evitar saltar válidos cortos
                        errores.push(`L${lineaNum}: CURP inválido '${campos[0]}'`); 
                        continue; 
                    }
                    
                    const cacheKey = `${curp}_${office}`;
                    if (cacheClientes.has(cacheKey)) continue; // Ya procesado en este lote

                    // Validación inteligente de columnas invertidas
                    let tel = campos[4];
                    let fec = campos[5];
                    if (/^\d{10}$/.test(fec) && (String(tel).includes('/') || String(tel).includes('-'))) {
                         let t = tel; tel = fec; fec = t; // Swap
                    }

                    // Solo validamos duplicados en DB si es un lote pequeño o crítico
                    // Para velocidad masiva, a veces se omite, pero aquí lo dejaremos
                    /* const existe = await database.buscarClientePorCURP(curp);
                    if (existe && existe.office === office) {
                        cacheClientes.set(cacheKey, true);
                        continue;
                    }
                    */

                    const docRef = db.collection('clientes').doc();
                    batch.set(docRef, {
                        id: docRef.id,
                        curp: curp, 
                        nombre: campos[1] || 'SIN NOMBRE', 
                        domicilio: campos[2] || '',
                        cp: campos[3] || '', 
                        telefono: tel || '', 
                        fechaRegistro: limpiarFecha(fec),
                        fechaCreacion: limpiarFecha(fec), // Respaldo
                        poblacion_grupo: campos[6] || 'SIN GRUPO', 
                        office: office, 
                        ruta: campos[7] || '',
                        isComisionista: false, // Default
                        fechaImportacion: fechaImportacion, 
                        creadoPor: 'importacion_csv'
                    });
                    cacheClientes.set(cacheKey, true);
                    importados++;

                } else if (tipo === 'colocacion') {
                    // ... (Tu lógica de colocación está bien, solo usa limpiarFecha) ...
                    // Asegúrate de usar limpiarFecha(campos[3])
                    // Y database.obtenerFechaLocalISO() para fechas nuevas
                    
                    // ... (Lógica igual a la tuya pero con helper de fecha)
                    const curpCliente = campos[0].toUpperCase(); 
                    const idHistorico = campos[2] ? campos[2].toString().trim() : '';
                    
                    if (!idHistorico) continue;
                    
                    const docRef = db.collection('creditos').doc();
                    batch.set(docRef, {
                        id: docRef.id,
                        historicalIdCredito: idHistorico,
                        curpCliente: curpCliente,
                        nombreCliente: campos[1],
                        fechaCreacion: limpiarFecha(campos[3]),
                        tipo: campos[4] || 'nuevo',
                        monto: parseFloat(campos[5] || 0),
                        plazo: parseInt(campos[6] || 14),
                        montoTotal: parseFloat(campos[7] || 0),
                        curpAval: (campos[8] || '').toUpperCase(),
                        nombreAval: campos[9] || '',
                        poblacion_grupo: campos[10] || '',
                        ruta: campos[11] || '',
                        // Lógica de saldo inteligente
                        saldo: campos[12] ? parseFloat(campos[12]) : parseFloat(campos[7] || 0),
                        office: office,
                        estado: 'al corriente', // O calcular si saldo < total
                        busqueda: [curpCliente, idHistorico]
                    });
                    importados++;

                } else if (tipo === 'cobranza') {
                    // ... (Lógica de cobranza) ...
                    const idHistorico = campos[1];
                    if(!idHistorico) continue;

                    const docRef = db.collection('pagos').doc();
                    batch.set(docRef, {
                        id: docRef.id,
                        idCredito: idHistorico,
                        monto: parseFloat(campos[3] || 0),
                        fecha: limpiarFecha(campos[2]),
                        tipoPago: (campos[4] || 'normal').toLowerCase(),
                        poblacion_grupo: campos[5] || '',
                        ruta: campos[6] || '',
                        office: office, // Asumimos la oficina de carga
                        registradoPor: 'importacion_csv',
                        origen: 'csv'
                    });
                    importados++;
                }

                // Control de Lotes
                batchCounter++;
                if (batchCounter >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    console.log(`Lote guardado. Progreso: ${lineaNum}/${lineas.length}`);
                    batch = db.batch();
                    batchCounter = 0;
                    // Pequeña pausa para no saturar
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            // Guardar remanente
            if (batchCounter > 0) {
                await batch.commit();
            }

            return { success: true, total: lineas.length, importados: importados, errores: errores };

        } catch (error) {
            console.error("Error CRÍTICO:", error);
            return { success: false, message: error.message, errores: errores };
        }
    },

    // --- FUNCIONES DE REPORTES Y MANTENIMIENTO ---
    generarReportes: async (userOffice = null) => {
        try {
            let clientesQuery = db.collection('clientes');
            let creditosQuery = db.collection('creditos');
            let pagosQuery = db.collection('pagos');

            if (userOffice && userOffice !== 'AMBAS') {
                clientesQuery = clientesQuery.where('office', '==', userOffice);
                creditosQuery = creditosQuery.where('office', '==', userOffice);
                pagosQuery = pagosQuery.where('office', '==', userOffice);
            }

            const [clientesSnap, creditosSnap, pagosSnap] = await Promise.all([
                clientesQuery.get(), creditosQuery.get(), pagosQuery.get()
            ]);

            const clientes = clientesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const creditos = creditosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const pagos = pagosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const creditosActivosPendientes = creditos.filter(c => c.estado !== 'liquidado' && (c.saldo === undefined || c.saldo > 0.01));
            const totalCartera = creditosActivosPendientes.reduce((sum, c) => sum + (c.saldo || 0), 0);

            const hoy = new Date();
            const primerDiaMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
            const primerDiaMesSiguiente = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1));
            const pagosDelMes = pagos.filter(p => {
                const fechaPago = parsearFecha(p.fecha);
                return fechaPago && fechaPago >= primerDiaMes && fechaPago < primerDiaMesSiguiente;
            });
            const cobradoMes = pagosDelMes.reduce((sum, p) => sum + (p.monto || 0), 0);
            const totalComisionesMes = 0;
            const pagosMapSeguro = new Map();
            pagos.forEach(p => {
                const key = `${p.idCredito}_${p.office}`;
                if (!pagosMapSeguro.has(key)) pagosMapSeguro.set(key, []);
                pagosMapSeguro.get(key).push(p);
            });
            for (const [key, pagosCredito] of pagosMapSeguro.entries()) {
                pagosCredito.sort((a, b) => (parsearFecha(b.fecha)?.getTime() || 0) - (parsearFecha(a.fecha)?.getTime() || 0));
            }

            let totalVencidos = 0;
            creditosActivosPendientes.forEach(credito => {
                const historicalId = credito.historicalIdCredito || credito.id;
                const claveSegura = `${historicalId}_${credito.office}`;
                const pagosCreditoSeguro = pagosMapSeguro.get(claveSegura) || [];
                if (database.esCreditoVencido(credito, pagosCreditoSeguro).vencido) {
                    totalVencidos++;
                }
            });

            let cobroEsperadoMes = 0;
            creditosActivosPendientes.forEach(c => {
                if (c.montoTotal && c.plazo > 0) {
                    cobroEsperadoMes += (c.montoTotal / c.plazo) * 4;
                }
            });
            const tasaRecuperacion = cobroEsperadoMes > 0 ? Math.min(100, (cobradoMes / cobroEsperadoMes * 100)) : 0;

            return {
                totalClientes: clientes.length, 
                totalCreditos: creditosActivosPendientes.length, 
                totalCartera: totalCartera,
                totalVencidos: totalVencidos, 
                pagosRegistrados: pagosDelMes.length, 
                cobradoMes: cobradoMes,
                totalComisiones: totalComisionesMes,
                tasaRecuperacion: tasaRecuperacion
            };
        } catch (error) {
            console.error("Error generando reportes:", error);
            return { 
                totalClientes: 'Error', 
                totalCreditos: 'Error', 
                totalCartera: 'Error', 
                totalVencidos: 'Error', 
                pagosRegistrados: 'Error', 
                cobradoMes: 'Error', 
                totalComisiones: 'Error', 
                tasaRecuperacion: 0 
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
        console.log(`>>> obtenerPoblaciones (Corregido) llamada con office: ${office}`);
        try {
            let query = db.collection('poblaciones');
            
            if (office && office !== 'AMBAS') {
                console.log(`>>> Filtrando poblaciones por office: ${office}`);
                query = query.where('office', '==', office);
            } else {
                console.log(">>> Obteniendo todas las poblaciones (sin filtro office).");
            }
            
            const snapshot = await query.get();
            let poblacionesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`>>> Se obtuvieron ${poblacionesData.length} poblaciones.`);
            
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
        console.log(`>>> obtenerRutas (Corregido) llamada con office: ${office}`);
        try {
            let query = db.collection('rutas');
            
            if (office && office !== 'AMBAS') {
                console.log(`>>> Filtrando rutas por office: ${office}`);
                query = query.where('office', '==', office);
            } else {
                console.log(">>> Obteniendo todas las rutas.");
            }

            const snapshot = await query.get();
            let rutasData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`>>> Se obtuvieron ${rutasData.length} rutas en total.`);

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
               console.warn(">>> Firestore requiere un índice en 'movimientos_efectivo': userId ASC, office ASC, fecha DESC (o similar según la consulta)");
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
            if (error.message.includes("requires an index")) {
                console.warn(">>> Firestore requiere índices en 'movimientos_efectivo' Y 'comisiones': office(ASC), userId(ASC), fecha(DESC)");
            }
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

    // --- ELIMINAR CREDITO ---
    eliminarCredito: async (creditoId, historicalId, office) => {
        try {
            if (!creditoId || !historicalId || !office) {
                throw new Error("Datos insuficientes (creditoId, historicalId, office) para eliminar.");
            }
            
            const batch = db.batch();
            const creditoRef = db.collection('creditos').doc(creditoId);
            batch.delete(creditoRef);
            
            const pagosSnap = await db.collection('pagos')
                .where('idCredito', '==', historicalId)
                .where('office', '==', office)
                .get();
            pagosSnap.docs.forEach(doc => batch.delete(doc.ref));

            const comisionesSnap = await db.collection('comisiones')
                .where('creditoId', '==', creditoId)
                .get();
            comisionesSnap.docs.forEach(doc => batch.delete(doc.ref));
                
            const movimientosSnap = await db.collection('movimientos_efectivo')
                .where('creditoId', '==', creditoId)
                .get();
            movimientosSnap.docs.forEach(doc => batch.delete(doc.ref));

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

    // --- ACTUALIZAR PAGOS ---
    actualizarPago: async (pagoId, creditoId, dataToUpdate, diferenciaMonto) => {
        try {
            const creditoRef = db.collection('creditos').doc(creditoId);
            const pagoRef = db.collection('pagos').doc(pagoId);
            
            await db.runTransaction(async (transaction) => {
                const creditoDoc = await transaction.get(creditoRef);
                if (!creditoDoc.exists) throw new Error("Crédito no encontrado.");
                
                const credito = creditoDoc.data();
                let nuevoSaldo = (credito.saldo || 0) - diferenciaMonto;
                if (nuevoSaldo < 0.01) nuevoSaldo = 0;
                const nuevoEstado = (nuevoSaldo === 0) ? 'liquidado' : 'activo';

                transaction.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: nuevoEstado
                });
                
                dataToUpdate.saldoDespues = nuevoSaldo;
                transaction.update(pagoRef, dataToUpdate);
            });
            
            return { success: true, message: 'Pago actualizado.' };
        } catch (error) {
            console.error("Error actualizando pago:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // -- ELIMINAR PAGOS ---
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
                
                let nuevoSaldo = (credito.saldo || 0) + montoAReembolsar;
                
                transaction.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: 'activo'
                });
                
                transaction.delete(pagoRef);
            });
            
            return { 
                success: true, 
                message: 'Pago eliminado y saldo recalculado.',
                historicalIdCredito: historicalIdCredito
            };
        } catch (error) {
            console.error("Error eliminando pago:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- OBTENER POBLACIONES POR RUTA ---
    async obtenerPoblacionesPorRuta(ruta, office) {
        console.log(`📡 DB: Buscando poblaciones para Ruta: "${ruta}" en Oficina: "${office}"`);
        try {
            let query = db.collection('poblaciones');
            
            query = query.where('ruta', '==', ruta);

            if (office && office !== 'AMBAS') {
                query = query.where('office', '==', office);
            }

            const snapshot = await query.get();
            
            if (snapshot.empty) {
                console.warn("⚠️ DB: No se encontraron poblaciones para esta ruta.");
                return [];
            }

            const poblaciones = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            console.log(`✅ DB: ${poblaciones.length} poblaciones encontradas.`);
            return poblaciones;

        } catch (error) {
            console.error("❌ DB Error en obtenerPoblacionesPorRuta:", error);
            throw error; 
        }
    },

    // --- OBTENER DATOS DE HOJA DE CORTE ---
    obtenerDatosHojaCorte: async (fecha, userOffice, userId = null) => {
        const fechaInicio = new Date(fecha + 'T00:00:00Z').toISOString();
        const fechaFin = new Date(fecha + 'T23:59:59Z').toISOString();
        
        try {
            const promises = [];
            
            let qMovs = db.collection('movimientos_efectivo')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qMovs = qMovs.where('office', '==', userOffice);
            if (userId) qMovs = qMovs.where('userId', '==', userId);
            
            promises.push(qMovs.get());

            let qPagos = db.collection('pagos')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qPagos = qPagos.where('office', '==', userOffice);
            
            promises.push(qPagos.get());

            let qComis = db.collection('comisiones')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qComis = qComis.where('office', '==', userOffice);
            if (userId) qComis = qComis.where('userId', '==', userId);
            
            promises.push(qComis.get());

            const [snapMovs, snapPagos, snapComis] = await Promise.all(promises);
            const movimientos = snapMovs.docs.map(d => ({...d.data(), categoria: 'MOVIMIENTO', rawDate: d.data().fecha}));
            const pagos = snapPagos.docs.map(d => ({...d.data(), categoria: 'COBRANZA', tipo: 'PAGO', rawDate: d.data().fecha, descripcion: `Pago Crédito ${d.data().idCredito}`}));
            const comisiones = snapComis.docs.map(d => ({...d.data(), categoria: 'COMISION', tipo: 'COMISION', rawDate: d.data().fecha})); 

            return [...movimientos, ...pagos, ...comisiones];

        } catch (error) {
            console.error("Error obteniendo datos hoja corte:", error);
            return [];
        }
    },

};



