const crypto = require('crypto');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');
const { ENCRYPTION } = require('../config/constants');

class EncryptionService {
    // AES加密
    static encrypt(text, key = null) {
        try {
            const encryptionKey = key || ENCRYPTION.AES_KEY;
            const iv = crypto.randomBytes(ENCRYPTION.IV_LENGTH);
            const cipher = crypto.createCipher('aes-256-cbc', encryptionKey, iv);

            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            return {
                iv: iv.toString('hex'),
                encryptedData: encrypted
            };
        } catch (error) {
            logger.error('加密失敗', { error: error.message });
            throw new Error('Encryption failed');
        }
    }

    // AES解密
    static decrypt(encryptedData, iv, key = null) {
        try {
            const encryptionKey = key || ENCRYPTION.AES_KEY;
            const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);

            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            logger.error('解密失敗', { error: error.message });
            throw new Error('Decryption failed');
        }
    }

    // 生成安全的隨機字符串
    static generateRandomString(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // 生成密碼哈希
    static async hashPassword(password) {
        try {
            return await bcrypt.hash(password, ENCRYPTION.BCRYPT_ROUNDS);
        } catch (error) {
            logger.error('密碼哈希失敗', { error: error.message });
            throw new Error('Password hashing failed');
        }
    }

    // 驗證密碼
    static async verifyPassword(password, hash) {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            logger.error('密碼驗證失敗', { error: error.message });
            throw new Error('Password verification failed');
        }
    }

    // 生成HMAC簽名
    static generateHMAC(data, secret = null) {
        try {
            const hmacSecret = secret || ENCRYPTION.AES_KEY;
            return crypto.createHmac('sha256', hmacSecret)
                .update(data)
                .digest('hex');
        } catch (error) {
            logger.error('HMAC生成失敗', { error: error.message });
            throw new Error('HMAC generation failed');
        }
    }

    // 驗證HMAC簽名
    static verifyHMAC(data, signature, secret = null) {
        try {
            const expectedSignature = EncryptionService.generateHMAC(data, secret);
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(expectedSignature, 'hex')
            );
        } catch (error) {
            logger.error('HMAC驗證失敗', { error: error.message });
            return false;
        }
    }

    // 生成API密鑰
    static generateApiKey() {
        const timestamp = Date.now().toString();
        const randomData = crypto.randomBytes(16).toString('hex');
        const combined = timestamp + randomData;

        return Buffer.from(combined).toString('base64')
            .replace(/[+/=]/g, '')
            .substring(0, 32);
    }

    // 生成JWT密鑰
    static generateJWTSecret() {
        return crypto.randomBytes(64).toString('hex');
    }

    // 文件哈希（用於檢查文件完整性）
    static async generateFileHash(filePath) {
        try {
            const fs = require('fs');
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            return new Promise((resolve, reject) => {
                stream.on('data', data => hash.update(data));
                stream.on('end', () => resolve(hash.digest('hex')));
                stream.on('error', reject);
            });
        } catch (error) {
            logger.error('文件哈希生成失敗', { error: error.message, filePath });
            throw new Error('File hash generation failed');
        }
    }

    // 生成會話令牌
    static generateSessionToken() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(16).toString('hex');
        const combined = `${timestamp}-${random}`;

        return Buffer.from(combined).toString('base64');
    }

    // 生成重置令牌
    static generateResetToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // 敏感數據加密（用於存儲敏感信息）
    static encryptSensitiveData(data) {
        try {
            const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
            return EncryptionService.encrypt(dataString);
        } catch (error) {
            logger.error('敏感數據加密失敗', { error: error.message });
            throw new Error('Sensitive data encryption failed');
        }
    }

    // 敏感數據解密
    static decryptSensitiveData(encryptedData, iv) {
        try {
            const decrypted = EncryptionService.decrypt(encryptedData, iv);
            try {
                return JSON.parse(decrypted);
            } catch {
                return decrypted;
            }
        } catch (error) {
            logger.error('敏感數據解密失敗', { error: error.message });
            throw new Error('Sensitive data decryption failed');
        }
    }

    // 密碼強度檢查
    static checkPasswordStrength(password) {
        const result = {
            score: 0,
            feedback: [],
            isStrong: false
        };

        // 長度檢查
        if (password.length >= 8) {
            result.score += 1;
        } else {
            result.feedback.push('密碼長度至少需要8個字符');
        }

        // 大寫字母
        if (/[A-Z]/.test(password)) {
            result.score += 1;
        } else {
            result.feedback.push('需要包含大寫字母');
        }

        // 小寫字母
        if (/[a-z]/.test(password)) {
            result.score += 1;
        } else {
            result.feedback.push('需要包含小寫字母');
        }

        // 數字
        if (/\d/.test(password)) {
            result.score += 1;
        } else {
            result.feedback.push('需要包含數字');
        }

        // 特殊字符
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            result.score += 1;
        } else {
            result.feedback.push('需要包含特殊字符');
        }

        // 長度獎勵
        if (password.length >= 12) {
            result.score += 1;
        }

        // 複雜性獎勵
        if (password.length >= 16 && /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(password)) {
            result.score += 1;
        }

        result.isStrong = result.score >= 5;
        return result;
    }

    // 生成雙因素認證密鑰
    static generateTwoFactorSecret() {
        return crypto.randomBytes(20).toString('base32');
    }

    // 生成備份碼
    static generateBackupCodes(count = 10) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push(code.match(/.{2}/g).join('-'));
        }
        return codes;
    }

    // 安全比較（防止時序攻擊）
    static secureCompare(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }

        if (a.length !== b.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            Buffer.from(a),
            Buffer.from(b)
        );
    }

    // 生成唯一ID
    static generateUniqueId() {
        const timestamp = Date.now().toString(36);
        const randomPart = crypto.randomBytes(8).toString('hex');
        return `${timestamp}-${randomPart}`;
    }

    // 數據完整性驗證
    static generateChecksum(data) {
        return crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    // 驗證數據完整性
    static verifyChecksum(data, expectedChecksum) {
        const actualChecksum = EncryptionService.generateChecksum(data);
        return EncryptionService.secureCompare(actualChecksum, expectedChecksum);
    }

    // 混淆字符串（用於日誌等場景）
    static obfuscateString(str, visibleChars = 3) {
        if (!str || str.length <= visibleChars * 2) {
            return '***';
        }

        const start = str.substring(0, visibleChars);
        const end = str.substring(str.length - visibleChars);
        const middle = '*'.repeat(Math.max(3, str.length - visibleChars * 2));

        return start + middle + end;
    }

    // 生成CSP nonce
    static generateCSPNonce() {
        return crypto.randomBytes(16).toString('base64');
    }

    // 密鑰導出（PBKDF2）
    static deriveKey(password, salt, iterations = 100000, keyLength = 32) {
        return crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');
    }

    // 生成鹽值
    static generateSalt(length = 16) {
        return crypto.randomBytes(length);
    }
}

module.exports = EncryptionService;