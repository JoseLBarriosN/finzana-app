// =============================================
// CAPA DE SERVICIO DE FIREBASE (database.js) - CORREGIDO Y MEJORADO
// =============================================

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
            // ===== MODIFICACIÓN: Verificar si el cliente tiene créditos activos =====
            const creditos = await database.buscarCreditosPorClienteId(id);
            const creditosActivos = creditos.filter(c => c.estado === 'activo');
            
            if (creditosActivos.length > 0) {
                return { 
                    success: false, 
                    message: 'No se puede eliminar el cliente porque tiene créditos activos.' 
                };
            }
            
            await db.collection('clientes').doc(id).delete();
            return { success: true, message: 'Cliente eliminado exitosamente.' };
        } catch (error) {
            console.error("Error eliminando cliente:", error);
            return { success: false, message: `Error: ${error.message}` };
        }
    },

    // ===== NUEVO MÉTODO: Buscar créditos por ID de cliente =====
    buscarCreditosPorClienteId: async (clienteId) => {
        try {
            // Primero obtener el cliente para saber su CURP
            const cliente = await database.obtenerClientePorId(clienteId);
            if (!cliente) return [];
            
            return await database.buscarCreditosPorCliente(cliente.curp);
        } catch (error) {
            console.error("Error buscando créditos por ID de cliente:", error);
            return [];
        }
    },

    buscarClientePorCURP: async (curp) => {
        try {
            const snapshot = await db.collection('clientes')
                .where('curp', '==', curp.toUpperCase())
                .limit(1)
                .get();

            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error buscando cliente por CURP:", error);
            return null;
        }
    },

    // Resto de métodos de clientes permanecen igual...

    // --- MÉTODOS DE CRÉDITOS ---
    buscarCreditoActivoPorCliente: async (curp) => {
        try {
            const snapshot = await db.collection('creditos')
                .where('curp_cliente', '==', curp.toUpperCase())
                .where('estado', 'in', ['activo', 'atrasado'])
                .limit(1)
                .get();

            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error("Error buscando crédito activo:", error);
            return null;
        }
    },

    buscarCreditosPorCliente: async (curp) => {
        try {
            const snapshot = await db.collection('creditos')
                .where('curp_cliente', '==', curp.toUpperCase())
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error buscando créditos por cliente:", error);
            return [];
        }
    },

    // Resto de métodos de créditos permanecen igual...

    // --- MÉTODOS DE PAGOS ---
    getPagosPorCredito: async (creditoId) => {
        try {
            const snapshot = await db.collection('pagos')
                .where('id_credito', '==', creditoId)
                .orderBy('fecha', 'desc')
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error obteniendo pagos:", error);
            return [];
        }
    },

    // Resto de métodos de pagos permanecen igual...

    // --- MÉTODOS DE REPORTES ---
    obtenerCreditosConFiltros: async (filtros) => {
        try {
            let query = db.collection('creditos');

            // Aplicar filtros
            if (filtros.office && filtros.office !== 'todas') {
                query = query.where('office', '==', filtros.office);
            }
            if (filtros.estado && filtros.estado !== 'todos') {
                query = query.where('estado', '==', filtros.estado);
            }
            if (filtros.curp && filtros.curp.trim() !== '') {
                query = query.where('curp_cliente', '==', filtros.curp.trim().toUpperCase());
            }

            const snapshot = await query.get();
            const creditos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Enriquecer datos con información del cliente
            const creditosEnriquecidos = await Promise.all(
                creditos.map(async (credito) => {
                    const cliente = await database.buscarClientePorCURP(credito.curp_cliente);
                    const pagos = await database.getPagosPorCredito(credito.id);
                    const estadoCalculado = _calcularEstadoCredito(credito, pagos);

                    return {
                        ...credito,
                        cliente: cliente || { nombre: 'No encontrado', telefono: 'N/A' },
                        ...estadoCalculado
                    };
                })
            );

            return { success: true, data: creditosEnriquecidos };
        } catch (error) {
            console.error("Error obteniendo créditos con filtros:", error);
            return { success: false, message: 'Error al obtener reportes: ' + error.message };
        }
    }
};

// ===== MODIFICACIÓN: Función auxiliar para calcular estado (duplicada por compatibilidad) =====
function _calcularEstadoCredito(credito, pagos) {
    if (!credito || !credito.fechaCreacion) {
        console.error("Cálculo de estado fallido: Faltan datos del crédito o fecha de creación.", credito);
        return null;
    }
    
    // Si el crédito está liquidado
    if (credito.saldo <= 0.01 || credito.estado === 'liquidado') {
        return { 
            estado: 'liquidado', 
            diasAtraso: 0, 
            semanasAtraso: 0, 
            pagoSemanal: 0, 
            proximaFechaPago: 'N/A',
            semanasPagadas: credito.plazo || 0
        };
    }
    
    const fechaInicio = parsearFecha_DDMMYYYY(credito.fechaCreacion);
    if (!fechaInicio) {
        console.error(`Cálculo de estado fallido para crédito ID ${credito.id}: Fecha de creación inválida.`);
        return null;
    }
    
    const pagoSemanal = (credito.plazo > 0) ? credito.montoTotal / credito.plazo : 0;
    const montoPagado = credito.montoTotal - credito.saldo;
    
    // Calcular semanas pagadas basadas en el monto
    const semanasPagadas = (pagoSemanal > 0) ? Math.floor(montoPagado / pagoSemanal) : 0;
    
    // Calcular fecha esperada del próximo pago
    const proximaFecha = new Date(fechaInicio);
    proximaFecha.setDate(proximaFecha.getDate() + (semanasPagadas + 1) * 7);
    
    // Calcular días de atraso
    const hoy = new Date();
    const diasTranscurridos = Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24));
    const diasEsperados = (semanasPagadas + 1) * 7;
    const diasAtraso = Math.max(0, diasTranscurridos - diasEsperados);
    
    let estado = 'al corriente';
    if (diasAtraso > 300) estado = 'juridico';
    else if (diasAtraso > 150) estado = 'cobranza';
    else if (diasAtraso >= 7) estado = 'atrasado';
    
    return {
        estado,
        diasAtraso: Math.round(diasAtraso),
        semanasAtraso: Math.ceil(diasAtraso / 7),
        pagoSemanal,
        proximaFechaPago: proximaFecha.toLocaleDateString(),
        semanasPagadas: semanasPagadas,
        plazoTotal: credito.plazo
    };
}

// ===== MODIFICACIÓN: Función para parsear fechas (duplicada por compatibilidad) =====
function parsearFecha_DDMMYYYY(fechaInput) {
    if (!fechaInput) {
        return null;
    }
    
    // Si es un Timestamp de Firestore
    if (typeof fechaInput === 'object' && fechaInput.toDate && typeof fechaInput.toDate === 'function') {
        return fechaInput.toDate();
    }
    
    // Si es string
    if (typeof fechaInput === 'string') {
        // Intentar diferentes formatos
        const formatos = [
            // Formato ISO
            () => {
                if (fechaInput.includes('T')) {
                    const fecha = new Date(fechaInput);
                    return isNaN(fecha.getTime()) ? null : fecha;
                }
                return null;
            },
            // Formato dd-mm-yyyy
            () => {
                const match = fechaInput.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
                if (match) {
                    const [_, dia, mes, anio] = match;
                    return new Date(anio, mes - 1, dia);
                }
                return null;
            },
            // Formato yyyy-mm-dd
            () => {
                const match = fechaInput.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
                if (match) {
                    const [_, anio, mes, dia] = match;
                    return new Date(anio, mes - 1, dia);
                }
                return null;
            },
            // Formato timestamp
            () => {
                const timestamp = Date.parse(fechaInput);
                return isNaN(timestamp) ? null : new Date(timestamp);
            }
        ];
        
        for (const formato of formatos) {
            const resultado = formato();
            if (resultado && !isNaN(resultado.getTime())) {
                return resultado;
            }
        }
    }
    
    console.warn("No se pudo parsear el formato de fecha:", fechaInput);
    return null;
}
