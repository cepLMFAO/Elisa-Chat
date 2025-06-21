class EliteChatApp {
    constructor() {
        this.user = null;
        this.currentChat = null;
        this.socket = null;
        this.isAuthenticated = false;
        this.currentTheme = 'light';
        this.notifications = [];
        this.activeModals = [];

        // Initialize app
        this.init();
    }

    async init() {
        try {
            // Show loading screen
            this.showLoading();

            // Check authentication first
            if (!this.checkAuthStatus()) {
                this.redirectToLogin();
                return;
            }

            // Initialize services
            await this.initializeServices();

            // Bind event listeners
            this.bindEventListeners();

            // Load user data and authenticate
            await this.loadUserData();

            // Initialize theme
            this.initializeTheme();

            // Show chat app
            this.showChatApp();

            // Hide loading screen
            this.hideLoading();

            console.log('Elite Chat App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('應用程式初始化失敗，請重新登錄');
            this.redirectToLogin();
        }
    }

    checkAuthStatus() {
        try {
            const isAuthenticated = localStorage.getItem('isAuthenticated');
            const currentUser = localStorage.getItem('currentUser');
            return isAuthenticated === 'true' && currentUser && currentUser !== 'null';
        } catch (error) {
            console.error('Auth status check error:', error);
            return false;
        }
    }

    redirectToLogin() {
        window.location.href = '/pages/login.html';
    }

    async loadUserData() {
        try {
            const userData = localStorage.getItem('currentUser');
            if (userData && userData !== 'null') {
                this.user = JSON.parse(userData);
                this.isAuthenticated = true;
                this.updateUserProfile();
            } else {
                throw new Error('No user data found');
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            throw error;
        }
    }

    async initializeServices() {
        try {
            // Initialize storage service
            if (typeof StorageService !== 'undefined') {
                this.storage = new StorageService();
            }

            // Initialize API service
            if (typeof ApiService !== 'undefined') {
                this.api = new ApiService();
            }

            // Initialize auth service
            if (typeof AuthService !== 'undefined') {
                this.auth = new AuthService();
            }

            // Initialize notification service
            if (typeof NotificationComponent !== 'undefined') {
                this.notificationService = new NotificationComponent();
            }
        } catch (error) {
            console.error('Service initialization failed:', error);
            throw error;
        }
    }

    bindEventListeners() {
        // Chat interface handlers
        this.bindChatHandlers();

        // Theme toggle handler
        this.bindThemeHandlers();

        // Global keyboard shortcuts
        this.bindKeyboardShortcuts();

        // Window events
        window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
    }

    bindChatHandlers() {
        // Sidebar navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Search inputs
        document.getElementById('chat-search')?.addEventListener('input', this.handleChatSearch.bind(this));
        document.getElementById('contact-search')?.addEventListener('input', this.handleContactSearch.bind(this));
        document.getElementById('room-search')?.addEventListener('input', this.handleRoomSearch.bind(this));

        // Status selector
        document.getElementById('user-status-select')?.addEventListener('change', this.handleStatusChange.bind(this));

        // New chat/contact/room buttons
        document.getElementById('new-chat-btn')?.addEventListener('click', this.showNewChatModal.bind(this));
        document.getElementById('add-contact-btn')?.addEventListener('click', this.showAddContactModal.bind(this));
        document.getElementById('create-room-btn')?.addEventListener('click', this.showCreateRoomModal.bind(this));
        document.getElementById('start-new-chat')?.addEventListener('click', this.showNewChatModal.bind(this));

        // Settings button
        document.getElementById('settings-btn')?.addEventListener('click', this.showSettingsModal.bind(this));

        // Logout handler
        document.getElementById('logout-btn')?.addEventListener('click', this.handleLogout.bind(this));

        // Mobile menu
        document.getElementById('mobile-menu-btn')?.addEventListener('click', this.toggleMobileSidebar.bind(this));
        document.getElementById('sidebar-overlay')?.addEventListener('click', this.closeMobileSidebar.bind(this));
    }

    bindThemeHandlers() {
        // Theme toggle button
        const themeToggle = document.querySelector('#theme-toggle-btn');
        if (themeToggle) {
            themeToggle.addEventListener('click', this.toggleTheme.bind(this));
        }
    }

    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Global shortcuts
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'k':
                        e.preventDefault();
                        this.focusSearch();
                        break;
                    case 'n':
                        e.preventDefault();
                        this.showNewChatModal();
                        break;
                    case '/':
                        e.preventDefault();
                        this.toggleTheme();
                        break;
                }
            }

            // Escape key
            if (e.key === 'Escape') {
                this.handleEscapeKey();
            }
        });
    }

    async handleLogout() {
        if (!confirm('確定要登出嗎？')) return;

        try {
            if (this.socket) {
                this.socket.disconnect();
            }

            // Clear authentication data
            localStorage.removeItem('isAuthenticated');
            localStorage.removeItem('currentUser');

            this.user = null;
            this.isAuthenticated = false;
            this.currentChat = null;

            this.showNotification('已成功登出', 'success');

            setTimeout(() => {
                this.redirectToLogin();
            }, 1000);
        } catch (error) {
            console.error('Logout error:', error);
            this.showNotification('登出時發生錯誤', 'error');
        }
    }

    connectWebSocket() {
        if (!this.isAuthenticated) return;

        try {
            // Initialize WebSocket connection
            if (typeof WebSocketService !== 'undefined') {
                this.socket = new WebSocketService();
                this.socket.connect(this.user);
                this.bindWebSocketEvents();
            }
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.showNotification('連接服務器失敗', 'error');
        }
    }

    bindWebSocketEvents() {
        if (!this.socket) return;

        this.socket.on('message', this.handleIncomingMessage.bind(this));
        this.socket.on('user_status', this.handleUserStatusChange.bind(this));
        this.socket.on('typing', this.handleTypingIndicator.bind(this));
        this.socket.on('notification', this.handleNotification.bind(this));
        this.socket.on('disconnect', this.handleDisconnect.bind(this));
        this.socket.on('error', this.handleSocketError.bind(this));
    }

    // UI Methods
    showLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
    }

    hideLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 500);
        }
    }

    showChatApp() {
        document.getElementById('auth-pages')?.classList.add('hidden');
        document.getElementById('chat-app')?.classList.remove('hidden');
        this.updateUserProfile();
        this.loadRecentChats();
        this.connectWebSocket();
    }

    updateUserProfile() {
        if (!this.user) return;

        const userNameEl = document.getElementById('user-name');
        const userAvatarEl = document.getElementById('user-avatar');

        if (userNameEl) userNameEl.textContent = this.user.username || 'Unknown User';
        if (userAvatarEl) {
            userAvatarEl.src = this.user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default';
            userAvatarEl.alt = `${this.user.username || 'User'} 的頭像`;
        }
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

        // Show corresponding content
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`)?.classList.add('active');

        // Load content based on tab
        switch (tabName) {
            case 'chats':
                this.loadRecentChats();
                break;
            case 'contacts':
                this.loadContacts();
                break;
            case 'rooms':
                this.loadRooms();
                break;
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        if (this.notificationService) {
            this.notificationService.show(message, type, duration);
        } else {
            // Fallback notification
            this.showFallbackNotification(message, type, duration);
        }
    }

    showFallbackNotification(message, type, duration) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const content = document.createElement('div');
        content.className = 'notification-content';

        const icon = document.createElement('i');
        icon.className = `fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}`;

        const text = document.createElement('span');
        text.textContent = message;

        content.appendChild(icon);
        content.appendChild(text);
        notification.appendChild(content);

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            animation: slideInRight 0.3s ease-out;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 500;
            max-width: 400px;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease-out';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    // Theme Methods
    initializeTheme() {
        const savedTheme = this.storage?.get('theme') || localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        this.currentTheme = theme;
        document.body.className = document.body.className.replace(/theme-\w+/, '');
        document.body.classList.add(`theme-${theme}`);

        if (this.storage) {
            this.storage.set('theme', theme);
        } else {
            localStorage.setItem('theme', theme);
        }

        // Update theme toggle icon
        const themeIcon = document.querySelector('#theme-toggle-btn i');
        if (themeIcon) {
            themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    toggleTheme() {
        const themes = ['light', 'dark'];
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        this.setTheme(themes[nextIndex]);

        const themeNames = { light: '淺色', dark: '深色' };
        this.showNotification(`已切換到${themeNames[themes[nextIndex]]}主題`, 'success');
    }

    // Mobile UI Methods
    toggleMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar?.classList.toggle('open');
        overlay?.classList.toggle('show');
    }

    closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar?.classList.remove('open');
        overlay?.classList.remove('show');
    }

    // WebSocket Event Handlers
    handleIncomingMessage(message) {
        this.displayMessage(message);
        this.updateChatList(message);

        // Show notification if not focused on this chat
        if (message.chatId !== this.currentChat?.id) {
            this.showNotification(`${message.sender.username}: ${message.content}`, 'info');
        }
    }

    handleUserStatusChange(data) {
        this.updateUserStatus(data.userId, data.status);
    }

    handleTypingIndicator(data) {
        if (data.chatId === this.currentChat?.id) {
            this.showTypingIndicator(data.user, data.isTyping);
        }
    }

    handleNotification(notification) {
        this.showNotification(notification.content, notification.type);
    }

    handleDisconnect() {
        this.showNotification('與服務器斷開連接', 'warning');
        // Attempt to reconnect
        setTimeout(() => {
            if (this.isAuthenticated) {
                this.connectWebSocket();
            }
        }, 3000);
    }

    handleSocketError(error) {
        console.error('Socket error:', error);
        this.showNotification('連接錯誤', 'error');
    }

    // Event Handlers
    handleBeforeUnload(e) {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    handleOnline() {
        this.showNotification('網路連接已恢復', 'success');
        if (this.isAuthenticated && !this.socket?.connected) {
            this.connectWebSocket();
        }
    }

    handleOffline() {
        this.showNotification('網路連接已斷開', 'warning');
    }

    handleEscapeKey() {
        // Close modals, emoji picker, etc.
        this.closeActiveModals();
    }

    // Search Handlers
    handleChatSearch(e) {
        const query = e.target.value.toLowerCase();
        this.filterItems('chat-item', '.chat-name', query);
    }

    handleContactSearch(e) {
        const query = e.target.value.toLowerCase();
        this.filterItems('contact-item', '.contact-name', query);
    }

    handleRoomSearch(e) {
        const query = e.target.value.toLowerCase();
        this.filterItems('room-item', '.room-name', query);
    }

    filterItems(itemClass, nameSelector, query) {
        const items = document.querySelectorAll(`.${itemClass}`);
        items.forEach(item => {
            const nameElement = item.querySelector(nameSelector);
            if (nameElement) {
                const name = nameElement.textContent.toLowerCase();
                const shouldShow = name.includes(query);
                item.style.display = shouldShow ? 'flex' : 'none';
            }
        });
    }

    handleStatusChange(e) {
        const newStatus = e.target.value;
        // Update user status
        if (this.user) {
            this.user.status = newStatus;
            localStorage.setItem('currentUser', JSON.stringify(this.user));

            // Update status indicator
            const statusIndicator = document.getElementById('user-status-indicator');
            if (statusIndicator) {
                statusIndicator.className = `status-indicator ${newStatus}`;
            }

            // Send status update via WebSocket
            if (this.socket) {
                this.socket.emit('status_change', { status: newStatus });
            }
        }
    }

    // Modal Methods
    showNewChatModal() {
        this.showNotification('新聊天功能開發中...', 'info');
    }

    showAddContactModal() {
        this.showNotification('添加聯繫人功能開發中...', 'info');
    }

    showCreateRoomModal() {
        this.showNotification('創建房間功能開發中...', 'info');
    }

    showSettingsModal() {
        this.showNotification('設置功能開發中...', 'info');
    }

    closeActiveModals() {
        // Close all active modals
        const modals = document.querySelectorAll('.modal.active, .modal-open');
        modals.forEach(modal => {
            modal.classList.remove('active', 'modal-open');
        });
    }

    focusSearch() {
        const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab;
        const searchInput = document.getElementById(`${activeTab}-search`);
        searchInput?.focus();
    }

    // Data Loading Methods (Placeholder implementations)
    async loadRecentChats() {
        console.log('Loading recent chats...');
        // TODO: Implement chat loading from API
    }

    async loadContacts() {
        console.log('Loading contacts...');
        // TODO: Implement contacts loading from API
    }

    async loadRooms() {
        console.log('Loading rooms...');
        // TODO: Implement rooms loading from API
    }

    displayMessage(message) {
        console.log('Displaying message:', message);
        // TODO: Implement message display
    }

    updateChatList(message) {
        console.log('Updating chat list:', message);
        // TODO: Implement chat list update
    }

    updateUserStatus(userId, status) {
        console.log('User status update:', userId, status);
        // TODO: Implement user status update
    }

    showTypingIndicator(user, isTyping) {
        console.log('Typing indicator:', user, isTyping);
        // TODO: Implement typing indicator
    }

    // Cleanup method
    destroy() {
        // Clean up WebSocket connection
        if (this.socket) {
            this.socket.disconnect();
        }

        // Remove event listeners
        document.removeEventListener('keydown', this.bindKeyboardShortcuts);
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);

        console.log('Elite Chat App destroyed');
    }
}

// Add CSS animations for notifications
if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        @keyframes slideOutRight {
            from {
                opacity: 1;
                transform: translateX(0);
            }
            to {
                opacity: 0;
                transform: translateX(100%);
            }
        }

        .notification-content {
            display: flex;
            align-items: center;
            gap: 8px;
        }
    `;
    document.head.appendChild(style);
}

// Initialize app when DOM is loaded (only on chat page)
if (window.location.pathname.includes('chat.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.eliteChatApp = new EliteChatApp();
    });
}

// Export for global access
window.EliteChatApp = EliteChatApp;