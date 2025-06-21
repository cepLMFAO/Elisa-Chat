class ApiService {
    constructor(options = {}) {
        this.options = {
            baseURL: options.baseURL || '/api',
            timeout: options.timeout || 30000,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            enableLogging: options.enableLogging || false,
            ...options
        };

        this.interceptors = {
            request: [],
            response: []
        };

        this.pendingRequests = new Map();
        this.requestId = 0;
    }

    // 添加請求攔截器
    addRequestInterceptor(interceptor) {
        this.interceptors.request.push(interceptor);
    }

    // 添加響應攔截器
    addResponseInterceptor(interceptor) {
        this.interceptors.response.push(interceptor);
    }

    // 主要請求方法
    async request(url, options = {}) {
        const requestId = ++this.requestId;

        try {
            // 準備請求配置
            const config = await this.prepareRequest(url, options);

            // 檢查重複請求
            if (this.shouldCancelDuplicateRequest(config)) {
                const existingRequest = this.findPendingRequest(config);
                if (existingRequest) {
                    return existingRequest.promise;
                }
            }

            // 創建請求 Promise
            const requestPromise = this.executeRequest(config, requestId);

            // 添加到待處理請求列表
            this.addPendingRequest(requestId, config, requestPromise);

            return await requestPromise;

        } catch (error) {
            this.logError('Request failed:', error);
            throw this.formatError(error);
        } finally {
            this.removePendingRequest(requestId);
        }
    }

    // 準備請求配置
    async prepareRequest(url, options) {
        let config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'include',
            ...options,
            url: this.buildURL(url, options.params)
        };

        // 應用請求攔截器
        for (const interceptor of this.interceptors.request) {
            config = await interceptor(config) || config;
        }

        return config;
    }

    // 執行請求
    async executeRequest(config, requestId) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.options.timeout);

        try {
            const fetchConfig = {
                method: config.method,
                headers: config.headers,
                credentials: config.credentials,
                signal: controller.signal
            };

            // 處理請求體
            if (config.data) {
                if (config.data instanceof FormData) {
                    fetchConfig.body = config.data;
                    // 移除 Content-Type，讓瀏覽器自動設置
                    delete fetchConfig.headers['Content-Type'];
                } else if (typeof config.data === 'object') {
                    fetchConfig.body = JSON.stringify(config.data);
                } else {
                    fetchConfig.body = config.data;
                }
            }

            this.logRequest(config);

            let response = await fetch(config.url, fetchConfig);
            clearTimeout(timeoutId);

            // 應用響應攔截器
            for (const interceptor of this.interceptors.response) {
                response = await interceptor(response, config) || response;
            }

            return await this.processResponse(response, config);

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new Error('請求超時');
            }

            // 重試邏輯
            if (this.shouldRetry(error, config)) {
                return this.retryRequest(config, requestId);
            }

            throw error;
        }
    }

    // 處理響應
    async processResponse(response, config) {
        this.logResponse(response, config);

        if (!response.ok) {
            const errorData = await this.extractErrorData(response);
            throw new ApiError(response.status, errorData.message || response.statusText, errorData);
        }

        return this.extractResponseData(response, config);
    }

    // 提取響應資料
    async extractResponseData(response, config) {
        const contentType = response.headers.get('content-type');

        if (config.responseType === 'blob') {
            return response.blob();
        }

        if (config.responseType === 'text') {
            return response.text();
        }

        if (config.responseType === 'stream') {
            return response.body;
        }

        if (contentType && contentType.includes('application/json')) {
            const text = await response.text();
            try {
                return text ? JSON.parse(text) : null;
            } catch (error) {
                console.warn('無法解析 JSON 響應:', text);
                return text;
            }
        }

        return response.text();
    }

    // 提取錯誤資料
    async extractErrorData(response) {
        try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return { message: await response.text() };
        } catch (error) {
            return { message: response.statusText };
        }
    }

    // 重試請求
    async retryRequest(config, requestId) {
        const retryCount = config.retryCount || 0;

        if (retryCount >= this.options.retryAttempts) {
            throw new Error(`請求失敗，已重試 ${this.options.retryAttempts} 次`);
        }

        // 等待重試延遲
        await this.delay(this.options.retryDelay * Math.pow(2, retryCount));

        config.retryCount = retryCount + 1;
        return this.executeRequest(config, requestId);
    }

    // 判斷是否應該重試
    shouldRetry(error, config) {
        if (config.retryCount >= this.options.retryAttempts) {
            return false;
        }

        // 網路錯誤或 5xx 錯誤才重試
        return error.name === 'TypeError' ||
            (error.status >= 500 && error.status < 600);
    }

    // 便捷方法
    async get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    }

    async post(url, data, options = {}) {
        return this.request(url, { ...options, method: 'POST', data });
    }

    async put(url, data, options = {}) {
        return this.request(url, { ...options, method: 'PUT', data });
    }

    async patch(url, data, options = {}) {
        return this.request(url, { ...options, method: 'PATCH', data });
    }

    async delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    }

    // 檔案上傳
    async upload(url, file, options = {}) {
        const formData = new FormData();

        if (file instanceof File) {
            formData.append(options.fieldName || 'file', file);
        } else if (file instanceof FileList) {
            Array.from(file).forEach((f, index) => {
                formData.append(`${options.fieldName || 'file'}[${index}]`, f);
            });
        } else if (Array.isArray(file)) {
            file.forEach((f, index) => {
                formData.append(`${options.fieldName || 'file'}[${index}]`, f);
            });
        }

        // 添加額外欄位
        if (options.fields) {
            Object.entries(options.fields).forEach(([key, value]) => {
                formData.append(key, value);
            });
        }

        return this.request(url, {
            ...options,
            method: 'POST',
            data: formData
        });
    }

    // 下載檔案
    async download(url, options = {}) {
        const response = await this.request(url, {
            ...options,
            responseType: 'blob'
        });

        // 創建下載連結
        const downloadUrl = URL.createObjectURL(response);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = options.filename || this.extractFilename(url);

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 清理資源
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);

        return response;
    }

    // 建構 URL
    buildURL(url, params) {
        const fullURL = url.startsWith('http') ? url : `${this.options.baseURL}${url}`;

        if (!params) return fullURL;

        const urlObj = new URL(fullURL, window.location.origin);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                urlObj.searchParams.append(key, value);
            }
        });

        return urlObj.toString();
    }

    // 重複請求檢查
    shouldCancelDuplicateRequest(config) {
        return config.cancelDuplicates !== false;
    }

    findPendingRequest(config) {
        const key = this.getRequestKey(config);
        return Array.from(this.pendingRequests.values())
            .find(req => this.getRequestKey(req.config) === key);
    }

    getRequestKey(config) {
        return `${config.method}:${config.url}:${JSON.stringify(config.data || {})}`;
    }

    addPendingRequest(id, config, promise) {
        this.pendingRequests.set(id, { config, promise });
    }

    removePendingRequest(id) {
        this.pendingRequests.delete(id);
    }

    // 取消所有待處理請求
    cancelAllRequests() {
        this.pendingRequests.clear();
    }

    // 工具方法
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    extractFilename(url) {
        const pathname = new URL(url, window.location.origin).pathname;
        return pathname.split('/').pop() || 'download';
    }

    formatError(error) {
        if (error instanceof ApiError) {
            return error;
        }

        return new ApiError(
            error.status || 0,
            error.message || '未知錯誤',
            error
        );
    }

    // 日誌方法
    logRequest(config) {
        if (!this.options.enableLogging) return;

        console.group(`🚀 API 請求: ${config.method} ${config.url}`);
        console.log('配置:', config);
        console.groupEnd();
    }

    logResponse(response, config) {
        if (!this.options.enableLogging) return;

        const status = response.ok ? '✅' : '❌';
        console.group(`${status} API 響應: ${config.method} ${config.url} (${response.status})`);
        console.log('響應:', response);
        console.groupEnd();
    }

    logError(message, error) {
        if (!this.options.enableLogging) return;

        console.group(`❌ API 錯誤: ${message}`);
        console.error(error);
        console.groupEnd();
    }

    // 設置認證 Token
    setAuthToken(token) {
        if (token) {
            this.addRequestInterceptor((config) => {
                config.headers.Authorization = `Bearer ${token}`;
                return config;
            });
        }
    }

    // 設置基礎 URL
    setBaseURL(baseURL) {
        this.options.baseURL = baseURL;
    }

    // 設置超時時間
    setTimeout(timeout) {
        this.options.timeout = timeout;
    }

    // 創建新實例
    create(options = {}) {
        return new ApiService({ ...this.options, ...options });
    }
}

// API 錯誤類
class ApiError extends Error {
    constructor(status, message, data = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }

    get isClientError() {
        return this.status >= 400 && this.status < 500;
    }

    get isServerError() {
        return this.status >= 500 && this.status < 600;
    }

    get isNetworkError() {
        return this.status === 0;
    }
}

// 請求建構器
class RequestBuilder {
    constructor(api, url) {
        this.api = api;
        this.config = { url };
    }

    method(method) {
        this.config.method = method;
        return this;
    }

    headers(headers) {
        this.config.headers = { ...this.config.headers, ...headers };
        return this;
    }

    params(params) {
        this.config.params = params;
        return this;
    }

    data(data) {
        this.config.data = data;
        return this;
    }

    timeout(timeout) {
        this.config.timeout = timeout;
        return this;
    }

    retry(attempts) {
        this.config.retryAttempts = attempts;
        return this;
    }

    responseType(type) {
        this.config.responseType = type;
        return this;
    }

    execute() {
        return this.api.request(this.config.url, this.config);
    }
}

// 預設 API 實例
const api = new ApiService();

// 添加常用的響應攔截器
api.addResponseInterceptor(async (response, config) => {
    // 處理認證錯誤
    if (response.status === 401) {
        // 觸發登出事件
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    return response;
});

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ApiService, ApiError, RequestBuilder, api };
} else {
    window.ApiService = ApiService;
    window.ApiError = ApiError;
    window.RequestBuilder = RequestBuilder;
    window.api = api;
}