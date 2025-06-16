const database = require('../config/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { ENCRYPTION, USER_STATUS, USER_ROLES } = require('../config/constants');

class User {
    constructor(data = {}) {
        this.id = data.id;
        this.uuid = data.uuid;
        this.username = data.username;
        this.email = data.email;
        this.password = data.password;
        this.avatar = data.avatar;
        this.status = data.status || USER_STATUS.OFFLINE;
        this.lastSeen = data.last_seen;
        this.createdAt = data.created_at;
        this.updatedAt = data.updated_at;
        this.isVerified = data.is_verified || false;
        this.twoFactorEnabled = data.two_factor_enabled || false;
        this.twoFactorSecret = data.two_factor_secret;
        this.role = data.role || USER_ROLES.USER;
    }

    // 創建新用戶
    static async create(userData) {
        try {
            const { username, email, password, avatar = null, role = USER_ROLES.USER } = userData;

            // 檢查用戶是否已存在
            const existingUser = await User.findByEmailOrUsername(email, username);
            if (existingUser) {
                throw new Error('用戶名或郵箱已存在');
            }

            // 驗證密碼強度
            User.validatePassword(password);

            // 加密密碼
            const hashedPassword = await bcrypt.hash(password, ENCRYPTION.BCRYPT_ROUNDS);
            const userUuid = uuidv4();

            // 生成默認頭像URL
            const defaultAvatar = avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

            const result = await database.run(
                `INSERT INTO users (uuid, username, email, password, avatar, role, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [userUuid, username, email, hashedPassword, defaultAvatar, role]
            );

            logger.info('User created successfully', {
                userId: userUuid,
                username,
                email: User.maskEmail(email)
            });

            // 返回新創建的用戶（不包含密碼）
            const newUser = await User.findByUuid(userUuid);
            delete newUser.password;
            return newUser;

        } catch (error) {
            logger.error('Failed to create user', { error: error.message, userData: { username, email } });
            throw error;
        }
    }

    // 通過UUID查找用戶
    static async findByUuid(uuid) {
        try {
            const user = await database.get('SELECT * FROM users WHERE uuid = ?', [uuid]);
            return user ? new User(user) : null;
        } catch (error) {
            logger.error('Failed to find user by UUID', { error: error.message, uuid });
            throw error;
        }
    }

    // 通過郵箱查找用戶
    static async findByEmail(email) {
        try {
            const user = await database.get('SELECT * FROM users WHERE email = ?', [email]);
            return user ? new User(user) : null;
        } catch (error) {
            logger.error('Failed to find user by email', { error: error.message });
            throw error;
        }
    }

    // 通過用戶名查找用戶
    static async findByUsername(username) {
        try {
            const user = await database.get('SELECT * FROM users WHERE username = ?', [username]);
            return user ? new User(user) : null;
        } catch (error) {
            logger.error('Failed to find user by username', { error: error.message });
            throw error;
        }
    }

    // 通過郵箱或用戶名查找用戶
    static async findByEmailOrUsername(email, username) {
        try {
            const user = await database.get(
                'SELECT * FROM users WHERE email = ? OR username = ?',
                [email, username]
            );
            return user ? new User(user) : null;
        } catch (error) {
            logger.error('Failed to find user by email or username', { error: error.message });
            throw error;
        }
    }

    // 驗證用戶登錄
    static async authenticate(identifier, password) {
        try {
            // identifier 可以是郵箱或用戶名
            const user = await database.get(
                'SELECT * FROM users WHERE email = ? OR username = ?',
                [identifier, identifier]
            );

            if (!user) {
                logger.warn('Authentication failed - user not found', { identifier });
                return null;
            }

            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                logger.warn('Authentication failed - invalid password', {
                    userId: user.uuid,
                    username: user.username
                });
                return null;
            }

            logger.info('User authenticated successfully', {
                userId: user.uuid,
                username: user.username
            });

            const userInstance = new User(user);
            delete userInstance.password; // 不返回密碼
            return userInstance;

        } catch (error) {
            logger.error('Authentication error', { error: error.message, identifier });
            throw error;
        }
    }

    // 更新用戶信息
    async update(updateData) {
        try {
            const allowedFields = ['username', 'email', 'avatar', 'status'];
            const updates = [];
            const values = [];

            // 只更新允許的字段
            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    updates.push(`${key} = ?`);
                    values.push(value);
                }
            }

            if (updates.length === 0) {
                throw new Error('No valid fields to update');
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(this.uuid);

            await database.run(
                `UPDATE users SET ${updates.join(', ')} WHERE uuid = ?`,
                values
            );

            // 更新實例屬性
            Object.assign(this, updateData);
            this.updatedAt = new Date().toISOString();

            logger.info('User updated successfully', {
                userId: this.uuid,
                updatedFields: Object.keys(updateData)
            });

            return this;

        } catch (error) {
            logger.error('Failed to update user', {
                error: error.message,
                userId: this.uuid,
                updateData
            });
            throw error;
        }
    }

    // 更新密碼
    async updatePassword(currentPassword, newPassword) {
        try {
            // 驗證當前密碼
            const user = await database.get('SELECT password FROM users WHERE uuid = ?', [this.uuid]);
            const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

            if (!isCurrentPasswordValid) {
                throw new Error('當前密碼不正確');
            }

            // 驗證新密碼強度
            User.validatePassword(newPassword);

            // 加密新密碼
            const hashedPassword = await bcrypt.hash(newPassword, ENCRYPTION.BCRYPT_ROUNDS);

            await database.run(
                'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [hashedPassword, this.uuid]
            );

            logger.info('User password updated', { userId: this.uuid });
            return true;

        } catch (error) {
            logger.error('Failed to update password', {
                error: error.message,
                userId: this.uuid
            });
            throw error;
        }
    }

    // 更新用戶狀態
    async updateStatus(status) {
        try {
            if (!Object.values(USER_STATUS).includes(status)) {
                throw new Error('Invalid user status');
            }

            await database.run(
                'UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [status, this.uuid]
            );

            this.status = status;
            this.lastSeen = new Date().toISOString();

            logger.debug('User status updated', { userId: this.uuid, status });
            return this;

        } catch (error) {
            logger.error('Failed to update user status', {
                error: error.message,
                userId: this.uuid,
                status
            });
            throw error;
        }
    }

    // 啟用雙因素認證
    async enableTwoFactor() {
        try {
            const secret = crypto.randomBytes(32).toString('hex');

            await database.run(
                'UPDATE users SET two_factor_enabled = 1, two_factor_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [secret, this.uuid]
            );

            this.twoFactorEnabled = true;
            this.twoFactorSecret = secret;

            logger.info('Two-factor authentication enabled', { userId: this.uuid });
            return secret;

        } catch (error) {
            logger.error('Failed to enable two-factor authentication', {
                error: error.message,
                userId: this.uuid
            });
            throw error;
        }
    }

    // 禁用雙因素認證
    async disableTwoFactor() {
        try {
            await database.run(
                'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [this.uuid]
            );

            this.twoFactorEnabled = false;
            this.twoFactorSecret = null;

            logger.info('Two-factor authentication disabled', { userId: this.uuid });
            return true;

        } catch (error) {
            logger.error('Failed to disable two-factor authentication', {
                error: error.message,
                userId: this.uuid
            });
            throw error;
        }
    }

    // 驗證郵箱
    async verifyEmail() {
        try {
            await database.run(
                'UPDATE users SET is_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [this.uuid]
            );

            this.isVerified = true;
            logger.info('User email verified', { userId: this.uuid });
            return true;

        } catch (error) {
            logger.error('Failed to verify email', {
                error: error.message,
                userId: this.uuid
            });
            throw error;
        }
    }

    // 軟刪除用戶
    async softDelete() {
        try {
            await database.run(
                'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                ['deleted', this.uuid]
            );

            logger.info('User soft deleted', { userId: this.uuid });
            return true;

        } catch (error) {
            logger.error('Failed to soft delete user', {
                error: error.message,
                userId: this.uuid
            });
            throw error;
        }
    }

    // 獲取用戶統計信息
    async getStats() {
        try {
            const stats = await database.get(
                `SELECT 
                    (SELECT COUNT(*) FROM messages WHERE sender_uuid = ?) as messageCount,
                    (SELECT COUNT(*) FROM friendships WHERE requester_uuid = ? OR addressee_uuid = ?) as friendCount,
                    (SELECT COUNT(*) FROM room_members WHERE user_uuid = ?) as roomCount
                `,
                [this.uuid, this.uuid, this.uuid, this.uuid]
            );

            return {
                messages: stats.messageCount || 0,
                friends: stats.friendCount || 0,
                rooms: stats.roomCount || 0,
                memberSince: this.createdAt,
                lastSeen: this.lastSeen
            };

        } catch (error) {
            logger.error('Failed to get user stats', {
                error: error.message,
                userId: this.uuid
            });
            throw error;
        }
    }

    // 獲取所有用戶（分頁）
    static async getAll(page = 1, limit = 20, filters = {}) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = "WHERE status != 'deleted'";
            const params = [];

            // 添加篩選條件
            if (filters.status) {
                whereClause += ' AND status = ?';
                params.push(filters.status);
            }

            if (filters.role) {
                whereClause += ' AND role = ?';
                params.push(filters.role);
            }

            if (filters.search) {
                whereClause += ' AND (username LIKE ? OR email LIKE ?)';
                params.push(`%${filters.search}%`, `%${filters.search}%`);
            }

            // 獲取總數
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM users ${whereClause}`,
                params
            );

            // 獲取用戶數據
            const users = await database.query(
                `SELECT uuid, username, email, avatar, status, role, last_seen, created_at 
                 FROM users ${whereClause} 
                 ORDER BY created_at DESC 
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            return {
                users: users.map(user => new User(user)),
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to get all users', { error: error.message, page, limit, filters });
            throw error;
        }
    }

    // 搜索用戶
    static async search(query, limit = 10) {
        try {
            const users = await database.query(
                `SELECT uuid, username, email, avatar, status 
                 FROM users 
                 WHERE (username LIKE ? OR email LIKE ?) AND status != 'deleted'
                 ORDER BY 
                    CASE WHEN username = ? THEN 1 ELSE 2 END,
                    username ASC
                 LIMIT ?`,
                [`%${query}%`, `%${query}%`, query, limit]
            );

            return users.map(user => {
                const userInstance = new User(user);
                delete userInstance.password;
                userInstance.email = User.maskEmail(userInstance.email);
                return userInstance;
            });

        } catch (error) {
            logger.error('Failed to search users', { error: error.message, query });
            throw error;
        }
    }

    // 獲取在線用戶
    static async getOnlineUsers() {
        try {
            const users = await database.query(
                `SELECT uuid, username, avatar, status, last_seen 
                 FROM users 
                 WHERE status IN (?, ?, ?) AND status != 'deleted'
                 ORDER BY last_seen DESC`,
                [USER_STATUS.ONLINE, USER_STATUS.AWAY, USER_STATUS.BUSY]
            );

            return users.map(user => new User(user));

        } catch (error) {
            logger.error('Failed to get online users', { error: error.message });
            throw error;
        }
    }

    // 驗證密碼強度
    static validatePassword(password) {
        if (!password || password.length < 8) {
            throw new Error('密碼長度至少8個字符');
        }

        if (password.length > 128) {
            throw new Error('密碼長度不能超過128個字符');
        }

        // 檢查密碼復雜性
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        const complexityCount = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar]
            .filter(Boolean).length;

        if (complexityCount < 3) {
            throw new Error('密碼必須包含大寫字母、小寫字母、數字和特殊字符中的至少三種');
        }

        return true;
    }

    // 遮蔽郵箱地址
    static maskEmail(email) {
        if (!email) return '';
        const [username, domain] = email.split('@');
        const maskedUsername = username.substring(0, 2) + '*'.repeat(username.length - 2);
        return `${maskedUsername}@${domain}`;
    }

    // 轉換為JSON（移除敏感信息）
    toJSON() {
        const userObj = { ...this };
        delete userObj.password;
        delete userObj.twoFactorSecret;
        return userObj;
    }

    // 轉換為公開信息
    toPublic() {
        return {
            uuid: this.uuid,
            username: this.username,
            avatar: this.avatar,
            status: this.status,
            lastSeen: this.lastSeen,
            role: this.role
        };
    }
}

module.exports = User;