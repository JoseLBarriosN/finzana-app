class UIHelper {
    constructor() {
        this.loadingStates = new Map();
    }

    showLoading(elementId, text = 'Cargando...') {
        const element = document.getElementById(elementId);
        if (element) {
            this.loadingStates.set(elementId, element.innerHTML);
            element.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <span>${text}</span>
                </div>
            `;
            element.disabled = true;
        }
    }

    hideLoading(elementId) {
        const element = document.getElementById(elementId);
        if (element && this.loadingStates.has(elementId)) {
            element.innerHTML = this.loadingStates.get(elementId);
            element.disabled = false;
            this.loadingStates.delete(elementId);
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${this.getNotificationIcon(type)}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

        // Estilos para la notificación
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${this.getNotificationColor(type)};
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 1000;
            max-width: 400px;
            animation: slideInRight 0.3s ease;
        `;

        document.body.appendChild(notification);

        // Botón de cerrar
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.onclick = () => this.removeNotification(notification);

        // Auto-remover después de la duración
        if (duration > 0) {
            setTimeout(() => this.removeNotification(notification), duration);
        }

        return notification;
    }

    removeNotification(notification) {
        if (notification && notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    getNotificationIcon(type) {
        const icons = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    getNotificationColor(type) {
        const colors = {
            'success': '#10B981',
            'error': '#EF4444',
            'warning': '#F59E0B',
            'info': '#3B82F6'
        };
        return colors[type] || colors.info;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

export default UIHelper;