const express = require('express');
const { body, param } = require('express-validator');
const AuthController = require('../controllers/authController');
const AuthMiddleware = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation');
const RateLimitMiddleware = require('../middleware/rateLimit');

const router = express.Router();

// 用戶註冊
router.post('/register',
    RateLimitMiddleware.loginLimiter,
    [
        body('username')
            .isLength({ min: 3, max: 30 })
            .withMessage('Username must be between 3 and 30 characters')
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please provide a valid email address'),
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
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.register
);

// 用戶登錄
router.post('/login',
    RateLimitMiddleware.loginLimiter,
    [
        body('identifier')
            .notEmpty()
            .withMessage('Email or username is required'),
        body('password')
            .notEmpty()
            .withMessage('Password is required'),
        body('twoFactorToken')
            .optional()
            .isLength({ min: 6, max: 6 })
            .withMessage('Two-factor token must be 6 digits')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.login
);

// 用戶登出
router.post('/logout',
    AuthController.logout
);

// 刷新令牌
router.post('/refresh',
    RateLimitMiddleware.loginLimiter,
    [
        body('refreshToken')
            .notEmpty()
            .withMessage('Refresh token is required')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.refreshToken
);

// 獲取當前用戶信息
router.get('/me',
    AuthMiddleware.verifyToken,
    AuthController.getCurrentUser
);

// 檢查認證狀態
router.get('/status',
    (req, res) => {
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
            res.status(500).json({
                success: false,
                error: 'Failed to get authentication status'
            });
        }
    }
);

// 忘記密碼
router.post('/forgot-password',
    RateLimitMiddleware.passwordResetLimiter,
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please provide a valid email address')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.forgotPassword
);

// 重置密碼
router.post('/reset-password',
    RateLimitMiddleware.passwordResetLimiter,
    [
        body('token')
            .notEmpty()
            .withMessage('Reset token is required'),
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
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.resetPassword
);

// 更改密碼
router.post('/change-password',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('currentPassword')
            .notEmpty()
            .withMessage('Current password is required'),
        body('newPassword')
            .isLength({ min: 8, max: 128 })
            .withMessage('New password must be between 8 and 128 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.changePassword
);

// 驗證郵箱
router.get('/verify-email/:token',
    [
        param('token')
            .notEmpty()
            .isLength({ min: 32, max: 64 })
            .withMessage('Invalid verification token format')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.verifyEmail
);

// 重新發送郵箱驗證
router.post('/resend-verification',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.emailLimiter,
    AuthController.resendEmailVerification
);

// 檢查用戶名可用性
router.get('/check-username/:username',
    RateLimitMiddleware.generalLimiter,
    [
        param('username')
            .isLength({ min: 3, max: 30 })
            .withMessage('Username must be between 3 and 30 characters')
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.checkUsernameAvailability
);

// 檢查郵箱可用性
router.get('/check-email/:email',
    RateLimitMiddleware.generalLimiter,
    [
        param('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please provide a valid email address')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.checkEmailAvailability
);

// 設置雙因素認證
router.post('/2fa/setup',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.sensitiveActionLimiter,
    AuthController.setupTwoFactor
);

// 驗證並啟用雙因素認證
router.post('/2fa/verify',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('token')
            .isLength({ min: 6, max: 6 })
            .withMessage('Two-factor token must be 6 digits')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.verifyTwoFactor
);

// 禁用雙因素認證
router.post('/2fa/disable',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('password')
            .notEmpty()
            .withMessage('Password is required to disable two-factor authentication')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.disableTwoFactor
);

// 獲取用戶會話
router.get('/sessions',
    AuthMiddleware.verifyToken,
    AuthController.getUserSessions
);

// 銷毀特定會話
router.delete('/sessions/:sessionId',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('sessionId')
            .notEmpty()
            .withMessage('Session ID is required')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.destroySession
);

// 銷毀所有其他會話
router.delete('/sessions',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.sensitiveActionLimiter,
    AuthController.destroyAllOtherSessions
);

module.exports = router;