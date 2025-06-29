class AuthService {
    constructor(apiService) {
        this.api = apiService || window.ApiService;
        this.currentUser = null;
        this.isAuthenticated = false;
        this.token = null;

        // 事件監聽器
        this.eventListeners = {
            login: [],
            logout: [],
            authChange: []
        };

        // 初始化時檢查認證狀態
        this.init();
    }

    async init() {
        try {
            await this.checkAuthStatus();
        } catch (error) {
            console.error('Auth service initialization failed:', error);
        }
    }

    // 用戶註冊
    async register(userData) {
        try {
            // 前端驗證
            const validationErrors = this.validateRegistrationData(userData);
            if (validationErrors.length > 0) {
                throw new ValidationError('註冊數據驗證失敗', validationErrors);
            }

            // 顯示載入狀態
            this.setLoadingState(true);

            const response = await this.api.request('/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    username: userData.username.trim(),
                    email: userData.email.toLowerCase().trim(),
                    password: userData.password,
                    confirmPassword: userData.confirmPassword,
                    agreeTerms: userData.agreeTerms
                })
            });

            if (response.success) {
                // 保存用戶信息和token
                this.currentUser = response.data.user;
                this.token = response.data.accessToken;
                this.isAuthenticated = true;

                // 保存到本地存儲
                this.saveAuthData();

                // 觸發登錄事件
                this.triggerEvent('login', this.currentUser);
                this.triggerEvent('authChange', { authenticated: true, user: this.currentUser });

                return {
                    success: true,
                    user: this.currentUser,
                    message: '註冊成功'
                };
            } else {
                throw new APIError(response.error || '註冊失敗', response.details);
            }

        } catch (error) {
            console.error('Registration failed:', error);

            if (error instanceof ValidationError) {
                throw error;
            } else if (error instanceof APIError) {
                throw error;
            } else if (error.name === 'NetworkError') {
                throw new NetworkError('網絡連接失敗，請檢查網絡連接');
            } else {
                throw new Error('註冊過程中發生未知錯誤');
            }
        } finally {
            this.setLoadingState(false);
        }
    }

    // 用戶登錄
    async login(identifier, password, rememberMe = false) {
        try {
            // 基本驗證
            if (!identifier || !password) {
                throw new ValidationError('請填寫完整的登錄信息');
            }

            this.setLoadingState(true);

            const response = await this.api.request('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    identifier: identifier.trim(),
                    password: password,
                    rememberMe: rememberMe
                })
            });

            if (response.success) {
                this.currentUser = response.data.user;
                this.token = response.data.accessToken;
                this.isAuthenticated = true;

                // 保存認證數據
                this.saveAuthData();

                // 觸發事件
                this.triggerEvent('login', this.currentUser);
                this.triggerEvent('authChange', { authenticated: true, user: this.currentUser });

                return {
                    success: true,
                    user: this.currentUser,
                    message: '登錄成功'
                };
            } else {
                throw new APIError(response.error || '登錄失敗');
            }

        } catch (error) {
            console.error('Login failed:', error);

            if (error instanceof APIError) {
                throw error;
            } else if (error.name === 'NetworkError') {
                throw new NetworkError('網絡連接失敗');
            } else {
                throw new Error('登錄過程中發生錯誤');
            }
        } finally {
            this.setLoadingState(false);
        }
    }

    // 用戶登出
    async logout() {
        try {
            // 調用後端登出API
            await this.api.request('/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

        } catch (error) {
            console.error('Logout API call failed:', error);
            // 即使API調用失敗，也要清除本地狀態
        } finally {
            // 清除本地認證狀態
            this.clearAuthData();

            // 觸發事件
            this.triggerEvent('logout');
            this.triggerEvent('authChange', { authenticated: false, user: null });
        }
    }

    // 檢查認證狀態
    async checkAuthStatus() {
        try {
            const response = await this.api.request('/auth/status', {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (response.success && response.data.authenticated) {
                this.currentUser = response.data.user;
                this.isAuthenticated = true;
                this.saveAuthData();

                this.triggerEvent('authChange', { authenticated: true, user: this.currentUser });
                return true;
            } else {
                this.clearAuthData();
                this.triggerEvent('authChange', { authenticated: false, user: null });
                return false;
            }

        } catch (error) {
            console.error('Auth status check failed:', error);
            this.clearAuthData();
            return false;
        }
    }

    // 獲取當前用戶
    getCurrentUser() {
        return this.currentUser;
    }

    // 檢查是否已認證
    isUserAuthenticated() {
        return this.isAuthenticated && this.currentUser !== null;
    }

    // 獲取認證token
    getToken() {
        return this.token;
    }

    // 註冊數據驗證
    validateRegistrationData(data) {
        const errors = [];

        // 用戶名驗證
        if (!data.username || data.username.trim().length < 3) {
            errors.push('用戶名長度至少3個字符');
        } else if (data.username.trim().length > 30) {
            errors.push('用戶名長度不能超過30個字符');
        } else if (!/^[a-zA-Z0-9_-]+$/.test(data.username.trim())) {
            errors.push('用戶名只能包含字母、數字、下劃線和連字符');
        }

        // 郵箱驗證
        if (!data.email || !this.isValidEmail(data.email)) {
            errors.push('請輸入有效的郵箱地址');
        }

        // 密碼驗證
        if (!data.password || data.password.length < 8) {
            errors.push('密碼長度至少8個字符');
        } else if (data.password.length > 128) {
            errors.push('密碼長度不能超過128個字符');
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.password)) {
            errors.push('密碼必須包含大小寫字母和數字');
        }

        // 密碼確認
        if (data.password !== data.confirmPassword) {
            errors.push('密碼確認不匹配');
        }

        // 服務條款
        if (!data.agreeTerms) {
            errors.push('請同意服務條款和隱私政策');
        }

        return errors;
    }

    // 郵箱格式驗證
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // 保存認證數據
    saveAuthData() {
        if (typeof StorageService !== 'undefined') {
            const storage = new StorageService();
            storage.set('isAuthenticated', 'true');
            storage.set('currentUser', JSON.stringify(this.currentUser));
            storage.set('authToken', this.token);
        } else {
            localStorage.setItem('isAuthenticated', 'true');
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            localStorage.setItem('authToken', this.token);
        }
    }

    // 清除認證數據
    clearAuthData() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.token = null;

        if (typeof StorageService !== 'undefined') {
            const storage = new StorageService();
            storage.remove('isAuthenticated');
            storage.remove('currentUser');
            storage.remove('authToken');
        } else {
            localStorage.removeItem('isAuthenticated');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('authToken');
        }
    }

    // 設置載入狀態
    setLoadingState(isLoading) {
        // 可以在這裡觸發全局載入狀態變化事件
        document.dispatchEvent(new CustomEvent('authLoading', {
            detail: { isLoading }
        }));
    }

    // 事件監聽器管理
    addEventListener(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        }
    }

    removeEventListener(event, callback) {
        if (this.eventListeners[event]) {
            const index = this.eventListeners[event].indexOf(callback);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }
    }

    triggerEvent(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} event listener:`, error);
                }
            });
        }
    }
}

// 自定義錯誤類
class ValidationError extends Error {
    constructor(message, details = []) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
    }
}

class APIError extends Error {
    constructor(message, details = []) {
        super(message);
        this.name = 'APIError';
        this.details = details;
    }
}

class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NetworkError';
    }
}

// 如果在瀏覽器環境中，將服務添加到window對象
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
    window.ValidationError = ValidationError;
    window.APIError = APIError;
    window.NetworkError = NetworkError;
}