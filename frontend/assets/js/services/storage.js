class StorageService {
    constructor(options = {}) {
        this.options = {
            prefix: 'elite_chat_',
            defaultStorage: 'localStorage', // localStorage, sessionStorage, indexedDB
            enableEncryption: false,
            encryptionKey: 'elite_chat_key',
            enableCompression: false,
            maxLocalStorageSize: 5 * 1024 * 1024, // 5MB
            ...options
        };

        this.storageAvailable = {
            localStorage: this.isStorageAvailable('localStorage'),
            sessionStorage: this.isStorageAvailable('sessionStorage'),
            indexedDB: this.isIndexedDBAvailable()
        };

        this.db = null;
        this.initializeIndexedDB();
    }

    // 檢查儲存是否可用
    isStorageAvailable(type) {
        try {
            const storage = window[type];
            const testKey = '__storage_test__';
            storage.setItem(testKey, 'test');
            storage.removeItem(testKey);
            return true;
        } catch (error) {
            return false;
        }
    }

    isIndexedDBAvailable() {
        return 'indexedDB' in window;
    }

    // 初始化 IndexedDB
    async initializeIndexedDB() {
        if (!this.storageAvailable.indexedDB) return;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('EliteChatDB', 1);

            request.onerror = () => {
                console.warn('IndexedDB 初始化失敗');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 創建對象存儲
                if (!db.objectStoreNames.contains('keyValue')) {
                    const store = db.createObjectStore('keyValue', { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains('cache')) {
                    const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
                    cacheStore.createIndex('expiry', 'expiry', { unique: false });
                }
            };
        });
    }

    // 主要 API 方法
    async set(key, value, options = {}) {
        const fullKey = this.getFullKey(key);
        const storageType = options.storage || this.options.defaultStorage;
        const ttl = options.ttl; // 生存時間（毫秒）

        const data = {
            value,
            timestamp: Date.now(),
            ttl: ttl || null,
            expiry: ttl ? Date.now() + ttl : null
        };

        try {
            switch (storageType) {
                case 'localStorage':
                    return this.setLocalStorage(fullKey, data);
                case 'sessionStorage':
                    return this.setSessionStorage(fullKey, data);
                case 'indexedDB':
                    return this.setIndexedDB(fullKey, data);
                default:
                    throw new Error(`不支援的儲存類型: ${storageType}`);
            }
        } catch (error) {
            console.error('儲存資料失敗:', error);
            throw error;
        }
    }

    async get(key, options = {}) {
        const fullKey = this.getFullKey(key);
        const storageType = options.storage || this.options.defaultStorage;
        const defaultValue = options.default;

        try {
            let data;

            switch (storageType) {
                case 'localStorage':
                    data = this.getLocalStorage(fullKey);
                    break;
                case 'sessionStorage':
                    data = this.getSessionStorage(fullKey);
                    break;
                case 'indexedDB':
                    data = await this.getIndexedDB(fullKey);
                    break;
                default:
                    throw new Error(`不支援的儲存類型: ${storageType}`);
            }

            if (data === null) {
                return defaultValue;
            }

            // 檢查是否過期
            if (data.expiry && Date.now() > data.expiry) {
                await this.remove(key, { storage: storageType });
                return defaultValue;
            }

            return data.value;
        } catch (error) {
            console.error('讀取資料失敗:', error);
            return defaultValue;
        }
    }

    async remove(key, options = {}) {
        const fullKey = this.getFullKey(key);
        const storageType = options.storage || this.options.defaultStorage;

        try {
            switch (storageType) {
                case 'localStorage':
                    return this.removeLocalStorage(fullKey);
                case 'sessionStorage':
                    return this.removeSessionStorage(fullKey);
                case 'indexedDB':
                    return this.removeIndexedDB(fullKey);
                default:
                    throw new Error(`不支援的儲存類型: ${storageType}`);
            }
        } catch (error) {
            console.error('移除資料失敗:', error);
            throw error;
        }
    }

    async clear(options = {}) {
        const storageType = options.storage || this.options.defaultStorage;

        try {
            switch (storageType) {
                case 'localStorage':
                    return this.clearLocalStorage();
                case 'sessionStorage':
                    return this.clearSessionStorage();
                case 'indexedDB':
                    return this.clearIndexedDB();
                default:
                    throw new Error(`不支援的儲存類型: ${storageType}`);
            }
        } catch (error) {
            console.error('清除資料失敗:', error);
            throw error;
        }
    }

    // LocalStorage 操作
    setLocalStorage(key, data) {
        if (!this.storageAvailable.localStorage) {
            throw new Error('LocalStorage 不可用');
        }

        let serialized = this.serialize(data);

        // 檢查大小限制
        if (serialized.length > this.options.maxLocalStorageSize) {
            throw new Error('資料大小超過 LocalStorage 限制');
        }

        localStorage.setItem(key, serialized);
        return true;
    }

    getLocalStorage(key) {
        if (!this.storageAvailable.localStorage) {
            return null;
        }

        const serialized = localStorage.getItem(key);
        if (serialized === null) {
            return null;
        }

        return this.deserialize(serialized);
    }

    removeLocalStorage(key) {
        if (!this.storageAvailable.localStorage) {
            return false;
        }

        localStorage.removeItem(key);
        return true;
    }

    clearLocalStorage() {
        if (!this.storageAvailable.localStorage) {
            return false;
        }

        // 只清除有前綴的項目
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.options.prefix)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));
        return true;
    }

    // SessionStorage 操作
    setSessionStorage(key, data) {
        if (!this.storageAvailable.sessionStorage) {
            throw new Error('SessionStorage 不可用');
        }

        const serialized = this.serialize(data);
        sessionStorage.setItem(key, serialized);
        return true;
    }

    getSessionStorage(key) {
        if (!this.storageAvailable.sessionStorage) {
            return null;
        }

        const serialized = sessionStorage.getItem(key);
        if (serialized === null) {
            return null;
        }

        return this.deserialize(serialized);
    }

    removeSessionStorage(key) {
        if (!this.storageAvailable.sessionStorage) {
            return false;
        }

        sessionStorage.removeItem(key);
        return true;
    }

    clearSessionStorage() {
        if (!this.storageAvailable.sessionStorage) {
            return false;
        }

        // 只清除有前綴的項目
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(this.options.prefix)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => sessionStorage.removeItem(key));
        return true;
    }

    // IndexedDB 操作
    async setIndexedDB(key, data) {
        if (!this.db) {
            throw new Error('IndexedDB 不可用');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['keyValue'], 'readwrite');
            const store = transaction.objectStore('keyValue');

            const request = store.put({
                key,
                ...data
            });

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async getIndexedDB(key) {
        if (!this.db) {
            return null;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['keyValue'], 'readonly');
            const store = transaction.objectStore('keyValue');

            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    resolve({
                        value: result.value,
                        timestamp: result.timestamp,
                        ttl: result.ttl,
                        expiry: result.expiry
                    });
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    async removeIndexedDB(key) {
        if (!this.db) {
            return false;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['keyValue'], 'readwrite');
            const store = transaction.objectStore('keyValue');

            const request = store.delete(key);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async clearIndexedDB() {
        if (!this.db) {
            return false;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['keyValue'], 'readwrite');
            const store = transaction.objectStore('keyValue');

            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // 序列化和反序列化
    serialize(data) {
        try {
            let serialized = JSON.stringify(data);

            if (this.options.enableCompression) {
                serialized = this.compress(serialized);
            }

            if (this.options.enableEncryption) {
                serialized = this.encrypt(serialized);
            }

            return serialized;
        } catch (error) {
            console.error('序列化失敗:', error);
            throw error;
        }
    }

    deserialize(serialized) {
        try {
            if (this.options.enableEncryption) {
                serialized = this.decrypt(serialized);
            }

            if (this.options.enableCompression) {
                serialized = this.decompress(serialized);
            }

            return JSON.parse(serialized);
        } catch (error) {
            console.error('反序列化失敗:', error);
            throw error;
        }
    }

    // 加密和解密（簡單實現，實際使用建議使用專業加密庫）
    encrypt(text) {
        // 這裡使用簡單的 Base64 編碼作為示例
        // 實際應用中應該使用真正的加密算法
        return btoa(unescape(encodeURIComponent(text)));
    }

    decrypt(encrypted) {
        try {
            return decodeURIComponent(escape(atob(encrypted)));
        } catch (error) {
            throw new Error('解密失敗');
        }
    }

    // 壓縮和解壓縮（簡單實現）
    compress(text) {
        // 這裡可以實現 LZ 壓縮算法
        // 為了簡化，這裡只是返回原文
        return text;
    }

    decompress(compressed) {
        // 對應的解壓縮實現
        return compressed;
    }

    // 工具方法
    getFullKey(key) {
        return `${this.options.prefix}${key}`;
    }

    // 高級功能
    async exists(key, options = {}) {
        const value = await this.get(key, { ...options, default: undefined });
        return value !== undefined;
    }

    async keys(options = {}) {
        const storageType = options.storage || this.options.defaultStorage;
        const pattern = options.pattern;

        try {
            let keys = [];

            switch (storageType) {
                case 'localStorage':
                    keys = this.getLocalStorageKeys();
                    break;
                case 'sessionStorage':
                    keys = this.getSessionStorageKeys();
                    break;
                case 'indexedDB':
                    keys = await this.getIndexedDBKeys();
                    break;
                default:
                    throw new Error(`不支援的儲存類型: ${storageType}`);
            }

            // 移除前綴
            keys = keys.map(key => key.replace(this.options.prefix, ''));

            // 應用模式過濾
            if (pattern) {
                const regex = new RegExp(pattern);
                keys = keys.filter(key => regex.test(key));
            }

            return keys;
        } catch (error) {
            console.error('獲取鍵列表失敗:', error);
            return [];
        }
    }

    getLocalStorageKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.options.prefix)) {
                keys.push(key);
            }
        }
        return keys;
    }

    getSessionStorageKeys() {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(this.options.prefix)) {
                keys.push(key);
            }
        }
        return keys;
    }

    async getIndexedDBKeys() {
        if (!this.db) {
            return [];
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['keyValue'], 'readonly');
            const store = transaction.objectStore('keyValue');
            const request = store.getAllKeys();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async size(options = {}) {
        const storageType = options.storage || this.options.defaultStorage;

        try {
            switch (storageType) {
                case 'localStorage':
                    return this.getLocalStorageSize();
                case 'sessionStorage':
                    return this.getSessionStorageSize();
                case 'indexedDB':
                    return this.getIndexedDBSize();
                default:
                    throw new Error(`不支援的儲存類型: ${storageType}`);
            }
        } catch (error) {
            console.error('獲取儲存大小失敗:', error);
            return 0;
        }
    }

    getLocalStorageSize() {
        let size = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.options.prefix)) {
                const value = localStorage.getItem(key);
                size += key.length + (value ? value.length : 0);
            }
        }
        return size;
    }

    getSessionStorageSize() {
        let size = 0;
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(this.options.prefix)) {
                const value = sessionStorage.getItem(key);
                size += key.length + (value ? value.length : 0);
            }
        }
        return size;
    }

    async getIndexedDBSize() {
        // IndexedDB 大小計算比較複雜，這裡返回記錄數量
        const keys = await this.getIndexedDBKeys();
        return keys.length;
    }

    // 批量操作
    async setMultiple(items, options = {}) {
        const results = {};

        for (const [key, value] of Object.entries(items)) {
            try {
                await this.set(key, value, options);
                results[key] = { success: true };
            } catch (error) {
                results[key] = { success: false, error: error.message };
            }
        }

        return results;
    }

    async getMultiple(keys, options = {}) {
        const results = {};

        for (const key of keys) {
            try {
                results[key] = await this.get(key, options);
            } catch (error) {
                results[key] = options.default;
            }
        }

        return results;
    }

    async removeMultiple(keys, options = {}) {
        const results = {};

        for (const key of keys) {
            try {
                await this.remove(key, options);
                results[key] = { success: true };
            } catch (error) {
                results[key] = { success: false, error: error.message };
            }
        }

        return results;
    }

    // 快取功能
    async cache(key, factory, options = {}) {
        const ttl = options.ttl || 3600000; // 預設 1 小時
        const forceRefresh = options.forceRefresh || false;

        if (!forceRefresh) {
            const cached = await this.get(key, { storage: 'indexedDB' });
            if (cached !== undefined) {
                return cached;
            }
        }

        try {
            const value = await factory();
            await this.set(key, value, { storage: 'indexedDB', ttl });
            return value;
        } catch (error) {
            console.error('快取工廠函數執行失敗:', error);
            throw error;
        }
    }

    async clearExpired(options = {}) {
        const storageType = options.storage || 'indexedDB';

        if (storageType !== 'indexedDB' || !this.db) {
            return 0;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['keyValue'], 'readwrite');
            const store = transaction.objectStore('keyValue');
            const index = store.index('expiry');

            const range = IDBKeyRange.upperBound(Date.now());
            const request = index.openCursor(range);

            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                } else {
                    resolve(deletedCount);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // 儲存統計
    async getStats() {
        const stats = {
            localStorage: {
                available: this.storageAvailable.localStorage,
                size: 0,
                count: 0
            },
            sessionStorage: {
                available: this.storageAvailable.sessionStorage,
                size: 0,
                count: 0
            },
            indexedDB: {
                available: this.storageAvailable.indexedDB,
                size: 0,
                count: 0
            }
        };

        try {
            if (this.storageAvailable.localStorage) {
                stats.localStorage.keys = await this.keys({ storage: 'localStorage' });
                stats.localStorage.count = stats.localStorage.keys.length;
                stats.localStorage.size = this.getLocalStorageSize();
            }

            if (this.storageAvailable.sessionStorage) {
                stats.sessionStorage.keys = await this.keys({ storage: 'sessionStorage' });
                stats.sessionStorage.count = stats.sessionStorage.keys.length;
                stats.sessionStorage.size = this.getSessionStorageSize();
            }

            if (this.storageAvailable.indexedDB) {
                stats.indexedDB.keys = await this.keys({ storage: 'indexedDB' });
                stats.indexedDB.count = stats.indexedDB.keys.length;
                stats.indexedDB.size = await this.getIndexedDBSize();
            }
        } catch (error) {
            console.error('獲取儲存統計失敗:', error);
        }

        return stats;
    }

    // 資料遷移
    async migrate(oldPrefix, newPrefix) {
        const oldKeys = [];

        // 從 localStorage 遷移
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(oldPrefix)) {
                oldKeys.push({ storage: 'localStorage', key });
            }
        }

        // 從 sessionStorage 遷移
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(oldPrefix)) {
                oldKeys.push({ storage: 'sessionStorage', key });
            }
        }

        let migratedCount = 0;

        for (const { storage, key } of oldKeys) {
            try {
                const data = storage === 'localStorage'
                    ? this.getLocalStorage(key)
                    : this.getSessionStorage(key);

                if (data) {
                    const newKey = key.replace(oldPrefix, newPrefix);

                    if (storage === 'localStorage') {
                        localStorage.setItem(newKey, this.serialize(data));
                        localStorage.removeItem(key);
                    } else {
                        sessionStorage.setItem(newKey, this.serialize(data));
                        sessionStorage.removeItem(key);
                    }

                    migratedCount++;
                }
            } catch (error) {
                console.error(`遷移鍵 ${key} 失敗:`, error);
            }
        }

        return migratedCount;
    }

    // 備份和還原
    async backup(options = {}) {
        const includeStorage = options.storage || ['localStorage', 'sessionStorage', 'indexedDB'];
        const backup = {
            timestamp: Date.now(),
            version: '1.0',
            data: {}
        };

        for (const storageType of includeStorage) {
            try {
                const keys = await this.keys({ storage: storageType });
                backup.data[storageType] = {};

                for (const key of keys) {
                    const value = await this.get(key, { storage: storageType });
                    backup.data[storageType][key] = value;
                }
            } catch (error) {
                console.error(`備份 ${storageType} 失敗:`, error);
            }
        }

        return backup;
    }

    async restore(backup, options = {}) {
        const overwrite = options.overwrite || false;
        let restoredCount = 0;

        for (const [storageType, data] of Object.entries(backup.data)) {
            for (const [key, value] of Object.entries(data)) {
                try {
                    const exists = await this.exists(key, { storage: storageType });

                    if (!exists || overwrite) {
                        await this.set(key, value, { storage: storageType });
                        restoredCount++;
                    }
                } catch (error) {
                    console.error(`還原 ${storageType}:${key} 失敗:`, error);
                }
            }
        }

        return restoredCount;
    }

    // 監聽儲存變化
    onStorageChange(callback) {
        const handler = (event) => {
            if (event.key && event.key.startsWith(this.options.prefix)) {
                const key = event.key.replace(this.options.prefix, '');
                callback({
                    key,
                    oldValue: event.oldValue ? this.deserialize(event.oldValue) : null,
                    newValue: event.newValue ? this.deserialize(event.newValue) : null,
                    storageType: event.storageArea === localStorage ? 'localStorage' : 'sessionStorage'
                });
            }
        };

        window.addEventListener('storage', handler);

        return () => {
            window.removeEventListener('storage', handler);
        };
    }

    // 銷毀方法
    destroy() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// 創建預設實例
const storage = new StorageService();

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageService, storage };
} else {
    window.StorageService = StorageService;
    window.storage = storage;
}