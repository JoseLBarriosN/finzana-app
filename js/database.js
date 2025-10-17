// =============================================
// CAPA DE SERVICIO DE FIREBASE (database.js) - CORREGIDO Y MEJORADO
// =============================================

/**
 * Parsea de forma robusta una fecha desde múltiples formatos de entrada.
 * Es la función unificada para toda la aplicación (importación y visualización).
 * @param {string|object|Date} fechaInput La entrada de fecha (string, Timestamp de Firestore, objeto Date).
 * @returns {Date|null} Un objeto Date válido en UTC o null si el formato es irreconocible.
 */
function _parsearFechaDeFormaRobusta(fechaInput) {
    if (!fechaInput) return null;
    if (fechaInput instanceof Date && !isNaN(fechaInput)) return fechaInput;

    // Manejar Timestamp de Firestore
    if (typeof fechaInput === 'object' && typeof fechaInput.toDate === 'function') {
        return fechaInput.toDate();
    }

    if (typeof fechaInput !== 'string') return null;

    const fechaStr = fechaInput.trim();
    if (!fechaStr) return null;

    // Intento 1: Parseo nativo para formatos estándar (ISO 8601, YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
        const fecha = new Date(fechaStr);
        if (!isNaN(fecha.getTime())) {
            // Ajustar a UTC para consistencia
            return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
        }
    }

    // Intento 2: Formatos comunes con separadores (DD-MM-YYYY, MM-DD-YYYY)
    const separador = fechaStr.includes('/') ? '/' : '-';
    const partes = fechaStr.split('T')[0].split(separador);
    if (partes.length !== 3) return null;

    const [p1, p2, p3] = partes.map(p => parseInt(p, 10));
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;

    let anio, mes, dia;

    // Heurística para determinar el formato
    if (p3 > 1000) { // Formato con año al final: DD-MM-YYYY o MM-DD-YYYY
        anio = p3;
        if (p1 > 12) { // Definitivamente es DD-MM-YYYY
            dia = p1; mes = p2;
        } else if (p2 > 12) { // Definitivamente es MM-DD-YYYY
            dia = p2; mes = p1;
        } else { // Ambiguo (ej: 03-04-2023), asumimos DD-MM-YYYY como prioridad para Finzana
            dia = p1; mes = p2;
        }
    } else if (p1 > 1000) { // Formato con año al principio: YYYY-MM-DD
        anio = p1; mes = p2; dia = p3;
    } else {
        return null;
    }

    // Validación final de las partes
    if (!anio || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

    try {
        const fecha = new Date(Date.UTC(anio, mes - 1, dia));
        // Verificar que la fecha no se "desbordó" (ej: 31 de Febrero)
        if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
            return null;
        }
        if (isNaN(fecha.getTime())) {
            return null;
        }
        return fecha;
    } catch (e) {
        return null;
    }
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

    actualizarCliente: async (id, clienteData) => {
        try {
            clienteData.curp = clienteData.curp.toUpperCase();
            await db.collection('clientes').doc(id).update(clienteData);
            return { success: true, message: 'Cliente actualizado exitosamente.' };
        } catch (error) {
            console.error("Error actualizando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    eliminarCliente: async (id) => {
        try {
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

    buscarClientes: async (filtros) => {
        try {
            let query = db.collection('clientes');
            if (filtros.sucursal && filtros.sucursal.trim() !== '') {
                query = query.where('office', '==', filtros.sucursal);
            }
            if (filtros.grupo && filtros.grupo.trim() !== '') {
                query = query.where('poblacion_grupo', '==', filtros.grupo);
            }
            if (filtros.curp && filtros.curp.trim() !== '') {
                query = query.where('curp', '==', filtros.curp.toUpperCase());
            }
            const snapshot = await query.get();
            let clientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error buscando créditos por cliente:", error);
            return [];
        }
    },
    
    /**
     * NUEVA FUNCIÓN OPTIMIZADA
     * Busca todos los créditos para una lista de CURPs usando consultas por lotes.
     * @param {string[]} curps - Un array de CURPs de clientes.
     * @returns {Promise<object[]>} Una lista de todos los créditos encontrados.
     */
    buscarCreditosPorCURPs: async (curps) => {
        if (!curps || curps.length === 0) return [];
        const creditos = [];
        const chunks = [];
        // Firestore limita las consultas 'in' a 30 elementos
        for (let i = 0; i < curps.length; i += 30) {
            chunks.push(curps.slice(i, i + 30));
        }
        try {
            const promises = chunks.map(chunk =>
                db.collection('creditos').where('curpCliente', 'in', chunk).get()
            );
            const snapshots = await Promise.all(promises);
            snapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    creditos.push({ id: doc.id, ...doc.data() });
                });
            });
            return creditos;
        } catch (error) {
            console.error("Error buscando créditos por CURPs:", error);
            return [];
        }
    },
    
    buscarCreditoActivoPorCliente: async (curp) => {
        try {
            const creditos = await database.buscarCreditosPorCliente(curp);
            const creditosActivos = creditos.filter(c => c.estado === 'activo');
            if (creditosActivos.length === 0) return null;
            return creditosActivos.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion))[0];
        } catch (error) {
            console.error("Error buscando crédito activo:", error);
            return null;
        }
    },

    buscarCreditoPorId: async (id) => {
        try {
            const doc = await db.collection('creditos').doc(id).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error buscando crédito por ID:", error);
            return null;
        }
    },

    verificarElegibilidadCliente: async (curp) => {
        const creditoActivo = await database.buscarCreditoActivoPorCliente(curp);
        if (!creditoActivo) {
            return { elegible: true };
        }

        if (!creditoActivo.montoTotal || creditoActivo.montoTotal === 0) {
            return { elegible: false, message: 'El crédito activo actual tiene datos inconsistentes y no se puede verificar.' };
        }

        const porcentajePagado = ((creditoActivo.montoTotal - creditoActivo.saldo) / creditoActivo.montoTotal) * 100;
        if (porcentajePagado >= 80) {
            return { elegible: true };
        } else {
            return {
                elegible: false,
                message: `El cliente ya tiene un crédito activo (ID: ${creditoActivo.id}) con solo un ${porcentajePagado.toFixed(0)}% pagado. Se requiere al menos el 80%.`
            };
        }
    },

    verificarElegibilidadAval: async (curpAval) => {
        if (!curpAval) return { elegible: true };

        try {
            const snapshot = await db.collection('creditos')
                .where('curpAval', '==', curpAval.toUpperCase())
                .where('estado', '==', 'activo')
                .get();

            if (snapshot.empty) {
                return { elegible: true };
            }

            for (const doc of snapshot.docs) {
                const credito = doc.data();
                if (credito.montoTotal > 0) {
                    const porcentajePagado = ((credito.montoTotal - credito.saldo) / credito.montoTotal) * 100;
                    if (porcentajePagado < 80) {
                        return {
                            elegible: false,
                            message: `Este aval ya respalda el crédito ${credito.id}, el cual solo tiene un ${porcentajePagado.toFixed(0)}% de avance. Se requiere el 80% para poder avalar otro.`
                        };
                    }
                }
            }

            return { elegible: true };
        } catch (error) {
            console.error("Error verificando elegibilidad del aval:", error);
            return { elegible: false, message: "Error al consultar la base de datos para el aval." };
        }
    },

    agregarCredito: async (creditoData) => {
        try {
            const creditoActivoAnterior = await database.buscarCreditoActivoPorCliente(creditoData.curpCliente);
            if (creditoActivoAnterior) {
                const elegibilidad = await database.verificarElegibilidadCliente(creditoData.curpCliente);
                if (elegibilidad.elegible) {
                    await db.collection('creditos').doc(creditoActivoAnterior.id).update({ estado: 'liquidado' });
                } else {
                    return { success: false, message: elegibilidad.message };
                }
            }

            const counterRef = db.collection('config').doc('credito-counter');
            let newId;
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(counterRef);
                const currentValue = doc.exists ? doc.data().value : 20000000;
                const newValue = currentValue + 1;
                transaction.set(counterRef, { value: newValue }, { merge: true });
                newId = newValue.toString();
            });

            if (!newId) {
                return { success: false, message: "No se pudo generar el ID de crédito." };
            }

            creditoData.id = newId;
            creditoData.fechaCreacion = new Date().toISOString();
            creditoData.estado = 'activo';
            creditoData.montoTotal = creditoData.monto * 1.3;
            creditoData.saldo = creditoData.montoTotal;
            creditoData.curpCliente = creditoData.curpCliente.toUpperCase();
            creditoData.curpAval = creditoData.curpAval.toUpperCase();

            await db.collection('creditos').doc(newId).set(creditoData);
            return { success: true, message: 'Crédito generado exitosamente.', data: creditoData };
        } catch (error) {
            console.error("Error agregando crédito:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },


    // --- MÉTODOS DE PAGOS ---
    getPagosPorCredito: async (creditoId) => {
        try {
            const snapshot = await db.collection('pagos').where('idCredito', '==', creditoId).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo pagos:", error);
            return [];
        }
    },
    
    /**
     * NUEVA FUNCIÓN OPTIMIZADA
     * Busca todos los pagos para una lista de IDs de crédito usando consultas por lotes.
     * @param {string[]} creditoIds - Un array de IDs de crédito.
     * @returns {Promise<object[]>} Una lista de todos los pagos encontrados.
     */
    getPagosPorCreditoIds: async (creditoIds) => {
        if (!creditoIds || creditoIds.length === 0) return [];
        const pagos = [];
        const chunks = [];
        // Firestore limita las consultas 'in' a 30 elementos
        for (let i = 0; i < creditoIds.length; i += 30) {
            chunks.push(creditoIds.slice(i, i + 30));
        }
        try {
            const promises = chunks.map(chunk =>
                db.collection('pagos').where('idCredito', 'in', chunk).get()
            );
            const snapshots = await Promise.all(promises);
            snapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                    pagos.push({ id: doc.id, ...doc.data() });
                });
            });
            return pagos;
        } catch (error) {
            console.error("Error buscando pagos por IDs de crédito:", error);
            return [];
        }
    },

    agregarPago: async (pagoData) => {
        try {
            const creditoRef = db.collection('creditos').doc(pagoData.idCredito);
            await db.runTransaction(async (transaction) => {
                const creditoDoc = await transaction.get(creditoRef);
                if (!creditoDoc.exists) {
                    throw "El crédito no existe.";
                }
                const credito = creditoDoc.data();
                const nuevoSaldo = credito.saldo - pagoData.monto;
                const actualizacion = {
                    saldo: nuevoSaldo,
                    estado: (nuevoSaldo <= 0.01) ? 'liquidado' : 'activo'
                };
                transaction.update(creditoRef, actualizacion);
                const nuevoPago = {
                    ...pagoData,
                    fecha: new Date().toISOString(),
                    saldoDespues: nuevoSaldo
                };
                const pagoRef = db.collection('pagos').doc();
                transaction.set(pagoRef, nuevoPago);
            });
            return { success: true, message: 'Pago registrado exitosamente.' };
        } catch (error) {
            console.error("Error al registrar pago: ", error);
            return { success: false, message: `Error: ${error}` };
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

        try {
            for (const [i, linea] of lineas.entries()) {
                const campos = linea.split(',').map(c => c.trim());

                if (tipo === 'clientes') {
                    if (campos.length < 7) {
                        errores.push(`Línea ${i + 1}: Faltan columnas (se esperaban 7, se encontraron ${campos.length})`);
                        continue;
                    }
                    const fechaRegistroISO = _parsearFechaDeFormaRobusta(campos[5])?.toISOString();
                    if (!fechaRegistroISO) {
                        errores.push(`Línea ${i + 1}: Fecha de registro inválida ('${campos[5]}'). Se omitirá el registro.`);
                        continue;
                    }
                    const docRef = db.collection('clientes').doc();
                    batch.set(docRef, {
                        curp: campos[0].toUpperCase(),
                        nombre: campos[1],
                        domicilio: campos[2],
                        cp: campos[3],
                        telefono: campos[4],
                        fechaRegistro: fechaRegistroISO,
                        poblacion_grupo: campos[6],
                        office: office,
                        ruta: campos[7] || ''
                    });
                    importados++;
                } else if (tipo === 'colocacion') {
                    const columnasEsperadas = office === 'LEON' ? 20 : 13;
                    if (campos.length < columnasEsperadas) {
                        errores.push(`Línea ${i + 1}: Formato incorrecto para colocación (se esperaban ${columnasEsperadas}, se encontraron ${campos.length})`);
                        continue;
                    }
                    const creditoId = campos[2].trim();
                    if (!creditoId) {
                        errores.push(`Línea ${i + 1}: El ID del crédito está vacío.`);
                        continue;
                    }
                    const fechaCreacionISO = _parsearFechaDeFormaRobusta(campos[3])?.toISOString();
                    if (!fechaCreacionISO) {
                        errores.push(`Línea ${i + 1}: Fecha de creación inválida o vacía ('${campos[3]}').`);
                        continue;
                    }

                    const saldoIndex = office === 'LEON' ? 13 : 12;
                    const saldo = parseFloat(campos[saldoIndex] || 0);

                    const credito = {
                        id: creditoId,
                        office: office,
                        curpCliente: campos[0].toUpperCase(),
                        nombreCliente: campos[1],
                        fechaCreacion: fechaCreacionISO,
                        tipo: campos[4],
                        monto: parseFloat(campos[5] || 0),
                        plazo: parseInt(campos[6] || 0),
                        montoTotal: parseFloat(campos[7] || 0),
                        curpAval: campos[8].toUpperCase(),
                        nombreAval: campos[9],
                        poblacion_grupo: campos[10],
                        ruta: campos[11],
                        saldo: saldo,
                        estado: saldo > 0.01 ? 'activo' : 'liquidado'
                    };
                    const docRef = db.collection('creditos').doc(credito.id);
                    batch.set(docRef, credito, { merge: true });
                    importados++;
                } else if (tipo === 'cobranza') {
                    if (campos.length < 11) {
                        errores.push(`Línea ${i + 1}: Formato incorrecto para cobranza (se esperaban 11, se encontraron ${campos.length})`);
                        continue;
                    }
                    const idCredito = campos[1].trim();
                    const fechaPagoISO = _parsearFechaDeFormaRobusta(campos[2])?.toISOString();
                    const montoPago = parseFloat(campos[3] || 0);

                    if (!idCredito) {
                        errores.push(`Línea ${i + 1}: ID de crédito vacío.`);
                        continue;
                    }
                    if (!fechaPagoISO) {
                        errores.push(`Línea ${i + 1}: Fecha de pago inválida o vacía ('${campos[2]}').`);
                        continue;
                    }
                    if (isNaN(montoPago) || montoPago <= 0) {
                        errores.push(`Línea ${i + 1}: Monto de pago inválido ('${campos[3]}').`);
                        continue;
                    }

                    const pago = {
                        office: office,
                        nombreCliente: campos[0],
                        idCredito: idCredito,
                        fecha: fechaPagoISO,
                        monto: montoPago,
                        cobroSemana: campos[4] || '',
                        comision: parseFloat(campos[5] || 0),
                        tipoPago: (campos[6] || 'normal').toLowerCase(),
                        grupo: campos[7] || '',
                        ruta: campos[8] || '',
                        semanaCredito: campos[9] || '',
                        saldoDespues: parseFloat(campos[10] || 0)
                    };

                    const docRef = db.collection('pagos').doc();
                    batch.set(docRef, pago);
                    importados++;
                }

                batchCounter++;
                if (batchCounter >= 490) {
                    await batch.commit();
                    batch = db.batch();
                    batchCounter = 0;
                }
            }

            if (batchCounter > 0) {
                await batch.commit();
            }

            return { success: true, total: lineas.length, importados: importados, errores: errores };
        } catch (error) {
            console.error("Error en importación masiva: ", error);
            errores.push(`Error crítico en el proceso: ${error.message}`);
            return { success: false, message: `Error crítico: ${error.message}`, total: lineas.length, importados: importados, errores: errores };
        }
    },

    // --- FUNCIONES DE REPORTES ---
    generarReportes: async () => {
        try {
            const [clientesSnap, creditosSnap, pagosSnap] = await Promise.all([
                db.collection('clientes').get(),
                db.collection('creditos').get(),
                db.collection('pagos').get()
            ]);
            const clientes = clientesSnap.docs.map(doc => doc.data());
            const creditos = creditosSnap.docs.map(doc => doc.data());
            const pagos = pagosSnap.docs.map(doc => doc.data());
            const creditosActivos = creditos.filter(c => c.estado === 'activo');
            const totalCartera = creditosActivos.reduce((sum, credito) => sum + (credito.saldo || 0), 0);
            const hoy = new Date();
            const mesActual = hoy.getMonth();
            const anioActual = hoy.getFullYear();
            const totalPagosMes = pagos.filter(pago => {
                if (!pago.fecha) return false;
                const fechaPago = new Date(pago.fecha);
                return fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === anioActual;
            });
            const cobradoMes = totalPagosMes.reduce((sum, pago) => sum + (pago.monto || 0), 0);
            const totalCarteraMasCobrado = totalCartera + cobradoMes;
            const tasaRecuperacion = totalCarteraMasCobrado > 0 ? (cobradoMes / totalCarteraMasCobrado * 100) : 0;
            const totalVencidos = creditosActivos.filter(credito => database.esCreditoVencido(credito)).length;
            return { totalClientes: clientes.length, totalCreditos: creditosActivos.length, totalCartera: totalCartera, totalVencidos: totalVencidos, pagosRegistrados: totalPagosMes.length, cobradoMes: cobradoMes, totalComisiones: totalPagosMes.reduce((sum, pago) => sum + (pago.comision || 0), 0), tasaRecuperacion: tasaRecuperacion };
        } catch (error) {
            console.error("Error generando reportes:", error);
            return null;
        }
    },

    generarReporteAvanzado: async (filtros) => {
        try {
            const resultados = [];
            let queryClientes = db.collection('clientes');
            if (filtros.sucursal) queryClientes = queryClientes.where('office', '==', filtros.sucursal);
            if (filtros.grupo) queryClientes = queryClientes.where('poblacion_grupo', '==', filtros.grupo);
            if (filtros.ruta) queryClientes = queryClientes.where('ruta', '==', filtros.ruta);
            if (filtros.curpCliente) queryClientes = queryClientes.where('curp', '==', filtros.curpCliente.toUpperCase());
            const clientesSnap = await queryClientes.get();
            clientesSnap.forEach(doc => {
                const cliente = doc.data();
                if (database._cumpleFiltroFecha(cliente.fechaRegistro, filtros.fechaInicio, filtros.fechaFin)) {
                    resultados.push({ tipo: 'cliente', ...cliente });
                }
            });

            let queryCreditos = db.collection('creditos');
            if (filtros.sucursal) queryCreditos = queryCreditos.where('office', '==', filtros.sucursal);
            if (filtros.tipoCredito) queryCreditos = queryCreditos.where('tipo', '==', filtros.tipoCredito);
            if (filtros.estadoCredito) queryCreditos = queryCreditos.where('estado', '==', filtros.estadoCredito);
            if (filtros.idCredito) queryCreditos = queryCreditos.where('id', '==', filtros.idCredito);
            const creditosSnap = await queryCreditos.get();
            for (const doc of creditosSnap.docs) {
                const credito = doc.data();
                if (database._cumpleFiltroFecha(credito.fechaCreacion, filtros.fechaInicio, filtros.fechaFin)) {
                    const cliente = await database.buscarClientePorCURP(credito.curpCliente);
                    resultados.push({ tipo: 'credito', ...credito, nombreCliente: cliente ? cliente.nombre : 'N/A', poblacion_grupo: cliente ? cliente.poblacion_grupo : 'N/A', ruta: cliente ? cliente.ruta : 'N/A' });
                }
            }

            let queryPagos = db.collection('pagos');
            if (filtros.sucursal) queryPagos = queryPagos.where('office', '==', filtros.sucursal);
            if (filtros.tipoPago) queryPagos = queryPagos.where('tipoPago', '==', filtros.tipoPago);
            const pagosSnap = await queryPagos.get();
            for (const doc of pagosSnap.docs) {
                const pago = doc.data();
                if (database._cumpleFiltroFecha(pago.fecha, filtros.fechaInicio, filtros.fechaFin)) {
                    const credito = await database.buscarCreditoPorId(pago.idCredito);
                    if (credito) {
                        const cliente = await database.buscarClientePorCURP(credito.curpCliente);
                        resultados.push({ tipo: 'pago', ...pago, nombreCliente: cliente ? cliente.nombre : 'N/A', poblacion_grupo: cliente ? cliente.poblacion_grupo : 'N/A', ruta: cliente ? cliente.ruta : 'N/A', office: credito.office, curpCliente: credito.curpCliente });
                    }
                }
            }

            resultados.sort((a, b) => {
                const fechaA = new Date(a.fecha || a.fechaCreacion || a.fechaRegistro || 0);
                const fechaB = new Date(b.fecha || b.fechaCreacion || b.fechaRegistro || 0);
                return fechaB - fechaA;
            });

            return resultados;
        } catch (error) {
            console.error("Error generando reporte avanzado:", error);
            return [];
        }
    },

    _cumpleFiltroFecha: (fecha, fechaInicio, fechaFin) => {
        if (!fechaInicio && !fechaFin) return true;
        if (!fecha) return false; // Si el registro no tiene fecha, no puede cumplir el filtro
        const fechaObj = new Date(fecha);
        if (fechaInicio) {
            const inicio = new Date(fechaInicio);
            inicio.setUTCHours(0, 0, 0, 0); // Compara desde el inicio del día
            if (fechaObj < inicio) return false;
        }
        if (fechaFin) {
            const fin = new Date(fechaFin);
            fin.setUTCHours(23, 59, 59, 999); // Compara hasta el final del día
            if (fechaObj > fin) return false;
        }
        return true;
    },

    esCreditoVencido: (credito) => {
        if (credito.estado !== 'activo' || !credito.plazo) return false;
        const fechaCreacion = new Date(credito.fechaCreacion);
        const fechaVencimiento = new Date(fechaCreacion);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + (credito.plazo * 7));
        return new Date() > fechaVencimiento;
    },
};
