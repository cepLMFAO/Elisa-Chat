const AuthService = require('../services/authService');
const User = require('../models/User');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const Validators = require('../utils/validators');

class AuthController {
    // 用戶註冊
    static async register(req, res) {
        try {
            const { username, email, password, confirmPassword, agreeTerms } = req.body;

            // 驗證輸入
            const validationErrors = [];

            const usernameValidation = Validators.validateUsername(username);
            if (!usernameValidation.isValid) {
                validationErrors.push(...usernameValidation.errors);
            }

            const emailValidation = Validators.validateEmail(email);
            if (!emailValidation.isValid) {
                validationErrors.push(...emailValidation.errors);
            }

            const passwordValidation = Validators.validatePassword(password);
            if (!passwordValidation.isValid) {
                validationErrors.push(...passwordValidation.errors);
            }

            if (password !== confirmPassword) {
                validationErrors.push('密碼確認不匹配');
            }

            if (validationErrors.length > 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '註冊信息驗證失敗',
                    code: ERROR_CODES.VALIDATION_ERROR,
                    details: validationErrors
                });
            }

            // 檢查用戶是否已存在
            const existingUserByEmail = await User.findByEmail(emailValidation.sanitized);
            if (existingUserByEmail) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: '此郵箱已被註冊',
                    code: ERROR_CODES.USER_ALREADY_EXISTS
                });
            }

            const existingUserByUsername = await User.findByUsername(usernameValidation.sanitized);
            if (existingUserByUsername) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: '此用戶名已被使用',
                    code: ERROR_CODES.USER_ALREADY_EXISTS
                });
            }

            // 創建用戶
            const result = await AuthService.register({
                username: usernameValidation.sanitized,
                email: emailValidation.sanitized,
                password: password
            }, req);

            // 設置HTTP-only cookie
            res.cookie('sessionId', result.sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/'
            });

            logger.auth('User registered successfully', result.user.uuid, {
                username: result.user.username,
                email: result.user.email,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: '註冊成功',
                data: {
                    user: {
                        uuid: result.user.uuid,
                        username: result.user.username,
                        email: result.user.email,
                        avatar: result.user.avatar,
                        status: result.user.status,
                        createdAt: result.user.createdAt
                    },
                    accessToken: result.tokens.accessToken
                }
            });

        } catch (error) {
            logger.error('Registration error', {
                error: error.message,
                stack: error.stack,
                body: {
                    username: req.body.username,
                    email: req.body.email
                },
                ip: req.ip
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '註冊失敗，請稍後再試';
            let errorCode = ERROR_CODES.INTERNAL_ERROR;

            if (error.message.includes('UNIQUE constraint failed')) {
                statusCode = HTTP_STATUS.CONFLICT;
                errorMessage = '用戶名或郵箱已被使用';
                errorCode = ERROR_CODES.USER_ALREADY_EXISTS;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage,
                code: errorCode
            });
        }
    }

    // 用戶登錄
    static async login(req, res) {
        try {
            const { identifier, password, rememberMe } = req.body;

            if (!identifier || !password) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '請填寫完整的登錄信息',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 檢查登錄嘗試次數
            await AuthService.checkLoginAttempts(req.ip);

            const result = await AuthService.login(identifier, password, req);

            // 設置cookie
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/'
            };

            if (rememberMe) {
                cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
            } else {
                cookieOptions.maxAge = 24 * 60 * 60 * 1000; // 24小時
            }

            res.cookie('sessionId', result.sessionId, cookieOptions);

            res.json({
                success: true,
                message: '登錄成功',
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
            let errorMessage = '登錄失敗';

            if (error.message.includes('Invalid credentials')) {
                statusCode = HTTP_STATUS.UNAUTHORIZED;
                errorMessage = '用戶名或密碼錯誤';
            } else if (error.message.includes('Too many attempts')) {
                statusCode = HTTP_STATUS.TOO_MANY_REQUESTS;
                errorMessage = '登錄嘗試次數過多，請稍後再試';
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
            const sessionId = req.cookies.sessionId || req.headers['x-session-id'];
            const userId = req.user?.uuid;

            if (sessionId) {
                await AuthService.logout(sessionId, userId);
            }

            res.clearCookie('sessionId', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/'
            });

            res.json({
                success: true,
                message: '登出成功'
            });

        } catch (error) {
            logger.error('Logout error', {
                error: error.message,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '登出失敗'
            });
        }
    }

    // 檢查認證狀態
    static async checkAuth(req, res) {
        try {
            const sessionId = req.cookies.sessionId || req.headers['x-session-id'];

            if (!sessionId) {
                return res.json({
                    success: false,
                    data: { authenticated: false }
                });
            }

            const session = await AuthService.validateSession(sessionId);

            if (!session) {
                return res.json({
                    success: false,
                    data: { authenticated: false }
                });
            }

            res.json({
                success: true,
                data: {
                    authenticated: true,
                    user: session.user
                }
            });

        } catch (error) {
            logger.error('Auth check error', {
                error: error.message
            });

            res.json({
                success: false,
                data: { authenticated: false }
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

            res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'Token refresh failed',
                code: ERROR_CODES.TOKEN_EXPIRED
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

    // 更新用戶資料
    static async updateProfile(req, res) {
        try {
            const { username, email, displayName, bio, avatar } = req.body;
            const userId = req.user.userId;

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: 'User not found'
                });
            }

            // 檢查用戶名和郵箱是否已被其他用戶使用
            if (username && username !== user.username) {
                const existingUser = await User.findByUsername(username);
                if (existingUser && existingUser.uuid !== userId) {
                    return res.status(HTTP_STATUS.CONFLICT).json({
                        success: false,
                        error: '用戶名已被使用'
                    });
                }
            }

            if (email && email !== user.email) {
                const existingUser = await User.findByEmail(email);
                if (existingUser && existingUser.uuid !== userId) {
                    return res.status(HTTP_STATUS.CONFLICT).json({
                        success: false,
                        error: '郵箱已被使用'
                    });
                }
            }

            // 更新用戶信息
            const updateData = {};
            if (username) updateData.username = username;
            if (email) updateData.email = email;
            if (displayName !== undefined) updateData.displayName = displayName;
            if (bio !== undefined) updateData.bio = bio;
            if (avatar) updateData.avatar = avatar;

            const updatedUser = await user.update(updateData);

            res.json({
                success: true,
                message: '資料更新成功',
                data: {
                    user: updatedUser.toJSON()
                }
            });

        } catch (error) {
            logger.error('Profile update error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '資料更新失敗'
            });
        }
    }

    // 更改密碼
    static async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.userId;

            const result = await AuthService.changePassword(userId, currentPassword, newPassword);

            res.json({
                success: true,
                message: '密碼更改成功'
            });

        } catch (error) {
            logger.error('Password change error', {
                error: error.message,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '密碼更改失敗';

            if (error.message.includes('Current password is incorrect')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '當前密碼不正確';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 忘記密碼
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            await AuthService.forgotPassword(email);

            res.json({
                success: true,
                message: '如果該郵箱已註冊，您將收到重置密碼的郵件'
            });

        } catch (error) {
            logger.error('Forgot password error', {
                error: error.message,
                email: req.body.email
            });

            // 無論如何都返回成功，避免洩露用戶信息
            res.json({
                success: true,
                message: '如果該郵箱已註冊，您將收到重置密碼的郵件'
            });
        }
    }

    // 重置密碼
    static async resetPassword(req, res) {
        try {
            const { token, password } = req.body;

            await AuthService.resetPassword(token, password);

            res.json({
                success: true,
                message: '密碼重置成功，請使用新密碼登錄'
            });

        } catch (error) {
            logger.error('Reset password error', {
                error: error.message
            });

            let statusCode = HTTP_STATUS.BAD_REQUEST;
            let errorMessage = '密碼重置失敗';

            if (error.message.includes('Invalid or expired token')) {
                errorMessage = '重置令牌無效或已過期';
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

            await AuthService.verifyEmail(token);

            res.json({
                success: true,
                message: '郵箱驗證成功'
            });

        } catch (error) {
            logger.error('Email verification error', {
                error: error.message,
                token: req.params.token
            });

            res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: '郵箱驗證失敗，令牌可能無效或已過期'
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
                message: '驗證郵件已重新發送'
            });

        } catch (error) {
            logger.error('Resend email verification error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '發送驗證郵件失敗'
            });
        }
    }

    // 檢查用戶名可用性
    static async checkUsernameAvailability(req, res) {
        try {
            const { username } = req.params;

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
                error: '檢查用戶名可用性失敗'
            });
        }
    }

    // 檢查郵箱可用性
    static async checkEmailAvailability(req, res) {
        try {
            const { email } = req.params;

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
                error: '檢查郵箱可用性失敗'
            });
        }
    }

    // 獲取用戶會話
    static async getUserSessions(req, res) {
        try {
            const userId = req.user.userId;

            const sessions = await AuthService.getUserSessions(userId);

            res.json({
                success: true,
                data: {
                    sessions
                }
            });

        } catch (error) {
            logger.error('Get user sessions error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取會話列表失敗'
            });
        }
    }

    // 銷毀特定會話
    static async destroySession(req, res) {
        try {
            const { sessionId } = req.params;
            const userId = req.user.userId;

            await AuthService.destroySpecificSession(sessionId, userId);

            res.json({
                success: true,
                message: '會話已銷毀'
            });

        } catch (error) {
            logger.error('Destroy session error', {
                error: error.message,
                sessionId: req.params.sessionId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '銷毀會話失敗'
            });
        }
    }

    // 銷毀所有其他會話
    static async destroyAllOtherSessions(req, res) {
        try {
            const userId = req.user.userId;
            const currentSessionId = req.cookies.sessionId || req.headers['x-session-id'];

            await AuthService.destroyAllOtherSessions(userId, currentSessionId);

            res.json({
                success: true,
                message: '所有其他會話已銷毀'
            });

        } catch (error) {
            logger.error('Destroy all other sessions error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '銷毀會話失敗'
            });
        }
    }

    // 啟用兩因子認證
    static async enableTwoFactor(req, res) {
        try {
            const { password } = req.body;
            const userId = req.user.userId;

            const result = await AuthService.enableTwoFactor(userId, password);

            res.json({
                success: true,
                message: '兩因子認證初始化成功',
                data: {
                    qrCode: result.qrCode,
                    secret: result.secret,
                    backupCodes: result.backupCodes
                }
            });

        } catch (error) {
            logger.error('Enable 2FA error', {
                error: error.message,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '啟用兩因子認證失敗';

            if (error.message.includes('Invalid password')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '密碼錯誤';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 確認兩因子認證
    static async confirmTwoFactor(req, res) {
        try {
            const { token } = req.body;
            const userId = req.user.userId;

            await AuthService.confirmTwoFactor(userId, token);

            res.json({
                success: true,
                message: '兩因子認證啟用成功'
            });

        } catch (error) {
            logger.error('Confirm 2FA error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: '驗證碼錯誤'
            });
        }
    }

    // 禁用兩因子認證
    static async disableTwoFactor(req, res) {
        try {
            const { password, token } = req.body;
            const userId = req.user.userId;

            await AuthService.disableTwoFactor(userId, password, token);

            res.json({
                success: true,
                message: '兩因子認證已禁用'
            });

        } catch (error) {
            logger.error('Disable 2FA error', {
                error: error.message,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.BAD_REQUEST;
            let errorMessage = '禁用兩因子認證失敗';

            if (error.message.includes('Invalid password')) {
                errorMessage = '密碼錯誤';
            } else if (error.message.includes('Invalid token')) {
                errorMessage = '驗證碼錯誤';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 獲取認證統計（管理員）
    static async getAuthStats(req, res) {
        try {
            const stats = await AuthService.getAuthStats();

            res.json({
                success: true,
                data: {
                    stats
                }
            });

        } catch (error) {
            logger.error('Get auth stats error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取統計數據失敗'
            });
        }
    }

    // OAuth 登錄（Google）
    static async googleAuth(req, res) {
        try {
            const { token } = req.body;

            const result = await AuthService.googleAuth(token, req);

            // 設置cookie
            res.cookie('sessionId', result.sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/'
            });

            res.json({
                success: true,
                message: '登錄成功',
                data: {
                    user: result.user,
                    accessToken: result.tokens.accessToken,
                    isNewUser: result.isNewUser
                }
            });

        } catch (error) {
            logger.error('Google auth error', {
                error: error.message,
                ip: req.ip
            });

            res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'Google 登錄失敗'
            });
        }
    }

    // OAuth 登錄（Facebook）
    static async facebookAuth(req, res) {
        try {
            const { token } = req.body;

            const result = await AuthService.facebookAuth(token, req);

            // 設置cookie
            res.cookie('sessionId', result.sessionId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000,
                path: '/'
            });

            res.json({
                success: true,
                message: '登錄成功',
                data: {
                    user: result.user,
                    accessToken: result.tokens.accessToken,
                    isNewUser: result.isNewUser
                }
            });

        } catch (error) {
            logger.error('Facebook auth error', {
                error: error.message,
                ip: req.ip
            });

            res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                error: 'Facebook 登錄失敗'
            });
        }
    }

    // 帳戶刪除
    static async deleteAccount(req, res) {
        try {
            const { password } = req.body;
            const userId = req.user.userId;

            await AuthService.deleteAccount(userId, password);

            // 清除cookie
            res.clearCookie('sessionId', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/'
            });

            res.json({
                success: true,
                message: '帳戶已刪除'
            });

        } catch (error) {
            logger.error('Delete account error', {
                error: error.message,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '刪除帳戶失敗';

            if (error.message.includes('Invalid password')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '密碼錯誤';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 匯出用戶數據
    static async exportUserData(req, res) {
        try {
            const userId = req.user.userId;

            const userData = await AuthService.exportUserData(userId);

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="user-data.json"');

            res.json({
                success: true,
                data: userData,
                exportedAt: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Export user data error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '匯出用戶數據失敗'
            });
        }
    }

    // 設備管理 - 獲取設備列表
    static async getDevices(req, res) {
        try {
            const userId = req.user.userId;

            const devices = await AuthService.getUserDevices(userId);

            res.json({
                success: true,
                data: {
                    devices
                }
            });

        } catch (error) {
            logger.error('Get devices error', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取設備列表失敗'
            });
        }
    }

    // 設備管理 - 移除設備
    static async removeDevice(req, res) {
        try {
            const { deviceId } = req.params;
            const userId = req.user.userId;

            await AuthService.removeDevice(userId, deviceId);

            res.json({
                success: true,
                message: '設備已移除'
            });

        } catch (error) {
            logger.error('Remove device error', {
                error: error.message,
                deviceId: req.params.deviceId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '移除設備失敗'
            });
        }
    }
}

module.exports = AuthController;