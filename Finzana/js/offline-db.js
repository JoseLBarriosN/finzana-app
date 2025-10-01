// Finzana - Gestión de Base de Datos Local (IndexedDB)
// offline-db.js
class OfflineDB {
    constructor() {
        this.dbName = 'FinzanaDB';
        // Incrementamos la versión para forzar una actualización y evitar el error
        this.version = 5;
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            console.log('🗃️ Inicializando base de datos local...');

            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('❌ Error abriendo IndexedDB:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ Base de datos local inicializada');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                console.log('🔄 Actualizando estructura de la base de datos...');
                const db = event.target.result;

                // Eliminar stores antiguos si existen
                if (db.objectStoreNames.contains('clientes')) {
                    db.deleteObjectStore('clientes');
                }
                if (db.objectStoreNames.contains('creditos')) {
                    db.deleteObjectStore('creditos');
                }
                if (db.objectStoreNames.contains('pagos')) {
                    db.deleteObjectStore('pagos');
                }

                // Crear store para transacciones
                if (!db.objectStoreNames.contains('transactions')) {
                    const transactionsStore = db.createObjectStore('transactions', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    transactionsStore.createIndex('date', 'date');
                    transactionsStore.createIndex('type', 'type');
                    transactionsStore.createIndex('category', 'category');
                }

                // Crear store para cola de sincronización
                if (!db.objectStoreNames.contains('syncQueue')) {
                    const syncStore = db.createObjectStore('syncQueue', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    syncStore.createIndex('table', 'table');
                    syncStore.createIndex('synced', 'synced');
                    syncStore.createIndex('timestamp', 'timestamp');
                }

                console.log('✅ Estructura de base de datos creada');
            };
        });
    }

    // Método genérico para agregar datos
    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            // Agregar timestamp si no existe
            if (!data.timestamp) {
                data.timestamp = new Date().toISOString();
            }

            const request = store.add(data);

            request.onsuccess = () => {
                console.log(`✅ Dato agregado a ${storeName}:`, request.result);
                resolve(request.result);
            };

            request.onerror = () => {
                console.error(`❌ Error agregando a ${storeName}:`, request.error);
                reject(request.error);
            };
        });
    }

    // Obtener todos los registros de un store
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                console.log(`✅ ${request.result.length} registros obtenidos de ${storeName}`);
                resolve(request.result);
            };

            request.onerror = () => {
                console.error(`❌ Error obteniendo datos de ${storeName}:`, request.error);
                reject(request.error);
            };
        });
    }

    // Obtener por índice
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                console.error(`❌ Error buscando en índice ${indexName}:`, request.error);
                reject(request.error);
            };
        });
    }

    // Actualizar registro
    async update(storeName, id, updates) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const data = getRequest.result;
                if (data) {
                    const updatedData = { ...data, ...updates, timestamp: new Date().toISOString() };
                    const putRequest = store.put(updatedData);

                    putRequest.onsuccess = () => {
                        console.log(`✅ Registro actualizado en ${storeName}`);
                        resolve(putRequest.result);
                    };

                    putRequest.onerror = () => {
                        reject(putRequest.error);
                    };
                } else {
                    reject(new Error('Registro no encontrado'));
                }
            };

            getRequest.onerror = () => {
                reject(getRequest.error);
            };
        });
    }

    // Eliminar registro
    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log(`✅ Registro eliminado de ${storeName}`);
                resolve();
            };

            request.onerror = () => {
                console.error(`❌ Error eliminando registro:`, request.error);
                reject(request.error);
            };
        });
    }

    // Métodos específicos para transacciones
    async addTransaction(transaction) {
        return this.add('transactions', transaction);
    }

    async getTransactions() {
        return this.getAll('transactions');
    }

    async clearTransactions() {
        return this.clearStore('transactions');
    }

    // Métodos de utilidad
    async getCount(storeName) {
        const data = await this.getAll(storeName);
        return data.length;
    }

    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Base de datos no inicializada'));
                return;
            }

            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log(`✅ Store ${storeName} limpiado`);
                resolve();
            };

            request.onerror = () => {
                console.error(`❌ Error limpiando store ${storeName}:`, request.error);
                reject(request.error);
            };
        });
    }
}

export default OfflineDB;