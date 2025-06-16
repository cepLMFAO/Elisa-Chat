const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const database = require('../config/database');
const User = require('../models/User');
const logger = require('../utils/logger');
const { JWT, SECURITY, ERROR_CODES } = require('../config/constants');

class AuthService {
    // 生成JWT令牌
    static generateTokens(user) {
        try {
            const payload = {
                userId: user.uuid,
                username: user.username,
                role: user.role,
                iat: Math.floor(Date.now() / 1000)
            };

            const accessToken = jwt.sign(payload, JWT.SECRET, {
                expiresIn: JWT.EXPIRES_IN,
                issuer: 'elite-chat',
                audience: 'elite-chat-users'
            });

            const refreshToken = jwt.sign(
                { userId: user.uuid, type: 'refresh' },
                JWT.SECRET,
                { expiresIn: JWT.REFRESH_EXPIRES_IN }
            );

            return { accessToken, refreshToken };

        } catch (error) {
            logger.error('Failed to generate tokens', {
                error: error.message,
                userId: user.uuid
            });
            throw new Error('Token generation failed');
        }
    }

    // 驗證JWT令牌
    static verifyToken(token) {
        try {
            const decoded = jwt.verify(token, JWT.SECRET, {
                issuer: 'elite-chat',
                audience: 'elite-chat-users'
            });

            return decoded;

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error(ERROR_CODES.TOKEN_EXPIRED);
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error(ERROR_CODES.TOKEN_INVALID);
            }
            throw error;
        }
    }

    // 刷新令牌
    static async refreshToken(refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, JWT.SECRET);

            if (decoded.type !== 'refresh') {
                throw new Error('Invalid refresh token');
            }

            const user = await User.findByUuid(decoded.userId);
            if (!user) {
                throw new Error(ERROR_CODES.USER_NOT_FOUND);
            }

            // 檢查會話是否存在
            const session = await database.get(
                'SELECT * FROM sessions WHERE user_uuid = ? AND expires_at > CURRENT_TIMESTAMP',
                [user.uuid]
            );

            if (!session) {
                throw new Error('Session expired');
            }

            // 生成新的令牌
            const tokens = AuthService.generateTokens(user);

            logger.auth('Token refreshed', user.uuid);
            return { tokens, user: user.toJSON() };

        } catch (error) {
            logger.error('Failed to refresh token', { error: error.message });
            throw error;
        }
    }

    // 創建會話
    static async createSession(user, req) {
        try {
            const sessionId = crypto.randomUUID();
            const expiresAt = new Date(Date.now() + SECURITY.SESSION_TIMEOUT);

            await database.run(
                `INSERT INTO sessions (session_id, user_uuid, ip_address, user_agent, expires_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    sessionId,
                    user.uuid,
                    req.ip || req.connection.remoteAddress,
                    req.get('User-Agent') || '',
                    expiresAt.toISOString()
                ]
            );

            logger.auth('Session created', user.uuid, {
                sessionId,
                ip: req.ip
            });

            return sessionId;

        } catch (error) {
            logger.error('Failed to create session', {
                error: error.message,
                userId: user.uuid
            });
            throw error;
        }
    }

    // 驗證會話
    static async validateSession(sessionId, userId) {
        try {
            const session = await database.get(
                `SELECT * FROM sessions 
                 WHERE session_id = ? AND user_uuid = ? AND expires_at > CURRENT_TIMESTAMP`,
                [sessionId, userId]
            );

            if (!session) {
                return false;
            }

            // 更新會話活動時間
            await database.run(
                'UPDATE sessions SET expires_at = ? WHERE session_id = ?',
                [new Date(Date.now() + SECURITY.SESSION_TIMEOUT).toISOString(), sessionId]
            );

            return true;

        } catch (error) {
            logger.error('Failed to validate session', {
                error: error.message,
                sessionId,
                userId
            });
            return false;
        }
    }

    // 銷毀會話
    static async destroySession(sessionId, userId = null) {
        try {
            let query = 'DELETE FROM sessions WHERE session_id = ?';
            let params = [sessionId];

            if (userId) {
                query += ' AND user_uuid = ?';
                params.push(userId);
            }

            const result = await database.run(query, params);

            logger.auth('Session destroyed', userId, { sessionId });
            return result.changes > 0;

        } catch (error) {
            logger.error('Failed to destroy session', {
                error: error.message,
                sessionId,
                userId
            });
            throw error;
        }
    }

    // 銷毀用戶所有會話
    static async destroyAllUserSessions(userId) {
        try {
            const result = await database.run(
                'DELETE FROM sessions WHERE user_uuid = ?',
                [userId]
            );

            logger.auth('All user sessions destroyed', userId);
            return result.changes;

        } catch (error) {
            logger.error('Failed to destroy all user sessions', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // 清理過期會話
    static async cleanupExpiredSessions() {
        try {
            const result = await database.run(
                'DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP'
            );

            if (result.changes > 0) {
                logger.info('Expired sessions cleaned up', { count: result.changes });
            }

            return result.changes;

        } catch (error) {
            logger.error('Failed to cleanup expired sessions', { error: error.message });
            throw error;
        }
    }

    // 用戶登錄
    static async login(identifier, password, req) {
        try {
            // 檢查登錄嘗試次數
            await AuthService.checkLoginAttempts(req.ip);

            // 驗證用戶憑據
            const user = await User.authenticate(identifier, password);
            if (!user) {
                await AuthService.recordFailedLogin(req.ip);
                throw new Error(ERROR_CODES.INVALID_CREDENTIALS);
            }

            // 清除失敗的登錄記錄
            await AuthService.clearFailedLogins(req.ip);

            // 更新用戶狀態
            await user.updateStatus('online');

            // 創建會話
            const sessionId = await AuthService.createSession(user, req);

            // 生成令牌
            const tokens = AuthService.generateTokens(user);

            logger.auth('User logged in', user.uuid, {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            return {
                user: user.toJSON(),
                tokens,
                sessionId
            };

        } catch (error) {
            logger.error('Login failed', {
                error: error.message,
                identifier,
                ip: req.ip
            });
            throw error;
        }
    }

    // 用戶登出
    static async logout(sessionId, userId) {
        try {
            // 銷毀會話
            await AuthService.destroySession(sessionId, userId);

            // 更新用戶狀態
            const user = await User.findByUuid(userId);
            if (user) {
                await user.updateStatus('offline');
            }

            logger.auth('User logged out', userId, { sessionId });

        } catch (error) {
            logger.error('Logout failed', {
                error: error.message,
                sessionId,
                userId
            });
            throw error;
        }
    }

    // 用戶註冊
    static async register(userData, req) {
        try {
            // 創建用戶
            const user = await User.create(userData);

            // 創建會話
            const sessionId = await AuthService.createSession(user, req);

            // 生成令牌
            const tokens = AuthService.generateTokens(user);

            logger.auth('User registered', user.uuid, {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            return {
                user: user.toJSON(),
                tokens,
                sessionId
            };

        } catch (error) {
            logger.error('Registration failed', {
                error: error.message,
                userData: { username: userData.username, email: userData.email },
                ip: req.ip
            });
            throw error;
        }
    }

    // 檢查登錄嘗試次數
    static async checkLoginAttempts(ip) {
        try {
            const attempts = await database.get(
                `SELECT COUNT(*) as count FROM audit_logs 
                 WHERE ip_address = ? AND action = 'failed_login' 
                 AND created_at > datetime('now', '-15 minutes')`,
                [ip]
            );

            if (attempts.count >= SECURITY.MAX_LOGIN_ATTEMPTS) {
                throw new Error('Too many login attempts. Please try again later.');
            }

        } catch (error) {
            if (error.message.includes('Too many login attempts')) {
                throw error;
            }
            logger.error('Failed to check login attempts', { error: error.message, ip });
        }
    }

    // 記錄失敗的登錄
    static async recordFailedLogin(ip, userAgent = '') {
        try {
            await database.run(
                `INSERT INTO audit_logs (action, details, ip_address, user_agent, created_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    'failed_login',
                    JSON.stringify({ reason: 'invalid_credentials' }),
                    ip,
                    userAgent
                ]
            );

        } catch (error) {
            logger.error('Failed to record failed login', { error: error.message, ip });
        }
    }

    // 清除失敗的登錄記錄
    static async clearFailedLogins(ip) {
        try {
            await database.run(
                `DELETE FROM audit_logs 
                 WHERE ip_address = ? AND action = 'failed_login'`,
                [ip]
            );

        } catch (error) {
            logger.error('Failed to clear failed logins', { error: error.message, ip });
        }
    }

    // 設置雙因素認證
    static async setupTwoFactor(userId) {
        try {
            const user = await User.findByUuid(userId);
            if (!user) {
                throw new Error(ERROR_CODES.USER_NOT_FOUND);
            }

            // 生成密鑰
            const secret = speakeasy.generateSecret({
                name: `Elite Chat (${user.username})`,
                issuer: 'Elite Chat',
                length: 32
            });

            // 生成QR碼
            const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

            // 暫時存儲密鑰（等待驗證）
            await database.run(
                `INSERT OR REPLACE INTO user_settings (user_uuid, setting_key, setting_value)
                 VALUES (?, ?, ?)`,
                [userId, 'temp_2fa_secret', secret.base32]
            );

            logger.auth('2FA setup initiated', userId);

            return {
                secret: secret.base32,
                qrCode: qrCodeUrl,
                manualEntryKey: secret.base32
            };

        } catch (error) {
            logger.error('Failed to setup 2FA', { error: error.message, userId });
            throw error;
        }
    }

    // 驗證並啟用雙因素認證
    static async verifyAndEnableTwoFactor(userId, token) {
        try {
            // 獲取臨時密鑰
            const tempSecret = await database.get(
                `SELECT setting_value FROM user_settings 
                 WHERE user_uuid = ? AND setting_key = 'temp_2fa_secret'`,
                [userId]
            );

            if (!tempSecret) {
                throw new Error('No pending 2FA setup found');
            }

            // 驗證令牌
            const isValid = speakeasy.totp.verify({
                secret: tempSecret.setting_value,
                encoding: 'base32',
                token,
                window: 2
            });

            if (!isValid) {
                throw new Error('Invalid 2FA token');
            }

            // 啟用雙因素認證
            const user = await User.findByUuid(userId);
            await user.enableTwoFactor();

            // 將臨時密鑰設為永久密鑰
            await database.run(
                'UPDATE users SET two_factor_secret = ? WHERE uuid = ?',
                [tempSecret.setting_value, userId]
            );

            // 刪除臨時設置
            await database.run(
                `DELETE FROM user_settings 
                 WHERE user_uuid = ? AND setting_key = 'temp_2fa_secret'`,
                [userId]
            );

            // 生成備份碼
            const backupCodes = AuthService.generateBackupCodes();
            await database.run(
                `INSERT OR REPLACE INTO user_settings (user_uuid, setting_key, setting_value)
                 VALUES (?, ?, ?)`,
                [userId, '2fa_backup_codes', JSON.stringify(backupCodes)]
            );

            logger.auth('2FA enabled', userId);

            return { backupCodes };

        } catch (error) {
            logger.error('Failed to verify and enable 2FA', { error: error.message, userId });
            throw error;
        }
    }

    // 驗證雙因素認證令牌
    static async verifyTwoFactor(userId, token) {
        try {
            const user = await User.findByUuid(userId);
            if (!user || !user.twoFactorEnabled) {
                return false;
            }

            // 檢查是否是備份碼
            const backupCodes = await database.get(
                `SELECT setting_value FROM user_settings 
                 WHERE user_uuid = ? AND setting_key = '2fa_backup_codes'`,
                [userId]
            );

            if (backupCodes) {
                const codes = JSON.parse(backupCodes.setting_value);
                if (codes.includes(token)) {
                    // 使用備份碼後移除它
                    const remainingCodes = codes.filter(code => code !== token);
                    await database.run(
                        `UPDATE user_settings SET setting_value = ? 
                         WHERE user_uuid = ? AND setting_key = '2fa_backup_codes'`,
                        [JSON.stringify(remainingCodes), userId]
                    );

                    logger.auth('2FA verified with backup code', userId);
                    return true;
                }
            }

            // 驗證TOTP令牌
            const isValid = speakeasy.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token,
                window: 2
            });

            if (isValid) {
                logger.auth('2FA verified with TOTP', userId);
            }

            return isValid;

        } catch (error) {
            logger.error('Failed to verify 2FA', { error: error.message, userId });
            return false;
        }
    }

    // 禁用雙因素認證
    static async disableTwoFactor(userId, password) {
        try {
            const user = await User.findByUuid(userId);
            if (!user) {
                throw new Error(ERROR_CODES.USER_NOT_FOUND);
            }

            // 驗證密碼
            const isPasswordValid = await User.authenticate(user.email, password);
            if (!isPasswordValid) {
                throw new Error('Invalid password');
            }

            // 禁用雙因素認證
            await user.disableTwoFactor();

            // 刪除相關設置
            await database.run(
                `DELETE FROM user_settings 
                 WHERE user_uuid = ? AND setting_key IN ('2fa_backup_codes', 'temp_2fa_secret')`,
                [userId]
            );

            logger.auth('2FA disabled', userId);
            return true;

        } catch (error) {
            logger.error('Failed to disable 2FA', { error: error.message, userId });
            throw error;
        }
    }

    // 生成備份碼
    static generateBackupCodes() {
        const codes = [];
        for (let i = 0; i < 10; i++) {
            codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }
        return codes;
    }

    // 生成密碼重置令牌
    static async generatePasswordResetToken(email) {
        try {
            const user = await User.findByEmail(email);
            if (!user) {
                // 不透露用戶是否存在
                logger.warn('Password reset requested for non-existent email', { email });
                return { success: true }; // 假裝成功
            }

            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1小時

            await database.run(
                `INSERT OR REPLACE INTO user_settings (user_uuid, setting_key, setting_value)
                 VALUES (?, ?, ?)`,
                [user.uuid, 'password_reset_token', JSON.stringify({
                    token,
                    expiresAt: expiresAt.toISOString()
                })]
            );

            logger.auth('Password reset token generated', user.uuid);

            return {
                success: true,
                token,
                userId: user.uuid
            };

        } catch (error) {
            logger.error('Failed to generate password reset token', { error: error.message, email });
            throw error;
        }
    }

    // 重置密碼
    static async resetPassword(token, newPassword) {
        try {
            // 查找令牌
            const tokenData = await database.get(
                `SELECT user_uuid, setting_value FROM user_settings 
                 WHERE setting_key = 'password_reset_token'`
            );

            if (!tokenData) {
                throw new Error('Invalid or expired reset token');
            }

            const { token: storedToken, expiresAt } = JSON.parse(tokenData.setting_value);

            // 驗證令牌
            if (storedToken !== token || new Date() > new Date(expiresAt)) {
                throw new Error('Invalid or expired reset token');
            }

            // 重置密碼
            const user = await User.findByUuid(tokenData.user_uuid);
            if (!user) {
                throw new Error(ERROR_CODES.USER_NOT_FOUND);
            }

            // 驗證新密碼
            User.validatePassword(newPassword);

            // 更新密碼
            const hashedPassword = await bcrypt.hash(newPassword, ENCRYPTION.BCRYPT_ROUNDS);
            await database.run(
                'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [hashedPassword, user.uuid]
            );

            // 刪除重置令牌
            await database.run(
                `DELETE FROM user_settings 
                 WHERE user_uuid = ? AND setting_key = 'password_reset_token'`,
                [user.uuid]
            );

            // 銷毀所有會話
            await AuthService.destroyAllUserSessions(user.uuid);

            logger.auth('Password reset completed', user.uuid);
            return true;

        } catch (error) {
            logger.error('Failed to reset password', { error: error.message });
            throw error;
        }
    }

    // 生成郵箱驗證令牌
    static async generateEmailVerificationToken(userId) {
        try {
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小時

            await database.run(
                `INSERT OR REPLACE INTO user_settings (user_uuid, setting_key, setting_value)
                 VALUES (?, ?, ?)`,
                [userId, 'email_verification_token', JSON.stringify({
                    token,
                    expiresAt: expiresAt.toISOString()
                })]
            );

            logger.auth('Email verification token generated', userId);
            return token;

        } catch (error) {
            logger.error('Failed to generate email verification token', { error: error.message, userId });
            throw error;
        }
    }

    // 驗證郵箱
    static async verifyEmail(token) {
        try {
            // 查找令牌
            const tokenData = await database.get(
                `SELECT user_uuid, setting_value FROM user_settings 
                 WHERE setting_key = 'email_verification_token'`
            );

            if (!tokenData) {
                throw new Error('Invalid verification token');
            }

            const { token: storedToken, expiresAt } = JSON.parse(tokenData.setting_value);

            // 驗證令牌
            if (storedToken !== token || new Date() > new Date(expiresAt)) {
                throw new Error('Invalid or expired verification token');
            }

            // 驗證郵箱
            const user = await User.findByUuid(tokenData.user_uuid);
            if (!user) {
                throw new Error(ERROR_CODES.USER_NOT_FOUND);
            }

            await user.verifyEmail();

            // 刪除驗證令牌
            await database.run(
                `DELETE FROM user_settings 
                 WHERE user_uuid = ? AND setting_key = 'email_verification_token'`,
                [user.uuid]
            );

            logger.auth('Email verified', user.uuid);
            return user;

        } catch (error) {
            logger.error('Failed to verify email', { error: error.message });
            throw error;
        }
    }

    // 獲取用戶會話
    static async getUserSessions(userId) {
        try {
            const sessions = await database.query(
                `SELECT session_id, ip_address, user_agent, created_at, expires_at
                 FROM sessions 
                 WHERE user_uuid = ? AND expires_at > CURRENT_TIMESTAMP
                 ORDER BY created_at DESC`,
                [userId]
            );

            return sessions.map(session => ({
                ...session,
                isCurrent: false, // 需要在調用處設置
                location: 'Unknown', // 可以集成IP地理位置服務
                device: AuthService.parseUserAgent(session.user_agent)
            }));

        } catch (error) {
            logger.error('Failed to get user sessions', { error: error.message, userId });
            throw error;
        }
    }

    // 解析User-Agent
    static parseUserAgent(userAgent) {
        if (!userAgent) return 'Unknown Device';

        // 簡化的User-Agent解析
        if (userAgent.includes('Mobile')) return 'Mobile Device';
        if (userAgent.includes('Chrome')) return 'Chrome Browser';
        if (userAgent.includes('Firefox')) return 'Firefox Browser';
        if (userAgent.includes('Safari')) return 'Safari Browser';
        if (userAgent.includes('Edge')) return 'Edge Browser';

        return 'Desktop Browser';
    }
}

module.exports = AuthService;