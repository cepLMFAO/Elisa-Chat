const { validationResult, body, param, query } = require('express-validator');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const logger = require('../utils/logger');

class ValidationMiddleware {
    // 處理驗證錯誤
    static handleValidationErrors(req, res, next) {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            const errorMessages = errors.array().map(error => ({
                field: error.path || error.param,
                message: error.msg,
                value: error.value
            }));

            logger.warn('Validation failed', {
                errors: errorMessages,
                path: req.path,
                method: req.method,
                ip: req.ip
            });

            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: 'Validation failed',
                code: ERROR_CODES.VALIDATION_ERROR,
                details: errorMessages
            });
        }

        next();
    }

    // 用戶註冊驗證
    static validateUserRegistration() {
        return [
            body('username')
                .trim()
                .isLength({ min: 3, max: 30 })
                .withMessage('Username must be between 3 and 30 characters')
                .matches(/^[a-zA-Z0-9_-]+$/)
                .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
                .custom(async (value) => {
                    const User = require('../models/User');
                    const existingUser = await User.findByUsername(value);
                    if (existingUser) {
                        throw new Error('Username is already taken');
                    }
                    return true;
                }),

            body('email')
                .isEmail()
                .normalizeEmail()
                .withMessage('Please provide a valid email address')
                .custom(async (value) => {
                    const User = require('../models/User');
                    const existingUser = await User.findByEmail(value);
                    if (existingUser) {
                        throw new Error('Email is already registered');
                    }
                    return true;
                }),

            body('password')
                .isLength({ min: 8, max: 128 })
                .withMessage('Password must be between 8 and 128 characters')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
                .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

            body('confirmPassword')
                .custom((value, { req }) => {
                    if (value !== req.body.password) {
                        throw new Error('Password confirmation does not match password');
                    }
                    return true;
                })
        ];
    }

    // 用戶登錄驗證
    static validateUserLogin() {
        return [
            body('identifier')
                .trim()
                .notEmpty()
                .withMessage('Email or username is required')
                .isLength({ max: 255 })
                .withMessage('Identifier is too long'),

            body('password')
                .notEmpty()
                .withMessage('Password is required'),

            body('twoFactorToken')
                .optional()
                .isLength({ min: 6, max: 6 })
                .isNumeric()
                .withMessage('Two-factor token must be 6 digits')
        ];
    }

    // 密碼重置驗證
    static validatePasswordReset() {
        return [
            body('token')
                .notEmpty()
                .withMessage('Reset token is required')
                .isLength({ min: 32, max: 64 })
                .withMessage('Invalid token format'),

            body('password')
                .isLength({ min: 8, max: 128 })
                .withMessage('Password must be between 8 and 128 characters')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
                .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

            body('confirmPassword')
                .custom((value, { req }) => {
                    if (value !== req.body.password) {
                        throw new Error('Password confirmation does not match password');
                    }
                    return true;
                })
        ];
    }

    // 用戶資料更新驗證
    static validateUserUpdate() {
        return [
            body('username')
                .optional()
                .trim()
                .isLength({ min: 3, max: 30 })
                .withMessage('Username must be between 3 and 30 characters')
                .matches(/^[a-zA-Z0-9_-]+$/)
                .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),

            body('email')
                .optional()
                .isEmail()
                .normalizeEmail()
                .withMessage('Please provide a valid email address'),

            body('avatar')
                .optional()
                .isURL()
                .withMessage('Avatar must be a valid URL'),

            body('status')
                .optional()
                .isIn(['online', 'offline', 'away', 'busy', 'invisible'])
                .withMessage('Invalid status value')
        ];
    }

    // 房間創建驗證
    static validateRoomCreation() {
        return [
            body('name')
                .trim()
                .isLength({ min: 1, max: 100 })
                .withMessage('Room name must be between 1 and 100 characters')
                .matches(/^[a-zA-Z0-9\s_-]+$/)
                .withMessage('Room name can only contain letters, numbers, spaces, underscores, and hyphens'),

            body('description')
                .optional()
                .trim()
                .isLength({ max: 500 })
                .withMessage('Description cannot exceed 500 characters'),

            body('type')
                .isIn(['public', 'private', 'direct', 'group'])
                .withMessage('Invalid room type'),

            body('password')
                .optional()
                .isLength({ min: 4, max: 50 })
                .withMessage('Room password must be between 4 and 50 characters'),

            body('maxMembers')
                .optional()
                .isInt({ min: 2, max: 1000 })
                .withMessage('Max members must be between 2 and 1000')
        ];
    }

    // 消息發送驗證
    static validateMessage() {
        return [
            body('content')
                .trim()
                .isLength({ min: 1, max: 4000 })
                .withMessage('Message content must be between 1 and 4000 characters'),

            body('messageType')
                .optional()
                .isIn(['text', 'image', 'file', 'audio', 'video', 'emoji', 'sticker', 'location'])
                .withMessage('Invalid message type'),

            body('replyTo')
                .optional()
                .isUUID()
                .withMessage('Reply to must be a valid UUID'),

            body('roomId')
                .optional()
                .isUUID()
                .withMessage('Room ID must be a valid UUID'),

            body('receiverId')
                .optional()
                .isUUID()
                .withMessage('Receiver ID must be a valid UUID')
        ];
    }

    // 文件上傳驗證
    static validateFileUpload() {
        return [
            body('messageId')
                .optional()
                .isUUID()
                .withMessage('Message ID must be a valid UUID')
        ];
    }

    // UUID 參數驗證
    static validateUUIDParam(paramName = 'id') {
        return [
            param(paramName)
                .isUUID()
                .withMessage(`${paramName} must be a valid UUID`)
        ];
    }

    // 分頁查詢驗證
    static validatePagination() {
        return [
            query('page')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Page must be a positive integer'),

            query('limit')
                .optional()
                .isInt({ min: 1, max: 100 })
                .withMessage('Limit must be between 1 and 100'),

            query('search')
                .optional()
                .trim()
                .isLength({ max: 100 })
                .withMessage('Search term cannot exceed 100 characters')
        ];
    }

    // 搜索查詢驗證
    static validateSearch() {
        return [
            query('q')
                .trim()
                .isLength({ min: 2, max: 100 })
                .withMessage('Search query must be between 2 and 100 characters'),

            query('type')
                .optional()
                .isIn(['users', 'rooms', 'messages'])
                .withMessage('Invalid search type'),

            query('limit')
                .optional()
                .isInt({ min: 1, max: 50 })
                .withMessage('Limit must be between 1 and 50')
        ];
    }

    // 好友請求驗證
    static validateFriendRequest() {
        return [
            body('userId')
                .isUUID()
                .withMessage('User ID must be a valid UUID')
                .custom((value, { req }) => {
                    if (value === req.user?.userId) {
                        throw new Error('Cannot send friend request to yourself');
                    }
                    return true;
                })
        ];
    }

    // 房間加入驗證
    static validateRoomJoin() {
        return [
            body('password')
                .optional()
                .isLength({ min: 1, max: 50 })
                .withMessage('Password cannot exceed 50 characters')
        ];
    }

    // 雙因素認證令牌驗證
    static validateTwoFactorToken() {
        return [
            body('token')
                .isLength({ min: 6, max: 6 })
                .isNumeric()
                .withMessage('Two-factor token must be 6 digits')
        ];
    }

    // 自定義驗證器：檢查用戶存在
    static async validateUserExists(userId) {
        const User = require('../models/User');
        const user = await User.findByUuid(userId);
        if (!user) {
            throw new Error('User not found');
        }
        return true;
    }

    // 自定義驗證器：檢查房間存在
    static async validateRoomExists(roomId) {
        const database = require('../config/database');
        const room = await database.get('SELECT uuid FROM rooms WHERE uuid = ?', [roomId]);
        if (!room) {
            throw new Error('Room not found');
        }
        return true;
    }

    // 自定義驗證器：檢查消息存在
    static async validateMessageExists(messageId) {
        const database = require('../config/database');
        const message = await database.get('SELECT uuid FROM messages WHERE uuid = ?', [messageId]);
        if (!message) {
            throw new Error('Message not found');
        }
        return true;
    }

    // 清理和標準化輸入
    static sanitizeInput(req, res, next) {
        // 遞歸清理對象中的字符串
        const sanitize = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    // 移除潛在的 XSS 字符
                    obj[key] = obj[key]
                        .replace(/[<>]/g, '') // 移除 < 和 >
                        .trim(); // 移除前後空格
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitize(obj[key]);
                }
            }
        };

        if (req.body) sanitize(req.body);
        if (req.query) sanitize(req.query);

        next();
    }

    // 檢查請求頻率（防止垃圾請求）
    static checkRequestFrequency(req, res, next) {
        const key = `req_freq_${req.ip}_${req.user?.userId || 'anonymous'}`;
        const now = Date.now();
        const windowMs = 1000; // 1秒窗口
        const maxRequests = 10; // 每秒最多10個請求

        // 這裡應該使用 Redis 或內存緩存，簡化示例
        if (!req.app.locals.requestFreq) {
            req.app.locals.requestFreq = new Map();
        }

        const userRequests = req.app.locals.requestFreq.get(key) || [];
        const recentRequests = userRequests.filter(time => now - time < windowMs);

        if (recentRequests.length >= maxRequests) {
            return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: 'Request frequency too high',
                code: ERROR_CODES.RATE_LIMIT_EXCEEDED
            });
        }

        recentRequests.push(now);
        req.app.locals.requestFreq.set(key, recentRequests);

        // 清理舊數據
        if (Math.random() < 0.01) { // 1% 的請求執行清理
            for (const [k, requests] of req.app.locals.requestFreq.entries()) {
                const recent = requests.filter(time => now - time < windowMs);
                if (recent.length === 0) {
                    req.app.locals.requestFreq.delete(k);
                } else {
                    req.app.locals.requestFreq.set(k, recent);
                }
            }
        }

        next();
    }
}

module.exports = ValidationMiddleware;