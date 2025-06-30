const rateLimit = require('express-rate-limit');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const logger = require('../utils/logger');

// 速率限制配置
const RATE_LIMIT = {
    WINDOW_MS: 15 * 60 * 1000, // 15分鐘
    MAX_REQUESTS: 100, // 基本限制
    LOGIN_ATTEMPTS: 5, // 登錄嘗試次數
    MESSAGE_LIMIT: 60, // 消息限制
    UPLOAD_LIMIT: 10, // 文件上傳限制
    SEARCH_LIMIT: 30, // 搜索限制
    CREATE_ROOM_LIMIT: 5, // 創建房間限制
    FRIEND_REQUEST_LIMIT: 20, // 好友請求限制
    SENSITIVE_ACTION_LIMIT: 10 // 敏感操作限制
};

// 創建鍵生成器
function createKeyGenerator(includeUserId = false) {
    return (req) => {
        const ip = req.ip || req.connection.remoteAddress;
        const userId = includeUserId && req.user ? req.user.userId : '';
        return `${ip}-${userId}`;
    };
}

// 創建速率限制處理器
function createRateLimitHandler(type) {
    return (req, res, next) => {
        logger.warn('Rate limit exceeded', {
            ip: req.ip,
            userId: req.user?.userId,
            type,
            path: req.path,
            method: req.method,
            userAgent: req.get('User-Agent')
        });

        // 不調用 next()，直接返回錯誤響應
        // 錯誤響應已經由 rateLimit 中間件處理
    };
}

// 創建跳過邏輯
function createSkipLogic(skipRoles = []) {
    return (req) => {
        if (!req.user) return false;
        return skipRoles.includes(req.user.role);
    };
}

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
        handler: createRateLimitHandler('general')
    });

    // 登錄速率限制
    static loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15分鐘
        max: RATE_LIMIT.LOGIN_ATTEMPTS,
        message: {
            success: false,
            error: 'Too many login attempts from this IP, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(),
        handler: createRateLimitHandler('login'),
        skipSuccessfulRequests: true,
        skipFailedRequests: false
    });

    // 消息發送速率限制
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
        skip: createSkipLogic(['admin'])
    });

    // 郵件發送速率限制
    static emailLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 3, // 每小時最多3封郵件
        message: {
            success: false,
            error: 'Too many email requests, please try again later.',
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: createKeyGenerator(true),
        handler: createRateLimitHandler('email')
    });

    // 敏感操作速率限制
    static sensitiveActionLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: RATE_LIMIT.SENSITIVE_ACTION_LIMIT,
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
        max: RATE_LIMIT.SEARCH_LIMIT,
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
        max: RATE_LIMIT.CREATE_ROOM_LIMIT,
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
        max: RATE_LIMIT.FRIEND_REQUEST_LIMIT,
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

    // 密碼重置速率限制
    static passwordResetLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 3, // 每小時最多3次密碼重置請求
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

    // 自定義慢速處理中間件（替代 express-slow-down）
    static createSlowDownMiddleware(options = {}) {
        const {
            windowMs = 15 * 60 * 1000, // 15分鐘
            delayAfter = 50, // 在50次請求後開始延遲
            delayMs = 500, // 每次增加500ms延遲
            maxDelayMs = 20000 // 最大延遲20秒
        } = options;

        const requests = new Map();

        return (req, res, next) => {
            const key = createKeyGenerator()(req);
            const now = Date.now();

            // 清理過期記錄
            if (requests.has(key)) {
                const requestData = requests.get(key);
                if (now - requestData.resetTime > windowMs) {
                    requests.delete(key);
                }
            }

            // 獲取或創建請求記錄
            if (!requests.has(key)) {
                requests.set(key, {
                    count: 0,
                    resetTime: now
                });
            }

            const requestData = requests.get(key);
            requestData.count++;

            // 計算延遲
            if (requestData.count > delayAfter) {
                const extraRequests = requestData.count - delayAfter;
                const delay = Math.min(extraRequests * delayMs, maxDelayMs);

                logger.info('Slowing down request', {
                    key,
                    count: requestData.count,
                    delay,
                    path: req.path
                });

                setTimeout(() => next(), delay);
            } else {
                next();
            }
        };
    }

    // 漸進式慢速處理
    static slowDownMiddleware = RateLimitMiddleware.createSlowDownMiddleware();

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
                upload: RATE_LIMIT.UPLOAD_LIMIT,
                search: RATE_LIMIT.SEARCH_LIMIT,
                createRoom: RATE_LIMIT.CREATE_ROOM_LIMIT,
                friendRequest: RATE_LIMIT.FRIEND_REQUEST_LIMIT,
                sensitiveAction: RATE_LIMIT.SENSITIVE_ACTION_LIMIT
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