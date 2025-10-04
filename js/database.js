// =============================================
// SISTEMA DE BASE DE DATOS COMPLETO CON INDEXEDDB (VERSIÓN 2)
// =============================================

class FinzanaDatabase {
    constructor() {
        this.db = null;
        this.dbName = 'FinzanaDB';
        this.version = 2; // VERSIÓN INCREMENTADA PARA APLICAR CAMBIOS DE ÍNDICES
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

                if (!this.db.objectStoreNames.contains('clientes')) {
                    const clientesStore = this.db.createObjectStore('clientes', { keyPath: 'id', autoIncrement: true });
                    clientesStore.createIndex('curp', 'curp', { unique: true });
                    clientesStore.createIndex('nombre', 'nombre', { unique: false });
                    clientesStore.createIndex('poblacion_grupo', 'poblacion_grupo', { unique: false });
                    clientesStore.createIndex('office', 'office', { unique: false });
                } else {
                    const clientesStore = transaction.objectStore('clientes');
                    if (!clientesStore.indexNames.contains('nombre')) clientesStore.createIndex('nombre', 'nombre');
                    if (!clientesStore.indexNames.contains('poblacion_grupo')) clientesStore.createIndex('poblacion_grupo', 'poblacion_grupo');
                    if (!clientesStore.indexNames.contains('office')) clientesStore.createIndex('office', 'office');
                }

                if (!this.db.objectStoreNames.contains('creditos')) {
                    const creditosStore = this.db.createObjectStore('creditos', { keyPath: 'id' });
                    creditosStore.createIndex('curpCliente', 'curpCliente', { unique: false });
                }

                if (!this.db.objectStoreNames.contains('pagos')) {
                    this.db.createObjectStore('pagos', { keyPath: 'id', autoIncrement: true });
                }

                if (!this.db.objectStoreNames.contains('users')) {
                    const usersStore = this.db.createObjectStore('users', { keyPath: 'username' });
                    this.initializeDefaultUsers(usersStore);
                }

                if (!this.db.objectStoreNames.contains('config')) {
                    const configStore = this.db.createObjectStore('config', { keyPath: 'key' });
                    configStore.put({ key: 'credito-counter', value: 20000000 });
                }
            };
        });
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

    // ========== MÉTODOS CRUD GENÉRICOS (INTERNOS) ==========
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

    async buscarClientes(filtros) {
        await this.connect();
        const transaction = this.db.transaction(['clientes', 'creditos'], 'readonly');
        const clientesStore = transaction.objectStore('clientes');

        const tieneFiltrosCredito = filtros.fechaCredito || filtros.tipo || filtros.plazo || filtros.curpAval;
        let creditosPorCliente = new Map();
        if (tieneFiltrosCredito) {
            const todosCreditos = await new Promise(res => transaction.objectStore('creditos').getAll().onsuccess = e => res(e.target.result));
            for (const credito of todosCreditos) {
                if (!creditosPorCliente.has(credito.curpCliente)) {
                    creditosPorCliente.set(credito.curpCliente, []);
                }
                creditosPorCliente.get(credito.curpCliente).push(credito);
            }
        }

        const resultados = [];
        return new Promise(resolve => {
            clientesStore.openCursor().onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const cliente = cursor.value;
                    let match = true;

                    if (filtros.sucursal && cliente.office !== filtros.sucursal) match = false;
                    if (match && filtros.curp && !cliente.curp.toLowerCase().includes(filtros.curp)) match = false;
                    if (match && filtros.nombre && !cliente.nombre.toLowerCase().includes(filtros.nombre)) match = false;
                    if (match && filtros.grupo && cliente.poblacion_grupo !== filtros.grupo) match = false;
                    if (match && filtros.fechaRegistro && cliente.fechaRegistro && !cliente.fechaRegistro.startsWith(filtros.fechaRegistro)) match = false;

                    if (match && tieneFiltrosCredito) {
                        const creditosCliente = creditosPorCliente.get(cliente.curp) || [];
                        if (creditosCliente.length === 0) {
                            match = false;
                        } else {
                            const matchCredito = creditosCliente.some(credito => {
                                if (filtros.fechaCredito && (!credito.fechaCreacion || !credito.fechaCreacion.startsWith(filtros.fechaCredito))) return false;
                                if (filtros.tipo && credito.tipo !== filtros.tipo) return false;
                                if (filtros.plazo && credito.plazo != filtros.plazo) return false;
                                if (filtros.curpAval && (!credito.curpAval || !credito.curpAval.toLowerCase().includes(filtros.curpAval))) return false;
                                return true;
                            });
                            if (!matchCredito) match = false;
                        }
                    }

                    if (match) {
                        resultados.push(cliente);
                    }
                    cursor.continue();
                } else {
                    resolve(resultados);
                }
            };
        });
    }

    // ========== MÉTODOS PÚBLICOS (API para app.js) ==========
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
    async buscarClientePorCURP(curp) { return this.getBy('clientes', 'curp', curp); }
    async buscarCreditoPorId(id) {
        const creditos = await this.getCreditos();
        return creditos.find(c => c.id === id);
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

        credito.saldo -= pago.monto;
        if (credito.saldo <= 0.01) {
            credito.saldo = 0;
            credito.estado = 'liquidado';
        }
        await this.put('creditos', credito);

        if (!pago.comision) pago.comision = this.calcularComision(pago.monto, pago.tipoPago);
        pago.fecha = new Date().toISOString();
        pago.saldoDespues = credito.saldo;
        await this.add('pagos', pago);

        return { success: true, message: 'Pago registrado exitosamente', data: pago };
    }
    async obtenerHistorialCreditoCliente(curp) {
        const creditosCliente = (await this.getCreditos()).filter(c => c.curpCliente === curp);
        if (creditosCliente.length === 0) return null;

        creditosCliente.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
        const ultimoCredito = creditosCliente[0];

        const pagosCredito = (await this.getPagos()).filter(p => p.idCredito === ultimoCredito.id)
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        const ultimoPago = pagosCredito.length > 0 ? pagosCredito[0] : null;

        let historial = {
            idCredito: ultimoCredito.id,
            estado: ultimoCredito.estado,
            saldoRestante: ultimoCredito.saldo,
            fechaUltimoPago: ultimoPago ? new Date(ultimoPago.fecha).toLocaleDateString() : 'N/A'
        };

        if (ultimoCredito.estado === 'activo') {
            historial.semanasAtraso = this.calcularSemanasAtraso(ultimoCredito);
            historial.estaAlCorriente = historial.semanasAtraso === 0;
            const fechaInicio = new Date(ultimoCredito.fechaCreacion);
            const semanasTranscurridas = Math.max(0, Math.floor((new Date() - fechaInicio) / (1000 * 60 * 60 * 24 * 7)));
            historial.semanaActual = Math.min(semanasTranscurridas + 1, ultimoCredito.plazo);
            historial.plazoTotal = ultimoCredito.plazo;
        } else {
            if (ultimoCredito.saldo > 0) {
                historial.estado = 'pendiente';
                const pagoPromedio = (ultimoCredito.plazo > 0) ? ultimoCredito.montoTotal / ultimoCredito.plazo : 0;
                historial.pagosFaltantes = (pagoPromedio > 0) ? Math.round(ultimoCredito.saldo / pagoPromedio) : 'N/A';
            } else {
                historial.estado = 'liquidado';
            }
        }
        return historial;
    }
    async limpiarBaseDeDatos() {
        await this.connect();
        const transaction = this.db.transaction(['clientes', 'creditos', 'pagos', 'config', 'users'], 'readwrite');
        await Promise.all([
            new Promise(res => transaction.objectStore('clientes').clear().onsuccess = res),
            new Promise(res => transaction.objectStore('creditos').clear().onsuccess = res),
            new Promise(res => transaction.objectStore('pagos').clear().onsuccess = res),
            new Promise(res => transaction.objectStore('config').put({ key: 'credito-counter', value: 20000000 }).onsuccess = res),
            new Promise(res => transaction.objectStore('users').clear().onsuccess = res)
        ]);
        // Volver a inicializar los usuarios por defecto
        const userStore = this.db.transaction('users', 'readwrite').objectStore('users');
        this.initializeDefaultUsers(userStore);

        return { success: true, message: 'Base de datos limpiada y reiniciada.' };
    }
    async importarDatosDesdeCSV(csvData, tipo, office) {
        await this.connect();
        const lineas = csvData.split('\n').filter(linea => linea.trim());
        if (lineas.length === 0) return { success: true, total: 0, importados: 0, errores: [] };

        let errores = [];
        const transaction = this.db.transaction(['clientes', 'creditos', 'pagos'], 'readwrite');
        const clientesStore = transaction.objectStore('clientes');
        const creditosStore = transaction.objectStore('creditos');
        const pagosStore = transaction.objectStore('pagos');

        if (tipo === 'clientes') {
            for (const [i, linea] of lineas.entries()) {
                const campos = linea.split(',').map(c => c.trim());
                if (campos.length >= 7) {
                    clientesStore.add({
                        curp: campos[0], nombre: campos[1], domicilio: campos[2], cp: campos[3],
                        telefono: campos[4], fechaRegistro: campos[5] || new Date().toISOString(),
                        poblacion_grupo: campos[6], office: office
                    });
                } else { errores.push(`Línea ${i + 1}: Formato incorrecto`); }
            }
        }
        else if (tipo === 'colocacion') {
            const procesador = (office === 'GDL') ? this.procesarColocacionGDL : this.procesarColocacionLEON;
            for (const [i, linea] of lineas.entries()) {
                const credito = procesador(linea, i, office, errores);
                if (credito) creditosStore.add(credito);
            }
        }
        else if (tipo === 'cobranza') {
            const creditosMap = new Map((await this.getCreditos()).map(c => [c.id, c]));
            const procesador = (office === 'GDL') ? this.procesarCobranzaGDL : this.procesarCobranzaLEON;
            for (const [i, linea] of lineas.entries()) {
                const pago = procesador(linea, i, office, errores);
                if (pago) pagosStore.add(pago);
            }
        }

        return new Promise(resolve => {
            transaction.oncomplete = () => {
                resolve({ success: true, total: lineas.length, importados: lineas.length - errores.length, errores });
            };
            transaction.onerror = (event) => {
                errores.push(`Error en transacción: ${event.target.error}. Verifique IDs duplicados.`);
                resolve({ success: false, total: lineas.length, importados: 0, errores });
            };
        });
    }

    procesarColocacionGDL(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 13) {
            return {
                office, curpCliente: campos[0], nombreCliente: campos[1], id: campos[2],
                fechaCreacion: campos[3], tipo: campos[4], monto: parseFloat(campos[5]),
                plazo: parseInt(campos[6]), montoTotal: parseFloat(campos[7]), curpAval: campos[8],
                nombreAval: campos[9], poblacion_grupo: campos[10], ruta: campos[11],
                saldo: parseFloat(campos[12]), estado: parseFloat(campos[12]) > 0.01 ? 'activo' : 'liquidado'
            };
        } else { errores.push(`Línea ${i + 1}: Formato GDL-Colocación incorrecto`); return null; }
    }
    procesarColocacionLEON(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 20) {
            return {
                office, curpCliente: campos[0], nombreCliente: campos[1], id: campos[2],
                fechaCreacion: campos[3], tipo: campos[4], monto: parseFloat(campos[5]),
                plazo: parseInt(campos[6]), montoTotal: parseFloat(campos[7]), curpAval: campos[8],
                nombreAval: campos[9], poblacion_grupo: campos[10], ruta: campos[11],
                interes: parseFloat(campos[12]), saldo: parseFloat(campos[13]),
                ultimoPago: campos[14], saldoVencido: parseFloat(campos[15]), status: campos[16],
                saldoCapital: parseFloat(campos[17]), saldoInteres: parseFloat(campos[18]), stj150: campos[19],
                estado: parseFloat(campos[13]) > 0.01 ? 'activo' : 'liquidado'
            };
        } else { errores.push(`Línea ${i + 1}: Formato LEON-Colocación incorrecto`); return null; }
    }
    procesarCobranzaGDL(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 11) {
            return {
                office, nombreCliente: campos[0], idCredito: campos[1], fecha: campos[2],
                monto: parseFloat(campos[3]), cobroSemana: campos[4], comision: parseFloat(campos[5]),
                tipoPago: campos[6], grupo: campos[7], ruta: campos[8], semanaCredito: parseInt(campos[9])
            };
        } else { errores.push(`Línea ${i + 1}: Formato GDL-Cobranza incorrecto`); return null; }
    }
    procesarCobranzaLEON(linea, i, office, errores) {
        const campos = linea.split(',').map(c => c.trim());
        if (campos.length >= 11) {
            return {
                office, nombreCliente: campos[0], idCredito: campos[1], fecha: campos[2],
                monto: parseFloat(campos[3]), comision: parseFloat(campos[4]), tipoPago: campos[5],
                grupo: campos[6], ruta: campos[7], interesCobrado: parseFloat(campos[8]), cobradoPor: campos[10]
            };
        } else { errores.push(`Línea ${i + 1}: Formato LEON-Cobranza incorrecto`); return null; }
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

    async generarReportes() {
        const [clientes, creditos, pagos] = await Promise.all([this.getClientes(), this.getCreditos(), this.getPagos()]);
        const creditosActivos = creditos.filter(c => c.estado === 'activo');
        const totalCartera = creditosActivos.reduce((sum, credito) => sum + credito.saldo, 0);
        const totalPagosMes = pagos.filter(pago => {
            const fechaPago = new Date(pago.fecha);
            const hoy = new Date();
            return fechaPago.getMonth() === hoy.getMonth() && fechaPago.getFullYear() === hoy.getFullYear();
        });
        const cobradoMes = totalPagosMes.reduce((sum, pago) => sum + pago.monto, 0);
        return {
            totalClientes: clientes.length, totalCreditos: creditosActivos.length,
            totalCartera: totalCartera, totalVencidos: creditosActivos.filter(c => this.esCreditoVencido(c)).length,
            pagosRegistrados: totalPagosMes.length, cobradoMes: cobradoMes,
            totalComisiones: totalPagosMes.reduce((sum, pago) => sum + (pago.comision || 0), 0)
        };
    }

    esCreditoVencido(credito) {
        if (credito.estado !== 'activo' || !credito.plazo) return false;
        const fechaCreacion = new Date(credito.fechaCreacion);
        const fechaVencimiento = new Date(fechaCreacion);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + (credito.plazo * 7));
        return new Date() > fechaVencimiento;
    }
}
