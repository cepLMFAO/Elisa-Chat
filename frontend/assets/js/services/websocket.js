class WebSocketService {
    constructor(options = {}) {
        this.options = {
            url: options.url || this.getWebSocketURL(),
            protocols: options.protocols || [],
            autoReconnect: options.autoReconnect !== false,
            reconnectInterval: options.reconnectInterval || 3000,
            maxReconnectAttempts: options.maxReconnectAttempts || 10,
            heartbeatInterval: options.heartbeatInterval || 30000,
            timeout: options.timeout || 10000,
            enableLogging: options.enableLogging || false,
            ...options
        };

        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.lastPong = null;

        this.eventListeners = new Map();
        this.messageQueue = [];
        this.pendingRequests = new Map();
        this.requestId = 0;

        // 綁定方法上下文
        this.handleOpen = this.handleOpen.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
    }

    // 獲取 WebSocket URL
    getWebSocketURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
    }

    // 連接 WebSocket
    async connect(user = null) {
        if (this.isConnected || this.isConnecting) {
            return Promise.resolve();
        }

        this.isConnecting = true;
        this.user = user;

        return new Promise((resolve, reject) => {
            try {
                this.log('正在連接 WebSocket...');

                // 建立連接URL
                let url = this.options.url;
                if (this.user && this.user.token) {
                    url += `?token=${encodeURIComponent(this.user.token)}`;
                }

                this.socket = new WebSocket(url, this.options.protocols);

                // 設置事件監聽器
                this.socket.addEventListener('open', (event) => {
                    this.handleOpen(event);
                    resolve();
                });

                this.socket.addEventListener('close', this.handleClose);
                this.socket.addEventListener('error', (event) => {
                    this.handleError(event);
                    if (this.isConnecting) {
                        reject(new Error('WebSocket 連接失敗'));
                    }
                });
                this.socket.addEventListener('message', this.handleMessage);

                // 設置連接超時
                setTimeout(() => {
                    if (this.isConnecting) {
                        this.socket.close();
                        reject(new Error('WebSocket 連接超時'));
                    }
                }, this.options.timeout);

            } catch (error) {
                this.isConnecting = false;
                this.log('WebSocket 連接錯誤:', error);
                reject(error);
            }
        });
    }

    // 斷開連接
    disconnect() {
        this.log('正在斷開 WebSocket 連接...');

        this.clearTimers();
        this.options.autoReconnect = false;

        if (this.socket) {
            this.socket.removeEventListener('open', this.handleOpen);
            this.socket.removeEventListener('close', this.handleClose);
            this.socket.removeEventListener('error', this.handleError);
            this.socket.removeEventListener('message', this.handleMessage);

            if (this.socket.readyState === WebSocket.OPEN) {
                this.socket.close(1000, '正常關閉');
            } else {
                this.socket.close();
            }
        }

        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
    }

    // 發送訊息
    send(type, data = {}, options = {}) {
        const message = {
            id: options.requestId || this.generateRequestId(),
            type,
            data,
            timestamp: Date.now()
        };

        if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(message));
                this.log('發送訊息:', message);

                // 如果需要回應，設置Promise
                if (options.expectResponse) {
                    return new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            this.pendingRequests.delete(message.id);
                            reject(new Error('請求超時'));
                        }, options.timeout || this.options.timeout);

                        this.pendingRequests.set(message.id, {
                            resolve,
                            reject,
                            timeout
                        });
                    });
                }

                return Promise.resolve();
            } catch (error) {
                this.log('發送訊息失敗:', error);
                return Promise.reject(error);
            }
        } else {
            // 如果未連接，將訊息加入佇列
            if (options.queue !== false) {
                this.messageQueue.push(message);
                this.log('訊息已加入佇列:', message);
            }
            return Promise.reject(new Error('WebSocket 未連接'));
        }
    }

    // 發送請求並等待回應
    async request(type, data = {}, options = {}) {
        return this.send(type, data, {
            ...options,
            expectResponse: true
        });
    }

    // 事件監聽器管理
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`事件 ${event} 回調執行錯誤:`, error);
                }
            });
        }
    }

    // WebSocket 事件處理器
    handleOpen(event) {
        this.log('WebSocket 連接已建立');
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // 發送佇列中的訊息
        this.flushMessageQueue();

        // 開始心跳
        this.startHeartbeat();

        this.emit('connected', event);
    }

    handleClose(event) {
        this.log('WebSocket 連接已關閉:', event.code, event.reason);
        this.isConnected = false;
        this.isConnecting = false;

        this.clearTimers();

        // 清理待處理的請求
        this.pendingRequests.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(new Error('連接已關閉'));
        });
        this.pendingRequests.clear();

        this.emit('disconnected', event);

        // 自動重連
        if (this.options.autoReconnect && event.code !== 1000) {
            this.scheduleReconnect();
        }
    }

    handleError(error) {
        this.log('WebSocket 錯誤:', error);
        this.emit('error', error);
    }

    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.log('收到訊息:', message);

            // 處理心跳回應
            if (message.type === 'pong') {
                this.lastPong = Date.now();
                return;
            }

            // 處理請求回應
            if (message.id && this.pendingRequests.has(message.id)) {
                const { resolve, timeout } = this.pendingRequests.get(message.id);
                clearTimeout(timeout);
                this.pendingRequests.delete(message.id);
                resolve(message.data);
                return;
            }

            // 發射事件
            this.emit('message', message);
            this.emit(message.type, message.data);

        } catch (error) {
            this.log('解析訊息失敗:', error);
            this.emit('parseError', { error, rawData: event.data });
        }
    }

    // 重連機制
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this.log('已達到最大重連次數，停止重連');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.options.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);

        this.log(`${delay}ms 後進行第 ${this.reconnectAttempts} 次重連...`);

        this.reconnectTimer = setTimeout(() => {
            this.log(`開始第 ${this.reconnectAttempts} 次重連`);
            this.connect(this.user).catch(error => {
                this.log('重連失敗:', error);
            });
        }, delay);
    }

    // 心跳機制
    startHeartbeat() {
        if (this.options.heartbeatInterval <= 0) return;

        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                this.send('ping', {}, { queue: false }).catch(() => {
                    // 心跳發送失敗，可能連接有問題
                });

                // 檢查心跳回應
                if (this.lastPong && Date.now() - this.lastPong > this.options.heartbeatInterval * 2) {
                    this.log('心跳超時，關閉連接');
                    this.socket.close();
                }
            }
        }, this.options.heartbeatInterval);
    }

    // 清理計時器
    clearTimers() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    // 發送佇列中的訊息
    flushMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected) {
            const message = this.messageQueue.shift();
            try {
                this.socket.send(JSON.stringify(message));
                this.log('發送佇列訊息:', message);
            } catch (error) {
                this.log('發送佇列訊息失敗:', error);
                // 重新加入佇列
                this.messageQueue.unshift(message);
                break;
            }
        }
    }

    // 生成請求ID
    generateRequestId() {
        return `req_${++this.requestId}_${Date.now()}`;
    }

    // 日誌方法
    log(...args) {
        if (this.options.enableLogging) {
            console.log('[WebSocket]', ...args);
        }
    }

    // 便捷方法
    async sendMessage(content, chatId, options = {}) {
        return this.send('message', {
            content,
            chatId,
            type: options.type || 'text',
            replyTo: options.replyTo,
            ...options
        });
    }

    async joinRoom(roomId) {
        return this.request('joinRoom', { roomId });
    }

    async leaveRoom(roomId) {
        return this.request('leaveRoom', { roomId });
    }

    async updateTypingStatus(chatId, isTyping) {
        return this.send('typing', { chatId, isTyping }, { queue: false });
    }

    async updateUserStatus(status) {
        return this.send('userStatus', { status });
    }

    async markMessageAsRead(messageId, chatId) {
        return this.send('markRead', { messageId, chatId });
    }

    // 狀態查詢
    getState() {
        return {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            readyState: this.socket ? this.socket.readyState : null,
            queuedMessages: this.messageQueue.length,
            pendingRequests: this.pendingRequests.size
        };
    }

    getReadyState() {
        if (!this.socket) return 'CLOSED';

        switch (this.socket.readyState) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'OPEN';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'CLOSED';
            default: return 'UNKNOWN';
        }
    }

    isReady() {
        return this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    // 配置方法
    setAutoReconnect(enabled) {
        this.options.autoReconnect = enabled;
    }

    setReconnectInterval(interval) {
        this.options.reconnectInterval = interval;
    }

    setHeartbeatInterval(interval) {
        this.options.heartbeatInterval = interval;

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.startHeartbeat();
        }
    }

    // 清理方法
    destroy() {
        this.disconnect();
        this.eventListeners.clear();
        this.messageQueue = [];
        this.pendingRequests.clear();
    }

    // 靜態方法
    static isSupported() {
        return 'WebSocket' in window;
    }

    static getReadyStateName(readyState) {
        const states = {
            [WebSocket.CONNECTING]: 'CONNECTING',
            [WebSocket.OPEN]: 'OPEN',
            [WebSocket.CLOSING]: 'CLOSING',
            [WebSocket.CLOSED]: 'CLOSED'
        };
        return states[readyState] || 'UNKNOWN';
    }
}

// WebSocket 管理器 - 用於管理多個 WebSocket 連接
class WebSocketManager {
    constructor() {
        this.connections = new Map();
        this.defaultConnection = null;
    }

    create(name, options = {}) {
        const connection = new WebSocketService(options);
        this.connections.set(name, connection);

        if (!this.defaultConnection) {
            this.defaultConnection = connection;
        }

        return connection;
    }

    get(name) {
        return this.connections.get(name);
    }

    getDefault() {
        return this.defaultConnection;
    }

    setDefault(name) {
        const connection = this.connections.get(name);
        if (connection) {
            this.defaultConnection = connection;
        }
    }

    remove(name) {
        const connection = this.connections.get(name);
        if (connection) {
            connection.destroy();
            this.connections.delete(name);

            if (this.defaultConnection === connection) {
                this.defaultConnection = this.connections.values().next().value || null;
            }
        }
    }

    disconnectAll() {
        this.connections.forEach(connection => {
            connection.disconnect();
        });
    }

    destroyAll() {
        this.connections.forEach(connection => {
            connection.destroy();
        });
        this.connections.clear();
        this.defaultConnection = null;
    }

    getStats() {
        const stats = {
            totalConnections: this.connections.size,
            connectedCount: 0,
            connectingCount: 0,
            connections: {}
        };

        this.connections.forEach((connection, name) => {
            const state = connection.getState();
            stats.connections[name] = state;

            if (state.isConnected) {
                stats.connectedCount++;
            } else if (state.isConnecting) {
                stats.connectingCount++;
            }
        });

        return stats;
    }
}

// 聊天專用的 WebSocket 包裝器
class ChatWebSocket {
    constructor(options = {}) {
        this.ws = new WebSocketService(options);
        this.currentUser = null;
        this.activeChats = new Set();
        this.typingUsers = new Map(); // chatId -> Set of users
        this.typingTimers = new Map(); // userId -> timer

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.ws.on('connected', () => {
            this.emit('connected');

            // 重新加入活躍的聊天室
            this.activeChats.forEach(chatId => {
                this.joinChat(chatId);
            });
        });

        this.ws.on('disconnected', () => {
            this.emit('disconnected');
            this.clearTypingUsers();
        });

        this.ws.on('message', this.handleMessage.bind(this));
        this.ws.on('typing', this.handleTyping.bind(this));
        this.ws.on('userStatus', this.handleUserStatus.bind(this));
        this.ws.on('chatUpdate', this.handleChatUpdate.bind(this));
        this.ws.on('notification', this.handleNotification.bind(this));
    }

    async connect(user) {
        this.currentUser = user;
        return this.ws.connect(user);
    }

    disconnect() {
        this.clearTypingUsers();
        this.activeChats.clear();
        this.ws.disconnect();
    }

    // 聊天相關方法
    async sendMessage(chatId, content, options = {}) {
        const messageData = {
            chatId,
            content,
            type: options.type || 'text',
            replyTo: options.replyTo,
            metadata: options.metadata || {}
        };

        return this.ws.sendMessage(content, chatId, messageData);
    }

    async joinChat(chatId) {
        this.activeChats.add(chatId);
        return this.ws.joinRoom(chatId);
    }

    async leaveChat(chatId) {
        this.activeChats.delete(chatId);
        this.clearChatTyping(chatId);
        return this.ws.leaveRoom(chatId);
    }

    async sendTyping(chatId, isTyping) {
        return this.ws.updateTypingStatus(chatId, isTyping);
    }

    async markAsRead(messageId, chatId) {
        return this.ws.markMessageAsRead(messageId, chatId);
    }

    async updateStatus(status) {
        return this.ws.updateUserStatus(status);
    }

    // 事件處理器
    handleMessage(data) {
        this.emit('message', data);

        // 根據訊息類型發射特定事件
        switch (data.type) {
            case 'text':
                this.emit('textMessage', data);
                break;
            case 'image':
                this.emit('imageMessage', data);
                break;
            case 'file':
                this.emit('fileMessage', data);
                break;
            case 'voice':
                this.emit('voiceMessage', data);
                break;
        }
    }

    handleTyping(data) {
        const { chatId, userId, isTyping, user } = data;

        if (!this.typingUsers.has(chatId)) {
            this.typingUsers.set(chatId, new Map());
        }

        const chatTyping = this.typingUsers.get(chatId);

        if (isTyping) {
            chatTyping.set(userId, user);

            // 設置超時清除
            if (this.typingTimers.has(userId)) {
                clearTimeout(this.typingTimers.get(userId));
            }

            const timer = setTimeout(() => {
                chatTyping.delete(userId);
                this.typingTimers.delete(userId);
                this.emit('typingUpdate', {
                    chatId,
                    users: Array.from(chatTyping.values())
                });
            }, 5000);

            this.typingTimers.set(userId, timer);
        } else {
            chatTyping.delete(userId);
            if (this.typingTimers.has(userId)) {
                clearTimeout(this.typingTimers.get(userId));
                this.typingTimers.delete(userId);
            }
        }

        this.emit('typingUpdate', {
            chatId,
            users: Array.from(chatTyping.values())
        });
    }

    handleUserStatus(data) {
        this.emit('userStatusUpdate', data);
    }

    handleChatUpdate(data) {
        this.emit('chatUpdate', data);
    }

    handleNotification(data) {
        this.emit('notification', data);
    }

    // 工具方法
    clearTypingUsers() {
        this.typingUsers.clear();
        this.typingTimers.forEach(timer => clearTimeout(timer));
        this.typingTimers.clear();
    }

    clearChatTyping(chatId) {
        if (this.typingUsers.has(chatId)) {
            const chatTyping = this.typingUsers.get(chatId);
            chatTyping.forEach((user, userId) => {
                if (this.typingTimers.has(userId)) {
                    clearTimeout(this.typingTimers.get(userId));
                    this.typingTimers.delete(userId);
                }
            });
            this.typingUsers.delete(chatId);
        }
    }

    getTypingUsers(chatId) {
        const chatTyping = this.typingUsers.get(chatId);
        return chatTyping ? Array.from(chatTyping.values()) : [];
    }

    // 事件發射器
    emit(event, data) {
        this.ws.emit(event, data);
    }

    on(event, callback) {
        this.ws.on(event, callback);
    }

    off(event, callback) {
        this.ws.off(event, callback);
    }

    // 狀態查詢
    isConnected() {
        return this.ws.isReady();
    }

    getState() {
        return {
            ...this.ws.getState(),
            activeChats: Array.from(this.activeChats),
            typingChats: Array.from(this.typingUsers.keys())
        };
    }

    // 清理方法
    destroy() {
        this.clearTypingUsers();
        this.activeChats.clear();
        this.ws.destroy();
    }
}

// 全域 WebSocket 管理器實例
const wsManager = new WebSocketManager();

// 建立預設 WebSocket 連接
let defaultWebSocket = null;

function createDefaultWebSocket(options = {}) {
    if (!defaultWebSocket) {
        defaultWebSocket = new ChatWebSocket(options);
    }
    return defaultWebSocket;
}

function getDefaultWebSocket() {
    return defaultWebSocket;
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        WebSocketService,
        WebSocketManager,
        ChatWebSocket,
        wsManager,
        createDefaultWebSocket,
        getDefaultWebSocket
    };
} else {
    window.WebSocketService = WebSocketService;
    window.WebSocketManager = WebSocketManager;
    window.ChatWebSocket = ChatWebSocket;
    window.wsManager = wsManager;
    window.createDefaultWebSocket = createDefaultWebSocket;
    window.getDefaultWebSocket = getDefaultWebSocket;
}