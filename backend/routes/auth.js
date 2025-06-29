const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const AuthController = require('../controllers/authController');
const AuthMiddleware = require('../middleware/auth');
const RateLimitMiddleware = require('../middleware/rateLimit');
const ValidationMiddleware = require('../middleware/validation');

// 用戶註冊
router.post('/register',
    RateLimitMiddleware.registerLimiter,
    [
        body('username')
            .trim()
            .isLength({ min: 3, max: 30 })
            .withMessage('用戶名必須在3-30個字符之間')
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('用戶名只能包含字母、數字、下劃線和連字符'),

        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('請輸入有效的郵箱地址'),

        body('password')
            .isLength({ min: 8, max: 128 })
            .withMessage('密碼長度必須在8-128個字符之間')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('密碼必須包含大小寫字母、數字和特殊字符'),

        body('confirmPassword')
            .custom((value, { req }) => {
                if (value !== req.body.password) {
                    throw new Error('密碼確認不匹配');
                }
                return true;
            }),

        body('agreeTerms')
            .equals('true')
            .withMessage('必須同意服務條款')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.register
);

// 用戶登錄
router.post('/login',
    RateLimitMiddleware.loginLimiter,
    [
        body('identifier')
            .trim()
            .notEmpty()
            .withMessage('請輸入用戶名或郵箱'),

        body('password')
            .notEmpty()
            .withMessage('請輸入密碼'),

        body('rememberMe')
            .optional()
            .isBoolean()
            .withMessage('記住我選項必須是布爾值')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.login
);

// 用戶登出
router.post('/logout',
    AuthController.logout
);

// 檢查認證狀態
router.get('/status',
    AuthController.checkAuth
);

// 刷新令牌
router.post('/refresh',
    RateLimitMiddleware.generalLimiter,
    [
        body('refreshToken')
            .notEmpty()
            .withMessage('刷新令牌是必需的')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.refreshToken
);

// 忘記密碼
router.post('/forgot-password',
    RateLimitMiddleware.emailLimiter,
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('請輸入有效的郵箱地址')
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
            .isLength({ min: 32, max: 64 })
            .withMessage('重置令牌格式無效'),

        body('password')
            .isLength({ min: 8, max: 128 })
            .withMessage('密碼長度必須在8-128個字符之間')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('密碼必須包含大小寫字母、數字和特殊字符'),

        body('confirmPassword')
            .custom((value, { req }) => {
                if (value !== req.body.password) {
                    throw new Error('密碼確認不匹配');
                }
                return true;
            })
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.resetPassword
);

// 驗證郵箱
router.get('/verify-email/:token',
    [
        param('token')
            .notEmpty()
            .isLength({ min: 32, max: 64 })
            .withMessage('驗證令牌格式無效')
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
            .withMessage('用戶名必須在3-30個字符之間')
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('用戶名只能包含字母、數字、下劃線和連字符')
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
            .withMessage('請輸入有效的郵箱地址')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.checkEmailAvailability
);


// 獲取當前用戶信息
router.get('/me',
    AuthMiddleware.verifyToken,
    AuthController.getCurrentUser
);

// 更新當前用戶信息
router.put('/me',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.profileUpdateLimiter,
    [
        body('username')
            .optional()
            .trim()
            .isLength({ min: 3, max: 30 })
            .withMessage('用戶名必須在3-30個字符之間')
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('用戶名只能包含字母、數字、下劃線和連字符'),

        body('email')
            .optional()
            .isEmail()
            .normalizeEmail()
            .withMessage('請輸入有效的郵箱地址'),

        body('displayName')
            .optional()
            .trim()
            .isLength({ max: 50 })
            .withMessage('顯示名稱不能超過50個字符'),

        body('bio')
            .optional()
            .trim()
            .isLength({ max: 200 })
            .withMessage('個人簡介不能超過200個字符'),

        body('avatar')
            .optional()
            .isURL()
            .withMessage('頭像必須是有效的URL')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.updateProfile
);

// 更改密碼
router.put('/change-password',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.passwordChangeLimiter,
    [
        body('currentPassword')
            .notEmpty()
            .withMessage('請輸入當前密碼'),

        body('newPassword')
            .isLength({ min: 8, max: 128 })
            .withMessage('新密碼長度必須在8-128個字符之間')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('新密碼必須包含大小寫字母、數字和特殊字符'),

        body('confirmNewPassword')
            .custom((value, { req }) => {
                if (value !== req.body.newPassword) {
                    throw new Error('新密碼確認不匹配');
                }
                return true;
            })
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.changePassword
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
            .withMessage('會話ID是必需的')
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

// 啟用兩因子認證
router.post('/2fa/enable',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('password')
            .notEmpty()
            .withMessage('請輸入密碼確認身份')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.enableTwoFactor
);

// 確認兩因子認證
router.post('/2fa/confirm',
    AuthMiddleware.verifyToken,
    [
        body('token')
            .isLength({ min: 6, max: 6 })
            .withMessage('驗證碼必須是6位數字')
            .matches(/^\d{6}$/)
            .withMessage('驗證碼只能包含數字')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.confirmTwoFactor
);

// 禁用兩因子認證
router.post('/2fa/disable',
    AuthMiddleware.verifyToken,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('password')
            .notEmpty()
            .withMessage('請輸入密碼確認身份'),

        body('token')
            .isLength({ min: 6, max: 6 })
            .withMessage('驗證碼必須是6位數字')
            .matches(/^\d{6}$/)
            .withMessage('驗證碼只能包含數字')
    ],
    ValidationMiddleware.handleValidationErrors,
    AuthController.disableTwoFactor
);

// API 健康檢查
router.get('/health',
    (req, res) => {
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    }
);

// 認證統計（管理員）
router.get('/stats',
    AuthMiddleware.verifyToken,
    AuthMiddleware.requireAdmin,
    AuthController.getAuthStats
);

// 404 處理
router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: '找不到請求的端點',
        path: req.originalUrl,
        method: req.method
    });
});

// 錯誤處理中間件
router.use((error, req, res, next) => {
    console.error('Auth route error:', error);

    res.status(500).json({
        success: false,
        error: '認證服務內部錯誤',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
});

module.exports = router;