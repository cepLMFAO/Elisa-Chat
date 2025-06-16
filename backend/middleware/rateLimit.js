const rateLimit = require('express-rate-limit');
const { RATE_LIMIT, HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const logger = require('../utils/logger');

// 創建自定義錯誤處理器
const createRateLimitHandler = (type) => (req, res) => {
    logger.security('Rate limit exceeded', {
        type,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        userId: req.user?.userId
    });

    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        retryAfter: Math.ceil(RATE_LIMIT.WINDOW_MS / 1000)
    });
};

// 創建自定義跳過邏輯
const createSkipLogic = (exemptRoles = []) => (req) => {
    // 跳過管理員和指定角色的速率限制
    if (req.user && exemptRoles.includes(req.user.role)) {
        return true;
    }
    return false;
};

// 創建自定義鍵生成器
const createKeyGenerator = (includeUserId = false) => (req) => {
    let key = req.ip;

    if (includeUserId && req.user?.userId) {
        key += ':' + req.user.userId;
    }

    return key;
};

class RateLimitMiddleware {
    // 通用速率限制
    static generalLimiter = rateLimit({
        windowMs: RATE_LIMIT.WINDOW_MS,
        max: RATE_LIMIT.MAX_REQUESTS,
        message: {
            success: false,
            error: 'Too many requests from this IP, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(),
        handler: createRateLimitHandler('general'),
        skip: createSkipLogic(['admin'])
    });

    // 認證相關速率限制（更嚴格）
    static authLimiter = rateLimit({
        windowMs: RATE_LIMIT.WINDOW_MS,
        max: RATE_LIMIT.LOGIN_ATTEMPTS,
        message: {
            success: false,
            error: 'Too many authentication attempts, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(),
        handler: createRateLimitHandler('auth'),
        skipSuccessfulRequests: true // 只計算失敗的請求
    });

    // 密碼重置速率限制
    static passwordResetLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 3, // 每小時最多3次
        message: {
            success: false,
            error: 'Too many password reset attempts, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(),
        handler: createRateLimitHandler('password_reset')
    });

    // 郵件發送速率限制
    static emailLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 5, // 每小時最多5封郵件
        message: {
            success: false,
            error: 'Too many email requests, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true), // 包含用戶ID
        handler: createRateLimitHandler('email'),
        skip: createSkipLogic(['admin'])
    });

    // 文件上傳速率限制
    static uploadLimiter = rateLimit({
        windowMs: 60 * 1000, // 1分鐘
        max: RATE_LIMIT.UPLOAD_LIMIT,
        message: {
            success: false,
            error: 'Too many file uploads, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true),
        handler: createRateLimitHandler('upload'),
        skip: createSkipLogic(['admin', 'moderator'])
    });

    // 訊息發送速率限制
    static messageLimiter = rateLimit({
        windowMs: 60 * 1000, // 1分鐘
        max: RATE_LIMIT.MESSAGE_LIMIT,
        message: {
            success: false,
            error: 'Too many messages sent, please slow down.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true),
        handler: createRateLimitHandler('message'),
        skip: createSkipLogic(['admin', 'moderator'])
    });

    // 敏感操作速率限制
    static sensitiveActionLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 10, // 每小時最多10次敏感操作
        message: {
            success: false,
            error: 'Too many sensitive actions, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true),
        handler: createRateLimitHandler('sensitive_action'),
        skip: createSkipLogic(['admin'])
    });

    // API調用速率限制
    static apiLimiter = rateLimit({
        windowMs: 60 * 1000, // 1分鐘
        max: 1000, // 每分鐘1000次API調用
        message: {
            success: false,
            error: 'API rate limit exceeded.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true),
        handler: createRateLimitHandler('api')
    });

    // 搜索速率限制
    static searchLimiter = rateLimit({
        windowMs: 60 * 1000, // 1分鐘
        max: 30, // 每分鐘30次搜索
        message: {
            success: false,
            error: 'Too many search requests, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true),
        handler: createRateLimitHandler('search'),
        skip: createSkipLogic(['admin', 'moderator'])
    });

    // WebSocket連接速率限制
    static wsConnectionLimiter = rateLimit({
        windowMs: 60 * 1000, // 1分鐘
        max: 10, // 每分鐘最多10次連接嘗試
        message: {
            success: false,
            error: 'Too many WebSocket connection attempts.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(),
        handler: createRateLimitHandler('ws_connection')
    });

    // 創建房間速率限制
    static createRoomLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 5, // 每小時最多創建5個房間
        message: {
            success: false,
            error: 'Too many room creation attempts, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true),
        handler: createRateLimitHandler('create_room'),
        skip: createSkipLogic(['admin', 'moderator'])
    });

    // 好友請求速率限制
    static friendRequestLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 20, // 每小時最多20個好友請求
        message: {
            success: false,
            error: 'Too many friend requests, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true),
        handler: createRateLimitHandler('friend_request'),
        skip: createSkipLogic(['admin'])
    });

    // 動態速率限制（根據用戶角色調整）
    static dynamicLimiter(baseMax, adminMultiplier = 10, modMultiplier = 5) {
        return (req, res, next) => {
            let maxRequests = baseMax;

            if (req.user) {
                switch (req.user.role) {
                    case 'admin':
                        maxRequests *= adminMultiplier;
                        break;
                    case 'moderator':
                        maxRequests *= modMultiplier;
                        break;
                    case 'premium':
                        maxRequests *= 2;
                        break;
                }
            }

            const limiter = rateLimit({
                windowMs: RATE_LIMIT.WINDOW_MS,
                max: maxRequests,
                keyGenerator: createKeyGenerator(true),
                handler: createRateLimitHandler('dynamic')
            });

            limiter(req, res, next);
        };
    }

    // 自定義速率限制（用於特殊情況）
    static createCustomLimiter(options) {
        const {
            windowMs = RATE_LIMIT.WINDOW_MS,
            max = RATE_LIMIT.MAX_REQUESTS,
            skipRoles = [],
            includeUserId = false,
            type = 'custom'
        } = options;

        return rateLimit({
            windowMs,
            max,
            message: {
                success: false,
                error: 'Rate limit exceeded for this operation.',
                code: ERROR_CODES.RATE_LIMIT_EXCEEDED
            },
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: createKeyGenerator(includeUserId),
            handler: createRateLimitHandler(type),
            skip: createSkipLogic(skipRoles)
        });
    }

    // IP白名單檢查
    static checkWhitelist(req, res, next) {
        const whitelist = process.env.IP_WHITELIST ?
            process.env.IP_WHITELIST.split(',') : [];

        if (whitelist.length > 0 && !whitelist.includes(req.ip)) {
            logger.security('IP not in whitelist', {
                ip: req.ip,
                path: req.path,
                method: req.method
            });

            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Access denied from this IP address',
                code: ERROR_CODES.ACCESS_DENIED
            });
        }

        next();
    }

    // 速率限制狀態檢查
    static async getRateLimitStatus(req, res) {
        try {
            const limits = {
                general: RATE_LIMIT.MAX_REQUESTS,
                auth: RATE_LIMIT.LOGIN_ATTEMPTS,
                message: RATE_LIMIT.MESSAGE_LIMIT,
                upload: RATE_LIMIT.UPLOAD_LIMIT
            };

            // 如果用戶已認證，根據角色調整限制
            if (req.user) {
                switch (req.user.role) {
                    case 'admin':
                        Object.keys(limits).forEach(key => {
                            limits[key] *= 10;
                        });
                        break;
                    case 'moderator':
                        Object.keys(limits).forEach(key => {
                            limits[key] *= 5;
                        });
                        break;
                    case 'premium':
                        Object.keys(limits).forEach(key => {
                            limits[key] *= 2;
                        });
                        break;
                }
            }

            res.json({
                success: true,
                data: {
                    limits,
                    windowMs: RATE_LIMIT.WINDOW_MS,
                    userRole: req.user?.role || 'guest'
                }
            });

        } catch (error) {
            logger.error('Failed to get rate limit status', {
                error: error.message
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get rate limit status'
            });
        }
    }
}

module.exports = RateLimitMiddleware;