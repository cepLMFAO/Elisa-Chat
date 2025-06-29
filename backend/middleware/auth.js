const jwt = require('jsonwebtoken');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const User = require('../models/User');
const AuthService = require('../services/authService');
const logger = require('../utils/logger');

class AuthMiddleware {
    // 驗證令牌
    static async verifyToken(req, res, next) {
        try {
            let token;

            // 從 Authorization header 獲取令牌
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }

            // 從 cookie 獲取會話ID
            const sessionId = req.cookies.sessionId || req.headers['x-session-id'];

            if (!token && !sessionId) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: '需要認證',
                    code: ERROR_CODES.AUTH_REQUIRED
                });
            }

            let user;

            if (token) {
                // 驗證 JWT 令牌
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    user = await User.findByUuid(decoded.userId);
                } catch (jwtError) {
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                        success: false,
                        error: '令牌無效',
                        code: ERROR_CODES.TOKEN_INVALID
                    });
                }
            } else if (sessionId) {
                // 驗證會話
                const session = await AuthService.validateSession(sessionId);
                if (!session) {
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                        success: false,
                        error: '會話無效或已過期',
                        code: ERROR_CODES.AUTH_EXPIRED
                    });
                }
                user = session.user;
            }

            if (!user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            // 檢查用戶狀態
            if (user.status === 'banned') {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '帳戶已被禁用',
                    code: ERROR_CODES.USER_BLOCKED
                });
            }

            req.user = user;
            next();

        } catch (error) {
            logger.error('Auth middleware error', {
                error: error.message,
                path: req.path,
                ip: req.ip
            });

            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '認證過程中發生錯誤',
                code: ERROR_CODES.INTERNAL_ERROR
            });
        }
    }

    // 可選認證（不強制要求登錄）
    static async optionalAuth(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            const sessionId = req.cookies.sessionId;

            if (authHeader || sessionId) {
                return AuthMiddleware.verifyToken(req, res, next);
            }

            // 沒有提供認證信息，繼續執行但不設置 req.user
            next();

        } catch (error) {
            // 認證失敗也繼續執行
            next();
        }
    }

    // 要求管理員權限
    static requireAdmin(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: '需要認證',
                code: ERROR_CODES.AUTH_REQUIRED
            });
        }

        if (!req.user.isAdmin) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: '需要管理員權限',
                code: ERROR_CODES.PERMISSION_DENIED
            });
        }

        next();
    }

    // 要求版主權限
    static requireModerator(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: '需要認證',
                code: ERROR_CODES.AUTH_REQUIRED
            });
        }

        if (!req.user.isAdmin && !req.user.isModerator) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: '需要版主權限',
                code: ERROR_CODES.PERMISSION_DENIED
            });
        }

        next();
    }

    // 要求訪問自己的資源或管理員權限
    static requireSelfOrAdmin(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: '需要認證',
                code: ERROR_CODES.AUTH_REQUIRED
            });
        }

        const targetUserId = req.params.userId || req.params.id;

        if (req.user.uuid !== targetUserId && !req.user.isAdmin) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: '權限不足',
                code: ERROR_CODES.PERMISSION_DENIED
            });
        }

        next();
    }

    // 檢查郵箱是否已驗證
    static requireEmailVerified(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: '需要認證',
                code: ERROR_CODES.AUTH_REQUIRED
            });
        }

        if (!req.user.emailVerified) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: '需要驗證郵箱',
                code: ERROR_CODES.AUTH_REQUIRED
            });
        }

        next();
    }

    // 檢查兩因子認證
    static requireTwoFactor(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: '需要認證',
                code: ERROR_CODES.AUTH_REQUIRED
            });
        }

        if (req.user.twoFactorEnabled && !req.session?.twoFactorVerified) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: '需要兩因子認證',
                code: ERROR_CODES.TWO_FACTOR_REQUIRED
            });
        }

        next();
    }

    // 檢查用戶狀態
    static checkUserStatus(allowedStatuses = ['active']) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: '需要認證',
                    code: ERROR_CODES.AUTH_REQUIRED
                });
            }

            if (!allowedStatuses.includes(req.user.status)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '帳戶狀態不允許此操作',
                    code: ERROR_CODES.USER_BLOCKED
                });
            }

            next();
        };
    }

    // 檢查房間權限
    static async checkRoomPermission(req, res, next) {
        try {
            if (!req.user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: '需要認證',
                    code: ERROR_CODES.AUTH_REQUIRED
                });
            }

            const roomId = req.params.roomId;
            if (!roomId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '缺少房間ID',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 這裡應該檢查用戶是否有訪問房間的權限
            // 具體邏輯取決於您的房間權限模型
            const hasPermission = await AuthService.checkRoomPermission(req.user.uuid, roomId);

            if (!hasPermission) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '沒有訪問此房間的權限',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            next();

        } catch (error) {
            logger.error('Room permission check error', {
                error: error.message,
                userId: req.user?.uuid,
                roomId: req.params.roomId
            });

            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '權限檢查失敗',
                code: ERROR_CODES.INTERNAL_ERROR
            });
        }
    }

    // API 密鑰認證（用於服務間通信）
    static verifyApiKey(req, res, next) {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: '缺少 API 密鑰',
                code: ERROR_CODES.AUTH_REQUIRED
            });
        }

        if (apiKey !== process.env.API_SECRET_KEY) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'API 密鑰無效',
                code: ERROR_CODES.AUTH_INVALID
            });
        }

        next();
    }

    // 檢查設備限制
    static async checkDeviceLimit(req, res, next) {
        try {
            if (!req.user) {
                return next();
            }

            const deviceId = req.headers['x-device-id'];
            if (!deviceId) {
                return next();
            }

            const deviceCount = await AuthService.getUserDeviceCount(req.user.uuid);
            const maxDevices = process.env.MAX_DEVICES_PER_USER || 5;

            if (deviceCount >= maxDevices) {
                const isKnownDevice = await AuthService.isKnownDevice(req.user.uuid, deviceId);

                if (!isKnownDevice) {
                    return res.status(HTTP_STATUS.FORBIDDEN).json({
                        success: false,
                        error: '設備數量已達上限',
                        code: ERROR_CODES.PERMISSION_DENIED
                    });
                }
            }

            next();

        } catch (error) {
            logger.error('Device limit check error', {
                error: error.message,
                userId: req.user?.uuid
            });

            // 發生錯誤時不阻止請求
            next();
        }
    }

    // 記錄最後活動時間
    static async updateLastActivity(req, res, next) {
        if (req.user) {
            try {
                await AuthService.updateLastActivity(req.user.uuid, {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path
                });
            } catch (error) {
                logger.error('Update last activity error', {
                    error: error.message,
                    userId: req.user.uuid
                });
            }
        }
        next();
    }
}

module.exports = AuthMiddleware;