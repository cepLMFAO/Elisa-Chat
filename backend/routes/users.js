const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const UserController = require('../controllers/userController');
const AuthMiddleware = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation');
const RateLimitMiddleware = require('../middleware/rateLimit');


router.use(AuthMiddleware.verifyToken);

// 搜索用戶
router.get('/search',
    RateLimitMiddleware.generalLimiter,
    [
        query('q')
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('搜索關鍵字必須在2-50個字符之間'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 50 })
            .withMessage('結果數量必須在1-50之間')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.searchUsers
);

// 獲取在線用戶
router.get('/online',
    UserController.getOnlineUsers
);

// 獲取所有用戶（管理員）
router.get('/',
    AuthMiddleware.requireAdmin,
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('頁碼必須是正整數'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('每頁數量必須在1-100之間'),
        query('status')
            .optional()
            .isIn(['online', 'offline', 'away', 'busy', 'invisible', 'deleted'])
            .withMessage('狀態值無效'),
        query('role')
            .optional()
            .isIn(['admin', 'moderator', 'user', 'guest'])
            .withMessage('角色值無效'),
        query('search')
            .optional()
            .trim()
            .isLength({ max: 100 })
            .withMessage('搜索關鍵字不能超過100個字符')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.getAllUsers
);
// 更新當前用戶狀態
router.put('/status',
    RateLimitMiddleware.generalLimiter,
    [
        body('status')
            .isIn(['online', 'offline', 'away', 'busy', 'invisible'])
            .withMessage('狀態值無效')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.updateUserStatus
);

// 發送好友請求
router.post('/friends/request',
    RateLimitMiddleware.generalLimiter,
    [
        body('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.sendFriendRequest
);

// 處理好友請求
router.put('/friends/request/:requestId',
    RateLimitMiddleware.generalLimiter,
    [
        param('requestId')
            .isInt({ min: 1 })
            .withMessage('請求ID必須是正整數'),
        body('action')
            .isIn(['accept', 'reject'])
            .withMessage('操作必須是 accept 或 reject')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.handleFriendRequest
);

// 獲取好友列表
router.get('/friends',
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('頁碼必須是正整數'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('每頁數量必須在1-100之間')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.getFriends
);

// 獲取好友請求列表
router.get('/friends/requests',
    [
        query('type')
            .optional()
            .isIn(['received', 'sent', 'both'])
            .withMessage('類型必須是 received、sent 或 both'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('頁碼必須是正整數'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 50 })
            .withMessage('每頁數量必須在1-50之間')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.getFriendRequests
);

// 刪除好友
router.delete('/friends/:friendId',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('friendId')
            .isUUID()
            .withMessage('好友ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.removeFriend
);

// 封鎖用戶
router.post('/block',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.blockUser
);

// 解除封鎖
router.delete('/block/:userId',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.unblockUser
);

// 獲取封鎖列表
router.get('/blocked',
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('頁碼必須是正整數'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 50 })
            .withMessage('每頁數量必須在1-50之間')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.getBlockedUsers
);
// 獲取用戶資料
router.get('/:userId',
    [
        param('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.getUser
);

// 更新用戶資料
router.put('/:userId',
    AuthMiddleware.requireSelfOrAdmin,
    RateLimitMiddleware.generalLimiter,
    [
        param('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID'),
        body('username')
            .optional()
            .trim()
            .isLength({ min: 3, max: 30 })
            .withMessage('用戶名必須在3-30個字符之間')
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('用戶名只能包含字母、數字、底線和橫線'),
        body('email')
            .optional()
            .isEmail()
            .normalizeEmail()
            .withMessage('請提供有效的郵箱地址'),
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
            .withMessage('頭像必須是有效的URL'),
        body('status')
            .optional()
            .isIn(['online', 'offline', 'away', 'busy', 'invisible'])
            .withMessage('狀態值無效')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.updateUser
);

// 獲取用戶統計
router.get('/:userId/stats',
    AuthMiddleware.requireSelfOrAdmin,
    [
        param('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.getUserStats
);

// 刪除用戶（軟刪除）- 管理員功能
router.delete('/:userId',
    AuthMiddleware.requireAdmin,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.deleteUser
);

// 封禁用戶（管理員）
router.post('/:userId/ban',
    AuthMiddleware.requireAdmin,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID'),
        body('reason')
            .trim()
            .isLength({ min: 5, max: 200 })
            .withMessage('封禁理由必須在5-200個字符之間'),
        body('duration')
            .optional()
            .isInt({ min: 1 })
            .withMessage('封禁時長必須是正整數（小時）')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.banUser
);

// 解封用戶（管理員）
router.post('/:userId/unban',
    AuthMiddleware.requireAdmin,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.unbanUser
);

// 設置用戶角色（管理員）
router.put('/:userId/role',
    AuthMiddleware.requireAdmin,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID'),
        body('role')
            .isIn(['user', 'moderator', 'admin'])
            .withMessage('角色必須是 user、moderator 或 admin')
    ],
    ValidationMiddleware.handleValidationErrors,
    UserController.setUserRole
);
// 404 處理
router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: '找不到請求的用戶端點',
        path: req.originalUrl,
        method: req.method
    });
});

// 錯誤處理中間件
router.use((error, req, res, next) => {
    console.error('User route error:', error);

    res.status(500).json({
        success: false,
        error: '用戶服務內部錯誤',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
});

module.exports = router;