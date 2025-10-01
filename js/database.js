// =============================================
// SISTEMA DE BASE DE DATOS - 100% SHEETS API + LOCALSTORAGE
// =============================================

class FinzanaDatabase {
    constructor() {
        this.initialized = false;
        this.sheetsAvailable = false;
        this.initializeDatabase();
    }

    async initializeDatabase() {
        console.log('🚀 Inicializando Finzana Database (Sistema Híbrido)');
        
        // Verificar conexión con Sheets API
        await this.verificarConexionSheets();
        
        // Verificar y crear datos iniciales
        this.verificarDatosIniciales();
        
        this.initialized = true;
        console.log('✅ Base de datos lista');
        console.log('🌐 Google Sheets:', this.sheetsAvailable ? 'DISPONIBLE' : 'NO DISPONIBLE');
    }

    async verificarConexionSheets() {
        try {
            this.sheetsAvailable = await verificarConexionSheetsAPI();
        } catch (error) {
            this.sheetsAvailable = false;
            console.log('❌ Error verificando conexión Sheets:', error.message);
        }
    }

    verificarDatosIniciales() {
        console.log('🔍 Verificando datos iniciales...');
        
        // Solo verificar usuarios - se crearán automáticamente si no existen
        const usuarios = this.getUsersLocal();
        console.log(`👥 Usuarios locales: ${Object.keys(usuarios).length}`);
        
        console.log('✅ Verificación de datos completada');
    }

    // ========== USUARIOS ==========
    async getUsers() {
        console.log('👥 Obteniendo usuarios...');
        
        if (this.sheetsAvailable) {
            try {
                console.log('🔍 Intentando desde Google Sheets...');
                const usuarios = await obtenerUsuariosConSheets();
                console.log(`✅ ${Object.keys(usuarios).length} usuarios desde Sheets`);
                return usuarios;
            } catch (error) {
                console.log('❌ Error con Sheets, usando localStorage:', error.message);
                this.sheetsAvailable = false;
            }
        }
        
        // Fallback a localStorage
        console.log('💾 Usando localStorage...');
        const usuarios = this.getUsersLocal();
        console.log(`✅ ${Object.keys(usuarios).length} usuarios desde localStorage`);
        return usuarios;
    }

    getUsersLocal() {
        return obtenerUsuariosDesdeLocalStorage();
    }

    async saveUsers(users) {
        return await guardarUsuarios(users);
    }

    // ========== CLIENTES ==========
    async getClientes() {
        if (this.sheetsAvailable) {
            try {
                return await obtenerDatosDeSheet('clientes');
            } catch (error) {
                console.log('❌ Error obteniendo clientes de Sheets, usando localStorage');
                this.sheetsAvailable = false;
            }
        }
        return this.getClientesLocal();
    }

    getClientesLocal() {
        try {
            const clientesLocal = localStorage.getItem('finzana-clientes');
            return clientesLocal ? JSON.parse(clientesLocal) : [];
        } catch (error) {
            console.error('Error leyendo clientes locales:', error);
            return [];
        }
    }

    async saveClientes(clientes) {
        try {
            // Guardar en localStorage siempre
            localStorage.setItem('finzana-clientes', JSON.stringify(clientes));
            console.log(`💾 ${clientes.length} clientes guardados en localStorage`);
            
            // Intentar guardar en Sheets si está disponible
            if (this.sheetsAvailable) {
                try {
                    await guardarDatosEnSheet('clientes', clientes);
                    console.log('✅ Clientes sincronizados con Google Sheets');
                } catch (error) {
                    console.log('⚠️ No se pudo sincronizar clientes con Google Sheets');
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error guardando clientes:', error);
            return false;
        }
    }

    async buscarClientePorCURP(curp) {
        if (!curp || curp.length !== 18) return null;
        
        const clientes = await this.getClientes();
        return clientes.find(cliente => cliente.curp === curp) || null;
    }

    async agregarCliente(cliente) {
        if (!cliente.curp || cliente.curp.length !== 18) {
            return { success: false, message: 'La CURP debe tener 18 caracteres' };
        }
        
        if (!cliente.nombre || cliente.nombre.trim() === '') {
            return { success: false, message: 'El nombre es requerido' };
        }

        try {
            const clientes = await this.getClientes();
            
            // Verificar si ya existe
            const clienteExistente = clientes.find(c => c.curp === cliente.curp);
            if (clienteExistente) {
                return { success: false, message: 'Ya existe un cliente con esta CURP' };
            }

            cliente.id = this.generarId('CLI');
            cliente.fechaRegistro = new Date().toISOString();
            
            clientes.push(cliente);
            const guardado = await this.saveClientes(clientes);
            
            if (guardado) {
                return { success: true, message: 'Cliente registrado exitosamente', data: cliente };
            } else {
                return { success: false, message: 'Error al guardar el cliente' };
            }
        } catch (error) {
            console.error('Error agregando cliente:', error);
            return { success: false, message: 'Error al agregar cliente' };
        }
    }

    async actualizarCliente(curp, datosActualizados) {
        try {
            const clientes = await this.getClientes();
            const index = clientes.findIndex(cliente => cliente.curp === curp);
            
            if (index !== -1) {
                datosActualizados.id = clientes[index].id;
                datosActualizados.fechaRegistro = clientes[index].fechaRegistro;
                clientes[index] = datosActualizados;
                
                const guardado = await this.saveClientes(clientes);
                if (guardado) {
                    return { success: true, message: 'Cliente actualizado exitosamente' };
                }
            }
            return { success: false, message: 'Cliente no encontrado' };
        } catch (error) {
            console.error('Error actualizando cliente:', error);
            return { success: false, message: 'Error al actualizar cliente' };
        }
    }

    async eliminarCliente(curp) {
        try {
            const clientes = await this.getClientes();
            const nuevosClientes = clientes.filter(cliente => cliente.curp !== curp);
            
            if (nuevosClientes.length < clientes.length) {
                const guardado = await this.saveClientes(nuevosClientes);
                if (guardado) {
                    return { success: true, message: 'Cliente eliminado exitosamente' };
                }
            }
            return { success: false, message: 'Cliente no encontrado' };
        } catch (error) {
            console.error('Error eliminando cliente:', error);
            return { success: false, message: 'Error al eliminar cliente' };
        }
    }

    // ========== CRÉDITOS ==========
    async getCreditos() {
        if (this.sheetsAvailable) {
            try {
                return await obtenerDatosDeSheet('creditos');
            } catch (error) {
                console.log('❌ Error obteniendo créditos de Sheets, usando localStorage');
                this.sheetsAvailable = false;
            }
        }
        return this.getCreditosLocal();
    }

    getCreditosLocal() {
        try {
            const creditosLocal = localStorage.getItem('finzana-creditos');
            return creditosLocal ? JSON.parse(creditosLocal) : [];
        } catch (error) {
            console.error('Error leyendo créditos locales:', error);
            return [];
        }
    }

    async saveCreditos(creditos) {
        try {
            localStorage.setItem('finzana-creditos', JSON.stringify(creditos));
            console.log(`💾 ${creditos.length} créditos guardados en localStorage`);
            
            if (this.sheetsAvailable) {
                try {
                    await guardarDatosEnSheet('creditos', creditos);
                    console.log('✅ Créditos sincronizados con Google Sheets');
                } catch (error) {
                    console.log('⚠️ No se pudo sincronizar créditos con Google Sheets');
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error guardando créditos:', error);
            return false;
        }
    }

    async buscarCreditoPorId(idCredito) {
        if (!idCredito) return null;
        
        const creditos = await this.getCreditos();
        let credito = creditos.find(credito => credito.id === idCredito);
        if (!credito) {
            credito = creditos.find(credito => {
                if (credito.id.length === 8 && credito.id.endsWith(idCredito)) return true;
                if (credito.id === idCredito) return true;
                return false;
            });
        }
        return credito || null;
    }

    async agregarCredito(credito) {
        if (!credito.curpCliente || !credito.monto || !credito.plazo) {
            return { success: false, message: 'Datos incompletos del crédito' };
        }

        try {
            const creditos = await this.getCreditos();
            credito.id = this.generarIdConsecutivo();
            credito.fechaCreacion = new Date().toISOString();
            credito.estado = 'activo';
            credito.montoTotal = credito.monto * 1.3;
            credito.saldo = credito.montoTotal;
            
            creditos.push(credito);
            const guardado = await this.saveCreditos(creditos);
            
            if (guardado) {
                return { success: true, message: 'Crédito generado exitosamente', data: credito };
            } else {
                return { success: false, message: 'Error al guardar el crédito' };
            }
        } catch (error) {
            console.error('Error agregando crédito:', error);
            return { success: false, message: 'Error al agregar crédito' };
        }
    }

    // ========== PAGOS ==========
    async getPagos() {
        if (this.sheetsAvailable) {
            try {
                return await obtenerDatosDeSheet('pagos');
            } catch (error) {
                console.log('❌ Error obteniendo pagos de Sheets, usando localStorage');
                this.sheetsAvailable = false;
            }
        }
        return this.getPagosLocal();
    }

    getPagosLocal() {
        try {
            const pagosLocal = localStorage.getItem('finzana-pagos');
            return pagosLocal ? JSON.parse(pagosLocal) : [];
        } catch (error) {
            console.error('Error leyendo pagos locales:', error);
            return [];
        }
    }

    async savePagos(pagos) {
        try {
            localStorage.setItem('finzana-pagos', JSON.stringify(pagos));
            console.log(`💾 ${pagos.length} pagos guardados en localStorage`);
            
            if (this.sheetsAvailable) {
                try {
                    await guardarDatosEnSheet('pagos', pagos);
                    console.log('✅ Pagos sincronizados con Google Sheets');
                } catch (error) {
                    console.log('⚠️ No se pudo sincronizar pagos con Google Sheets');
                }
            }
            
            return true;
        } catch (error) {
            console.error('Error guardando pagos:', error);
            return false;
        }
    }

    async agregarPago(pago) {
        if (!pago.idCredito || !pago.monto || pago.monto <= 0) {
            return { success: false, message: 'Datos de pago inválidos' };
        }

        try {
            const pagos = await this.getPagos();
            const creditos = await this.getCreditos();
            
            const credito = creditos.find(c => c.id === pago.idCredito);
            if (!credito) return { success: false, message: 'Crédito no encontrado' };

            if (!pago.comision) pago.comision = this.calcularComision(pago.monto, pago.tipoPago);
            credito.saldo -= pago.monto;
            if (credito.saldo <= 0) credito.estado = 'liquidado';

            pago.id = this.generarId('PAG');
            pago.fecha = new Date().toISOString();
            pago.saldoDespues = credito.saldo;

            pagos.push(pago);
            
            // Guardar ambos
            const pagoGuardado = await this.savePagos(pagos);
            const creditoGuardado = await this.saveCreditos(creditos);
            
            if (pagoGuardado && creditoGuardado) {
                return { success: true, message: 'Pago registrado exitosamente', data: pago, credito: credito };
            } else {
                return { success: false, message: 'Error al guardar el pago' };
            }
        } catch (error) {
            console.error('Error agregando pago:', error);
            return { success: false, message: 'Error al agregar pago' };
        }
    }

    // ========== MÉTODOS AUXILIARES ==========
    generarId(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generarIdConsecutivo() {
        return `CR${Date.now()}`;
    }

    calcularComision(monto, tipoPago) {
        const porcentajes = { 'normal': 0.10, 'extraordinario': 0.05, 'actualizado': 0.08 };
        return monto * (porcentajes[tipoPago] || 0.10);
    }

    // ========== MÉTODOS DE CONSULTA ==========
    async buscarCreditosPorCliente(curpCliente) {
        const creditos = await this.getCreditos();
        return creditos.filter(credito => credito.curpCliente === curpCliente && credito.estado === 'activo');
    }

    async buscarPagosPorCredito(idCredito) {
        const pagos = await this.getPagos();
        return pagos.filter(pago => pago.idCredito === idCredito);
    }

    async obtenerCreditoMasReciente(curpCliente) {
        const creditos = await this.getCreditos();
        const creditosCliente = creditos.filter(credito =>
            credito.curpCliente === curpCliente && credito.estado === 'activo'
        );
        if (creditosCliente.length === 0) return null;
        creditosCliente.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
        return creditosCliente[0];
    }

    async obtenerInformacionCreditoCliente(curpCliente) {
        const credito = await this.obtenerCreditoMasReciente(curpCliente);
        if (!credito) return null;

        const pagos = await this.buscarPagosPorCredito(credito.id);
        const totalPagado = pagos.reduce((sum, pago) => sum + pago.monto, 0);
        const saldoRestante = credito.saldo;
        const porcentajePagado = (totalPagado / credito.montoTotal) * 100;

        const fechaInicio = new Date(credito.fechaCreacion);
        const hoy = new Date();
        const diferenciaTiempo = hoy - fechaInicio;
        const semanasTranscurridas = Math.floor(diferenciaTiempo / (1000 * 60 * 60 * 24 * 7));
        const semanaActual = Math.min(semanasTranscurridas + 1, credito.plazo);
        const semanasAtraso = Math.max(0, semanasTranscurridas - credito.plazo);

        const siguientePago = new Date(fechaInicio);
        siguientePago.setDate(siguientePago.getDate() + (semanaActual * 7));
        const estaAlCorriente = semanasAtraso === 0 && saldoRestante > 0;

        return {
            idCredito: credito.id,
            fechaCreacion: credito.fechaCreacion,
            siguientePago: siguientePago.toISOString().split('T')[0],
            estaAlCorriente: estaAlCorriente,
            semanasAtraso: semanasAtraso,
            saldoRestante: saldoRestante,
            semanaActual: semanaActual,
            plazoTotal: credito.plazo,
            montoTotal: credito.montoTotal,
            totalPagado: totalPagado,
            porcentajePagado: porcentajePagado.toFixed(1)
        };
    }

    calcularSemanasAtraso(credito) {
        const fechaInicio = new Date(credito.fechaCreacion);
        const hoy = new Date();
        const diferenciaTiempo = hoy - fechaInicio;
        const semanasTranscurridas = Math.floor(diferenciaTiempo / (1000 * 60 * 60 * 24 * 7));
        return Math.max(0, semanasTranscurridas - credito.plazo);
    }

    async generarReportes() {
        const clientes = await this.getClientes();
        const creditos = await this.getCreditos();
        const pagos = await this.getPagos();

        const creditosActivos = creditos.filter(c => c.estado === 'activo');
        const totalCartera = creditosActivos.reduce((sum, credito) => sum + credito.saldo, 0);
        const totalPagosMes = pagos.filter(pago => {
            const fechaPago = new Date(pago.fecha);
            const hoy = new Date();
            return fechaPago.getMonth() === hoy.getMonth() && fechaPago.getFullYear() === hoy.getFullYear();
        });

        return {
            totalClientes: clientes.length,
            totalCreditos: creditosActivos.length,
            totalCartera: totalCartera,
            totalVencidos: creditosActivos.filter(c => this.esCreditoVencido(c)).length,
            pagosRegistrados: totalPagosMes.length,
            cobradoMes: totalPagosMes.reduce((sum, pago) => sum + pago.monto, 0),
            totalComisiones: totalPagosMes.reduce((sum, pago) => sum + pago.comision, 0)
        };
    }

    esCreditoVencido(credito) {
        const fechaCreacion = new Date(credito.fechaCreacion);
        const fechaVencimiento = new Date(fechaCreacion);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + (credito.plazo * 7));
        return new Date() > fechaVencimiento;
    }
}
