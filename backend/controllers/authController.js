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

            // 基本驗證
            if (!identifier || !password) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Email/username and password are required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 用戶登錄
            const result = await AuthService.login({
                identifier,
                password,
                twoFactorToken
            }, req);

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

            if (error.message.includes('Invalid credentials')) {
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

    // 檢查認證狀態
    static async getAuthStatus(req, res) {
        try {
            const isAuthenticated = !!req.user;

            res.json({
                success: true,
                data: {
                    isAuthenticated,
                    user: isAuthenticated ? req.user : null
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

    // 忘記密碼
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Email is required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            await AuthService.forgotPassword(email);

            // 總是返回成功，即使郵箱不存在（安全考慮）
            res.json({
                success: true,
                message: 'If the email exists, a password reset link has been sent'
            });

        } catch (error) {
            logger.error('Forgot password error', {
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

            await AuthService.resetPassword(token, password);

            res.json({
                success: true,
                message: 'Password reset successfully'
            });

        } catch (error) {
            logger.error('Reset password error', {
                error: error.message,
                token: req.body.token
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Password reset failed';

            if (error.message.includes('Invalid') || error.message.includes('expired')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = 'Invalid or expired reset token';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 更改密碼
    static async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.userId;

            if (!currentPassword || !newPassword) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Current password and new password are required',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            await AuthService.changePassword(userId, currentPassword, newPassword);

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
            let errorMessage = 'Password change failed';

            if (error.message.includes('Invalid current password')) {
                statusCode = HTTP_STATUS.UNAUTHORIZED;
                errorMessage = 'Invalid current password';
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

            await AuthService.verifyEmail(token);

            res.json({
                success: true,
                message: 'Email verified successfully'
            });

        } catch (error) {
            logger.error('Email verification error', {
                error: error.message,
                token: req.params.token
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Email verification failed';

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

    // 重新發送郵箱驗證
    static async resendEmailVerification(req, res) {
        try {
            const userId = req.user.userId;

            await AuthService.resendEmailVerification(userId);

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
                error: 'Failed to send verification email'
            });
        }
    }

    // 檢查用戶名可用性
    static async checkUsernameAvailability(req, res) {
        try {
            const { username } = req.params;

            const isAvailable = await AuthService.checkUsernameAvailability(username);

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

            const isAvailable = await AuthService.checkEmailAvailability(email);

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

    // 設置雙因素認證
    static async setupTwoFactor(req, res) {
        try {
            const userId = req.user.userId;

            const result = await AuthService.setupTwoFactor(userId);

            res.json({
                success: true,
                message: 'Two-factor authentication setup initiated',
                data: result
            });

        } catch (error) {
            logger.error('Setup two-factor error', {
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

            const result = await AuthService.verifyTwoFactor(userId, token);

            res.json({
                success: true,
                message: 'Two-factor authentication enabled successfully',
                data: result
            });

        } catch (error) {
            logger.error('Verify two-factor error', {
                error: error.message,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = 'Two-factor verification failed';

            if (error.message.includes('Invalid token')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = 'Invalid two-factor token';
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
            logger.error('Disable two-factor error', {
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

            const destroyedCount = await AuthService.destroyAllOtherSessions(userId, currentSessionId);

            res.json({
                success: true,
                message: `${destroyedCount} sessions destroyed successfully`,
                data: {
                    destroyedCount
                }
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
}

module.exports = AuthController;