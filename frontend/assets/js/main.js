// 等待 DOM 加載完成
document.addEventListener('DOMContentLoaded', () => {
    new EliteChatApplication();
});

class EliteChatApplication {
    constructor() {
        this.isInitialized = false;
        this.components = {};
        this.services = {};
        this.currentUser = null;
        this.activeChat = null;

        this.init();
    }

    async init() {
        try {
            // 顯示載入畫面
            this.showLoadingScreen();

            // 檢查瀏覽器支援
            this.checkBrowserSupport();

            // 初始化服務
            await this.initializeServices();

            // 初始化組件
            this.initializeComponents();

            // 設置事件監聽器
            this.setupEventListeners();

            // 檢查認證狀態
            await this.checkAuthenticationStatus();

            // 隱藏載入畫面
            this.hideLoadingScreen();

            this.isInitialized = true;
            console.log('Elite Chat 應用程式初始化完成');

        } catch (error) {
            console.error('應用程式初始化失敗:', error);
            this.showError('應用程式初始化失敗，請刷新頁面重試');
        }
    }

    checkBrowserSupport() {
        const requiredFeatures = {
            WebSocket: 'WebSocket' in window,
            IndexedDB: 'indexedDB' in window,
            MediaDevices: 'mediaDevices' in navigator,
            ServiceWorker: 'serviceWorker' in navigator,
            LocalStorage: 'localStorage' in window
        };

        const unsupportedFeatures = Object.entries(requiredFeatures)
            .filter(([feature, supported]) => !supported)
            .map(([feature]) => feature);

        if (unsupportedFeatures.length > 0) {
            console.warn('以下功能不受支援:', unsupportedFeatures);

            // 顯示瀏覽器兼容性警告
            this.showBrowserWarning(unsupportedFeatures);
        }

        // 檢查關鍵功能
        if (!requiredFeatures.WebSocket || !requiredFeatures.IndexedDB) {
            throw new Error('您的瀏覽器不支援所需的功能，請升級瀏覽器');
        }
    }

    async initializeServices() {
        try {
            // 初始化存儲服務
            if (typeof StorageService !== 'undefined') {
                this.services.storage = new StorageService({
                    prefix: 'elite_chat_',
                    defaultStorage: 'localStorage'
                });
                console.log('存儲服務初始化完成');
            }

            // 初始化 API 服務
            if (typeof ApiService !== 'undefined') {
                this.services.api = new ApiService({
                    baseURL: '/api/v1',
                    timeout: 30000,
                    enableLogging: true
                });
                console.log('API 服務初始化完成');
            }

            // 初始化認證服務
            if (typeof AuthService !== 'undefined') {
                this.services.auth = new AuthService({
                    apiUrl: '/api/v1/auth',
                    tokenKey: 'elite_chat_token',
                    autoRefresh: true
                });

                if (this.services.api) {
                    this.services.auth.setApiInstance(this.services.api);
                }
                console.log('認證服務初始化完成');
            }

            // 初始化 WebSocket 服務
            if (typeof WebSocketService !== 'undefined') {
                this.services.websocket = new ChatWebSocket({
                    url: this.getWebSocketURL(),
                    autoReconnect: true,
                    enableLogging: true
                });
                console.log('WebSocket 服務初始化完成');
            }

            // 初始化通知服務
            if (typeof NotificationComponent !== 'undefined') {
                this.services.notification = new NotificationComponent({
                    position: 'top-right',
                    maxNotifications: 5,
                    defaultDuration: 4000
                });
                console.log('通知服務初始化完成');
            }

        } catch (error) {
            console.error('服務初始化失敗:', error);
            throw error;
        }
    }

    initializeComponents() {
        try {
            // 初始化主聊天組件
            const chatContainer = document.querySelector('#chat-container');
            if (chatContainer && typeof ChatComponent !== 'undefined') {
                this.components.chat = new ChatComponent(chatContainer, {
                    autoScroll: true,
                    showTypingIndicator: true,
                    enableMarkdown: false,
                    onEvent: this.handleChatEvent.bind(this)
                });
            }

            // 初始化消息輸入組件
            const messageInputContainer = document.querySelector('#message-input-container');
            if (messageInputContainer && typeof MessageInputComponent !== 'undefined') {
                this.components.messageInput = new MessageInputComponent(messageInputContainer, {
                    placeholder: '輸入訊息...',
                    maxLength: 4000,
                    enableEmojis: true,
                    enableFiles: true,
                    enableVoice: true,
                    onEvent: this.handleMessageInputEvent.bind(this)
                });
            }

            // 初始化聊天室列表組件
            const roomListContainer = document.querySelector('#room-list-container');
            if (roomListContainer && typeof RoomListComponent !== 'undefined') {
                this.components.roomList = new RoomListComponent(roomListContainer, {
                    showSearch: true,
                    showCreateButton: true,
                    sortBy: 'lastActivity',
                    onEvent: this.handleRoomListEvent.bind(this)
                });
            }

            // 初始化用戶列表組件
            const userListContainer = document.querySelector('#user-list-container');
            if (userListContainer && typeof UserListComponent !== 'undefined') {
                this.components.userList = new UserListComponent(userListContainer, {
                    showSearch: true,
                    groupByStatus: true,
                    enableContextMenu: true,
                    onEvent: this.handleUserListEvent.bind(this)
                });
            }

            // 初始化視頻通話組件
            const videoCallContainer = document.querySelector('#video-call-container');
            if (videoCallContainer && typeof VideoCallComponent !== 'undefined') {
                this.components.videoCall = new VideoCallComponent(videoCallContainer, {
                    enableChat: true,
                    enableScreenShare: true,
                    videoQuality: 'high',
                    onEvent: this.handleVideoCallEvent.bind(this)
                });
            }

            console.log('組件初始化完成');

        } catch (error) {
            console.error('組件初始化失敗:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // 認證事件
        if (this.services.auth) {
            this.services.auth.on('auth:login', this.handleUserLogin.bind(this));
            this.services.auth.on('auth:logout', this.handleUserLogout.bind(this));
            this.services.auth.on('auth:tokenExpired', this.handleTokenExpired.bind(this));
        }

        // WebSocket 事件
        if (this.services.websocket) {
            this.services.websocket.on('connected', this.handleWebSocketConnected.bind(this));
            this.services.websocket.on('disconnected', this.handleWebSocketDisconnected.bind(this));
            this.services.websocket.on('message', this.handleIncomingMessage.bind(this));
            this.services.websocket.on('userStatusUpdate', this.handleUserStatusUpdate.bind(this));
            this.services.websocket.on('typingUpdate', this.handleTypingUpdate.bind(this));
        }

        // 全域鍵盤快捷鍵
        this.setupKeyboardShortcuts();

        // 視窗事件
        window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));

        // 主題和設定變更
        this.setupThemeHandlers();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + K: 全域搜尋
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.showGlobalSearch();
            }

            // Ctrl/Cmd + N: 新聊天
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.showNewChatModal();
            }

            // Ctrl/Cmd + /: 切換主題
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                this.toggleTheme();
            }

            // Escape: 關閉模態框
            if (e.key === 'Escape') {
                this.closeActiveModals();
            }
        });
    }

    setupThemeHandlers() {
        // 主題切換按鈕
        const themeToggle = document.querySelector('#theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', this.toggleTheme.bind(this));
        }

        // 初始化主題
        this.initializeTheme();
    }

    async checkAuthenticationStatus() {
        try {
            if (!this.services.auth) {
                this.showAuthPages();
                return;
            }

            const status = await this.services.auth.checkAuthStatus();

            if (status.success && status.authenticated) {
                this.currentUser = status.data.user;
                await this.handleUserLogin({ user: this.currentUser });
            } else {
                this.showAuthPages();
            }

        } catch (error) {
            console.error('檢查認證狀態失敗:', error);
            this.showAuthPages();
        }
    }

    // 事件處理器
    async handleUserLogin(data) {
        this.currentUser = data.user;

        // 顯示聊天界面
        this.showChatApp();

        // 連接 WebSocket
        if (this.services.websocket) {
            await this.services.websocket.connect(this.currentUser);
        }

        // 設置視頻通話用戶
        if (this.components.videoCall) {
            this.components.videoCall.setCurrentUser(this.currentUser);
        }

        // 顯示歡迎通知
        this.showNotification(`歡迎回來，${this.currentUser.displayName || this.currentUser.username}！`, 'success');

        console.log('用戶登入成功:', this.currentUser);
    }

    handleUserLogout() {
        this.currentUser = null;
        this.activeChat = null;

        // 斷開 WebSocket 連接
        if (this.services.websocket) {
            this.services.websocket.disconnect();
        }

        // 顯示認證頁面
        this.showAuthPages();

        console.log('用戶已登出');
    }

    handleTokenExpired() {
        this.showNotification('登入已過期，請重新登入', 'warning');
        this.handleUserLogout();
    }

    handleWebSocketConnected() {
        this.showNotification('連線已建立', 'success', 2000);
        this.updateConnectionStatus(true);
    }

    handleWebSocketDisconnected() {
        this.showNotification('連線已中斷', 'warning');
        this.updateConnectionStatus(false);
    }

    handleIncomingMessage(message) {
        // 將訊息傳遞給聊天組件
        if (this.components.chat) {
            this.components.chat.addMessage(message);
        }

        // 更新聊天室列表
        if (this.components.roomList) {
            this.components.roomList.updateRoom(message.chatId, {
                lastMessage: {
                    content: message.content,
                    sender: message.sender.name,
                    timestamp: message.timestamp
                },
                lastActivity: message.timestamp,
                hasUnread: message.chatId !== this.activeChat?.id
            });
        }

        // 播放通知音效（如果不是當前聊天）
        if (message.chatId !== this.activeChat?.id) {
            this.playNotificationSound();
        }
    }

    handleUserStatusUpdate(data) {
        // 更新用戶列表中的狀態
        if (this.components.userList) {
            this.components.userList.updateUserStatus(data.userId, data.status, data.lastSeen);
        }
    }

    handleTypingUpdate(data) {
        // 更新輸入指示器
        if (this.components.chat && data.chatId === this.activeChat?.id) {
            this.components.chat.setTypingUsers(data.users);
        }
    }

    // 組件事件處理器
    handleChatEvent(event, data) {
        switch (event) {
            case 'markAsRead':
                this.markChatAsRead(data.chatId);
                break;
            case 'error':
                this.showError(data.message);
                break;
        }
    }

    handleMessageInputEvent(event, data) {
        switch (event) {
            case 'send':
                this.sendMessage(data);
                break;
            case 'typing':
                this.sendTypingIndicator(data.isTyping);
                break;
            case 'filesSelected':
                this.handleFileUpload(data.files);
                break;
            case 'voiceMessage':
                this.handleVoiceMessage(data.voiceData);
                break;
        }
    }

    handleRoomListEvent(event, data) {
        switch (event) {
            case 'roomSelected':
                this.selectChat(data.room);
                break;
            case 'createRoom':
                this.showCreateRoomModal();
                break;
            case 'roomJoined':
                this.joinChatRoom(data.room);
                break;
        }
    }

    handleUserListEvent(event, data) {
        switch (event) {
            case 'startDirectMessage':
                this.startDirectMessage(data.user);
                break;
            case 'startVoiceCall':
                this.startVoiceCall(data.user);
                break;
            case 'startVideoCall':
                this.startVideoCall(data.user);
                break;
        }
    }

    handleVideoCallEvent(event, data) {
        switch (event) {
            case 'callOffer':
            case 'callAnswer':
            case 'callEnded':
            case 'iceCandidate':
                // 通過 WebSocket 傳送信令
                if (this.services.websocket) {
                    this.services.websocket.send('videoCall', {
                        type: event,
                        ...data
                    });
                }
                break;
        }
    }

    // 聊天功能
    async selectChat(chat) {
        try {
            this.activeChat = chat;

            // 載入聊天到組件中
            if (this.components.chat) {
                this.components.chat.loadChat(chat);
            }

            // 加入 WebSocket 房間
            if (this.services.websocket) {
                await this.services.websocket.joinChat(chat.id);
            }

            // 標記為已讀
            this.markChatAsRead(chat.id);

            console.log('已選擇聊天:', chat);

        } catch (error) {
            console.error('選擇聊天失敗:', error);
            this.showError('無法載入聊天');
        }
    }

    async sendMessage(messageData) {
        try {
            if (!this.activeChat) {
                this.showError('請先選擇聊天');
                return;
            }

            // 通過 WebSocket 發送訊息
            if (this.services.websocket) {
                await this.services.websocket.sendMessage(
                    this.activeChat.id,
                    messageData.content,
                    {
                        type: messageData.type,
                        replyTo: messageData.replyTo,
                        mentions: messageData.mentions
                    }
                );
            }

        } catch (error) {
            console.error('發送訊息失敗:', error);
            this.showError('訊息發送失敗');
        }
    }

    sendTypingIndicator(isTyping) {
        if (this.activeChat && this.services.websocket) {
            this.services.websocket.sendTyping(this.activeChat.id, isTyping);
        }
    }

    markChatAsRead(chatId) {
        // 標記聊天為已讀
        if (this.components.roomList) {
            this.components.roomList.markRoomAsRead(chatId);
        }

        // 通過 WebSocket 發送已讀狀態
        if (this.services.websocket) {
            this.services.websocket.markAsRead(null, chatId);
        }
    }

    // 檔案和媒體處理
    async handleFileUpload(files) {
        try {
            if (!this.activeChat) {
                this.showError('請先選擇聊天');
                return;
            }

            for (const file of files) {
                // 驗證檔案
                if (!this.validateFile(file)) {
                    continue;
                }

                // 上傳檔案
                const uploadResult = await this.uploadFile(file);

                // 發送檔案訊息
                await this.sendMessage({
                    content: uploadResult.url,
                    type: this.getFileMessageType(file),
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type
                });
            }

        } catch (error) {
            console.error('檔案上傳失敗:', error);
            this.showError('檔案上傳失敗');
        }
    }

    async handleVoiceMessage(voiceData) {
        try {
            if (!this.activeChat) {
                this.showError('請先選擇聊天');
                return;
            }

            // 上傳語音檔案
            const uploadResult = await this.uploadVoiceFile(voiceData);

            // 發送語音訊息
            await this.sendMessage({
                content: uploadResult.url,
                type: 'voice',
                duration: voiceData.duration,
                fileSize: voiceData.size
            });

        } catch (error) {
            console.error('語音訊息發送失敗:', error);
            this.showError('語音訊息發送失敗');
        }
    }

    validateFile(file) {
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            this.showError(`檔案 "${file.name}" 超過大小限制 (50MB)`);
            return false;
        }
        return true;
    }

    getFileMessageType(file) {
        if (file.type.startsWith('image/')) return 'image';
        if (file.type.startsWith('video/')) return 'video';
        if (file.type.startsWith('audio/')) return 'audio';
        return 'file';
    }

    async uploadFile(file) {
        if (!this.services.api) {
            throw new Error('API 服務不可用');
        }

        return await this.services.api.upload('/upload', file, {
            fieldName: 'file'
        });
    }

    async uploadVoiceFile(voiceData) {
        const file = new File([voiceData.blob], 'voice.webm', {
            type: 'audio/webm'
        });

        return await this.uploadFile(file);
    }

    // 通話功能
    async startVoiceCall(user) {
        try {
            if (this.components.videoCall) {
                await this.components.videoCall.startCall(user, true); // audioOnly = true
            }
        } catch (error) {
            console.error('語音通話失敗:', error);
            this.showError('無法開始語音通話');
        }
    }

    async startVideoCall(user) {
        try {
            if (this.components.videoCall) {
                await this.components.videoCall.startCall(user, false); // audioOnly = false
            }
        } catch (error) {
            console.error('視頻通話失敗:', error);
            this.showError('無法開始視頻通話');
        }
    }

    // UI 管理
    showLoadingScreen() {
        const loadingScreen = document.querySelector('#loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
    }

    hideLoadingScreen() {
        const loadingScreen = document.querySelector('#loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
    }

    showAuthPages() {
        const authPages = document.querySelector('#auth-pages');
        const chatApp = document.querySelector('#chat-app');

        if (authPages) authPages.classList.remove('hidden');
        if (chatApp) chatApp.classList.add('hidden');
    }

    showChatApp() {
        const authPages = document.querySelector('#auth-pages');
        const chatApp = document.querySelector('#chat-app');

        if (authPages) authPages.classList.add('hidden');
        if (chatApp) chatApp.classList.remove('hidden');
    }

    showBrowserWarning(unsupportedFeatures) {
        const warningHTML = `
            <div class="browser-warning">
                <h3>瀏覽器兼容性警告</h3>
                <p>以下功能在您的瀏覽器中不受支援：</p>
                <ul>${unsupportedFeatures.map(f => `<li>${f}</li>`).join('')}</ul>
                <p>建議升級到最新版本的瀏覽器以獲得最佳體驗。</p>
            </div>
        `;

        this.showNotification(warningHTML, 'warning', 10000);
    }

    // 主題管理
    initializeTheme() {
        const savedTheme = this.services.storage?.get('theme') || 'light';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        document.body.className = document.body.className.replace(/theme-\w+/, '');
        document.body.classList.add(`theme-${theme}`);

        if (this.services.storage) {
            this.services.storage.set('theme', theme);
        }

        // 更新主題切換按鈕
        this.updateThemeToggle(theme);
    }

    toggleTheme() {
        const themes = ['light', 'dark', 'sepia', 'ocean', 'forest'];
        const currentTheme = this.getCurrentTheme();
        const currentIndex = themes.indexOf(currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;

        this.setTheme(themes[nextIndex]);
    }

    getCurrentTheme() {
        const classList = document.body.classList;
        for (const className of classList) {
            if (className.startsWith('theme-')) {
                return className.replace('theme-', '');
            }
        }
        return 'light';
    }

    updateThemeToggle(theme) {
        const themeToggle = document.querySelector('#theme-toggle');
        if (themeToggle) {
            themeToggle.setAttribute('data-theme', theme);
        }
    }

    // 模態框管理
    showNewChatModal() {
        // 實作新聊天模態框
        console.log('顯示新聊天模態框');
    }

    showCreateRoomModal() {
        // 實作創建聊天室模態框
        console.log('顯示創建聊天室模態框');
    }

    showGlobalSearch() {
        // 實作全域搜尋
        console.log('顯示全域搜尋');
    }

    closeActiveModals() {
        // 關閉所有活動的模態框
        const modals = document.querySelectorAll('.modal.active, .modal-open');
        modals.forEach(modal => {
            modal.classList.remove('active', 'modal-open');
        });
    }

    // 通知和狀態
    showNotification(message, type = 'info', duration = 4000) {
        if (this.services.notification) {
            this.services.notification.show(message, type, { duration });
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    updateConnectionStatus(isConnected) {
        const statusIndicator = document.querySelector('#connection-status');
        if (statusIndicator) {
            statusIndicator.classList.toggle('connected', isConnected);
            statusIndicator.classList.toggle('disconnected', !isConnected);
        }
    }

    playNotificationSound() {
        // 播放通知音效
        try {
            const audio = new Audio('/assets/sounds/notification.mp3');
            audio.volume = 0.3;
            audio.play().catch(e => {
                // 靜默處理播放失敗
                console.debug('無法播放通知音效:', e);
            });
        } catch (error) {
            console.debug('通知音效播放失敗:', error);
        }
    }

    // 視窗事件處理
    handleBeforeUnload(e) {
        if (this.services.websocket && this.services.websocket.isConnected()) {
            // 如果有正在進行的通話，警告用戶
            if (this.components.videoCall && this.components.videoCall.isCallActive()) {
                e.preventDefault();
                e.returnValue = '您正在進行通話，確定要離開嗎？';
            }
        }
    }

    handleOnline() {
        this.showNotification('網路連接已恢復', 'success', 2000);

        // 重新連接 WebSocket
        if (this.services.websocket && this.currentUser) {
            this.services.websocket.connect(this.currentUser);
        }
    }

    handleOffline() {
        this.showNotification('網路連接已中斷', 'warning');
    }

    // 工具方法
    getWebSocketURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
    }

    // 公共 API
    getCurrentUser() {
        return this.currentUser;
    }

    getActiveChat() {
        return this.activeChat;
    }

    getComponent(name) {
        return this.components[name];
    }

    getService(name) {
        return this.services[name];
    }

    isInitialized() {
        return this.isInitialized;
    }

    // 清理方法
    destroy() {
        // 清理組件
        Object.values(this.components).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });

        // 清理服務
        Object.values(this.services).forEach(service => {
            if (service && typeof service.destroy === 'function') {
                service.destroy();
            }
        });

        // 移除事件監聽器
        document.removeEventListener('keydown', this.setupKeyboardShortcuts);
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);

        console.log('Elite Chat 應用程式已清理');
    }
}

// 全域訪問
window.EliteChatApp = EliteChatApplication;

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EliteChatApplication;
}