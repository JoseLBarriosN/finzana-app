// =============================================
// CAPA DE SERVICIO DE FIREBASE (database.js) - CORREGIDO COMPLETO
// =============================================

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

    // --- MÉTODOS DE USUARIOS ---
    obtenerUsuarios: async () => {
        try {
            const snapshot = await db.collection('users').get();
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, data: users };
        } catch (error) {
            console.error("Error obteniendo usuarios:", error);
            return { success: false, message: 'Error al obtener usuarios: ' + error.message };
        }
    },

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

    actualizarUsuario: async (uid, userData) => {
        try {
            const dataToUpdate = { ...userData };
            delete dataToUpdate.email;
            delete dataToUpdate.id;

            // AHORA VALIDA 'office'
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

    // --- MÉTODOS DE CLIENTES ---
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

    buscarClientePorCURP: async (curp, userOffice = null) => {
        try {
            let query = db.collection('clientes').where('curp', '==', curp.toUpperCase());

            // *** CORRECCIÓN: Aplicar filtro de sucursal ***
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
                // *** CORRECCIÓN: Aplicar filtro de sucursal ***
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

    agregarCliente: async (clienteData, userEmail) => {
        try {
            // No filtrar por sucursal aquí, la CURP debe ser única en el sistema
            const existe = await database.buscarClientePorCURP(clienteData.curp);
            if (existe) {
                return { success: false, message: `Ya existe cliente (${existe.nombre}) con CURP ${clienteData.curp} en ${existe.office}.` };
            }

            const dataToAdd = {
                ...clienteData,
                curp: clienteData.curp.toUpperCase(),
                fechaCreacion: new Date().toISOString(),
                creadoPor: userEmail,
                fechaRegistro: clienteData.fechaRegistro || new Date().toISOString()
            };

            const docRef = await db.collection('clientes').add(dataToAdd);
            return { success: true, message: 'Cliente registrado.', id: docRef.id };
        } catch (error) {
            console.error("Error agregando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    buscarClientes: async (filtros) => {
        try {
            let query = db.collection('clientes');

            // *** CORRECCIÓN: Priorizar filtro de sucursal del usuario ***
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
                    applyCurpInFilter = true; // Demasiados CURPs, filtrar en memoria
                }
            }

            const snapshot = await query.get();
            let clientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Filtrado en memoria
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

    // --- MÉTODOS DE CRÉDITOS ---
    buscarCreditosPorCliente: async (curp, userOffice = null) => { // <-- 1. Aceptar parámetro
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

            // *** CORRECCIÓN: Aplicar filtro de sucursal del usuario ***
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

            // *** CORRECCIÓN: Priorizar filtro de sucursal del usuario ***
            if (filtros.userOffice && filtros.userOffice !== 'AMBAS') {
                query = query.where('office', '==', filtros.userOffice);
            } else if (filtros.office) {
                query = query.where('office', '==', filtros.office);
            }

            // Estado se filtra mejor en app.js con _calcularEstadoCredito
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

    verificarElegibilidadCliente: async (curp) => {
        const creditoActivo = await database.buscarCreditoActivoPorCliente(curp);
        if (!creditoActivo) return { elegible: true }; // Elegible si no hay activo

        // Considerar elegible si el saldo es prácticamente cero
        if (creditoActivo.saldo !== undefined && creditoActivo.saldo <= 0.01) {
            return { elegible: true };
        }
        if (!creditoActivo.montoTotal || creditoActivo.montoTotal <= 0) {
            return { elegible: false, message: `Crédito activo ${creditoActivo.historicalIdCredito || creditoActivo.id} con datos inconsistentes.` };
        }
        const montoPagado = creditoActivo.montoTotal - (creditoActivo.saldo || 0); // Usar 0 si saldo es undefined
        const porcentajePagado = creditoActivo.montoTotal > 0 ? (montoPagado / creditoActivo.montoTotal) * 100 : 0;

        if (porcentajePagado >= 80) {
            return { elegible: true };
        } else {
            return { elegible: false, message: `Cliente con crédito activo (${creditoActivo.historicalIdCredito || creditoActivo.id}) pagado al ${porcentajePagado.toFixed(0)}%. Se requiere 80%.` };
        }
    },

    verificarElegibilidadAval: async (curpAval, office = null) => {
        if (!curpAval || curpAval.trim() === '') return { elegible: true };

        try {
            let query = db.collection('creditos').where('curpAval', '==', curpAval.toUpperCase());
            if (office && office !== 'AMBAS') {
                query = query.where('office', '==', office);
            }

            const snapshot = await query.get();

            if (snapshot.empty) return { elegible: true };

            for (const doc of snapshot.docs) {
                const credito = doc.data();
                if (credito.estado === 'liquidado' || (credito.saldo !== undefined && credito.saldo <= 0.01)) {
                    continue;
                }

                if (credito.saldo !== undefined && credito.saldo > 0.01) {
                    if (!credito.montoTotal || credito.montoTotal <= 0) {
                        return { elegible: false, message: `Aval respalda crédito ${credito.historicalIdCredito || doc.id} con datos inconsistentes.` };
                    }
                    const montoPagado = credito.montoTotal - credito.saldo;
                    const porcentajePagado = (montoPagado / credito.montoTotal) * 100;
                    if (porcentajePagado < 80) {
                        return { elegible: false, message: `Aval respalda crédito ${credito.historicalIdCredito || doc.id} (${porcentajePagado.toFixed(0)}% pagado). Se requiere 80% para avalar otro.` };
                    }
                }
            }
            return { elegible: true };
        } catch (error) {
            console.error("Error verificando elegibilidad del aval:", error);
            if (error.code === 'permission-denied') {
                 return { elegible: false, message: "Permisos insuficientes para verificar historial del aval en esta oficina." };
            }
            return { elegible: false, message: "Error al consultar BD para aval." };
        }
    },

    // Generar crédito
    agregarCredito: async (creditoData, userEmail) => {
        try {
            
            // 1. Validar la oficina (AHORA ES CRUCIAL PARA LAS REGLAS DE SEGURIDAD)
            const office = creditoData.office;
            if (!office || (office !== 'GDL' && office !== 'LEON')) {
                return { success: false, message: 'Oficina (GDL o LEON) no especificada en los datos del crédito. No se puede generar ID.' };
            }

            // 2. Validaciones de elegibilidad
            if ((creditoData.tipo === 'renovacion' || creditoData.tipo === 'reingreso') && creditoData.plazo !== 14) {
                return { success: false, message: 'Créditos de renovación/reingreso deben ser a 14 semanas.' };
            }
            
            // Validación Cliente
            const elegibilidadCliente = await database.verificarElegibilidadCliente(creditoData.curpCliente);
            if (!elegibilidadCliente.elegible) return { success: false, message: elegibilidadCliente.message };
            
            // =============================================================================
            // --- 🚀 CORRECCIÓN AQUÍ: Se agrega 'office' como segundo parámetro ---
            // Esto evita el error "Missing or insufficient permissions" en la DB
            // =============================================================================
            const elegibilidadAval = await database.verificarElegibilidadAval(creditoData.curpAval, office); 
            
            if (!elegibilidadAval.elegible) return { success: false, message: elegibilidadAval.message };
            
            const cliente = await database.buscarClientePorCURP(creditoData.curpCliente, office); 
            if (!cliente) return { success: false, message: "Cliente no encontrado en esta oficina." };
            
            if (creditoData.plazo === 10 && !cliente.isComisionista) {
                return { success: false, message: "Solo comisionistas pueden acceder a créditos de 10 semanas." };
            }
            
            // 3. Preparar los datos del crédito (sin el ID histórico todavía)
            const fechaCreacionISO = new Date().toISOString();
            const nuevoCreditoData = {
                monto: creditoData.monto,
                plazo: creditoData.plazo,
                tipo: creditoData.tipo,
                montoTotal: creditoData.montoTotal,
                saldo: creditoData.saldo,
                curpCliente: creditoData.curpCliente.toUpperCase(),
                curpAval: (creditoData.curpAval || '').toUpperCase(),
                nombreAval: creditoData.nombreAval,
                office: cliente.office,
                poblacion_grupo: cliente.poblacion_grupo,
                ruta: cliente.ruta,
                estado: 'activo',
                fechaCreacion: fechaCreacionISO,
                creadoPor: userEmail,
                // 'historicalIdCredito' se añadirá dentro de la transacción
            };

            // 4. Referencia al contador de la oficina correcta
            const contadorRef = db.doc(`contadores/${office}`);
            
            // 5. Referencia al nuevo documento de crédito
            const nuevoCreditoRef = db.collection('creditos').doc();

            // 6. Captura de saldo anterior (si es renovación)
            let saldoCreditoAnterior = 0;
            let creditoAnteriorRef = null;
            if (creditoData.tipo === 'renovacion' || creditoData.tipo === 'reingreso') {
                const creditoAnterior = await database.buscarCreditoActivoPorCliente(creditoData.curpCliente, office);
                if (creditoAnterior && creditoAnterior.id !== nuevoCreditoRef.id) {
                    saldoCreditoAnterior = creditoAnterior.saldo || 0;
                    creditoAnteriorRef = db.collection('creditos').doc(creditoAnterior.id);
                }
            }

            // 7. Cálculos de Efectivo y Comisión
            const esCreditoComisionista = (creditoData.plazo === 10 && cliente.isComisionista);
            let montoPolizaDeduccion = 0;
            if (!esCreditoComisionista) {
                montoPolizaDeduccion = 100; // $100 de póliza
            }
            const montoEfectivoEntregado = creditoData.monto - montoPolizaDeduccion - saldoCreditoAnterior;

            // 8. Ejecutar la Transacción
            let nuevoHistoricalId = null; 

            await db.runTransaction(async (transaction) => {
                // a. Leer el contador
                const contadorDoc = await transaction.get(contadorRef);
                let ultimoId;
                if (!contadorDoc.exists) {
                    console.warn(`Contador para ${office} no existía. Creando...`);
                    ultimoId = (office === 'GDL') ? 30000000 : 20000000;
                } else {
                    ultimoId = contadorDoc.data().ultimoId || (office === 'GDL' ? 30000000 : 20000000);
                }
                
                // b. Generar el nuevo ID
                nuevoHistoricalId = ultimoId + 1;
                
                // c. Actualizar el contador
                transaction.set(contadorRef, { ultimoId: nuevoHistoricalId }, { merge: true });

                // d. Crear el nuevo crédito
                nuevoCreditoData.historicalIdCredito = String(nuevoHistoricalId);
                transaction.set(nuevoCreditoRef, nuevoCreditoData);

                // e. Liquidar crédito anterior (si aplica)
                if (creditoAnteriorRef) {
                    transaction.update(creditoAnteriorRef, {
                        estado: 'liquidado',
                        fechaModificacion: fechaCreacionISO,
                        modificadoPor: userEmail
                    });
                }

                // f. Registrar SALIDA de efectivo
                const movimientoEfectivo = {
                    userId: (await auth.currentUser).uid,
                    fecha: fechaCreacionISO,
                    tipo: 'COLOCACION',
                    monto: -montoEfectivoEntregado,
                    descripcion: `Colocación a ${cliente.nombre} (ID: ${nuevoHistoricalId}, Monto: $${creditoData.monto} - Póliza: $${montoPolizaDeduccion} - Saldo Ant: $${saldoCreditoAnterior.toFixed(2)})`,
                    creditoId: nuevoCreditoRef.id,
                    registradoPor: userEmail,
                    office: cliente.office
                };
                const movimientoRef = db.collection('movimientos_efectivo').doc();
                transaction.set(movimientoRef, movimientoEfectivo);

                // g. Registrar COMISIÓN por colocación (si aplica)
                if (!esCreditoComisionista && (creditoData.tipo === 'nuevo' || creditoData.tipo === 'renovacion' || creditoData.tipo === 'reingreso')) {
                    const comisionData = {
                        userId: (await auth.currentUser).uid,
                        fecha: fechaCreacionISO,
                        tipo: 'COLOCACION',
                        montoComision: 100,
                        descripcion: `Comisión por ${creditoData.tipo} a ${cliente.nombre} (ID: ${nuevoHistoricalId})`,
                        creditoId: nuevoCreditoRef.id,
                        registradoPor: userEmail,
                        office: cliente.office
                    };
                    const comisionRef = db.collection('comisiones').doc();
                    transaction.set(comisionRef, comisionData);
                }
            }); 
            
            return { 
                success: true, 
                message: 'Crédito generado.', 
                data: { 
                    id: nuevoCreditoRef.id, 
                    historicalIdCredito: String(nuevoHistoricalId), 
                    ...nuevoCreditoData 
                } 
            };

        } catch (error) {
            console.error("Error agregando crédito:", error);
            return { success: false, message: `Error al generar crédito: ${error.message}` };
        }
    },

    // --- MÉTODOS DE PAGOS ---
    /**
     * Obtiene los pagos de un crédito específico, desambiguando por SUCURSAL (office).
     * @param {string} historicalIdCredito El ID histórico del crédito.
     * @param {string} office La sucursal (GDL o LEON) del crédito.
     * @returns {Array<object>} Un array de objetos de pago.
     */
    getPagosPorCredito: async (historicalIdCredito, office) => {
        try {
            if (!office || (office !== 'GDL' && office !== 'LEON')) {
                console.warn(`getPagosPorCredito fue llamado para ID ${historicalIdCredito} sin una 'office' (sucursal) válida. Devolviendo vacío.`);
                return [];
            }
            const snapshot = await db.collection('pagos')
                .where('idCredito', '==', historicalIdCredito)
                .where('office', '==', office) // <-- Filtro por SUCURSAL
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error obteniendo pagos por historicalIdCredito (${historicalIdCredito}) y Office (${office}):`, error);
            return [];
        }
    },

    /**
     * (PARA DIAGNÓSTICO) Obtiene TODOS los pagos de un ID histórico, sin importar la sucursal.
     * @param {string} historicalIdCredito El ID histórico del crédito.
     * @returns {Array<object>} Un array de objetos de pago.
     */
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

    // Agregar Pago //
    agregarPago: async (pagoData, userEmail, firestoreCreditoId) => {
        try {
            const creditoRef = db.collection('creditos').doc(firestoreCreditoId);

            await db.runTransaction(async (transaction) => {
                const creditoDoc = await transaction.get(creditoRef);
                if (!creditoDoc.exists) throw new Error("El crédito asociado no existe.");
                const credito = creditoDoc.data();

                const saldoActual = credito.saldo || 0;
                const tolerancia = 0.015;
                if (pagoData.monto > saldoActual + tolerancia) {
                    throw new Error(`Monto del pago ($${pagoData.monto.toFixed(2)}) excede saldo restante ($${saldoActual.toFixed(2)}).`);
                }

                let nuevoSaldo = saldoActual - pagoData.monto;
                if (nuevoSaldo < 0.01) nuevoSaldo = 0;
                const nuevoEstadoDB = (nuevoSaldo === 0) ? 'liquidado' : 'activo';
                transaction.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: nuevoEstadoDB,
                    modificadoPor: userEmail,
                    fechaModificacion: new Date().toISOString()
                });

                const pagoRef = db.collection('pagos').doc();
                transaction.set(pagoRef, {
                    idCredito: pagoData.idCredito,
                    monto: pagoData.monto,
                    tipoPago: pagoData.tipoPago,
                    fecha: new Date().toISOString(),
                    saldoDespues: nuevoSaldo,
                    registradoPor: userEmail,
                    office: credito.office,
                    curpCliente: credito.curpCliente,
                    grupo: credito.poblacion_grupo
                });
                
                const esCreditoComisionista = (credito.plazo === 10);
                const esTipoPagoComisionable = (pagoData.tipoPago === 'normal' || pagoData.tipoPago === 'extraordinario' || pagoData.tipoPago === 'grupal'); 
                if (!esCreditoComisionista && esTipoPagoComisionable) {
                    const comisionRef = db.collection('comisiones').doc();
                    const userIdComisionista = credito.creadoPor; 
                    
                    if (userIdComisionista) { 
                        transaction.set(comisionRef, {
                            userId: userIdComisionista,
                            fecha: new Date().toISOString(),
                            tipo: 'PAGO',
                            montoComision: 10,
                            descripcion: `Comisión por ${pagoData.tipoPago} a crédito ${pagoData.idCredito}`,
                            creditoId: firestoreCreditoId,
                            pagoId: pagoRef.id,
                            registradoPor: userEmail,
                            office: credito.office
                        });
                    } else {
                        console.warn(`No se pudo registrar comisión para pago ${pagoRef.id} - falta 'creadoPor' en el crédito ${firestoreCreditoId}`);
                    }
                }
               
            });
            return { success: true, message: 'Pago registrado.' };
        } catch (error) {
            console.error("Error al registrar pago: ", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- IMPORTACIÓN MASIVA ---
    importarDatosDesdeCSV: async (csvData, tipo, office) => { // 'office' aquí es la sucursal seleccionada para importar
        const lineas = csvData.split('\n').filter(linea => linea.trim() && linea.includes(','));
        if (lineas.length === 0) return { success: true, total: 0, importados: 0, errores: [] };

        let errores = [];
        let importados = 0;
        let batch = db.batch();
        let batchCounter = 0;
        const MAX_BATCH_SIZE = 490;
        const fechaImportacion = new Date().toISOString();
        let cacheClientes = new Map();
        let cacheCreditos = new Map();

        try {
            console.log(`Iniciando importación tipo ${tipo} para ${office}. Líneas: ${lineas.length}`);

            for (const [i, linea] of lineas.entries()) {
                const lineaNum = i + 1;
                if (linea.toLowerCase().includes('curp,') || linea.toLowerCase().includes('nombre,')) continue;

                const campos = linea.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

                if (tipo === 'clientes') {
                    if (campos.length < 7) { 
                        errores.push(`L${lineaNum}: Faltan columnas (Esperadas 7+, encontradas ${campos.length})`); 
                        continue; 
                    }
                    const curp = campos[0].toUpperCase();
                    if (!curp || curp.length !== 18) { 
                        errores.push(`L${lineaNum}: CURP inválido '${campos[0]}'`); 
                        continue; 
                    }
                    const cacheKey = `${curp}_${office}`;
                    if (cacheClientes.has(cacheKey)) { 
                        errores.push(`L${lineaNum}: Cliente ${curp} ya procesado o existente.`); 
                        continue; 
                    }
                    if (!cacheClientes.size) {
                        const existe = await database.buscarClientePorCURP(curp);
                        if (existe && existe.office === office) {
                            errores.push(`L${lineaNum}: Cliente ${curp} ya existe en ${office}.`);
                            cacheClientes.set(cacheKey, true);
                            continue;
                        }
                    }
                    const fechaRegistroISO = _parsearFechaImportacion(campos[5]);
                    if (!fechaRegistroISO) { 
                        errores.push(`L${lineaNum}: Fecha registro inválida '${campos[5]}'`); 
                        continue; 
                    }
                    const docRef = db.collection('clientes').doc();
                    batch.set(docRef, {
                        curp: curp, 
                        nombre: campos[1] || 'SIN NOMBRE', 
                        domicilio: campos[2] || 'SIN DOMICILIO',
                        cp: campos[3] || '', 
                        telefono: campos[4] || '', 
                        fechaRegistro: fechaRegistroISO,
                        poblacion_grupo: campos[6] || 'SIN GRUPO', 
                        office: office, 
                        ruta: campos[7] || '',
                        fechaCreacion: fechaImportacion, 
                        creadoPor: 'importacion_csv'
                    });
                    cacheClientes.set(cacheKey, true);
                    importados++;

                } else if (tipo === 'colocacion') {
                    const minCols = 13; // Ajustar si el formato cambia
                    if (campos.length < minCols) { 
                        errores.push(`L${lineaNum}: Faltan columnas (Esperadas ${minCols}+, encontradas ${campos.length})`); 
                        continue; 
                    }
                    const curpCliente = campos[0].toUpperCase(); 
                    const historicalIdCredito = campos[2].trim();
                    if (!curpCliente || curpCliente.length !== 18) { 
                        errores.push(`L${lineaNum}: CURP cliente inválido '${campos[0]}'`); 
                        continue; 
                    }
                    if (!historicalIdCredito) { 
                        errores.push(`L${lineaNum}: ID Crédito (histórico) vacío.`); 
                        continue; 
                    }
                    const cacheKey = `${historicalIdCredito}_${office}_${curpCliente}`;
                    if (cacheCreditos.has(cacheKey)) { 
                        errores.push(`L${lineaNum}: Crédito ${historicalIdCredito} ya procesado o existente.`); 
                        continue; 
                    }
                    if (!cacheCreditos.size) {
                        const existingCredits = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { office: office, curpCliente: curpCliente });
                        if (existingCredits.length > 0) {
                            errores.push(`L${lineaNum}: Crédito ${historicalIdCredito} para ${curpCliente} en ${office} ya existe.`);
                            cacheCreditos.set(cacheKey, true); 
                            continue;
                        }
                    }
                    const fechaCreacionISO = _parsearFechaImportacion(campos[3]);
                    if (!fechaCreacionISO) { 
                        errores.push(`L${lineaNum}: Fecha creación inválida '${campos[3]}'`); 
                        continue; 
                    }
                    const montoIndex = 5; 
                    const plazoIndex = 6; 
                    const montoTotalIndex = 7;
                    const saldoIndex = (office === 'LEON' && campos.length > 13) ? 13 : 12; // Ajustar si cambia
                    const monto = parseFloat(campos[montoIndex] || 0); 
                    const plazo = parseInt(campos[plazoIndex] || 0);
                    let montoTotal = parseFloat(campos[montoTotalIndex] || 0); 
                    let saldo = parseFloat(campos[saldoIndex] || 0);
                    if (monto <= 0 || plazo <= 0) { 
                        errores.push(`L${lineaNum}: Monto o Plazo inválido.`); 
                        continue; 
                    }
                    let interesRate = 0; 
                    if (plazo === 14) interesRate = 0.40; 
                    else if (plazo === 13) interesRate = 0.30; 
                    else if (plazo === 10) interesRate = 0.00;
                    const montoTotalCalculado = parseFloat((monto * (1 + interesRate)).toFixed(2));
                    if (montoTotal <= 0 || Math.abs(montoTotal - montoTotalCalculado) > 0.05) {
                        if (montoTotal > 0) errores.push(`L${lineaNum}: Monto Total ${montoTotal} no coincide con ${monto} @ ${plazo}sem (Calc: ${montoTotalCalculado}). Usando calculado.`);
                        montoTotal = montoTotalCalculado;
                    }
                    if (isNaN(saldo)) saldo = montoTotal; 
                    if (saldo > montoTotal + 0.01) { 
                        errores.push(`L${lineaNum}: Saldo ($${saldo}) > Monto Total ($${montoTotal}). Ajustado a Monto Total.`); 
                        saldo = montoTotal; 
                    } 
                    if (saldo < 0) saldo = 0;
                    const estadoCredito = (saldo <= 0.01) ? 'liquidado' : 'activo';
                    const credito = {
                        historicalIdCredito: historicalIdCredito, 
                        office: office, 
                        curpCliente: curpCliente, 
                        nombreCliente: campos[1] || '',
                        fechaCreacion: fechaCreacionISO, 
                        tipo: campos[4] || 'NUEVO', 
                        monto: monto, 
                        plazo: plazo, 
                        montoTotal: montoTotal,
                        curpAval: (campos[8] || '').toUpperCase(), 
                        nombreAval: campos[9] || '', 
                        poblacion_grupo: campos[10] || '',
                        ruta: campos[11] || '', 
                        saldo: saldo, 
                        estado: estadoCredito, 
                        fechaImportacion: fechaImportacion, 
                        importadoPor: 'importacion_csv'
                    };
                    if (office === 'LEON' && campos.length > 14) credito.ultimoPagoFecha = _parsearFechaImportacion(campos[14]);
                    if (office === 'LEON' && campos.length > 15) credito.saldoVencido = parseFloat(campos[15] || 0);
                    const docRef = db.collection('creditos').doc(); 
                    batch.set(docRef, credito); 
                    cacheCreditos.set(cacheKey, true); 
                    importados++;

                } else if (tipo === 'cobranza') {
                    // =============================================
                    // *** INICIO MODIFICACIÓN IMPORTACIÓN COBRANZA ***
                    // =============================================
                    const minCols = 8; // Ahora esperamos 8 columnas
                    if (campos.length < minCols) {
                        errores.push(`L${lineaNum}: Faltan columnas (Esperadas ${minCols}, encontradas ${campos.length}) Formato: NOMBRE, ID CREDITO, FECHA, MONTO PAGO, TIPO PAGO, GRUPO, RUTA, OFICINA`);
                        continue;
                    }

                    const historicalIdCredito = campos[1].trim();
                    const fechaPagoISO = _parsearFechaImportacion(campos[2]);
                    const montoPago = parseFloat(campos[3] || 0);
                    const tipoPago = (campos[4] || 'normal').toLowerCase(); // Índice 4
                    const grupo = campos[5] || ''; // Índice 5
                    const ruta = campos[6] || ''; // Índice 6
                    const officePagoCSV = campos[7] ? campos[7].toUpperCase() : ''; // Índice 7, NUEVA COLUMNA

                    if (!historicalIdCredito) { 
                        errores.push(`L${lineaNum}: ID Crédito (histórico) vacío.`); 
                        continue; 
                    }
                    if (!fechaPagoISO) { 
                        errores.push(`L${lineaNum}: Fecha pago inválida '${campos[2]}'`); 
                        continue; 
                    }
                    if (isNaN(montoPago) || montoPago <= 0) { 
                        errores.push(`L${lineaNum}: Monto pago inválido '${campos[3]}'`); 
                        continue; 
                    }

                    // Validar la oficina del CSV
                    let officePagoFinal = '';
                    if (officePagoCSV === 'GDL' || officePagoCSV === 'LEON') {
                        officePagoFinal = officePagoCSV;
                    } else {
                        // Si la columna está vacía o es inválida, usar la oficina seleccionada para la importación (fallback)
                        errores.push(`L${lineaNum}: Oficina inválida o vacía ('${campos[7]}') en CSV. Usando la oficina seleccionada para importar: ${office}.`);
                        officePagoFinal = office; // Usar la oficina de la importación como fallback
                    }

                    // Intentar obtener el CURP del cliente asociado al crédito y oficina correctos
                    let curpClientePago = '';
                    const creditosAsoc = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { office: officePagoFinal }); // Buscar con la oficina determinada
                    
                    if (creditosAsoc.length > 0) {
                        const nombreClientePagoCSV = campos[0] || '';
                        let creditoEncontrado = creditosAsoc[0]; // Default al más reciente si hay varios
                        if (creditosAsoc.length > 1 && nombreClientePagoCSV) {
                            const matchPorNombre = creditosAsoc.find(c => c.nombreCliente === nombreClientePagoCSV);
                            if (matchPorNombre) creditoEncontrado = matchPorNombre;
                        }
                        curpClientePago = creditoEncontrado.curpCliente;
                    } else {
                        errores.push(`L${lineaNum}: No se encontró crédito asociado (${historicalIdCredito}, ${officePagoFinal}) para obtener CURP.`);
                        curpClientePago = ''; // No se pudo determinar
                    }

                    // Crear objeto pago con los datos correctos
                    const pago = {
                        idCredito: historicalIdCredito,
                        fecha: fechaPagoISO,
                        monto: montoPago,
                        tipoPago: tipoPago,
                        grupo: grupo,
                        ruta: ruta,
                        nombreCliente: campos[0] || '', // Nombre del CSV
                        registradoPor: 'importacion_csv',
                        fechaImportacion: fechaImportacion,
                        curpCliente: curpClientePago, // CURP encontrado (o vacío)
                        office: officePagoFinal, // Oficina determinada (CSV o fallback)
                    };

                    const docRef = db.collection('pagos').doc();
                    batch.set(docRef, pago);
                    importados++;
                    // =============================================
                    // *** FIN MODIFICACIÓN IMPORTACIÓN COBRANZA ***
                    // =============================================
                }

                batchCounter++;
                if (batchCounter >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    console.log(`Batch ${Math.ceil(lineaNum / MAX_BATCH_SIZE)} committed.`);
                    batch = db.batch();
                    batchCounter = 0;
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } // Fin del bucle for

            if (batchCounter > 0) {
                await batch.commit();
                console.log("Final batch committed.");
            }

            console.log(`Importación finalizada. Importados: ${importados}, Errores: ${errores.length}`);
            return { success: true, total: lineas.length, importados: importados, errores: errores };

        } catch (error) {
            console.error("Error CRÍTICO en importación masiva: ", error);
            errores.push(`Error crítico durante batch: ${error.message}. Algunos datos podrían no haberse guardado.`);
            try { 
                if (batchCounter > 0) await batch.commit(); 
            } catch (commitError) { 
                console.error("Error en commit final:", commitError); 
            }
            return { success: false, message: `Error crítico: ${error.message}`, total: lineas.length, importados: importados, errores: errores };
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
            const totalComisionesMes = 0; // O eliminar esta línea y la métrica

            // Usar Map seguro (ID + Office) para pagos
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

    obtenerPoblaciones: async (office = null) => {
        console.log(`>>> obtenerPoblaciones (Corregido) llamada con office: ${office}`);
        try {
            // --- INICIO CORRECCIÓN ---
            // 1. Definir la consulta base
            let query = db.collection('poblaciones');
            
            // 2. Aplicar filtro SI ES NECESARIO (para Admin)
            if (office && office !== 'AMBAS') {
                console.log(`>>> Filtrando poblaciones por office: ${office}`);
                query = query.where('office', '==', office);
            } else {
                console.log(">>> Obteniendo todas las poblaciones (sin filtro office).");
            }
            
            // 3. Ejecutar la consulta
            const snapshot = await query.get();
            let poblacionesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`>>> Se obtuvieron ${poblacionesData.length} poblaciones.`);
            
            // 4. Ordenar en JavaScript
            poblacionesData.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            // --- FIN CORRECCIÓN ---

            return poblacionesData;
        } catch (error) {
            console.error("Error obteniendo poblaciones:", error);
            return [];
        }
    },

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

    eliminarPoblacion: async (id) => {
        try { 
            await db.collection('poblaciones').doc(id).delete(); 
            return { success: true, message: 'Población eliminada.' }; 
        } catch (error) { 
            console.error("Error eliminando población:", error); 
            return { success: false, message: `Error: ${error.message}` }; 
        }
    },

    obtenerRutas: async (office = null) => {
        console.log(`>>> obtenerRutas (Corregido) llamada con office: ${office}`);
        try {
            // --- INICIO CORRECCIÓN ---
            // 1. Definir la consulta base
            let query = db.collection('rutas');
            
            // 2. Aplicar filtro SI ES NECESARIO (para Admin)
            if (office && office !== 'AMBAS') {
                console.log(`>>> Filtrando rutas por office: ${office}`);
                query = query.where('office', '==', office);
            } else {
                console.log(">>> Obteniendo todas las rutas.");
            }

            // 3. Ejecutar la consulta
            const snapshot = await query.get();
            let rutasData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`>>> Se obtuvieron ${rutasData.length} rutas en total.`);

            // 4. Ordenar en JavaScript
            rutasData.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            // --- FIN CORRECCIÓN ---
            
            return rutasData;
        } catch (error) {
            console.error("Error obteniendo rutas:", error);
            return [];
        }
    },

    // Actualiza el nombre de una ruta específica
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

            // Verificar si el nuevo nombre ya existe en la misma oficina
            const existeSnap = await db.collection('rutas')
                .where('nombre', '==', nombreUpper)
                .where('office', '==', rutaData.office)
                .limit(1).get();
            if (!existeSnap.empty && existeSnap.docs[0].id !== id) {
                 return { success: false, message: `El nombre "${nombreUpper}" ya existe en la oficina ${rutaData.office}.` };
            }

            // Actualizar en 'rutas'
            await rutaRef.update({ nombre: nombreUpper });
            
            // Actualizar en 'poblaciones' (batch)
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

    // Asigna o cambia la ruta de una población específica
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

    eliminarRuta: async (id, nombre, office) => {
        try {
            // 1. Eliminar la ruta
            await db.collection('rutas').doc(id).delete();
            
            // 2. Des-asignar la ruta de las poblaciones
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
            // Asegurar que los datos esenciales estén
            if (!movimientoData.userId || !movimientoData.tipo || !movimientoData.monto) {
                throw new Error("UserID, Tipo y Monto son requeridos para un movimiento.");
            }
            // Asegurar que la fecha exista
            movimientoData.fecha = movimientoData.fecha || new Date().toISOString();
            
            await db.collection('movimientos_efectivo').add(movimientoData);
            return { success: true, message: 'Movimiento de efectivo registrado.' };
        } catch (error) {
            console.error("Error agregando movimiento de efectivo:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Obtiene movimientos de efectivo según filtros (userId, fechas, etc.)
     * Requiere índice: userId (ASC), fecha (DESC)
     */
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

    /**
     * Obtiene movimientos de efectivo para un reporte contable, filtrado por oficina y fechas.
     * Requiere índice: office (ASC), fecha (DESC)
     * O: office (ASC), userId (ASC), fecha (DESC)
     */
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
    

    /**
     * Agrega una comisión a la colección 'comisiones'.
     * @param {object} comisionData Datos de la comisión (userId, fecha, tipo, montoComision, etc.)
     */
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

// EN database.js - AÑADE ESTAS FUNCIONES DENTRO DEL OBJETO 'database = {'

    /**
     * Actualiza campos de un documento de CRÉDITO.
     * ADVERTENCIA: No recalcula saldos ni totales.
     */
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

    /**
     * Elimina un CRÉDITO y todos sus PAGOS, COMISIONES y MOVIMIENTOS asociados.
     */
    eliminarCredito: async (creditoId, historicalId, office) => {
        try {
            if (!creditoId || !historicalId || !office) {
                throw new Error("Datos insuficientes (creditoId, historicalId, office) para eliminar.");
            }
            
            const batch = db.batch();
            
            // 1. Marcar el crédito para eliminar
            const creditoRef = db.collection('creditos').doc(creditoId);
            batch.delete(creditoRef);
            
            // 2. Buscar y eliminar Pagos
            const pagosSnap = await db.collection('pagos')
                .where('idCredito', '==', historicalId)
                .where('office', '==', office)
                .get();
            pagosSnap.docs.forEach(doc => batch.delete(doc.ref));

            // 3. Buscar y eliminar Comisiones
            const comisionesSnap = await db.collection('comisiones')
                .where('creditoId', '==', creditoId)
                .get();
            comisionesSnap.docs.forEach(doc => batch.delete(doc.ref));
                
            // 4. Buscar y eliminar Movimientos de Efectivo (Colocación)
            const movimientosSnap = await db.collection('movimientos_efectivo')
                .where('creditoId', '==', creditoId)
                .get();
            movimientosSnap.docs.forEach(doc => batch.delete(doc.ref));

            // Ejecutar el batch
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

    /**
     * Actualiza un PAGO y recalcula el saldo del crédito en una transacción.
     */
    actualizarPago: async (pagoId, creditoId, dataToUpdate, diferenciaMonto) => {
        try {
            const creditoRef = db.collection('creditos').doc(creditoId);
            const pagoRef = db.collection('pagos').doc(pagoId);
            
            await db.runTransaction(async (transaction) => {
                const creditoDoc = await transaction.get(creditoRef);
                if (!creditoDoc.exists) throw new Error("Crédito no encontrado.");
                
                const credito = creditoDoc.data();
                
                // Aplicar la diferencia al saldo
                // Si nuevoMonto > montoOriginal, diferenciaMonto es POSITIVO.
                // El saldo debe DISMINUIR.
                let nuevoSaldo = (credito.saldo || 0) - diferenciaMonto;
                if (nuevoSaldo < 0.01) nuevoSaldo = 0;
                
                const nuevoEstado = (nuevoSaldo === 0) ? 'liquidado' : 'activo';

                // Actualizar Saldo del Crédito
                transaction.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: nuevoEstado
                });
                
                // Actualizar el Pago
                dataToUpdate.saldoDespues = nuevoSaldo; // Actualizar el saldo histórico del pago
                transaction.update(pagoRef, dataToUpdate);
            });
            
            return { success: true, message: 'Pago actualizado.' };
        } catch (error) {
            console.error("Error actualizando pago:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    /**
     * Elimina un PAGO y REEMBOLSA el monto al saldo del crédito en una transacción.
     */
    eliminarPago: async (pagoId, creditoId, montoAReembolsar, office) => {
        try {
            const creditoRef = db.collection('creditos').doc(creditoId);
            const pagoRef = db.collection('pagos').doc(pagoId);
            let historicalIdCredito = ''; // Para devolverlo a la UI

            await db.runTransaction(async (transaction) => {
                const creditoDoc = await transaction.get(creditoRef);
                if (!creditoDoc.exists) throw new Error("Crédito no encontrado.");
                
                const credito = creditoDoc.data();
                historicalIdCredito = credito.historicalIdCredito || '';
                
                // Reembolsar el monto al saldo
                let nuevoSaldo = (credito.saldo || 0) + montoAReembolsar;
                
                // Actualizar Saldo del Crédito
                transaction.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: 'activo' // Forzar a 'activo' ya que no puede estar 'liquidado'
                });
                
                // Eliminar el Pago
                transaction.delete(pagoRef);
            });
            
            return { 
                success: true, 
                message: 'Pago eliminado y saldo recalculado.',
                historicalIdCredito: historicalIdCredito // Devolver para refrescar el modal
            };
        } catch (error) {
            console.error("Error eliminando pago:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // Obtiene las poblaciones filtradas por Ruta y Oficina (Para el checkbox)
    async obtenerPoblacionesPorRuta(ruta, office) {
        console.log(`📡 DB: Buscando poblaciones para Ruta: "${ruta}" en Oficina: "${office}"`);
        try {
            let query = db.collection('poblaciones');
            
            // Filtro 1: Por Ruta (Obligatorio)
            query = query.where('ruta', '==', ruta);

            // Filtro 2: Por Oficina (Si aplica, para seguridad)
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
            // Devolvemos array vacío para no romper la UI, pero mostramos error
            throw error; 
        }
    },

    // Obtiene TODOS los movimientos financieros del día para la Hoja de Corte
    obtenerDatosHojaCorte: async (fecha, userOffice, userId = null) => {
        // Definir rango del día en UTC para coincidir con ISO Strings almacenados
        const fechaInicio = new Date(fecha + 'T00:00:00Z').toISOString();
        const fechaFin = new Date(fecha + 'T23:59:59Z').toISOString();
        
        try {
            const promises = [];
            
            // 1. Movimientos Efectivo (Gastos, Colocación, Entradas Iniciales)
            let qMovs = db.collection('movimientos_efectivo')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qMovs = qMovs.where('office', '==', userOffice);
            if (userId) qMovs = qMovs.where('userId', '==', userId); // Filtro estricto para Agentes
            
            promises.push(qMovs.get());

            // 2. Pagos (Cobranza - Entradas)
            let qPagos = db.collection('pagos')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qPagos = qPagos.where('office', '==', userOffice);
            // Nota: Si la colección pagos no tiene userId indexado, filtramos en memoria después,
            // pero si el agente registró el pago, su email/id debería estar trazable.
            
            promises.push(qPagos.get());

            // 3. Comisiones (Salidas)
            let qComis = db.collection('comisiones')
                .where('fecha', '>=', fechaInicio)
                .where('fecha', '<=', fechaFin);
            
            if (userOffice && userOffice !== 'AMBAS') qComis = qComis.where('office', '==', userOffice);
            if (userId) qComis = qComis.where('userId', '==', userId);
            
            promises.push(qComis.get());

            const [snapMovs, snapPagos, snapComis] = await Promise.all(promises);

            // Mapeo y normalización de datos
            const movimientos = snapMovs.docs.map(d => ({...d.data(), categoria: 'MOVIMIENTO', rawDate: d.data().fecha}));
            
            const pagos = snapPagos.docs.map(d => ({...d.data(), categoria: 'COBRANZA', tipo: 'PAGO', rawDate: d.data().fecha, descripcion: `Pago Crédito ${d.data().idCredito}`}));
            
            const comisiones = snapComis.docs.map(d => ({...d.data(), categoria: 'COMISION', tipo: 'COMISION', rawDate: d.data().fecha})); 

            // Unificar todos los arrays
            return [...movimientos, ...pagos, ...comisiones];

        } catch (error) {
            console.error("Error obteniendo datos hoja corte:", error);
            return [];
        }
    },

};



