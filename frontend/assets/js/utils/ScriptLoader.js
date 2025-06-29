class ScriptLoader {
    constructor() {
        this.loadedScripts = new Set();
        this.failedScripts = new Set();
        this.loadingPromises = new Map();

        // 定義腳本載入順序
        this.scriptOrder = [
            // 核心工具類
            { path: '../assets/js/utils/constants.js', className: 'Constants' },
            { path: '../assets/js/utils/helpers.js', className: 'Helpers' },
            { path: '../assets/js/utils/validators.js', className: 'Validators' },

            // 服務類
            { path: '../assets/js/services/storage.js', className: 'StorageService' },
            { path: '../assets/js/services/api.js', className: 'ApiService' },
            { path: '../assets/js/services/auth.js', className: 'AuthService' },
            { path: '../assets/js/services/websocket.js', className: 'WebSocketService' },

            // 組件類
            { path: '../assets/js/components/Notification.js', className: 'NotificationComponent' },
            { path: '../assets/js/components/FormValidator.js', className: 'FormValidator' },
            { path: '../assets/js/components/Chat.js', className: 'ChatComponent' },
            { path: '../assets/js/components/EmojiPicker.js', className: 'EmojiPicker' },
            { path: '../assets/js/components/VoiceRecorder.js', className: 'VoiceRecorder' },

            // 主應用程序
            { path: '../assets/js/app.js', className: 'EliteChatApplication' }
        ];

        // 必需的核心腳本
        this.requiredScripts = [
            'StorageService',
            'ApiService',
            'AuthService',
            'NotificationComponent'
        ];

        this.initialized = false;
        this.initStartTime = Date.now();
    }

    // 載入單個腳本
    async loadScript(scriptConfig) {
        const { path, className } = scriptConfig;

        // 如果已經在載入中，返回現有的Promise
        if (this.loadingPromises.has(path)) {
            return this.loadingPromises.get(path);
        }

        // 檢查腳本是否已經存在
        if (className && typeof window[className] !== 'undefined') {
            this.loadedScripts.add(className);
            return Promise.resolve();
        }

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = path;
            script.async = false; // 保持載入順序

            script.onload = () => {
                this.loadedScripts.add(className);
                console.log(`✅ Loaded: ${className || path}`);
                resolve();
            };

            script.onerror = (error) => {
                this.failedScripts.add(className || path);
                console.error(`❌ Failed to load: ${path}`, error);
                reject(new Error(`Script load failed: ${path}`));
            };

            // 設置超時
            const timeout = setTimeout(() => {
                script.remove();
                this.failedScripts.add(className || path);
                reject(new Error(`Script load timeout: ${path}`));
            }, 10000); // 10秒超時

            script.onload = (originalOnload => function() {
                clearTimeout(timeout);
                originalOnload.apply(this, arguments);
            })(script.onload);

            script.onerror = (originalOnerror => function() {
                clearTimeout(timeout);
                originalOnerror.apply(this, arguments);
            })(script.onerror);

            document.head.appendChild(script);
        });

        this.loadingPromises.set(path, promise);
        return promise;
    }

    // 按順序載入所有腳本
    async loadAllScripts() {
        console.log('🚀 Starting script loading...');

        const results = {
            loaded: [],
            failed: [],
            fallbacks: []
        };

        // 逐個載入腳本
        for (const scriptConfig of this.scriptOrder) {
            try {
                await this.loadScript(scriptConfig);
                results.loaded.push(scriptConfig.className || scriptConfig.path);
            } catch (error) {
                console.warn(`Script load failed: ${scriptConfig.path}`, error);
                results.failed.push(scriptConfig.className || scriptConfig.path);

                // 為失敗的核心腳本創建回退
                if (this.requiredScripts.includes(scriptConfig.className)) {
                    this.createFallback(scriptConfig.className);
                    results.fallbacks.push(scriptConfig.className);
                }
            }
        }

        return results;
    }

    // 創建回退實現
    createFallback(className) {
        console.log(`📦 Creating fallback for: ${className}`);

        switch (className) {
            case 'StorageService':
                window.StorageService = class StorageService {
                    constructor(options = {}) {
                        this.prefix = options.prefix || '';
                    }

                    get(key) {
                        try {
                            return localStorage.getItem(this.prefix + key);
                        } catch (error) {
                            console.error('Storage get error:', error);
                            return null;
                        }
                    }

                    set(key, value) {
                        try {
                            localStorage.setItem(this.prefix + key, value);
                            return true;
                        } catch (error) {
                            console.error('Storage set error:', error);
                            return false;
                        }
                    }

                    remove(key) {
                        try {
                            localStorage.removeItem(this.prefix + key);
                            return true;
                        } catch (error) {
                            console.error('Storage remove error:', error);
                            return false;
                        }
                    }
                };
                break;

            case 'ApiService':
                window.ApiService = class ApiService {
                    constructor(options = {}) {
                        this.baseURL = options.baseURL || '/api';
                        this.timeout = options.timeout || 10000;
                    }

                    async request(url, options = {}) {
                        try {
                            const fullUrl = url.startsWith('http') ? url : this.baseURL + url;

                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

                            const response = await fetch(fullUrl, {
                                ...options,
                                signal: controller.signal
                            });

                            clearTimeout(timeoutId);

                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            }

                            return await response.json();
                        } catch (error) {
                            if (error.name === 'AbortError') {
                                throw new Error('Request timeout');
                            }
                            throw error;
                        }
                    }
                };
                break;

            case 'AuthService':
                window.AuthService = class AuthService {
                    constructor(apiService) {
                        this.api = apiService || new window.ApiService();
                        this.currentUser = null;
                        this.isAuthenticated = false;
                    }

                    async login(identifier, password) {
                        try {
                            const response = await this.api.request('/auth/login', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ identifier, password })
                            });

                            if (response.success) {
                                this.currentUser = response.data.user;
                                this.isAuthenticated = true;
                                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                                localStorage.setItem('isAuthenticated', 'true');
                            }

                            return response;
                        } catch (error) {
                            console.error('Login error:', error);
                            return { success: false, error: error.message };
                        }
                    }

                    async register(userData) {
                        try {
                            const response = await this.api.request('/auth/register', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(userData)
                            });

                            if (response.success) {
                                this.currentUser = response.data.user;
                                this.isAuthenticated = true;
                                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                                localStorage.setItem('isAuthenticated', 'true');
                            }

                            return response;
                        } catch (error) {
                            console.error('Register error:', error);
                            return { success: false, error: error.message };
                        }
                    }

                    async logout() {
                        this.currentUser = null;
                        this.isAuthenticated = false;
                        localStorage.removeItem('currentUser');
                        localStorage.removeItem('isAuthenticated');
                        return { success: true };
                    }

                    async checkAuthStatus() {
                        const isAuth = localStorage.getItem('isAuthenticated');
                        const user = localStorage.getItem('currentUser');

                        if (isAuth === 'true' && user) {
                            this.currentUser = JSON.parse(user);
                            this.isAuthenticated = true;
                            return { success: true, data: { authenticated: true, user: this.currentUser } };
                        }

                        return { success: false, data: { authenticated: false } };
                    }
                };
                break;

            case 'NotificationComponent':
                window.NotificationComponent = class NotificationComponent {
                    constructor(container) {
                        this.container = container || this.createContainer();
                        this.notifications = new Map();
                        this.defaultDuration = 3000;
                    }

                    createContainer() {
                        let container = document.getElementById('notifications-container');
                        if (!container) {
                            container = document.createElement('div');
                            container.id = 'notifications-container';
                            container.style.cssText = `
                                position: fixed;
                                top: 20px;
                                right: 20px;
                                z-index: 9999;
                                pointer-events: none;
                            `;
                            document.body.appendChild(container);
                        }
                        return container;
                    }

                    show(message, type = 'info', duration = this.defaultDuration) {
                        const id = Date.now().toString();
                        const notification = this.createNotificationElement(message, type, id);

                        this.container.appendChild(notification);
                        this.notifications.set(id, notification);

                        // 動畫顯示
                        requestAnimationFrame(() => {
                            notification.style.transform = 'translateX(0)';
                            notification.style.opacity = '1';
                        });

                        // 自動移除
                        if (duration > 0) {
                            setTimeout(() => this.remove(id), duration);
                        }

                        return id;
                    }

                    createNotificationElement(message, type, id) {
                        const notification = document.createElement('div');
                        notification.className = `notification notification-${type}`;
                        notification.style.cssText = `
                            background: ${this.getTypeColor(type)};
                            color: white;
                            padding: 12px 16px;
                            border-radius: 8px;
                            margin-bottom: 10px;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                            transform: translateX(100%);
                            opacity: 0;
                            transition: all 0.3s ease;
                            pointer-events: auto;
                            cursor: pointer;
                            max-width: 300px;
                            word-wrap: break-word;
                        `;

                        notification.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span>${this.getTypeIcon(type)}</span>
                                <span>${message}</span>
                                <button style="
                                    background: none;
                                    border: none;
                                    color: white;
                                    cursor: pointer;
                                    margin-left: auto;
                                    font-size: 16px;
                                " onclick="window.notificationComponent?.remove('${id}')">&times;</button>
                            </div>
                        `;

                        notification.onclick = () => this.remove(id);

                        return notification;
                    }

                    getTypeColor(type) {
                        const colors = {
                            success: '#10b981',
                            error: '#ef4444',
                            warning: '#f59e0b',
                            info: '#3b82f6'
                        };
                        return colors[type] || colors.info;
                    }

                    getTypeIcon(type) {
                        const icons = {
                            success: '✓',
                            error: '✕',
                            warning: '⚠',
                            info: 'ℹ'
                        };
                        return icons[type] || icons.info;
                    }

                    remove(id) {
                        const notification = this.notifications.get(id);
                        if (notification) {
                            notification.style.transform = 'translateX(100%)';
                            notification.style.opacity = '0';

                            setTimeout(() => {
                                if (notification.parentNode) {
                                    notification.parentNode.removeChild(notification);
                                }
                                this.notifications.delete(id);
                            }, 300);
                        }
                    }

                    clear() {
                        this.notifications.forEach((_, id) => this.remove(id));
                    }
                };

                // 創建全局實例
                window.notificationComponent = new window.NotificationComponent();
                break;

            default:
                console.warn(`No fallback available for: ${className}`);
        }
    }

    // 檢查依賴是否完整
    checkDependencies() {
        const missing = [];
        const available = [];

        this.requiredScripts.forEach(script => {
            if (typeof window[script] === 'undefined') {
                missing.push(script);
            } else {
                available.push(script);
            }
        });

        return { missing, available };
    }

    // 等待腳本載入完成
    async waitForScripts(timeout = 15000) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const { missing } = this.checkDependencies();
            if (missing.length === 0) {
                return true;
            }

            // 每100ms檢查一次
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        throw new Error(`Script loading timeout. Missing: ${this.checkDependencies().missing.join(', ')}`);
    }

    // 主初始化方法
    async initialize() {
        try {
            console.log('🔄 Initializing ScriptLoader...');

            // 載入所有腳本
            const loadResults = await this.loadAllScripts();

            // 等待關鍵腳本完成載入
            await this.waitForScripts();

            // 檢查最終狀態
            const dependencies = this.checkDependencies();

            const result = {
                success: dependencies.missing.length === 0,
                loadTime: Date.now() - this.initStartTime,
                loaded: loadResults.loaded,
                failed: loadResults.failed,
                fallbacks: loadResults.fallbacks,
                missing: dependencies.missing,
                available: dependencies.available
            };

            this.initialized = true;

            console.log('✅ ScriptLoader initialization complete:', result);

            // 觸發自定義事件
            document.dispatchEvent(new CustomEvent('scriptsLoaded', {
                detail: result
            }));

            return result;

        } catch (error) {
            console.error('❌ ScriptLoader initialization failed:', error);

            // 創建所有必需的回退
            this.requiredScripts.forEach(script => {
                if (typeof window[script] === 'undefined') {
                    this.createFallback(script);
                }
            });

            const result = {
                success: false,
                error: error.message,
                loadTime: Date.now() - this.initStartTime,
                fallbacks: this.requiredScripts
            };

            // 即使失敗也觸發事件，讓應用知道可以使用回退
            document.dispatchEvent(new CustomEvent('scriptsLoaded', {
                detail: result
            }));

            return result;
        }
    }

    // 重新載入失敗的腳本
    async retryFailedScripts() {
        const failedList = Array.from(this.failedScripts);
        this.failedScripts.clear();

        console.log('🔄 Retrying failed scripts:', failedList);

        const retryResults = [];
        for (const scriptName of failedList) {
            const scriptConfig = this.scriptOrder.find(s => s.className === scriptName);
            if (scriptConfig) {
                try {
                    await this.loadScript(scriptConfig);
                    retryResults.push({ script: scriptName, success: true });
                } catch (error) {
                    retryResults.push({ script: scriptName, success: false, error: error.message });
                }
            }
        }

        return retryResults;
    }

    // 獲取載入狀態
    getStatus() {
        return {
            initialized: this.initialized,
            loaded: Array.from(this.loadedScripts),
            failed: Array.from(this.failedScripts),
            dependencies: this.checkDependencies()
        };
    }
}

// 自動初始化
document.addEventListener('DOMContentLoaded', async () => {
    window.scriptLoader = new ScriptLoader();

    try {
        const result = await window.scriptLoader.initialize();

        if (result.success) {
            console.log('🎉 All scripts loaded successfully');
        } else {
            console.warn('⚠️ Some scripts failed to load, using fallbacks');
        }

        // 嘗試初始化主應用
        if (typeof EliteChatApplication !== 'undefined') {
            window.app = new EliteChatApplication();
        } else {
            console.warn('EliteChatApplication not available, application may have limited functionality');
        }

    } catch (error) {
        console.error('💥 Critical error during script loading:', error);

        // 顯示錯誤訊息給用戶
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fee;
            border: 2px solid #fcc;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            z-index: 10000;
            font-family: Arial, sans-serif;
        `;
        errorMsg.innerHTML = `
            <h3 style="color: #c53030; margin: 0 0 10px 0;">載入錯誤</h3>
            <p style="margin: 0 0 15px 0;">應用程序載入失敗，請嘗試以下操作：</p>
            <ul style="text-align: left; margin: 0 0 15px 0;">
                <li>刷新頁面</li>
                <li>清除瀏覽器緩存</li>
                <li>檢查網絡連接</li>
            </ul>
            <button onclick="location.reload()" style="
                background: #3182ce;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            ">重新載入</button>
        `;
        document.body.appendChild(errorMsg);
    }
});

// 錯誤處理
window.addEventListener('error', function(e) {
    if (e.filename && e.filename.includes('.js')) {
        console.error('Script error:', e);

        if (window.scriptLoader && !window.scriptLoader.initialized) {
            // 如果在初始化過程中發生錯誤，嘗試重試
            setTimeout(async () => {
                try {
                    await window.scriptLoader.retryFailedScripts();
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                }
            }, 1000);
        }
    }
});

// 導出到全局
if (typeof window !== 'undefined') {
    window.ScriptLoader = ScriptLoader;
}