const express = require('express');
const { body, param, query } = require('express-validator');
const FileController = require('../controllers/fileController');
const AuthMiddleware = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation');
const RateLimitMiddleware = require('../middleware/rateLimit');

const router = express.Router();

// 所有路由都需要認證
router.use(AuthMiddleware.verifyToken);

// 上傳文件
router.post('/upload',
    RateLimitMiddleware.uploadLimiter,
    FileController.uploadFile,
    [
        body('messageId')
            .optional()
            .isUUID()
            .withMessage('消息ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    FileController.handleFileUpload
);

// 獲取文件信息 - 修復方法名稱
router.get('/:fileId',
    [
        param('fileId')
            .isUUID()
            .withMessage('文件ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    FileController.getFileInfo // 修正：原來是 getFile
);

// 下載文件
router.get('/:fileId/download',
    [
        param('fileId')
            .isUUID()
            .withMessage('文件ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    FileController.downloadFile
);

// 刪除文件
router.delete('/:fileId',
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        param('fileId')
            .isUUID()
            .withMessage('文件ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    FileController.deleteFile
);

// 獲取當前用戶文件列表 - 簡化路由
router.get('/',
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('頁碼必須是正整數'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('每頁數量必須在1-100之間'),
        query('category')
            .optional()
            .isIn(['all', 'images', 'audio', 'video', 'documents'])
            .withMessage('文件類型無效'),
        query('search')
            .optional()
            .isLength({ min: 1, max: 100 })
            .withMessage('搜索詞長度必須在1-100字符之間')
    ],
    ValidationMiddleware.handleValidationErrors,
    FileController.getUserFiles
);

// 管理員路由
// 批量刪除文件
router.delete('/bulk',
    AuthMiddleware.requireAdmin,
    RateLimitMiddleware.sensitiveActionLimiter,
    [
        body('fileIds')
            .isArray({ min: 1, max: 100 })
            .withMessage('文件ID列表必須是包含1-100個元素的數組'),
        body('fileIds.*')
            .isUUID()
            .withMessage('每個文件ID必須是有效的UUID')
    ],
    ValidationMiddleware.handleValidationErrors,
    FileController.bulkDeleteFiles
);

// 清理孤立文件
router.post('/cleanup',
    AuthMiddleware.requireAdmin,
    RateLimitMiddleware.sensitiveActionLimiter,
    FileController.cleanupOrphanFiles
);

// 獲取存儲使用情況（管理員）
router.get('/admin/storage',
    AuthMiddleware.requireAdmin,
    FileController.getStorageUsage
);

module.exports = router;