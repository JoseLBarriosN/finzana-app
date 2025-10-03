// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN - CORREGIDO
// =============================================

let database;
let currentUser = null;
let currentImportTab = 'clientes';
let creditoActual = null;

document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 Inicializando aplicación Finzana...');
    
    // Inicializar base de datos
    database = new FinzanaDatabase();
    
    // Inicializar dropdowns
    inicializarDropdowns();

    // Ocultar loading después de 2 segundos
    setTimeout(() => {
        document.getElementById('loading-overlay').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }, 2000);

    // ========== SISTEMA DE AUTENTICACIÓN ==========
    document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const role = document.getElementById('user-role').value;

        const users = database.getUsers();
        console.log('Usuarios disponibles:', users);

        if (users[username] && users[username].password === password && users[username].role === role) {
            currentUser = { 
                username: username, 
                name: users[username].name, 
                role: users[username].role 
            };
            
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            document.getElementById('user-name').textContent = users[username].name;
            document.getElementById('user-role-display').textContent = users[username].role;

            localStorage.setItem('finzana-user', JSON.stringify(currentUser));
            console.log('✅ Usuario autenticado:', currentUser);
        } else {
            document.getElementById('auth-status').textContent = 'Credenciales incorrectas. Verifica usuario, contraseña y rol.';
            document.getElementById('auth-status').className = 'status-message status-error';
            console.log('❌ Error de autenticación');
        }
    });

    // Verificar sesión activa
    const savedUser = localStorage.getItem('finzana-user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            document.getElementById('user-name').textContent = currentUser.name;
            document.getElementById('user-role-display').textContent = currentUser.role;
            console.log('✅ Sesión recuperada:', currentUser);
        } catch (error) {
            console.error('Error al recuperar sesión:', error);
            localStorage.removeItem('finzana-user');
        }
    }

    // ========== EVENT LISTENERS PRINCIPALES ==========

    // Logout
    document.getElementById('logout-btn').addEventListener('click', function() {
        localStorage.removeItem('finzana-user');
        location.reload();
    });

    // Navegación entre vistas
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', function() {
            const targetView = this.getAttribute('data-view');
            console.log('Navegando a vista:', targetView);
            showView(targetView);
        });
    });

    // Gestión de clientes - búsqueda
    const btnBuscarCliente = document.getElementById('btn-buscar-cliente');
    const buscarClienteInput = document.getElementById('buscar-cliente');
    
    if (btnBuscarCliente) {
        btnBuscarCliente.addEventListener('click', loadClientesTable);
    }
    
    if (buscarClienteInput) {
        buscarClienteInput.addEventListener('input', loadClientesTable);
    }

    // ========== GESTIÓN DE USUARIOS ==========
    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');
    const btnCancelarUsuario = document.getElementById('btn-cancelar-usuario');
    const formUsuario = document.getElementById('form-usuario');

    if (btnNuevoUsuario) {
        btnNuevoUsuario.addEventListener('click', function() {
            document.getElementById('form-usuario-container').classList.remove('hidden');
            document.getElementById('form-usuario-titulo').textContent = 'Nuevo Usuario';
            document.getElementById('form-usuario').reset();
            document.getElementById('usuario-id').value = '';
            document.getElementById('nuevo-username').readOnly = false;
        });
    }

    if (btnCancelarUsuario) {
        btnCancelarUsuario.addEventListener('click', function() {
            document.getElementById('form-usuario-container').classList.add('hidden');
        });
    }

    if (formUsuario) {
        formUsuario.addEventListener('submit', function(e) {
            e.preventDefault();
            guardarUsuario();
        });
    }

    // ========== IMPORTACIÓN DE DATOS - CORRECCIONES CRÍTICAS ==========

    // CORRECCIÓN: Navegación entre pestañas de importación
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            console.log('Cambiando a pestaña:', this.getAttribute('data-tab'));
            
            // Remover clase active de todas las pestañas
            document.querySelectorAll('.import-tab').forEach(t => {
                t.classList.remove('active');
            });
            
            // Ocultar todos los contenidos
            document.querySelectorAll('.import-tab-content').forEach(c => {
                c.classList.add('hidden');
            });
            
            // Activar pestaña clickeada
            this.classList.add('active');
            currentImportTab = this.getAttribute('data-tab');
            
            // Mostrar contenido correspondiente
            const tabContent = document.getElementById(`tab-${currentImportTab}`);
            if (tabContent) {
                tabContent.classList.remove('hidden');
            }
            
            console.log('Pestaña activa:', currentImportTab);
        });
    });

    // CORRECCIÓN: Procesar importación
    const btnProcesarImportacion = document.getElementById('btn-procesar-importacion');
    if (btnProcesarImportacion) {
        btnProcesarImportacion.addEventListener('click', function() {
            console.log('Procesando importación para:', currentImportTab);
            
            const textareaId = `datos-importar-${currentImportTab}`;
            const textarea = document.getElementById(textareaId);
            
            if (!textarea) {
                showStatus('estado-importacion', 'Error: No se encontró el área de texto para importar', 'error');
                document.getElementById('resultado-importacion').classList.remove('hidden');
                return;
            }
            
            const csvData = textarea.value.trim();
            
            if (!csvData) {
                showStatus('estado-importacion', 'No hay datos para importar', 'error');
                document.getElementById('resultado-importacion').classList.remove('hidden');
                return;
            }
            
            try {
                const resultado = database.importarDatosDesdeCSV(csvData, currentImportTab);
                console.log('Resultado importación:', resultado);
                
                if (resultado.success) {
                    let mensaje = `Importación completada: ${resultado.importados} de ${resultado.total} registros procesados`;
                    
                    if (resultado.errores && resultado.errores.length > 0) {
                        mensaje += `<br>Errores: ${resultado.errores.length}`;
                        document.getElementById('detalle-importacion').innerHTML = 
                            `<strong>Detalle de errores:</strong><ul>${resultado.errores.map(e => `<li>${e}</li>`).join('')}</ul>`;
                    } else {
                        document.getElementById('detalle-importacion').innerHTML = '';
                    }
                    
                    showStatus('estado-importacion', mensaje, 'success');
                    
                    // Limpiar textarea después de importación exitosa
                    textarea.value = '';
                } else {
                    showStatus('estado-importacion', resultado.message, 'error');
                }
            } catch (error) {
                console.error('Error en importación:', error);
                showStatus('estado-importacion', `Error: ${error.message}`, 'error');
            }
            
            document.getElementById('resultado-importacion').classList.remove('hidden');
        });
    }

    // Limpiar base de datos
    const btnLimpiarDatos = document.getElementById('btn-limpiar-datos');
    if (btnLimpiarDatos) {
        btnLimpiarDatos.addEventListener('click', function() {
            if (confirm('¿Estás seguro de que deseas limpiar toda la base de datos? Esta acción no se puede deshacer.')) {
                const resultado = database.limpiarBaseDeDatos();
                showStatus('estado-importacion', resultado.message, 'success');
                document.getElementById('resultado-importacion').classList.remove('hidden');
            }
        });
    }

    // ========== CLIENTES - VALIDACIÓN CURP ==========
    const curpClienteInput = document.getElementById('curp_cliente');
    if (curpClienteInput) {
        curpClienteInput.addEventListener('input', function() {
            validarCURP(this, 'cliente');
        });
    }

    // ========== FORMULARIO CLIENTE - CORRECCIÓN CRÍTICA ==========
    const formCliente = document.getElementById('form-cliente');
    if (formCliente) {
        formCliente.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Enviando formulario de cliente...');
            
            // Validar CURP antes de enviar
            const curp = document.getElementById('curp_cliente').value;
            if (!validarFormatoCURP(curp)) {
                showStatus('status_cliente', 'El CURP debe tener exactamente 18 caracteres', 'error');
                return;
            }

            const cliente = {
                curp: curp,
                nombre: document.getElementById('nombre_cliente').value,
                domicilio: document.getElementById('domicilio_cliente').value,
                cp: document.getElementById('cp_cliente').value,
                telefono: document.getElementById('telefono_cliente').value,
                // FECHA DE REGISTRO AUTOMÁTICA
                fecha_registro: new Date().toISOString().split('T')[0],
                poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value
            };

            // Validar campos obligatorios
            if (!cliente.nombre || !cliente.domicilio || !cliente.poblacion_grupo) {
                showStatus('status_cliente', 'Todos los campos marcados con * son obligatorios', 'error');
                return;
            }

            console.log('Datos del cliente a guardar:', cliente);
            
            try {
                const resultado = database.agregarCliente(cliente);
                console.log('Resultado guardar cliente:', resultado);
                
                showStatus('status_cliente', resultado.message, resultado.success ? 'success' : 'error');
                
                if (resultado.success) {
                    document.getElementById('form-cliente').reset();
                    // Resetear estilos del CURP
                    if (curpClienteInput) {
                        curpClienteInput.style.backgroundColor = '';
                        curpClienteInput.style.borderColor = '';
                    }
                    
                    // Recargar tabla de clientes si estamos en esa vista
                    if (!document.getElementById('view-gestion-clientes').classList.contains('hidden')) {
                        loadClientesTable();
                    }
                    
                    console.log('✅ Cliente guardado exitosamente');
                }
            } catch (error) {
                console.error('Error al guardar cliente:', error);
                showStatus('status_cliente', 'Error al guardar cliente: ' + error.message, 'error');
            }
        });
    }

    // ========== FILTROS DE CLIENTES ==========
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');
    
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', loadClientesTable);
    }
    
    if (btnLimpiarFiltros) {
        btnLimpiarFiltros.addEventListener('click', function() {
            document.getElementById('filtro-curp').value = '';
            document.getElementById('filtro-nombre').value = '';
            document.getElementById('filtro-telefono').value = '';
            document.getElementById('filtro-grupo').value = '';
            document.getElementById('filtro-fecha').value = '';
            document.getElementById('filtro-cp').value = '';
            loadClientesTable();
        });
    }

    // ========== COLOCACIÓN - GENERAR CRÉDITO ==========
    const btnBuscarClienteColocacion = document.getElementById('btnBuscarCliente_colocacion');
    if (btnBuscarClienteColocacion) {
        btnBuscarClienteColocacion.addEventListener('click', function() {
            const curp = document.getElementById('curp_colocacion').value.trim();
            
            // Validar que el CURP tenga 18 caracteres
            if (!validarFormatoCURP(curp)) {
                showStatus('status_colocacion', 'El CURP debe tener exactamente 18 caracteres', 'error');
                document.getElementById('form-colocacion').classList.add('hidden');
                return;
            }
            
            const cliente = database.buscarClientePorCURP(curp);
            if (cliente) {
                document.getElementById('nombre_colocacion').value = cliente.nombre;
                document.getElementById('idCredito_colocacion').value = 'Se asignará automáticamente';
                document.getElementById('form-colocacion').classList.remove('hidden');
                showStatus('status_colocacion', 'Cliente encontrado', 'success');
                // Resetear el cálculo del monto total
                document.getElementById('montoTotal_colocacion').value = '';
            } else {
                showStatus('status_colocacion', 'Cliente no encontrado. Verifica la CURP o registra al cliente primero', 'error');
                document.getElementById('form-colocacion').classList.add('hidden');
            }
        });
    }

    // Validación CURP AVAL
    const curpAvalInput = document.getElementById('curpAval_colocacion');
    if (curpAvalInput) {
        curpAvalInput.addEventListener('input', function() {
            validarCURP(this, 'aval');
        });
    }

    // Event listeners para dropdowns de monto y plazo
    const montoColocacion = document.getElementById('monto_colocacion');
    const plazoColocacion = document.getElementById('plazo_colocacion');
    
    if (montoColocacion) {
        montoColocacion.addEventListener('change', calcularMontoTotalColocacion);
    }
    
    if (plazoColocacion) {
        plazoColocacion.addEventListener('change', calcularMontoTotalColocacion);
    }

    const formColocacion = document.getElementById('form-colocacion');
    if (formColocacion) {
        formColocacion.addEventListener('submit', function(e) {
            e.preventDefault();
            generarCredito();
        });
    }

    // ========== COBRANZA - REGISTRAR PAGO ==========
    const btnBuscarCreditoCobranza = document.getElementById('btnBuscarCredito_cobranza');
    if (btnBuscarCreditoCobranza) {
        btnBuscarCreditoCobranza.addEventListener('click', function() {
            const idCredito = document.getElementById('idCredito_cobranza').value.trim();
            const credito = database.buscarCreditoPorId(idCredito);
            
            if (credito) {
                creditoActual = credito;
                const cliente = database.buscarClientePorCURP(credito.curpCliente);
                const infoCredito = database.obtenerInformacionCreditoCliente(credito.curpCliente);
                const semanasAtraso = database.calcularSemanasAtraso(credito);
                
                document.getElementById('nombre_cobranza').value = cliente ? cliente.nombre : 'No encontrado';
                document.getElementById('grupo_cobranza').value = cliente ? cliente.poblacion_grupo : 'No encontrado';
                document.getElementById('saldo_cobranza').value = `$${credito.saldo.toLocaleString()}`;
                document.getElementById('estado_cobranza').value = credito.estado;
                document.getElementById('siguiente_pago_cobranza').value = infoCredito ? infoCredito.siguientePago : 'N/A';
                document.getElementById('semanas_atraso_cobranza').value = semanasAtraso;
                
                // Aplicar estilos según atraso
                aplicarEstilosCobranza(semanasAtraso);
                
                document.getElementById('form-cobranza').classList.remove('hidden');
                showStatus('status_cobranza', 'Crédito encontrado', 'success');
            } else {
                showStatus('status_cobranza', 'Crédito no encontrado. Verifica el ID', 'error');
                document.getElementById('form-cobranza').classList.add('hidden');
            }
        });
    }

    const formCobranza = document.getElementById('form-cobranza');
    if (formCobranza) {
        formCobranza.addEventListener('submit', function(e) {
            e.preventDefault();
            registrarPago();
        });
    }

    // ========== REPORTES ==========
    const btnActualizarReportes = document.getElementById('btn-actualizar-reportes');
    if (btnActualizarReportes) {
        btnActualizarReportes.addEventListener('click', function() {
            actualizarReportes();
        });
    }

    // Eventos de vistas
    document.getElementById('view-reportes').addEventListener('viewshown', function() {
        document.getElementById('btn-actualizar-reportes').click();
    });
    
    document.getElementById('view-usuarios').addEventListener('viewshown', function() {
        loadUsersTable();
    });
    
    document.getElementById('view-gestion-clientes').addEventListener('viewshown', function() {
        loadClientesTable();
    });

    console.log('✅ Aplicación Finzana inicializada correctamente');
});

// =============================================
// FUNCIONES AUXILIARES
// =============================================

function showView(viewId) {
    console.log('Mostrando vista:', viewId);
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        // Disparar evento personalizado
        targetView.dispatchEvent(new CustomEvent('viewshown', { detail: { viewId: viewId } }));
    } else {
        console.error('Vista no encontrada:', viewId);
    }
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = message; // Usar innerHTML para permitir <br>
        element.className = 'status-message';
        if (type === 'success') {
            element.classList.add('status-success');
        } else if (type === 'error') {
            element.classList.add('status-error');
        } else if (type === 'info') {
            element.classList.add('status-info');
        }
        
        // Auto-ocultar después de 5 segundos
        setTimeout(() => {
            element.textContent = '';
            element.className = 'status-message';
        }, 5000);
    }
}

function calcularMontoTotalColocacion() {
    const montoSelect = document.getElementById('monto_colocacion');
    const montoTotalInput = document.getElementById('montoTotal_colocacion');
    
    if (montoSelect && montoTotalInput) {
        const monto = montoSelect.value ? parseFloat(montoSelect.value) : 0;
        
        if (monto > 0) {
            const montoTotal = monto * 1.3; // 30% de interés
            montoTotalInput.value = `$${montoTotal.toLocaleString()}`;
        } else {
            montoTotalInput.value = '';
        }
    }
}

// =============================================
// VALIDACIÓN CURP
// =============================================

function validarCURP(input, tipo) {
    const curp = input.value.toUpperCase();
    const curpLength = curp.length;
    
    // Limitar a 18 caracteres
    if (curpLength > 18) {
        input.value = curp.substring(0, 18);
        input.style.backgroundColor = '#ffebee';
        input.style.borderColor = 'var(--danger)';
        return false;
    }
    
    // Validar formato básico (solo longitud)
    if (curpLength === 18) {
        input.style.backgroundColor = '#e8f5e8';
        input.style.borderColor = 'var(--success)';
        return true;
    } else if (curpLength > 0) {
        input.style.backgroundColor = '#ffebee';
        input.style.borderColor = 'var(--danger)';
        return false;
    } else {
        input.style.backgroundColor = '';
        input.style.borderColor = '';
        return false;
    }
}

function validarFormatoCURP(curp) {
    return curp && curp.length === 18;
}

// =============================================
// INICIALIZACIÓN DROPDOWNS - SOLO POBLACIONES REALES
// =============================================

function inicializarDropdowns() {
    console.log('🔄 Inicializando dropdowns...');
    
    // SOLO LAS POBLACIONES/GRUPOS REALES DEL SISTEMA ORIGINAL
    const dropdownOptions = {
        tipoColocacion: ["NUEVO", "RENOVACION", "REINGRESO"],
        tipoPago: ["EXTRAORDINARIO", "ACTUALIZADO", "NORMAL"],
        plazos: ["14", "10", "13"],
        montos: ["3000", "3500", "4000", "4500", "5000", "6000", "7000", "8000", "9000", "10000"],
        // SOLO POBLACIONES - NO JALISCO NI GUANAJUATO
        poblaciones: [
            "LA CALERA", "ATEQUIZA", "SAN JACINTO", "PONCITLAN", "OCOTLAN",
            "ARENAL", "AMATITAN", "ACATLAN DE JUAREZ", "BELLAVISTA", 
            "SAN ISIDRO MAZATEPEC", "TALA", "CUISILLOS", "HUAXTLA", "NEXTIPAC",
            "SANTA LUCIA", "JAMAY", "LA BARCA", "SAN JUAN DE OCOTAN", "TALA 2",
            "EL HUMEDO", "NEXTIPAC 2", "ZZ PUEBLO"
        ],
        rutas: ["JC1", "RUTAX", "R1", "R2", "R3"]
    };

    // Dropdown de población/grupo para cliente
    const poblacionSelect = document.getElementById('poblacion_grupo_cliente');
    if (poblacionSelect) {
        poblacionSelect.innerHTML = '<option value="">Selecciona una población/grupo</option>';
        dropdownOptions.poblaciones.forEach(poblacion => {
            const option = document.createElement('option');
            option.value = poblacion;
            option.textContent = poblacion;
            poblacionSelect.appendChild(option);
        });
    }
    
    // Dropdown de tipo de crédito
    const tipoCreditoSelect = document.getElementById('tipo_colocacion');
    if (tipoCreditoSelect) {
        tipoCreditoSelect.innerHTML = '<option value="">Selecciona tipo de crédito</option>';
        dropdownOptions.tipoColocacion.forEach(tipo => {
            const option = document.createElement('option');
            option.value = tipo.toLowerCase();
            option.textContent = tipo;
            tipoCreditoSelect.appendChild(option);
        });
    }
    
    // Dropdown de montos
    const montoSelect = document.getElementById('monto_colocacion');
    if (montoSelect) {
        montoSelect.innerHTML = '<option value="">Selecciona un monto</option>';
        dropdownOptions.montos.forEach(monto => {
            const option = document.createElement('option');
            option.value = monto;
            option.textContent = `$${parseInt(monto).toLocaleString()}`;
            montoSelect.appendChild(option);
        });
    }
    
    // Dropdown de plazos
    const plazoSelect = document.getElementById('plazo_colocacion');
    if (plazoSelect) {
        plazoSelect.innerHTML = '<option value="">Selecciona un plazo</option>';
        dropdownOptions.plazos.forEach(plazo => {
            const option = document.createElement('option');
            option.value = plazo;
            option.textContent = `${plazo} semanas`;
            plazoSelect.appendChild(option);
        });
    }

    console.log('✅ Dropdowns inicializados correctamente');
}

// =============================================
// GESTIÓN DE USUARIOS
// =============================================

function guardarUsuario() {
    const users = database.getUsers();
    const userId = document.getElementById('usuario-id').value;
    const username = document.getElementById('nuevo-username').value;
    const password = document.getElementById('nuevo-password').value;
    const nombre = document.getElementById('nuevo-nombre').value;
    const rol = document.getElementById('nuevo-rol').value;
    const email = document.getElementById('nuevo-email').value;
    const telefono = document.getElementById('nuevo-telefono').value;

    if (!username || !password || !nombre || !rol) {
        showStatus('status_usuarios', 'Todos los campos marcados con * son obligatorios', 'error');
        return;
    }

    if (userId) {
        // Editar usuario existente
        if (users[userId]) {
            users[userId].name = nombre;
            users[userId].role = rol;
            users[userId].email = email;
            users[userId].telefono = telefono;
            if (password) {
                users[userId].password = password;
            }
            database.saveUsers(users);
            showStatus('status_usuarios', 'Usuario actualizado exitosamente', 'success');
        }
    } else {
        // Nuevo usuario
        if (users[username]) {
            showStatus('status_usuarios', 'Ya existe un usuario con ese nombre', 'error');
            return;
        }
        users[username] = { 
            password: password, 
            name: nombre, 
            role: rol, 
            email: email, 
            telefono: telefono, 
            fechaCreacion: new Date().toISOString() 
        };
        database.saveUsers(users);
        showStatus('status_usuarios', 'Usuario creado exitosamente', 'success');
    }
    
    document.getElementById('form-usuario-container').classList.add('hidden');
    loadUsersTable();
}

function loadUsersTable() {
    const users = database.getUsers();
    const tbody = document.getElementById('tabla-usuarios');
    
    if (!tbody) {
        console.error('No se encontró la tabla de usuarios');
        return;
    }
    
    tbody.innerHTML = '';
    
    if (Object.keys(users).length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay usuarios registrados</td></tr>';
        return;
    }
    
    for (const [username, userData] of Object.entries(users)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${username}</td>
            <td>${userData.name}</td>
            <td><span class="role-badge role-${userData.role}">${userData.role}</span></td>
            <td>${userData.email || ''}</td>
            <td>${userData.telefono || ''}</td>
            <td class="action-buttons">
                <button class="btn btn-sm btn-secondary" onclick="editUser('${username}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${username}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}

function editUser(username) {
    const users = database.getUsers();
    const user = users[username];
    if (user) {
        document.getElementById('form-usuario-container').classList.remove('hidden');
        document.getElementById('form-usuario-titulo').textContent = 'Editar Usuario';
        document.getElementById('usuario-id').value = username;
        document.getElementById('nuevo-username').value = username;
        document.getElementById('nuevo-username').readOnly = true;
        document.getElementById('nuevo-password').value = '';
        document.getElementById('nuevo-password').placeholder = 'Dejar en blanco para no cambiar';
        document.getElementById('nuevo-nombre').value = user.name;
        document.getElementById('nuevo-rol').value = user.role;
        document.getElementById('nuevo-email').value = user.email || '';
        document.getElementById('nuevo-telefono').value = user.telefono || '';
    }
}

function deleteUser(username) {
    if (confirm(`¿Estás seguro de que deseas eliminar al usuario ${username}?`)) {
        const users = database.getUsers();
        delete users[username];
        database.saveUsers(users);
        loadUsersTable();
        showStatus('status_usuarios', 'Usuario eliminado exitosamente', 'success');
    }
}

// =============================================
// GESTIÓN DE CLIENTES - CORRECCIÓN COMPLETA
// =============================================

function loadClientesTable() {
    const clientes = database.getClientes();
    const tbody = document.getElementById('tabla-clientes');
    
    if (!tbody) {
        console.error('No se encontró la tabla de clientes');
        return;
    }
    
    // Obtener valores de filtros
    const filtroCurp = document.getElementById('filtro-curp')?.value.toLowerCase() || '';
    const filtroNombre = document.getElementById('filtro-nombre')?.value.toLowerCase() || '';
    const filtroTelefono = document.getElementById('filtro-telefono')?.value.toLowerCase() || '';
    const filtroGrupo = document.getElementById('filtro-grupo')?.value || '';
    const filtroFecha = document.getElementById('filtro-fecha')?.value || '';
    const filtroCp = document.getElementById('filtro-cp')?.value.toLowerCase() || '';
    
    tbody.innerHTML = '';
    
    // CORRECCIÓN: Validar que los clientes tengan la estructura correcta
    const clientesFiltrados = clientes.filter(cliente => {
        // Validar estructura básica del cliente
        if (!cliente || typeof cliente !== 'object') {
            console.warn('Cliente inválido encontrado:', cliente);
            return false;
        }
        
        // Aplicar filtros
        if (filtroCurp && (!cliente.curp || !cliente.curp.toLowerCase().includes(filtroCurp))) return false;
        if (filtroNombre && (!cliente.nombre || !cliente.nombre.toLowerCase().includes(filtroNombre))) return false;
        if (filtroTelefono && (!cliente.telefono || !cliente.telefono.toLowerCase().includes(filtroTelefono))) return false;
        if (filtroGrupo && cliente.poblacion_grupo !== filtroGrupo) return false;
        if (filtroFecha && cliente.fecha_registro !== filtroFecha) return false;
        if (filtroCp && (!cliente.cp || !cliente.cp.toLowerCase().includes(filtroCp))) return false;
        
        return true;
    });
    
    console.log('Clientes filtrados:', clientesFiltrados);
    
    if (clientesFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No se encontraron clientes con los filtros aplicados</td></tr>';
        return;
    }
    
    for (const cliente of clientesFiltrados) {
        const tr = document.createElement('tr');
        
        // CORRECCIÓN: Asignación explícita y validación de cada campo
        tr.innerHTML = `
            <td>${cliente.curp || 'N/A'}</td>
            <td>${cliente.nombre || 'N/A'}</td>
            <td>${cliente.domicilio || 'N/A'}</td>
            <td>${cliente.cp || 'N/A'}</td>
            <td>${cliente.telefono || 'N/A'}</td>
            <td>${cliente.fecha_registro || 'N/A'}</td>
            <td>${cliente.poblacion_grupo || 'N/A'}</td>
            <td class="action-buttons">
                <button class="btn btn-sm btn-secondary" onclick="editCliente('${cliente.curp}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteCliente('${cliente.curp}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}

function editCliente(curp) {
    const cliente = database.buscarClientePorCURP(curp);
    if (cliente) {
        document.getElementById('curp_cliente').value = cliente.curp;
        document.getElementById('curp_cliente').readOnly = true;
        document.getElementById('nombre_cliente').value = cliente.nombre;
        document.getElementById('domicilio_cliente').value = cliente.domicilio;
        document.getElementById('cp_cliente').value = cliente.cp;
        document.getElementById('telefono_cliente').value = cliente.telefono;
        document.getElementById('poblacion_grupo_cliente').value = cliente.poblacion_grupo;
        
        document.querySelector('#form-cliente button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Actualizar Cliente';
        
        // Reemplazar el event listener temporalmente
        const formCliente = document.getElementById('form-cliente');
        const originalSubmit = formCliente.onsubmit;
        formCliente.onsubmit = function(e) {
            e.preventDefault();
            const datosActualizados = {
                curp: document.getElementById('curp_cliente').value,
                nombre: document.getElementById('nombre_cliente').value,
                domicilio: document.getElementById('domicilio_cliente').value,
                cp: document.getElementById('cp_cliente').value,
                telefono: document.getElementById('telefono_cliente').value,
                fecha_registro: cliente.fecha_registro, // Mantener la fecha original
                poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value
            };
            const resultado = database.actualizarCliente(curp, datosActualizados);
            showStatus('status_cliente', resultado.message, resultado.success ? 'success' : 'error');
            if (resultado.success) {
                document.getElementById('form-cliente').reset();
                document.getElementById('curp_cliente').readOnly = false;
                document.querySelector('#form-cliente button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';
                formCliente.onsubmit = originalSubmit;
                loadClientesTable();
                showView('view-gestion-clientes');
            }
        };
        
        showView('view-cliente');
    }
}

function deleteCliente(curp) {
    if (confirm(`¿Estás seguro de que deseas eliminar al cliente con CURP ${curp}?`)) {
        const resultado = database.eliminarCliente(curp);
        showStatus('status_gestion_clientes', resultado.message, resultado.success ? 'success' : 'error');
        loadClientesTable();
    }
}

// ========== COLOCACIÓN - GENERAR CRÉDITO CON GRUPO AUTOMÁTICO ==========
document.getElementById('btnBuscarCliente_colocacion').addEventListener('click', function() {
    const curp = document.getElementById('curp_colocacion').value.trim();
    
    // Validar que el CURP tenga 18 caracteres
    if (!validarFormatoCURP(curp)) {
        showStatus('status_colocacion', 'El CURP debe tener exactamente 18 caracteres', 'error');
        document.getElementById('form-colocacion').classList.add('hidden');
        return;
    }
    
    const cliente = database.buscarClientePorCURP(curp);
    if (cliente) {
        document.getElementById('nombre_colocacion').value = cliente.nombre || '';
        document.getElementById('idCredito_colocacion').value = 'Se asignará automáticamente';
        
        // CORRECCIÓN: Autocompletar grupo/población del cliente
        document.getElementById('grupo_colocacion').value = cliente.poblacion_grupo || '';
        
        document.getElementById('form-colocacion').classList.remove('hidden');
        showStatus('status_colocacion', 'Cliente encontrado', 'success');
        // Resetear el cálculo del monto total
        document.getElementById('montoTotal_colocacion').value = '';
    } else {
        showStatus('status_colocacion', 'Cliente no encontrado. Verifica la CURP o registra al cliente primero', 'error');
        document.getElementById('form-colocacion').classList.add('hidden');
    }
});

// =============================================
// COBRANZA - REGISTRAR PAGO
// =============================================

function aplicarEstilosCobranza(semanasAtraso) {
    const estadoCredito = document.getElementById('estado_cobranza');
    const semanasAtrasoInput = document.getElementById('semanas_atraso_cobranza');
    const siguientePagoInput = document.getElementById('siguiente_pago_cobranza');
    const tipoCobranza = document.getElementById('tipo_cobranza');
    
    if (semanasAtraso > 0) {
        // Crédito atrasado
        tipoCobranza.value = 'extraordinario';
        tipoCobranza.disabled = true;
        
        // Aplicar estilos rojos
        estadoCredito.style.color = 'var(--danger)';
        estadoCredito.style.fontWeight = 'bold';
        estadoCredito.value = 'ATRASADO';
        
        semanasAtrasoInput.style.color = 'var(--danger)';
        semanasAtrasoInput.style.fontWeight = 'bold';
        
        siguientePagoInput.style.color = 'var(--danger)';
        siguientePagoInput.style.fontWeight = 'bold';
    } else {
        // Crédito al corriente
        tipoCobranza.value = 'normal';
        tipoCobranza.disabled = false;
        
        // Aplicar estilos verdes
        estadoCredito.style.color = 'var(--success)';
        estadoCredito.style.fontWeight = 'bold';
        estadoCredito.value = 'AL CORRIENTE';
        
        semanasAtrasoInput.style.color = 'var(--success)';
        semanasAtrasoInput.style.fontWeight = 'normal';
        
        siguientePagoInput.style.color = 'var(--success)';
        siguientePagoInput.style.fontWeight = 'normal';
    }
}

function registrarPago() {
    const pago = {
        idCredito: creditoActual.id,
        monto: parseFloat(document.getElementById('monto_cobranza').value),
        tipoPago: document.getElementById('tipo_cobranza').value,
        grupo: document.getElementById('grupo_cobranza').value,
        ruta: 'JC1',
        interesCobrado: parseFloat(document.getElementById('monto_cobranza').value) * 0.3,
        cobradoPor: currentUser.name
    };
    
    const resultado = database.agregarPago(pago);
    showStatus('status_cobranza', resultado.message, resultado.success ? 'success' : 'error');
    
    if (resultado.success) {
        document.getElementById('form-cobranza').reset();
        document.getElementById('form-cobranza').classList.add('hidden');
        document.getElementById('idCredito_cobranza').value = '';
        document.getElementById('tipo_cobranza').disabled = false;
        creditoActual = null;
    }
}

// =============================================
// REPORTES
// =============================================

function actualizarReportes() {
    const reportes = database.generarReportes();
    
    document.getElementById('total-clientes').textContent = reportes.totalClientes;
    document.getElementById('total-creditos').textContent = reportes.totalCreditos;
    document.getElementById('total-cartera').textContent = `$${reportes.totalCartera.toLocaleString()}`;
    document.getElementById('total-vencidos').textContent = reportes.totalVencidos;
    document.getElementById('pagos-registrados').textContent = reportes.pagosRegistrados;
    document.getElementById('cobrado-mes').textContent = `$${reportes.cobradoMes.toLocaleString()}`;
    document.getElementById('total-comisiones').textContent = `$${reportes.totalComisiones.toLocaleString()}`;
    
    const tasaRecuperacion = reportes.totalCartera > 0 ? 
        ((reportes.cobradoMes / reportes.totalCartera) * 100).toFixed(1) : 0;
    document.getElementById('tasa-recuperacion').textContent = `${tasaRecuperacion}%`;
}

// ========== FUNCIÓN PARA LIMPIAR DATOS CORRUPTOS ==========
limpiarClientesDuplicados() {
    try {
        const clientes = this.getClientes();
        console.log('Clientes antes de limpiar:', clientes);
        
        const clientesUnicos = [];
        const curpsVistos = new Set();
        
        for (const cliente of clientes) {
            if (cliente && cliente.curp && !curpsVistos.has(cliente.curp)) {
                // Reestructurar cliente con campos correctos
                const clienteLimpio = {
                    id: cliente.id || this.generarId('CLI'),
                    curp: cliente.curp || '',
                    nombre: cliente.nombre || '',
                    domicilio: cliente.domicilio || '',
                    cp: cliente.cp || '',
                    telefono: cliente.telefono || '',
                    fecha_registro: cliente.fecha_registro || '',
                    poblacion_grupo: cliente.poblacion_grupo || '',
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
