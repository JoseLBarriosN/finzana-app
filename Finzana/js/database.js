// =============================================
// SISTEMA DE BASE DE DATOS CON GOOGLE SHEETS - VERSIÓN PRODUCCIÓN
// =============================================

class FinzanaDatabase {
    constructor() {
        this.gasAvailable = true;
        this.initialized = false;
        this.initializeDatabase();
    }

    async initializeDatabase() {
        console.log('🚀 Inicializando Finzana Database...');

        // Detectar entorno
        const hostname = window.location.hostname;
        this.isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';
        console.log('Entorno:', this.isDevelopment ? 'DESARROLLO' : 'PRODUCCIÓN');

        // Probar conexión con GAS
        await this.probarConexionGAS();

        this.initialized = true;
        console.log('✅ Base de datos inicializada - Google Sheets:', this.gasAvailable ? 'DISPONIBLE' : 'NO DISPONIBLE');

        // Solo ofrecer migración si GAS está disponible y hay datos locales
        if (this.gasAvailable) {
            setTimeout(() => this.verificarDatosLocales(), 3000);
        }
    }

    async probarConexionGAS() {
        try {
            console.log('🔌 Probando conexión con Google Apps Script...');

            const testPayload = {
                accion: 'obtener_todos',
                tabla: 'usuarios'
            };

            const response = await fetch(GAS_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testPayload)
            });

            if (response.ok) {
                const result = await response.json();
                this.gasAvailable = result.success;
                console.log('✅ Conexión GAS exitosa');
            } else {
                this.gasAvailable = false;
                console.log('❌ Conexión GAS fallida - Status:', response.status);
            }
        } catch (error) {
            this.gasAvailable = false;
            console.log('❌ Error de conexión GAS:', error.message);
        }
    }

    verificarDatosLocales() {
        // No mostrar migración si ya estamos en producción y no hay datos locales significativos
        if (!this.isDevelopment) {
            const clientesCount = JSON.parse(localStorage.getItem('finzana-clientes') || '[]').length;
            if (clientesCount === 0) return;
        }

        const clientesLocales = JSON.parse(localStorage.getItem('finzana-clientes') || '[]');
        const creditosLocales = JSON.parse(localStorage.getItem('finzana-creditos') || '[]');
        const pagosLocales = JSON.parse(localStorage.getItem('finzana-pagos') || '[]');

        const totalDatosLocales = clientesLocales.length + creditosLocales.length + pagosLocales.length;

        if (totalDatosLocales > 0 && document.getElementById('view-main-menu')) {
            console.log(`📊 Datos locales encontrados: ${totalDatosLocales} registros`);

            setTimeout(() => {
                if (confirm(`¿Deseas migrar ${totalDatosLocales} registros locales a Google Sheets?`)) {
                    MigradorDatos.mostrarPanelMigracion();
                }
            }, 2000);
        }
    }

    // ========== USUARIOS ==========
    async getUsers() {
        // Esperar a que la base de datos esté inicializada
        while (!this.initialized) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        try {
            // Intentar con Google Sheets si está disponible
            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('obtener_todos', 'usuarios');

                if (result.success && result.data && result.data.length > 0) {
                    console.log(`✅ Usuarios obtenidos de Google Sheets: ${result.data.length} registros`);

                    // Convertir array de usuarios a objeto
                    const usersObj = {};
                    result.data.forEach(user => {
                        if (user.username && user.password) {
                            usersObj[user.username] = user;
                        }
                    });

                    // Validar que tenemos usuarios válidos
                    if (Object.keys(usersObj).length > 0) {
                        // Sincronizar con localStorage como backup
                        localStorage.setItem('finzana-users', JSON.stringify(usersObj));
                        return usersObj;
                    }
                }

                console.log('ℹ️ No hay usuarios en Google Sheets, verificando localStorage...');
            }

            // Fallback a localStorage
            return this.getUsersLocal();

        } catch (error) {
            console.error('❌ Error obteniendo usuarios de GAS:', error);
            return this.getUsersLocal();
        }
    }

    getUsersLocal() {
        try {
            const usersLocal = localStorage.getItem('finzana-users');
            if (usersLocal) {
                const users = JSON.parse(usersLocal);
                const validUsers = Object.keys(users).filter(username =>
                    users[username] && users[username].password
                );

                if (validUsers.length > 0) {
                    console.log(`✅ Usuarios obtenidos de localStorage: ${validUsers.length} usuarios`);
                    return users;
                }
            }

            // Si no hay usuarios válidos, crear los por defecto
            console.log('🔧 Creando usuarios por defecto...');
            return this.crearUsuariosPorDefecto();

        } catch (error) {
            console.error('❌ Error obteniendo usuarios locales:', error);
            return this.crearUsuariosPorDefecto();
        }
    }

    async saveUsers(users) {
        try {
            // Validar usuarios antes de guardar
            const validUsers = {};
            Object.entries(users).forEach(([username, userData]) => {
                if (username && userData && userData.password && userData.name && userData.role) {
                    validUsers[username] = userData;
                }
            });

            // Guardar en localStorage siempre como backup
            localStorage.setItem('finzana-users', JSON.stringify(validUsers));
            console.log(`💾 Usuarios guardados en localStorage: ${Object.keys(validUsers).length} usuarios`);

            // Si GAS está disponible, sincronizar
            if (this.gasAvailable) {
                const usersArray = Object.entries(validUsers).map(([username, userData]) => ({
                    username: username,
                    ...userData
                }));

                const result = await callGoogleAppsScript('guardar_lote', 'usuarios', usersArray);
                if (result.success) {
                    console.log('✅ Usuarios sincronizados con Google Sheets');
                } else {
                    console.log('⚠️ Usuarios guardados solo localmente');
                }
            }

            return true;
        } catch (error) {
            console.error('❌ Error guardando usuarios:', error);
            // Siempre retornamos true porque al menos se guardó en localStorage
            return true;
        }
    }

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
        console.log('👥 Usuarios por defecto creados y guardados');

        return defaultUsers;
    }

    // ========== CLIENTES ==========
    async getClientes() {
        try {
            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('obtener_todos', 'clientes');
                if (result.success) {
                    console.log(`✅ Clientes obtenidos de Google Sheets: ${result.data.length} registros`);
                    return result.data;
                }
            }

            // Fallback a datos locales
            const clientesLocal = localStorage.getItem('finzana-clientes');
            const clientes = clientesLocal ? JSON.parse(clientesLocal) : [];
            console.log(`💾 Clientes obtenidos de localStorage: ${clientes.length} registros`);
            return clientes;

        } catch (error) {
            console.error('❌ Error obteniendo clientes:', error);
            const clientesLocal = localStorage.getItem('finzana-clientes');
            return clientesLocal ? JSON.parse(clientesLocal) : [];
        }
    }

    async saveClientes(clientes) {
        try {
            // Guardar localmente siempre
            localStorage.setItem('finzana-clientes', JSON.stringify(clientes));
            console.log(`💾 Clientes guardados en localStorage: ${clientes.length} registros`);

            // Sincronizar con GAS si está disponible
            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('guardar_lote', 'clientes', clientes);
                if (result.success) {
                    console.log('✅ Clientes sincronizados con Google Sheets');
                }
            }

            return true;
        } catch (error) {
            console.error('❌ Error guardando clientes:', error);
            return false;
        }
    }

    async buscarClientePorCURP(curp) {
        if (!curp || curp.length !== 18) {
            return null;
        }

        try {
            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('buscar', 'clientes', null, 'curp', curp);
                if (result.success && result.data) {
                    return result.data;
                }
            }

            // Fallback a búsqueda local
            const clientes = await this.getClientes();
            return clientes.find(cliente => cliente.curp === curp) || null;

        } catch (error) {
            console.error('❌ Error buscando cliente:', error);
            const clientes = await this.getClientes();
            return clientes.find(cliente => cliente.curp === curp) || null;
        }
    }

    async agregarCliente(cliente) {
        // Validar datos del cliente
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
                console.log('✅ Cliente agregado exitosamente:', cliente.curp);
                return { success: true, message: 'Cliente registrado exitosamente', data: cliente };
            } else {
                return { success: false, message: 'Error al guardar el cliente' };
            }
        } catch (error) {
            console.error('❌ Error agregando cliente:', error);
            return { success: false, message: 'Error al agregar cliente: ' + error.message };
        }
    }

    async actualizarCliente(curp, datosActualizados) {
        try {
            const clientes = await this.getClientes();
            const index = clientes.findIndex(cliente => cliente.curp === curp);

            if (index !== -1) {
                // Mantener ID y fecha de registro original
                datosActualizados.id = clientes[index].id;
                datosActualizados.fechaRegistro = clientes[index].fechaRegistro;
                clientes[index] = datosActualizados;

                const guardado = await this.saveClientes(clientes);
                if (guardado) {
                    console.log('✅ Cliente actualizado:', curp);
                    return { success: true, message: 'Cliente actualizado exitosamente' };
                }
            }
            return { success: false, message: 'Cliente no encontrado' };
        } catch (error) {
            console.error('❌ Error actualizando cliente:', error);
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
                    console.log('✅ Cliente eliminado:', curp);
                    return { success: true, message: 'Cliente eliminado exitosamente' };
                }
            }
            return { success: false, message: 'Cliente no encontrado' };
        } catch (error) {
            console.error('❌ Error eliminando cliente:', error);
            return { success: false, message: 'Error al eliminar cliente' };
        }
    }

    // ========== CRÉDITOS ==========
    async getCreditos() {
        try {
            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('obtener_todos', 'creditos');
                if (result.success) {
                    return result.data;
                }
            }
            const creditosLocal = localStorage.getItem('finzana-creditos');
            return creditosLocal ? JSON.parse(creditosLocal) : [];
        } catch (error) {
            console.error('❌ Error obteniendo créditos:', error);
            const creditosLocal = localStorage.getItem('finzana-creditos');
            return creditosLocal ? JSON.parse(creditosLocal) : [];
        }
    }

    async saveCreditos(creditos) {
        try {
            localStorage.setItem('finzana-creditos', JSON.stringify(creditos));

            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('guardar_lote', 'creditos', creditos);
                if (result.success) {
                    console.log('✅ Créditos sincronizados con Google Sheets');
                }
            }

            return true;
        } catch (error) {
            console.error('❌ Error guardando créditos:', error);
            return false;
        }
    }

    async buscarCreditoPorId(idCredito) {
        if (!idCredito) return null;

        try {
            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('buscar', 'creditos', null, 'id', idCredito);
                if (result.success && result.data) {
                    return result.data;
                }
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
            console.error('❌ Error buscando crédito:', error);
            const creditos = await this.getCreditos();
            return creditos.find(credito => credito.id === idCredito) || null;
        }
    }

    async agregarCredito(credito) {
        // Validaciones
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
                console.log('✅ Crédito generado:', credito.id);
                return { success: true, message: 'Crédito generado exitosamente', data: credito };
            } else {
                return { success: false, message: 'Error al guardar el crédito' };
            }
        } catch (error) {
            console.error('❌ Error agregando crédito:', error);
            return { success: false, message: 'Error al agregar crédito' };
        }
    }

    // ========== PAGOS ==========
    async getPagos() {
        try {
            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('obtener_todos', 'pagos');
                if (result.success) {
                    return result.data;
                }
            }
            const pagosLocal = localStorage.getItem('finzana-pagos');
            return pagosLocal ? JSON.parse(pagosLocal) : [];
        } catch (error) {
            console.error('❌ Error obteniendo pagos:', error);
            const pagosLocal = localStorage.getItem('finzana-pagos');
            return pagosLocal ? JSON.parse(pagosLocal) : [];
        }
    }

    async savePagos(pagos) {
        try {
            localStorage.setItem('finzana-pagos', JSON.stringify(pagos));

            if (this.gasAvailable) {
                const result = await callGoogleAppsScript('guardar_lote', 'pagos', pagos);
                if (result.success) {
                    console.log('✅ Pagos sincronizados con Google Sheets');
                }
            }

            return true;
        } catch (error) {
            console.error('❌ Error guardando pagos:', error);
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

            // Guardar ambos: el pago y el crédito actualizado
            const pagoGuardado = await this.savePagos(pagos);
            const creditoGuardado = await this.saveCreditos(creditos);

            if (pagoGuardado && creditoGuardado) {
                console.log('✅ Pago registrado:', pago.id);
                return { success: true, message: 'Pago registrado exitosamente', data: pago, credito: credito };
            } else {
                return { success: false, message: 'Error al guardar el pago' };
            }
        } catch (error) {
            console.error('❌ Error agregando pago:', error);
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

    // ========== MÉTODOS DE DIAGNÓSTICO ==========
    async diagnostico() {
        console.log('=== DIAGNÓSTICO DEL SISTEMA ===');

        const info = {
            entorno: this.isDevelopment ? 'Desarrollo' : 'Producción',
            gasDisponible: this.gasAvailable,
            usuariosLocal: Object.keys(JSON.parse(localStorage.getItem('finzana-users') || '{}')).length,
            clientesLocal: JSON.parse(localStorage.getItem('finzana-clientes') || '[]').length,
            creditosLocal: JSON.parse(localStorage.getItem('finzana-creditos') || '[]').length,
            pagosLocal: JSON.parse(localStorage.getItem('finzana-pagos') || '[]').length
        };

        console.table(info);
        return info;
    }
}