// =============================================
// SISTEMA DE BASE DE DATOS CON GOOGLE SHEETS
// =============================================

class FinzanaDatabase {
    constructor() {
        this.initializeDatabase();
    }

    initializeDatabase() {
        console.log('Base de datos conectada a Google Sheets');
        // Verificar si hay datos locales y ofrecer migración
        setTimeout(() => this.verificarDatosLocales(), 1000);
    }

    verificarDatosLocales() {
        const clientesLocales = JSON.parse(localStorage.getItem('finzana-clientes') || '[]');
        const creditosLocales = JSON.parse(localStorage.getItem('finzana-creditos') || '[]');
        const pagosLocales = JSON.parse(localStorage.getItem('finzana-pagos') || '[]');

        const totalDatosLocales = clientesLocales.length + creditosLocales.length + pagosLocales.length;

        if (totalDatosLocales > 0 && document.getElementById('view-main-menu')) {
            if (confirm(`Tienes ${totalDatosLocales} registros locales. ¿Deseas migrarlos a Google Sheets ahora?`)) {
                MigradorDatos.mostrarPanelMigracion();
            }
        }
    }

    // ========== USUARIOS ==========
    async getUsers() {
        try {
            // PRIMERO intentar con Google Sheets
            const result = await callGoogleAppsScript('obtener_todos', 'usuarios');
            if (result.success && result.data && result.data.length > 0) {
                // Convertir array de usuarios a objeto
                const usersObj = {};
                result.data.forEach(user => {
                    if (user.username) { // Solo si tiene username válido
                        usersObj[user.username] = user;
                    }
                });

                // Guardar también localmente como backup
                localStorage.setItem('finzana-users', JSON.stringify(usersObj));

                return usersObj;
            }

            // Si falla Google Sheets, usar datos locales
            const usersLocal = localStorage.getItem('finzana-users');
            if (usersLocal) {
                const users = JSON.parse(usersLocal);
                // Intentar guardar en Google Sheets para recuperación
                if (Object.keys(users).length > 0) {
                    setTimeout(() => this.sincronizarUsuariosLocales(users), 1000);
                }
                return users;
            }

            // Si no hay datos locales, crear usuarios por defecto
            return this.crearUsuariosPorDefecto();

        } catch (error) {
            console.error('Error obteniendo usuarios:', error);
            const usersLocal = localStorage.getItem('finzana-users');
            return usersLocal ? JSON.parse(usersLocal) : this.crearUsuariosPorDefecto();
        }
    }

    // Nueva función para sincronizar usuarios locales con Google Sheets
    async sincronizarUsuariosLocales(users) {
        try {
            const usersArray = Object.entries(users).map(([username, userData]) => ({
                username: username,
                ...userData
            }));

            await callGoogleAppsScript('guardar_lote', 'usuarios', usersArray);
            console.log('Usuarios locales sincronizados con Google Sheets');
        } catch (error) {
            console.log('No se pudo sincronizar usuarios con Google Sheets, usando locales:', error.message);
        }
    }

    // Función para crear usuarios por defecto
    crearUsuariosPorDefecto() {
        const defaultUsers = {
            'admin': {
                password: 'admin123',
                name: 'Administrador Principal',
                role: 'admin',
                email: 'admin@finzana.com',
                telefono: '',
                fechaCreacion: new Date().toISOString()
            },
            'supervisor': {
                password: 'super123',
                name: 'Supervisor Regional',
                role: 'supervisor',
                email: 'supervisor@finzana.com',
                telefono: '',
                fechaCreacion: new Date().toISOString()
            },
            'cobrador1': {
                password: 'cobra123',
                name: 'Carlos Martínez - Cobrador JC1',
                role: 'cobrador',
                email: 'carlos@finzana.com',
                telefono: '333-123-4567',
                fechaCreacion: new Date().toISOString()
            },
            'consulta': {
                password: 'consulta123',
                name: 'Usuario de Consulta',
                role: 'consulta',
                email: 'consulta@finzana.com',
                telefono: '',
                fechaCreacion: new Date().toISOString()
            }
        };

        // Guardar localmente
        localStorage.setItem('finzana-users', JSON.stringify(defaultUsers));

        // Intentar guardar en Google Sheets
        this.sincronizarUsuariosLocales(defaultUsers);

        return defaultUsers;
    }

    // ========== CLIENTES ==========
    async getClientes() {
        try {
            const result = await callGoogleAppsScript('obtener_todos', 'clientes');
            if (result.success) {
                return result.data;
            }
            // Fallback a datos locales
            const clientesLocal = localStorage.getItem('finzana-clientes');
            return clientesLocal ? JSON.parse(clientesLocal) : [];
        } catch (error) {
            console.error('Error obteniendo clientes:', error);
            const clientesLocal = localStorage.getItem('finzana-clientes');
            return clientesLocal ? JSON.parse(clientesLocal) : [];
        }
    }

    async saveClientes(clientes) {
        try {
            const result = await callGoogleAppsScript('guardar_lote', 'clientes', clientes);

            // También guardar localmente como backup
            localStorage.setItem('finzana-clientes', JSON.stringify(clientes));

            return result.success;
        } catch (error) {
            console.error('Error guardando clientes:', error);
            // Fallback a localStorage
            localStorage.setItem('finzana-clientes', JSON.stringify(clientes));
            return false;
        }
    }

    async buscarClientePorCURP(curp) {
        try {
            const result = await callGoogleAppsScript('buscar', 'clientes', null, 'curp', curp);
            if (result.success && result.data) {
                return result.data;
            }

            // Fallback a búsqueda local
            const clientes = await this.getClientes();
            return clientes.find(cliente => cliente.curp === curp) || null;
        } catch (error) {
            console.error('Error buscando cliente:', error);
            const clientes = await this.getClientes();
            return clientes.find(cliente => cliente.curp === curp) || null;
        }
    }

    async agregarCliente(cliente) {
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
        try {
            const result = await callGoogleAppsScript('obtener_todos', 'creditos');
            if (result.success) {
                return result.data;
            }
            const creditosLocal = localStorage.getItem('finzana-creditos');
            return creditosLocal ? JSON.parse(creditosLocal) : [];
        } catch (error) {
            console.error('Error obteniendo créditos:', error);
            const creditosLocal = localStorage.getItem('finzana-creditos');
            return creditosLocal ? JSON.parse(creditosLocal) : [];
        }
    }

    async saveCreditos(creditos) {
        try {
            const result = await callGoogleAppsScript('guardar_lote', 'creditos', creditos);
            localStorage.setItem('finzana-creditos', JSON.stringify(creditos));
            return result.success;
        } catch (error) {
            console.error('Error guardando créditos:', error);
            localStorage.setItem('finzana-creditos', JSON.stringify(creditos));
            return false;
        }
    }

    async buscarCreditoPorId(idCredito) {
        try {
            const result = await callGoogleAppsScript('buscar', 'creditos', null, 'id', idCredito);
            if (result.success && result.data) {
                return result.data;
            }

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
        } catch (error) {
            console.error('Error buscando crédito:', error);
            const creditos = await this.getCreditos();
            return creditos.find(credito => credito.id === idCredito) || null;
        }
    }

    async agregarCredito(credito) {
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
        try {
            const result = await callGoogleAppsScript('obtener_todos', 'pagos');
            if (result.success) {
                return result.data;
            }
            const pagosLocal = localStorage.getItem('finzana-pagos');
            return pagosLocal ? JSON.parse(pagosLocal) : [];
        } catch (error) {
            console.error('Error obteniendo pagos:', error);
            const pagosLocal = localStorage.getItem('finzana-pagos');
            return pagosLocal ? JSON.parse(pagosLocal) : [];
        }
    }

    async savePagos(pagos) {
        try {
            const result = await callGoogleAppsScript('guardar_lote', 'pagos', pagos);
            localStorage.setItem('finzana-pagos', JSON.stringify(pagos));
            return result.success;
        } catch (error) {
            console.error('Error guardando pagos:', error);
            localStorage.setItem('finzana-pagos', JSON.stringify(pagos));
            return false;
        }
    }

    async agregarPago(pago) {
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

            // Guardar ambos: el pago y el crédito actualizado
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

    // ========== MÉTODOS EXISTENTES (adaptados) ==========
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