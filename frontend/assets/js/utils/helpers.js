export const timeHelpers = {
    /**
     * 格式化時間戳
     * @param {number|Date} timestamp - 時間戳或 Date 對象
     * @param {string} format - 格式類型
     * @returns {string}
     */
    formatTime(timestamp, format = 'chat') {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        switch (format) {
            case 'chat':
                return this.formatChatTime(date, now, diff);
            case 'full':
                return date.toLocaleString('zh-TW');
            case 'date':
                return date.toLocaleDateString('zh-TW');
            case 'time':
                return date.toLocaleTimeString('zh-TW', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            case 'relative':
                return this.formatRelativeTime(diff);
            default:
                return date.toLocaleString('zh-TW');
        }
    },

    /**
     * 聊天專用時間格式
     */
    formatChatTime(date, now, diff) {
        const oneMinute = 60 * 1000;
        const oneHour = 60 * oneMinute;
        const oneDay = 24 * oneHour;
        const oneWeek = 7 * oneDay;

        if (diff < oneMinute) {
            return '剛剛';
        } else if (diff < oneHour) {
            return `${Math.floor(diff / oneMinute)} 分鐘前`;
        } else if (date.toDateString() === now.toDateString()) {
            // 今天
            return date.toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (diff < oneWeek) {
            // 一週內
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            const dayName = dayNames[date.getDay()];
            return `週${dayName} ${date.toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit'
            })}`;
        } else {
            // 更早
            return date.toLocaleDateString('zh-TW', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    },

    /**
     * 相對時間格式
     */
    formatRelativeTime(diff) {
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return '剛剛';
        if (minutes < 60) return `${minutes} 分鐘前`;
        if (hours < 24) return `${hours} 小時前`;
        if (days < 7) return `${days} 天前`;
        if (days < 30) return `${Math.floor(days / 7)} 週前`;
        if (days < 365) return `${Math.floor(days / 30)} 個月前`;
        return `${Math.floor(days / 365)} 年前`;
    },

    /**
     * 格式化持續時間
     * @param {number} duration - 持續時間（毫秒）
     * @returns {string}
     */
    formatDuration(duration) {
        const totalSeconds = Math.floor(duration / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },

    /**
     * 判斷是否為今天
     */
    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    },

    /**
     * 判斷是否為昨天
     */
    isYesterday(date) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return date.toDateString() === yesterday.toDateString();
    }
};

// 檔案處理函數
export const fileHelpers = {
    /**
     * 格式化檔案大小
     * @param {number} bytes - 位元組數
     * @param {number} decimals - 小數位數
     * @returns {string}
     */
    formatFileSize(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    /**
     * 獲取檔案擴展名
     */
    getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
    },

    /**
     * 獲取檔案名稱（不含擴展名）
     */
    getFileNameWithoutExtension(filename) {
        return filename.replace(/\.[^/.]+$/, '');
    },

    /**
     * 檢查檔案類型
     */
    getFileType(filename) {
        const ext = this.getFileExtension(filename).toLowerCase();

        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
        const videoExts = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'wmv'];
        const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'flac'];
        const documentExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
        const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];

        if (imageExts.includes(ext)) return 'image';
        if (videoExts.includes(ext)) return 'video';
        if (audioExts.includes(ext)) return 'audio';
        if (documentExts.includes(ext)) return 'document';
        if (archiveExts.includes(ext)) return 'archive';

        return 'other';
    },

    /**
     * 獲取檔案圖示
     */
    getFileIcon(filename) {
        const type = this.getFileType(filename);
        const ext = this.getFileExtension(filename).toLowerCase();

        const iconMap = {
            image: 'fas fa-image',
            video: 'fas fa-video',
            audio: 'fas fa-music',
            archive: 'fas fa-file-archive',
            pdf: 'fas fa-file-pdf',
            doc: 'fas fa-file-word',
            docx: 'fas fa-file-word',
            xls: 'fas fa-file-excel',
            xlsx: 'fas fa-file-excel',
            ppt: 'fas fa-file-powerpoint',
            pptx: 'fas fa-file-powerpoint',
            txt: 'fas fa-file-alt',
            csv: 'fas fa-file-csv'
        };

        return iconMap[ext] || iconMap[type] || 'fas fa-file';
    },

    /**
     * 驗證檔案類型
     */
    validateFileType(file, allowedTypes) {
        return allowedTypes.includes(file.type);
    },

    /**
     * 驗證檔案大小
     */
    validateFileSize(file, maxSize) {
        return file.size <= maxSize;
    },

    /**
     * 讀取檔案為 Base64
     */
    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    /**
     * 讀取檔案為文字
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    /**
     * 壓縮圖片
     */
    compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(resolve, file.type, quality);
            };

            img.src = URL.createObjectURL(file);
        });
    }
};

// 字串處理函數
export const stringHelpers = {
    /**
     * 截斷字串
     */
    truncate(str, length = 50, suffix = '...') {
        if (str.length <= length) return str;
        return str.substring(0, length - suffix.length) + suffix;
    },

    /**
     * 首字母大寫
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * 轉換為標題格式
     */
    toTitleCase(str) {
        return str.replace(/\w\S*/g, (txt) =>
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
    },

    /**
     * 移除 HTML 標籤
     */
    stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    },

    /**
     * 轉義 HTML 字符
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * 反轉義 HTML 字符
     */
    unescapeHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent;
    },

    /**
     * 生成隨機字串
     */
    generateRandomString(length = 10) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    /**
     * 生成 UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * 檢查是否為空字串
     */
    isEmpty(str) {
        return !str || str.trim().length === 0;
    },

    /**
     * 格式化訊息內容（處理 @mention、#hashtag 等）
     */
    formatMessageContent(content) {
        return content
            .replace(/@(\w+)/g, '<span class="mention">@$1</span>')
            .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    },

    /**
     * 提取提及的使用者
     */
    extractMentions(content) {
        const mentions = content.match(/@(\w+)/g);
        return mentions ? mentions.map(m => m.substring(1)) : [];
    },

    /**
     * 提取標籤
     */
    extractHashtags(content) {
        const hashtags = content.match(/#(\w+)/g);
        return hashtags ? hashtags.map(h => h.substring(1)) : [];
    }
};

// DOM 操作函數
export const domHelpers = {
    /**
     * 查詢元素
     */
    $(selector, context = document) {
        return context.querySelector(selector);
    },

    /**
     * 查詢多個元素
     */
    $({selector, context = document}) {
        return Array.from(context.querySelectorAll(selector));
    },
    /**
     * 添加類名
     */
    addClass(element, className) {
        if (element) {
            element.classList.add(className);
        }
    },

    /**
     * 移除類名
     */
    removeClass(element, className) {
        if (element) {
            element.classList.remove(className);
        }
    },

    /**
     * 切換類名
     */
    toggleClass(element, className) {
        if (element) {
            element.classList.toggle(className);
        }
    },

    /**
     * 檢查是否有類名
     */
    hasClass(element, className) {
        return element ? element.classList.contains(className) : false;
    },

    /**
     * 設置屬性
     */
    attr(element, name, value) {
        if (!element) return;

        if (value === undefined) {
            return element.getAttribute(name);
        }

        element.setAttribute(name, value);
    },

    /**
     * 移除屬性
     */
    removeAttr(element, name) {
        if (element) {
            element.removeAttribute(name);
        }
    },

    /**
     * 獲取/設置文字內容
     */
    text(element, content) {
        if (!element) return '';

        if (content === undefined) {
            return element.textContent;
        }

        element.textContent = content;
    },

    /**
     * 獲取/設置 HTML 內容
     */
    html(element, content) {
        if (!element) return '';

        if (content === undefined) {
            return element.innerHTML;
        }

        element.innerHTML = content;
    },

    /**
     * 顯示元素
     */
    show(element) {
        if (element) {
            element.style.display = '';
            element.classList.remove('hidden');
        }
    },

    /**
     * 隱藏元素
     */
    hide(element) {
        if (element) {
            element.style.display = 'none';
            element.classList.add('hidden');
        }
    },

    /**
     * 切換顯示/隱藏
     */
    toggle(element) {
        if (!element) return;

        if (element.style.display === 'none' || element.classList.contains('hidden')) {
            this.show(element);
        } else {
            this.hide(element);
        }
    },

    /**
     * 滾動到元素
     */
    scrollTo(element, options = {}) {
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                ...options
            });
        }
    },

    /**
     * 獲取元素位置
     */
    getOffset(element) {
        if (!element) return { top: 0, left: 0 };

        const rect = element.getBoundingClientRect();
        return {
            top: rect.top + window.pageYOffset,
            left: rect.left + window.pageXOffset,
            width: rect.width,
            height: rect.height
        };
    },

    /**
     * 檢查元素是否在視窗內
     */
    isInViewport(element) {
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
};

// 陣列處理函數
export const arrayHelpers = {
    /**
     * 去重
     */
    unique(array) {
        return [...new Set(array)];
    },

    /**
     * 根據屬性去重
     */
    uniqueBy(array, key) {
        const seen = new Set();
        return array.filter(item => {
            const value = typeof key === 'function' ? key(item) : item[key];
            if (seen.has(value)) {
                return false;
            }
            seen.add(value);
            return true;
        });
    },

    /**
     * 分組
     */
    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const value = typeof key === 'function' ? key(item) : item[key];
            (groups[value] = groups[value] || []).push(item);
            return groups;
        }, {});
    },

    /**
     * 排序
     */
    sortBy(array, key, order = 'asc') {
        return [...array].sort((a, b) => {
            const valueA = typeof key === 'function' ? key(a) : a[key];
            const valueB = typeof key === 'function' ? key(b) : b[key];

            if (order === 'desc') {
                return valueB > valueA ? 1 : valueB < valueA ? -1 : 0;
            }
            return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
        });
    },

    /**
     * 分塊
     */
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    /**
     * 扁平化
     */
    flatten(array) {
        return array.reduce((flat, item) =>
            flat.concat(Array.isArray(item) ? this.flatten(item) : item), []);
    },

    /**
     * 隨機打亂
     */
    shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    /**
     * 隨機選擇
     */
    sample(array, count = 1) {
        const shuffled = this.shuffle(array);
        return count === 1 ? shuffled[0] : shuffled.slice(0, count);
    }
};

// 物件處理函數
export const objectHelpers = {
    /**
     * 深拷貝
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key]);
            });
            return cloned;
        }
    },

    /**
     * 深度合併
     */
    deepMerge(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();

        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return this.deepMerge(target, ...sources);
    },

    /**
     * 檢查是否為物件
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    },

    /**
     * 檢查是否為空物件
     */
    isEmpty(obj) {
        return Object.keys(obj).length === 0;
    },

    /**
     * 獲取巢狀屬性
     */
    get(obj, path, defaultValue) {
        const keys = path.split('.');
        let result = obj;

        for (const key of keys) {
            if (result == null || typeof result !== 'object') {
                return defaultValue;
            }
            result = result[key];
        }

        return result === undefined ? defaultValue : result;
    },

    /**
     * 設置巢狀屬性
     */
    set(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = obj;

        for (const key of keys) {
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        current[lastKey] = value;
        return obj;
    },

    /**
     * 選擇指定屬性
     */
    pick(obj, keys) {
        const result = {};
        keys.forEach(key => {
            if (key in obj) {
                result[key] = obj[key];
            }
        });
        return result;
    },

    /**
     * 排除指定屬性
     */
    omit(obj, keys) {
        const result = { ...obj };
        keys.forEach(key => delete result[key]);
        return result;
    }
};

// 驗證函數
export const validationHelpers = {
    /**
     * 驗證郵箱
     */
    isEmail(email) {
        return REGEX_PATTERNS.EMAIL.test(email);
    },

    /**
     * 驗證用戶名
     */
    isUsername(username) {
        return REGEX_PATTERNS.USERNAME.test(username);
    },

    /**
     * 驗證密碼強度
     */
    validatePassword(password) {
        return {
            length: password.length >= 8,
            lowercase: /[a-z]/.test(password),
            uppercase: /[A-Z]/.test(password),
            number: /\d/.test(password),
            special: /[@$!%*?&]/.test(password)
        };
    },

    /**
     * 驗證手機號碼
     */
    isPhone(phone) {
        return REGEX_PATTERNS.PHONE.test(phone);
    },

    /**
     * 驗證 URL
     */
    isUrl(url) {
        return REGEX_PATTERNS.URL.test(url);
    },

    /**
     * 驗證是否為數字
     */
    isNumber(value) {
        return !isNaN(value) && !isNaN(parseFloat(value));
    },

    /**
     * 驗證是否為整數
     */
    isInteger(value) {
        return Number.isInteger(Number(value));
    },

    /**
     * 驗證範圍
     */
    inRange(value, min, max) {
        const num = Number(value);
        return num >= min && num <= max;
    }
};

// 設備檢測函數
export const deviceHelpers = {
    /**
     * 檢查是否為行動設備
     */
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    /**
     * 檢查是否為平板
     */
    isTablet() {
        return /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)|Android(?=.*\bTablet\b)/i.test(navigator.userAgent);
    },

    /**
     * 檢查是否為桌面
     */
    isDesktop() {
        return !this.isMobile() && !this.isTablet();
    },

    /**
     * 檢查是否為 iOS
     */
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    },

    /**
     * 檢查是否為 Android
     */
    isAndroid() {
        return /Android/.test(navigator.userAgent);
    },

    /**
     * 獲取視窗大小
     */
    getViewportSize() {
        return {
            width: window.innerWidth || document.documentElement.clientWidth,
            height: window.innerHeight || document.documentElement.clientHeight
        };
    },

    /**
     * 檢查是否支援觸控
     */
    isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
};

// 顏色處理函數
export const colorHelpers = {
    /**
     * 十六進位轉 RGB
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    /**
     * RGB 轉十六進位
     */
    rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    },

    /**
     * 獲取隨機顏色
     */
    getRandomColor() {
        return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    },

    /**
     * 根據字串生成顏色
     */
    getColorFromString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - color.length) + color;
    }
};

// 如果在 CommonJS 環境中
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        timeHelpers,
        fileHelpers,
        stringHelpers,
        domHelpers,
        arrayHelpers,
        objectHelpers,
        validationHelpers,
        deviceHelpers,
        colorHelpers
    };
} else {
    // 在 Node.js 環境下，選擇將其導出為模塊
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            timeHelpers,
            fileHelpers,
            stringHelpers,
            domHelpers,
            arrayHelpers,
            objectHelpers,
            validationHelpers,
            deviceHelpers,
            colorHelpers
        };
    }
}