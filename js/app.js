// =============================================
// APLICACIÓN FINZANA - COMPLETAMENTE CORREGIDA
// =============================================

let currentUser = null;
let currentUserRole = null;
let searchCanceled = false;
let currentOperation = null;

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando aplicación Finzana...');
    initializeEventListeners();
    setupAuthStateListener();
    showLoading(false);
});

// Configurar el listener de estado de autenticación
function setupAuthStateListener() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Usuario ha iniciado sesión
            currentUser = user;
            loadUserData(user.uid);
        } else {
            // Usuario ha cerrado sesión
            showLoginScreen();
        }
    });
}

// Cargar datos del usuario desde Firestore
function loadUserData(uid) {
    showProgress('Cargando datos del usuario...', 30);
    
    db.collection('users').doc(uid).get()
        .then((doc) => {
            if (doc.exists) {
                const userData = doc.data();
                currentUserRole = userData.role;
                showMainApp(userData);
                updateProgress(70);
                
                // Cargar datos iniciales según el rol
                loadInitialData();
                
            } else {
                showStatusMessage('No se encontraron datos de usuario', 'error');
                auth.signOut();
            }
        })
        .catch((error) => {
            console.error('Error cargando datos de usuario:', error);
            showStatusMessage('Error cargando datos de usuario', 'error');
            hideProgress();
        });
}

// Cargar datos iniciales de la aplicación
function loadInitialData() {
    // Cargar lista de cobradores para los filtros
    loadCobradores()
        .then(() => {
            updateProgress(100);
            setTimeout(() => {
                hideProgress();
            }, 500);
        })
        .catch((error) => {
            console.error('Error cargando datos iniciales:', error);
            hideProgress();
        });
}

// =============================================
// FUNCIONES DE INTERFAZ Y NAVEGACIÓN
// =============================================

function showLoginScreen() {
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

function showMainApp(userData) {
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    
    // Actualizar información del usuario en la barra superior
    document.getElementById('user-name').textContent = userData.name || userData.email;
    document.getElementById('user-role-display').textContent = `Rol: ${formatRole(userData.role)}`;
    
    // Mostrar vista principal
    showView('view-main-menu');
}

function showView(viewId) {
    // Ocultar todas las vistas
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Mostrar la vista solicitada
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        
        // Inicializar datos específicos de la vista
        switch(viewId) {
            case 'view-gestion-clientes':
                initializeGestionClientes();
                break;
            case 'view-usuarios':
                initializeGestionUsuarios();
                break;
            case 'view-reportes':
                initializeReportes();
                break;
            case 'view-reportes-avanzados':
                initializeReportesAvanzados();
                break;
        }
    }
}

// =============================================
// CONFIGURACIÓN DE EVENT LISTENERS
// =============================================

function initializeEventListeners() {
    console.log('Configurando event listeners...');
    
    // Sistema de Login
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Navegación del menú principal
    document.querySelectorAll('[data-view]').forEach(element => {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = element.getAttribute('data-view');
            showView(viewId);
        });
    });
    
    // Gestión de Clientes
    document.getElementById('btn-filtrar-clientes').addEventListener('click', filtrarClientes);
    document.getElementById('btn-limpiar-filtros-clientes').addEventListener('click', limpiarFiltrosClientes);
    document.getElementById('btn-exportar-clientes').addEventListener('click', exportarClientesExcel);
    
    // Gestión de Usuarios - CORREGIDO
    document.getElementById('btn-filtrar-usuarios').addEventListener('click', filtrarUsuarios);
    document.getElementById('btn-limpiar-filtros-usuarios').addEventListener('click', limpiarFiltrosUsuarios);
    document.getElementById('btn-cancelar-busqueda-usuarios').addEventListener('click', cancelarBusquedaUsuarios);
    document.getElementById('btn-nuevo-usuario').addEventListener('click', mostrarModalNuevoUsuario);
    
    // Registrar Cliente
    document.getElementById('form-registrar-cliente').addEventListener('submit', registrarNuevoCliente);
    
    // Importar Datos
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            switchImportTab(e.target.getAttribute('data-tab'));
        });
    });
    
    document.getElementById('btn-importar-clientes').addEventListener('click', importarClientes);
    document.getElementById('btn-importar-creditos').addEventListener('click', importarCreditos);
    document.getElementById('btn-importar-pagos').addEventListener('click', importarPagos);
    
    // Colocación
    document.getElementById('btn-buscar-cliente-colocacion').addEventListener('click', buscarClienteColocacion);
    document.getElementById('form-colocacion').addEventListener('submit', aprobarCredito);
    document.getElementById('btn-cancelar-colocacion').addEventListener('click', cancelarColocacion);
    
    // Cobranza
    document.getElementById('btn-filtrar-cobranza').addEventListener('click', filtrarCobranza);
    document.getElementById('btn-exportar-cobranza').addEventListener('click', exportarCobranzaExcel);
    
    // Reportes
    document.getElementById('btn-generar-reporte').addEventListener('click', generarReporte);
    document.getElementById('btn-exportar-reporte-general').addEventListener('click', exportarReporteGeneral);
    document.getElementById('btn-exportar-cartera').addEventListener('click', exportarCarteraPDF);
    
    // Reportes Avanzados
    document.getElementById('btn-generar-reporte-avanzado').addEventListener('click', generarReporteAvanzado);
    document.getElementById('btn-exportar-reporte-avanzado').addEventListener('click', exportarReporteAvanzadoExcel);
    
    // Modales
    document.getElementById('form-nuevo-usuario').addEventListener('submit', crearNuevoUsuario);
    document.getElementById('form-editar-usuario').addEventListener('submit', actualizarUsuario);
    document.getElementById('btn-confirmar-eliminar').addEventListener('click', confirmarEliminarUsuario);
    
    // Cerrar modales
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });
    
    // Barra de progreso
    document.getElementById('btn-cancelar-carga').addEventListener('click', cancelarOperacionActual);
    
    // Eventos de teclado para búsquedas
    document.getElementById('filtro-nombre').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') filtrarClientes();
    });
    
    document.getElementById('filtro-usuario-nombre').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') filtrarUsuarios();
    });
    
    console.log('Event listeners configurados correctamente');
}

// =============================================
// SISTEMA DE AUTENTICACIÓN
// =============================================

function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        showAuthStatus('Por favor ingresa email y contraseña', 'error');
        return;
    }
    
    showProgress('Iniciando sesión...', 20);
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            updateProgress(60);
            showAuthStatus('Inicio de sesión exitoso', 'success');
        })
        .catch((error) => {
            hideProgress();
            let errorMessage = 'Error al iniciar sesión';
            
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage = 'El formato del email es inválido';
                    break;
                case 'auth/user-disabled':
                    errorMessage = 'Esta cuenta ha sido deshabilitada';
                    break;
                case 'auth/user-not-found':
                    errorMessage = 'No existe una cuenta con este email';
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Contraseña incorrecta';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Demasiados intentos fallidos. Intenta más tarde';
                    break;
            }
            
            showAuthStatus(errorMessage, 'error');
        });
}

function handleLogout() {
    showProgress('Cerrando sesión...', 50);
    
    auth.signOut()
        .then(() => {
            updateProgress(100);
            setTimeout(() => {
                hideProgress();
                showLoginScreen();
                showAuthStatus('Sesión cerrada exitosamente', 'success');
            }, 500);
        })
        .catch((error) => {
            hideProgress();
            console.error('Error cerrando sesión:', error);
            showStatusMessage('Error al cerrar sesión', 'error');
        });
}

// =============================================
// GESTIÓN DE CLIENTES - CORREGIDA
// =============================================

function initializeGestionClientes() {
    // Limpiar tabla
    const tbody = document.getElementById('tabla-clientes-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; padding: 40px;">
                <i class="fas fa-search" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                <p>Utilice los filtros para buscar clientes</p>
            </td>
        </tr>
    `;
    
    // Limpiar mensajes de estado
    hideStatusMessage('clientes');
}

function filtrarClientes() {
    const nombre = document.getElementById('filtro-nombre').value.trim();
    const identificacion = document.getElementById('filtro-identificacion').value.trim();
    const estado = document.getElementById('filtro-estado').value;
    const cobrador = document.getElementById('filtro-cobrador').value;
    
    // Validar que al menos un filtro esté lleno
    if (!nombre && !identificacion && !estado && !cobrador) {
        showStatusMessage('Por favor ingrese al menos un criterio de búsqueda', 'warning', 'clientes');
        return;
    }
    
    showProgress('Buscando clientes...', 10);
    searchCanceled = false;
    currentOperation = 'filtrar-clientes';
    
    let query = db.collection('clientes');
    
    // Aplicar filtros de forma condicional
    if (nombre) {
        query = query.where('nombre', '>=', nombre).where('nombre', '<=', nombre + '\uf8ff');
    }
    
    if (identificacion) {
        query = query.where('identificacion', '==', identificacion);
    }
    
    if (estado) {
        query = query.where('estadoCredito', '==', estado);
    }
    
    if (cobrador) {
        query = query.where('cobradorAsignado', '==', cobrador);
    }
    
    updateProgress(30);
    
    query.get()
        .then((querySnapshot) => {
            if (searchCanceled) {
                hideProgress();
                showStatusMessage('Búsqueda cancelada por el usuario', 'info', 'clientes');
                return;
            }
            
            updateProgress(70);
            
            const clientes = [];
            querySnapshot.forEach((doc) => {
                clientes.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            updateProgress(90);
            mostrarClientesEnTabla(clientes);
            updateProgress(100);
            
            setTimeout(() => {
                hideProgress();
                const message = clientes.length === 0 ? 
                    'No se encontraron clientes con los criterios especificados' : 
                    `Se encontraron ${clientes.length} cliente(s)`;
                showStatusMessage(message, clientes.length === 0 ? 'warning' : 'success', 'clientes');
            }, 500);
        })
        .catch((error) => {
            hideProgress();
            console.error('Error buscando clientes:', error);
            showStatusMessage('Error al buscar clientes: ' + error.message, 'error', 'clientes');
        });
}

function mostrarClientesEnTabla(clientes) {
    const tbody = document.getElementById('tabla-clientes-body');
    
    if (clientes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <i class="fas fa-search" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                    <p>No se encontraron clientes</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = clientes.map(cliente => `
        <tr>
            <td>
                <strong>${cliente.nombre || 'N/A'}</strong>
                ${cliente.email ? `<br><small>${cliente.email}</small>` : ''}
            </td>
            <td>${cliente.identificacion || 'N/A'}</td>
            <td>${cliente.telefono || 'N/A'}</td>
            <td>
                <span class="status-${cliente.estadoCredito ? cliente.estadoCredito.toLowerCase().replace(' ', '-') : 'desconocido'}">
                    ${cliente.estadoCredito || 'N/A'}
                </span>
            </td>
            <td>${cliente.cobradorAsignado || 'No asignado'}</td>
            <td class="action-buttons">
                <button class="btn btn-sm btn-info" onclick="verDetallesCliente('${cliente.id}')" title="Ver detalles">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-warning" onclick="editarCliente('${cliente.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="eliminarCliente('${cliente.id}', '${cliente.nombre || 'este cliente'}')" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function limpiarFiltrosClientes() {
    document.getElementById('filtro-nombre').value = '';
    document.getElementById('filtro-identificacion').value = '';
    document.getElementById('filtro-estado').value = '';
    document.getElementById('filtro-cobrador').value = '';
    
    // Limpiar tabla
    const tbody = document.getElementById('tabla-clientes-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; padding: 40px;">
                <i class="fas fa-search" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                <p>Utilice los filtros para buscar clientes</p>
            </td>
        </tr>
    `;
    
    hideStatusMessage('clientes');
}

// =============================================
// GESTIÓN DE USUARIOS - COMPLETAMENTE CORREGIDA
// =============================================

function initializeGestionUsuarios() {
    // Solo administradores pueden gestionar usuarios
    if (currentUserRole !== 'admin') {
        showStatusMessage('No tienes permisos para gestionar usuarios', 'error', 'usuarios');
        document.getElementById('btn-nuevo-usuario').style.display = 'none';
        return;
    }
    
    document.getElementById('btn-nuevo-usuario').style.display = 'inline-flex';
    
    // Limpiar tabla
    const tbody = document.getElementById('tabla-usuarios-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; padding: 40px;">
                <i class="fas fa-search" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                <p>Utilice los filtros para buscar usuarios</p>
            </td>
        </tr>
    `;
    
    hideStatusMessage('usuarios');
}

function filtrarUsuarios() {
    // Solo administradores pueden filtrar usuarios
    if (currentUserRole !== 'admin') {
        showStatusMessage('No tienes permisos para gestionar usuarios', 'error', 'usuarios');
        return;
    }
    
    const nombre = document.getElementById('filtro-usuario-nombre').value.trim();
    const email = document.getElementById('filtro-usuario-email').value.trim();
    const rol = document.getElementById('filtro-usuario-rol').value;
    
    // Validar que al menos un filtro esté lleno
    if (!nombre && !email && !rol) {
        showStatusMessage('Por favor ingrese al menos un criterio de búsqueda', 'warning', 'usuarios');
        return;
    }
    
    showProgress('Buscando usuarios...', 10);
    searchCanceled = false;
    currentOperation = 'filtrar-usuarios';
    
    let query = db.collection('users');
    
    // Aplicar filtros de forma condicional
    if (nombre) {
        query = query.where('name', '>=', nombre).where('name', '<=', nombre + '\uf8ff');
    }
    
    if (email) {
        query = query.where('email', '>=', email).where('email', '<=', email + '\uf8ff');
    }
    
    if (rol) {
        query = query.where('role', '==', rol);
    }
    
    updateProgress(30);
    
    query.get()
        .then((querySnapshot) => {
            if (searchCanceled) {
                hideProgress();
                showStatusMessage('Búsqueda cancelada por el usuario', 'info', 'usuarios');
                return;
            }
            
            updateProgress(70);
            
            const usuarios = [];
            querySnapshot.forEach((doc) => {
                // No mostrar el usuario actual en la lista
                if (doc.id !== currentUser.uid) {
                    usuarios.push({
                        id: doc.id,
                        ...doc.data()
                    });
                }
            });
            
            updateProgress(90);
            mostrarUsuariosEnTabla(usuarios);
            updateProgress(100);
            
            setTimeout(() => {
                hideProgress();
                const message = usuarios.length === 0 ? 
                    'No se encontraron usuarios con los criterios especificados' : 
                    `Se encontraron ${usuarios.length} usuario(s)`;
                showStatusMessage(message, usuarios.length === 0 ? 'warning' : 'success', 'usuarios');
            }, 500);
        })
        .catch((error) => {
            hideProgress();
            console.error('Error buscando usuarios:', error);
            showStatusMessage('Error al buscar usuarios: ' + error.message, 'error', 'usuarios');
        });
}

function mostrarUsuariosEnTabla(usuarios) {
    const tbody = document.getElementById('tabla-usuarios-body');
    
    if (usuarios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <i class="fas fa-search" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                    <p>No se encontraron usuarios</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = usuarios.map(usuario => `
        <tr>
            <td>
                <strong>${usuario.name || 'N/A'}</strong>
                ${usuario.email ? `<br><small>${usuario.email}</small>` : ''}
            </td>
            <td>${usuario.email || 'N/A'}</td>
            <td>
                <span class="role-badge role-${usuario.role || 'desconocido'}">
                    ${formatRole(usuario.role)}
                </span>
            </td>
            <td>
                <span class="status-${usuario.active !== false ? 'success' : 'error'}">
                    ${usuario.active !== false ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>${usuario.lastLogin ? formatDate(usuario.lastLogin.toDate()) : 'Nunca'}</td>
            <td class="action-buttons">
                <button class="btn btn-sm btn-warning" onclick="editarUsuario('${usuario.id}')" title="Editar usuario">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="eliminarUsuario('${usuario.id}', '${usuario.name || 'este usuario'}')" title="Eliminar usuario">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function limpiarFiltrosUsuarios() {
    document.getElementById('filtro-usuario-nombre').value = '';
    document.getElementById('filtro-usuario-email').value = '';
    document.getElementById('filtro-usuario-rol').value = '';
    
    // Limpiar tabla
    const tbody = document.getElementById('tabla-usuarios-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; padding: 40px;">
                <i class="fas fa-search" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                <p>Utilice los filtros para buscar usuarios</p>
            </td>
        </tr>
    `;
    
    hideStatusMessage('usuarios');
}

function cancelarBusquedaUsuarios() {
    searchCanceled = true;
    showStatusMessage('Búsqueda cancelada', 'info', 'usuarios');
}

// =============================================
// CREACIÓN Y GESTIÓN DE USUARIOS
// =============================================

function mostrarModalNuevoUsuario() {
    if (currentUserRole !== 'admin') {
        showStatusMessage('No tienes permisos para crear usuarios', 'error', 'usuarios');
        return;
    }
    
    document.getElementById('form-nuevo-usuario').reset();
    document.getElementById('modal-nuevo-usuario').classList.remove('hidden');
}

function crearNuevoUsuario(e) {
    e.preventDefault();
    
    if (currentUserRole !== 'admin') {
        showStatusMessage('No tienes permisos para crear usuarios', 'error', 'usuarios');
        return;
    }
    
    const nombre = document.getElementById('nuevo-usuario-nombre').value.trim();
    const email = document.getElementById('nuevo-usuario-email').value.trim();
    const password = document.getElementById('nuevo-usuario-password').value;
    const rol = document.getElementById('nuevo-usuario-rol').value;
    const activo = document.getElementById('nuevo-usuario-activo').value === 'true';
    
    // Validaciones
    if (!nombre || !email || !password || !rol) {
        showStatusMessage('Por favor complete todos los campos requeridos', 'error', 'usuarios');
        return;
    }
    
    if (password.length < 6) {
        showStatusMessage('La contraseña debe tener al menos 6 caracteres', 'error', 'usuarios');
        return;
    }
    
    showProgress('Creando usuario...', 20);
    
    // Crear usuario en Firebase Auth
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            updateProgress(50);
            
            // Guardar datos adicionales en Firestore
            const userData = {
                name: nombre,
                email: email,
                role: rol,
                active: activo,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser.uid,
                lastLogin: null
            };
            
            return db.collection('users').doc(user.uid).set(userData);
        })
        .then(() => {
            updateProgress(80);
            
            // Cerrar modal y limpiar formulario
            closeAllModals();
            document.getElementById('form-nuevo-usuario').reset();
            
            updateProgress(100);
            
            setTimeout(() => {
                hideProgress();
                showStatusMessage('Usuario creado exitosamente', 'success', 'usuarios');
                
                // Recargar la lista de usuarios
                if (document.getElementById('view-usuarios').classList.contains('hidden') === false) {
                    filtrarUsuarios();
                }
            }, 500);
        })
        .catch((error) => {
            hideProgress();
            console.error('Error creando usuario:', error);
            
            let errorMessage = 'Error al crear usuario';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'El correo electrónico ya está en uso';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'El correo electrónico no es válido';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = 'La creación de usuarios no está habilitada';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'La contraseña es demasiado débil';
                    break;
            }
            
            showStatusMessage(errorMessage, 'error', 'usuarios');
        });
}

function editarUsuario(usuarioId) {
    if (currentUserRole !== 'admin') {
        showStatusMessage('No tienes permisos para editar usuarios', 'error', 'usuarios');
        return;
    }
    
    showProgress('Cargando datos del usuario...', 30);
    
    db.collection('users').doc(usuarioId).get()
        .then((doc) => {
            if (!doc.exists) {
                throw new Error('Usuario no encontrado');
            }
            
            const userData = doc.data();
            updateProgress(70);
            
            // Llenar el formulario de edición
            document.getElementById('editar-usuario-id').value = usuarioId;
            document.getElementById('editar-usuario-nombre').value = userData.name || '';
            document.getElementById('editar-usuario-email').value = userData.email || '';
            document.getElementById('editar-usuario-rol').value = userData.role || '';
            document.getElementById('editar-usuario-activo').value = userData.active !== false ? 'true' : 'false';
            document.getElementById('editar-usuario-password').value = '';
            
            updateProgress(100);
            setTimeout(() => {
                hideProgress();
                document.getElementById('modal-editar-usuario').classList.remove('hidden');
            }, 300);
        })
        .catch((error) => {
            hideProgress();
            console.error('Error cargando usuario:', error);
            showStatusMessage('Error al cargar datos del usuario', 'error', 'usuarios');
        });
}

function actualizarUsuario(e) {
    e.preventDefault();
    
    if (currentUserRole !== 'admin') {
        showStatusMessage('No tienes permisos para editar usuarios', 'error', 'usuarios');
        return;
    }
    
    const usuarioId = document.getElementById('editar-usuario-id').value;
    const nombre = document.getElementById('editar-usuario-nombre').value.trim();
    const email = document.getElementById('editar-usuario-email').value.trim();
    const password = document.getElementById('editar-usuario-password').value;
    const rol = document.getElementById('editar-usuario-rol').value;
    const activo = document.getElementById('editar-usuario-activo').value === 'true';
    
    // Validaciones
    if (!nombre || !email || !rol) {
        showStatusMessage('Por favor complete todos los campos requeridos', 'error', 'usuarios');
        return;
    }
    
    if (password && password.length < 6) {
        showStatusMessage('La contraseña debe tener al menos 6 caracteres', 'error', 'usuarios');
        return;
    }
    
    showProgress('Actualizando usuario...', 20);
    
    // Preparar datos de actualización
    const updateData = {
        name: nombre,
        email: email,
        role: rol,
        active: activo,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser.uid
    };
    
    // Si hay nueva contraseña, actualizarla en Auth
    const updatePromises = [];
    
    if (password) {
        // Para actualizar la contraseña de otro usuario necesitarías Cloud Functions
        // Por ahora solo actualizamos los datos en Firestore
        showStatusMessage('La actualización de contraseña requiere funciones adicionales', 'info', 'usuarios');
    }
    
    // Actualizar datos en Firestore
    updatePromises.push(
        db.collection('users').doc(usuarioId).update(updateData)
    );
    
    Promise.all(updatePromises)
        .then(() => {
            updateProgress(80);
            closeAllModals();
            document.getElementById('form-editar-usuario').reset();
            
            updateProgress(100);
            
            setTimeout(() => {
                hideProgress();
                showStatusMessage('Usuario actualizado exitosamente', 'success', 'usuarios');
                
                // Recargar la lista de usuarios
                if (document.getElementById('view-usuarios').classList.contains('hidden') === false) {
                    filtrarUsuarios();
                }
            }, 500);
        })
        .catch((error) => {
            hideProgress();
            console.error('Error actualizando usuario:', error);
            showStatusMessage('Error al actualizar usuario: ' + error.message, 'error', 'usuarios');
        });
}

function eliminarUsuario(usuarioId, usuarioNombre) {
    if (currentUserRole !== 'admin') {
        showStatusMessage('No tienes permisos para eliminar usuarios', 'error', 'usuarios');
        return;
    }
    
    // No permitir eliminar el propio usuario
    if (usuarioId === currentUser.uid) {
        showStatusMessage('No puedes eliminar tu propio usuario', 'error', 'usuarios');
        return;
    }
    
    document.getElementById('confirmar-eliminar-mensaje').textContent = 
        `¿Estás seguro de que deseas eliminar al usuario "${usuarioNombre}"? Esta acción no se puede deshacer.`;
    
    document.getElementById('btn-confirmar-eliminar').onclick = function() {
        realizarEliminacionUsuario(usuarioId);
    };
    
    document.getElementById('modal-confirmar-eliminar').classList.remove('hidden');
}

function realizarEliminacionUsuario(usuarioId) {
    showProgress('Eliminando usuario...', 30);
    
    // Eliminar usuario de Firestore
    // Nota: Para eliminar usuarios de Auth necesitas Cloud Functions o Admin SDK
    db.collection('users').doc(usuarioId).delete()
        .then(() => {
            updateProgress(80);
            closeAllModals();
            
            updateProgress(100);
            
            setTimeout(() => {
                hideProgress();
                showStatusMessage('Usuario eliminado exitosamente de la base de datos', 'success', 'usuarios');
                
                // Recargar la lista de usuarios
                if (document.getElementById('view-usuarios').classList.contains('hidden') === false) {
                    filtrarUsuarios();
                }
            }, 500);
        })
        .catch((error) => {
            hideProgress();
            console.error('Error eliminando usuario:', error);
            showStatusMessage('Error al eliminar usuario: ' + error.message, 'error', 'usuarios');
        });
}

// =============================================
// ELIMINACIÓN DE CLIENTES
// =============================================

function eliminarCliente(clienteId, clienteNombre) {
    if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
        showStatusMessage('No tienes permisos para eliminar clientes', 'error', 'clientes');
        return;
    }
    
    document.getElementById('confirmar-eliminar-mensaje').textContent = 
        `¿Estás seguro de que deseas eliminar al cliente "${clienteNombre}"? Esta acción no se puede deshacer.`;
    
    document.getElementById('btn-confirmar-eliminar').onclick = function() {
        realizarEliminacionCliente(clienteId);
    };
    
    document.getElementById('modal-confirmar-eliminar').classList.remove('hidden');
}

function realizarEliminacionCliente(clienteId) {
    showProgress('Eliminando cliente...', 30);
    
    db.collection('clientes').doc(clienteId).delete()
        .then(() => {
            updateProgress(80);
            closeAllModals();
            
            updateProgress(100);
            
            setTimeout(() => {
                hideProgress();
                showStatusMessage('Cliente eliminado exitosamente', 'success', 'clientes');
                
                // Recargar la lista de clientes
                if (document.getElementById('view-gestion-clientes').classList.contains('hidden') === false) {
                    filtrarClientes();
                }
            }, 500);
        })
        .catch((error) => {
            hideProgress();
            console.error('Error eliminando cliente:', error);
            showStatusMessage('Error al eliminar cliente: ' + error.message, 'error', 'clientes');
        });
}

// =============================================
// BARRA DE PROGRESO MEJORADA
// =============================================

function showProgress(message, progress = 0) {
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    progressText.textContent = message;
    progressBar.style.width = `${progress}%`;
    progressContainer.classList.remove('hidden');
    
    // Agregar clase al body para ajustar padding
    document.body.classList.add('has-progress');
    
    // Mostrar overlay de procesamiento para operaciones largas
    if (progress === 0) {
        showProcessingOverlay(message);
    }
}

function updateProgress(progress) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    progressBar.style.width = `${progress}%`;
    
    // Actualizar colores según el progreso
    if (progress <= 30) {
        progressBar.style.background = 'var(--danger)';
    } else if (progress <= 70) {
        progressBar.style.background = 'var(--warning)';
    } else if (progress < 100) {
        progressBar.style.background = 'var(--info)';
    } else {
        progressBar.style.background = 'var(--success)';
    }
    
    // Actualizar texto para progresos específicos
    if (progress >= 100) {
        progressText.textContent = 'Completado';
        setTimeout(hideProgress, 1000);
    }
}

function hideProgress() {
    const progressContainer = document.getElementById('progress-container');
    const processingOverlay = document.getElementById('processing-overlay');
    
    progressContainer.classList.add('hidden');
    processingOverlay.classList.add('hidden');
    document.body.classList.remove('has-progress');
    
    // Resetear variables de control
    searchCanceled = false;
    currentOperation = null;
}

function showProcessingOverlay(message) {
    const processingOverlay = document.getElementById('processing-overlay');
    const processingMessage = document.getElementById('processing-message');
    
    processingMessage.textContent = message;
    processingOverlay.classList.remove('hidden');
}

function cancelarOperacionActual() {
    searchCanceled = true;
    showStatusMessage('Operación cancelada por el usuario', 'info');
    hideProgress();
}

// =============================================
// FUNCIONES UTILITARIAS
// =============================================

function showAuthStatus(message, type) {
    const authStatus = document.getElementById('auth-status');
    authStatus.textContent = message;
    authStatus.className = 'auth-status';
    
    switch (type) {
        case 'success':
            authStatus.classList.add('status-success');
            break;
        case 'error':
            authStatus.classList.add('status-error');
            break;
        case 'warning':
            authStatus.classList.add('status-warning');
            break;
        default:
            authStatus.classList.add('status-info');
    }
    
    authStatus.classList.remove('hidden');
    
    // Auto-ocultar después de 5 segundos
    setTimeout(() => {
        authStatus.classList.add('hidden');
    }, 5000);
}

function showStatusMessage(message, type, context = 'general') {
    const statusElement = document.getElementById(`status-message-${context}`);
    if (!statusElement) return;
    
    statusElement.textContent = message;
    statusElement.className = 'status-message';
    
    switch (type) {
        case 'success':
            statusElement.classList.add('status-success');
            break;
        case 'error':
            statusElement.classList.add('status-error');
            break;
        case 'warning':
            statusElement.classList.add('status-warning');
            break;
        case 'info':
            statusElement.classList.add('status-info');
            break;
    }
    
    statusElement.classList.remove('hidden');
    
    // Auto-ocultar después de 5 segundos (excepto errores)
    if (type !== 'error') {
        setTimeout(() => {
            statusElement.classList.add('hidden');
        }, 5000);
    }
}

function hideStatusMessage(context = 'general') {
    const statusElement = document.getElementById(`status-message-${context}`);
    if (statusElement) {
        statusElement.classList.add('hidden');
    }
}

function showLoading(show = true) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function formatRole(role) {
    const roles = {
        'admin': 'Administrador',
        'supervisor': 'Supervisor',
        'cobrador': 'Cobrador',
        'consulta': 'Consulta'
    };
    return roles[role] || role;
}

function formatDate(date) {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.add('hidden');
    });
}

function loadCobradores() {
    return new Promise((resolve, reject) => {
        db.collection('users')
            .where('role', 'in', ['admin', 'supervisor', 'cobrador'])
            .get()
            .then((querySnapshot) => {
                const cobradores = [];
                querySnapshot.forEach((doc) => {
                    const userData = doc.data();
                    cobradores.push({
                        id: doc.id,
                        nombre: userData.name || userData.email,
                        email: userData.email
                    });
                });
                
                // Actualizar selects de cobradores en toda la aplicación
                updateCobradoresSelects(cobradores);
                resolve(cobradores);
            })
            .catch((error) => {
                console.error('Error cargando cobradores:', error);
                reject(error);
            });
    });
}

function updateCobradoresSelects(cobradores) {
    const selects = [
        'filtro-cobrador',
        'filtro-cobranza-cobrador',
        'cliente-cobrador',
        'avanzado-cobrador'
    ];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            // Guardar selección actual
            const currentValue = select.value;
            
            // Limpiar opciones (excepto la primera)
            select.innerHTML = '<option value="">Todos los cobradores</option>';
            
            // Agregar cobradores
            cobradores.forEach(cobrador => {
                const option = document.createElement('option');
                option.value = cobrador.id;
                option.textContent = cobrador.nombre;
                select.appendChild(option);
            });
            
            // Restaurar selección si existe
            if (currentValue && cobradores.some(c => c.id === currentValue)) {
                select.value = currentValue;
            }
        }
    });
}

// =============================================
// FUNCIONES DE OTRAS VISTAS (PLACEHOLDER)
// =============================================

function switchImportTab(tabName) {
    // Ocultar todos los tabs
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    // Activar tab seleccionado
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

function initializeReportes() {
    // Cargar estadísticas básicas
    loadEstadisticasReportes();
}

function initializeReportesAvanzados() {
    // Inicializar filtros avanzados
}

// Funciones placeholder para las demás vistas
function registrarNuevoCliente(e) { 
    e.preventDefault();
    showStatusMessage('Función de registro de cliente en desarrollo', 'info', 'registrar'); 
}

function importarClientes() { showStatusMessage('Función de importación en desarrollo', 'info', 'importar'); }
function importarCreditos() { showStatusMessage('Función de importación en desarrollo', 'info', 'importar'); }
function importarPagos() { showStatusMessage('Función de importación en desarrollo', 'info', 'importar'); }
function buscarClienteColocacion() { showStatusMessage('Función de colocación en desarrollo', 'info', 'colocacion'); }
function aprobarCredito(e) { e.preventDefault(); showStatusMessage('Función de aprobación en desarrollo', 'info', 'colocacion'); }
function cancelarColocacion() { showStatusMessage('Colocación cancelada', 'info', 'colocacion'); }
function filtrarCobranza() { showStatusMessage('Función de cobranza en desarrollo', 'info', 'cobranza'); }
function exportarCobranzaExcel() { showStatusMessage('Función de exportación en desarrollo', 'info', 'cobranza'); }
function generarReporte() { showStatusMessage('Función de reportes en desarrollo', 'info', 'reportes'); }
function exportarReporteGeneral() { showStatusMessage('Función de exportación en desarrollo', 'info', 'reportes'); }
function exportarCarteraPDF() { showStatusMessage('Función de exportación en desarrollo', 'info', 'reportes'); }
function generarReporteAvanzado() { showStatusMessage('Función de reportes avanzados en desarrollo', 'info', 'reportes-avanzados'); }
function exportarReporteAvanzadoExcel() { showStatusMessage('Función de exportación en desarrollo', 'info', 'reportes-avanzados'); }
function verDetallesCliente(id) { showStatusMessage(`Ver detalles del cliente ${id}`, 'info', 'clientes'); }
function editarCliente(id) { showStatusMessage(`Editar cliente ${id}`, 'info', 'clientes'); }
function exportarClientesExcel() { showStatusMessage('Función de exportación en desarrollo', 'info', 'clientes'); }

function loadEstadisticasReportes() {
    // Cargar estadísticas básicas para reportes
    const promises = [
        db.collection('clientes').get(),
        db.collection('creditos').where('estado', '==', 'activo').get()
    ];
    
    Promise.all(promises)
        .then(([clientesSnapshot, creditosSnapshot]) => {
            document.getElementById('total-clientes').textContent = clientesSnapshot.size;
            document.getElementById('total-creditos').textContent = creditosSnapshot.size;
            
            // Calcular cartera total (simplificado)
            let carteraTotal = 0;
            creditosSnapshot.forEach(doc => {
                const credito = doc.data();
                carteraTotal += parseFloat(credito.monto || 0);
            });
            
            document.getElementById('cartera-total').textContent = `$${carteraTotal.toLocaleString()}`;
            
            // Contar créditos atrasados (simplificado)
            document.getElementById('creditos-atrasados').textContent = '0';
        })
        .catch(error => {
            console.error('Error cargando estadísticas:', error);
        });
}

// =============================================
// INICIALIZACIÓN COMPLETA
// =============================================

console.log('Aplicación Finzana inicializada correctamente con Firebase');
