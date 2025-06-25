const crypto = require('crypto');
const path = require('path');

class Helpers {
    // 生成唯一ID
    static generateId(prefix = '') {
        const timestamp = Date.now().toString(36);
        const randomPart = crypto.randomBytes(4).toString('hex');
        return prefix ? `${prefix}_${timestamp}_${randomPart}` : `${timestamp}_${randomPart}`;
    }

    // 格式化日期時間
    static formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
        const d = new Date(date);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }

    // 相對時間格式化
    static formatRelativeTime(date) {
        const now = new Date();
        const target = new Date(date);
        const diffMs = now - target;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) {
            return '剛剛';
        } else if (diffMins < 60) {
            return `${diffMins}分鐘前`;
        } else if (diffHours < 24) {
            return `${diffHours}小時前`;
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else {
            return Helpers.formatDateTime(date, 'MM-DD');
        }
    }

    // 格式化文件大小
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 截取文本
    static truncateText(text, maxLength = 100, suffix = '...') {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - suffix.length) + suffix;
    }

    // 轉義HTML
    static escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // 去除HTML標籤
    static stripHtmlTags(html) {
        return html.replace(/<[^>]*>/g, '');
    }

    // 生成隨機字符串
    static randomString(length = 8, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    }

    // 生成隨機數字
    static randomNumber(min = 0, max = 100) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 深度克隆對象
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => Helpers.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = Helpers.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    // 對象合併
    static mergeObjects(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();

        if (Helpers.isObject(target) && Helpers.isObject(source)) {
            for (const key in source) {
                if (Helpers.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    Helpers.mergeObjects(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return Helpers.mergeObjects(target, ...sources);
    }

    // 檢查是否為對象
    static isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    // 檢查是否為空值
    static isEmpty(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }

    // 數組去重
    static uniqueArray(arr, key = null) {
        if (!Array.isArray(arr)) return [];

        if (key) {
            const seen = new Set();
            return arr.filter(item => {
                const val = item[key];
                if (seen.has(val)) {
                    return false;
                } else {
                    seen.add(val);
                    return true;
                }
            });
        } else {
            return [...new Set(arr)];
        }
    }

    // 分組數組
    static groupBy(arr, key) {
        if (!Array.isArray(arr)) return {};

        return arr.reduce((groups, item) => {
            const group = typeof key === 'function' ? key(item) : item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    }

    // 排序對象數組
    static sortBy(arr, key, direction = 'asc') {
        if (!Array.isArray(arr)) return [];

        return arr.sort((a, b) => {
            const aVal = typeof key === 'function' ? key(a) : a[key];
            const bVal = typeof key === 'function' ? key(b) : b[key];

            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // 分頁計算
    static pagination(page, limit, total) {
        const currentPage = Math.max(1, parseInt(page) || 1);
        const pageSize = Math.max(1, parseInt(limit) || 10);
        const totalItems = parseInt(total) || 0;
        const totalPages = Math.ceil(totalItems / pageSize);
        const offset = (currentPage - 1) * pageSize;

        return {
            page: currentPage,
            limit: pageSize,
            total: totalItems,
            pages: totalPages,
            offset,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        };
    }

    // 延遲執行
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 重試機制
    static async retry(fn, maxAttempts = 3, delayMs = 1000) {
        let lastError;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (attempt < maxAttempts) {
                    await Helpers.delay(delayMs * attempt);
                }
            }
        }

        throw lastError;
    }

    // 節流函數
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // 防抖函數
    static debounce(func, delay) {
        let timeoutId;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(context, args), delay);
        };
    }

    // 生成顏色
    static generateColor(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
        }

        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 70%, 50%)`;
    }

    // 獲取文件擴展名
    static getFileExtension(filename) {
        return path.extname(filename).toLowerCase();
    }

    // 檢查文件類型
    static getFileType(mimetype) {
        if (mimetype.startsWith('image/')) return 'image';
        if (mimetype.startsWith('video/')) return 'video';
        if (mimetype.startsWith('audio/')) return 'audio';
        if (mimetype.includes('text')) return 'text';
        if (mimetype.includes('pdf')) return 'pdf';
        return 'file';
    }

    // 驗證郵箱格式
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // 驗證URL格式
    static isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    // 掩碼敏感信息
    static maskSensitiveData(str, visibleChars = 3) {
        if (!str || str.length <= visibleChars * 2) {
            return '*'.repeat(str?.length || 3);
        }

        const start = str.substring(0, visibleChars);
        const end = str.substring(str.length - visibleChars);
        const middle = '*'.repeat(Math.max(3, str.length - visibleChars * 2));

        return start + middle + end;
    }

    // 生成頭像URL
    static generateAvatarUrl(username, size = 128) {
        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}&size=${size}`;
    }

    // 計算字符串哈希
    static hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash;

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 轉換為32位整數
        }

        return Math.abs(hash).toString(36);
    }

    // 格式化數字
    static formatNumber(num, locale = 'zh-TW') {
        return new Intl.NumberFormat(locale).format(num);
    }

    // 獲取IP地址信息
    static extractIpInfo(req) {
        return {
            ip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.get('User-Agent') || 'Unknown',
            referer: req.get('Referer') || '',
            origin: req.get('Origin') || ''
        };
    }

    // 檢查是否為移動設備
    static isMobileDevice(userAgent) {
        const mobileRegex = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Opera Mini|IEMobile/i;
        return mobileRegex.test(userAgent);
    }

    // 生成隨機端口
    static generateRandomPort(min = 3000, max = 9999) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 清理文件名
    static sanitizeFilename(filename) {
        return filename
            .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_')
            .replace(/_{2,}/g, '_')
            .substring(0, 255);
    }

    // 批處理數組
    static batchProcess(array, batchSize, processor) {
        const results = [];
        for (let i = 0; i < array.length; i += batchSize) {
            const batch = array.slice(i, i + batchSize);
            results.push(processor(batch, i / batchSize));
        }
        return results;
    }

    // 異步批處理
    static async asyncBatchProcess(array, batchSize, asyncProcessor) {
        const results = [];
        for (let i = 0; i < array.length; i += batchSize) {
            const batch = array.slice(i, i + batchSize);
            const result = await asyncProcessor(batch, i / batchSize);
            results.push(result);
        }
        return results;
    }

    // 安全的JSON解析
    static safeJsonParse(str, defaultValue = null) {
        try {
            return JSON.parse(str);
        } catch {
            return defaultValue;
        }
    }

    // 安全的JSON字符串化
    static safeJsonStringify(obj, defaultValue = '{}') {
        try {
            return JSON.stringify(obj);
        } catch {
            return defaultValue;
        }
    }

    // 環境變量獲取
    static getEnv(key, defaultValue = null, type = 'string') {
        const value = process.env[key];

        if (value === undefined || value === null) {
            return defaultValue;
        }

        switch (type) {
            case 'number':
                return Number(value) || defaultValue;
            case 'boolean':
                return value.toLowerCase() === 'true';
            case 'array':
                return value.split(',').map(item => item.trim());
            default:
                return value;
        }
    }
}

module.exports = Helpers;