// =============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// =============================================

let database;
let currentUser = null;
let currentImportTab = 'clientes';
let creditoActual = null;

document.addEventListener('DOMContentLoaded', function () {
    // Inicializar base de datos
    database = new FinzanaDatabase();
    const users = database.getUsers();

    // Inicializar dropdowns de población/grupo
    inicializarDropdowns();

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

        if (users[username] && users[username].password === password && users[username].role === role) {
            currentUser = { username: username, name: users[username].name, role: users[username].role };
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');
            document.getElementById('user-name').textContent = users[username].name;
            document.getElementById('user-role-display').textContent = users[username].role;

            if (role === 'admin') {
                document.getElementById('admin-menu').style.display = 'block';
                document.getElementById('admin-menu-import').style.display = 'block';
            }
            localStorage.setItem('finzana-user', JSON.stringify(currentUser));
        } else {
            document.getElementById('auth-status').textContent = 'Credenciales incorrectas. Verifica usuario, contraseña y rol.';
            document.getElementById('auth-status').className = 'status-message status-error';
        }
    });

    // Verificar sesión activa
    const savedUser = localStorage.getItem('finzana-user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('loading-overlay').classList.add('hidden');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('user-name').textContent = currentUser.name;
        document.getElementById('user-role-display').textContent = currentUser.role;
        if (currentUser.role === 'admin') {
            document.getElementById('admin-menu').style.display = 'block';
            document.getElementById('admin-menu-import').style.display = 'block';
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
            showView(targetView);
        });
    });

    // Gestión de clientes
    document.getElementById('btn-buscar-cliente').addEventListener('click', loadClientesTable);
    document.getElementById('buscar-cliente').addEventListener('input', loadClientesTable);

    // Gestión de usuarios
    document.getElementById('btn-nuevo-usuario').addEventListener('click', function() {
        document.getElementById('form-usuario-container').classList.remove('hidden');
        document.getElementById('form-usuario-titulo').textContent = 'Nuevo Usuario';
        document.getElementById('form-usuario').reset();
        document.getElementById('usuario-id').value = '';
        document.getElementById('nuevo-username').readOnly = false;
    });

    document.getElementById('btn-cancelar-usuario').addEventListener('click', function() {
        document.getElementById('form-usuario-container').classList.add('hidden');
    });

    document.getElementById('form-usuario').addEventListener('submit', function(e) {
        e.preventDefault();
        const users = database.getUsers();
        const userId = document.getElementById('usuario-id').value;
        const username = document.getElementById('nuevo-username').value;
        const password = document.getElementById('nuevo-password').value;
        const nombre = document.getElementById('nuevo-nombre').value;
        const rol = document.getElementById('nuevo-rol').value;
        const email = document.getElementById('nuevo-email').value;
        const telefono = document.getElementById('nuevo-telefono').value;

        if (userId) {
            if (users[userId]) {
                users[userId].name = nombre;
                users[userId].role = rol;
                users[userId].email = email;
                users[userId].telefono = telefono;
                if (password) users[userId].password = password;
                database.saveUsers(users);
                showStatus('status_usuarios', 'Usuario actualizado exitosamente', 'success');
            }
        } else {
            if (users[username]) {
                showStatus('status_usuarios', 'Ya existe un usuario con ese nombre', 'error');
                return;
            }
            users[username] = { password: password, name: nombre, role: rol, email: email, telefono: telefono, fechaCreacion: new Date().toISOString() };
            database.saveUsers(users);
            showStatus('status_usuarios', 'Usuario creado exitosamente', 'success');
        }
        document.getElementById('form-usuario-container').classList.add('hidden');
        loadUsersTable();
    });

    // ========== IMPORTACIÓN DE DATOS - CORRECCIONES APLICADAS ==========

    // Navegación entre pestañas de importación
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Remover clase active de todas las pestañas
            document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
            // Ocultar todos los contenidos
            document.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));
            
            // Activar pestaña clickeada
            this.classList.add('active');
            currentImportTab = this.getAttribute('data-tab');
            
            // Mostrar contenido correspondiente
            const tabContent = document.getElementById(`tab-${currentImportTab}`);
            if (tabContent) {
                tabContent.classList.remove('hidden');
            }
        });
    });

    // Procesar importación
    document.getElementById('btn-procesar-importacion').addEventListener('click', function() {
        const textareaId = `datos-importar-${currentImportTab}`;
        const textarea = document.getElementById(textareaId);
        
        if (!textarea) {
            showStatus('estado-importacion', 'Error: No se encontró el área de texto para importar', 'error');
            document.getElementById('resultado-importacion').classList.remove('hidden');
            return;
        }
        
        const csvData = textarea.value;
        
        if (!csvData.trim()) {
            showStatus('estado-importacion', 'No hay datos para importar', 'error');
            document.getElementById('resultado-importacion').classList.remove('hidden');
            return;
        }
        
        const resultado = database.importarDatosDesdeCSV(csvData, currentImportTab);
        
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
        } else {
            showStatus('estado-importacion', resultado.message, 'error');
        }
        
        document.getElementById('resultado-importacion').classList.remove('hidden');
    });

    document.getElementById('btn-limpiar-datos').addEventListener('click', function() {
        if (confirm('¿Estás seguro de que deseas limpiar toda la base de datos? Esta acción no se puede deshacer.')) {
            const resultado = database.limpiarBaseDeDatos();
            showStatus('estado-importacion', resultado.message, 'success');
            document.getElementById('resultado-importacion').classList.remove('hidden');
        }
    });

    // ========== CLIENTES - VALIDACIÓN CURP ==========
    const curpClienteInput = document.getElementById('curp_cliente');
    curpClienteInput.addEventListener('input', function() {
        validarCURP(this, 'cliente');
    });

    // ========== FORMULARIO CLIENTE - CORRECCIONES APLICADAS ==========
    document.getElementById('form-cliente').addEventListener('submit', function(e) {
        e.preventDefault();
        
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
            // FECHA DE REGISTRO AUTOMÁTICA - NO MANUAL (CORRECCIÓN APLICADA)
            fecha_registro: new Date().toISOString().split('T')[0],
            poblacion_grupo: document.getElementById('poblacion_grupo_cliente').value
        };

        // Validar campos obligatorios
        if (!cliente.nombre || !cliente.domicilio || !cliente.poblacion_grupo) {
            showStatus('status_cliente', 'Todos los campos marcados con * son obligatorios', 'error');
            return;
        }

        const resultado = database.agregarCliente(cliente);
        showStatus('status_cliente', resultado.message, resultado.success ? 'success' : 'error');
        
        if (resultado.success) {
            document.getElementById('form-cliente').reset();
            // Resetear estilos del CURP
            curpClienteInput.style.backgroundColor = '';
            curpClienteInput.style.borderColor = '';
            
            // Recargar tabla de clientes si estamos en esa vista
            if (document.getElementById('view-gestion-clientes').classList.contains('hidden') === false) {
                loadClientesTable();
            }
        }
    });

    // ========== COLOCACIÓN - GENERAR CRÉDITO ==========
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

    // Validación CURP AVAL
    const curpAvalInput = document.getElementById('curpAval_colocacion');
    curpAvalInput.addEventListener('input', function() {
        validarCURP(this, 'aval');
    });

    // Event listeners para dropdowns de monto y plazo
    document.getElementById('monto_colocacion').addEventListener('change', calcularMontoTotalColocacion);
    document.getElementById('plazo_colocacion').addEventListener('change', calcularMontoTotalColocacion);

    document.getElementById('form-colocacion').addEventListener('submit', function(e) {
        e.preventDefault();
        console.log('Formulario de crédito enviado');
        
        // Validaciones
        const curpAval = document.getElementById('curpAval_colocacion').value;
        const nombreAval = document.getElementById('nombreAval_colocacion').value;
        const monto = document.getElementById('monto_colocacion').value;
        const plazo = document.getElementById('plazo_colocacion').value;
        const tipoCredito = document.getElementById('tipo_colocacion').value;
        
        console.log('Datos del formulario:', { curpAval, nombreAval, monto, plazo, tipoCredito });
        
        if (!monto) {
            showStatus('status_colocacion', 'Debes seleccionar un monto', 'error');
            return;
        }

        if (!plazo) {
            showStatus('status_colocacion', 'Debes seleccionar un plazo', 'error');
            return;
        }

        if (!tipoCredito) {
            showStatus('status_colocacion', 'Debes seleccionar un tipo de crédito', 'error');
            return;
        }

        if (!validarFormatoCURP(curpAval)) {
            showStatus('status_colocacion', 'El CURP del aval debe tener exactamente 18 caracteres', 'error');
            return;
        }

        if (!nombreAval.trim()) {
            showStatus('status_colocacion', 'El nombre del aval es obligatorio', 'error');
            return;
        }

        const credito = {
            curpCliente: document.getElementById('curp_colocacion').value,
            tipo: tipoCredito,
            monto: parseFloat(monto),
            plazo: parseInt(plazo),
            montoTotal: parseFloat(document.getElementById('montoTotal_colocacion').value.replace('$', '').replace(',', '')),
            curpAval: curpAval,
            nombreAval: nombreAval,
            estado: 'activo'
        };

        console.log('Datos del crédito a guardar:', credito);

        const resultado = database.agregarCredito(credito);
        console.log('Resultado de agregar crédito:', resultado);
        
        if (resultado.success) {
            // Mostrar número de crédito generado
            showStatus('status_colocacion', `${resultado.message}. Número de crédito: ${resultado.data.id}`, 'success');
            document.getElementById('form-colocacion').reset();
            document.getElementById('form-colocacion').classList.add('hidden');
            document.getElementById('curp_colocacion').value = '';
            // Resetear estilos
            curpAvalInput.style.backgroundColor = '';
            curpAvalInput.style.borderColor = '';
            
            // Mostrar el número de crédito en la consola para verificación
            console.log('Crédito generado exitosamente. Número:', resultado.data.id);
        } else {
            showStatus('status_colocacion', resultado.message, 'error');
            console.error('Error al generar crédito:', resultado.message);
        }
    });

    // ========== COBRANZA - REGISTRAR PAGO ==========
    document.getElementById('btnBuscarCredito_cobranza').addEventListener('click', function() {
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
            const estadoCredito = document.getElementById('estado_cobranza');
            const semanasAtrasoInput = document.getElementById('semanas_atraso_cobranza');
            const siguientePagoInput = document.getElementById('siguiente_pago_cobranza');
            
            if (semanasAtraso > 0) {
                // Crédito atrasado
                document.getElementById('tipo_cobranza').value = 'extraordinario';
                document.getElementById('tipo_cobranza').disabled = true;
                
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
                document.getElementById('tipo_cobranza').value = 'normal';
                document.getElementById('tipo_cobranza').disabled = false;
                
                // Aplicar estilos verdes
                estadoCredito.style.color = 'var(--success)';
                estadoCredito.style.fontWeight = 'bold';
                estadoCredito.value = 'AL CORRIENTE';
                
                semanasAtrasoInput.style.color = 'var(--success)';
                semanasAtrasoInput.style.fontWeight = 'normal';
                
                siguientePagoInput.style.color = 'var(--success)';
                siguientePagoInput.style.fontWeight = 'normal';
            }
            
            document.getElementById('monto_cobranza').addEventListener('input', function() {
                const monto = parseFloat(this.value) || 0;
                const saldoActual = credito.saldo;
                const saldoDespues = saldoActual - monto;
                document.getElementById('saldoDespues_cobranza').value = `$${saldoDespues.toLocaleString()}`;
            });
            
            document.getElementById('form-cobranza').classList.remove('hidden');
            showStatus('status_cobranza', 'Crédito encontrado', 'success');
        } else {
            showStatus('status_cobranza', 'Crédito no encontrado. Verifica el ID', 'error');
            document.getElementById('form-cobranza').classList.add('hidden');
        }
    });

    document.getElementById('form-cobranza').addEventListener('submit', function(e) {
        e.preventDefault();
        const pago = {
            idCredito: creditoActual.id,
            monto: parseFloat(document.getElementById('monto_cobranza').value),
            tipoPago: document.getElementById('tipo_cobranza').value,
            grupo: document.getElementById('grupo_cobranza').value,
            ruta: 'JC1', // Por defecto
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
    });

    // ========== REPORTES ==========
    document.getElementById('btn-actualizar-reportes').addEventListener('click', function() {
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
    });

    // ========== FILTROS DE CLIENTES - CORRECCIONES APLICADAS ==========
    document.getElementById('btn-aplicar-filtros').addEventListener('click', loadClientesTable);
    document.getElementById('btn-limpiar-filtros').addEventListener('click', function() {
        document.getElementById('filtro-curp').value = '';
        document.getElementById('filtro-nombre').value = '';
        document.getElementById('filtro-telefono').value = '';
        document.getElementById('filtro-grupo').value = '';
        document.getElementById('filtro-fecha').value = '';
        document.getElementById('filtro-cp').value = '';
        loadClientesTable();
    });

    // Eventos de vistas
    document.getElementById('view-reportes').addEventListener('viewshown', function() {
        document.getElementById('btn-actualizar-reportes').click();
    });
    document.getElementById('view-usuarios').addEventListener('viewshown', loadUsersTable);
    document.getElementById('view-gestion-clientes').addEventListener('viewshown', loadClientesTable);
});

// ========== FUNCIONES AUXILIARES ==========

function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    document.getElementById(viewId).dispatchEvent(new Event('viewshown'));
}

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = 'status-message';
    if (type === 'success') element.classList.add('status-success');
    else if (type === 'error') element.classList.add('status-error');
    else if (type === 'info') element.classList.add('status-info');
}

function calcularMontoTotalColocacion() {
    const montoSelect = document.getElementById('monto_colocacion');
    const monto = montoSelect.value ? parseFloat(montoSelect.value) : 0;
    
    if (monto > 0) {
        const montoTotal = monto * 1.3; // 30% de interés
        document.getElementById('montoTotal_colocacion').value = `$${montoTotal.toLocaleString()}`;
    } else {
        document.getElementById('montoTotal_colocacion').value = '';
    }
}

// ========== VALIDACIÓN CURP ==========
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
    return curp.length === 18;
}

// ========== INICIALIZACIÓN DROPDOWNS ==========
function inicializarDropdowns() {
    // Datos reales de la hoja TABLAS del sistema Finzana
    const dropdownOptions = {
        tipoColocacion: ["NUEVO", "RENOVACION", "REINGRESO"],
        tipoPago: ["EXTRAORDINARIO", "ACTUALIZADO", "NORMAL"],
        plazos: ["14", "10", "13"],
        montos: ["3000", "3500", "4000", "4500", "5000", "6000", "7000", "8000", "9000", "10000"],
        estados: ["JALISCO", "GUANAJUATO"],
        poblaciones: [
            "LA CALERA", "ATEQUIZA", "SAN JACINTO", "PONCITLAN", "OCOTLAN",
            "ARENAL", "AMATITAN", "ACATLAN DE JUAREZ", "BELLAVISTA", 
            "SAN ISIDRO MAZATEPEC", "TALA", "CUISILLOS", "HUAXTLA", "NEXTIPAC",
            "SANTA LUCIA", "JAMAY", "LA BARCA", "SAN JUAN DE OCOTAN", "TALA 2",
            "EL HUMEDO", "NEXTIPAC 2", "ZZ PUEBLO"
        ],
        rGrupo: ["JC1", "RUTAX"],
        rutas: [
            "AUDITORIA", "SUPERVISION", "ADMINISTRACION", "DIRECCION",
            "COMERCIAL", "COBRANZA", "R1", "R2", "R3", "JC1", "RX"
        ]
    };

    // Inicializar dropdown de estado
    const estadoSelect = document.getElementById('estado_cliente');
    if (estadoSelect) {
        estadoSelect.innerHTML = '<option value="">Selecciona un estado</option>';
        dropdownOptions.estados.forEach(estado => {
            const option = document.createElement('option');
            option.value = estado;
            option.textContent = estado;
            estadoSelect.appendChild(option);
        });
    }

    // Inicializar dropdown de población/grupo
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
    
    // Inicializar dropdown de ruta
    const rutaSelect = document.getElementById('ruta_cliente');
    if (rutaSelect) {
        rutaSelect.innerHTML = '<option value="">Selecciona una ruta</option>';
        dropdownOptions.rutas.forEach(ruta => {
            const option = document.createElement('option');
            option.value = ruta;
            option.textContent = ruta;
            rutaSelect.appendChild(option);
        });
    }
    
    // Inicializar dropdown de tipo de crédito
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
    
    // Inicializar dropdown de montos
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
    
    // Inicializar dropdown de plazos
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

    // Inicializar dropdown de grupo/población para colocación
    const grupoPoblacionSelect = document.getElementById('grupo_poblacion_colocacion');
    if (grupoPoblacionSelect) {
        grupoPoblacionSelect.innerHTML = '<option value="">Selecciona grupo/población</option>';
        dropdownOptions.poblaciones.forEach(poblacion => {
            const option = document.createElement('option');
            option.value = poblacion;
            option.textContent = poblacion;
            grupoPoblacionSelect.appendChild(option);
        });
    }

    // Inicializar dropdown de ruta para colocación
    const rutaColocacionSelect = document.getElementById('ruta_colocacion');
    if (rutaColocacionSelect) {
        rutaColocacionSelect.innerHTML = '<option value="">Selecciona una ruta</option>';
        dropdownOptions.rutas.forEach(ruta => {
            const option = document.createElement('option');
            option.value = ruta;
            option.textContent = ruta;
            rutaColocacionSelect.appendChild(option);
        });
    }

    // Inicializar dropdown de tipo de pago (cobranza)
    const tipoPagoSelect = document.getElementById('tipo_cobranza');
    if (tipoPagoSelect) {
        tipoPagoSelect.innerHTML = '';
        dropdownOptions.tipoPago.forEach(tipo => {
            const option = document.createElement('option');
            option.value = tipo.toLowerCase();
            option.textContent = tipo;
            tipoPagoSelect.appendChild(option);
        });
    }

    console.log('✅ Dropdowns inicializados con datos reales del sistema');
}

// ========== GESTIÓN DE USUARIOS ==========
function loadUsersTable() {
    const users = database.getUsers();
    const tbody = document.getElementById('tabla-usuarios');
    tbody.innerHTML = '';
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

// ========== GESTIÓN DE CLIENTES - CORRECCIONES APLICADAS ==========
function loadClientesTable() {
    const clientes = database.getClientes();
    const tbody = document.getElementById('tabla-clientes');
    
    // Obtener valores de filtros
    const filtroCurp = document.getElementById('filtro-curp').value.toLowerCase();
    const filtroNombre = document.getElementById('filtro-nombre').value.toLowerCase();
    const filtroTelefono = document.getElementById('filtro-telefono').value.toLowerCase();
    const filtroGrupo = document.getElementById('filtro-grupo').value;
    const filtroFecha = document.getElementById('filtro-fecha').value;
    const filtroCp = document.getElementById('filtro-cp').value.toLowerCase();
    
    tbody.innerHTML = '';
    
    const clientesFiltrados = clientes.filter(cliente => {
        // Aplicar todos los filtros
        if (filtroCurp && !cliente.curp.toLowerCase().includes(filtroCurp)) return false;
        if (filtroNombre && !cliente.nombre.toLowerCase().includes(filtroNombre)) return false;
        if (filtroTelefono && !cliente.telefono.toLowerCase().includes(filtroTelefono)) return false;
        if (filtroGrupo && cliente.poblacion_grupo !== filtroGrupo) return false;
        if (filtroFecha && cliente.fecha_registro !== filtroFecha) return false;
        if (filtroCp && !cliente.cp.toLowerCase().includes(filtroCp)) return false;
        
        return true;
    });
    
    if (clientesFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No se encontraron clientes con los filtros aplicados</td></tr>';
        return;
    }
    
    for (const cliente of clientesFiltrados) {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${cliente.curp || ''}</td>
            <td>${cliente.nombre || ''}</td>
            <td>${cliente.domicilio || ''}</td>
            <td>${cliente.cp || ''}</td>
            <td>${cliente.telefono || ''}</td>
            <td>${cliente.fecha_registro || ''}</td>
            <td>${cliente.poblacion_grupo || ''}</td>
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
        document.getElementById('form-cliente').onsubmit = function(e) {
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
                document.getElementById('form-cliente').onsubmit = null;
                loadClientesTable();
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
