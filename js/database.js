// =============================================
// CAPA DE SERVICIO DE FIREBASE (database.js) - CORREGIDO Y MEJORADO
// =============================================

/**
 * Parsea de forma segura una fecha desde un string de importación (dd-mm-yyyy, yyyy-mm-dd, ISO).
 * @param {string} fechaStr La cadena de texto de la fecha.
 * @returns {string|null} Un string en formato ISO 8601 válido o null si el formato es incorrecto.
 */
function _parsearFechaImportacion(fechaStr) {
    if (!fechaStr || typeof fechaStr !== 'string') return null;

    // Intenta parsear como ISO 8601 directamente (formato YYYY-MM-DDTHH:mm:ss.sssZ)
    if (fechaStr.includes('T') && fechaStr.includes('Z')) {
        const fecha = new Date(fechaStr);
        if (!isNaN(fecha.getTime())) {
            return fecha.toISOString();
        }
    }

    // Detecta el separador y divide la fecha en partes
    const separador = fechaStr.includes('-') ? '-' : (fechaStr.includes('/') ? '/' : null);
    if (!separador) {
        // Si no hay separador, podría ser un formato como 'YYYYMMDD' o un timestamp, pero es ambiguo.
        // Por ahora, intentamos un parseo directo.
        const fechaDirecta = new Date(fechaStr);
        if (!isNaN(fechaDirecta.getTime())) {
            return fechaDirecta.toISOString();
        }
        return null;
    }

    const partes = fechaStr.split('T')[0].split(separador); // Ignora la parte de la hora si existe
    if (partes.length !== 3) return null;

    let anio, mes, dia;

    // Formato YYYY-MM-DD
    if (partes[0].length === 4) {
        [anio, mes, dia] = partes;
    }
    // Formato DD-MM-YYYY
    else if (partes[2].length === 4) {
        [dia, mes, anio] = partes;
    }
    // Formato ambiguo (ej. MM-DD-YY), no soportado para evitar errores.
    else {
        return null;
    }
    
    // Valida que las partes sean números válidos
    const diaNum = parseInt(dia, 10);
    const mesNum = parseInt(mes, 10);
    const anioNum = parseInt(anio, 10);

    if (isNaN(diaNum) || isNaN(mesNum) || isNaN(anioNum) || mesNum < 1 || mesNum > 12 || diaNum < 1 || diaNum > 31) {
        return null;
    }

    // Construye un objeto Date en UTC para evitar problemas de zona horaria
    const fecha = new Date(Date.UTC(anioNum, mesNum - 1, diaNum));
    
    // Comprobación final de validez
    if (isNaN(fecha.getTime())) return null;

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

    agregarCliente: async (clienteData) => {
        try {
            if (!clienteData.id) {
                const existe = await database.buscarClientePorCURP(clienteData.curp);
                if (existe) {
                    return { success: false, message: 'Ya existe un cliente con esta CURP.' };
                }
            }
            if (!clienteData.fechaRegistro) {
                clienteData.fechaRegistro = new Date().toISOString();
            }
            clienteData.curp = clienteData.curp.toUpperCase();
            await db.collection('clientes').add(clienteData);
            return { success: true, message: 'Cliente registrado exitosamente.' };
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

    buscarCreditoActivoPorCliente: async (curp) => {
        try {
            const snapshot = await db.collection('creditos').where('curpCliente', '==', curp.toUpperCase()).where('estado', '==', 'activo').limit(1).get();
            if (snapshot.empty) return null;
            return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
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

    agregarCredito: async (creditoData) => {
        try {
            const counterRef = db.collection('config').doc('credito-counter');
            const counterDoc = await counterRef.get();
            if (!counterDoc.exists) {
                await counterRef.set({ value: 20000000 });
            }
            let newId;
            try {
                newId = await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(counterRef);
                    const newValue = (doc.data().value || 20000000) + 1;
                    transaction.update(counterRef, { value: newValue });
                    return newValue.toString();
                });
            } catch (e) {
                console.error("Error en transacción de contador:", e);
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
            // === INICIO DE CORRECCIÓN ===
            // Se elimina el .orderBy('fecha', 'desc') para evitar errores de Firestore con formatos de fecha mixtos.
            // El ordenamiento ahora se hará en el lado del cliente (en app.js) para mayor robustez.
            const snapshot = await db.collection('pagos').where('idCredito', '==', creditoId).get();
            // === FIN DE CORRECCIÓN ===
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo pagos:", error);
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
                    const fechaRegistro = _parsearFechaImportacion(campos[5]) || new Date().toISOString();
                    const docRef = db.collection('clientes').doc();
                    batch.set(docRef, {
                        curp: campos[0].toUpperCase(),
                        nombre: campos[1],
                        domicilio: campos[2],
                        cp: campos[3],
                        telefono: campos[4],
                        fechaRegistro: fechaRegistro,
                        poblacion_grupo: campos[6],
                        office: office,
                        ruta: campos[7] || ''
                    });
                    importados++;
                } else if (tipo === 'colocacion') {
                    if (campos.length < 13) {
                        errores.push(`Línea ${i + 1}: Formato incorrecto para colocación (se esperaban 13, se encontraron ${campos.length})`);
                        continue;
                    }
                    const creditoId = campos[2].trim();
                    if (!creditoId) {
                        errores.push(`Línea ${i + 1}: El ID del crédito está vacío.`);
                        continue;
                    }
                    const fechaCreacion = _parsearFechaImportacion(campos[3]);
                    if (!fechaCreacion) {
                        errores.push(`Línea ${i + 1}: Fecha de creación inválida o vacía ('${campos[3]}').`);
                        continue;
                    }
                    const saldo = parseFloat(campos[12] || 0);
                    const credito = {
                        id: creditoId,
                        office: office,
                        curpCliente: campos[0].toUpperCase(),
                        nombreCliente: campos[1],
                        fechaCreacion: fechaCreacion,
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
                    batch.set(docRef, credito);
                    importados++;
                } else if (tipo === 'cobranza') {
                     if (campos.length < 11) {
                        errores.push(`Línea ${i + 1}: Formato incorrecto para cobranza (se esperaban 11, se encontraron ${campos.length})`);
                        continue;
                    }
                    const idCredito = campos[1];
                    const fechaPago = _parsearFechaImportacion(campos[2]);
                    const montoPago = parseFloat(campos[3] || 0);

                    if (!idCredito) {
                        errores.push(`Línea ${i + 1}: ID de crédito vacío.`);
                        continue;
                    }
                    if (!fechaPago) {
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
                        fecha: fechaPago,
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
        const fechaObj = new Date(fecha);
        if (fechaInicio) {
            const inicio = new Date(fechaInicio);
            if (fechaObj < inicio) return false;
        }
        if (fechaFin) {
            const fin = new Date(fechaFin);
            fin.setHours(23, 59, 59, 999);
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
