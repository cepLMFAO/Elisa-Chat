const { SECURITY, UPLOAD } = require('../config/constants');

class Validators {
    // 用戶名驗證（改進版）
    static validateUsername(username) {
        const errors = [];

        if (!username) {
            errors.push('用戶名是必需的');
            return { isValid: false, errors };
        }

        if (typeof username !== 'string') {
            errors.push('用戶名必須是字符串');
            return { isValid: false, errors };
        }

        const trimmedUsername = username.trim();

        // 長度檢查
        if (trimmedUsername.length < (SECURITY.USERNAME_MIN_LENGTH || 3)) {
            errors.push(`用戶名長度至少需要 ${SECURITY.USERNAME_MIN_LENGTH || 3} 個字符`);
        }

        if (trimmedUsername.length > (SECURITY.USERNAME_MAX_LENGTH || 30)) {
            errors.push(`用戶名長度不能超過 ${SECURITY.USERNAME_MAX_LENGTH || 30} 個字符`);
        }

        // 字符格式檢查
        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(trimmedUsername)) {
            errors.push('用戶名只能包含字母、數字、底線和橫線');
        }

        // 不能以數字開頭
        if (/^\d/.test(trimmedUsername)) {
            errors.push('用戶名不能以數字開頭');
        }

        // 不能以特殊字符開頭或結尾
        if (/^[_-]/.test(trimmedUsername) || /[_-]$/.test(trimmedUsername)) {
            errors.push('用戶名不能以底線或橫線開頭或結尾');
        }

        // 不能包含連續的特殊字符
        if (/[_-]{2,}/.test(trimmedUsername)) {
            errors.push('用戶名不能包含連續的底線或橫線');
        }

        // 禁用的用戶名列表
        const forbiddenUsernames = [
            'admin', 'administrator', 'root', 'system', 'api', 'bot',
            'null', 'undefined', 'anonymous', 'guest', 'test', 'demo',
            'support', 'help', 'info', 'mail', 'email', 'noreply',
            'webmaster', 'hostmaster', 'postmaster', 'www', 'ftp',
            'staff', 'moderator', 'mod', 'operator', 'owner'
        ];

        if (forbiddenUsernames.includes(trimmedUsername.toLowerCase())) {
            errors.push('此用戶名不可用');
        }

        // 檢查是否包含敏感詞
        const sensitiveWords = ['fuck', 'shit', 'damn', 'nazi', 'hitler'];
        if (sensitiveWords.some(word => trimmedUsername.toLowerCase().includes(word))) {
            errors.push('用戶名包含不適當的內容');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedUsername
        };
    }

    // 郵箱驗證（改進版）
    static validateEmail(email) {
        const errors = [];

        if (!email) {
            errors.push('郵箱是必需的');
            return { isValid: false, errors };
        }

        if (typeof email !== 'string') {
            errors.push('郵箱必須是字符串');
            return { isValid: false, errors };
        }

        const trimmedEmail = email.trim().toLowerCase();

        // 長度檢查
        if (trimmedEmail.length > 320) {
            errors.push('郵箱地址過長');
        }

        // 基本格式檢查
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        if (!emailRegex.test(trimmedEmail)) {
            errors.push('郵箱格式不正確');
        } else {
            // 詳細檢查
            const [localPart, domainPart] = trimmedEmail.split('@');

            // 本地部分檢查
            if (localPart.length > 64) {
                errors.push('郵箱用戶名部分過長');
            }

            if (localPart.startsWith('.') || localPart.endsWith('.')) {
                errors.push('郵箱用戶名不能以點號開頭或結尾');
            }

            if (localPart.includes('..')) {
                errors.push('郵箱用戶名不能包含連續的點號');
            }

            // 域名部分檢查
            if (domainPart) {
                if (domainPart.length > 253) {
                    errors.push('郵箱域名過長');
                }

                // 檢查是否包含有效的TLD
                const tldRegex = /\.[a-zA-Z]{2,}$/;
                if (!tldRegex.test(domainPart)) {
                    errors.push('郵箱域名格式不正確');
                }

                // 檢查常見的拼寫錯誤
                const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
                const suspiciousDomains = ['gmial.com', 'yahooo.com', 'hotmial.com', 'outlok.com'];

                if (suspiciousDomains.includes(domainPart)) {
                    const suggestion = commonDomains.find(domain =>
                        this.calculateLevenshteinDistance(domainPart, domain) <= 2
                    );
                    if (suggestion) {
                        errors.push(`郵箱域名可能有誤，您是否想輸入 ${suggestion}？`);
                    }
                }
            }
        }

        // 檢查一次性郵箱域名
        const disposableEmailDomains = [
            '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
            'mailinator.com', 'throwaway.email', 'temp-mail.org'
        ];

        if (disposableEmailDomains.some(domain => trimmedEmail.endsWith(domain))) {
            errors.push('不允許使用一次性郵箱地址');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedEmail
        };
    }

    // 密碼驗證（改進版）
    static validatePassword(password) {
        const errors = [];

        if (!password) {
            errors.push('密碼是必需的');
            return { isValid: false, errors };
        }

        if (typeof password !== 'string') {
            errors.push('密碼必須是字符串');
            return { isValid: false, errors };
        }

        // 長度檢查
        const minLength = SECURITY.PASSWORD_MIN_LENGTH || 8;
        const maxLength = SECURITY.PASSWORD_MAX_LENGTH || 128;

        if (password.length < minLength) {
            errors.push(`密碼長度至少需要 ${minLength} 個字符`);
        }

        if (password.length > maxLength) {
            errors.push(`密碼長度不能超過 ${maxLength} 個字符`);
        }

        // 複雜度檢查
        const hasLowerCase = /[a-z]/.test(password);
        const hasUpperCase = /[A-Z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

        let complexityScore = 0;
        if (hasLowerCase) complexityScore++;
        if (hasUpperCase) complexityScore++;
        if (hasNumbers) complexityScore++;
        if (hasSpecialChars) complexityScore++;

        if (complexityScore < 3) {
            errors.push('密碼必須包含至少三種字符類型：大寫字母、小寫字母、數字、特殊字符');
        }

        // 常見密碼檢查
        const commonPasswords = [
            'password', '123456', 'qwerty', 'abc123', 'password123',
            'admin', 'letmein', 'welcome', 'monkey', 'dragon',
            '12345678', '123456789', 'qwerty123', 'password1'
        ];

        if (commonPasswords.includes(password.toLowerCase())) {
            errors.push('密碼過於常見，請選擇更安全的密碼');
        }

        // 檢查重複字符
        if (/(.)\1{2,}/.test(password)) {
            errors.push('密碼不能包含連續重複的字符');
        }

        // 檢查連續字符
        const sequentialPatterns = ['123', 'abc', 'qwe', 'asd', 'zxc'];
        if (sequentialPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
            errors.push('密碼不能包含連續的字符序列');
        }

        // 計算密碼強度
        let strength = 0;
        if (password.length >= 8) strength += 10;
        if (password.length >= 12) strength += 10;
        if (hasLowerCase) strength += 15;
        if (hasUpperCase) strength += 15;
        if (hasNumbers) strength += 15;
        if (hasSpecialChars) strength += 15;
        if (password.length >= 16) strength += 10;
        if (complexityScore === 4) strength += 10;

        let strengthLevel = 'weak';
        if (strength >= 70) strengthLevel = 'strong';
        else if (strength >= 50) strengthLevel = 'medium';

        return {
            isValid: errors.length === 0,
            errors,
            strength: strengthLevel,
            score: strength
        };
    }

    // 訊息內容驗證（改進版）
    static validateMessageContent(content) {
        const errors = [];

        if (!content && content !== '') {
            errors.push('訊息內容是必需的');
            return { isValid: false, errors };
        }

        if (typeof content !== 'string') {
            errors.push('訊息內容必須是字符串');
            return { isValid: false, errors };
        }

        const trimmedContent = content.trim();

        // 長度檢查
        const maxLength = SECURITY.MAX_MESSAGE_LENGTH || 1000;
        if (trimmedContent.length === 0) {
            errors.push('訊息內容不能為空');
        }

        if (trimmedContent.length > maxLength) {
            errors.push(`訊息長度不能超過 ${maxLength} 個字符`);
        }

        // 惡意內容檢查
        const maliciousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
            /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi
        ];

        for (const pattern of maliciousPatterns) {
            if (pattern.test(trimmedContent)) {
                errors.push('消息包含不允許的內容');
                break;
            }
        }

        // 垃圾訊息檢查
        const spamPatterns = [
            /(.)\1{10,}/g, // 重複字符超過10次
            /[A-Z]{20,}/g, // 連續大寫字母超過20個
            /[!]{5,}/g,    // 連續感嘆號超過5個
            /\b(FREE|WIN|PRIZE|MONEY)\b/gi // 常見垃圾詞彙
        ];

        for (const pattern of spamPatterns) {
            if (pattern.test(trimmedContent)) {
                errors.push('消息可能被識別為垃圾訊息');
                break;
            }
        }

        // 敏感詞檢查
        const sensitiveWords = [
            'fuck', 'shit', 'damn', 'bitch', 'asshole',
            'nazi', 'hitler', 'suicide', 'kill yourself'
        ];

        const foundSensitiveWords = sensitiveWords.filter(word =>
            trimmedContent.toLowerCase().includes(word)
        );

        if (foundSensitiveWords.length > 0) {
            errors.push('消息包含不適當的內容');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedContent,
            containsSensitiveContent: foundSensitiveWords.length > 0
        };
    }

    // 文件驗證（改進版）
    static validateFile(file) {
        const errors = [];

        if (!file) {
            errors.push('文件是必需的');
            return { isValid: false, errors };
        }

        // 檢查文件大小
        const maxFileSize = UPLOAD.MAX_FILE_SIZE || 10485760; // 10MB
        if (file.size > maxFileSize) {
            errors.push(`文件大小不能超過 ${this.formatFileSize(maxFileSize)}`);
        }

        // 檢查圖片文件大小
        const maxImageSize = UPLOAD.MAX_IMAGE_SIZE || 5242880; // 5MB
        if (file.mimetype && file.mimetype.startsWith('image/') && file.size > maxImageSize) {
            errors.push(`圖片大小不能超過 ${this.formatFileSize(maxImageSize)}`);
        }

        // 檢查文件類型
        const allowedTypes = UPLOAD.ALLOWED_FILE_TYPES || [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'text/plain', 'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (file.mimetype && !allowedTypes.includes(file.mimetype)) {
            errors.push(`不支持的文件類型: ${file.mimetype}`);
        }

        // 檢查文件名
        if (file.originalname) {
            const filename = file.originalname;

            if (filename.length > 255) {
                errors.push('文件名過長');
            }

            // 檢查危險的文件擴展名
            const dangerousExtensions = [
                '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs',
                '.js', '.jar', '.php', '.asp', '.aspx', '.jsp', '.sh',
                '.py', '.rb', '.pl', '.ps1', '.psm1'
            ];

            const fileExtension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
            if (dangerousExtensions.includes(fileExtension)) {
                errors.push(`危險的文件類型: ${fileExtension}`);
            }

            // 檢查文件名中的特殊字符
            if (/[<>:"/\\|?*\x00-\x1f]/.test(filename)) {
                errors.push('文件名包含不允許的字符');
            }
        }

        // 檢查文件內容（基礎檢查）
        if (file.buffer) {
            // 檢查是否為空文件
            if (file.buffer.length === 0) {
                errors.push('文件內容為空');
            }

            // 檢查文件頭部是否匹配聲明的MIME類型
            const actualMimeType = this.detectMimeType(file.buffer);
            if (actualMimeType && file.mimetype && actualMimeType !== file.mimetype) {
                errors.push('文件內容與聲明的類型不匹配');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedFilename: file.originalname ? this.sanitizeFilename(file.originalname) : null
        };
    }

    // 房間名稱驗證
    static validateRoomName(name) {
        const errors = [];

        if (!name) {
            errors.push('房間名稱是必需的');
            return { isValid: false, errors };
        }

        if (typeof name !== 'string') {
            errors.push('房間名稱必須是字符串');
            return { isValid: false, errors };
        }

        const trimmedName = name.trim();

        // 長度檢查
        if (trimmedName.length < 1) {
            errors.push('房間名稱不能為空');
        }

        if (trimmedName.length > 50) {
            errors.push('房間名稱長度不能超過50個字符');
        }

        // 字符檢查
        if (!/^[a-zA-Z0-9\u4e00-\u9fa5\s_-]+$/.test(trimmedName)) {
            errors.push('房間名稱只能包含字母、數字、中文、空格、底線和橫線');
        }

        // 禁用的房間名稱
        const forbiddenNames = [
            'admin', 'system', 'api', 'null', 'undefined',
            'general', 'public', 'private', 'test'
        ];

        if (forbiddenNames.includes(trimmedName.toLowerCase())) {
            errors.push('此房間名稱不可用');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedName
        };
    }

    // IP地址驗證
    static validateIPAddress(ip) {
        const errors = [];

        if (!ip) {
            errors.push('IP地址是必需的');
            return { isValid: false, errors };
        }

        // IPv4驗證
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

        // IPv6驗證（簡化版）
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

        if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
            errors.push('IP地址格式不正確');
        }

        // 檢查私有IP地址
        const isPrivate = this.isPrivateIP(ip);

        return {
            isValid: errors.length === 0,
            errors,
            isPrivate,
            type: ipv4Regex.test(ip) ? 'IPv4' : 'IPv6'
        };
    }

    // URL驗證
    static validateURL(url) {
        const errors = [];

        if (!url) {
            errors.push('URL是必需的');
            return { isValid: false, errors };
        }

        try {
            const urlObj = new URL(url);

            // 檢查協議
            const allowedProtocols = ['http:', 'https:'];
            if (!allowedProtocols.includes(urlObj.protocol)) {
                errors.push('只允許HTTP和HTTPS協議');
            }

            // 檢查域名
            if (!urlObj.hostname) {
                errors.push('URL必須包含有效的域名');
            }

            // 檢查是否為惡意域名（簡化檢查）
            const suspiciousDomains = [
                'bit.ly', 'tinyurl.com', 'goo.gl', 't.co'
            ];

            if (suspiciousDomains.includes(urlObj.hostname)) {
                errors.push('不允許使用短鏈接服務');
            }

        } catch (error) {
            errors.push('URL格式不正確');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // 手機號碼驗證
    static validatePhoneNumber(phone, country = 'TW') {
        const errors = [];

        if (!phone) {
            errors.push('手機號碼是必需的');
            return { isValid: false, errors };
        }

        // 移除所有非數字字符
        const cleanPhone = phone.replace(/\D/g, '');

        // 台灣手機號碼格式
        if (country === 'TW') {
            const twMobileRegex = /^09\d{8}$/;
            if (!twMobileRegex.test(cleanPhone)) {
                errors.push('台灣手機號碼格式不正確（09xxxxxxxx）');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: cleanPhone
        };
    }

    // 輔助方法 - 檢測MIME類型
    static detectMimeType(buffer) {
        const signatures = {
            'image/jpeg': [0xFF, 0xD8, 0xFF],
            'image/png': [0x89, 0x50, 0x4E, 0x47],
            'image/gif': [0x47, 0x49, 0x46],
            'application/pdf': [0x25, 0x50, 0x44, 0x46]
        };

        for (const [mimeType, signature] of Object.entries(signatures)) {
            if (signature.every((byte, index) => buffer[index] === byte)) {
                return mimeType;
            }
        }

        return null;
    }

    // 輔助方法 - 清理文件名
    static sanitizeFilename(filename) {
        return filename
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_{2,}/g, '_')
            .toLowerCase();
    }

    // 輔助方法 - 格式化文件大小
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 輔助方法 - 計算編輯距離
    static calculateLevenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    // 輔助方法 - 檢查是否為私有IP
    static isPrivateIP(ip) {
        const privateRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^127\./,
            /^169\.254\./
        ];

        return privateRanges.some(range => range.test(ip));
    }

    // 批量驗證
    static validateBatch(validations) {
        const results = {};
        let hasErrors = false;

        for (const [field, validator, value] of validations) {
            try {
                results[field] = validator.call(this, value);
                if (!results[field].isValid) {
                    hasErrors = true;
                }
            } catch (error) {
                results[field] = {
                    isValid: false,
                    errors: [`驗證 ${field} 時發生錯誤: ${error.message}`]
                };
                hasErrors = true;
            }
        }

        return {
            isValid: !hasErrors,
            results
        };
    }

    // 自定義驗證規則
    static customValidation(value, rules) {
        const errors = [];

        for (const rule of rules) {
            try {
                const result = rule.validator(value);
                if (!result) {
                    errors.push(rule.message || '驗證失敗');
                }
            } catch (error) {
                errors.push(`驗證規則執行錯誤: ${error.message}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // 密碼強度評估
    static assessPasswordStrength(password) {
        let score = 0;
        const feedback = [];

        if (!password) {
            return { score: 0, level: 'none', feedback: ['請輸入密碼'] };
        }

        // 長度評分
        if (password.length >= 8) score += 10;
        if (password.length >= 12) score += 10;
        if (password.length >= 16) score += 5;

        // 字符類型評分
        if (/[a-z]/.test(password)) score += 15;
        else feedback.push('添加小寫字母');

        if (/[A-Z]/.test(password)) score += 15;
        else feedback.push('添加大寫字母');

        if (/\d/.test(password)) score += 15;
        else feedback.push('添加數字');

        if (/[^a-zA-Z\d]/.test(password)) score += 15;
        else feedback.push('添加特殊字符');

        // 複雜度評分
        if (!/(.)\1{2,}/.test(password)) score += 10;
        else feedback.push('避免重複字符');

        if (!/123|abc|qwe/.test(password.toLowerCase())) score += 10;
        else feedback.push('避免連續字符');

        // 唯一性評分
        const uniqueChars = new Set(password).size;
        if (uniqueChars / password.length > 0.7) score += 5;

        let level;
        if (score >= 80) level = 'strong';
        else if (score >= 60) level = 'medium';
        else if (score >= 40) level = 'weak';
        else level = 'very-weak';

        return { score, level, feedback };
    }

    // 數據清理
    static sanitizeInput(input, type = 'text') {
        if (typeof input !== 'string') {
            return input;
        }

        switch (type) {
            case 'html':
                return input
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;');

            case 'sql':
                return input.replace(/['";\\]/g, '\\$&');

            case 'text':
            default:
                return input.trim().replace(/\s+/g, ' ');
        }
    }

    // 輸入限制檢查
    static checkRateLimit(identifier, action, limit = 10, windowMs = 60000) {
        const key = `${identifier}:${action}`;
        const now = Date.now();

        if (!this.rateLimitStore) {
            this.rateLimitStore = new Map();
        }

        if (!this.rateLimitStore.has(key)) {
            this.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
            return { allowed: true, remaining: limit - 1 };
        }

        const record = this.rateLimitStore.get(key);

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
            return { allowed: true, remaining: limit - 1 };
        }

        if (record.count >= limit) {
            return {
                allowed: false,
                remaining: 0,
                resetTime: record.resetTime
            };
        }

        record.count++;
        return {
            allowed: true,
            remaining: limit - record.count
        };
    }
}

// 驗證器中間件
class ValidationMiddleware {
    static createValidator(schema) {
        return (req, res, next) => {
            const errors = [];

            for (const [field, rules] of Object.entries(schema)) {
                const value = req.body[field];

                for (const rule of rules) {
                    const result = rule.validator(value);
                    if (!result.isValid) {
                        errors.push({
                            field,
                            messages: result.errors,
                            rule: rule.name
                        });
                    }
                }
            }

            if (errors.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: '驗證失敗',
                    details: errors
                });
            }

            next();
        };
    }

    static registrationValidator() {
        return this.createValidator({
            username: [
                { name: 'username', validator: Validators.validateUsername }
            ],
            email: [
                { name: 'email', validator: Validators.validateEmail }
            ],
            password: [
                { name: 'password', validator: Validators.validatePassword }
            ]
        });
    }

    static messageValidator() {
        return this.createValidator({
            content: [
                { name: 'message', validator: Validators.validateMessageContent }
            ]
        });
    }

    static loginValidator() {
        return this.createValidator({
            identifier: [
                {
                    name: 'identifier',
                    validator: (value) => {
                        const errors = [];
                        if (!value || typeof value !== 'string' || value.trim().length < 3) {
                            errors.push('請輸入有效的用戶名或郵箱');
                        }
                        return {
                            isValid: errors.length === 0,
                            errors
                        };
                    }
                }
            ],
            password: [
                {
                    name: 'password',
                    validator: (value) => {
                        const errors = [];
                        if (!value || typeof value !== 'string' || value.length < 6) {
                            errors.push('密碼長度至少6個字符');
                        }
                        return {
                            isValid: errors.length === 0,
                            errors
                        };
                    }
                }
            ]
        });
    }

    static roomValidator() {
        return this.createValidator({
            name: [
                { name: 'roomName', validator: Validators.validateRoomName }
            ]
        });
    }

    static fileUploadValidator() {
        return (req, res, next) => {
            if (!req.file && !req.files) {
                return res.status(400).json({
                    success: false,
                    error: '請選擇要上傳的文件'
                });
            }

            const file = req.file || (req.files && req.files[0]);
            const result = Validators.validateFile(file);

            if (!result.isValid) {
                return res.status(400).json({
                    success: false,
                    error: '文件驗證失敗',
                    details: result.errors
                });
            }

            // 添加清理後的文件名
            if (result.sanitizedFilename) {
                req.sanitizedFilename = result.sanitizedFilename;
            }

            next();
        };
    }

    static rateLimitValidator(action, limit = 10, windowMs = 60000) {
        return (req, res, next) => {
            const identifier = req.ip || req.connection.remoteAddress;
            const rateLimitResult = Validators.checkRateLimit(identifier, action, limit, windowMs);

            if (!rateLimitResult.allowed) {
                const resetTime = new Date(rateLimitResult.resetTime);
                return res.status(429).json({
                    success: false,
                    error: '請求過於頻繁，請稍後再試',
                    details: {
                        resetTime: resetTime.toISOString(),
                        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
                    }
                });
            }

            // 添加速率限制信息到響應頭
            res.set({
                'X-RateLimit-Limit': limit,
                'X-RateLimit-Remaining': rateLimitResult.remaining,
                'X-RateLimit-Reset': new Date(rateLimitResult.resetTime || Date.now() + windowMs).toISOString()
            });

            next();
        };
    }

    // 組合驗證器
    static combineValidators(...validators) {
        return (req, res, next) => {
            let index = 0;

            const runNext = (error) => {
                if (error) {
                    return next(error);
                }

                if (index >= validators.length) {
                    return next();
                }

                const validator = validators[index++];
                validator(req, res, runNext);
            };

            runNext();
        };
    }

    // 條件驗證器
    static conditionalValidator(condition, validator) {
        return (req, res, next) => {
            if (condition(req)) {
                return validator(req, res, next);
            }
            next();
        };
    }

    // 自定義錯誤處理
    static handleValidationError(error, req, res, next) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: '數據驗證失敗',
                details: error.details || [error.message]
            });
        }

        if (error.name === 'RateLimitError') {
            return res.status(429).json({
                success: false,
                error: '請求過於頻繁',
                details: error.details || [error.message]
            });
        }

        next(error);
    }
}

// 前端驗證助手（如果在瀏覽器環境中使用）
if (typeof window !== 'undefined') {
    // 為前端提供簡化的驗證方法
    window.ClientValidators = {
        validateUsername: (username) => {
            const errors = [];
            if (!username || username.length < 3) {
                errors.push('用戶名長度至少3個字符');
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
                errors.push('用戶名只能包含字母、數字、下劃線和連字符');
            }
            return { isValid: errors.length === 0, errors };
        },

        validateEmail: (email) => {
            const errors = [];
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email || !emailRegex.test(email)) {
                errors.push('請輸入有效的郵箱地址');
            }
            return { isValid: errors.length === 0, errors };
        },

        validatePassword: (password) => {
            const errors = [];
            if (!password || password.length < 8) {
                errors.push('密碼長度至少8個字符');
            }
            if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
                errors.push('密碼必須包含大小寫字母和數字');
            }
            return { isValid: errors.length === 0, errors };
        },

        validateRequired: (value, fieldName) => {
            const errors = [];
            if (!value || (typeof value === 'string' && value.trim().length === 0)) {
                errors.push(`${fieldName}是必需的`);
            }
            return { isValid: errors.length === 0, errors };
        }
    };
}

module.exports = {
    Validators,
    ValidationMiddleware
};