const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, UPLOAD } = require('../config/constants');

// 文件存儲配置
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(UPLOAD.UPLOAD_PATH, getFileCategory(file.mimetype));
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// 文件過濾器
const fileFilter = (req, file, cb) => {
    if (UPLOAD.ALLOWED_FILE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('不支援的文件類型'), false);
    }
};

// 文件上傳中間件
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: UPLOAD.MAX_FILE_SIZE,
        files: 5 // 最多同時上傳5個文件
    }
});

// 獲取文件分類目錄
function getFileCategory(mimetype) {
    if (mimetype.startsWith('image/')) return 'images';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    return 'files';
}

// 獲取文件MIME類型圖標
function getFileIcon(mimetype) {
    const iconMap = {
        'application/pdf': 'pdf',
        'application/msword': 'word',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
        'application/vnd.ms-excel': 'excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
        'text/plain': 'text',
        'application/zip': 'archive',
        'application/x-rar-compressed': 'archive'
    };

    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';

    return iconMap[mimetype] || 'file';
}

class FileController {
    // 上傳文件
    static uploadFile = upload.array('files', 5);

    static async handleFileUpload(req, res) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '沒有選擇文件',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const userId = req.user.userId;
            const { messageId } = req.body;
            const uploadedFiles = [];

            for (const file of req.files) {
                // 檢查圖片大小限制
                if (file.mimetype.startsWith('image/') && file.size > UPLOAD.MAX_IMAGE_SIZE) {
                    await fs.unlink(file.path); // 刪除文件
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        error: `圖片文件不能超過 ${UPLOAD.MAX_IMAGE_SIZE / 1024 / 1024}MB`,
                        code: ERROR_CODES.FILE_TOO_LARGE
                    });
                }

                const fileUuid = uuidv4();
                const relativePath = path.relative(UPLOAD.UPLOAD_PATH, file.path);

                // 保存文件信息到數據庫
                await database.run(
                    `INSERT INTO files (uuid, original_name, filename, mimetype, size, path, uploaded_by, message_uuid, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [
                        fileUuid,
                        file.originalname,
                        file.filename,
                        file.mimetype,
                        file.size,
                        relativePath,
                        userId,
                        messageId
                    ]
                );

                uploadedFiles.push({
                    uuid: fileUuid,
                    originalName: file.originalname,
                    filename: file.filename,
                    mimetype: file.mimetype,
                    size: file.size,
                    url: `/uploads/${relativePath}`,
                    icon: getFileIcon(file.mimetype),
                    category: getFileCategory(file.mimetype)
                });

                logger.fileUpload(file.originalname, file.size, userId, {
                    fileId: fileUuid,
                    mimetype: file.mimetype
                });
            }

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: `成功上傳 ${uploadedFiles.length} 個文件`,
                data: {
                    files: uploadedFiles
                }
            });

        } catch (error) {
            logger.error('文件上傳失敗', {
                error: error.message,
                userId: req.user?.userId,
                files: req.files?.map(f => ({ name: f.originalname, size: f.size }))
            });

            // 清理已上傳的文件
            if (req.files) {
                for (const file of req.files) {
                    try {
                        await fs.unlink(file.path);
                    } catch (unlinkError) {
                        logger.error('清理文件失敗', { path: file.path, error: unlinkError.message });
                    }
                }
            }

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '文件上傳失敗';

            if (error.code === 'LIMIT_FILE_SIZE') {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '文件大小超過限制';
            } else if (error.message.includes('不支援的文件類型')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage,
                code: ERROR_CODES.UPLOAD_FAILED
            });
        }
    }

    // 獲取文件信息
    static async getFileInfo(req, res) {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;

            const file = await database.get(
                `SELECT f.*, u.username as uploader_name
                 FROM files f
                 LEFT JOIN users u ON f.uploaded_by = u.uuid
                 WHERE f.uuid = ?`,
                [fileId]
            );

            if (!file) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件不存在',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            // 檢查用戶是否有權限查看此文件
            let hasPermission = false;

            // 文件上傳者可以查看
            if (file.uploaded_by === userId) {
                hasPermission = true;
            }
            // 如果文件關聯到消息，檢查用戶是否能查看該消息
            else if (file.message_uuid) {
                const Message = require('../models/messages');
                const message = await Message.findByUuid(file.message_uuid);
                if (message) {
                    hasPermission = await message.canUserView(userId);
                }
            }

            if (!hasPermission) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權限查看此文件',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            res.json({
                success: true,
                data: {
                    uuid: file.uuid,
                    originalName: file.original_name,
                    filename: file.filename,
                    mimetype: file.mimetype,
                    size: file.size,
                    url: `/uploads/${file.path}`,
                    uploadedBy: file.uploaded_by,
                    uploaderName: file.uploader_name,
                    messageId: file.message_uuid,
                    createdAt: file.created_at,
                    icon: getFileIcon(file.mimetype),
                    category: getFileCategory(file.mimetype)
                }
            });

        } catch (error) {
            logger.error('獲取文件信息失敗', {
                error: error.message,
                fileId: req.params.fileId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取文件信息失敗'
            });
        }
    }

    // 下載文件
    static async downloadFile(req, res) {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;

            const file = await database.get('SELECT * FROM files WHERE uuid = ?', [fileId]);

            if (!file) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件不存在',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            // 檢查權限（同上）
            let hasPermission = false;

            if (file.uploaded_by === userId) {
                hasPermission = true;
            } else if (file.message_uuid) {
                const Message = require('../models/messages');
                const message = await Message.findByUuid(file.message_uuid);
                if (message) {
                    hasPermission = await message.canUserView(userId);
                }
            }

            if (!hasPermission) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權限下載此文件',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);

            // 檢查文件是否存在
            try {
                await fs.access(filePath);
            } catch (error) {
                logger.error('文件不存在於磁盤', { filePath, fileId });
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件已損壞或不存在'
                });
            }

            // 設置響應頭
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
            res.setHeader('Content-Type', file.mimetype);

            // 發送文件
            res.sendFile(path.resolve(filePath), (err) => {
                if (err) {
                    logger.error('文件發送失敗', { error: err.message, fileId });
                }
            });

            logger.info('文件下載', {
                fileId,
                userId,
                filename: file.original_name
            });

        } catch (error) {
            logger.error('文件下載失敗', {
                error: error.message,
                fileId: req.params.fileId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '文件下載失敗'
            });
        }
    }

    // 刪除文件
    static async deleteFile(req, res) {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;
            const isAdmin = req.user.role === 'admin';

            const file = await database.get('SELECT * FROM files WHERE uuid = ?', [fileId]);

            if (!file) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件不存在',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            // 檢查權限
            if (file.uploaded_by !== userId && !isAdmin) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只能刪除自己上傳的文件',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);

            // 從數據庫刪除記錄
            await database.run('DELETE FROM files WHERE uuid = ?', [fileId]);

            // 刪除物理文件
            try {
                await fs.unlink(filePath);
            } catch (error) {
                logger.warn('物理文件刪除失敗', { filePath, error: error.message });
            }

            logger.info('文件刪除成功', {
                fileId,
                userId,
                filename: file.original_name,
                deletedBy: isAdmin ? 'admin' : 'owner'
            });

            res.json({
                success: true,
                message: '文件刪除成功'
            });

        } catch (error) {
            logger.error('文件刪除失敗', {
                error: error.message,
                fileId: req.params.fileId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '文件刪除失敗'
            });
        }
    }

    // 獲取用戶文件列表
    static async getUserFiles(req, res) {
        try {
            const { page = 1, limit = 20, category, search } = req.query;
            const userId = req.user.userId;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE uploaded_by = ?';
            let params = [userId];

            // 添加分類篩選
            if (category) {
                const categoryMimetypes = {
                    'images': 'image/%',
                    'audio': 'audio/%',
                    'video': 'video/%',
                    'documents': 'application/%'
                };

                if (categoryMimetypes[category]) {
                    whereClause += ' AND mimetype LIKE ?';
                    params.push(categoryMimetypes[category]);
                }
            }

            // 添加搜索篩選
            if (search) {
                whereClause += ' AND original_name LIKE ?';
                params.push(`%${search}%`);
            }

            // 獲取總數
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM files ${whereClause}`,
                params
            );

            // 獲取文件列表
            const files = await database.query(
                `SELECT uuid, original_name, filename, mimetype, size, path, created_at
                 FROM files ${whereClause}
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, parseInt(limit), offset]
            );

            const filesWithUrls = files.map(file => ({
                ...file,
                url: `/uploads/${file.path}`,
                icon: getFileIcon(file.mimetype),
                category: getFileCategory(file.mimetype)
            }));

            res.json({
                success: true,
                data: {
                    files: filesWithUrls,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: countResult.total,
                        pages: Math.ceil(countResult.total / parseInt(limit))
                    }
                }
            });

        } catch (error) {
            logger.error('獲取用戶文件列表失敗', {
                error: error.message,
                userId: req.user?.userId,
                query: req.query
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取文件列表失敗'
            });
        }
    }

    // 獲取文件統計
    static async getFileStats(req, res) {
        try {
            const userId = req.user.userId;

            const stats = await database.get(
                `SELECT 
                    COUNT(*) as totalFiles,
                    SUM(size) as totalSize,
                    COUNT(CASE WHEN mimetype LIKE 'image/%' THEN 1 END) as imageCount,
                    COUNT(CASE WHEN mimetype LIKE 'audio/%' THEN 1 END) as audioCount,
                    COUNT(CASE WHEN mimetype LIKE 'video/%' THEN 1 END) as videoCount,
                    COUNT(CASE WHEN mimetype LIKE 'application/%' THEN 1 END) as documentCount
                 FROM files WHERE uploaded_by = ?`,
                [userId]
            );

            res.json({
                success: true,
                data: {
                    totalFiles: stats.totalFiles || 0,
                    totalSize: stats.totalSize || 0,
                    categories: {
                        images: stats.imageCount || 0,
                        audio: stats.audioCount || 0,
                        video: stats.videoCount || 0,
                        documents: stats.documentCount || 0
                    }
                }
            });

        } catch (error) {
            logger.error('獲取文件統計失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取統計失敗'
            });
        }
    }

    // 生成縮略圖（針對圖片）
    static async generateThumbnail(req, res) {
        try {
            const { fileId } = req.params;
            const { width = 150, height = 150 } = req.query;

            const file = await database.get('SELECT * FROM files WHERE uuid = ?', [fileId]);

            if (!file) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件不存在'
                });
            }

            if (!file.mimetype.startsWith('image/')) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '只支援圖片文件生成縮略圖'
                });
            }

            // 這裡可以使用 sharp 或其他圖片處理庫生成縮略圖
            // 由於沒有引入額外依賴，暫時返回原圖
            const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);

            res.setHeader('Content-Type', file.mimetype);
            res.sendFile(path.resolve(filePath));

        } catch (error) {
            logger.error('生成縮略圖失敗', {
                error: error.message,
                fileId: req.params.fileId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '生成縮略圖失敗'
            });
        }
    }

    // 清理臨時文件（管理員功能）
    static async cleanupTempFiles(req, res) {
        try {
            const tempDir = UPLOAD.TEMP_PATH;
            const files = await fs.readdir(tempDir);
            let cleanedCount = 0;

            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = await fs.stat(filePath);
                const now = new Date();
                const fileAge = now - stats.mtime;

                // 刪除超過1小時的臨時文件
                if (fileAge > 60 * 60 * 1000) {
                    await fs.unlink(filePath);
                    cleanedCount++;
                }
            }

            logger.info('臨時文件清理完成', {
                cleanedCount,
                executedBy: req.user.userId
            });

            res.json({
                success: true,
                message: `清理了 ${cleanedCount} 個臨時文件`,
                data: { cleanedCount }
            });

        } catch (error) {
            logger.error('清理臨時文件失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '清理失敗'
            });
        }
    }

    // 獲取存儲空間使用情況（管理員功能）
    static async getStorageUsage(req, res) {
        try {
            const stats = await database.get(
                `SELECT 
                    COUNT(*) as totalFiles,
                    SUM(size) as totalSize,
                    AVG(size) as averageSize,
                    COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as recentFiles
                 FROM files`
            );

            const categoryStats = await database.query(
                `SELECT 
                    CASE 
                        WHEN mimetype LIKE 'image/%' THEN 'images'
                        WHEN mimetype LIKE 'audio/%' THEN 'audio'
                        WHEN mimetype LIKE 'video/%' THEN 'video'
                        ELSE 'documents'
                    END as category,
                    COUNT(*) as count,
                    SUM(size) as size
                 FROM files
                 GROUP BY category`
            );

            res.json({
                success: true,
                data: {
                    overall: {
                        totalFiles: stats.totalFiles || 0,
                        totalSize: stats.totalSize || 0,
                        averageSize: stats.averageSize || 0,
                        recentFiles: stats.recentFiles || 0
                    },
                    categories: categoryStats
                }
            });

        } catch (error) {
            logger.error('獲取存儲使用情況失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取存儲信息失敗'
            });
        }
    }
}

module.exports = FileController;const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, UPLOAD } = require('../config/constants');

// 文件存儲配置
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(UPLOAD.UPLOAD_PATH, getFileCategory(file.mimetype));
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// 文件過濾器
const fileFilter = (req, file, cb) => {
    if (UPLOAD.ALLOWED_FILE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('不支援的文件類型'), false);
    }
};

// 文件上傳中間件
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: UPLOAD.MAX_FILE_SIZE,
        files: 5 // 最多同時上傳5個文件
    }
});

// 獲取文件分類目錄
function getFileCategory(mimetype) {
    if (mimetype.startsWith('image/')) return 'images';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    return 'files';
}

// 獲取文件MIME類型圖標
function getFileIcon(mimetype) {
    const iconMap = {
        'application/pdf': 'pdf',
        'application/msword': 'word',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
        'application/vnd.ms-excel': 'excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
        'text/plain': 'text',
        'application/zip': 'archive',
        'application/x-rar-compressed': 'archive'
    };

    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';

    return iconMap[mimetype] || 'file';
}

class FileController {
    // 上傳文件
    static uploadFile = upload.array('files', 5);

    static async handleFileUpload(req, res) {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '沒有選擇文件',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const userId = req.user.userId;
            const { messageId } = req.body;
            const uploadedFiles = [];

            for (const file of req.files) {
                // 檢查圖片大小限制
                if (file.mimetype.startsWith('image/') && file.size > UPLOAD.MAX_IMAGE_SIZE) {
                    await fs.unlink(file.path); // 刪除文件
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        error: `圖片文件不能超過 ${UPLOAD.MAX_IMAGE_SIZE / 1024 / 1024}MB`,
                        code: ERROR_CODES.FILE_TOO_LARGE
                    });
                }

                const fileUuid = uuidv4();
                const relativePath = path.relative(UPLOAD.UPLOAD_PATH, file.path);

                // 保存文件信息到數據庫
                await database.run(
                    `INSERT INTO files (uuid, original_name, filename, mimetype, size, path, uploaded_by, message_uuid, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [
                        fileUuid,
                        file.originalname,
                        file.filename,
                        file.mimetype,
                        file.size,
                        relativePath,
                        userId,
                        messageId
                    ]
                );

                uploadedFiles.push({
                    uuid: fileUuid,
                    originalName: file.originalname,
                    filename: file.filename,
                    mimetype: file.mimetype,
                    size: file.size,
                    url: `/uploads/${relativePath}`,
                    icon: getFileIcon(file.mimetype),
                    category: getFileCategory(file.mimetype)
                });

                logger.fileUpload(file.originalname, file.size, userId, {
                    fileId: fileUuid,
                    mimetype: file.mimetype
                });
            }

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: `成功上傳 ${uploadedFiles.length} 個文件`,
                data: {
                    files: uploadedFiles
                }
            });

        } catch (error) {
            logger.error('文件上傳失敗', {
                error: error.message,
                userId: req.user?.userId,
                files: req.files?.map(f => ({ name: f.originalname, size: f.size }))
            });

            // 清理已上傳的文件
            if (req.files) {
                for (const file of req.files) {
                    try {
                        await fs.unlink(file.path);
                    } catch (unlinkError) {
                        logger.error('清理文件失敗', { path: file.path, error: unlinkError.message });
                    }
                }
            }

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '文件上傳失敗';

            if (error.code === 'LIMIT_FILE_SIZE') {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '文件大小超過限制';
            } else if (error.message.includes('不支援的文件類型')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage,
                code: ERROR_CODES.UPLOAD_FAILED
            });
        }
    }

    // 獲取文件信息
    static async getFileInfo(req, res) {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;

            const file = await database.get(
                `SELECT f.*, u.username as uploader_name
                 FROM files f
                 LEFT JOIN users u ON f.uploaded_by = u.uuid
                 WHERE f.uuid = ?`,
                [fileId]
            );

            if (!file) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件不存在',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            // 檢查用戶是否有權限查看此文件
            let hasPermission = false;

            // 文件上傳者可以查看
            if (file.uploaded_by === userId) {
                hasPermission = true;
            }
            // 如果文件關聯到消息，檢查用戶是否能查看該消息
            else if (file.message_uuid) {
                const Message = require('../models/messages');
                const message = await Message.findByUuid(file.message_uuid);
                if (message) {
                    hasPermission = await message.canUserView(userId);
                }
            }

            if (!hasPermission) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權限查看此文件',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            res.json({
                success: true,
                data: {
                    uuid: file.uuid,
                    originalName: file.original_name,
                    filename: file.filename,
                    mimetype: file.mimetype,
                    size: file.size,
                    url: `/uploads/${file.path}`,
                    uploadedBy: file.uploaded_by,
                    uploaderName: file.uploader_name,
                    messageId: file.message_uuid,
                    createdAt: file.created_at,
                    icon: getFileIcon(file.mimetype),
                    category: getFileCategory(file.mimetype)
                }
            });

        } catch (error) {
            logger.error('獲取文件信息失敗', {
                error: error.message,
                fileId: req.params.fileId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取文件信息失敗'
            });
        }
    }

    // 下載文件
    static async downloadFile(req, res) {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;

            const file = await database.get('SELECT * FROM files WHERE uuid = ?', [fileId]);

            if (!file) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件不存在',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            // 檢查權限（同上）
            let hasPermission = false;

            if (file.uploaded_by === userId) {
                hasPermission = true;
            } else if (file.message_uuid) {
                const Message = require('../models/messages');
                const message = await Message.findByUuid(file.message_uuid);
                if (message) {
                    hasPermission = await message.canUserView(userId);
                }
            }

            if (!hasPermission) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權限下載此文件',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);

            // 檢查文件是否存在
            try {
                await fs.access(filePath);
            } catch (error) {
                logger.error('文件不存在於磁盤', { filePath, fileId });
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件已損壞或不存在'
                });
            }

            // 設置響應頭
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
            res.setHeader('Content-Type', file.mimetype);

            // 發送文件
            res.sendFile(path.resolve(filePath), (err) => {
                if (err) {
                    logger.error('文件發送失敗', { error: err.message, fileId });
                }
            });

            logger.info('文件下載', {
                fileId,
                userId,
                filename: file.original_name
            });

        } catch (error) {
            logger.error('文件下載失敗', {
                error: error.message,
                fileId: req.params.fileId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '文件下載失敗'
            });
        }
    }

    // 刪除文件
    static async deleteFile(req, res) {
        try {
            const { fileId } = req.params;
            const userId = req.user.userId;
            const isAdmin = req.user.role === 'admin';

            const file = await database.get('SELECT * FROM files WHERE uuid = ?', [fileId]);

            if (!file) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件不存在',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            // 檢查權限
            if (file.uploaded_by !== userId && !isAdmin) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只能刪除自己上傳的文件',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);

            // 從數據庫刪除記錄
            await database.run('DELETE FROM files WHERE uuid = ?', [fileId]);

            // 刪除物理文件
            try {
                await fs.unlink(filePath);
            } catch (error) {
                logger.warn('物理文件刪除失敗', { filePath, error: error.message });
            }

            logger.info('文件刪除成功', {
                fileId,
                userId,
                filename: file.original_name,
                deletedBy: isAdmin ? 'admin' : 'owner'
            });

            res.json({
                success: true,
                message: '文件刪除成功'
            });

        } catch (error) {
            logger.error('文件刪除失敗', {
                error: error.message,
                fileId: req.params.fileId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '文件刪除失敗'
            });
        }
    }

    // 獲取用戶文件列表
    static async getUserFiles(req, res) {
        try {
            const { page = 1, limit = 20, category, search } = req.query;
            const userId = req.user.userId;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = 'WHERE uploaded_by = ?';
            let params = [userId];

            // 添加分類篩選
            if (category) {
                const categoryMimetypes = {
                    'images': 'image/%',
                    'audio': 'audio/%',
                    'video': 'video/%',
                    'documents': 'application/%'
                };

                if (categoryMimetypes[category]) {
                    whereClause += ' AND mimetype LIKE ?';
                    params.push(categoryMimetypes[category]);
                }
            }

            // 添加搜索篩選
            if (search) {
                whereClause += ' AND original_name LIKE ?';
                params.push(`%${search}%`);
            }

            // 獲取總數
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM files ${whereClause}`,
                params
            );

            // 獲取文件列表
            const files = await database.query(
                `SELECT uuid, original_name, filename, mimetype, size, path, created_at
                 FROM files ${whereClause}
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, parseInt(limit), offset]
            );

            const filesWithUrls = files.map(file => ({
                ...file,
                url: `/uploads/${file.path}`,
                icon: getFileIcon(file.mimetype),
                category: getFileCategory(file.mimetype)
            }));

            res.json({
                success: true,
                data: {
                    files: filesWithUrls,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: countResult.total,
                        pages: Math.ceil(countResult.total / parseInt(limit))
                    }
                }
            });

        } catch (error) {
            logger.error('獲取用戶文件列表失敗', {
                error: error.message,
                userId: req.user?.userId,
                query: req.query
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取文件列表失敗'
            });
        }
    }

    // 獲取文件統計
    static async getFileStats(req, res) {
        try {
            const userId = req.user.userId;

            const stats = await database.get(
                `SELECT 
                    COUNT(*) as totalFiles,
                    SUM(size) as totalSize,
                    COUNT(CASE WHEN mimetype LIKE 'image/%' THEN 1 END) as imageCount,
                    COUNT(CASE WHEN mimetype LIKE 'audio/%' THEN 1 END) as audioCount,
                    COUNT(CASE WHEN mimetype LIKE 'video/%' THEN 1 END) as videoCount,
                    COUNT(CASE WHEN mimetype LIKE 'application/%' THEN 1 END) as documentCount
                 FROM files WHERE uploaded_by = ?`,
                [userId]
            );

            res.json({
                success: true,
                data: {
                    totalFiles: stats.totalFiles || 0,
                    totalSize: stats.totalSize || 0,
                    categories: {
                        images: stats.imageCount || 0,
                        audio: stats.audioCount || 0,
                        video: stats.videoCount || 0,
                        documents: stats.documentCount || 0
                    }
                }
            });

        } catch (error) {
            logger.error('獲取文件統計失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取統計失敗'
            });
        }
    }

    // 生成縮略圖（針對圖片）
    static async generateThumbnail(req, res) {
        try {
            const { fileId } = req.params;
            const { width = 150, height = 150 } = req.query;

            const file = await database.get('SELECT * FROM files WHERE uuid = ?', [fileId]);

            if (!file) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '文件不存在'
                });
            }

            if (!file.mimetype.startsWith('image/')) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '只支援圖片文件生成縮略圖'
                });
            }

            // 這裡可以使用 sharp 或其他圖片處理庫生成縮略圖
            // 由於沒有引入額外依賴，暫時返回原圖
            const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);

            res.setHeader('Content-Type', file.mimetype);
            res.sendFile(path.resolve(filePath));

        } catch (error) {
            logger.error('生成縮略圖失敗', {
                error: error.message,
                fileId: req.params.fileId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '生成縮略圖失敗'
            });
        }
    }

    // 清理臨時文件（管理員功能）
    static async cleanupTempFiles(req, res) {
        try {
            const tempDir = UPLOAD.TEMP_PATH;
            const files = await fs.readdir(tempDir);
            let cleanedCount = 0;

            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = await fs.stat(filePath);
                const now = new Date();
                const fileAge = now - stats.mtime;

                // 刪除超過1小時的臨時文件
                if (fileAge > 60 * 60 * 1000) {
                    await fs.unlink(filePath);
                    cleanedCount++;
                }
            }

            logger.info('臨時文件清理完成', {
                cleanedCount,
                executedBy: req.user.userId
            });

            res.json({
                success: true,
                message: `清理了 ${cleanedCount} 個臨時文件`,
                data: { cleanedCount }
            });

        } catch (error) {
            logger.error('清理臨時文件失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '清理失敗'
            });
        }
    }

    // 獲取存儲空間使用情況（管理員功能）
    static async getStorageUsage(req, res) {
        try {
            const stats = await database.get(
                `SELECT 
                    COUNT(*) as totalFiles,
                    SUM(size) as totalSize,
                    AVG(size) as averageSize,
                    COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as recentFiles
                 FROM files`
            );

            const categoryStats = await database.query(
                `SELECT 
                    CASE 
                        WHEN mimetype LIKE 'image/%' THEN 'images'
                        WHEN mimetype LIKE 'audio/%' THEN 'audio'
                        WHEN mimetype LIKE 'video/%' THEN 'video'
                        ELSE 'documents'
                    END as category,
                    COUNT(*) as count,
                    SUM(size) as size
                 FROM files
                 GROUP BY category`
            );

            res.json({
                success: true,
                data: {
                    overall: {
                        totalFiles: stats.totalFiles || 0,
                        totalSize: stats.totalSize || 0,
                        averageSize: stats.averageSize || 0,
                        recentFiles: stats.recentFiles || 0
                    },
                    categories: categoryStats
                }
            });

        } catch (error) {
            logger.error('獲取存儲使用情況失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取存儲信息失敗'
            });
        }
    }
}

module.exports = FileController;