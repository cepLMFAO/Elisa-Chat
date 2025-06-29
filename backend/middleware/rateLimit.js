const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../config/constants');

class RateLimitMiddleware {
    // 通用速率限制
    static generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15分鐘
        max: 100, // 限制每個IP在窗口期內最多100個請求
        message: {
            success: false,
            error: '請求過於頻繁，請稍後再試',
            retryAfter: Math.ceil(15 * 60)
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '請求過於頻繁，請稍後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 登錄速率限制
    static loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15分鐘
        max: 5, // 限制每個IP在窗口期內最多5次登錄嘗試
        message: {
            success: false,
            error: '登錄嘗試過於頻繁，請15分鐘後再試',
            retryAfter: Math.ceil(15 * 60)
        },
        skipSuccessfulRequests: true, // 成功的請求不計入限制
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '登錄嘗試過於頻繁，請15分鐘後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 註冊速率限制
    static registerLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 3, // 限制每個IP在1小時內最多3次註冊嘗試
        message: {
            success: false,
            error: '註冊嘗試過於頻繁，請1小時後再試',
            retryAfter: Math.ceil(60 * 60)
        },
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '註冊嘗試過於頻繁，請1小時後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 郵件速率限制
    static emailLimiter = rateLimit({
        windowMs: 5 * 60 * 1000, // 5分鐘
        max: 2, // 限制每個IP在5分鐘內最多發送2封郵件
        message: {
            success: false,
            error: '郵件發送過於頻繁，請5分鐘後再試',
            retryAfter: Math.ceil(5 * 60)
        },
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '郵件發送過於頻繁，請5分鐘後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 密碼重置速率限制
    static passwordResetLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 3, // 限制每個IP在1小時內最多3次密碼重置
        message: {
            success: false,
            error: '密碼重置過於頻繁，請1小時後再試',
            retryAfter: Math.ceil(60 * 60)
        },
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '密碼重置過於頻繁，請1小時後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 密碼更改速率限制
    static passwordChangeLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 5, // 限制每個用戶在1小時內最多5次密碼更改
        keyGenerator: (req) => req.user?.userId || req.ip,
        message: {
            success: false,
            error: '密碼更改過於頻繁，請1小時後再試',
            retryAfter: Math.ceil(60 * 60)
        },
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '密碼更改過於頻繁，請1小時後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 資料更新速率限制
    static profileUpdateLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15分鐘
        max: 10, // 限制每個用戶在15分鐘內最多10次資料更新
        keyGenerator: (req) => req.user?.userId || req.ip,
        message: {
            success: false,
            error: '資料更新過於頻繁，請稍後再試',
            retryAfter: Math.ceil(15 * 60)
        },
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '資料更新過於頻繁，請稍後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 敏感操作速率限制
    static sensitiveActionLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1小時
        max: 5, // 限制每個用戶在1小時內最多5次敏感操作
        keyGenerator: (req) => req.user?.userId || req.ip,
        message: {
            success: false,
            error: '敏感操作過於頻繁，請1小時後再試',
            retryAfter: Math.ceil(60 * 60)
        },
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '敏感操作過於頻繁，請1小時後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 文件上傳速率限制
    static uploadLimiter = rateLimit({
        windowMs: 10 * 60 * 1000, // 10分鐘
        max: 20, // 限制每個用戶在10分鐘內最多20次文件上傳
        keyGenerator: (req) => req.user?.userId || req.ip,
        message: {
            success: false,
            error: '文件上傳過於頻繁，請稍後再試',
            retryAfter: Math.ceil(10 * 60)
        },
        handler: (req, res) => {
            res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                success: false,
                error: '文件上傳過於頻繁，請稍後再試',
                retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
            });
        }
    });

    // 自定義速率限制創建器
    static createCustomLimiter(options = {}) {
        const defaultOptions = {
            windowMs: 15 * 60 * 1000,
            max: 100,
            message: {
                success: false,
                error: '請求過於頻繁，請稍後再試'
            },
            standardHeaders: true,
            legacyHeaders: false
        };

        return rateLimit({
            ...defaultOptions,
            ...options,
            handler: (req, res) => {
                res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                    success: false,
                    error: options.message?.error || '請求過於頻繁，請稍後再試',
                    retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
                });
            }
        });
    }
}

module.exports = RateLimitMiddleware;