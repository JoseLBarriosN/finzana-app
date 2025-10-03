// =============================================
// SISTEMA DE BASE DE DATOS COMPLETO - CORREGIDO
// =============================================

class FinzanaDatabase {
    constructor() {
        this.initializeDatabase();
    }

    initializeDatabase() {
        if (!localStorage.getItem('finzana-clientes')) {
            localStorage.setItem('finzana-clientes', JSON.stringify([]));
        }
        if (!localStorage.getItem('finzana-creditos')) {
            localStorage.setItem('finzana-creditos', JSON.stringify([]));
        }
        if (!localStorage.getItem('finzana-pagos')) {
            localStorage.setItem('finzana-pagos', JSON.stringify([]));
        }
        if (!localStorage.getItem('finzana-users')) {
            this.initializeDefaultUsers();
        }
        if (!localStorage.getItem('finzana-credito-counter')) {
            localStorage.setItem('finzana-credito-counter', '20000000');
        }
    }

    initializeDefaultUsers() {
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
        this.saveUsers(defaultUsers);
    }

    // ========== USUARIOS ==========
    getUsers() {
        const users = localStorage.getItem('finzana-users');
        return users ? JSON.parse(users) : {};
    }

    saveUsers(users) {
        localStorage.setItem('finzana-users', JSON.stringify(users));
    }

    // ========== CLIENTES ==========
    getClientes() {
        const clientes = localStorage.getItem('finzana-clientes');
        return clientes ? JSON.parse(clientes) : [];
    }

    saveClientes(clientes) {
        localStorage.setItem('finzana-clientes', JSON.stringify(clientes));
    }

    buscarClientePorCURP(curp) {
        const clientes = this.getClientes();
        return clientes.find(cliente => cliente.curp === curp);
    }

    agregarCliente(cliente) {
        const clientes = this.getClientes();
        
        // Validar que el cliente tenga CURP
        if (!cliente.curp) {
            return { success: false, message: 'El cliente debe tener una CURP' };
        }
        
        // Validar formato de CURP
        if (cliente.curp.length !== 18) {
            return { success: false, message: 'La CURP debe tener exactamente 18 caracteres' };
        }
        
        if (this.buscarClientePorCURP(cliente.curp)) {
            return { success: false, message: 'Ya existe un cliente con esta CURP' };
        }
        
        // Asegurar que el cliente tenga todos los campos necesarios
        const clienteCompleto = {
            id: this.generarId('CLI'),
            curp: cliente.curp,
            nombre: cliente.nombre || '',
            domicilio: cliente.domicilio || '',
            cp: cliente.cp || '',
            telefono: cliente.telefono || '',
            fecha_registro: cliente.fecha_registro || new Date().toISOString().split('T')[0],
            poblacion_grupo: cliente.poblacion_grupo || '',
            fechaCreacion: new Date().toISOString()
        };
        
        clientes.push(clienteCompleto);
        this.saveClientes(clientes);
        return { success: true, message: 'Cliente registrado exitosamente', data: clienteCompleto };
    }

    actualizarCliente(curp, datosActualizados) {
        const clientes = this.getClientes();
        const index = clientes.findIndex(cliente => cliente.curp === curp);
        if (index !== -1) {
            // Mantener los datos originales que no se deben cambiar
            datosActualizados.id = clientes[index].id;
            datosActualizados.fechaCreacion = clientes[index].fechaCreacion;
            datosActualizados.curp = curp; // Asegurar que la CURP no cambie
            
            clientes[index] = { ...clientes[index], ...datosActualizados };
            this.saveClientes(clientes);
            return { success: true, message: 'Cliente actualizado exitosamente' };
        }
        return { success: false, message: 'Cliente no encontrado' };
    }

    eliminarCliente(curp) {
        const clientes = this.getClientes();
        const nuevosClientes = clientes.filter(cliente => cliente.curp !== curp);
        if (nuevosClientes.length < clientes.length) {
            this.saveClientes(nuevosClientes);
            return { success: true, message: 'Cliente eliminado exitosamente' };
        }
        return { success: false, message: 'Cliente no encontrado' };
    }

    // ========== CRÉDITOS ==========
    getCreditos() {
        const creditos = localStorage.getItem('finzana-creditos');
        return creditos ? JSON.parse(creditos) : [];
    }

    saveCreditos(creditos) {
        localStorage.setItem('finzana-creditos', JSON.stringify(creditos));
    }

    buscarCreditoPorId(idCredito) {
        const creditos = this.getCreditos();
        let credito = creditos.find(credito => credito.id === idCredito);
        if (!credito) {
            credito = creditos.find(credito => {
                if (credito.id.length === 8 && credito.id.endsWith(idCredito)) return true;
                if (credito.id === idCredito) return true;
                return false;
            });
        }
        return credito;
    }

    buscarCreditosPorCliente(curpCliente) {
        const creditos = this.getCreditos();
        return creditos.filter(credito => credito.curpCliente === curpCliente && credito.estado === 'activo');
    }

    generarIdConsecutivo() {
        let counter = parseInt(localStorage.getItem('finzana-credito-counter')) || 20000000;
        const nuevoId = counter.toString();
        counter++;
        localStorage.setItem('finzana-credito-counter', counter.toString());
        return nuevoId;
    }

    agregarCredito(credito) {
        const creditos = this.getCreditos();
        
        // Generar ID consecutivo
        credito.id = this.generarIdConsecutivo();
        credito.fechaCreacion = new Date().toISOString();
        credito.estado = 'activo';
        credito.montoTotal = credito.monto * 1.3;
        credito.saldo = credito.montoTotal;
        
        creditos.push(credito);
        this.saveCreditos(creditos);
        
        return { 
            success: true, 
            message: 'Crédito generado exitosamente', 
            data: credito 
        };
    }

    agregarCreditoImportado(credito) {
        const creditos = this.getCreditos();
        if (this.buscarCreditoPorId(credito.id)) {
            return { success: false, message: 'Ya existe un crédito con este ID' };
        }
        credito.fechaCreacion = credito.fechaCreacion || new Date().toISOString();
        credito.estado = 'activo';
        credito.saldo = credito.montoTotal;
        creditos.push(credito);
        this.saveCreditos(creditos);
        return { success: true, message: 'Crédito importado exitosamente', data: credito };
    }

    // ========== PAGOS ==========
    getPagos() {
        const pagos = localStorage.getItem('finzana-pagos');
        return pagos ? JSON.parse(pagos) : [];
    }

    savePagos(pagos) {
        localStorage.setItem('finzana-pagos', JSON.stringify(pagos));
    }

    buscarPagosPorCredito(idCredito) {
        const pagos = this.getPagos();
        return pagos.filter(pago => pago.idCredito === idCredito);
    }

    agregarPago(pago) {
        const pagos = this.getPagos();
        const creditos = this.getCreditos();
        const credito = creditos.find(c => c.id === pago.idCredito);
        if (!credito) return { success: false, message: 'Crédito no encontrado' };

        if (!pago.comision) pago.comision = this.calcularComision(pago.monto, pago.tipoPago);
        credito.saldo -= pago.monto;
        if (credito.saldo <= 0) credito.estado = 'liquidado';

        pago.id = this.generarId('PAG');
        pago.fecha = new Date().toISOString();
        pago.saldoDespues = credito.saldo;

        pagos.push(pago);
        this.savePagos(pagos);
        this.saveCreditos(creditos);

        return { success: true, message: 'Pago registrado exitosamente', data: pago, credito: credito };
    }

    // ========== UTILIDADES ==========
    generarId(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    calcularComision(monto, tipoPago) {
        const porcentajes = { 'normal': 0.10, 'extraordinario': 0.05, 'actualizado': 0.08 };
        return monto * (porcentajes[tipoPago] || 0.10);
    }

  // ========== IMPORTACIÓN - SOLO DATOS EXACTOS DEL CSV ==========
importarDatosDesdeCSV(csvData, tipo) {
    try {
        const lineas = csvData.split('\n').filter(linea => linea.trim());
        const registrosImportados = [];
        const errores = [];

        console.log(`📊 Procesando ${lineas.length} líneas para ${tipo}`);

        for (let i = 0; i < lineas.length; i++) {
            // Parsear línea CSV
            const campos = this.parseCSVLine(lineas[i]);
            console.log(`Línea ${i + 1} campos:`, campos);

            if (tipo === 'clientes') {
                // FORMATO: NOMBRE,DOMICILIO,CP,TELEFONO,FECHA DE REGISTRO,GRUPO O POBLACION
                if (campos.length >= 6) {
                    const cliente = {
                        // ASIGNACIÓN EXACTA - SIN GENERAR DATOS AUTOMÁTICOS
                        nombre: campos[0] || '',
                        domicilio: campos[1] || '',
                        cp: campos[2] || '',
                        telefono: campos[3] || '',
                        fecha_registro: campos[4] || '',
                        poblacion_grupo: campos[5] || '',
                        curp: '' // CURP VACÍO - SE DEBE ASIGNAR MANUALMENTE
                    };
                    
                    console.log('Cliente a importar:', cliente);
                    
                    // Validar datos mínimos - solo requerimos nombre
                    if (cliente.nombre) {
                        // CORRECCIÓN: No guardar directamente, solo mostrar para revisión
                        // El CURP debe asignarse manualmente después
                        registrosImportados.push(cliente);
                        console.log(`✅ Cliente listo para revisión: ${cliente.nombre}`);
                    } else {
                        errores.push(`Línea ${i + 1}: Nombre faltante`);
                    }
                } else {
                    errores.push(`Línea ${i + 1}: Formato incorrecto. Se esperaban 6 campos, se encontraron ${campos.length}`);
                }
                
            } else if (tipo === 'colocacion') {
                // FORMATO: CURP,NOMBRE DEL CLIENTE,ID DE CREDITO,FECHA DE REGISTRO,TIPO,MONTO,PLAZO,MONTO TOTAL,CURP AVAL,NOMBRE AVAL,GRUPO O POBLACIÓN,RUTA,INTERES,SALDO,ULTIMO PAGO,SALDO VENCIDO,STATUS,SALDO INTERES,STJ150
                if (campos.length >= 19) {
                    const credito = {
                        curpCliente: campos[0] || '',
                        nombreCliente: campos[1] || '',
                        id: campos[2] || '',
                        fechaCreacion: this.convertirFecha(campos[3]) || '',
                        tipo: campos[4] || '',
                        monto: this.parseNumero(campos[5]) || 0,
                        plazo: parseInt(campos[6]) || 0,
                        montoTotal: this.parseNumero(campos[7]) || 0,
                        curpAval: campos[8] || '',
                        nombreAval: campos[9] || '',
                        grupoPoblacion: campos[10] || '',
                        ruta: campos[11] || '',
                        interes: this.parseNumero(campos[12]) || 0,
                        saldo: this.parseNumero(campos[13]) || 0,
                        fechaUltimoPago: this.convertirFecha(campos[14]) || '',
                        saldoVencido: this.parseNumero(campos[15]) || 0,
                        status: campos[16] || '',
                        saldoCapital: this.parseNumero(campos[17]) || 0,
                        saldoInteres: this.parseNumero(campos[18]) || 0,
                        stj150: campos[19] || ''
                    };
                    
                    if (credito.curpCliente && credito.id) {
                        const resultado = this.agregarCreditoImportado(credito);
                        if (resultado.success) registrosImportados.push(credito);
                        else errores.push(`Línea ${i + 1}: ${resultado.message}`);
                    } else {
                        errores.push(`Línea ${i + 1}: CURP Cliente o ID Crédito faltante`);
                    }
                } else {
                    errores.push(`Línea ${i + 1}: Formato incorrecto para colocación`);
                }
                
            } else if (tipo === 'cobranza') {
                // FORMATO: NOMBRE,ID DE CREDITO,FECHA,MONTO DE PAGO,COMISIÓN,TIPO DE PAGO,GRUPO O POBLACION,RUTA,SALDO,COBRADO POR
                if (campos.length >= 10) {
                    const pago = {
                        nombreCliente: campos[0] || '',
                        idCredito: campos[1] || '',
                        fecha: this.convertirFecha(campos[2]) || '',
                        monto: this.parseNumero(campos[3]) || 0,
                        comision: this.parseNumero(campos[4]) || 0,
                        tipoPago: campos[5] || '',
                        grupo: campos[6] || '',
                        ruta: campos[7] || '',
                        interesCobrado: this.parseNumero(campos[8]) || 0,
                        saldo: this.parseNumero(campos[9]) || 0,
                        cobradoPor: campos[10] || ''
                    };
                    
                    if (pago.idCredito && pago.monto > 0) {
                        const resultado = this.agregarPago(pago);
                        if (resultado.success) registrosImportados.push(pago);
                        else errores.push(`Línea ${i + 1}: ${resultado.message}`);
                    } else {
                        errores.push(`Línea ${i + 1}: ID Crédito o Monto inválido`);
                    }
                } else {
                    errores.push(`Línea ${i + 1}: Formato incorrecto para cobranza`);
                }
            }
        }

        return { 
            success: true, 
            total: lineas.length, 
            importados: registrosImportados.length, 
            errores: errores 
        };
    } catch (error) {
        console.error('Error en importación:', error);
        return { 
            success: false, 
            message: `Error en la importación: ${error.message}` 
        };
    }
}

// CORRECCIÓN: Función para parsear líneas CSV correctamente
parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result.map(field => field.replace(/^"|"$/g, ''));
}

    // ========== FUNCIÓN TEMPORAL PARA LIMPIAR DATOS CORRUPTOS ==========
    limpiarClientesDuplicados() {
        try {
            const clientes = this.getClientes();
            console.log('Clientes antes de limpiar:', clientes);
            
            const clientesUnicos = [];
            const curpsVistos = new Set();
            
            for (const cliente of clientes) {
                if (cliente && cliente.curp && !curpsVistos.has(cliente.curp)) {
                    // Validar que el cliente tenga la estructura correcta
                    const clienteLimpio = {
                        curp: cliente.curp,
                        nombre: cliente.nombre || '',
                        domicilio: cliente.domicilio || '',
                        cp: cliente.cp || '',
                        telefono: cliente.telefono || '',
                        fecha_registro: cliente.fecha_registro || new Date().toISOString().split('T')[0],
                        poblacion_grupo: cliente.poblacion_grupo || '',
                        id: cliente.id || this.generarId('CLI'),
                        fechaCreacion: cliente.fechaCreacion || new Date().toISOString()
                    };
                    
                    clientesUnicos.push(clienteLimpio);
                    curpsVistos.add(cliente.curp);
                }
            }
            
            this.saveClientes(clientesUnicos);
            console.log('Clientes después de limpiar:', clientesUnicos);
            
            return { 
                success: true, 
                message: `Limpieza completada. ${clientes.length - clientesUnicos.length} duplicados eliminados.` 
            };
        } catch (error) {
            console.error('Error en limpieza:', error);
            return { success: false, message: `Error en limpieza: ${error.message}` };
        }
    }

    limpiarBaseDeDatos() {
        localStorage.setItem('finzana-clientes', JSON.stringify([]));
        localStorage.setItem('finzana-creditos', JSON.stringify([]));
        localStorage.setItem('finzana-pagos', JSON.stringify([]));
        return { success: true, message: 'Base de datos limpiada exitosamente' };
    }

    // ========== GESTIÓN DE CRÉDITOS ==========
    obtenerCreditoMasReciente(curpCliente) {
        const creditos = this.getCreditos();
        const creditosCliente = creditos.filter(credito => 
            credito.curpCliente === curpCliente && credito.estado === 'activo'
        );
        if (creditosCliente.length === 0) return null;
        creditosCliente.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
        return creditosCliente[0];
    }

    obtenerInformacionCreditoCliente(curpCliente) {
        const credito = this.obtenerCreditoMasReciente(curpCliente);
        if (!credito) return null;
        
        const pagos = this.buscarPagosPorCredito(credito.id);
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
            idCredito: credito.id, fechaCreacion: credito.fechaCreacion,
            siguientePago: siguientePago.toISOString().split('T')[0], estaAlCorriente: estaAlCorriente,
            semanasAtraso: semanasAtraso, saldoRestante: saldoRestante, semanaActual: semanaActual,
            plazoTotal: credito.plazo, montoTotal: credito.montoTotal, totalPagado: totalPagado,
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

    // ========== REPORTES ==========
    generarReportes() {
        const clientes = this.getClientes();
        const creditos = this.getCreditos();
        const pagos = this.getPagos();

        const creditosActivos = creditos.filter(c => c.estado === 'activo');
        const totalCartera = creditosActivos.reduce((sum, credito) => sum + credito.saldo, 0);
        const totalPagosMes = pagos.filter(pago => {
            const fechaPago = new Date(pago.fecha);
            const hoy = new Date();
            return fechaPago.getMonth() === hoy.getMonth() && fechaPago.getFullYear() === hoy.getFullYear();
        });

        return {
            totalClientes: clientes.length, totalCreditos: creditosActivos.length,
            totalCartera: totalCartera, totalVencidos: creditosActivos.filter(c => this.esCreditoVencido(c)).length,
            pagosRegistrados: totalPagosMes.length, cobradoMes: totalPagosMes.reduce((sum, pago) => sum + pago.monto, 0),
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

