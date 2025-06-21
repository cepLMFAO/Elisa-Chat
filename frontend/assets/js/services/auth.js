class AuthService {
    constructor(options = {}) {
        this.options = {
            apiUrl: '/api/auth',
            tokenKey: 'auth_token',
            refreshTokenKey: 'refresh_token',
            userKey: 'current_user',
            autoRefresh: true,
            refreshThreshold: 5 * 60 * 1000,
            ...options
        };

        this.currentUser = null;
        this.token = null;
        this.refreshToken = null;
        this.refreshTimer = null;
        this.isRefreshing = false;
        this.refreshPromise = null;

        this.init();
    }

    init() {
        // 載入儲存的認證資訊
        this.loadStoredAuth();

        // 設置自動重新整理
        if (this.options.autoRefresh && this.token) {
            this.setupAutoRefresh();
        }

        // 監聽網路狀態變化
        this.setupNetworkListeners();
    }

    // 載入儲存的認證資訊
    loadStoredAuth() {
        try {
            this.token = localStorage.getItem(this.options.tokenKey);
            this.refreshToken = localStorage.getItem(this.options.refreshTokenKey);

            const userStr = localStorage.getItem(this.options.userKey);
            if (userStr) {
                this.currentUser = JSON.parse(userStr);
            }
        } catch (error) {
            console.warn('載入認證資訊失敗:', error);
            this.clearStoredAuth();
        }
    }

    // 儲存認證資訊
    saveAuth(authData) {
        try {
            if (authData.token) {
                this.token = authData.token;
                localStorage.setItem(this.options.tokenKey, authData.token);
            }

            if (authData.refreshToken) {
                this.refreshToken = authData.refreshToken;
                localStorage.setItem(this.options.refreshTokenKey, authData.refreshToken);
            }

            if (authData.user) {
                this.currentUser = authData.user;
                localStorage.setItem(this.options.userKey, JSON.stringify(authData.user));
            }

            // 設置自動重新整理
            if (this.options.autoRefresh && this.token) {
                this.setupAutoRefresh();
            }

            this.emit('auth:login', { user: this.currentUser });
        } catch (error) {
            console.error('儲存認證資訊失敗:', error);
        }
    }

    // 清除儲存的認證資訊
    clearStoredAuth() {
        this.token = null;
        this.refreshToken = null;
        this.currentUser = null;

        localStorage.removeItem(this.options.tokenKey);
        localStorage.removeItem(this.options.refreshTokenKey);
        localStorage.removeItem(this.options.userKey);

        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }

        this.emit('auth:logout');
    }

    // 登錄
    async login(credentials) {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/login`, credentials);

            if (response.success) {
                this.saveAuth(response.data);
                return { success: true, data: response.data };
            }

            return { success: false, error: response.error || '登錄失敗' };

        } catch (error) {
            console.error('登錄錯誤:', error);
            return {
                success: false,
                error: error.message || '登錄失敗，請稍後重試',
                code: error.status || 'NETWORK_ERROR'
            };
        }
    }

    // 註冊
    async register(userData) {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/register`, userData);

            if (response.success) {
                this.saveAuth(response.data);
                return { success: true, data: response.data };
            }

            return { success: false, error: response.error || '註冊失敗' };

        } catch (error) {
            console.error('註冊錯誤:', error);
            return {
                success: false,
                error: error.message || '註冊失敗，請稍後重試'
            };
        }
    }

    // 登出
    async logout() {
        try {
            // 向服務器發送登出請求
            if (this.token) {
                await this.api.post(`${this.options.apiUrl}/logout`, {}, {
                    headers: { Authorization: `Bearer ${this.token}` }
                });
            }
        } catch (error) {
            console.warn('服務器登出失敗:', error);
        } finally {
            // 無論服務器請求是否成功，都清除本地認證資訊
            this.clearStoredAuth();
        }
    }

    // 重新整理 Token
    async refreshAccessToken() {
        if (this.isRefreshing) {
            return this.refreshPromise;
        }

        if (!this.refreshToken) {
            throw new Error('沒有重新整理 Token');
        }

        this.isRefreshing = true;
        this.refreshPromise = this.performTokenRefresh();

        try {
            const result = await this.refreshPromise;
            this.isRefreshing = false;
            return result;
        } catch (error) {
            this.isRefreshing = false;
            this.refreshPromise = null;
            throw error;
        }
    }

    async performTokenRefresh() {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/refresh`, {
                refreshToken: this.refreshToken
            });

            if (response.success) {
                this.saveAuth(response.data);
                return response.data;
            }

            throw new Error(response.error || '重新整理 Token 失敗');

        } catch (error) {
            console.error('重新整理 Token 失敗:', error);

            // 如果重新整理失敗，清除認證資訊
            this.clearStoredAuth();
            this.emit('auth:tokenExpired');

            throw error;
        }
    }

    // 檢查認證狀態
    async checkAuthStatus() {
        try {
            if (!this.token) {
                return { success: false, authenticated: false };
            }

            const response = await this.api.get(`${this.options.apiUrl}/me`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });

            if (response.success) {
                // 更新使用者資訊
                this.currentUser = response.data.user;
                localStorage.setItem(this.options.userKey, JSON.stringify(this.currentUser));

                return {
                    success: true,
                    authenticated: true,
                    data: { user: this.currentUser }
                };
            }

            return { success: false, authenticated: false };

        } catch (error) {
            console.error('檢查認證狀態失敗:', error);

            if (error.status === 401) {
                // Token 過期，嘗試重新整理
                try {
                    await this.refreshAccessToken();
                    return this.checkAuthStatus();
                } catch (refreshError) {
                    this.clearStoredAuth();
                    return { success: false, authenticated: false };
                }
            }

            return { success: false, authenticated: false };
        }
    }

    // 設置自動重新整理
    setupAutoRefresh() {
        if (!this.token) return;

        try {
            // 解析 Token 到期時間
            const tokenData = this.parseJWT(this.token);
            if (!tokenData || !tokenData.exp) return;

            const expirationTime = tokenData.exp * 1000; // 轉換為毫秒
            const currentTime = Date.now();
            const timeUntilExpiry = expirationTime - currentTime;
            const refreshTime = timeUntilExpiry - this.options.refreshThreshold;

            if (refreshTime > 0) {
                this.refreshTimer = setTimeout(() => {
                    this.refreshAccessToken().catch(error => {
                        console.error('自動重新整理失敗:', error);
                    });
                }, refreshTime);
            } else {
                // Token 即將過期，立即重新整理
                this.refreshAccessToken().catch(error => {
                    console.error('立即重新整理失敗:', error);
                });
            }
        } catch (error) {
            console.warn('設置自動重新整理失敗:', error);
        }
    }

    // 解析 JWT Token
    parseJWT(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            return JSON.parse(jsonPayload);
        } catch (error) {
            console.warn('解析 JWT Token 失敗:', error);
            return null;
        }
    }

    // 密碼重設相關
    async requestPasswordReset(email) {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/forgot-password`, { email });
            return {
                success: response.success,
                error: response.error || (!response.success ? '請求失敗' : null)
            };
        } catch (error) {
            console.error('請求密碼重設失敗:', error);
            return { success: false, error: error.message || '請求失敗，請稍後重試' };
        }
    }

    async resetPassword(token, newPassword) {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/reset-password`, {
                token,
                password: newPassword
            });
            return {
                success: response.success,
                error: response.error || (!response.success ? '重設失敗' : null)
            };
        } catch (error) {
            console.error('重設密碼失敗:', error);
            return { success: false, error: error.message || '重設失敗，請稍後重試' };
        }
    }

    async changePassword(currentPassword, newPassword) {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/change-password`, {
                currentPassword,
                newPassword
            }, {
                headers: { Authorization: `Bearer ${this.token}` }
            });

            return {
                success: response.success,
                error: response.error || (!response.success ? '變更失敗' : null)
            };
        } catch (error) {
            console.error('變更密碼失敗:', error);
            return { success: false, error: error.message || '變更失敗，請稍後重試' };
        }
    }

    // 雙因素認證
    async enableTwoFactor() {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/2fa/enable`, {}, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response;
        } catch (error) {
            console.error('啟用雙因素認證失敗:', error);
            return { success: false, error: error.message || '啟用失敗' };
        }
    }

    async disableTwoFactor(token) {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/2fa/disable`, { token }, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response;
        } catch (error) {
            console.error('停用雙因素認證失敗:', error);
            return { success: false, error: error.message || '停用失敗' };
        }
    }

    async verifyTwoFactor(token) {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/2fa/verify`, { token }, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response;
        } catch (error) {
            console.error('驗證雙因素認證失敗:', error);
            return { success: false, error: error.message || '驗證失敗' };
        }
    }

    // 使用者資料管理
    async updateProfile(userData) {
        try {
            const response = await this.api.put(`${this.options.apiUrl}/profile`, userData, {
                headers: { Authorization: `Bearer ${this.token}` }
            });

            if (response.success && response.data.user) {
                this.currentUser = response.data.user;
                localStorage.setItem(this.options.userKey, JSON.stringify(this.currentUser));
                this.emit('auth:profileUpdated', { user: this.currentUser });
            }

            return response;
        } catch (error) {
            console.error('更新個人資料失敗:', error);
            return { success: false, error: error.message || '更新失敗' };
        }
    }

    async uploadAvatar(file) {
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const response = await this.api.post(`${this.options.apiUrl}/avatar`, formData, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    // 移除 Content-Type，讓瀏覽器自動設置
                }
            });

            if (response.success && response.data.user) {
                this.currentUser = response.data.user;
                localStorage.setItem(this.options.userKey, JSON.stringify(this.currentUser));
                this.emit('auth:avatarUpdated', { user: this.currentUser });
            }

            return response;
        } catch (error) {
            console.error('上傳頭像失敗:', error);
            return { success: false, error: error.message || '上傳失敗' };
        }
    }

    // 驗證相關
    async checkUsernameAvailability(username) {
        try {
            const response = await this.api.get(`${this.options.apiUrl}/check-username`, {
                params: { username }
            });
            return response;
        } catch (error) {
            console.error('檢查用戶名可用性失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async checkEmailAvailability(email) {
        try {
            const response = await this.api.get(`${this.options.apiUrl}/check-email`, {
                params: { email }
            });
            return response;
        } catch (error) {
            console.error('檢查郵箱可用性失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async verifyEmail(token) {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/verify-email`, { token });
            return response;
        } catch (error) {
            console.error('驗證郵箱失敗:', error);
            return { success: false, error: error.message || '驗證失敗' };
        }
    }

    async resendVerificationEmail() {
        try {
            const response = await this.api.post(`${this.options.apiUrl}/resend-verification`, {}, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response;
        } catch (error) {
            console.error('重發驗證郵件失敗:', error);
            return { success: false, error: error.message || '發送失敗' };
        }
    }

    // 會話管理
    async getSessions() {
        try {
            const response = await this.api.get(`${this.options.apiUrl}/sessions`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response;
        } catch (error) {
            console.error('獲取會話列表失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async revokeSession(sessionId) {
        try {
            const response = await this.api.delete(`${this.options.apiUrl}/sessions/${sessionId}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return response;
        } catch (error) {
            console.error('撤銷會話失敗:', error);
            return { success: false, error: error.message };
        }
    }

    async revokeAllSessions() {
        try {
            const response = await this.api.delete(`${this.options.apiUrl}/sessions`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });

            if (response.success) {
                // 撤銷所有會話後需要重新登錄
                this.clearStoredAuth();
            }

            return response;
        } catch (error) {
            console.error('撤銷所有會話失敗:', error);
            return { success: false, error: error.message };
        }
    }

    // 網路狀態監聽
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            // 網路恢復時檢查認證狀態
            if (this.token) {
                this.checkAuthStatus();
            }
        });

        window.addEventListener('beforeunload', () => {
            // 頁面卸載時清理計時器
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
            }
        });
    }

    // 權限檢查
    hasPermission(permission) {
        if (!this.currentUser || !this.currentUser.permissions) {
            return false;
        }

        return this.currentUser.permissions.includes(permission);
    }

    hasRole(role) {
        if (!this.currentUser || !this.currentUser.roles) {
            return false;
        }

        return this.currentUser.roles.includes(role);
    }

    isAdmin() {
        return this.hasRole('admin') || this.hasRole('administrator');
    }

    // 取得器方法
    getToken() {
        return this.token;
    }

    getUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return !!this.token && !!this.currentUser;
    }

    getUserId() {
        return this.currentUser?.id;
    }

    getUsername() {
        return this.currentUser?.username;
    }

    getEmail() {
        return this.currentUser?.email;
    }

    // 事件系統
    emit(event, data = {}) {
        const customEvent = new CustomEvent(event, { detail: data });
        window.dispatchEvent(customEvent);
    }

    on(event, callback) {
        window.addEventListener(event, callback);
    }

    off(event, callback) {
        window.removeEventListener(event, callback);
    }

    // 設置 API 實例
    setApiInstance(apiInstance) {
        this.api = apiInstance;

        // 設置認證攔截器
        this.api.addRequestInterceptor((config) => {
            if (this.token && !config.headers.Authorization) {
                config.headers.Authorization = `Bearer ${this.token}`;
            }
            return config;
        });

        // 設置響應攔截器處理 401 錯誤
        this.api.addResponseInterceptor(async (response, config) => {
            if (response.status === 401 && this.token) {
                try {
                    // 嘗試重新整理 Token
                    await this.refreshAccessToken();

                    // 重新發送原始請求
                    config.headers.Authorization = `Bearer ${this.token}`;
                    return this.api.request(config.url, config);
                } catch (error) {
                    // 重新整理失敗，清除認證資訊
                    this.clearStoredAuth();
                    this.emit('auth:unauthorized');
                }
            }

            return response;
        });
    }

    // 銷毀方法
    destroy() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        this.currentUser = null;
        this.token = null;
        this.refreshToken = null;
    }
}

// 建立預設實例
const authService = new AuthService();

// 如果有 API 實例，設置它
if (typeof api !== 'undefined') {
    authService.setApiInstance(api);
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuthService, authService };
} else {
    window.AuthService = AuthService;
    window.authService = authService;
}