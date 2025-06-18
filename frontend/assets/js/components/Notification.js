
class NotificationComponent {
    constructor(options = {}) {
        this.options = {
            position: 'top-right', // top-left, top-right, bottom-left, bottom-right, top-center, bottom-center
            maxNotifications: 5,
            defaultDuration: 4000,
            animationDuration: 300,
            stackSpacing: 10,
            showProgress: true,
            allowDismiss: true,
            pauseOnHover: true,
            rtl: false,
            ...options
        };

        this.notifications = [];
        this.container = null;
        this.notificationId = 0;

        this.init();
    }

    init() {
        this.createContainer();
        this.bindGlobalEvents();
    }

    createContainer() {
        // 檢查是否已存在容器
        this.container = document.querySelector('.notifications-container');

        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = `notifications-container position-${this.options.position}`;
            this.container.setAttribute('aria-live', 'polite');
            this.container.setAttribute('aria-label', '通知區域');

            // 設置容器樣式
            this.setContainerStyles();

            document.body.appendChild(this.container);
        }
    }

    setContainerStyles() {
        const styles = {
            position: 'fixed',
            zIndex: '9999',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: `${this.options.stackSpacing}px`
        };

        // 根據位置設置樣式
        switch (this.options.position) {
            case 'top-left':
                styles.top = '20px';
                styles.left = '20px';
                break;
            case 'top-right':
                styles.top = '20px';
                styles.right = '20px';
                break;
            case 'top-center':
                styles.top = '20px';
                styles.left = '50%';
                styles.transform = 'translateX(-50%)';
                break;
            case 'bottom-left':
                styles.bottom = '20px';
                styles.left = '20px';
                styles.flexDirection = 'column-reverse';
                break;
            case 'bottom-right':
                styles.bottom = '20px';
                styles.right = '20px';
                styles.flexDirection = 'column-reverse';
                break;
            case 'bottom-center':
                styles.bottom = '20px';
                styles.left = '50%';
                styles.transform = 'translateX(-50%)';
                styles.flexDirection = 'column-reverse';
                break;
        }

        // 應用樣式
        Object.assign(this.container.style, styles);
    }

    bindGlobalEvents() {
        // 監聽頁面可見性變化
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseAll();
            } else {
                this.resumeAll();
            }
        });

        // 監聽鍵盤事件
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.dismissAll();
            }
        });
    }

    show(message, type = 'info', options = {}) {
        const notificationOptions = {
            ...this.options,
            ...options,
            id: ++this.notificationId,
            message,
            type,
            timestamp: Date.now()
        };

        // 檢查是否超過最大通知數量
        if (this.notifications.length >= this.options.maxNotifications) {
            this.dismissOldest();
        }

        const notification = this.createNotification(notificationOptions);
        this.notifications.push(notification);
        this.container.appendChild(notification.element);

        // 添加入場動畫
        this.animateIn(notification);

        // 設置自動消失
        if (notificationOptions.duration !== 0 && notificationOptions.duration !== false) {
            this.setAutoHide(notification, notificationOptions.duration || this.options.defaultDuration);
        }

        // 返回通知物件，允許外部控制
        return notification;
    }

    createNotification(options) {
        const notification = {
            id: options.id,
            type: options.type,
            message: options.message,
            timestamp: options.timestamp,
            options: options,
            timer: null,
            progress: null,
            isPaused: false,
            startTime: null,
            remainingTime: options.duration || this.options.defaultDuration
        };

        // 創建通知元素
        notification.element = this.createNotificationElement(notification);

        return notification;
    }

    createNotificationElement(notification) {
        const element = document.createElement('div');
        element.className = `notification notification-${notification.type}`;
        element.setAttribute('role', 'alert');
        element.setAttribute('data-notification-id', notification.id);
        element.style.pointerEvents = 'auto';

        // 創建通知內容
        const content = this.createNotificationContent(notification);
        element.appendChild(content);

        // 添加進度條
        if (this.options.showProgress && notification.options.duration !== 0 && notification.options.duration !== false) {
            const progressBar = this.createProgressBar();
            element.appendChild(progressBar);
            notification.progress = progressBar;
        }

        // 綁定事件
        this.bindNotificationEvents(notification);

        return element;
    }

    createNotificationContent(notification) {
        const content = document.createElement('div');
        content.className = 'notification-content';

        // 圖示
        const icon = document.createElement('div');
        icon.className = 'notification-icon';
        icon.innerHTML = this.getNotificationIcon(notification.type);

        // 訊息內容
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'notification-message-wrapper';

        if (typeof notification.message === 'string') {
            messageWrapper.innerHTML = `
                <div class="notification-message">${this.escapeHtml(notification.message)}</div>
            `;
        } else if (typeof notification.message === 'object') {
            // 支援複雜的通知內容
            if (notification.message.title) {
                const title = document.createElement('div');
                title.className = 'notification-title';
                title.textContent = notification.message.title;
                messageWrapper.appendChild(title);
            }

            if (notification.message.body) {
                const body = document.createElement('div');
                body.className = 'notification-body';
                body.textContent = notification.message.body;
                messageWrapper.appendChild(body);
            }

            if (notification.message.actions && Array.isArray(notification.message.actions)) {
                const actions = document.createElement('div');
                actions.className = 'notification-actions';

                notification.message.actions.forEach(action => {
                    const button = document.createElement('button');
                    button.className = `notification-action-btn ${action.style || 'secondary'}`;
                    button.textContent = action.text;
                    button.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (action.handler) {
                            action.handler(notification);
                        }
                        if (action.dismiss !== false) {
                            this.dismiss(notification.id);
                        }
                    });
                    actions.appendChild(button);
                });

                messageWrapper.appendChild(actions);
            }
        }

        // 關閉按鈕
        const closeButton = document.createElement('button');
        closeButton.className = 'notification-close';
        closeButton.innerHTML = '<i class="fas fa-times"></i>';
        closeButton.setAttribute('aria-label', '關閉通知');
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dismiss(notification.id);
        });

        content.appendChild(icon);
        content.appendChild(messageWrapper);

        if (this.options.allowDismiss) {
            content.appendChild(closeButton);
        }

        return content;
    }

    createProgressBar() {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'notification-progress';

        const progressBar = document.createElement('div');
        progressBar.className = 'notification-progress-bar';

        progressContainer.appendChild(progressBar);
        return progressContainer;
    }

    getNotificationIcon(type) {
        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>',
            loading: '<i class="fas fa-spinner fa-spin"></i>'
        };

        return icons[type] || icons.info;
    }

    bindNotificationEvents(notification) {
        const element = notification.element;

        // 點擊事件
        element.addEventListener('click', () => {
            if (notification.options.onClick) {
                notification.options.onClick(notification);
            }
        });

        // 滑鼠懸停暫停
        if (this.options.pauseOnHover) {
            element.addEventListener('mouseenter', () => {
                this.pauseNotification(notification);
            });

            element.addEventListener('mouseleave', () => {
                this.resumeNotification(notification);
            });
        }

        // 焦點事件（無障礙）
        element.addEventListener('focus', () => {
            this.pauseNotification(notification);
        });

        element.addEventListener('blur', () => {
            this.resumeNotification(notification);
        });

        // 觸控事件（移動設備）
        let touchStartX = 0;
        let touchStartY = 0;

        element.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });

        element.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;

            // 檢測滑動手勢
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                // 水平滑動，關閉通知
                this.dismiss(notification.id);
            }
        });
    }

    setAutoHide(notification, duration) {
        notification.startTime = Date.now();
        notification.remainingTime = duration;

        const startProgress = () => {
            if (notification.progress) {
                const progressBar = notification.progress.querySelector('.notification-progress-bar');
                progressBar.style.transition = `width ${duration}ms linear`;
                progressBar.style.width = '0%';
            }
        };

        notification.timer = setTimeout(() => {
            this.dismiss(notification.id);
        }, duration);

        // 開始進度條動畫
        requestAnimationFrame(startProgress);
    }

    pauseNotification(notification) {
        if (notification.isPaused || !notification.timer) return;

        notification.isPaused = true;
        clearTimeout(notification.timer);

        // 計算剩餘時間
        const elapsed = Date.now() - notification.startTime;
        notification.remainingTime = Math.max(0, notification.remainingTime - elapsed);

        // 暫停進度條
        if (notification.progress) {
            const progressBar = notification.progress.querySelector('.notification-progress-bar');
            progressBar.style.animationPlayState = 'paused';
        }
    }

    resumeNotification(notification) {
        if (!notification.isPaused || notification.remainingTime <= 0) return;

        notification.isPaused = false;
        notification.startTime = Date.now();

        // 重新設置計時器
        notification.timer = setTimeout(() => {
            this.dismiss(notification.id);
        }, notification.remainingTime);

        // 恢復進度條
        if (notification.progress) {
            const progressBar = notification.progress.querySelector('.notification-progress-bar');
            progressBar.style.transition = `width ${notification.remainingTime}ms linear`;
            progressBar.style.animationPlayState = 'running';
        }
    }

    animateIn(notification) {
        const element = notification.element;

        // 設置初始狀態
        element.style.opacity = '0';
        element.style.transform = this.getInitialTransform();

        // 強制重排
        element.offsetHeight;

        // 添加過渡效果
        element.style.transition = `all ${this.options.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;

        // 觸發動畫
        requestAnimationFrame(() => {
            element.style.opacity = '1';
            element.style.transform = 'none';
        });
    }

    animateOut(notification) {
        return new Promise((resolve) => {
            const element = notification.element;

            element.style.transition = `all ${this.options.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            element.style.opacity = '0';
            element.style.transform = this.getExitTransform();

            setTimeout(() => {
                resolve();
            }, this.options.animationDuration);
        });
    }

    getInitialTransform() {
        switch (this.options.position) {
            case 'top-left':
            case 'top-center':
            case 'top-right':
                return 'translateY(-100%)';
            case 'bottom-left':
            case 'bottom-center':
            case 'bottom-right':
                return 'translateY(100%)';
            default:
                return 'translateX(100%)';
        }
    }

    getExitTransform() {
        if (this.options.rtl) {
            return 'translateX(-100%)';
        }
        return 'translateX(100%)';
    }

    async dismiss(notificationId) {
        const index = this.notifications.findIndex(n => n.id === notificationId);
        if (index === -1) return;

        const notification = this.notifications[index];

        // 清除計時器
        if (notification.timer) {
            clearTimeout(notification.timer);
        }

        // 執行退場動畫
        await this.animateOut(notification);

        // 從 DOM 移除
        if (notification.element.parentNode) {
            notification.element.parentNode.removeChild(notification.element);
        }

        // 從陣列移除
        this.notifications.splice(index, 1);

        // 觸發關閉事件
        this.emit('dismiss', notification);
    }

    dismissAll() {
        const notifications = [...this.notifications];
        notifications.forEach(notification => {
            this.dismiss(notification.id);
        });
    }

    dismissOldest() {
        if (this.notifications.length > 0) {
            this.dismiss(this.notifications[0].id);
        }
    }

    pauseAll() {
        this.notifications.forEach(notification => {
            this.pauseNotification(notification);
        });
    }

    resumeAll() {
        this.notifications.forEach(notification => {
            this.resumeNotification(notification);
        });
    }

    // 便捷方法
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', {
            duration: 0, // 錯誤訊息不自動消失
            ...options
        });
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }

    loading(message, options = {}) {
        return this.show(message, 'loading', {
            duration: 0, // 載入訊息不自動消失
            allowDismiss: false,
            ...options
        });
    }

    // 更新現有通知
    update(notificationId, newMessage, newType) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (!notification) return false;

        // 更新訊息
        if (newMessage !== undefined) {
            notification.message = newMessage;
            const messageElement = notification.element.querySelector('.notification-message');
            if (messageElement) {
                messageElement.textContent = newMessage;
            }
        }

        // 更新類型
        if (newType !== undefined && newType !== notification.type) {
            notification.element.className = `notification notification-${newType}`;
            notification.type = newType;

            // 更新圖示
            const iconElement = notification.element.querySelector('.notification-icon');
            if (iconElement) {
                iconElement.innerHTML = this.getNotificationIcon(newType);
            }
        }

        return true;
    }

    // 獲取通知
    getNotification(notificationId) {
        return this.notifications.find(n => n.id === notificationId);
    }

    getAllNotifications() {
        return [...this.notifications];
    }

    getNotificationCount() {
        return this.notifications.length;
    }

    // 檢查是否有特定類型的通知
    hasNotificationType(type) {
        return this.notifications.some(n => n.type === type);
    }

    // 關閉特定類型的通知
    dismissType(type) {
        const notifications = this.notifications.filter(n => n.type === type);
        notifications.forEach(notification => {
            this.dismiss(notification.id);
        });
    }

    // 位置管理
    setPosition(position) {
        this.options.position = position;
        this.setContainerStyles();
    }

    // 主題管理
    setTheme(theme) {
        this.container.className = `notifications-container position-${this.options.position} theme-${theme}`;
    }

    // 工具方法
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 事件系統
    emit(event, data) {
        const customEvent = new CustomEvent(`notification:${event}`, {
            detail: data
        });
        document.dispatchEvent(customEvent);
    }

    on(event, callback) {
        document.addEventListener(`notification:${event}`, callback);
    }

    off(event, callback) {
        document.removeEventListener(`notification:${event}`, callback);
    }

    // 聲音通知
    playSound(type = 'default') {
        if (!this.options.enableSound) return;
    }

    const
    soundMap = {
        success: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBkao3vbEeCEFJHfH8N2QQAoUXrTp66'
    }
}
