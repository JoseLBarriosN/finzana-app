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

    // --- MÉTODOS DE CLIENTES ---
    buscarClientePorCURP: async (curp) => {
        const snapshot = await db.collection('clientes').where('curp', '==', curp).limit(1).get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    },

    agregarCliente: async (clienteData) => {
        const existe = await database.buscarClientePorCURP(clienteData.curp);
        if (existe) {
            return { success: false, message: 'Ya existe un cliente con esta CURP.' };
        }
        if (!clienteData.fechaRegistro) {
            clienteData.fechaRegistro = new Date().toISOString();
        }
        await db.collection('clientes').add(clienteData);
        return { success: true, message: 'Cliente registrado en la nube.' };
    },
    
    buscarClientes: async (filtros) => {
        let query = db.collection('clientes');

        if (filtros.sucursal) {
            query = query.where('office', '==', filtros.sucursal);
        }
        if (filtros.grupo) {
            query = query.where('poblacion_grupo', '==', filtros.grupo);
        }
        if (filtros.curp) {
            query = query.where('curp', '==', filtros.curp);
        }

        const snapshot = await query.get();
        let clientes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (filtros.nombre) {
            clientes = clientes.filter(c => c.nombre.toLowerCase().includes(filtros.nombre));
        }

        return clientes;
    },

    // --- MÉTODOS DE CRÉDITOS ---
    buscarCreditosPorCliente: async (curp) => {
        const snapshot = await db.collection('creditos').where('curpCliente', '==', curp).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    
    buscarCreditoActivoPorCliente: async (curp) => {
        const snapshot = await db.collection('creditos').where('curpCliente', '==', curp).where('estado', '==', 'activo').limit(1).get();
        if (snapshot.empty) return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    },

    buscarCreditoPorId: async (id) => {
        const doc = await db.collection('creditos').doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    },

    agregarCredito: async (creditoData) => {
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

        await db.collection('creditos').doc(newId).set(creditoData);
        return { success: true, message: 'Crédito generado en la nube.', data: creditoData };
    },

    // --- MÉTODOS DE PAGOS ---
    getPagosPorCredito: async (creditoId) => {
        const snapshot = await db.collection('pagos').where('idCredito', '==', creditoId).orderBy('fecha', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    agregarPago: async (pagoData) => {
        const creditoRef = db.collection('creditos').doc(pagoData.idCredito);

        try {
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
                    if (campos.length < 7) { errores.push(`Línea ${i + 1}: Faltan columnas`); continue; }
                    const docRef = db.collection('clientes').doc(); // Firestore genera el ID
                    batch.set(docRef, {
                        curp: campos[0], nombre: campos[1], domicilio: campos[2], cp: campos[3],
                        telefono: campos[4], fechaRegistro: campos[5] || new Date().toISOString(),
                        poblacion_grupo: campos[6], office: office
                    });
                    importados++;
                }
            } else if (tipo === 'colocacion') {
                const procesador = (office === 'GDL') ? database._procesarColocacionGDL : database._procesarColocacionLEON;
                for (const [i, linea] of lineas.entries()) {
                    const credito = procesador(linea, i, office, errores);
                    if (credito && credito.id) {
                        const docRef = db.collection('creditos').doc(credito.id);
                        batch.set(docRef, credito);
                        importados++;
                    } else if (!errores.find(e => e.includes(`Línea ${i+1}`))) {
                        errores.push(`Línea ${i+1}: ID de crédito inválido o faltante.`);
                    }
                }
            } else if (tipo === 'cobranza') {
                // La importación de cobranza es más compleja y se ejecuta una por una para actualizar saldos.
                // Esto es más lento pero garantiza la integridad de los datos.
                console.warn("Importación de cobranza se realizará registro por registro.");
                const procesador = (office === 'GDL') ? database._procesarCobranzaGDL : database._procesarCobranzaLEON;
                for (const [i, linea] of lineas.entries()) {
                    const {pago, creditoActualizado} = procesador(linea, i, office, {}, errores); // No se usa creditosMap aquí
                    if (pago && creditoActualizado) {
                        try {
                            await database.agregarPago(pago); // Reutiliza la lógica de transacción
                            importados++;
                        } catch (e) {
                            errores.push(`Línea ${i+1}: Error al procesar pago - ${e.message}`);
                        }
                    }
                }
            }

            if (tipo !== 'cobranza') {
                 await batch.commit();
            }

            return { success: true, total: lineas.length, importados: importados, errores };
        } catch(error) {
            console.error("Error en importación masiva: ", error);
            return { success: false, message: `Error crítico durante la importación: ${error.message}`, errores: [error.message] };
        }
    },
    
    _procesarColocacionGDL: (linea, i, office, errores) => {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length < 13) { errores.push(`Línea ${i + 1}: Formato GDL-Colocación incorrecto`); return null; }
        return {
            id: campos[2], office, curpCliente: campos[0], nombreCliente: campos[1],
            fechaCreacion: campos[3], tipo: campos[4], monto: parseFloat(campos[5] || 0),
            plazo: parseInt(campos[6] || 0), montoTotal: parseFloat(campos[7] || 0), curpAval: campos[8],
            nombreAval: campos[9], poblacion_grupo: campos[10], ruta: campos[11],
            saldo: parseFloat(campos[12] || 0), estado: parseFloat(campos[12] || 0) > 0.01 ? 'activo' : 'liquidado'
        };
    },
    
    _procesarColocacionLEON: (linea, i, office, errores) => {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length < 20) { errores.push(`Línea ${i + 1}: Formato LEON-Colocación incorrecto`); return null; }
         return {
            id: campos[2], office, curpCliente: campos[0], nombreCliente: campos[1], 
            fechaCreacion: campos[3], tipo: campos[4], monto: parseFloat(campos[5] || 0),
            plazo: parseInt(campos[6] || 0), montoTotal: parseFloat(campos[7] || 0), curpAval: campos[8],
            nombreAval: campos[9], poblacion_grupo: campos[10], ruta: campos[11],
            interes: parseFloat(campos[12] || 0), saldo: parseFloat(campos[13] || 0),
            ultimoPago: campos[14], saldoVencido: parseFloat(campos[15] || 0), status: campos[16],
            saldoCapital: parseFloat(campos[17] || 0), saldoInteres: parseFloat(campos[18] || 0), stj150: campos[19],
            estado: parseFloat(campos[13] || 0) > 0.01 ? 'activo' : 'liquidado'
        };
    },

    _procesarCobranzaGDL: (linea, i, office, creditosMap, errores) => {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length < 11) { errores.push(`Línea ${i + 1}: Formato GDL-Cobranza incorrecto`); return {}; }
        const pago = { 
            office, idCredito: campos[1], monto: parseFloat(campos[3] || 0) 
            // Podríamos agregar más campos al objeto de pago si es necesario
        };
        const creditoActualizado = { id: campos[1], saldo: parseFloat(campos[10] || 0) };
        return {pago, creditoActualizado};
    },
    _procesarCobranzaLEON: (linea, i, office, creditosMap, errores) => {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length < 11) { errores.push(`Línea ${i + 1}: Formato LEON-Cobranza incorrecto`); return {}; }
        const pago = { 
            office, idCredito: campos[1], monto: parseFloat(campos[3] || 0)
        };
        const creditoActualizado = { id: campos[1], saldo: parseFloat(campos[9] || 0) };
        return {pago, creditoActualizado};
    },

    // --- FUNCIONES DE REPORTES Y LÓGICA DE NEGOCIO ---
    generarReportes: async () => {
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
            const fechaPago = new Date(pago.fecha);
            return fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === anioActual;
        });
        
        const cobradoMes = totalPagosMes.reduce((sum, pago) => sum + (pago.monto || 0), 0);
        
        return {
            totalClientes: clientes.length,
            totalCreditos: creditosActivos.length,
            totalCartera: totalCartera,
            totalVencidos: creditosActivos.filter(c => database.esCreditoVencido(c)).length,
            pagosRegistrados: totalPagosMes.length,
            cobradoMes: cobradoMes,
            totalComisiones: totalPagosMes.reduce((sum, pago) => sum + (pago.comision || 0), 0)
        };
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
