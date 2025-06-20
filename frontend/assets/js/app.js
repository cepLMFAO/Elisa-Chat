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

            // Initialize services
            await this.initializeServices();

            // Bind event listeners
            this.bindEventListeners();

            // Check authentication status
            await this.checkAuthStatus();

            // Initialize theme
            this.initializeTheme();

            // Hide loading screen
            this.hideLoading();

            console.log('Elite Chat App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('應用程式初始化失敗，請刷新頁面重試');
        }
    }

    async initializeServices() {
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
    }

    bindEventListeners() {
        // Authentication form handlers
        this.bindAuthHandlers();

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

    bindAuthHandlers() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }

        // Register form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', this.handleRegister.bind(this));
        }

        // Forgot password form
        const forgotForm = document.getElementById('forgot-password-form');
        if (forgotForm) {
            forgotForm.addEventListener('submit', this.handleForgotPassword.bind(this));
        }

        // Auth navigation
        document.getElementById('show-register')?.addEventListener('click', () => {
            this.showAuthPage('register');
        });

        document.getElementById('show-login')?.addEventListener('click', () => {
            this.showAuthPage('login');
        });

        document.getElementById('forgot-password-link')?.addEventListener('click', () => {
            this.showAuthPage('forgot-password');
        });

        document.getElementById('back-to-login')?.addEventListener('click', () => {
            this.showAuthPage('login');
        });

        // Password visibility toggles
        document.querySelectorAll('.password-toggle').forEach(btn => {
            btn.addEventListener('click', this.togglePasswordVisibility.bind(this));
        });

        // Password strength checker
        const passwordInput = document.getElementById('register-password');
        if (passwordInput) {
            passwordInput.addEventListener('input', this.checkPasswordStrength.bind(this));
        }

        // Username/email availability checkers
        const usernameInput = document.getElementById('register-username');
        if (usernameInput) {
            let timeoutId;
            usernameInput.addEventListener('input', (e) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    this.checkUsernameAvailability(e.target.value);
                }, 500);
            });
        }

        const emailInput = document.getElementById('register-email');
        if (emailInput) {
            let timeoutId;
            emailInput.addEventListener('input', (e) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    this.checkEmailAvailability(e.target.value);
                }, 500);
            });
        }

        // Logout handler
        document.getElementById('logout-btn')?.addEventListener('click', this.handleLogout.bind(this));
    }

    bindChatHandlers() {
        // Sidebar navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Message input
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('input', this.handleMessageInput.bind(this));
            messageInput.addEventListener('keydown', this.handleMessageKeydown.bind(this));
            messageInput.addEventListener('paste', this.handleMessagePaste.bind(this));
        }

        // Send button
        document.getElementById('send-btn')?.addEventListener('click', this.sendMessage.bind(this));

        // File attachment
        document.getElementById('attach-btn')?.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input')?.addEventListener('change', this.handleFileSelect.bind(this));

        // Emoji picker
        document.getElementById('emoji-btn')?.addEventListener('click', this.toggleEmojiPicker.bind(this));

        // Voice recording
        document.getElementById('voice-btn')?.addEventListener('click', this.toggleVoiceRecording.bind(this));

        // Chat actions
        document.getElementById('voice-call-btn')?.addEventListener('click', this.startVoiceCall.bind(this));
        document.getElementById('video-call-btn')?.addEventListener('click', this.startVideoCall.bind(this));
        document.getElementById('chat-info-btn')?.addEventListener('click', this.showChatInfo.bind(this));
        document.getElementById('chat-menu-btn')?.addEventListener('click', this.showChatMenu.bind(this));

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

        // Reply cancel
        document.getElementById('cancel-reply')?.addEventListener('click', this.cancelReply.bind(this));
    }

    bindThemeHandlers() {
        // Theme toggle button (if exists)
        const themeToggle = document.querySelector('.theme-toggle');
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

    // Authentication Methods
    async handleLogin(e) {
        e.preventDefault();

        const submitBtn = document.getElementById('login-btn');
        const form = e.target;
        const formData = new FormData(form);

        try {
            this.setButtonLoading(submitBtn, true);
            this.clearFormErrors(form);

            const loginData = {
                identifier: formData.get('identifier'),
                password: formData.get('password'),
                twoFactorToken: formData.get('twoFactorToken') || undefined
            };

            const response = await this.auth.login(loginData);

            if (response.success) {
                this.user = response.data.user;
                this.isAuthenticated = true;
                this.showNotification('登錄成功！', 'success');
                this.showChatApp();
                this.connectWebSocket();
            } else {
                if (response.code === 'TWO_FACTOR_REQUIRED') {
                    this.show2FAInput();
                } else {
                    this.showFormError(form, response.error);
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showFormError(form, '登錄失敗，請稍後重試');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    async handleRegister(e) {
        e.preventDefault();

        const submitBtn = document.getElementById('register-btn');
        const form = e.target;
        const formData = new FormData(form);

        try {
            this.setButtonLoading(submitBtn, true);
            this.clearFormErrors(form);

            const registerData = {
                username: formData.get('username'),
                email: formData.get('email'),
                password: formData.get('password'),
                confirmPassword: formData.get('confirmPassword')
            };

            // Client-side validation
            if (!this.validateRegisterForm(registerData, form)) {
                return;
            }

            const response = await this.auth.register(registerData);

            if (response.success) {
                this.user = response.data.user;
                this.isAuthenticated = true;
                this.showNotification('註冊成功！歡迎加入 Elite Chat', 'success');
                this.showChatApp();
                this.connectWebSocket();
            } else {
                this.showFormError(form, response.error);
            }
        } catch (error) {
            console.error('Register error:', error);
            this.showFormError(form, '註冊失敗，請稍後重試');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    async handleForgotPassword(e) {
        e.preventDefault();

        const submitBtn = document.getElementById('forgot-btn');
        const form = e.target;
        const formData = new FormData(form);

        try {
            this.setButtonLoading(submitBtn, true);
            this.clearFormErrors(form);

            const email = formData.get('email');
            const response = await this.auth.requestPasswordReset({ email });

            if (response.success) {
                this.showNotification('重置鏈接已發送到您的郵箱', 'success');
                form.reset();
            } else {
                this.showFormError(form, response.error);
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            this.showFormError(form, '發送失敗，請稍後重試');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    async handleLogout() {
        try {
            if (this.socket) {
                this.socket.disconnect();
            }

            await this.auth.logout();
            this.user = null;
            this.isAuthenticated = false;
            this.currentChat = null;

            this.showNotification('已成功登出', 'success');
            this.showAuthPages();
        } catch (error) {
            console.error('Logout error:', error);
            this.showNotification('登出時發生錯誤', 'error');
        }
    }

    // Chat Methods
    async sendMessage() {
        const messageInput = document.getElementById('message-input');
        const content = messageInput.textContent.trim();

        if (!content || !this.currentChat) return;

        try {
            const messageData = {
                content,
                type: 'text',
                chatId: this.currentChat.id,
                replyTo: this.replyTo || null
            };

            // Send via WebSocket
            if (this.socket) {
                this.socket.emit('send_message', messageData);
            }

            // Clear input
            messageInput.textContent = '';
            this.updateSendButton();
            this.cancelReply();

            // Stop typing indicator
            this.sendTypingIndicator(false);

        } catch (error) {
            console.error('Send message error:', error);
            this.showNotification('發送失敗', 'error');
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

    showAuthPages() {
        document.getElementById('auth-pages')?.classList.remove('hidden');
        document.getElementById('chat-app')?.classList.add('hidden');
        this.showAuthPage('login');
    }

    showChatApp() {
        document.getElementById('auth-pages')?.classList.add('hidden');
        document.getElementById('chat-app')?.classList.remove('hidden');
        this.updateUserProfile();
        this.loadRecentChats();
    }

    showAuthPage(page) {
        document.querySelectorAll('.auth-page').forEach(p => {
            p.classList.remove('active');
        });
        document.getElementById(`${page}-page`)?.classList.add('active');
    }

    show2FAInput() {
        const twoFactorGroup = document.getElementById('two-factor-group');
        if (twoFactorGroup) {
            twoFactorGroup.classList.remove('hidden');
            document.getElementById('two-factor-token')?.focus();
        }
    }

    updateUserProfile() {
        if (!this.user) return;

        document.getElementById('user-name').textContent = this.user.username;
        document.getElementById('user-avatar').src = this.user.avatar;
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

    setButtonLoading(button, loading) {
        if (!button) return;

        const btnText = button.querySelector('.btn-text');
        const btnSpinner = button.querySelector('.btn-spinner');

        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
            if (btnText) btnText.style.opacity = '0';
            if (btnSpinner) btnSpinner.classList.remove('hidden');
        } else {
            button.classList.remove('loading');
            button.disabled = false;
            if (btnText) btnText.style.opacity = '1';
            if (btnSpinner) btnSpinner.classList.add('hidden');
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        if (this.notificationService) {
            this.notificationService.show(message, type, duration);
        } else {
            // Fallback notification
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    // Utility Methods
    async checkAuthStatus() {
        try {
            const response = await this.auth.getStatus();
            if (response.success && response.data.authenticated) {
                this.user = response.data.user;
                this.isAuthenticated = true;
                this.showChatApp();
                this.connectWebSocket();
            } else {
                this.showAuthPages();
            }
        } catch (error) {
            console.error('Auth status check error:', error);
            this.showAuthPages();
        }
    }

    validateRegisterForm(data, form) {
        let isValid = true;

        // Username validation
        if (data.username.length < 3 || data.username.length > 30) {
            this.showFieldError(form, 'username', '用戶名必須在3-30個字符之間');
            isValid = false;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            this.showFieldError(form, 'email', '請輸入有效的郵箱地址');
            isValid = false;
        }

        // Password validation
        if (data.password.length < 8) {
            this.showFieldError(form, 'password', '密碼長度至少8個字符');
            isValid = false;
        }

        // Confirm password
        if (data.password !== data.confirmPassword) {
            this.showFieldError(form, 'confirmPassword', '密碼確認不匹配');
            isValid = false;
        }

        return isValid;
    }

    checkPasswordStrength(e) {
        const password = e.target.value;
        const strengthBar = document.querySelector('.strength-fill');
        const strengthText = document.querySelector('.strength-text');
        const requirements = document.querySelectorAll('.requirement');

        let score = 0;
        const checks = {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            number: /\d/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };

        // Update requirement indicators
        requirements.forEach(req => {
            const requirement = req.dataset.requirement;
            const icon = req.querySelector('i');

            if (checks[requirement]) {
                req.classList.add('met');
                icon.className = 'fas fa-check';
                score++;
            } else {
                req.classList.remove('met');
                icon.className = 'fas fa-times';
            }
        });

        // Update strength bar
        if (strengthBar && strengthText) {
            strengthBar.className = 'strength-fill';

            if (score <= 2) {
                strengthBar.classList.add('weak');
                strengthText.textContent = '密碼強度：弱';
            } else if (score === 3) {
                strengthBar.classList.add('fair');
                strengthText.textContent = '密碼強度：一般';
            } else if (score === 4) {
                strengthBar.classList.add('good');
                strengthText.textContent = '密碼強度：良好';
            } else {
                strengthBar.classList.add('strong');
                strengthText.textContent = '密碼強度：強';
            }
        }
    }

    async checkUsernameAvailability(username) {
        if (username.length < 3) return;

        try {
            const response = await this.auth.checkUsernameAvailability(username);
            const input = document.getElementById('register-username');
            const form = input.closest('form');

            if (response.success) {
                if (response.data.available) {
                    this.showFieldSuccess(form, 'username', '用戶名可用');
                } else {
                    this.showFieldError(form, 'username', '用戶名已被使用');
                }
            }
        } catch (error) {
            console.error('Username check error:', error);
        }
    }

    async checkEmailAvailability(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return;

        try {
            const response = await this.auth.checkEmailAvailability(email);
            const input = document.getElementById('register-email');
            const form = input.closest('form');

            if (response.success) {
                if (response.data.available) {
                    this.showFieldSuccess(form, 'email', '郵箱可用');
                } else {
                    this.showFieldError(form, 'email', '郵箱已被註冊');
                }
            }
        } catch (error) {
            console.error('Email check error:', error);
        }
    }

    togglePasswordVisibility(e) {
        const button = e.target.closest('.password-toggle');
        const input = button.parentElement.querySelector('input');
        const icon = button.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
            button.setAttribute('aria-label', '隱藏密碼');
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
            button.setAttribute('aria-label', '顯示密碼');
        }
    }

    showFormError(form, message) {
        let errorDiv = form.querySelector('.form-error-general');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'form-error form-error-general show';
            form.appendChild(errorDiv);
        }
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    }

    showFieldError(form, fieldName, message) {
        const field = form.querySelector(`[name="${fieldName}"]`);
        if (!field) return;

        field.classList.add('error');
        const errorDiv = field.parentElement.querySelector('.form-error') ||
            field.closest('.form-group').querySelector('.form-error');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.add('show');
        }
    }

    showFieldSuccess(form, fieldName, message) {
        const field = form.querySelector(`[name="${fieldName}"]`);
        if (!field) return;

        field.classList.remove('error');
        field.classList.add('success');
        const successDiv = field.parentElement.querySelector('.form-success') ||
            field.closest('.form-group').querySelector('.form-success');
        if (successDiv) {
            successDiv.textContent = message;
            successDiv.classList.add('show');
        }
    }

    clearFormErrors(form) {
        form.querySelectorAll('.form-error').forEach(error => {
            error.classList.remove('show');
        });
        form.querySelectorAll('.form-success').forEach(success => {
            success.classList.remove('show');
        });
        form.querySelectorAll('input').forEach(input => {
            input.classList.remove('error', 'success');
        });
    }

    // Theme Methods
    initializeTheme() {
        const savedTheme = this.storage?.get('theme') || 'light';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        this.currentTheme = theme;
        document.body.className = document.body.className.replace(/theme-\w+/, '');
        document.body.classList.add(`theme-${theme}`);

        if (this.storage) {
            this.storage.set('theme', theme);
        }
    }

    toggleTheme() {
        const themes = ['light', 'dark', 'sepia', 'ocean', 'forest'];
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        this.setTheme(themes[nextIndex]);
    }

    // Message Handling
    handleMessageInput(e) {
        const content = e.target.textContent.trim();
        this.updateSendButton();

        // Send typing indicator
        if (content && this.currentChat) {
            this.sendTypingIndicator(true);
        } else {
            this.sendTypingIndicator(false);
        }
    }

    handleMessageKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }

    handleMessagePaste(e) {
        e.preventDefault();
        const text = (e.originalEvent || e).clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }

    updateSendButton() {
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        const voiceBtn = document.getElementById('voice-btn');

        const hasContent = messageInput.textContent.trim().length > 0;

        if (sendBtn) {
            sendBtn.disabled = !hasContent;
        }

        // Toggle between send and voice button
        if (hasContent) {
            sendBtn?.classList.remove('hidden');
            voiceBtn?.classList.add('hidden');
        } else {
            sendBtn?.classList.add('hidden');
            voiceBtn?.classList.remove('hidden');
        }
    }

    sendTypingIndicator(isTyping) {
        if (this.socket && this.currentChat) {
            this.socket.emit('typing', {
                chatId: this.currentChat.id,
                isTyping
            });
        }
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

    // File Handling
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        files.forEach(file => {
            this.addFileToUploadPreview(file);
        });

        // Clear input
        e.target.value = '';
    }

    addFileToUploadPreview(file) {
        const uploadPreview = document.getElementById('upload-preview');
        const uploadItems = document.getElementById('upload-items');

        if (!uploadPreview || !uploadItems) return;

        const fileItem = document.createElement('div');
        fileItem.className = 'upload-item';
        fileItem.innerHTML = `
            <div class="upload-item-preview">
                ${file.type.startsWith('image/') ?
            `<img src="${URL.createObjectURL(file)}" alt="預覽">` :
            `<i class="fas fa-file"></i>`
        }
            </div>
            <div class="upload-item-info">
                <div class="upload-item-name">${file.name}</div>
                <div class="upload-item-size">${this.formatFileSize(file.size)}</div>
            </div>
            <button type="button" class="upload-item-remove">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add remove handler
        fileItem.querySelector('.upload-item-remove').addEventListener('click', () => {
            fileItem.remove();
            if (uploadItems.children.length === 0) {
                uploadPreview.classList.add('hidden');
            }
        });

        uploadItems.appendChild(fileItem);
        uploadPreview.classList.remove('hidden');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        this.closeEmojiPicker();
        this.closeActiveModals();
        this.cancelReply();
    }

    // Placeholder methods for features to be implemented
    async loadRecentChats() {
        // TODO: Implement chat loading
        console.log('Loading recent chats...');
    }

    async loadContacts() {
        // TODO: Implement contacts loading
        console.log('Loading contacts...');
    }

    async loadRooms() {
        // TODO: Implement rooms loading
        console.log('Loading rooms...');
    }

    displayMessage(message) {
        // TODO: Implement message display
        console.log('Displaying message:', message);
    }

    updateChatList(message) {
        // TODO: Implement chat list update
        console.log('Updating chat list:', message);
    }

    updateUserStatus(userId, status) {
        // TODO: Implement user status update
        console.log('User status update:', userId, status);
    }

    showTypingIndicator(user, isTyping) {
        // TODO: Implement typing indicator
        console.log('Typing indicator:', user, isTyping);
    }

    toggleEmojiPicker() {
        // TODO: Implement emoji picker
        console.log('Toggle emoji picker');
    }

    closeEmojiPicker() {
        // TODO: Implement close emoji picker
        console.log('Close emoji picker');
    }

    toggleVoiceRecording() {
        // TODO: Implement voice recording
        console.log('Toggle voice recording');
    }

    startVoiceCall() {
        // TODO: Implement voice call
        console.log('Start voice call');
    }

    startVideoCall() {
        // TODO: Implement video call
        console.log('Start video call');
    }

    showChatInfo() {
        // TODO: Implement chat info modal
        console.log('Show chat info');
    }

    showChatMenu() {
        // TODO: Implement chat menu
        console.log('Show chat menu');
    }

    handleChatSearch(e) {
        // TODO: Implement chat search
        console.log('Chat search:', e.target.value);
    }

    handleContactSearch(e) {
        // TODO: Implement contact search
        console.log('Contact search:', e.target.value);
    }

    handleRoomSearch(e) {
        // TODO: Implement room search
        console.log('Room search:', e.target.value);
    }

    handleStatusChange(e) {
        // TODO: Implement status change
        console.log('Status change:', e.target.value);
    }

    showNewChatModal() {
        // TODO: Implement new chat modal
        console.log('Show new chat modal');
    }

    showAddContactModal() {
        // TODO: Implement add contact modal
        console.log('Show add contact modal');
    }

    showCreateRoomModal() {
        // TODO: Implement create room modal
        console.log('Show create room modal');
    }

    showSettingsModal() {
        // TODO: Implement settings modal
        console.log('Show settings modal');
    }

    cancelReply() {
        // TODO: Implement cancel reply
        console.log('Cancel reply');
    }

    closeActiveModals() {
        // TODO: Implement close active modals
        console.log('Close active modals');
    }

    focusSearch() {
        // TODO: Implement focus search
        console.log('Focus search');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.eliteChatApp = new EliteChatApp();
});

// Export for global access
window.EliteChatApp = EliteChatApp;