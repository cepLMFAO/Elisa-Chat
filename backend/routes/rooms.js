const express = require('express');
const { body, param, query } = require('express-validator');
const RoomController = require('../controllers/roomController');
const AuthMiddleware = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation');
const RateLimitMiddleware = require('../middleware/rateLimit');

const router = express.Router();

// 所有路由都需要認證
router.use(AuthMiddleware.verifyToken);

// 創建房間
router.post('/',
    RateLimitMiddleware.createRoomLimiter,
    [
        body('name')
            .trim()
            .isLength({ min: 1, max: 100 })
            .withMessage('房間名稱必須在1-100個字符之間')
            .matches(/^[a-zA-Z0-9\s\u4e00-\u9fff_-]+$/)
            .withMessage('房間名稱只能包含字母、數字、中文、空格、底線和橫線'),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('房間描述不能超過500個字符'),
        body('type')
            .isIn(['public', 'private', 'group'])
            .withMessage('房間類型無效'),
        body('password')
            .optional()
            .isLength({ min: 4, max: 50 })
            .withMessage('房間密碼必須在4-50個字符之間'),
        body('maxMembers')
            .optional()
            .isInt({ min: 2, max: 1000 })
            .withMessage('最大成員數必須在2-1000之間')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.createRoom
);

// 搜索房間
router.get('/search',
    RateLimitMiddleware.searchLimiter,
    [
        query('q')
            .optional()
            .trim()
            .isLength({ min: 1, max: 100 })
            .withMessage('搜索關鍵字不能超過100個字符'),
        query('type')
            .optional()
            .isIn(['public', 'private', 'group'])
            .withMessage('房間類型無效'),
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
    RoomController.searchRooms
);

// 獲取公開房間列表
router.get('/public',
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
    RoomController.getPublicRooms
);

// 獲取用戶房間列表
router.get('/my',
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
    RoomController.getUserRooms
);

// 獲取房間信息
router.get('/:roomId',
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.getRoom
);

// 加入房間
router.post('/:roomId/join',
    RateLimitMiddleware.generalLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
        body('password')
            .optional()
            .isLength({ min: 1, max: 50 })
            .withMessage('密碼長度不能超過50個字符')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.joinRoom
);

// 離開房間
router.post('/:roomId/leave',
    RateLimitMiddleware.generalLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.leaveRoom
);

// 獲取房間成員
router.get('/:roomId/members',
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
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
    RoomController.getRoomMembers
);

// 邀請用戶加入房間
router.post('/:roomId/invite',
    RateLimitMiddleware.generalLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
        body('userId')
            .isUUID()
            .withMessage('用戶ID必須是有效的UUID'),
        body('message')
            .optional()
            .trim()
            .isLength({ max: 200 })
            .withMessage('邀請訊息不能超過200個字符')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.inviteUser
);

// 獲取房間統計
router.get('/:roomId/stats',
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.getRoomStats
);

// 更新房間信息
router.put('/:roomId',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
        body('name')
            .optional()
            .trim()
            .isLength({ min: 1, max: 100 })
            .withMessage('房間名稱必須在1-100個字符之間'),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('房間描述不能超過500個字符'),
        body('avatar')
            .optional()
            .isURL()
            .withMessage('頭像必須是有效的URL'),
        body('maxMembers')
            .optional()
            .isInt({ min: 2, max: 1000 })
            .withMessage('最大成員數必須在2-1000之間')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.updateRoom
);

// 更改房間密碼
router.put('/:roomId/password',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
        body('password')
            .optional()
            .isLength({ min: 4, max: 50 })
            .withMessage('密碼必須在4-50個字符之間（為空則移除密碼）')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.updateRoomPassword
);

// 刪除房間
router.delete('/:roomId',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.deleteRoom
);

// 踢出成員
router.delete('/:roomId/members/:memberId',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
        param('memberId')
            .isUUID()
            .withMessage('成員ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.kickMember
);

// 更新成員角色
router.put('/:roomId/members/:memberId/role',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
        param('memberId')
            .isUUID()
            .withMessage('成員ID必須是有效的UUID'),
        body('role')
            .isIn(['admin', 'moderator', 'member'])
            .withMessage('角色必須是 admin、moderator 或 member')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.updateMemberRole
);

// 靜音成員
router.post('/:roomId/members/:memberId/mute',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
        param('memberId')
            .isUUID()
            .withMessage('成員ID必須是有效的UUID'),
        body('duration')
            .optional()
            .isInt({ min: 1, max: 43200 })
            .withMessage('靜音時長必須在1-43200分鐘之間（不提供則為永久靜音）')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.muteMember
);

// 取消靜音
router.delete('/:roomId/members/:memberId/mute',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('roomId')
            .isUUID()
            .withMessage('房間ID必須是有效的UUID'),
        param('memberId')
            .isUUID()
            .withMessage('成員ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    RoomController.unmuteMember
);

module.exports = router;