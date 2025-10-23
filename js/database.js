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
            // Asegurar que tenga rol y sucursal para evitar problemas de permisos
            if (!userData.role || !userData.sucursal) {
                 console.error(`Datos incompletos para usuario ${uid}: Falta rol o sucursal.`);
                 // Puedes devolver un objeto con error o null
                 return { id: doc.id, ...userData, error: "Datos incompletos" };
                 // O simplemente return null; si prefieres tratarlo como no encontrado
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

            if (!dataToUpdate.role || !dataToUpdate.sucursal) {
                return { success: false, message: 'Rol y Sucursal son obligatorios.' };
            }
            if (!['GDL', 'LEON', 'AMBAS'].includes(dataToUpdate.sucursal)) {
                 return { success: false, message: 'Sucursal no válida.' };
            }

            dataToUpdate.fechaModificacion = new Date().toISOString();
            // dataToUpdate.modificadoPor = emailDelAdmin; // Auditoría

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

    buscarClientesPorCURPs: async (curps) => {
        if (!curps || curps.length === 0) return [];
        const upperCaseCurps = curps.map(c => String(c).toUpperCase());
        try {
            const MAX_IN_VALUES = 30;
            const chunks = [];
            for (let i = 0; i < upperCaseCurps.length; i += MAX_IN_VALUES) {
                chunks.push(upperCaseCurps.slice(i, i + MAX_IN_VALUES));
            }
            const promises = chunks.map(chunk =>
                db.collection('clientes').where('curp', 'in', chunk).get()
            );
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

            if (filtros.sucursal) query = query.where('office', '==', filtros.sucursal);
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
    buscarCreditosPorCliente: async (curp) => {
        try {
            const snapshot = await db.collection('creditos').where('curpCliente', '==', curp.toUpperCase()).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error buscando créditos por cliente:", error);
            return [];
        }
    },

    buscarCreditosPorHistoricalId: async (historicalId, options = {}) => {
        try {
            let query = db.collection('creditos').where('historicalIdCredito', '==', historicalId);
            if (options.office) query = query.where('office', '==', options.office);
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

            if (filtros.sucursal) query = query.where('office', '==', filtros.sucursal);
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


    buscarCreditoActivoPorCliente: async (curp) => {
        try {
            const creditos = await database.buscarCreditosPorCliente(curp);
            const estadosNoActivos = ['liquidado']; // Estados que definitivamente no están activos
            // Filtrar créditos que NO estén en estados no activos Y tengan saldo pendiente
            const creditosActivos = creditos.filter(c =>
                 !estadosNoActivos.includes(c.estado) &&
                 (c.saldo === undefined || c.saldo > 0.01)
            );

            if (creditosActivos.length === 0) return null;

            creditosActivos.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
            return creditosActivos[0]; // Devolver el más reciente activo
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

    verificarElegibilidadAval: async (curpAval) => {
        if (!curpAval || curpAval.trim() === '') return { elegible: true };

        try {
            const snapshot = await db.collection('creditos')
                .where('curpAval', '==', curpAval.toUpperCase())
                .get();

            if (snapshot.empty) return { elegible: true };

            for (const doc of snapshot.docs) {
                const credito = doc.data();
                // Omitir créditos liquidados (por estado o saldo)
                if (credito.estado === 'liquidado' || (credito.saldo !== undefined && credito.saldo <= 0.01)) {
                    continue;
                }

                // Si el crédito avalado aún tiene saldo pendiente
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
            return { elegible: false, message: "Error al consultar BD para aval." };
        }
    },

    agregarCredito: async (creditoData, userEmail) => {
        try {
            // Validaciones
            const elegibilidadCliente = await database.verificarElegibilidadCliente(creditoData.curpCliente);
            if (!elegibilidadCliente.elegible) return { success: false, message: elegibilidadCliente.message };
            const elegibilidadAval = await database.verificarElegibilidadAval(creditoData.curpAval);
            if (!elegibilidadAval.elegible) return { success: false, message: elegibilidadAval.message };

            const cliente = await database.buscarClientePorCURP(creditoData.curpCliente);
            if (!cliente) return { success: false, message: "Cliente no encontrado." };

            // Preparar datos (montoTotal y saldo ya vienen calculados y redondeados desde app.js)
            const nuevoCredito = {
                monto: creditoData.monto,
                plazo: creditoData.plazo,
                tipo: creditoData.tipo,
                montoTotal: creditoData.montoTotal,
                saldo: creditoData.saldo, // Saldo inicial = montoTotal
                curpCliente: creditoData.curpCliente.toUpperCase(),
                curpAval: (creditoData.curpAval || '').toUpperCase(),
                nombreAval: creditoData.nombreAval,
                office: cliente.office,
                poblacion_grupo: cliente.poblacion_grupo,
                ruta: cliente.ruta,
                estado: 'activo', // Empezar como activo
                fechaCreacion: new Date().toISOString(),
                creadoPor: userEmail,
                // historicalIdCredito: ??? // No se asigna aquí para nuevos créditos
            };

            const docRef = await db.collection('creditos').add(nuevoCredito);

            // Marcar anterior como liquidado si es renovación/reingreso y cumple condición de saldo cero
            if (creditoData.tipo === 'renovacion' || creditoData.tipo === 'reingreso') {
                const creditoActivoAnterior = await database.buscarCreditoActivoPorCliente(creditoData.curpCliente);
                if (creditoActivoAnterior && creditoActivoAnterior.id !== docRef.id && creditoActivoAnterior.estado !== 'liquidado') {
                     if(creditoActivoAnterior.saldo <= 0.01){
                         await db.collection('creditos').doc(creditoActivoAnterior.id).update({
                             estado: 'liquidado',
                             modificadoPor: userEmail + ' (auto)',
                             fechaModificacion: new Date().toISOString()
                         });
                         console.log(`Crédito anterior ${creditoActivoAnterior.id} marcado como liquidado.`);
                     } else {
                          console.warn(`Intento de renovar/reingresar sin liquidar crédito anterior ${creditoActivoAnterior.id}. Saldo: ${creditoActivoAnterior.saldo}`);
                     }
                }
            }

            // Devolver el ID de Firestore y los datos guardados
            return { success: true, message: 'Crédito generado.', data: { id: docRef.id, ...nuevoCredito } };

        } catch (error) {
            console.error("Error agregando crédito:", error);
            return { success: false, message: `Error al generar crédito: ${error.message}` };
        }
    },


    // --- MÉTODOS DE PAGOS ---
    getPagosPorCredito: async (historicalIdCredito) => {
        try {
            const snapshot = await db.collection('pagos').where('idCredito', '==', historicalIdCredito).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo pagos por historicalIdCredito:", error);
            return [];
        }
    },

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
                if (nuevoSaldo < 0 && nuevoSaldo > -0.01) nuevoSaldo = 0;
                // El estado ('activo', 'atrasado', etc.) se recalcula en la vista, aquí solo marcamos 'liquidado' si aplica
                const nuevoEstadoDB = (nuevoSaldo <= 0.01) ? 'liquidado' : credito.estado;

                transaction.update(creditoRef, {
                    saldo: nuevoSaldo,
                    estado: nuevoEstadoDB, // Actualizar estado solo si se liquida
                    modificadoPor: userEmail,
                    fechaModificacion: new Date().toISOString()
                });

                const pagoRef = db.collection('pagos').doc();
                transaction.set(pagoRef, {
                    idCredito: pagoData.idCredito, // Historical ID
                    monto: pagoData.monto,
                    tipoPago: pagoData.tipoPago,
                    fecha: new Date().toISOString(),
                    saldoDespues: nuevoSaldo, // Guardar saldo después del pago
                    registradoPor: userEmail,
                    office: credito.office,
                    curpCliente: credito.curpCliente,
                    grupo: credito.poblacion_grupo // Guardar grupo del crédito en el pago
                });
            });
            return { success: true, message: 'Pago registrado.' };
        } catch (error) {
            console.error("Error al registrar pago: ", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- IMPORTACIÓN MASIVA ---
    // (Asegúrate que las columnas coincidan y el parseo de fechas sea robusto)
    importarDatosDesdeCSV: async (csvData, tipo, office) => {
        const lineas = csvData.split('\n').filter(linea => linea.trim() && linea.includes(',')); // Filtrar vacías y sin comas
        if (lineas.length === 0) return { success: true, total: 0, importados: 0, errores: [] };

        let errores = [];
        let importados = 0;
        let batch = db.batch();
        let batchCounter = 0;
        const MAX_BATCH_SIZE = 490; // Límite Firestore
        const fechaImportacion = new Date().toISOString();

        // Cache para evitar lecturas repetidas (clientes y créditos existentes)
        let cacheClientes = new Map(); // curp_office -> exists (boolean)
        let cacheCreditos = new Map(); // historicalId_office_curp -> exists (boolean)

        try {
            console.log(`Iniciando importación tipo ${tipo} para ${office}. Líneas: ${lineas.length}`);

             // Pre-cargar caches si es necesario (puede ser lento para grandes volúmenes)
             // Considera omitir pre-carga y verificar individualmente si son demasiados datos
             /*
             if (tipo === 'clientes') {
                 // ... pre-cargar clientes ...
             } else if (tipo === 'colocacion') {
                 // ... pre-cargar créditos ...
             }
             */

            for (const [i, linea] of lineas.entries()) {
                const lineaNum = i + 1;
                // Saltar encabezado simple
                if (linea.toLowerCase().includes('curp,') || linea.toLowerCase().includes('nombre,')) {
                    continue;
                }

                const campos = linea.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

                if (tipo === 'clientes') {
                    if (campos.length < 7) { errores.push(`L${lineaNum}: Faltan columnas (Esperadas 7+, encontradas ${campos.length})`); continue; }
                    const curp = campos[0].toUpperCase();
                    if (!curp || curp.length !== 18) { errores.push(`L${lineaNum}: CURP inválido '${campos[0]}'`); continue; }

                    const cacheKey = `${curp}_${office}`;
                    if (cacheClientes.has(cacheKey)) { errores.push(`L${lineaNum}: Cliente ${curp} ya procesado o existente.`); continue; }

                    // Verificar existencia real si no está en cache (o si no se pre-cargó)
                     if (!cacheClientes.size) { // Si no se precargó el cache
                         const existe = await database.buscarClientePorCURP(curp); // Podríamos optimizar buscando por CURP+Office si es necesario
                         if (existe && existe.office === office) {
                             errores.push(`L${lineaNum}: Cliente ${curp} ya existe en ${office}.`);
                             cacheClientes.set(cacheKey, true); // Marcar como existente
                             continue;
                         }
                     }


                    const fechaRegistroISO = _parsearFechaImportacion(campos[5]);
                    if (!fechaRegistroISO) { errores.push(`L${lineaNum}: Fecha registro inválida '${campos[5]}'`); continue; }

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
                        ruta: campos[7] || '', // Columna 8 si existe
                        fechaCreacion: fechaImportacion, // Auditoría importación
                        creadoPor: 'importacion_csv'
                    });
                    cacheClientes.set(cacheKey, true); // Marcar como procesado/agregado
                    importados++;

                } else if (tipo === 'colocacion') {
                    const minCols = 13; // Ajustar si León tiene más y son obligatorias
                    if (campos.length < minCols) { errores.push(`L${lineaNum}: Faltan columnas (Esperadas ${minCols}+, encontradas ${campos.length})`); continue; }

                    const curpCliente = campos[0].toUpperCase();
                    const historicalIdCredito = campos[2].trim();

                    if (!curpCliente || curpCliente.length !== 18) { errores.push(`L${lineaNum}: CURP cliente inválido '${campos[0]}'`); continue; }
                    if (!historicalIdCredito) { errores.push(`L${lineaNum}: ID Crédito (histórico) vacío.`); continue; }

                    const cacheKey = `${historicalIdCredito}_${office}_${curpCliente}`;
                    if (cacheCreditos.has(cacheKey)) { errores.push(`L${lineaNum}: Crédito ${historicalIdCredito} ya procesado o existente.`); continue; }

                    // Verificar existencia real (si no se pre-cargó cache)
                    if (!cacheCreditos.size) {
                        const existingCredits = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { office: office, curpCliente: curpCliente });
                        if (existingCredits.length > 0) {
                            errores.push(`L${lineaNum}: Crédito ${historicalIdCredito} para ${curpCliente} en ${office} ya existe.`);
                            cacheCreditos.set(cacheKey, true);
                            continue;
                        }
                    }

                    const fechaCreacionISO = _parsearFechaImportacion(campos[3]);
                    if (!fechaCreacionISO) { errores.push(`L${lineaNum}: Fecha creación inválida '${campos[3]}'`); continue; }

                    const montoIndex = 5;
                    const plazoIndex = 6;
                    const montoTotalIndex = 7;
                    const saldoIndex = (office === 'LEON' && campos.length > 13) ? 13 : 12; // Ajustar índice saldo

                    const monto = parseFloat(campos[montoIndex] || 0);
                    const plazo = parseInt(campos[plazoIndex] || 0);
                    let montoTotal = parseFloat(campos[montoTotalIndex] || 0);
                    let saldo = parseFloat(campos[saldoIndex] || 0);

                    // Validaciones y cálculos
                    if (monto <= 0 || plazo <= 0) { errores.push(`L${lineaNum}: Monto o Plazo inválido.`); continue; }
                    if (montoTotal <= 0) montoTotal = monto * 1.3; // Calcular si no viene o es 0
                    if (isNaN(saldo)) saldo = montoTotal; // Asumir saldo completo si no viene o es inválido
                    if (saldo > montoTotal + 0.01) { // Permitir pequeña diferencia
                         errores.push(`L${lineaNum}: Saldo ($${saldo}) > Monto Total ($${montoTotal}). Ajustado a Monto Total.`);
                         saldo = montoTotal;
                    }
                    if (saldo < 0) saldo = 0; // No permitir saldos negativos

                    const estadoCredito = (saldo <= 0.01) ? 'liquidado' : 'activo'; // Estado basado en saldo importado

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

                    // Campos específicos León (si existen)
                    if (office === 'LEON' && campos.length > 14) credito.ultimoPagoFecha = _parsearFechaImportacion(campos[14]);
                    if (office === 'LEON' && campos.length > 15) credito.saldoVencido = parseFloat(campos[15] || 0);

                    const docRef = db.collection('creditos').doc();
                    batch.set(docRef, credito);
                    cacheCreditos.set(cacheKey, true);
                    importados++;

                } else if (tipo === 'cobranza') {
                     const minCols = 11;
                     if (campos.length < minCols) { errores.push(`L${lineaNum}: Faltan columnas (Esperadas ${minCols}+, encontradas ${campos.length})`); continue; }

                     const historicalIdCredito = campos[1].trim();
                     const fechaPagoISO = _parsearFechaImportacion(campos[2]);
                     const montoPago = parseFloat(campos[3] || 0);

                     if (!historicalIdCredito) { errores.push(`L${lineaNum}: ID Crédito (histórico) vacío.`); continue; }
                     if (!fechaPagoISO) { errores.push(`L${lineaNum}: Fecha pago inválida '${campos[2]}'`); continue; }
                     if (isNaN(montoPago) || montoPago <= 0) { errores.push(`L${lineaNum}: Monto pago inválido '${campos[3]}'`); continue; }

                     // Indices ajustados para GDL/LEON
                     const comisionIndex = office === 'LEON' ? 4 : 5;
                     const tipoPagoIndex = office === 'LEON' ? 5 : 6;
                     const grupoIndex = office === 'LEON' ? 6 : 7;
                     const rutaIndex = office === 'LEON' ? 7 : 8;
                     const saldoDespuesIndex = office === 'LEON' ? 9 : 10;

                     // Obtener CURP y Oficina del crédito asociado (necesario para filtros futuros)
                     // Esta consulta puede ralentizar la importación. Considerar hacerla opcional o batch.
                     let curpClientePago = '';
                     let officePago = office; // Asumir oficina actual si no se encuentra
                     const creditosAsoc = await database.buscarCreditosPorHistoricalId(historicalIdCredito, { office: office });
                     if (creditosAsoc.length > 0) {
                         // Tomar datos del crédito más reciente si hay duplicados (raro pero posible)
                         creditosAsoc.sort((a, b) => (parsearFecha(b.fechaCreacion)?.getTime() || 0) - (parsearFecha(a.fechaCreacion)?.getTime() || 0));
                         curpClientePago = creditosAsoc[0].curpCliente;
                         officePago = creditosAsoc[0].office; // Usar la oficina real del crédito
                     } else {
                         errores.push(`L${lineaNum}: No se encontró crédito asociado (${historicalIdCredito}, ${office}) para obtener CURP/Office.`);
                         // Se podría omitir el pago o guardarlo sin CURP/Office? Decisión: Guardarlo, pero marcar el error.
                     }

                     const pago = {
                         idCredito: historicalIdCredito,
                         fecha: fechaPagoISO,
                         monto: montoPago,
                         tipoPago: (campos[tipoPagoIndex] || 'normal').toLowerCase(),
                         comision: parseFloat(campos[comisionIndex] || 0),
                         grupo: campos[grupoIndex] || '',
                         ruta: campos[rutaIndex] || '',
                         saldoDespues: parseFloat(campos[saldoDespuesIndex] || 0), // Puede ser 0 o negativo si se liquida
                         nombreCliente: campos[0] || '', // Referencia
                         registradoPor: 'importacion_csv',
                         fechaImportacion: fechaImportacion,
                         // Añadir datos del crédito si se encontraron
                         curpCliente: curpClientePago,
                         office: officePago
                     };

                     const docRef = db.collection('pagos').doc();
                     batch.set(docRef, pago);
                     importados++;
                 }

                batchCounter++;
                if (batchCounter >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    console.log(`Batch ${Math.ceil(lineaNum / MAX_BATCH_SIZE)} committed.`);
                    batch = db.batch(); // Iniciar nuevo batch
                    batchCounter = 0;
                    await new Promise(resolve => setTimeout(resolve, 50)); // Pausa breve
                }
            } // Fin del bucle for

            if (batchCounter > 0) {
                await batch.commit(); // Commit final
                console.log("Final batch committed.");
            }

            console.log(`Importación finalizada. Importados: ${importados}, Errores: ${errores.length}`);
            return { success: true, total: lineas.length, importados: importados, errores: errores };

        } catch (error) {
            console.error("Error CRÍTICO en importación masiva: ", error);
            errores.push(`Error crítico durante batch: ${error.message}. Algunos datos podrían no haberse guardado.`);
            // Intentar commit final por si acaso
            try { if (batchCounter > 0) await batch.commit(); } catch (commitError) { console.error("Error en commit final:", commitError); }
            return { success: false, message: `Error crítico: ${error.message}`, total: lineas.length, importados: importados, errores: errores };
        }
    },


    // --- FUNCIONES DE REPORTES Y MANTENIMIENTO ---
    generarReportes: async () => {
        try {
            const [clientesSnap, creditosSnap, pagosSnap] = await Promise.all([
                db.collection('clientes').get(),
                db.collection('creditos').get(), // Obtener TODOS para cálculos
                db.collection('pagos').get() // Obtener TODOS los pagos
            ]);

            const clientes = clientesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const creditos = creditosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const pagos = pagosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 1. Créditos Activos/Pendientes y Cartera
            const creditosActivosPendientes = creditos.filter(c => c.estado !== 'liquidado' && (c.saldo === undefined || c.saldo > 0.01));
            const totalCartera = creditosActivosPendientes.reduce((sum, c) => sum + (c.saldo || 0), 0);

            // 2. Pagos del Mes Actual
            const hoy = new Date();
            const primerDiaMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
            const primerDiaMesSiguiente = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1));
            const pagosDelMes = pagos.filter(p => {
                const fechaPago = parsearFecha(p.fecha);
                return fechaPago && fechaPago >= primerDiaMes && fechaPago < primerDiaMesSiguiente;
            });
            const cobradoMes = pagosDelMes.reduce((sum, p) => sum + (p.monto || 0), 0);
            const totalComisionesMes = pagosDelMes.reduce((sum, p) => sum + (p.comision || 0), 0);

            // 3. Créditos Vencidos (usando la lógica de >7 días desde último pago/creación)
            // Agrupar pagos por ID histórico para eficiencia
            const pagosMap = new Map();
            pagos.forEach(p => {
                const key = p.idCredito; // idCredito en pago es historicalId
                if (!pagosMap.has(key)) pagosMap.set(key, []);
                pagosMap.get(key).push(p);
            });

            let totalVencidos = 0;
            creditosActivosPendientes.forEach(credito => {
                 const historicalId = credito.historicalIdCredito || credito.id;
                 const pagosCredito = pagosMap.get(historicalId) || [];
                 // Usar la función esCreditoVencido de este mismo archivo
                 if (database.esCreditoVencido(credito, pagosCredito).vencido) {
                     totalVencidos++;
                 }
            });


            // 4. Tasa de Recuperación (aproximada)
            let cobroEsperadoMes = 0;
            creditosActivosPendientes.forEach(c => {
                if (c.montoTotal && c.plazo > 0) {
                    cobroEsperadoMes += (c.montoTotal / c.plazo) * 4; // 4 semanas/mes
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
            return { totalClientes: 'Error', totalCreditos: 'Error', totalCartera: 'Error', totalVencidos: 'Error', pagosRegistrados: 'Error', cobradoMes: 'Error', totalComisiones: 'Error', tasaRecuperacion: 0 };
        }
    },


    generarReporteAvanzado: async (filtros) => {
         // Asegurarse que esta función también respete la sucursal del filtro si existe
         console.log("Generando reporte avanzado con filtros:", filtros);
         try {
             const resultados = [];
             const clientesMap = new Map(); // Cache clientes

             // --- 1. Obtener Clientes (si aplican filtros de cliente/sucursal) ---
             let clientesFiltrados = null;
             let filtrarCreditosPagosPorCurps = false;
             let curpsClientes = [];

             if (filtros.sucursal || filtros.grupo || filtros.ruta || filtros.curpCliente || filtros.nombre) {
                 clientesFiltrados = await database.buscarClientes({
                     sucursal: filtros.sucursal,
                     grupo: filtros.grupo,
                     ruta: filtros.ruta,
                     curp: filtros.curpCliente, // Puede ser uno o varios
                     nombre: filtros.nombre
                 });
                 clientesFiltrados.forEach(c => clientesMap.set(c.curp, c));
                 curpsClientes = clientesFiltrados.map(c => c.curp);
                 if (curpsClientes.length === 0 && (filtros.curpCliente || filtros.nombre)) return []; // Si buscó por CURP/nombre y no hay, terminar
                 filtrarCreditosPagosPorCurps = true; // Indicar que debemos filtrar por estas CURPs
             }

             // --- 2. Construir Query de Créditos ---
             let queryCreditos = db.collection('creditos');
             // Aplicar filtros directos
             if (filtros.sucursal) queryCreditos = queryCreditos.where('office', '==', filtros.sucursal);
             if (filtros.tipoCredito) queryCreditos = queryCreditos.where('tipo', '==', filtros.tipoCredito);
             if (filtros.estadoCredito) queryCreditos = queryCreditos.where('estado', '==', filtros.estadoCredito); // Filtrar por estado de DB (puede ser impreciso)
             if (filtros.idCredito) queryCreditos = queryCreditos.where('historicalIdCredito', '==', filtros.idCredito);
             if (filtros.grupo) queryCreditos = queryCreditos.where('poblacion_grupo', '==', filtros.grupo);
             if (filtros.ruta) queryCreditos = queryCreditos.where('ruta', '==', filtros.ruta);

             // Filtrar por CURPs si se obtuvieron de la búsqueda de clientes
             const MAX_IN_VALUES = 30;
             if (filtrarCreditosPagosPorCurps && curpsClientes.length > 0) {
                 if (curpsClientes.length <= MAX_IN_VALUES) {
                     queryCreditos = queryCreditos.where('curpCliente', 'in', curpsClientes);
                 } else {
                     console.warn("Demasiados clientes, créditos se filtrarán en memoria.");
                     // No se puede usar 'in', filtrar después
                 }
             } else if (filtrarCreditosPagosPorCurps && curpsClientes.length === 0) {
                  return []; // No hay clientes que coincidan, por tanto no hay créditos/pagos
             }


             // Aplicar filtros de fecha a créditos
             if (filtros.fechaInicio) queryCreditos = queryCreditos.where('fechaCreacion', '>=', new Date(filtros.fechaInicio + 'T00:00:00Z').toISOString());
             if (filtros.fechaFin) {
                  const fechaFinSiguiente = new Date(filtros.fechaFin);
                  fechaFinSiguiente.setUTCDate(fechaFinSiguiente.getUTCDate() + 1);
                  queryCreditos = queryCreditos.where('fechaCreacion', '<', fechaFinSiguiente.toISOString());
             }

             // --- 3. Ejecutar Query Créditos y Procesar ---
             const creditosSnap = await queryCreditos.get();
             for (const doc of creditosSnap.docs) {
                 const credito = { id: doc.id, ...doc.data() };

                 // Filtrado en memoria si no se usó 'in'
                 if (filtrarCreditosPagosPorCurps && curpsClientes.length > MAX_IN_VALUES && !clientesMap.has(credito.curpCliente)) {
                     continue;
                 }

                 let cliente = clientesMap.get(credito.curpCliente);
                 if (!cliente) {
                     cliente = await database.buscarClientePorCURP(credito.curpCliente);
                     if (cliente) clientesMap.set(cliente.curp, cliente);
                 }
                 resultados.push({ tipo: 'credito', ...credito, nombreCliente: cliente?.nombre || 'N/A' });
             }

              // --- 4. Construir Query de Pagos ---
              let queryPagos = db.collection('pagos');
              if (filtros.sucursal) queryPagos = queryPagos.where('office', '==', filtros.sucursal);
              if (filtros.tipoPago) queryPagos = queryPagos.where('tipoPago', '==', filtros.tipoPago);
              if (filtros.idCredito) queryPagos = queryPagos.where('idCredito', '==', filtros.idCredito); // idCredito en pago es historicalId
              if (filtros.grupo) queryPagos = queryPagos.where('grupo', '==', filtros.grupo); // Usar campo grupo en pago
              if (filtros.ruta) queryPagos = queryPagos.where('ruta', '==', filtros.ruta); // Usar campo ruta en pago


             // Filtrar pagos por CURPs
             if (filtrarCreditosPagosPorCurps && curpsClientes.length > 0) {
                 if (curpsClientes.length <= MAX_IN_VALUES) {
                     queryPagos = queryPagos.where('curpCliente', 'in', curpsClientes);
                 } else {
                      console.warn("Demasiados clientes, pagos se filtrarán en memoria.");
                      // Filtrar después
                 }
             } else if (filtrarCreditosPagosPorCurps && curpsClientes.length === 0) {
                 // No hacer query de pagos si no hay clientes
             }


             // Aplicar filtros de fecha a pagos
             if (filtros.fechaInicio) queryPagos = queryPagos.where('fecha', '>=', new Date(filtros.fechaInicio + 'T00:00:00Z').toISOString());
             if (filtros.fechaFin) {
                  const fechaFinSiguientePago = new Date(filtros.fechaFin);
                  fechaFinSiguientePago.setUTCDate(fechaFinSiguientePago.getUTCDate() + 1);
                  queryPagos = queryPagos.where('fecha', '<', fechaFinSiguientePago.toISOString());
             }


              // --- 5. Ejecutar Query Pagos y Procesar ---
             // Solo ejecutar si hay posibilidad de pagos (o no se filtró por clientes)
             if (!filtrarCreditosPagosPorCurps || curpsClientes.length > 0) {
                  const pagosSnap = await queryPagos.get();
                  for (const doc of pagosSnap.docs) {
                      const pago = { id: doc.id, ...doc.data() };

                      // Filtrado en memoria si fue necesario
                      if (filtrarCreditosPagosPorCurps && curpsClientes.length > MAX_IN_VALUES && !clientesMap.has(pago.curpCliente)) {
                          continue;
                      }

                      let cliente = clientesMap.get(pago.curpCliente);
                      if (!cliente) {
                          cliente = await database.buscarClientePorCURP(pago.curpCliente);
                          if (cliente) clientesMap.set(cliente.curp, cliente);
                      }
                      resultados.push({ tipo: 'pago', ...pago, nombreCliente: cliente?.nombre || pago.nombreCliente || 'N/A' });
                  }
             }


             // --- 6. Añadir Clientes Nuevos en Rango de Fechas (si no se filtró por ID crédito/pago) ---
             if (!filtros.idCredito && !filtros.tipoPago && filtros.fechaInicio && filtros.fechaFin) {
                 let queryNuevosClientes = db.collection('clientes');
                 if(filtros.sucursal) queryNuevosClientes = queryNuevosClientes.where('office', '==', filtros.sucursal);
                 // Añadir otros filtros si aplican a clientes (grupo, ruta)
                 if(filtros.grupo) queryNuevosClientes = queryNuevosClientes.where('poblacion_grupo', '==', filtros.grupo);
                 if(filtros.ruta) queryNuevosClientes = queryNuevosClientes.where('ruta', '==', filtros.ruta);

                 queryNuevosClientes = queryNuevosClientes.where('fechaRegistro', '>=', new Date(filtros.fechaInicio + 'T00:00:00Z').toISOString());
                 const fechaFinSiguienteCliente = new Date(filtros.fechaFin);
                 fechaFinSiguienteCliente.setUTCDate(fechaFinSiguienteCliente.getUTCDate() + 1);
                 queryNuevosClientes = queryNuevosClientes.where('fechaRegistro', '<', fechaFinSiguienteCliente.toISOString());

                 // Si ya filtramos por CURP/nombre, aplicar esos filtros aquí también si es posible
                 // (Complejo, podría requerir filtrar en memoria después)

                 const nuevosClientesSnap = await queryNuevosClientes.get();
                 nuevosClientesSnap.forEach(doc => {
                      const clienteNuevo = { id: doc.id, ...doc.data() };
                       // Evitar añadir si ya está por crédito/pago? No, el reporte es de operaciones.
                       // Verificar si cumple filtros de nombre/curp si se aplicaron antes y no se pudo en query
                       let coincide = true;
                       if (filtros.nombre && !(clienteNuevo.nombre || '').toLowerCase().includes(filtros.nombre.toLowerCase())) coincide = false;
                       if (filtros.curpCliente && !filtros.curpCliente.split(',').map(c=>c.trim().toUpperCase()).includes(clienteNuevo.curp)) coincide = false;

                       if(coincide) {
                            resultados.push({ tipo: 'cliente', ...clienteNuevo });
                       }
                 });
             }

             // --- 7. Ordenar Resultados por Fecha Descendente ---
             resultados.sort((a, b) => {
                 // Usar fecha de operación (pago, creación crédito, registro cliente)
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
         // Asegurarse que esta función respete sucursal/grupo
         try {
             let creditosQuery = db.collection('creditos');
             let pagosQuery = db.collection('pagos');

             if (filtros.sucursal) {
                 creditosQuery = creditosQuery.where('office', '==', filtros.sucursal);
                 pagosQuery = pagosQuery.where('office', '==', filtros.sucursal);
             }
             if (filtros.grupo) {
                 creditosQuery = creditosQuery.where('poblacion_grupo', '==', filtros.grupo);
                 pagosQuery = pagosQuery.where('grupo', '==', filtros.grupo); // Campo 'grupo' en pagos
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

             const [creditosSnap, pagosSnap] = await Promise.all([
                 creditosQuery.get(),
                 pagosQuery.get()
             ]);

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
            const inicio = new Date(fechaInicio + 'T00:00:00Z'); // Comparar UTC
            if (fechaObj < inicio) return false;
        }
        if (fechaFin) {
            const fin = new Date(fechaFin + 'T23:59:59Z'); // Comparar UTC hasta fin del día
            if (fechaObj > fin) return false;
        }
        return true;
    },

    /**
     * Determina si un crédito está vencido según reglas de negocio (>7 días sin pago).
     * @param {object} credito Objeto del crédito.
     * @param {Array<object>} pagos Array de pagos asociados (ordenados desc por fecha).
     * @returns {object} { vencido: boolean }
     */
    esCreditoVencido: (credito, pagos) => {
        // No vencido si está liquidado (por estado o saldo)
        if (!credito || credito.estado === 'liquidado' || (credito.saldo !== undefined && credito.saldo <= 0.01)) {
            return { vencido: false };
        }

        const hoy = new Date();
        let fechaReferencia = null;

        if (pagos && pagos.length > 0) {
            // Asume que los pagos ya están ordenados desc por fecha si vienen de otra función
            fechaReferencia = parsearFecha(pagos[0].fecha); // Tomar el más reciente
        } else {
            // Si no hay pagos, usar fecha de creación
            fechaReferencia = parsearFecha(credito.fechaCreacion);
        }

        if (!fechaReferencia) {
            console.warn("Vencimiento no determinable (fecha ref inválida):", credito.id);
            return { vencido: false }; // No se puede determinar
        }

        const msDesdeReferencia = hoy.getTime() - fechaReferencia.getTime();
        const diasDesdeReferencia = Math.floor(msDesdeReferencia / (1000 * 60 * 60 * 24));

        // Vencido si han pasado más de 7 días
        return { vencido: diasDesdeReferencia > 7 };
    },


    // *** LIMPIEZA DE DUPLICADOS ***
    encontrarClientesDuplicados: async () => { /* ... sin cambios ... */ },
    ejecutarEliminacionDuplicados: async (ids) => { /* ... sin cambios ... */ },

    // =============================================
    // *** FUNCIONES PLACEHOLDER PARA ADMIN (Poblaciones/Rutas) ***
    // =============================================
    obtenerPoblaciones: async (sucursal = null) => {
        try {
            let query = db.collection('poblaciones');
            if (sucursal && sucursal !== 'AMBAS') query = query.where('sucursal', '==', sucursal);
            const snapshot = await query.orderBy('nombre').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
             console.error("Error obteniendo poblaciones:", error); return []; // Devolver vacío en error
        }
    },
    agregarPoblacion: async (nombre, sucursal) => {
        console.warn("Función agregarPoblacion no implementada.");
        return { success: false, message: "Función no implementada." };
    },
    eliminarPoblacion: async (id) => {
        console.warn("Función eliminarPoblacion no implementada.");
        return { success: false, message: "Función no implementada." };
    },
     obtenerRutas: async (sucursal = null) => {
         try {
             let query = db.collection('rutas');
             if (sucursal && sucursal !== 'AMBAS') query = query.where('sucursal', '==', sucursal);
             const snapshot = await query.orderBy('nombre').get();
             return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
         } catch (error) {
              console.error("Error obteniendo rutas:", error); return [];
         }
     },
     agregarRuta: async (nombre, sucursal) => {
         console.warn("Función agregarRuta no implementada.");
         return { success: false, message: "Función no implementada." };
     },
     eliminarRuta: async (id) => {
         console.warn("Función eliminarRuta no implementada.");
         return { success: false, message: "Función no implementada." };
     }

}; // Fin del objeto database
