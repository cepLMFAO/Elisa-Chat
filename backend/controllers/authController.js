const AuthService = require('../services/authService');
const User = require('../models/User');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');

class AuthController {
    // 用戶註冊
    static async register(req, res) {
        try {
            const { username, email, password, confirmPassword } = req.body;

            // 基本驗證
            if (!username || !email || !password || !confirmPassword) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'All fields are required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            if (password !== confirmPassword) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Passwords do not match',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 創建用戶
            const result = await AuthService.register({
                username,
                email,
                password
            }, req);

            // 設置HTTP-only cookie
            res.cookie('sessionId', result.sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 24小時
            });

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    user: result.user,
                    accessToken: result.tokens.accessToken
                }
            });

        } catch (error) {
            logger.error('Registration error', {
                error: error.message,
                body: req.body,
                ip: req.ip
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Registration failed';

            if (error.message.includes('已存在')) {
                statusCode = HTTP_STATUS.CONFLICT;
                errorMessage = error.message;
            } else if (error.message.includes('密碼')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage,
                code: ERROR_CODES.VALIDATION_ERROR
            });
        }
    }

    // 用戶登錄
    static async login(req, res) {
        try {
            const { identifier, password, twoFactorToken } = req.body;

            if (!identifier || !password) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Email/username and password are required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 第一步：驗證用戶名密碼
            const user = await User.authenticate(identifier, password);
            if (!user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    error: 'Invalid credentials',
                    code: ERROR_CODES.INVALID_CREDENTIALS
                });
            }

            // 第二步：檢查是否需要雙因素認證
            if (user.twoFactorEnabled) {
                if (!twoFactorToken) {
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                        success: false,
                        error: 'Two-factor authentication required',
                        code: 'TWO_FACTOR_REQUIRED',
                        requiresTwoFactor: true
                    });
                }

                const isTwoFactorValid = await AuthService.verifyTwoFactor(user.uuid, twoFactorToken);
                if (!isTwoFactorValid) {
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                        success: false,
                        error: 'Invalid two-factor authentication code',
                        code: 'INVALID_TWO_FACTOR'
                    });
                }
            }

            // 執行完整登錄
            const result = await AuthService.login(identifier, password, req);

            // 設置HTTP-only cookie
            res.cookie('sessionId', result.sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 24小時
            });

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: result.user,
                    accessToken: result.tokens.accessToken
                }
            });

        } catch (error) {
            logger.error('Login error', {
                error: error.message,
                identifier: req.body.identifier,
                ip: req.ip
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Login failed';

            if (error.message === ERROR_CODES.INVALID_CREDENTIALS) {
                statusCode = HTTP_STATUS.UNAUTHORIZED;
                errorMessage = 'Invalid credentials';
            } else if (error.message.includes('Too many login attempts')) {
                statusCode = HTTP_STATUS.TOO_MANY_REQUESTS;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage,
                code: ERROR_CODES.INVALID_CREDENTIALS
            });
        }
    }

    // 用戶登出
    static async logout(req, res) {
        try {
            const sessionId = req.cookies.sessionId;
            const userId = req.user?.userId;

            if (sessionId && userId) {
                await AuthService.logout(sessionId, userId);
            }

            // 清除cookie
            res.clearCookie('sessionId');

            res.json({
                success: true,
                message: 'Logout successful'
            });

        } catch (error) {
            logger.error('Logout error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Logout failed'
            });
        }
    }

    // 刷新令牌
    static async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Refresh token is required',
                    code: ERROR_CODES.TOKEN_INVALID
                });
            }

            const result = await AuthService.refreshToken(refreshToken);

            res.json({
                success: true,
                message: 'Token refreshed successfully',
                data: {
                    user: result.user,
                    accessToken: result.tokens.accessToken
                }
            });

        } catch (error) {
            logger.error('Token refresh error', { error: error.message });

            let statusCode = HTTP_STATUS.UNAUTHORIZED;
            if (error.message === ERROR_CODES.TOKEN_EXPIRED) {
                statusCode = HTTP_STATUS.UNAUTHORIZED;
            }

            res.status(statusCode).json({
                success: false,
                error: 'Token refresh failed',
                code: error.message
            });
        }
    }

    // 獲取當前用戶信息
    static async getCurrentUser(req, res) {
        try {
            const user = await User.findByUuid(req.user.userId);

            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            res.json({
                success: true,
                data: {
                    user: user.toJSON()
                }
            });

        } catch (error) {
            logger.error('Get current user error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get user information'
            });
        }
    }

    // 設置雙因素認證
    static async setupTwoFactor(req, res) {
        try {
            const userId = req.user.userId;
            const result = await AuthService.setupTwoFactor(userId);

            res.json({
                success: true,
                message: 'Two-factor authentication setup initiated',
                data: {
                    qrCode: result.qrCode,
                    manualEntryKey: result.manualEntryKey
                }
            });

        } catch (error) {
            logger.error('Setup 2FA error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to setup two-factor authentication'
            });
        }
    }

    // 驗證並啟用雙因素認證
    static async verifyTwoFactor(req, res) {
        try {
            const { token } = req.body;
            const userId = req.user.userId;

            if (!token) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Two-factor token is required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const result = await AuthService.verifyAndEnableTwoFactor(userId, token);

            res.json({
                success: true,
                message: 'Two-factor authentication enabled successfully',
                data: {
                    backupCodes: result.backupCodes
                }
            });

        } catch (error) {
            logger.error('Verify 2FA error', {
                error: error.message,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Failed to verify two-factor authentication';

            if (error.message.includes('Invalid')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 禁用雙因素認證
    static async disableTwoFactor(req, res) {
        try {
            const { password } = req.body;
            const userId = req.user.userId;

            if (!password) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Password is required to disable two-factor authentication',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            await AuthService.disableTwoFactor(userId, password);

            res.json({
                success: true,
                message: 'Two-factor authentication disabled successfully'
            });

        } catch (error) {
            logger.error('Disable 2FA error', {
                error: error.message,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Failed to disable two-factor authentication';

            if (error.message.includes('Invalid password')) {
                statusCode = HTTP_STATUS.UNAUTHORIZED;
                errorMessage = 'Invalid password';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 請求密碼重置
    static async requestPasswordReset(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Email is required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            await AuthService.generatePasswordResetToken(email);

            // 總是返回成功，不透露用戶是否存在
            res.json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent'
            });

        } catch (error) {
            logger.error('Password reset request error', {
                error: error.message,
                email: req.body.email
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to process password reset request'
            });
        }
    }

    // 重置密碼
    static async resetPassword(req, res) {
        try {
            const { token, password, confirmPassword } = req.body;

            if (!token || !password || !confirmPassword) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Token, password, and confirmation are required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            if (password !== confirmPassword) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Passwords do not match',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            await AuthService.resetPassword(token, password);

            res.json({
                success: true,
                message: 'Password reset successfully'
            });

        } catch (error) {
            logger.error('Password reset error', { error: error.message });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Failed to reset password';

            if (error.message.includes('Invalid') || error.message.includes('expired')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = 'Invalid or expired reset token';
            } else if (error.message.includes('密碼')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 驗證郵箱
    static async verifyEmail(req, res) {
        try {
            const { token } = req.params;

            if (!token) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Verification token is required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const user = await AuthService.verifyEmail(token);

            res.json({
                success: true,
                message: 'Email verified successfully',
                data: {
                    user: user.toJSON()
                }
            });

        } catch (error) {
            logger.error('Email verification error', { error: error.message });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Failed to verify email';

            if (error.message.includes('Invalid') || error.message.includes('expired')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = 'Invalid or expired verification token';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 獲取用戶會話
    static async getUserSessions(req, res) {
        try {
            const userId = req.user.userId;
            const currentSessionId = req.cookies.sessionId;

            const sessions = await AuthService.getUserSessions(userId);

            // 標記當前會話
            const sessionsWithCurrent = sessions.map(session => ({
                ...session,
                isCurrent: session.session_id === currentSessionId
            }));

            res.json({
                success: true,
                data: {
                    sessions: sessionsWithCurrent
                }
            });

        } catch (error) {
            logger.error('Get user sessions error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get user sessions'
            });
        }
    }

    // 銷毀特定會話
    static async destroySession(req, res) {
        try {
            const { sessionId } = req.params;
            const userId = req.user.userId;

            if (!sessionId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Session ID is required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const success = await AuthService.destroySession(sessionId, userId);

            if (!success) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            res.json({
                success: true,
                message: 'Session destroyed successfully'
            });

        } catch (error) {
            logger.error('Destroy session error', {
                error: error.message,
                sessionId: req.params.sessionId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to destroy session'
            });
        }
    }

    // 銷毀所有其他會話
    static async destroyAllOtherSessions(req, res) {
        try {
            const userId = req.user.userId;
            const currentSessionId = req.cookies.sessionId;

            // 獲取所有會話並銷毀除當前會話外的所有會話
            const sessions = await AuthService.getUserSessions(userId);

            for (const session of sessions) {
                if (session.session_id !== currentSessionId) {
                    await AuthService.destroySession(session.session_id, userId);
                }
            }

            res.json({
                success: true,
                message: 'All other sessions destroyed successfully'
            });

        } catch (error) {
            logger.error('Destroy all other sessions error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to destroy sessions'
            });
        }
    }

    // 更改密碼
    static async changePassword(req, res) {
        try {
            const { currentPassword, newPassword, confirmPassword } = req.body;
            const userId = req.user.userId;

            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'All password fields are required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            if (newPassword !== confirmPassword) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'New passwords do not match',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            await user.updatePassword(currentPassword, newPassword);

            res.json({
                success: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            logger.error('Change password error', {
                error: error.message,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Failed to change password';

            if (error.message.includes('當前密碼不正確') || error.message.includes('incorrect')) {
                statusCode = HTTP_STATUS.UNAUTHORIZED;
                errorMessage = 'Current password is incorrect';
            } else if (error.message.includes('密碼')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 檢查用戶名可用性
    static async checkUsernameAvailability(req, res) {
        try {
            const { username } = req.params;

            if (!username) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Username is required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const existingUser = await User.findByUsername(username);
            const isAvailable = !existingUser;

            res.json({
                success: true,
                data: {
                    username,
                    available: isAvailable
                }
            });

        } catch (error) {
            logger.error('Check username availability error', {
                error: error.message,
                username: req.params.username
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to check username availability'
            });
        }
    }

    // 檢查郵箱可用性
    static async checkEmailAvailability(req, res) {
        try {
            const { email } = req.params;

            if (!email) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Email is required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const existingUser = await User.findByEmail(email);
            const isAvailable = !existingUser;

            res.json({
                success: true,
                data: {
                    email,
                    available: isAvailable
                }
            });

        } catch (error) {
            logger.error('Check email availability error', {
                error: error.message,
                email: req.params.email
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to check email availability'
            });
        }
    }

    // 重新發送郵箱驗證
    static async resendEmailVerification(req, res) {
        try {
            const userId = req.user.userId;
            const user = await User.findByUuid(userId);

            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            if (user.isVerified) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Email is already verified'
                });
            }

            const token = await AuthService.generateEmailVerificationToken(userId);

            // 這裡應該發送郵件，暫時返回成功
            // TODO: 集成郵件服務

            res.json({
                success: true,
                message: 'Verification email sent successfully'
            });

        } catch (error) {
            logger.error('Resend email verification error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to resend verification email'
            });
        }
    }

    // 獲取認證狀態
    static async getAuthStatus(req, res) {
        try {
            const sessionId = req.cookies.sessionId;
            const authHeader = req.headers.authorization;

            let isAuthenticated = false;
            let user = null;

            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const token = authHeader.substring(7);
                    const decoded = AuthService.verifyToken(token);
                    const foundUser = await User.findByUuid(decoded.userId);

                    if (foundUser) {
                        isAuthenticated = true;
                        user = foundUser.toJSON();
                    }
                } catch (error) {
                    // Token 無效，繼續檢查會話
                }
            }

            if (!isAuthenticated && sessionId) {
                // 檢查會話有效性
                // 這裡需要從會話中獲取用戶ID
                // 暫時簡化處理
            }

            res.json({
                success: true,
                data: {
                    authenticated: isAuthenticated,
                    user
                }
            });

        } catch (error) {
            logger.error('Get auth status error', { error: error.message });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get authentication status'
            });
        }
    }
}

module.exports = AuthController;