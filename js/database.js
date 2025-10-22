// =============================================
// CAPA DE SERVICIO DE FIREBASE (database.js) - CORREGIDO Y MEJORADO
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
        // Verifica si el año es razonable y si el formato original usaba separadores comunes
        // Esto ayuda a evitar fechas como "01-02-03" que Date() interpreta erróneamente.
        if (fecha.getFullYear() > 1970 && (fechaTrimmed.includes('-') || fechaTrimmed.includes('/'))) {
             // Asegura que la fecha parseada coincide con los componentes originales si es YYYY-MM-DD
            if (fechaTrimmed.includes('-')) {
                 const parts = fechaTrimmed.split('-');
                 if (parts.length === 3 && parseInt(parts[0], 10) === fecha.getFullYear()) {
                    return fecha.toISOString();
                 }
                 // Si no es YYYY-MM-DD, podría ser otro formato, pasamos a la lógica de abajo
            } else {
                 return fecha.toISOString(); // Asumir que otros formatos directos son correctos por ahora
            }
        }
    }


    const separador = fechaTrimmed.includes('/') ? '/' : '-';
    const partes = fechaTrimmed.split(separador);
    if (partes.length !== 3) return null;

    const [p1, p2, p3] = partes.map(p => parseInt(p, 10));
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;

    let anio, mes, dia;

    // Prioridad DD-MM-YYYY (formato solicitado)
    if (p3 > 1000 && p1 <= 31 && p2 <= 12) {
        anio = p3; dia = p1; mes = p2;
    }
    // Formato YYYY-MM-DD
    else if (p1 > 1000 && p2 <= 12 && p3 <= 31) {
        anio = p1; mes = p2; dia = p3;
    }
    // Formato MM-DD-YYYY (menos común en México, pero posible)
    else if (p3 > 1000 && p1 <= 12 && p2 <= 31) {
         anio = p3; mes = p1; dia = p2;
    } else {
        return null; // Formato no reconocido o ambiguo sin año de 4 dígitos
    }


    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

    fecha = new Date(Date.UTC(anio, mes - 1, dia));

    // Doble verificación: que la fecha sea válida y que el día coincida (evita desbordamientos como 31 de abril)
    if (isNaN(fecha.getTime()) || fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
        console.warn(`Fecha inválida detectada después del parseo: ${fechaStr} -> ${anio}-${mes}-${dia}`);
        return null;
    }


    return fecha.toISOString();
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
            const users = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return { success: true, data: users };
        } catch (error) {
            console.error("Error obteniendo usuarios:", error);
            return { success: false, message: 'Error al obtener usuarios: ' + error.message };
        }
    },

    obtenerUsuarioPorId: async (uid) => {
        try {
            const doc = await db.collection('users').doc(uid).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error obteniendo usuario por ID:", error);
            return null;
        }
    },

    actualizarUsuario: async (uid, userData) => {
        try {
            await db.collection('users').doc(uid).update(userData);
            return { success: true, message: 'Usuario actualizado correctamente.' };
        } catch (error) {
            console.error("Error actualizando usuario:", error);
            return { success: false, message: `Error al actualizar: ${error.message}` };
        }
    },

    deshabilitarUsuario: async (uid) => {
        try {
            await db.collection('users').doc(uid).update({ status: 'disabled' });
            return { success: true, message: 'Usuario deshabilitado.' };
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
            // **AUDITORÍA**
            clienteData.modificadoPor = userEmail;
            clienteData.fechaModificacion = new Date().toISOString();
            await db.collection('clientes').doc(id).update(clienteData);
            return { success: true, message: 'Cliente actualizado exitosamente.' };
        } catch (error) {
            console.error("Error actualizando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    eliminarCliente: async (id) => {
        try {
            // Considerar si se deben eliminar créditos y pagos asociados o marcarlos como huérfanos.
            // Por ahora, solo elimina el cliente.
            await db.collection('clientes').doc(id).delete();
            return { success: true, message: 'Cliente eliminado exitosamente.' };
        } catch (error) {
            console.error("Error eliminando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },


    buscarClientePorCURP: async (curp) => {
        try {
            const snapshot = await db.collection('clientes').where('curp', '==', curp.toUpperCase()).limit(1).get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error buscando cliente por CURP:", error);
            return null;
        }
    },

    // **NUEVA FUNCIÓN PARA BÚSQUEDA MÚLTIPLE**
    buscarClientesPorCURPs: async (curps) => {
        if (!curps || curps.length === 0) {
            return [];
        }
        try {
            // Firestore 'in' query supports up to 30 elements now (previously 10)
            const MAX_IN_VALUES = 30;
            const chunks = [];
            for (let i = 0; i < curps.length; i += MAX_IN_VALUES) {
                chunks.push(curps.slice(i, i + MAX_IN_VALUES));
            }

            const promises = chunks.map(chunk =>
                db.collection('clientes').where('curp', 'in', chunk).get()
            );

            const snapshots = await Promise.all(promises);
            const clientes = [];
            snapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    clientes.push({ id: doc.id, ...doc.data() });
                });
            });
            return clientes;
        } catch (error) {
            console.error("Error buscando clientes por CURPs:", error);
            return [];
        }
    },

    agregarCliente: async (clienteData, userEmail) => {
        try {
            // El ID se genera automáticamente, no verificamos si existe por ID.
            const existe = await database.buscarClientePorCURP(clienteData.curp);
            if (existe) {
                return { success: false, message: 'Ya existe un cliente con esta CURP.' };
            }

            // **AUDITORÍA**
            clienteData.fechaCreacion = new Date().toISOString();
            clienteData.creadoPor = userEmail;

            // Si fechaRegistro no viene del formulario (o importación), usar fechaCreacion
            if (!clienteData.fechaRegistro) {
                clienteData.fechaRegistro = clienteData.fechaCreacion;
            }
            clienteData.curp = clienteData.curp.toUpperCase();

            // Añadir con ID automático
            const docRef = await db.collection('clientes').add(clienteData);
            return { success: true, message: 'Cliente registrado exitosamente.', id: docRef.id };
        } catch (error) {
            console.error("Error agregando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    buscarClientes: async (filtros) => {
        try {
            let query = db.collection('clientes');
            if (filtros.sucursal && filtros.sucursal.trim() !== '') {
                query = query.where('office', '==', filtros.sucursal);
            }
            if (filtros.grupo && filtros.grupo.trim() !== '') {
                query = query.where('poblacion_grupo', '==', filtros.grupo);
            }
            // Búsqueda por CURP individual o múltiple (si viene como array)
            if (filtros.curp && typeof filtros.curp === 'string' && filtros.curp.trim() !== '') {
                 query = query.where('curp', '==', filtros.curp.toUpperCase());
            } else if (Array.isArray(filtros.curp) && filtros.curp.length > 0) {
                 // Si se pasa un array de CURPs (usado internamente quizás)
                 const MAX_IN_VALUES = 30;
                 if (filtros.curp.length <= MAX_IN_VALUES) {
                     query = query.where('curp', 'in', filtros.curp.map(c => c.toUpperCase()));
                 } else {
                     // Si son más de 30, se necesitaría lógica de chunking aquí,
                     // pero buscarClientesPorCURPs es más apropiado para ese caso.
                     console.warn("Demasiados CURPs para consulta 'in', retornando vacío.");
                     return [];
                 }
            }


            const snapshot = await query.get();
            let clientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Filtro por nombre se aplica después en memoria
            if (filtros.nombre && filtros.nombre.trim() !== '') {
                clientes = clientes.filter(c =>
                    c.nombre && c.nombre.toLowerCase().includes(filtros.nombre.toLowerCase())
                );
            }
            return clientes;
        } catch (error) {
            console.error("Error buscando clientes:", error);
            return [];
        }
    },


    // --- MÉTODOS DE CRÉDITOS ---
    buscarCreditosPorCliente: async (curp) => {
        try {
            const snapshot = await db.collection('creditos').where('curpCliente', '==', curp.toUpperCase()).get();
            // Devolver con el ID de Firestore
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error buscando créditos por cliente:", error);
            return [];
        }
    },

    // Busca créditos usando el ID histórico y filtros opcionales
    buscarCreditosPorHistoricalId: async (historicalId, options = {}) => {
        try {
            let query = db.collection('creditos').where('historicalIdCredito', '==', historicalId);

            if (options.office) {
                query = query.where('office', '==', options.office);
            }
            if (options.curpCliente) {
                query = query.where('curpCliente', '==', options.curpCliente.toUpperCase());
            }

            const snapshot = await query.get();
            // Devolver con el ID de Firestore
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error buscando créditos por historicalIdCredito:", error);
            return [];
        }
    },


    // Mantenemos buscarCreditoPorId para buscar por el ID único de Firestore
    buscarCreditoPorId: async (firestoreId) => {
        try {
            const doc = await db.collection('creditos').doc(firestoreId).get();
            if (!doc.exists) return null;
            // Devolver con el ID de Firestore
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error buscando crédito por Firestore ID:", error);
            return null;
        }
    },

    // Buscar créditos con filtros (puede necesitar ajustes si los filtros interactúan con historicalId)
    buscarCreditos: async (filtros) => {
        try {
            let query = db.collection('creditos');

            // Si se busca por ID específico (histórico), usar la función dedicada
            if (filtros.idCredito) {
                // Asumimos que filtros.idCredito es el historicalId
                return await database.buscarCreditosPorHistoricalId(filtros.idCredito);
            }

            // Aplicar otros filtros
            if (filtros.estado) {
                query = query.where('estado', '==', filtros.estado);
            }
            if (filtros.curpAval) {
                query = query.where('curpAval', '==', filtros.curpAval.toUpperCase());
            }
            if (filtros.plazo) {
                query = query.where('plazo', '==', parseInt(filtros.plazo, 10));
            }
            // Podríamos añadir más filtros aquí (office, curpCliente si no se usó buscarClientes primero)

            const snapshot = await query.get();
            // Devolver con el ID de Firestore
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error buscando créditos con filtros:", error);
            return [];
        }
    },


    buscarCreditoActivoPorCliente: async (curp) => {
        try {
            const creditos = await database.buscarCreditosPorCliente(curp);
            // Filtrar por estados que consideramos activos para negocio
            const creditosActivos = creditos.filter(c => ['activo', 'al corriente', 'atrasado', 'cobranza', 'juridico'].includes(c.estado));
            if (creditosActivos.length === 0) return null;
            // Devolver el más reciente
            return creditosActivos.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0))[0];
        } catch (error) {
            console.error("Error buscando crédito activo:", error);
            return null;
        }
    },

    verificarElegibilidadCliente: async (curp) => {
        const creditoActivo = await database.buscarCreditoActivoPorCliente(curp);
        if (!creditoActivo) {
            return { elegible: true };
        }

        // Si el crédito activo ya está liquidado en la práctica pero no se marcó, es elegible
        if (creditoActivo.estado === 'liquidado' || (creditoActivo.saldo !== undefined && creditoActivo.saldo <= 0.01)) {
            return { elegible: true };
        }


        if (!creditoActivo.montoTotal || creditoActivo.montoTotal <= 0) {
            return { elegible: false, message: `El crédito activo ${creditoActivo.historicalIdCredito || creditoActivo.id} tiene datos inconsistentes (monto total inválido).` };
        }


        // Calcular porcentaje pagado basado en saldo actual
        const montoPagado = creditoActivo.montoTotal - (creditoActivo.saldo || creditoActivo.montoTotal);
        const porcentajePagado = (montoPagado / creditoActivo.montoTotal) * 100;


        if (porcentajePagado >= 80) {
            return { elegible: true };
        } else {
            return {
                elegible: false,
                message: `El cliente ya tiene un crédito activo (${creditoActivo.historicalIdCredito || creditoActivo.id}) con solo un ${porcentajePagado.toFixed(0)}% pagado. Se requiere al menos el 80%.`
            };
        }
    },

    verificarElegibilidadAval: async (curpAval) => {
        if (!curpAval) return { elegible: true }; // Si no hay aval, es elegible

        try {
            // Buscar créditos *no liquidados* donde esta persona es aval
            const snapshot = await db.collection('creditos')
                .where('curpAval', '==', curpAval.toUpperCase())
                .where('estado', '!=', 'liquidado') // Excluir los liquidados
                .get();

            if (snapshot.empty) {
                return { elegible: true }; // No es aval de ningún crédito activo/pendiente
            }

            for (const doc of snapshot.docs) {
                const credito = doc.data();
                // Si el crédito encontrado aún tiene saldo pendiente significativo
                if (credito.saldo !== undefined && credito.saldo > 0.01) {
                    if (!credito.montoTotal || credito.montoTotal <= 0) {
                         // Si hay datos inconsistentes, por precaución no permitir avalar más
                         return {
                             elegible: false,
                             message: `Este aval respalda el crédito ${credito.historicalIdCredito || doc.id}, el cual tiene datos inconsistentes y no se puede verificar su avance.`
                         };
                    }


                    const montoPagado = credito.montoTotal - credito.saldo;
                    const porcentajePagado = (montoPagado / credito.montoTotal) * 100;
                    if (porcentajePagado < 80) {
                        return {
                            elegible: false,
                            message: `Este aval ya respalda el crédito ${credito.historicalIdCredito || doc.id}, el cual solo tiene un ${porcentajePagado.toFixed(0)}% de avance. Se requiere el 80% para poder avalar otro.`
                        };
                    }
                }
                // Si el saldo es <= 0.01, aunque no esté marcado como 'liquidado', no impide avalar.
            }

            // Si pasó todas las verificaciones
            return { elegible: true };
        } catch (error) {
            console.error("Error verificando elegibilidad del aval:", error);
            return { elegible: false, message: "Error al consultar la base de datos para el aval." };
        }
    },


    agregarCredito: async (creditoData, userEmail) => {
        try {
            // 1. Verificar elegibilidad del cliente
            const elegibilidadCliente = await database.verificarElegibilidadCliente(creditoData.curpCliente);
            if (!elegibilidadCliente.elegible) {
                return { success: false, message: elegibilidadCliente.message };
            }

            // 2. Verificar elegibilidad del aval
            const elegibilidadAval = await database.verificarElegibilidadAval(creditoData.curpAval);
            if (!elegibilidadAval.elegible) {
                return { success: false, message: elegibilidadAval.message };
            }

            // 3. Obtener cliente para datos de office y grupo
            const cliente = await database.buscarClientePorCURP(creditoData.curpCliente);
            if (!cliente) {
                return { success: false, message: "No se encontró el cliente asociado a la CURP proporcionada." };
            }


            // 4. Generar ID histórico (si no se proporciona uno, aunque normalmente viene de la interfaz o importación)
            // Para créditos nuevos creados desde la app, podríamos generar uno secuencial como antes,
            // pero AHORA lo guardaremos en historicalIdCredito. Usaremos ID automático de Firestore.
            // *Decisión*: Para créditos NUEVOS desde la app, no asignaremos historicalIdCredito por ahora.
            // Se podría implementar un contador como antes si fuera necesario referenciarlo históricamente.


            // 5. Preparar datos del crédito
            const nuevoCredito = {
                ...creditoData,
                curpCliente: creditoData.curpCliente.toUpperCase(),
                curpAval: creditoData.curpAval.toUpperCase(),
                office: cliente.office, // Tomar de los datos del cliente
                poblacion_grupo: cliente.poblacion_grupo, // Tomar de los datos del cliente
                ruta: cliente.ruta, // Tomar de los datos del cliente
                montoTotal: creditoData.monto * 1.3,
                saldo: creditoData.monto * 1.3,
                estado: 'activo', // O 'al corriente' si se prefiere
                fechaCreacion: new Date().toISOString(),
                creadoPor: userEmail,
                // historicalIdCredito: ??? // Opcional para créditos nuevos desde UI
            };


            // 6. Añadir el crédito con ID automático
            const docRef = await db.collection('creditos').add(nuevoCredito);

            // 7. (Opcional) Marcar crédito anterior como liquidado si era renovación/reingreso
            if (creditoData.tipo === 'renovacion' || creditoData.tipo === 'reingreso') {
                 const creditoActivoAnterior = await database.buscarCreditoActivoPorCliente(creditoData.curpCliente);
                 // Asegurarse de no marcar el que acabamos de crear
                 if (creditoActivoAnterior && creditoActivoAnterior.id !== docRef.id) {
                     await db.collection('creditos').doc(creditoActivoAnterior.id).update({
                         estado: 'liquidado',
                         modificadoPor: userEmail,
                         fechaModificacion: new Date().toISOString()
                     });
                 }
            }


            return { success: true, message: 'Crédito generado exitosamente.', data: { id: docRef.id, ...nuevoCredito } };

        } catch (error) {
            console.error("Error agregando crédito:", error);
            return { success: false, message: `Error al generar crédito: ${error.message}` };
        }
    },


    // --- MÉTODOS DE PAGOS ---

    // Modificado para buscar por historicalIdCredito
    getPagosPorCredito: async (historicalIdCredito) => {
        try {
            const snapshot = await db.collection('pagos').where('idCredito', '==', historicalIdCredito).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo pagos por historicalIdCredito:", error);
            return [];
        }
    },


    // Modificado para recibir el ID único de Firestore del crédito a actualizar
    agregarPago: async (pagoData, userEmail, firestoreCreditoId) => {
        try {
            const creditoRef = db.collection('creditos').doc(firestoreCreditoId);

            await db.runTransaction(async (transaction) => {
                const creditoDoc = await transaction.get(creditoRef);
                if (!creditoDoc.exists) {
                    throw new Error("El documento del crédito no existe en Firestore.");
                }
                const credito = creditoDoc.data();

                // Validar que el pago no sea mayor al saldo
                const saldoActual = credito.saldo || 0;
                if (pagoData.monto > saldoActual + 0.01) { // Permitir un pequeño margen para redondeo
                     // Lanzar error específico para manejarlo en la UI si se desea
                     throw new Error(`El monto del pago ($${pagoData.monto.toFixed(2)}) excede el saldo restante ($${saldoActual.toFixed(2)}).`);
                }


                const nuevoSaldo = saldoActual - pagoData.monto;

                const actualizacionCredito = {
                    saldo: nuevoSaldo,
                    estado: (nuevoSaldo <= 0.01) ? 'liquidado' : credito.estado, // Mantener estado si no se liquida
                    modificadoPor: userEmail,
                    fechaModificacion: new Date().toISOString()
                };
                transaction.update(creditoRef, actualizacionCredito);

                // El pago guarda el historicalIdCredito en su campo idCredito
                const nuevoPago = {
                    ...pagoData, // incluye idCredito (historical), monto, tipoPago
                    fecha: new Date().toISOString(),
                    saldoDespues: nuevoSaldo,
                    registradoPor: userEmail,
                    office: credito.office, // Añadir office al pago para facilitar filtros
                    curpCliente: credito.curpCliente // Añadir CURP al pago
                };
                const pagoRef = db.collection('pagos').doc(); // ID automático para el pago
                transaction.set(pagoRef, nuevoPago);
            });
            return { success: true, message: 'Pago registrado exitosamente.' };
        } catch (error) {
            console.error("Error al registrar pago: ", error);
            // Devolver el mensaje de error específico (ej. pago excede saldo)
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- IMPORTACIÓN MASIVA ---
    importarDatosDesdeCSV: async (csvData, tipo, office) => {
        const lineas = csvData.split('\n').filter(linea => linea.trim());
        if (lineas.length === 0) return { success: true, total: 0, importados: 0, errores: [] };

        let errores = [];
        let importados = 0;
        let batch = db.batch();
        let batchCounter = 0;
        const MAX_BATCH_SIZE = 490; // Firestore batch limit

        // Cache para clientes existentes si se importan clientes
        let curpsClientesExistentes = new Set();
        if (tipo === 'clientes') {
            try {
                const snapshot = await db.collection('clientes').where('office', '==', office).get();
                snapshot.forEach(doc => curpsClientesExistentes.add(doc.data().curp));
            } catch (e) {
                 errores.push(`Error crítico al verificar clientes existentes: ${e.message}`);
                 return { success: false, message: `Error crítico: ${e.message}`, total: lineas.length, importados, errores };
            }
        }


        try {
            for (const [i, linea] of lineas.entries()) {
                // Saltar línea vacía o de encabezado (simple check)
                if (!linea.includes(',') || linea.toLowerCase().includes('curp,')) {
                    continue;
                }

                const campos = linea.split(',').map(c => c.trim().replace(/^"|"$/g, '')); // Limpiar comillas

                if (tipo === 'clientes') {
                    if (campos.length < 7) {
                        errores.push(`Línea ${i + 1}: Faltan columnas (esperadas 7+, encontradas ${campos.length}) Linea: ${linea}`);
                        continue;
                    }

                    const curp = campos[0].toUpperCase();
                    if (!curp || curp.length !== 18) {
                         errores.push(`Línea ${i + 1}: CURP inválido o vacío ('${campos[0]}'). Se omitió.`);
                         continue;
                    }
                    if (curpsClientesExistentes.has(curp)) {
                        errores.push(`Línea ${i + 1}: Cliente con CURP ${curp} ya existe en ${office}. Se omitió.`);
                        continue;
                    }

                    const fechaRegistroISO = _parsearFechaImportacion(campos[5]);
                    if (!fechaRegistroISO) {
                        errores.push(`Línea ${i + 1}: Fecha de registro inválida ('${campos[5]}'). Se omitió.`);
                        continue;
                    }
                    const docRef = db.collection('clientes').doc(); // ID Automático
                    batch.set(docRef, {
                        curp: curp,
                        nombre: campos[1] || 'SIN NOMBRE',
                        domicilio: campos[2] || 'SIN DOMICILIO',
                        cp: campos[3] || '',
                        telefono: campos[4] || '',
                        fechaRegistro: fechaRegistroISO,
                        poblacion_grupo: campos[6] || 'SIN GRUPO',
                        office: office,
                        ruta: campos[7] || '', // Asumiendo que ruta puede estar en la columna 8 si existe
                        fechaCreacion: new Date().toISOString(), // Auditoría
                        creadoPor: 'importacion_csv' // Auditoría
                    });
                    curpsClientesExistentes.add(curp); // Añadir al cache local
                    importados++;

                } else if (tipo === 'colocacion') {
                    const columnasEsperadasMin = office === 'LEON' ? 14 : 13; // Ajustar según índices usados
                    if (campos.length < columnasEsperadasMin) {
                        errores.push(`Línea ${i + 1}: Faltan columnas para colocación (esperadas ${columnasEsperadasMin}+, encontradas ${campos.length}) Linea: ${linea}`);
                        continue;
                    }
                    const historicalIdCredito = campos[2].trim();
                    const curpCliente = campos[0].toUpperCase();

                    if (!historicalIdCredito) {
                        errores.push(`Línea ${i + 1}: ID de crédito (histórico) vacío. Se omitió.`);
                        continue;
                    }
                     if (!curpCliente || curpCliente.length !== 18) {
                         errores.push(`Línea ${i + 1}: CURP de cliente inválido ('${campos[0]}'). Se omitió.`);
                         continue;
                    }

                    const fechaCreacionISO = _parsearFechaImportacion(campos[3]);
                    if (!fechaCreacionISO) {
                        errores.push(`Línea ${i + 1}: Fecha de creación inválida ('${campos[3]}'). Se omitió.`);
                        continue;
                    }

                    // Verificar si ya existe este crédito EXACTO (mismo ID histórico, oficina y cliente)
                    const existingCreditQuery = await db.collection('creditos')
                        .where('historicalIdCredito', '==', historicalIdCredito)
                        .where('office', '==', office)
                        .where('curpCliente', '==', curpCliente)
                        .limit(1).get();

                    if (!existingCreditQuery.empty) {
                        errores.push(`Línea ${i + 1}: Crédito con ID Histórico ${historicalIdCredito} para CURP ${curpCliente} en ${office} ya existe. Se omitió.`);
                        continue;
                    }


                    const saldoIndex = office === 'LEON' ? 13 : 12;
                    const montoTotalIndex = 7;
                    const montoIndex = 5;
                    const plazoIndex = 6;


                    const monto = parseFloat(campos[montoIndex] || 0);
                    let montoTotal = parseFloat(campos[montoTotalIndex] || 0);
                    let saldo = parseFloat(campos[saldoIndex] || 0);
                    const plazo = parseInt(campos[plazoIndex] || 0);


                     // Validaciones y cálculos si faltan datos
                     if (montoTotal <= 0 && monto > 0) {
                         montoTotal = monto * 1.3; // Calcular si no viene
                     }
                     if (saldo <= 0 && montoTotal > 0) {
                         // Si el saldo viene como 0 o negativo, pero el monto total no,
                         // podría ser un crédito liquidado o un error. Asumimos liquidado si saldo <= 0.
                         // O quizás deberíamos asumir que el saldo es el monto total si no se especifica?
                         // Decisión: Asumir que si saldo no es positivo, es igual a montoTotal (recién creado o error)
                         // O si montoTotal existe, asumir saldo = montoTotal si no se provee saldo > 0
                         saldo = montoTotal; // Asumir saldo completo si no se da uno positivo
                     } else if (saldo > montoTotal) {
                         errores.push(`Línea ${i + 1}: Saldo ($${saldo}) es mayor que Monto Total ($${montoTotal}). Se usará Monto Total como saldo.`);
                         saldo = montoTotal;
                     }


                    const estadoCredito = (saldo <= 0.01) ? 'liquidado' : 'activo'; // Estado inicial basado en saldo importado

                    const credito = {
                        historicalIdCredito: historicalIdCredito,
                        office: office,
                        curpCliente: curpCliente,
                        nombreCliente: campos[1] || '', // Puede que no tengamos el nombre aquí
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
                        estado: estadoCredito, // Usar el estado calculado
                        fechaImportacion: new Date().toISOString(), // Auditoría
                        importadoPor: 'importacion_csv' // Auditoría
                    };

                    // Datos específicos de León si existen
                    if (office === 'LEON' && campos.length > 14) {
                       credito.ultimoPagoFecha = _parsearFechaImportacion(campos[14]); // Campo 15: ULTIMO PAGO
                       credito.saldoVencido = parseFloat(campos[15] || 0); // Campo 16: SALDO VENCIDO
                       // Podríamos usar campos[16] (STATUS) si confiamos en él, pero recalculamos estado.
                    }

                    const docRef = db.collection('creditos').doc(); // ID Automático
                    batch.set(docRef, credito);
                    importados++;

                } else if (tipo === 'cobranza') {
                    const columnasEsperadasMin = 11;
                    if (campos.length < columnasEsperadasMin) {
                        errores.push(`Línea ${i + 1}: Faltan columnas para cobranza (esperadas ${columnasEsperadasMin}+, encontradas ${campos.length}) Linea: ${linea}`);
                        continue;
                    }
                    const historicalIdCredito = campos[1].trim();
                    const fechaPagoISO = _parsearFechaImportacion(campos[2]);
                    const montoPago = parseFloat(campos[3] || 0);

                    if (!historicalIdCredito) {
                        errores.push(`Línea ${i + 1}: ID de crédito (histórico) vacío. Se omitió.`);
                        continue;
                    }
                    if (!fechaPagoISO) {
                        errores.push(`Línea ${i + 1}: Fecha de pago inválida ('${campos[2]}'). Se omitió.`);
                        continue;
                    }
                    if (isNaN(montoPago) || montoPago <= 0) {
                        errores.push(`Línea ${i + 1}: Monto de pago inválido ('${campos[3]}'). Se omitió.`);
                        continue;
                    }

                    // No podemos obtener curpCliente y office fácilmente aquí sin lookup.
                    // Los añadiremos al crear el pago desde la app. Para importación, los omitimos.
                    const pago = {
                        // office: office, // No añadir aquí, se añade en la app o requiere lookup
                        nombreCliente: campos[0] || '', // Útil para referencia rápida
                        idCredito: historicalIdCredito, // Este es el historicalIdCredito
                        fecha: fechaPagoISO,
                        monto: montoPago,
                        // cobroSemana: campos[4] || '', // Campo GDL
                        comision: parseFloat(campos[office === 'LEON' ? 4 : 5] || 0), // Índice diferente
                        tipoPago: (campos[office === 'LEON' ? 5 : 6] || 'normal').toLowerCase(), // Índice diferente
                        grupo: campos[office === 'LEON' ? 6 : 7] || '', // Índice diferente
                        ruta: campos[office === 'LEON' ? 7 : 8] || '', // Índice diferente
                        // semanaCredito: campos[9] || '', // Campo GDL
                        saldoDespues: parseFloat(campos[office === 'LEON' ? 9 : 10] || 0), // Índice diferente
                        registradoPor: 'importacion_csv', // Auditoría
                        // curpCliente: ??? // No disponible directamente
                    };

                    const docRef = db.collection('pagos').doc(); // ID Automático
                    batch.set(docRef, pago);
                    importados++;
                }

                batchCounter++;
                if (batchCounter >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    batch = db.batch();
                    batchCounter = 0;
                     // Pausa breve para no sobrecargar Firestore
                     await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            if (batchCounter > 0) {
                await batch.commit();
            }

            return { success: true, total: lineas.length, importados: importados, errores: errores };
        } catch (error) {
            console.error("Error en importación masiva: ", error);
            errores.push(`Error crítico durante el proceso batch: ${error.message}. Es posible que algunos datos no se hayan guardado.`);
            // Intentar confirmar el último batch si hubo error
            try {
                if (batchCounter > 0) await batch.commit();
            } catch (commitError) {
                console.error("Error al intentar commit final:", commitError);
                errores.push(`Fallo adicional al guardar último lote: ${commitError.message}`);
            }
            return { success: false, message: `Error crítico: ${error.message}`, total: lineas.length, importados: importados, errores: errores };
        }
    },


    // --- FUNCIONES DE REPORTES Y MANTENIMIENTO ---
    generarReportes: async () => {
        try {
            const [clientesSnap, creditosSnap, pagosSnap] = await Promise.all([
                db.collection('clientes').get(),
                db.collection('creditos').where('estado', '!=', 'liquidado').get(), // Optimizar: solo activos/pendientes
                db.collection('pagos').get() // Considerar filtrar por fecha si solo se quieren del mes
            ]);

            const clientes = clientesSnap.docs.map(doc => doc.data());
            const creditosActivos = creditosSnap.docs.map(doc => doc.data()); // Ya filtrados por no liquidados
            const pagos = pagosSnap.docs.map(doc => doc.data());

            const totalCartera = creditosActivos.reduce((sum, credito) => sum + (credito.saldo || 0), 0);

            const hoy = new Date();
            const primerDiaMes = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1));
            const primerDiaMesSiguiente = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() + 1, 1));

            // Filtrar pagos del mes actual UTC
             const totalPagosMes = pagos.filter(pago => {
                const fechaPago = parsearFecha(pago.fecha);
                return fechaPago && fechaPago >= primerDiaMes && fechaPago < primerDiaMesSiguiente;
            });


            const cobradoMes = totalPagosMes.reduce((sum, pago) => sum + (pago.monto || 0), 0);

            // Calcular monto total que *debería* haberse cobrado este mes (aproximado)
            let cobroEsperadoMes = 0;
            creditosActivos.forEach(credito => {
                 if (credito.montoTotal && credito.plazo && credito.plazo > 0) {
                     const pagoSemanal = credito.montoTotal / credito.plazo;
                     // Aproximación simple: 4 semanas por mes
                     cobroEsperadoMes += pagoSemanal * 4;
                 }
            });


            // Tasa de recuperación (Cobrado / Esperado)
            const tasaRecuperacion = cobroEsperadoMes > 0 ? Math.min(100, (cobradoMes / cobroEsperadoMes * 100)) : 0;


            // Calcular vencidos (usando función auxiliar)
            const totalVencidos = creditosActivos.filter(credito => database.esCreditoVencido(credito)).length;

            // Comisiones del mes
            const totalComisionesMes = totalPagosMes.reduce((sum, pago) => sum + (pago.comision || 0), 0);


            return {
                totalClientes: clientes.length,
                totalCreditos: creditosActivos.length, // Solo activos/pendientes
                totalCartera: totalCartera,
                totalVencidos: totalVencidos,
                pagosRegistrados: totalPagosMes.length,
                cobradoMes: cobradoMes,
                totalComisiones: totalComisionesMes, // Cambiado a Comisiones del Mes
                tasaRecuperacion: tasaRecuperacion
            };
        } catch (error) {
            console.error("Error generando reportes:", error);
            // Devolver un objeto con valores por defecto o null para indicar error
            return { totalClientes: 'Error', totalCreditos: 'Error', totalCartera: 'Error', totalVencidos: 'Error', pagosRegistrados: 'Error', cobradoMes: 'Error', totalComisiones: 'Error', tasaRecuperacion: 0 };
        }
    },


    generarReporteAvanzado: async (filtros) => {
        try {
            const resultados = [];
            const clientesMap = new Map(); // Cache para datos de clientes

            // --- 1. Obtener Clientes (si es necesario filtrar por ellos) ---
            let clientesFiltrados = null;
            if (filtros.sucursal || filtros.grupo || filtros.ruta || filtros.curpCliente || filtros.nombre) {
                clientesFiltrados = await database.buscarClientes({
                    sucursal: filtros.sucursal,
                    grupo: filtros.grupo,
                    ruta: filtros.ruta,
                    curp: filtros.curpCliente,
                    nombre: filtros.nombre // Nombre se filtra en memoria en buscarClientes
                });
                clientesFiltrados.forEach(c => clientesMap.set(c.curp, c));
                // Si la búsqueda inicial de clientes no arroja resultados, no hay nada que buscar
                if (clientesFiltrados.length === 0 && (filtros.curpCliente || filtros.nombre)) return [];
            }

            // --- 2. Construir Query de Créditos ---
            let queryCreditos = db.collection('creditos');
            if (filtros.sucursal) queryCreditos = queryCreditos.where('office', '==', filtros.sucursal);
            if (filtros.tipoCredito) queryCreditos = queryCreditos.where('tipo', '==', filtros.tipoCredito);
            if (filtros.estadoCredito) queryCreditos = queryCreditos.where('estado', '==', filtros.estadoCredito);
            if (filtros.idCredito) queryCreditos = queryCreditos.where('historicalIdCredito', '==', filtros.idCredito); // Usar historicalId
            if (filtros.grupo) queryCreditos = queryCreditos.where('poblacion_grupo', '==', filtros.grupo); // Filtrar también por grupo en créditos
            if (filtros.ruta) queryCreditos = queryCreditos.where('ruta', '==', filtros.ruta); // Filtrar también por ruta en créditos

            // Si filtramos por cliente previamente, usar esas CURPs para filtrar créditos
            if (clientesFiltrados !== null) {
                const curpsClientes = clientesFiltrados.map(c => c.curp);
                if (curpsClientes.length === 0) return []; // No hay clientes, no puede haber créditos/pagos

                // Si hay pocos CURPs, usar 'in'
                 const MAX_IN_VALUES = 30;
                 if (curpsClientes.length <= MAX_IN_VALUES) {
                     queryCreditos = queryCreditos.where('curpCliente', 'in', curpsClientes);
                 } else {
                     // Si son muchos, no podemos usar 'in'. Tendremos que filtrar en memoria después.
                     console.warn("Demasiados clientes para filtrar créditos con 'in'. Se filtrará en memoria.");
                 }
            }


            // Aplicar filtros de fecha a créditos
            if (filtros.fechaInicio) queryCreditos = queryCreditos.where('fechaCreacion', '>=', new Date(filtros.fechaInicio).toISOString());
            if (filtros.fechaFin) {
                const fechaFinSiguiente = new Date(filtros.fechaFin);
                fechaFinSiguiente.setUTCDate(fechaFinSiguiente.getUTCDate() + 1);
                queryCreditos = queryCreditos.where('fechaCreacion', '<', fechaFinSiguiente.toISOString());
            }

            // --- 3. Ejecutar Query de Créditos y Añadir a Resultados ---
            const creditosSnap = await queryCreditos.get();
            for (const doc of creditosSnap.docs) {
                const credito = { id: doc.id, ...doc.data() };

                // Si filtramos por muchos clientes y no pudimos usar 'in', filtrar ahora
                 if (clientesFiltrados !== null && clientesFiltrados.length > 30 && !clientesMap.has(credito.curpCliente)) {
                     continue;
                 }


                let cliente = clientesMap.get(credito.curpCliente);
                if (!cliente) {
                    cliente = await database.buscarClientePorCURP(credito.curpCliente);
                    if (cliente) clientesMap.set(cliente.curp, cliente);
                }
                resultados.push({
                    tipo: 'credito',
                    ...credito,
                    nombreCliente: cliente?.nombre || 'N/A',
                    // Usar datos del crédito si el cliente no se encontró o no tiene grupo/ruta
                    poblacion_grupo: credito.poblacion_grupo || cliente?.poblacion_grupo || 'N/A',
                    ruta: credito.ruta || cliente?.ruta || 'N/A'
                });
            }

            // --- 4. Construir Query de Pagos ---
            let queryPagos = db.collection('pagos');
            if (filtros.sucursal) queryPagos = queryPagos.where('office', '==', filtros.sucursal); // Usar office en pago
            if (filtros.tipoPago) queryPagos = queryPagos.where('tipoPago', '==', filtros.tipoPago);
            if (filtros.idCredito) queryPagos = queryPagos.where('idCredito', '==', filtros.idCredito); // idCredito en pago es historicalId

             // Filtrar por CURP si se especificó
             if (filtros.curpCliente) queryPagos = queryPagos.where('curpCliente', '==', filtros.curpCliente.toUpperCase());
             // Si filtramos por muchos clientes (nombre, grupo, ruta sin curp específico), filtrar en memoria
              else if (clientesFiltrados !== null && clientesFiltrados.length > 30) {
                  // No podemos usar 'in' eficientemente aquí tampoco
                  console.warn("Filtrando pagos en memoria debido a alto número de clientes.");
              } else if (clientesFiltrados !== null && clientesFiltrados.length > 0) {
                   const curpsClientes = clientesFiltrados.map(c => c.curp);
                   if (curpsClientes.length <= 30) {
                        queryPagos = queryPagos.where('curpCliente', 'in', curpsClientes);
                   } else {
                       console.warn("Demasiados clientes para filtrar pagos con 'in'. Se filtrará en memoria.");
                   }
              }

            // Aplicar filtros de fecha a pagos
            if (filtros.fechaInicio) queryPagos = queryPagos.where('fecha', '>=', new Date(filtros.fechaInicio).toISOString());
            if (filtros.fechaFin) {
                const fechaFinSiguiente = new Date(filtros.fechaFin);
                fechaFinSiguiente.setUTCDate(fechaFinSiguiente.getUTCDate() + 1);
                queryPagos = queryPagos.where('fecha', '<', fechaFinSiguiente.toISOString());
            }

            // --- 5. Ejecutar Query de Pagos y Añadir a Resultados ---
            const pagosSnap = await queryPagos.get();
            for (const doc of pagosSnap.docs) {
                const pago = { id: doc.id, ...doc.data() };

                 // Filtrado en memoria si fue necesario
                 if (clientesFiltrados !== null && clientesFiltrados.length > 30 && !clientesMap.has(pago.curpCliente)) {
                     continue;
                 }
                  // Filtrado en memoria si fue necesario por más de 30 CURPs
                  if (clientesFiltrados !== null && clientesFiltrados.length > 30 && !clientesFiltrados.some(c => c.curp === pago.curpCliente)) {
                       continue;
                  }

                // Filtrar por grupo/ruta si no se pudo hacer en la query de pagos
                 let cliente = clientesMap.get(pago.curpCliente);
                 if (!cliente) {
                     cliente = await database.buscarClientePorCURP(pago.curpCliente);
                     if (cliente) clientesMap.set(cliente.curp, cliente);
                 }

                 // Aplicar filtros de grupo/ruta en memoria si no se aplicaron a clientes o créditos directamente
                 if (filtros.grupo && (pago.grupo || cliente?.poblacion_grupo) !== filtros.grupo) continue;
                 if (filtros.ruta && (pago.ruta || cliente?.ruta) !== filtros.ruta) continue;


                resultados.push({
                    tipo: 'pago',
                    ...pago,
                    nombreCliente: cliente?.nombre || pago.nombreCliente || 'N/A', // Usar nombre del cliente si está disponible
                    poblacion_grupo: pago.grupo || cliente?.poblacion_grupo || 'N/A', // Usar grupo del pago o del cliente
                    ruta: pago.ruta || cliente?.ruta || 'N/A', // Usar ruta del pago o del cliente
                    office: pago.office || cliente?.office || 'N/A' // Usar office del pago o del cliente
                });
            }


             // --- 6. Añadir Clientes que cumplen filtro de fecha de registro (si aplica) ---
             if (clientesFiltrados !== null && filtros.fechaInicio && filtros.fechaFin && !filtros.idCredito && !filtros.tipoPago) {
                clientesFiltrados.forEach(cliente => {
                     if (database._cumpleFiltroFecha(cliente.fechaRegistro, filtros.fechaInicio, filtros.fechaFin)) {
                        // Evitar añadir si ya está por crédito o pago? No, el reporte es de operaciones.
                         resultados.push({ tipo: 'cliente', ...cliente });
                     }
                });
             } else if (clientesFiltrados === null && filtros.fechaInicio && filtros.fechaFin && !filtros.idCredito && !filtros.tipoPago) {
                  // Si no hubo filtros de cliente pero sí de fecha, buscar todos los clientes en ese rango
                  let queryTodosClientes = db.collection('clientes');
                   if (filtros.sucursal) queryTodosClientes = queryTodosClientes.where('office', '==', filtros.sucursal);
                   queryTodosClientes = queryTodosClientes.where('fechaRegistro', '>=', new Date(filtros.fechaInicio).toISOString());
                    const fechaFinSiguienteCliente = new Date(filtros.fechaFin);
                    fechaFinSiguienteCliente.setUTCDate(fechaFinSiguienteCliente.getUTCDate() + 1);
                    queryTodosClientes = queryTodosClientes.where('fechaRegistro', '<', fechaFinSiguienteCliente.toISOString());
                    const todosClientesSnap = await queryTodosClientes.get();
                    todosClientesSnap.forEach(doc => {
                        resultados.push({ tipo: 'cliente', id: doc.id, ...doc.data() });
                    });
             }


            // --- 7. Ordenar Resultados por Fecha Descendente ---
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
            const promesas = [];
            let creditosQuery = db.collection('creditos');
            let pagosQuery = db.collection('pagos');

            if (filtros.sucursal) {
                creditosQuery = creditosQuery.where('office', '==', filtros.sucursal);
                pagosQuery = pagosQuery.where('office', '==', filtros.sucursal); // Asumiendo que 'office' está en pagos
            }
             if (filtros.grupo) {
                creditosQuery = creditosQuery.where('poblacion_grupo', '==', filtros.grupo);
                pagosQuery = pagosQuery.where('grupo', '==', filtros.grupo); // Asumiendo que 'grupo' está en pagos
            }


            // Aplicar filtros de fecha a ambas queries
             const fechaInicioISO = filtros.fechaInicio ? new Date(filtros.fechaInicio).toISOString() : null;
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


            promesas.push(creditosQuery.get());
            promesas.push(pagosQuery.get());

            const [creditosSnap, pagosSnap] = await Promise.all(promesas);

             // Mapear incluyendo el ID de Firestore
            const creditos = creditosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const pagos = pagosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));


            return { creditos, pagos };

        } catch (error) {
            console.error("Error obteniendo datos para gráficos:", error);
            return { creditos: [], pagos: [] };
        }
    },

    _cumpleFiltroFecha: (fecha, fechaInicio, fechaFin) => {
        if (!fechaInicio && !fechaFin) return true; // No hay filtro de fecha
        const fechaObj = parsearFecha(fecha);
        if (!fechaObj) return false; // Fecha inválida no cumple

        if (fechaInicio) {
            const inicio = new Date(fechaInicio); // Asume YYYY-MM-DD local
            inicio.setUTCHours(0, 0, 0, 0); // Compara con inicio del día UTC
            if (fechaObj < inicio) return false;
        }
        if (fechaFin) {
            const fin = new Date(fechaFin); // Asume YYYY-MM-DD local
            fin.setUTCHours(23, 59, 59, 999); // Compara con fin del día UTC
            if (fechaObj > fin) return false;
        }
        return true;
    },


    esCreditoVencido: (credito) => {
         // Considerar vencido si no está liquidado y su fecha de vencimiento ya pasó
        if (!credito || credito.estado === 'liquidado' || !credito.plazo || !credito.fechaCreacion) {
            return false;
        }
        const fechaCreacion = parsearFecha(credito.fechaCreacion);
        if (!fechaCreacion) return false; // Fecha inválida


        const fechaVencimiento = new Date(fechaCreacion);
        // Sumar días de plazo (plazo * 7 días/semana)
        fechaVencimiento.setUTCDate(fechaVencimiento.getUTCDate() + (credito.plazo * 7));


        const hoy = new Date();
        // Comparar solo la fecha (ignorando hora) podría ser más robusto
         hoy.setUTCHours(0,0,0,0);
         fechaVencimiento.setUTCHours(0,0,0,0);


        return hoy > fechaVencimiento; // Es vencido si hoy es estrictamente después de la fecha de vencimiento
    },


    // *** NUEVAS FUNCIONES PARA LIMPIEZA DE DUPLICADOS ***
    encontrarClientesDuplicados: async () => {
        try {
            const clientesSnapshot = await db.collection('clientes').get();
            const clientes = clientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const curpMap = new Map();
            clientes.forEach(cliente => {
                const key = `${cliente.curp}_${cliente.office}`; // Clave combinada CURP + Oficina
                if (!curpMap.has(key)) {
                    curpMap.set(key, []);
                }
                curpMap.get(key).push(cliente);
            });

            const idsParaEliminar = [];
            let duplicadosEncontrados = 0; // Total de registros involucrados
            let gruposDuplicados = 0; // Número de grupos (CURP+Office) con duplicados

            for (const [key, clientesAgrupados] of curpMap.entries()) {
                if (clientesAgrupados.length > 1) {
                    gruposDuplicados++;
                    duplicadosEncontrados += clientesAgrupados.length;

                    // Ordenar por fecha de registro (o creación si no existe), el más nuevo primero
                    clientesAgrupados.sort((a, b) => {
                        const fechaA = parsearFecha(a.fechaRegistro || a.fechaCreacion)?.getTime() || 0;
                        const fechaB = parsearFecha(b.fechaRegistro || b.fechaCreacion)?.getTime() || 0;
                        return fechaB - fechaA; // Más reciente primero
                    });


                    // Conservar el primero (más reciente), marcar el resto para eliminar
                    const paraEliminar = clientesAgrupados.slice(1);
                    paraEliminar.forEach(cliente => idsParaEliminar.push(cliente.id));
                }
            }

             const curpsAfectadas = [...new Set(idsParaEliminar.map(id => clientes.find(c => c.id === id)?.curp))];


            return { success: true, idsParaEliminar, duplicadosEncontrados: duplicadosEncontrados - gruposDuplicados, curpsAfectadas }; // Reportar solo los que se eliminarán
        } catch (error) {
            console.error("Error encontrando clientes duplicados:", error);
            return { success: false, message: error.message };
        }
    },

    ejecutarEliminacionDuplicados: async (ids) => {
        if (!ids || ids.length === 0) {
            return { success: true, message: "No se encontraron IDs de clientes duplicados para eliminar." };
        }
        try {
            // Eliminar en lotes para evitar exceder límites
            const MAX_BATCH_SIZE = 500;
            let eliminadosCount = 0;
            for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
                const batch = db.batch();
                const chunk = ids.slice(i, i + MAX_BATCH_SIZE);
                chunk.forEach(id => {
                    const docRef = db.collection('clientes').doc(id);
                    batch.delete(docRef);
                });
                await batch.commit();
                eliminadosCount += chunk.length;
                 // Pausa breve entre lotes
                 if (i + MAX_BATCH_SIZE < ids.length) {
                     await new Promise(resolve => setTimeout(resolve, 100));
                 }
            }


            return { success: true, message: `Se eliminaron ${eliminadosCount} registros de clientes duplicados exitosamente.` };
        } catch (error) {
            console.error("Error eliminando duplicados:", error);
            return { success: false, message: `Error al eliminar clientes duplicados: ${error.message}` };
        }
    }
};
