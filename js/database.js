// =============================================
// CAPA DE SERVICIO DE FIREBASE (database.js)
// =============================================

const database = {
    // Habilita la persistencia offline de Firestore.
    enableOffline: () => {
        db.enablePersistence().catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn('Persistencia offline falló: Múltiples pestañas abiertas.');
            } else if (err.code == 'unimplemented') {
                console.warn('Persistencia offline no disponible en este navegador.');
            }
        });
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

    // --- MÉTODOS DE CLIENTES ---
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
            const existe = await database.buscarClientePorCURP(clienteData.curp);
            if (existe) {
                return { success: false, message: 'Ya existe un cliente con esta CURP.' };
            }
            if (!clienteData.fechaRegistro) {
                clienteData.fechaRegistro = new Date().toISOString();
            }
            clienteData.curp = clienteData.curp.toUpperCase();
            await db.collection('clientes').add(clienteData);
            return { success: true, message: 'Cliente registrado en la nube.' };
        } catch (error) {
            console.error("Error agregando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    buscarClientes: async (filtros) => {
        try {
            let query = db.collection('clientes');

            // Aplicar filtros condicionalmente
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

            // Aplicar filtros adicionales en memoria
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
            let newId;
            
            try {
                newId = await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(counterRef);
                    if (!doc.exists) {
                        throw "Documento de contador no encontrado. Por favor, créalo en Firestore.";
                    }
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
            return { success: true, message: 'Crédito generado en la nube.', data: creditoData };
        } catch (error) {
            console.error("Error agregando crédito:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // --- MÉTODOS DE PAGOS ---
    getPagosPorCredito: async (creditoId) => {
        try {
            const snapshot = await db.collection('pagos').where('idCredito', '==', creditoId).orderBy('fecha', 'desc').get();
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

        const batch = db.batch();
        let errores = [];
        let importados = 0;

        try {
            if (tipo === 'clientes') {
                for (const [i, linea] of lineas.entries()) {
                    const campos = linea.split(',').map(c => c.trim());
                    if (campos.length < 7) { 
                        errores.push(`Línea ${i + 1}: Faltan columnas`); 
                        continue; 
                    }
                    
                    const docRef = db.collection('clientes').doc();
                    batch.set(docRef, {
                        curp: campos[0].toUpperCase(), 
                        nombre: campos[1], 
                        domicilio: campos[2], 
                        cp: campos[3],
                        telefono: campos[4], 
                        fechaRegistro: campos[5] || new Date().toISOString(),
                        poblacion_grupo: campos[6], 
                        office: office,
                        ruta: campos[7] || ''
                    });
                    importados++;
                }
                await batch.commit();
                
            } else if (tipo === 'colocacion') {
                const procesador = (office === 'GDL') ? database._procesarColocacionGDL : database._procesarColocacionLEON;
                for (const [i, linea] of lineas.entries()) {
                    const credito = procesador(linea, i, office, errores);
                    if (credito && credito.id) {
                        const docRef = db.collection('creditos').doc(credito.id);
                        batch.set(docRef, credito);
                        importados++;
                    }
                }
                await batch.commit();
                
            } else if (tipo === 'cobranza') {
                // Para cobranza, procesamos uno por uno usando agregarPago
                const procesador = (office === 'GDL') ? database._procesarCobranzaGDL : database._procesarCobranzaLEON;
                
                for (const [i, linea] of lineas.entries()) {
                    try {
                        const resultado = procesador(linea, i, office, errores);
                        if (resultado.pago && resultado.pago.idCredito) {
                            // Usar la función existente de agregar pago
                            const pagoResult = await database.agregarPago(resultado.pago);
                            if (pagoResult.success) {
                                importados++;
                            } else {
                                errores.push(`Línea ${i + 1}: ${pagoResult.message}`);
                            }
                        }
                    } catch (error) {
                        errores.push(`Línea ${i + 1}: ${error.message}`);
                    }
                }
            }

            return { 
                success: true, 
                total: lineas.length, 
                importados: importados, 
                errores: errores 
            };
        } catch (error) {
            console.error("Error en importación masiva: ", error);
            return { 
                success: false, 
                message: `Error crítico: ${error.message}`, 
                errores: [error.message] 
            };
        }
    },

    _procesarColocacionGDL: (linea, i, office, errores) => {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length < 13) { 
            errores.push(`Línea ${i + 1}: Formato GDL-Colocación incorrecto`); 
            return null; 
        }
        return {
            id: campos[2], 
            office, 
            curpCliente: campos[0].toUpperCase(), 
            nombreCliente: campos[1],
            fechaCreacion: campos[3], 
            tipo: campos[4], 
            monto: parseFloat(campos[5] || 0),
            plazo: parseInt(campos[6] || 0), 
            montoTotal: parseFloat(campos[7] || 0), 
            curpAval: campos[8].toUpperCase(),
            nombreAval: campos[9], 
            poblacion_grupo: campos[10], 
            ruta: campos[11],
            saldo: parseFloat(campos[12] || 0), 
            estado: parseFloat(campos[12] || 0) > 0.01 ? 'activo' : 'liquidado'
        };
    },

    _procesarColocacionLEON: (linea, i, office, errores) => {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length < 20) { 
            errores.push(`Línea ${i + 1}: Formato LEON-Colocación incorrecto`); 
            return null; 
        }
        return {
            id: campos[2], 
            office, 
            curpCliente: campos[0].toUpperCase(), 
            nombreCliente: campos[1],
            fechaCreacion: campos[3], 
            tipo: campos[4], 
            monto: parseFloat(campos[5] || 0),
            plazo: parseInt(campos[6] || 0), 
            montoTotal: parseFloat(campos[7] || 0), 
            curpAval: campos[8].toUpperCase(),
            nombreAval: campos[9], 
            poblacion_grupo: campos[10], 
            ruta: campos[11],
            interes: parseFloat(campos[12] || 0), 
            saldo: parseFloat(campos[13] || 0),
            ultimoPago: campos[14], 
            saldoVencido: parseFloat(campos[15] || 0), 
            status: campos[16],
            saldoCapital: parseFloat(campos[17] || 0), 
            saldoInteres: parseFloat(campos[18] || 0), 
            stj150: campos[19],
            estado: parseFloat(campos[13] || 0) > 0.01 ? 'activo' : 'liquidado'
        };
    },

    _procesarCobranzaGDL: (linea, i, office, errores) => {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length < 11) { 
            errores.push(`Línea ${i + 1}: Formato GDL-Cobranza incorrecto`); 
            return { pago: null }; 
        }
        const pago = {
            office, 
            idCredito: campos[1], 
            monto: parseFloat(campos[3] || 0),
            tipoPago: 'normal'
        };
        return { pago };
    },

    _procesarCobranzaLEON: (linea, i, office, errores) => {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length < 11) { 
            errores.push(`Línea ${i + 1}: Formato LEON-Cobranza incorrecto`); 
            return { pago: null }; 
        }
        const pago = {
            office, 
            idCredito: campos[1], 
            monto: parseFloat(campos[3] || 0),
            tipoPago: 'normal'
        };
        return { pago };
    },

    // --- FUNCIONES DE REPORTES Y LÓGICA DE NEGOCIO ---
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

            // Calcular tasa de recuperación
            const totalCarteraMasCobrado = totalCartera + cobradoMes;
            const tasaRecuperacion = totalCarteraMasCobrado > 0 ? 
                (cobradoMes / totalCarteraMasCobrado * 100) : 0;

            // Contar créditos vencidos
            const totalVencidos = creditosActivos.filter(credito => {
                return database.esCreditoVencido(credito);
            }).length;

            return {
                totalClientes: clientes.length,
                totalCreditos: creditosActivos.length,
                totalCartera: totalCartera,
                totalVencidos: totalVencidos,
                pagosRegistrados: totalPagosMes.length,
                cobradoMes: cobradoMes,
                totalComisiones: totalPagosMes.reduce((sum, pago) => sum + (pago.comision || 0), 0),
                tasaRecuperacion: tasaRecuperacion
            };
        } catch (error) {
            console.error("Error generando reportes:", error);
            return null;
        }
    },

    generarReporteAvanzado: async (filtros) => {
        try {
            const resultados = [];

            // Obtener clientes
            let queryClientes = db.collection('clientes');
            if (filtros.sucursal) queryClientes = queryClientes.where('office', '==', filtros.sucursal);
            if (filtros.grupo) queryClientes = queryClientes.where('poblacion_grupo', '==', filtros.grupo);
            if (filtros.ruta) queryClientes = queryClientes.where('ruta', '==', filtros.ruta);
            if (filtros.curpCliente) queryClientes = queryClientes.where('curp', '==', filtros.curpCliente.toUpperCase());

            const clientesSnap = await queryClientes.get();
            clientesSnap.forEach(doc => {
                const cliente = doc.data();
                if (this._cumpleFiltroFecha(cliente.fechaRegistro, filtros.fechaInicio, filtros.fechaFin)) {
                    resultados.push({
                        tipo: 'cliente',
                        ...cliente
                    });
                }
            });

            // Obtener créditos
            let queryCreditos = db.collection('creditos');
            if (filtros.sucursal) queryCreditos = queryCreditos.where('office', '==', filtros.sucursal);
            if (filtros.tipoCredito) queryCreditos = queryCreditos.where('tipo', '==', filtros.tipoCredito);
            if (filtros.estadoCredito) queryCreditos = queryCreditos.where('estado', '==', filtros.estadoCredito);
            if (filtros.idCredito) queryCreditos = queryCreditos.where('id', '==', filtros.idCredito);

            const creditosSnap = await queryCreditos.get();
            for (const doc of creditosSnap.docs) {
                const credito = doc.data();
                if (this._cumpleFiltroFecha(credito.fechaCreacion, filtros.fechaInicio, filtros.fechaFin)) {
                    // Buscar información del cliente para el crédito
                    const cliente = await database.buscarClientePorCURP(credito.curpCliente);
                    resultados.push({
                        tipo: 'credito',
                        ...credito,
                        nombreCliente: cliente ? cliente.nombre : 'N/A',
                        poblacion_grupo: cliente ? cliente.poblacion_grupo : 'N/A',
                        ruta: cliente ? cliente.ruta : 'N/A'
                    });
                }
            }

            // Obtener pagos
            let queryPagos = db.collection('pagos');
            if (filtros.sucursal) queryPagos = queryPagos.where('office', '==', filtros.sucursal);
            if (filtros.tipoPago) queryPagos = queryPagos.where('tipoPago', '==', filtros.tipoPago);

            const pagosSnap = await queryPagos.get();
            for (const doc of pagosSnap.docs) {
                const pago = doc.data();
                if (this._cumpleFiltroFecha(pago.fecha, filtros.fechaInicio, filtros.fechaFin)) {
                    // Buscar información del crédito y cliente para el pago
                    const credito = await database.buscarCreditoPorId(pago.idCredito);
                    if (credito) {
                        const cliente = await database.buscarClientePorCURP(credito.curpCliente);
                        resultados.push({
                            tipo: 'pago',
                            ...pago,
                            nombreCliente: cliente ? cliente.nombre : 'N/A',
                            poblacion_grupo: cliente ? cliente.poblacion_grupo : 'N/A',
                            ruta: cliente ? cliente.ruta : 'N/A',
                            office: credito.office,
                            curpCliente: credito.curpCliente
                        });
                    }
                }
            }

            // Ordenar por fecha (más reciente primero)
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
            fin.setHours(23, 59, 59, 999); // Incluir todo el día
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
    }
};

// Activa la magia del modo offline en cuanto el script carga.
database.enableOffline();
