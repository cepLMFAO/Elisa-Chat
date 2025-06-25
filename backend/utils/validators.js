const { SECURITY, UPLOAD } = require('../config/constants');

class Validators {
    // 用戶名驗證
    static validateUsername(username) {
        const errors = [];

        if (!username) {
            errors.push('用戶名是必需的');
            return { isValid: false, errors };
        }

        if (typeof username !== 'string') {
            errors.push('用戶名必須是字符串');
        }

        const trimmedUsername = username.trim();

        if (trimmedUsername.length < SECURITY.USERNAME_MIN_LENGTH) {
            errors.push(`用戶名長度至少需要 ${SECURITY.USERNAME_MIN_LENGTH} 個字符`);
        }

        if (trimmedUsername.length > SECURITY.USERNAME_MAX_LENGTH) {
            errors.push(`用戶名長度不能超過 ${SECURITY.USERNAME_MAX_LENGTH} 個字符`);
        }

        // 檢查字符是否合法
        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(trimmedUsername)) {
            errors.push('用戶名只能包含字母、數字、底線和橫線');
        }

        // 檢查是否以數字開頭
        if (/^\d/.test(trimmedUsername)) {
            errors.push('用戶名不能以數字開頭');
        }

        // 禁用的用戶名
        const forbiddenUsernames = [
            'admin', 'administrator', 'root', 'system', 'api', 'bot',
            'null', 'undefined', 'anonymous', 'guest', 'test', 'demo'
        ];

        if (forbiddenUsernames.includes(trimmedUsername.toLowerCase())) {
            errors.push('此用戶名不可用');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedUsername
        };
    }

    // 郵箱驗證
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

        // 基本格式檢查
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        if (!emailRegex.test(trimmedEmail)) {
            errors.push('郵箱格式不正確');
        }

        // 長度檢查
        if (trimmedEmail.length > 320) {
            errors.push('郵箱地址過長');
        }

        // 檢查本地部分長度
        const localPart = trimmedEmail.split('@')[0];
        if (localPart && localPart.length > 64) {
            errors.push('郵箱用戶名部分過長');
        }

        // 檢查域名部分
        const domainPart = trimmedEmail.split('@')[1];
        if (domainPart) {
            if (domainPart.length > 253) {
                errors.push('郵箱域名過長');
            }

            // 檢查域名是否包含有效的TLD
            const tldRegex = /\.[a-zA-Z]{2,}$/;
            if (!tldRegex.test(domainPart)) {
                errors.push('郵箱域名格式不正確');
            }
        }

        // 一次性郵箱檢查
        const disposableEmailDomains = [
            '10minutemail.com', 'mailinator.com', 'guerrillamail.com',
            'tempmail.org', 'throwaway.email', 'temp-mail.org'
        ];

        if (domainPart && disposableEmailDomains.includes(domainPart)) {
            errors.push('不支持一次性郵箱地址');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedEmail
        };
    }

    // 密碼驗證
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

        if (password.length < SECURITY.PASSWORD_MIN_LENGTH) {
            errors.push(`密碼長度至少需要 ${SECURITY.PASSWORD_MIN_LENGTH} 個字符`);
        }

        if (password.length > SECURITY.PASSWORD_MAX_LENGTH) {
            errors.push(`密碼長度不能超過 ${SECURITY.PASSWORD_MAX_LENGTH} 個字符`);
        }

        // 複雜度檢查
        const checks = {
            hasUpperCase: /[A-Z]/.test(password),
            hasLowerCase: /[a-z]/.test(password),
            hasNumbers: /\d/.test(password),
            hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };

        const passedChecks = Object.values(checks).filter(Boolean).length;

        if (passedChecks < 3) {
            errors.push('密碼必須包含大寫字母、小寫字母、數字和特殊字符中的至少三種');
        }

        // 常見密碼檢查
        const commonPasswords = [
            'password', '123456', '12345678', 'qwerty', 'abc123',
            'password123', 'admin', 'letmein', 'welcome', 'monkey'
        ];

        if (commonPasswords.includes(password.toLowerCase())) {
            errors.push('密碼過於簡單，請使用更複雜的密碼');
        }

        // 重複字符檢查
        const hasRepeatedChars = /(.)\1{2,}/.test(password);
        if (hasRepeatedChars) {
            errors.push('密碼不能包含連續重複的字符');
        }

        // 計算密碼強度
        let strength = 0;
        if (password.length >= 8) strength += 1;
        if (password.length >= 12) strength += 1;
        if (checks.hasUpperCase) strength += 1;
        if (checks.hasLowerCase) strength += 1;
        if (checks.hasNumbers) strength += 1;
        if (checks.hasSpecialChars) strength += 1;

        const strengthLabels = ['極弱', '弱', '一般', '強', '很強', '極強'];
        const strengthLabel = strengthLabels[Math.min(strength, strengthLabels.length - 1)];

        return {
            isValid: errors.length === 0,
            errors,
            strength: {
                score: strength,
                label: strengthLabel,
                checks
            }
        };
    }

    // 房間名稱驗證
    static validateRoomName(roomName) {
        const errors = [];

        if (!roomName) {
            errors.push('房間名稱是必需的');
            return { isValid: false, errors };
        }

        if (typeof roomName !== 'string') {
            errors.push('房間名稱必須是字符串');
            return { isValid: false, errors };
        }

        const trimmedName = roomName.trim();

        if (trimmedName.length === 0) {
            errors.push('房間名稱不能為空');
        }

        if (trimmedName.length > 100) {
            errors.push('房間名稱不能超過100個字符');
        }

        // 檢查特殊字符
        const allowedCharsRegex = /^[a-zA-Z0-9\s\u4e00-\u9fff_-]+$/;
        if (!allowedCharsRegex.test(trimmedName)) {
            errors.push('房間名稱只能包含字母、數字、中文、空格、底線和橫線');
        }

        // 禁用的房間名稱
        const forbiddenNames = [
            'admin', 'system', 'api', 'null', 'undefined', 'test'
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

    // 消息內容驗證
    static validateMessage(content) {
        const errors = [];

        if (!content) {
            errors.push('消息內容不能為空');
            return { isValid: false, errors };
        }

        if (typeof content !== 'string') {
            errors.push('消息內容必須是字符串');
            return { isValid: false, errors };
        }

        const trimmedContent = content.trim();

        if (trimmedContent.length === 0) {
            errors.push('消息內容不能為空');
        }

        const MAX_MESSAGE_LENGTH = 4000;
        if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
            errors.push(`消息長度不能超過 ${MAX_MESSAGE_LENGTH} 個字符`);
        }

        // 檢查是否包含惡意內容
        const maliciousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi
        ];

        for (const pattern of maliciousPatterns) {
            if (pattern.test(trimmedContent)) {
                errors.push('消息包含不允許的內容');
                break;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedContent
        };
    }

    // 文件驗證
    static validateFile(file) {
        const errors = [];

        if (!file) {
            errors.push('文件是必需的');
            return { isValid: false, errors };
        }

        // 檢查文件大小
        if (file.size > UPLOAD.MAX_FILE_SIZE) {
            errors.push(`文件大小不能超過 ${Validators.formatFileSize(UPLOAD.MAX_FILE_SIZE)}`);
        }

        // 檢查圖片文件大小
        if (file.mimetype && file.mimetype.startsWith('image/') && file.size > UPLOAD.MAX_IMAGE_SIZE) {
            errors.push(`圖片大小不能超過 ${Validators.formatFileSize(UPLOAD.MAX_IMAGE_SIZE)}`);
        }

        // 檢查文件類型
        if (file.mimetype && !UPLOAD.ALLOWED_FILE_TYPES.includes(file.mimetype)) {
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
                '.py', '.rb', '.pl'
            ];

            const fileExtension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
            if (dangerousExtensions.includes(fileExtension)) {
                errors.push('不允許的文件類型');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // URL驗證
    static validateUrl(url) {
        const errors = [];

        if (!url) {
            errors.push('URL是必需的');
            return { isValid: false, errors };
        }

        if (typeof url !== 'string') {
            errors.push('URL必須是字符串');
            return { isValid: false, errors };
        }

        const trimmedUrl = url.trim();

        try {
            const urlObj = new URL(trimmedUrl);

            // 檢查協議
            const allowedProtocols = ['http:', 'https:'];
            if (!allowedProtocols.includes(urlObj.protocol)) {
                errors.push('只支持 HTTP 和 HTTPS 協議');
            }

            // 檢查長度
            if (trimmedUrl.length > 2048) {
                errors.push('URL過長');
            }

        } catch (error) {
            errors.push('URL格式不正確');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedUrl
        };
    }

    // UUID驗證
    static validateUUID(uuid) {
        const errors = [];

        if (!uuid) {
            errors.push('UUID是必需的');
            return { isValid: false, errors };
        }

        if (typeof uuid !== 'string') {
            errors.push('UUID必須是字符串');
            return { isValid: false, errors };
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(uuid)) {
            errors.push('UUID格式不正確');
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: uuid.toLowerCase()
        };
    }

    // 分頁參數驗證
    static validatePagination(page, limit) {
        const errors = [];
        let validatedPage = 1;
        let validatedLimit = 20;

        // 驗證頁碼
        if (page !== undefined) {
            const pageNum = parseInt(page);
            if (isNaN(pageNum) || pageNum < 1) {
                errors.push('頁碼必須是大於0的整數');
            } else {
                validatedPage = pageNum;
            }
        }

        // 驗證每頁數量
        if (limit !== undefined) {
            const limitNum = parseInt(limit);
            if (isNaN(limitNum) || limitNum < 1) {
                errors.push('每頁數量必須是大於0的整數');
            } else if (limitNum > 100) {
                errors.push('每頁數量不能超過100');
            } else {
                validatedLimit = limitNum;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            page: validatedPage,
            limit: validatedLimit
        };
    }

    // 搜索查詢驗證
    static validateSearchQuery(query) {
        const errors = [];

        if (!query) {
            errors.push('搜索查詢不能為空');
            return { isValid: false, errors };
        }

        if (typeof query !== 'string') {
            errors.push('搜索查詢必須是字符串');
            return { isValid: false, errors };
        }

        const trimmedQuery = query.trim();

        if (trimmedQuery.length < 2) {
            errors.push('搜索查詢至少需要2個字符');
        }

        if (trimmedQuery.length > 100) {
            errors.push('搜索查詢不能超過100個字符');
        }

        // 檢查是否包含SQL注入模式
        const sqlInjectionPatterns = [
            /(\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\balter\b)/gi,
            /(\bunion\b|\bor\b|\band\b)\s+/gi,
            /(--|\*\/|\bexec\b|\bexecute\b)/gi
        ];

        for (const pattern of sqlInjectionPatterns) {
            if (pattern.test(trimmedQuery)) {
                errors.push('搜索查詢包含不允許的字符');
                break;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitized: trimmedQuery
        };
    }

    // 數字驗證
    static validateNumber(value, min = null, max = null) {
        const errors = [];

        if (value === undefined || value === null) {
            errors.push('數值是必需的');
            return { isValid: false, errors };
        }

        const num = Number(value);

        if (isNaN(num)) {
            errors.push('必須是有效的數字');
            return { isValid: false, errors };
        }

        if (min !== null && num < min) {
            errors.push(`數值不能小於 ${min}`);
        }

        if (max !== null && num > max) {
            errors.push(`數值不能大於 ${max}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            value: num
        };
    }

    // 格式化文件大小（輔助方法）
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 批量驗證
    static validateBatch(validators) {
        const results = {};
        let hasErrors = false;

        for (const [field, validator] of Object.entries(validators)) {
            const result = validator();
            results[field] = result;
            if (!result.isValid) {
                hasErrors = true;
            }
        }

        return {
            isValid: !hasErrors,
            results
        };
    }

    // 自定義驗證器組合
    static createValidator(validatorFunctions) {
        return (value) => {
            const errors = [];

            for (const validator of validatorFunctions) {
                const result = validator(value);
                if (!result.isValid) {
                    errors.push(...result.errors);
                }
            }

            return {
                isValid: errors.length === 0,
                errors
            };
        };
    }
}

module.exports = Validators;