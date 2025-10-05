// =============================================
// SISTEMA DE BASE DE DATOS COMPLETO CON INDEXEDDB (VERSIÓN 3)
// =============================================

class FinzanaDatabase {
    constructor() {
        this.db = null;
        this.dbName = 'FinzanaDB';
        this.version = 3;
    }

    async connect() {
        if (this.db) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('Error al abrir IndexedDB:', event.target.error);
                reject('Error al abrir IndexedDB.');
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                const transaction = event.target.transaction;

                // Crear o actualizar object stores
                this.crearObjectStores(transaction);
            };
        });
    }

    crearObjectStores(transaction) {
        if (!this.db.objectStoreNames.contains('clientes')) {
            const clientesStore = this.db.createObjectStore('clientes', { keyPath: 'id', autoIncrement: true });
            clientesStore.createIndex('curp', 'curp', { unique: true });
            clientesStore.createIndex('nombre', 'nombre', { unique: false });
            clientesStore.createIndex('poblacion_grupo', 'poblacion_grupo', { unique: false });
            clientesStore.createIndex('office', 'office', { unique: false });
        }

        if (!this.db.objectStoreNames.contains('creditos')) {
            const creditosStore = this.db.createObjectStore('creditos', { keyPath: 'id' });
            creditosStore.createIndex('curpCliente', 'curpCliente', { unique: false });
            creditosStore.createIndex('estado', 'estado', { unique: false });
        }

        if (!this.db.objectStoreNames.contains('pagos')) {
            const pagosStore = this.db.createObjectStore('pagos', { keyPath: 'id', autoIncrement: true });
            pagosStore.createIndex('idCredito', 'idCredito', { unique: false });
            pagosStore.createIndex('fecha', 'fecha', { unique: false });
        }

        if (!this.db.objectStoreNames.contains('users')) {
            const usersStore = this.db.createObjectStore('users', { keyPath: 'username' });
            this.initializeDefaultUsers(usersStore);
        }

        if (!this.db.objectStoreNames.contains('config')) {
            const configStore = this.db.createObjectStore('config', { keyPath: 'key' });
            configStore.put({ key: 'credito-counter', value: 20000000 });
        }
    }

    initializeDefaultUsers(store) {
        const defaultUsers = {
            'admin': { username: 'admin', password: 'admin123', name: 'Administrador Principal', role: 'admin', email: 'admin@finzana.com', telefono: '' },
            'supervisor': { username: 'supervisor', password: 'super123', name: 'Supervisor Regional', role: 'supervisor', email: 'supervisor@finzana.com', telefono: '' },
            'cobrador1': { username: 'cobrador1', password: 'cobra123', name: 'Carlos Martínez - Cobrador JC1', role: 'cobrador', email: 'carlos@finzana.com', telefono: '333-123-4567' },
            'consulta': { username: 'consulta', password: 'consulta123', name: 'Usuario de Consulta', role: 'consulta', email: 'consulta@finzana.com', telefono: '' }
        };
        for (const user of Object.values(defaultUsers)) {
            store.put(user);
        }
    }

    // ========== MÉTODOS CRUD GENÉRICOS ==========
    async getAll(storeName) {
        await this.connect();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async add(storeName, data) {
        await this.connect();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async put(storeName, data) {
        await this.connect();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async delete(storeName, key) {
        await this.connect();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getBy(storeName, indexName, value) {
        await this.connect();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.get(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // ========== MÉTODOS ESPECÍFICOS DEL SISTEMA ==========
    async getUsers() {
        const usersArray = await this.getAll('users');
        const usersObject = {};
        usersArray.forEach(user => {
            usersObject[user.username] = user;
        });
        return usersObject;
    }

    async getClientes() { return this.getAll('clientes'); }
    async getCreditos() { return this.getAll('creditos'); }
    async getPagos() { return this.getAll('pagos'); }

    async buscarClientePorCURP(curp) {
        return this.getBy('clientes', 'curp', curp);
    }

    async buscarCreditoPorId(id) {
        await this.connect();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction('creditos', 'readonly');
            const store = transaction.objectStore('creditos');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async buscarCreditoActivoPorCliente(curp) {
        const creditos = await this.getCreditos();
        return creditos.find(c => c.curpCliente === curp && c.estado === 'activo');
    }

    async agregarCliente(cliente) {
        const existe = await this.buscarClientePorCURP(cliente.curp);
        if (existe) {
            return { success: false, message: 'Ya existe un cliente con esta CURP' };
        }
        if (!cliente.fechaRegistro) {
            cliente.fechaRegistro = new Date().toISOString();
        }
        await this.add('clientes', cliente);
        return { success: true, message: 'Cliente registrado exitosamente', data: cliente };
    }

    async generarIdConsecutivo() {
        await this.connect();
        const transaction = this.db.transaction('config', 'readwrite');
        const store = transaction.objectStore('config');
        const counter = await new Promise(res => store.get('credito-counter').onsuccess = e => res(e.target.result));
        const newValue = counter.value + 1;
        store.put({ key: 'credito-counter', value: newValue });
        return counter.value.toString();
    }

    async agregarCredito(credito) {
        if (await this.buscarCreditoActivoPorCliente(credito.curpCliente)) {
            return { success: false, message: 'El cliente ya tiene un crédito activo.' };
        }
        credito.id = await this.generarIdConsecutivo();
        credito.fechaCreacion = new Date().toISOString();
        credito.estado = 'activo';
        credito.montoTotal = credito.monto * 1.3;
        credito.saldo = credito.montoTotal;
        await this.add('creditos', credito);
        return { success: true, message: 'Crédito generado exitosamente', data: credito };
    }

    async agregarPago(pago) {
        const credito = await this.buscarCreditoPorId(pago.idCredito);
        if (!credito) return { success: false, message: 'Crédito no encontrado' };

        // Validar que el monto no exceda el saldo
        if (pago.monto > credito.saldo) {
            return { success: false, message: 'El monto del pago excede el saldo del crédito' };
        }

        credito.saldo -= pago.monto;
        if (credito.saldo <= 0.01) {
            credito.saldo = 0;
            credito.estado = 'liquidado';
        }

        await this.put('creditos', credito);

        if (!pago.comision) pago.comision = this.calcularComision(pago.monto, pago.tipoPago);
        pago.fecha = new Date().toISOString();
        pago.saldoDespues = credito.saldo;
        pago.registradoPor = 'Sistema';

        await this.add('pagos', pago);

        return {
            success: true,
            message: `Pago registrado exitosamente. Nuevo saldo: $${credito.saldo.toLocaleString()}`,
            data: pago
        };
    }

    calcularComision(monto, tipoPago) {
        let porcentaje = 0.05; // 5% por defecto

        switch (tipoPago) {
            case 'extraordinario':
                porcentaje = 0.03; // 3%
                break;
            case 'actualizado':
                porcentaje = 0.07; // 7%
                break;
            // normal mantiene 5%
        }

        return monto * porcentaje;
    }

    // ========== FUNCIONES PARA CÁLCULOS DE ESTADO ==========

    calcularEstadoCreditoDetallado(credito, pagos = []) {
        if (credito.estado === 'liquidado') {
            return {
                estado: 'liquidado',
                descripcion: 'Crédito Liquidado',
                semanasAtraso: 0,
                diasAtraso: 0,
                pagoSemanal: 0,
                proximoPago: 'N/A',
                elegibleNuevoCredito: true,
                semanasConsecutivasPagadas: credito.plazo
            };
        }

        const fechaInicio = new Date(credito.fechaCreacion);
        const hoy = new Date();
        const diasTranscurridos = Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24));
        const semanasTranscurridas = Math.floor(diasTranscurridos / 7);

        // Calcular pago semanal ideal
        const pagoSemanalIdeal = credito.montoTotal / credito.plazo;

        // Calcular monto pagado y semanas pagadas
        const montoPagado = credito.montoTotal - credito.saldo;
        const semanasPagadas = montoPagado / pagoSemanalIdeal;

        // Calcular atraso en semanas
        const semanasAtraso = Math.max(0, semanasTranscurridas - Math.floor(semanasPagadas));

        // Calcular días de atraso
        const diasAtraso = diasTranscurridos - (Math.floor(semanasPagadas) * 7);

        // Determinar estado
        let estado = 'al-corriente';
        let descripcion = 'Al Corriente';

        if (semanasAtraso > 0) {
            estado = 'atrasado';
            descripcion = `Atrasado - ${semanasAtraso} semana(s)`;
        }

        if (diasAtraso > 150) {
            estado = 'cobranza';
            descripcion = 'Cobranza - 150+ días';
        }

        if (diasAtraso > 300) {
            estado = 'juridico';
            descripcion = 'Jurídico - 300+ días';
        }

        // Verificar si es elegible para nuevo crédito (10 semanas seguidas)
        const pagosOrdenados = pagos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        let semanasConsecutivas = 0;
        let fechaReferencia = new Date(fechaInicio);

        for (let i = 0; i < Math.min(credito.plazo, 10); i++) {
            const semanaInicio = new Date(fechaReferencia);
            const semanaFin = new Date(fechaReferencia);
            semanaFin.setDate(semanaFin.getDate() + 7);

            const pagoSemana = pagosOrdenados.find(p => {
                const fechaPago = new Date(p.fecha);
                return fechaPago >= semanaInicio && fechaPago < semanaFin;
            });

            if (pagoSemana && pagoSemana.monto >= pagoSemanalIdeal * 0.8) {
                semanasConsecutivas++;
            } else {
                break;
            }

            fechaReferencia = semanaFin;
        }

        const elegibleNuevoCredito = semanasConsecutivas >= 10;

        return {
            estado,
            descripcion,
            semanasAtraso,
            diasAtraso,
            pagoSemanal: pagoSemanalIdeal,
            proximoPago: this.calcularProximoPago(credito, pagos),
            elegibleNuevoCredito,
            semanasConsecutivasPagadas: semanasConsecutivas
        };
    }

    calcularProximoPago(credito, pagos = []) {
        const fechaInicio = new Date(credito.fechaCreacion);
        const pagosOrdenados = pagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        const ultimoPago = pagosOrdenados[0];

        let fechaProximoPago;
        if (ultimoPago) {
            fechaProximoPago = new Date(ultimoPago.fecha);
            fechaProximoPago.setDate(fechaProximoPago.getDate() + 7);
        } else {
            fechaProximoPago = new Date(fechaInicio);
            fechaProximoPago.setDate(fechaProximoPago.getDate() + 7);
        }

        // Si la fecha de próximo pago ya pasó, calcular la siguiente
        const hoy = new Date();
        while (fechaProximoPago < hoy) {
            fechaProximoPago.setDate(fechaProximoPago.getDate() + 7);
        }

        return fechaProximoPago.toISOString().split('T')[0];
    }

    async obtenerHistorialCreditoCliente(curp) {
        const creditosCliente = (await this.getCreditos()).filter(c => c.curpCliente === curp);
        if (creditosCliente.length === 0) return null;

        creditosCliente.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
        const ultimoCredito = creditosCliente[0];

        const pagosCredito = (await this.getPagos()).filter(p => p.idCredito === ultimoCredito.id)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        const estadoDetallado = this.calcularEstadoCreditoDetallado(ultimoCredito, pagosCredito);
        const ultimoPago = pagosCredito.length > 0 ? pagosCredito[pagosCredito.length - 1] : null;

        let historial = {
            idCredito: ultimoCredito.id,
            estado: estadoDetallado.estado,
            descripcion: estadoDetallado.descripcion,
            saldoRestante: ultimoCredito.saldo,
            fechaUltimoPago: ultimoPago ? new Date(ultimoPago.fecha).toLocaleDateString() : 'N/A',
            pagoSemanal: estadoDetallado.pagoSemanal,
            proximoPago: estadoDetallado.proximoPago,
            semanasAtraso: estadoDetallado.semanasAtraso,
            elegibleNuevoCredito: estadoDetallado.elegibleNuevoCredito,
            semanasConsecutivasPagadas: estadoDetallado.semanasConsecutivasPagadas
        };

        return historial;
    }

    // ========== FUNCIONES DE BÚSQUEDA Y FILTRADO ==========
    async buscarClientes(filtros) {
        const todosClientes = await this.getClientes();
        const todosCreditos = await this.getCreditos();

        const resultados = [];

        for (const cliente of todosClientes) {
            let match = true;

            // Filtro por sucursal
            if (filtros.sucursal && cliente.office !== filtros.sucursal) {
                match = false;
            }

            // Otros filtros básicos
            if (match && filtros.curp && !cliente.curp.toLowerCase().includes(filtros.curp)) {
                match = false;
            }
            if (match && filtros.nombre && !cliente.nombre.toLowerCase().includes(filtros.nombre)) {
                match = false;
            }
            if (match && filtros.grupo && cliente.poblacion_grupo !== filtros.grupo) {
                match = false;
            }
            if (match && filtros.fechaRegistro && cliente.fechaRegistro && !cliente.fechaRegistro.startsWith(filtros.fechaRegistro)) {
                match = false;
            }

            // Filtros relacionados con créditos
            if (match && (filtros.fechaCredito || filtros.tipo || filtros.plazo || filtros.curpAval)) {
                const creditosCliente = todosCreditos.filter(c => c.curpCliente === cliente.curp);

                if (creditosCliente.length === 0) {
                    match = false;
                } else {
                    const matchCredito = creditosCliente.some(credito => {
                        if (filtros.fechaCredito && (!credito.fechaCreacion || !credito.fechaCreacion.startsWith(filtros.fechaCredito))) {
                            return false;
                        }
                        if (filtros.tipo && credito.tipo !== filtros.tipo) {
                            return false;
                        }
                        if (filtros.plazo && credito.plazo != filtros.plazo) {
                            return false;
                        }
                        if (filtros.curpAval && (!credito.curpAval || !credito.curpAval.toLowerCase().includes(filtros.curpAval))) {
                            return false;
                        }
                        return true;
                    });
                    if (!matchCredito) match = false;
                }
            }

            if (match) {
                resultados.push(cliente);
            }
        }

        return resultados;
    }

    // ========== FUNCIONES DE IMPORTACIÓN ==========
    async importarDatosDesdeCSV(csvData, tipo, office) {
        await this.connect();
        const lineas = csvData.split('\n').filter(linea => linea.trim());
        if (lineas.length === 0) return { success: true, total: 0, importados: 0, errores: [] };

        let errores = [];
        let importados = 0;

        try {
            if (tipo === 'clientes') {
                for (const [i, linea] of lineas.entries()) {
                    if (await this.procesarLineaCliente(linea, i, office, errores)) {
                        importados++;
                    }
                }
            }
            else if (tipo === 'colocacion') {
                for (const [i, linea] of lineas.entries()) {
                    if (await this.procesarLineaColocacion(linea, i, office, errores)) {
                        importados++;
                    }
                }
            }
            else if (tipo === 'cobranza') {
                for (const [i, linea] of lineas.entries()) {
                    if (await this.procesarLineaCobranza(linea, i, office, errores)) {
                        importados++;
                    }
                }
            }

            return {
                success: true,
                total: lineas.length,
                importados: importados,
                errores
            };
        } catch (error) {
            errores.push(`Error general en importación: ${error.message}`);
            return {
                success: false,
                total: lineas.length,
                importados: 0,
                errores
            };
        }
    }

    async procesarLineaCliente(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 7) {
            try {
                const cliente = {
                    curp: campos[0],
                    nombre: campos[1],
                    domicilio: campos[2],
                    cp: campos[3],
                    telefono: campos[4],
                    fechaRegistro: campos[5] || new Date().toISOString(),
                    poblacion_grupo: campos[6],
                    office: office,
                    ruta: campos[7] || 'IMPORTADA'
                };

                // Verificar si ya existe
                const existe = await this.buscarClientePorCURP(cliente.curp);
                if (!existe) {
                    await this.add('clientes', cliente);
                    return true;
                }
            } catch (error) {
                errores.push(`Línea ${i + 1}: ${error.message}`);
            }
        } else {
            errores.push(`Línea ${i + 1}: Formato incorrecto - se esperaban 7 campos, se encontraron ${campos.length}`);
        }
        return false;
    }

    async procesarLineaColocacion(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        const procesador = (office === 'GDL') ? this.procesarColocacionGDL : this.procesarColocacionLEON;
        const credito = procesador.call(this, linea, i, office, errores);

        if (credito) {
            try {
                // Verificar si el crédito ya existe
                const existe = await this.buscarCreditoPorId(credito.id);
                if (!existe) {
                    await this.add('creditos', credito);
                    return true;
                } else {
                    // Si ya existe, actualizamos en lugar de insertar
                    await this.put('creditos', credito);
                    return true;
                }
            } catch (error) {
                errores.push(`Línea ${i + 1}: ${error.message}`);
            }
        }
        return false;
    }

    async procesarLineaCobranza(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        const procesador = (office === 'GDL') ? this.procesarCobranzaGDL : this.procesarCobranzaLEON;
        const pago = procesador.call(this, linea, i, office, errores);

        if (pago) {
            try {
                await this.add('pagos', pago);
                return true;
            } catch (error) {
                errores.push(`Línea ${i + 1}: ${error.message}`);
            }
        }
        return false;
    }

    procesarColocacionGDL(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 13) {
            return {
                office,
                curpCliente: campos[0],
                nombreCliente: campos[1],
                id: campos[2],
                fechaCreacion: campos[3] || new Date().toISOString(),
                tipo: campos[4],
                monto: parseFloat(campos[5]) || 0,
                plazo: parseInt(campos[6]) || 13,
                montoTotal: parseFloat(campos[7]) || 0,
                curpAval: campos[8],
                nombreAval: campos[9],
                poblacion_grupo: campos[10],
                ruta: campos[11],
                saldo: parseFloat(campos[12]) || 0,
                estado: parseFloat(campos[12]) > 0.01 ? 'activo' : 'liquidado'
            };
        } else {
            errores.push(`Línea ${i + 1}: Formato GDL-Colocación incorrecto. Campos: ${campos.length}, esperados: 13`);
            return null;
        }
    }

    procesarColocacionLEON(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 20) {
            return {
                office,
                curpCliente: campos[0],
                nombreCliente: campos[1],
                id: campos[2],
                fechaCreacion: campos[3] || new Date().toISOString(),
                tipo: campos[4],
                monto: parseFloat(campos[5]) || 0,
                plazo: parseInt(campos[6]) || 13,
                montoTotal: parseFloat(campos[7]) || 0,
                curpAval: campos[8],
                nombreAval: campos[9],
                poblacion_grupo: campos[10],
                ruta: campos[11],
                interes: parseFloat(campos[12]) || 0,
                saldo: parseFloat(campos[13]) || 0,
                ultimoPago: campos[14],
                saldoVencido: parseFloat(campos[15]) || 0,
                status: campos[16],
                saldoCapital: parseFloat(campos[17]) || 0,
                saldoInteres: parseFloat(campos[18]) || 0,
                stj150: campos[19],
                estado: parseFloat(campos[13]) > 0.01 ? 'activo' : 'liquidado'
            };
        } else {
            errores.push(`Línea ${i + 1}: Formato LEON-Colocación incorrecto. Campos: ${campos.length}, esperados: 20`);
            return null;
        }
    }

    procesarCobranzaGDL(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 10) {
            return {
                office,
                nombreCliente: campos[0],
                idCredito: campos[1],
                fecha: campos[2] || new Date().toISOString(),
                monto: parseFloat(campos[3]) || 0,
                cobroSemana: campos[4],
                comision: parseFloat(campos[5]) || 0,
                tipoPago: campos[6] || 'normal',
                grupo: campos[7],
                ruta: campos[8],
                semanaCredito: parseInt(campos[9]) || 1,
                fechaRegistro: new Date().toISOString(),
                registradoPor: 'Importación'
            };
        } else {
            errores.push(`Línea ${i + 1}: Formato GDL-Cobranza incorrecto. Campos: ${campos.length}, esperados: 10`);
            return null;
        }
    }

    procesarCobranzaLEON(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 9) {
            return {
                office,
                nombreCliente: campos[0],
                idCredito: campos[1],
                fecha: campos[2] || new Date().toISOString(),
                monto: parseFloat(campos[3]) || 0,
                comision: parseFloat(campos[4]) || 0,
                tipoPago: campos[5] || 'normal',
                grupo: campos[6],
                ruta: campos[7],
                interesCobrado: parseFloat(campos[8]) || 0,
                cobradoPor: campos[9] || 'Sistema',
                fechaRegistro: new Date().toISOString(),
                registradoPor: 'Importación'
            };
        } else {
            errores.push(`Línea ${i + 1}: Formato LEON-Cobranza incorrecto. Campos: ${campos.length}, esperados: 9`);
            return null;
        }
    }

    // ========== FUNCIONES DE REPORTES ==========
    async generarReportes() {
        try {
            const [clientes, creditos, pagos] = await Promise.all([
                this.getClientes(),
                this.getCreditos(),
                this.getPagos()
            ]);

            const creditosActivos = creditos.filter(c => c.estado === 'activo');
            const totalCartera = creditosActivos.reduce((sum, credito) => sum + (credito.saldo || 0), 0);

            const hoy = new Date();
            const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            const totalPagosMes = pagos.filter(pago => {
                try {
                    const fechaPago = new Date(pago.fecha);
                    return fechaPago >= primerDiaMes && fechaPago <= hoy;
                } catch {
                    return false;
                }
            });

            const cobradoMes = totalPagosMes.reduce((sum, pago) => sum + (pago.monto || 0), 0);
            const totalComisiones = totalPagosMes.reduce((sum, pago) => sum + (pago.comision || 0), 0);

            // Calcular créditos vencidos
            const totalVencidos = creditosActivos.filter(c => this.esCreditoVencido(c)).length;

            // Calcular tasa de recuperación
            const carteraTotal = creditos.reduce((sum, credito) => sum + (credito.montoTotal || 0), 0);
            const tasaRecuperacion = carteraTotal > 0 ? ((carteraTotal - totalCartera) / carteraTotal * 100) : 0;

            return {
                totalClientes: clientes.length,
                totalCreditos: creditosActivos.length,
                totalCartera: totalCartera,
                totalVencidos: totalVencidos,
                pagosRegistrados: totalPagosMes.length,
                cobradoMes: cobradoMes,
                totalComisiones: totalComisiones,
                tasaRecuperacion: tasaRecuperacion
            };
        } catch (error) {
            console.error('Error generando reportes:', error);
            return {
                totalClientes: 0,
                totalCreditos: 0,
                totalCartera: 0,
                totalVencidos: 0,
                pagosRegistrados: 0,
                cobradoMes: 0,
                totalComisiones: 0,
                tasaRecuperacion: 0
            };
        }
    }

    esCreditoVencido(credito) {
        if (credito.estado !== 'activo' || !credito.plazo || !credito.fechaCreacion) return false;

        try {
            const fechaCreacion = new Date(credito.fechaCreacion);
            const fechaVencimiento = new Date(fechaCreacion);
            fechaVencimiento.setDate(fechaVencimiento.getDate() + (credito.plazo * 7));
            return new Date() > fechaVencimiento;
        } catch {
            return false;
        }
    }

    calcularSemanasAtraso(credito) {
        if (credito.estado !== 'activo' || !credito.plazo || credito.plazo === 0) return 0;
        const pagoIdealPorSemana = credito.montoTotal / credito.plazo;
        const montoPagado = credito.montoTotal - credito.saldo;
        const fechaInicio = new Date(credito.fechaCreacion);
        const hoy = new Date();
        if (hoy < fechaInicio) return 0;
        const semanasTranscurridas = Math.floor((hoy - fechaInicio) / (1000 * 60 * 60 * 24 * 7));
        if (semanasTranscurridas <= 0) return 0;
        const pagoRequeridoHastaHoy = semanasTranscurridas * pagoIdealPorSemana;
        const deficit = pagoRequeridoHastaHoy - montoPagado;
        if (deficit <= 0) return 0;
        return Math.ceil(deficit / pagoIdealPorSemana);
    }

    async limpiarBaseDeDatos() {
        await this.connect();
        const transaction = this.db.transaction(['clientes', 'creditos', 'pagos', 'config', 'users'], 'readwrite');

        await Promise.all([
            new Promise(res => transaction.objectStore('clientes').clear().onsuccess = res),
            new Promise(res => transaction.objectStore('creditos').clear().onsuccess = res),
            new Promise(res => transaction.objectStore('pagos').clear().onsuccess = res),
            new Promise(res => transaction.objectStore('config').put({ key: 'credito-counter', value: 20000000 }).onsuccess = res)
        ]);

        // Volver a inicializar los usuarios por defecto
        const userStore = transaction.objectStore('users');
        userStore.clear();
        this.initializeDefaultUsers(userStore);

        return { success: true, message: 'Base de datos limpiada y reiniciada.' };
    }
}
