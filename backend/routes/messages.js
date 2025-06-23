const express = require('express');
const { body, param, query } = require('express-validator');
const ChatController = require('../controllers/chatController');
const AuthMiddleware = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation');
const RateLimitMiddleware = require('../middleware/rateLimit');

const router = express.Router();

// 所有路由都需要認證
router.use(AuthMiddleware.verifyToken);

// 發送消息
router.post('/',
    RateLimitMiddleware.messageLimiter,
    [
        body('content')
            .trim()
            .isLength({ min: 1, max: 4000 })
            .withMessage('Message content must be between 1 and 4000 characters'),
        body('messageType')
            .optional()
            .isIn(['text', 'image', 'file', 'audio', 'video', 'emoji', 'sticker', 'location'])
            .withMessage('Invalid message type'),
        body('roomId')
            .optional()
            .isUUID()
            .withMessage('Room ID must be a valid UUID'),
        body('receiverId')
            .optional()
            .isUUID()
            .withMessage('Receiver ID must be a valid UUID'),
        body('replyTo')
            .optional()
            .isUUID()
            .withMessage('Reply to must be a valid UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.sendMessage
);

// 搜索消息
router.get('/search',
    RateLimitMiddleware.searchLimiter,
    [
        query('q')
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('Search query must be between 2 and 100 characters'),
        query('roomId')
            .optional()
            .isUUID()
            .withMessage('Room ID must be a valid UUID'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 50 })
            .withMessage('Limit must be between 1 and 50')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.searchMessages
);

// 獲取消息統計
router.get('/stats',
    ChatController.getMessageStats
);

// 獲取未讀消息數量
router.get('/unread',
    ChatController.getUnreadCount
);

// 獲取房間消息歷史
router.get('/room/:roomId',
    [
        param('roomId')
            .isUUID()
            .withMessage('Room ID must be a valid UUID'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.getRoomMessages
);

// 標記房間消息為已讀
router.post('/room/:roomId/read',
    [
        param('roomId')
            .isUUID()
            .withMessage('Room ID must be a valid UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.markRoomMessagesAsRead
);

// 獲取私人消息歷史
router.get('/private/:userId',
    [
        param('userId')
            .isUUID()
            .withMessage('User ID must be a valid UUID'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.getPrivateMessages
);

// 獲取消息回復鏈
router.get('/:messageId/replies',
    [
        param('messageId')
            .isUUID()
            .withMessage('Message ID must be a valid UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.getMessageReplyChain
);

// 編輯消息
router.put('/:messageId',
    RateLimitMiddleware.messageLimiter,
    [
        param('messageId')
            .isUUID()
            .withMessage('Message ID must be a valid UUID'),
        body('content')
            .trim()
            .isLength({ min: 1, max: 4000 })
            .withMessage('Message content must be between 1 and 4000 characters')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.editMessage
);

// 轉發消息
router.post('/:messageId/forward',
    RateLimitMiddleware.messageLimiter,
    [
        param('messageId')
            .isUUID()
            .withMessage('Message ID must be a valid UUID'),
        body('targetRoomId')
            .optional()
            .isUUID()
            .withMessage('Target room ID must be a valid UUID'),
        body('targetUserId')
            .optional()
            .isUUID()
            .withMessage('Target user ID must be a valid UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.forwardMessage
);

// 刪除消息
router.delete('/:messageId',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('messageId')
            .isUUID()
            .withMessage('Message ID must be a valid UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.deleteMessage
);

// 管理員路由
// 發送系統消息
router.post('/system',
    AuthMiddleware.requireAdmin,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('content')
            .trim()
            .isLength({ min: 1, max: 4000 })
            .withMessage('Message content must be between 1 and 4000 characters'),
        body('roomId')
            .optional()
            .isUUID()
            .withMessage('Room ID must be a valid UUID'),
        body('messageType')
            .optional()
            .isIn(['system'])
            .withMessage('Message type must be system')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.sendSystemMessage
);

// 批量刪除消息
router.delete('/bulk',
    AuthMiddleware.requireAdmin,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('messageIds')
            .isArray({ min: 1, max: 100 })
            .withMessage('Message IDs must be an array with 1-100 elements'),
        body('messageIds.*')
            .isUUID()
            .withMessage('Each message ID must be a valid UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    ChatController.bulkDeleteMessages
);

module.exports = router;