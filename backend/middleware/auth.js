const AuthService = require('../services/authService');
const User = require('../models/User');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, USER_ROLES } = require('../config/constants');

class AuthMiddleware {
    // 驗證JWT令牌
    static async verifyToken(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            const sessionId = req.cookies.sessionId;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: 'Access token is required',
                    code: ERROR_CODES.TOKEN_INVALID
                });
            }

            const token = authHeader.substring(7);
            const decoded = AuthService.verifyToken(token);

            // 驗證會話（如果提供）
            if (sessionId) {
                const isSessionValid = await AuthService.validateSession(sessionId, decoded.userId);
                if (!isSessionValid) {
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                        success: false,
                        error: 'Session expired',
                        code: ERROR_CODES.TOKEN_EXPIRED
                    });
                }
            }

            // 獲取用戶信息
            const user = await User.findByUuid(decoded.userId);
            if (!user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: 'User not found',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            // 檢查用戶狀態
            if (user.status === 'deleted' || user.status === 'banned') {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: 'Account is not active',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            // 將用戶信息添加到請求對象
            req.user = {
                userId: user.uuid,
                username: user.username,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                twoFactorEnabled: user.twoFactorEnabled
            };

            next();

        } catch (error) {
            logger.error('Token verification error', {
                error: error.message,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            let statusCode = HTTP_STATUS.UNAUTHORIZED;
            let errorCode = ERROR_CODES.TOKEN_INVALID;

            if (error.message === ERROR_CODES.TOKEN_EXPIRED) {
                errorCode = ERROR_CODES.TOKEN_EXPIRED;
            }

            res.status(statusCode).json({
                success: false,
                error: 'Authentication failed',
                code: errorCode
            });
        }
    }

    // 可選的令牌驗證（不強制要求認證）
    static async optionalAuth(req, res, next) {
        try {
            const authHeader = req.headers.authorization;

            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                const decoded = AuthService.verifyToken(token);
                const user = await User.findByUuid(decoded.userId);

                if (user && user.status !== 'deleted' && user.status !== 'banned') {
                    req.user = {
                        userId: user.uuid,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        isVerified: user.isVerified,
                        twoFactorEnabled: user.twoFactorEnabled
                    };
                }
            }

            next();

        } catch (error) {
            // 可選認證失敗時不返回錯誤，繼續處理
            next();
        }
    }

    // 角色驗證中間件
    static requireRole(...allowedRoles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: 'Authentication required',
                    code: ERROR_CODES.TOKEN_INVALID
                });
            }

            if (!allowedRoles.includes(req.user.role)) {
                logger.security('Access denied - insufficient role', {
                    userId: req.user.userId,
                    userRole: req.user.role,
                    requiredRoles: allowedRoles,
                    path: req.path,
                    method: req.method
                });

                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: 'Insufficient permissions',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            next();
        };
    }

    // 管理員權限驗證
    static requireAdmin(req, res, next) {
        return AuthMiddleware.requireRole(USER_ROLES.ADMIN)(req, res, next);
    }

    // 版主權限驗證
    static requireModerator(req, res, next) {
        return AuthMiddleware.requireRole(USER_ROLES.ADMIN, USER_ROLES.MODERATOR)(req, res, next);
    }

    // 郵箱驗證要求
    static requireEmailVerification(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'Authentication required',
                code: ERROR_CODES.TOKEN_INVALID
            });
        }

        if (!req.user.isVerified) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Email verification required',
                code: 'EMAIL_VERIFICATION_REQUIRED'
            });
        }

        next();
    }

    // 雙因素認證檢查
    static checkTwoFactor(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'Authentication required',
                code: ERROR_CODES.TOKEN_INVALID
            });
        }

        // 如果用戶啟用了雙因素認證但當前會話未驗證
        if (req.user.twoFactorEnabled && !req.session?.twoFactorVerified) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'Two-factor authentication required',
                code: 'TWO_FACTOR_REQUIRED'
            });
        }

        next();
    }

    // 自己或管理員權限（用於訪問個人資源）
    static requireSelfOrAdmin(req, res, next) {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'Authentication required',
                code: ERROR_CODES.TOKEN_INVALID
            });
        }

        const targetUserId = req.params.userId || req.params.uuid;
        const isOwner = req.user.userId === targetUserId;
        const isAdmin = req.user.role === USER_ROLES.ADMIN;

        if (!isOwner && !isAdmin) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Access denied',
                code: ERROR_CODES.ACCESS_DENIED
            });
        }

        next();
    }

    // 房間成員驗證
    static async requireRoomMember(req, res, next) {
        try {
            if (!req.user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: 'Authentication required',
                    code: ERROR_CODES.TOKEN_INVALID
                });
            }

            const roomId = req.params.roomId || req.body.roomId;
            if (!roomId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Room ID is required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const database = require('../config/database');
            const membership = await database.get(
                `SELECT rm.role FROM room_members rm
                 JOIN rooms r ON rm.room_uuid = r.uuid
                 WHERE r.uuid = ? AND rm.user_uuid = ?`,
                [roomId, req.user.userId]
            );

            if (!membership) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: 'Not a member of this room',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            req.roomMembership = membership;
            next();

        } catch (error) {
            logger.error('Room membership verification error', {
                error: error.message,
                userId: req.user?.userId,
                roomId: req.params.roomId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to verify room membership'
            });
        }
    }

    // 房間管理員權限
    static requireRoomAdmin(req, res, next) {
        if (!req.roomMembership) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Room membership required',
                code: ERROR_CODES.ACCESS_DENIED
            });
        }

        const allowedRoles = ['owner', 'admin'];
        if (!allowedRoles.includes(req.roomMembership.role)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'Room admin privileges required',
                code: ERROR_CODES.ACCESS_DENIED
            });
        }

        next();
    }

    // API密鑰驗證（用於服務到服務的調用）
    static verifyApiKey(req, res, next) {
        const apiKey = req.headers['x-api-key'];
        const expectedApiKey = process.env.API_KEY;

        if (!expectedApiKey) {
            return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
                success: false,
                error: 'API key authentication not configured'
            });
        }

        if (!apiKey || apiKey !== expectedApiKey) {
            logger.security('Invalid API key attempt', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                providedKey: apiKey ? 'present' : 'missing'
            });

            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'Invalid API key',
                code: ERROR_CODES.ACCESS_DENIED
            });
        }

        next();
    }

    // WebSocket 認證
    static async authenticateWebSocket(socket, next) {
        try {
            const token = socket.handshake.auth.token || socket.handshake.query.token;

            if (!token) {
                return next(new Error('Authentication token required'));
            }

            const decoded = AuthService.verifyToken(token);
            const user = await User.findByUuid(decoded.userId);

            if (!user) {
                return next(new Error('User not found'));
            }

            if (user.status === 'deleted' || user.status === 'banned') {
                return next(new Error('Account is not active'));
            }

            socket.userId = user.uuid;
            socket.user = {
                userId: user.uuid,
                username: user.username,
                email: user.email,
                role: user.role,
                avatar: user.avatar
            };

            logger.websocket('WebSocket authenticated', user.uuid, {
                socketId: socket.id,
                ip: socket.handshake.address
            });

            next();

        } catch (error) {
            logger.error('WebSocket authentication error', {
                error: error.message,
                socketId: socket.id,
                ip: socket.handshake.address
            });

            next(new Error('Authentication failed'));
        }
    }

    // 會話清理中間件
    static async sessionCleanup(req, res, next) {
        try {
            // 定期清理過期會話
            if (Math.random() < 0.01) { // 1% 的請求執行清理
                setImmediate(() => {
                    AuthService.cleanupExpiredSessions().catch(error => {
                        logger.error('Session cleanup error', { error: error.message });
                    });
                });
            }

            next();

        } catch (error) {
            // 清理錯誤不應該影響正常請求
            next();
        }
    }

    // 用戶活動追蹤
    static trackUserActivity(req, res, next) {
        if (req.user) {
            setImmediate(async () => {
                try {
                    const user = await User.findByUuid(req.user.userId);
                    if (user) {
                        await user.updateStatus(user.status); // 更新最後活動時間
                    }
                } catch (error) {
                    logger.error('User activity tracking error', {
                        error: error.message,
                        userId: req.user.userId
                    });
                }
            });
        }

        next();
    }
}

module.exports = AuthMiddleware;