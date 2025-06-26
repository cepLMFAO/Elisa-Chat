const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, UPLOAD } = require('../config/constants');

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
                    `INSERT INTO files (uuid, original_name, filename, path, size, mimetype, uploaded_by, message_uuid, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [fileUuid, file.originalname, file.filename, relativePath, file.size, file.mimetype, userId, messageId || null]
                );

                uploadedFiles.push({
                    id: fileUuid,
                    originalName: file.originalname,
                    filename: file.filename,
                    size: file.size,
                    mimetype: file.mimetype,
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

            // 檢查權限
            let hasPermission = false;

            if (file.uploaded_by === userId) {
                hasPermission = true;
            } else if (file.message_uuid) {
                // 檢查是否可以訪問相關訊息
                const message = await database.get(
                    `SELECT m.*, rm.role
                     FROM messages m
                     LEFT JOIN room_members rm ON rm.room_uuid = m.room_uuid AND rm.user_uuid = ?
                     WHERE m.uuid = ?`,
                    [userId, file.message_uuid]
                );

                if (message) {
                    hasPermission = true;
                }
            }

            if (!hasPermission) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權限訪問此文件',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            res.json({
                success: true,
                data: {
                    id: file.uuid,
                    originalName: file.original_name,
                    filename: file.filename,
                    size: file.size,
                    mimetype: file.mimetype,
                    uploadedBy: file.uploader_name,
                    uploadedAt: file.created_at,
                    url: `/uploads/${file.path}`,
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
                const message = await database.get(
                    `SELECT m.*, rm.role
                     FROM messages m
                     LEFT JOIN room_members rm ON rm.room_uuid = m.room_uuid AND rm.user_uuid = ?
                     WHERE m.uuid = ?`,
                    [userId, file.message_uuid]
                );

                if (message) {
                    hasPermission = true;
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

            // 檢查刪除權限
            if (file.uploaded_by !== userId && !isAdmin) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權限刪除此文件',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            // 刪除物理文件
            const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);
            try {
                await fs.unlink(filePath);
            } catch (error) {
                logger.warn('刪除物理文件失敗', { filePath, error: error.message });
            }

            // 從數據庫刪除記錄
            await database.run('DELETE FROM files WHERE uuid = ?', [fileId]);

            logger.info('文件刪除', {
                fileId,
                userId,
                filename: file.original_name,
                deletedBy: userId
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
            const userId = req.user.userId;
            const { page = 1, limit = 20, category, search } = req.query;

            let query = `
                SELECT f.*, u.username as uploader_name
                FROM files f
                LEFT JOIN users u ON f.uploaded_by = u.uuid
                WHERE f.uploaded_by = ?
            `;
            const params = [userId];

            // 分類過濾
            if (category && category !== 'all') {
                if (category === 'images') {
                    query += ` AND f.mimetype LIKE 'image/%'`;
                } else if (category === 'audio') {
                    query += ` AND f.mimetype LIKE 'audio/%'`;
                } else if (category === 'video') {
                    query += ` AND f.mimetype LIKE 'video/%'`;
                } else if (category === 'documents') {
                    query += ` AND f.mimetype NOT LIKE 'image/%' AND f.mimetype NOT LIKE 'audio/%' AND f.mimetype NOT LIKE 'video/%'`;
                }
            }

            // 搜索過濾
            if (search) {
                query += ` AND f.original_name LIKE ?`;
                params.push(`%${search}%`);
            }

            query += ` ORDER BY f.created_at DESC`;

            // 分頁
            const offset = (page - 1) * limit;
            query += ` LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), offset);

            const files = await database.query(query, params);

            // 獲取總數
            let countQuery = `
                SELECT COUNT(*) as total
                FROM files f
                WHERE f.uploaded_by = ?
            `;
            const countParams = [userId];

            if (category && category !== 'all') {
                if (category === 'images') {
                    countQuery += ` AND f.mimetype LIKE 'image/%'`;
                } else if (category === 'audio') {
                    countQuery += ` AND f.mimetype LIKE 'audio/%'`;
                } else if (category === 'video') {
                    countQuery += ` AND f.mimetype LIKE 'video/%'`;
                } else if (category === 'documents') {
                    countQuery += ` AND f.mimetype NOT LIKE 'image/%' AND f.mimetype NOT LIKE 'audio/%' AND f.mimetype NOT LIKE 'video/%'`;
                }
            }

            if (search) {
                countQuery += ` AND f.original_name LIKE ?`;
                countParams.push(`%${search}%`);
            }

            const totalResult = await database.get(countQuery, countParams);
            const total = totalResult.total;

            const formattedFiles = files.map(file => ({
                id: file.uuid,
                originalName: file.original_name,
                filename: file.filename,
                size: file.size,
                mimetype: file.mimetype,
                uploadedAt: file.created_at,
                url: `/uploads/${file.path}`,
                icon: getFileIcon(file.mimetype),
                category: getFileCategory(file.mimetype)
            }));

            res.json({
                success: true,
                data: {
                    files: formattedFiles,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                }
            });

        } catch (error) {
            logger.error('獲取用戶文件列表失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取文件列表失敗'
            });
        }
    }

    // 批量刪除文件
    static async bulkDeleteFiles(req, res) {
        try {
            const { fileIds } = req.body;
            const userId = req.user.userId;
            const isAdmin = req.user.role === 'admin';

            if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '請提供要刪除的文件ID列表',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const deletedFiles = [];
            const errors = [];

            for (const fileId of fileIds) {
                try {
                    const file = await database.get('SELECT * FROM files WHERE uuid = ?', [fileId]);

                    if (!file) {
                        errors.push({
                            fileId,
                            error: '文件不存在'
                        });
                        continue;
                    }

                    // 檢查刪除權限
                    if (file.uploaded_by !== userId && !isAdmin) {
                        errors.push({
                            fileId,
                            error: '無權限刪除此文件'
                        });
                        continue;
                    }

                    // 刪除物理文件
                    const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);
                    try {
                        await fs.unlink(filePath);
                    } catch (error) {
                        logger.warn('刪除物理文件失敗', { filePath, error: error.message });
                    }

                    // 從數據庫刪除記錄
                    await database.run('DELETE FROM files WHERE uuid = ?', [fileId]);

                    deletedFiles.push({
                        fileId,
                        filename: file.original_name
                    });

                } catch (error) {
                    logger.error('批量刪除單個文件失敗', {
                        fileId,
                        error: error.message
                    });

                    errors.push({
                        fileId,
                        error: error.message
                    });
                }
            }

            res.json({
                success: deletedFiles.length > 0,
                message: `成功刪除 ${deletedFiles.length} 個文件`,
                data: {
                    deletedFiles,
                    errors
                }
            });

        } catch (error) {
            logger.error('批量刪除文件失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '批量刪除失敗'
            });
        }
    }

    // 清理孤立文件（管理員功能）
    static async cleanupOrphanFiles(req, res) {
        try {
            // 查找沒有對應訊息的文件
            const orphanFiles = await database.query(
                `SELECT f.* FROM files f
                 LEFT JOIN messages m ON f.message_uuid = m.uuid
                 WHERE f.message_uuid IS NOT NULL AND m.uuid IS NULL`
            );

            const deletedFiles = [];

            for (const file of orphanFiles) {
                try {
                    // 刪除物理文件
                    const filePath = path.join(UPLOAD.UPLOAD_PATH, file.path);
                    try {
                        await fs.unlink(filePath);
                    } catch (error) {
                        logger.warn('刪除孤立物理文件失敗', { filePath, error: error.message });
                    }

                    // 從數據庫刪除記錄
                    await database.run('DELETE FROM files WHERE uuid = ?', [file.uuid]);

                    deletedFiles.push({
                        fileId: file.uuid,
                        filename: file.original_name
                    });

                } catch (error) {
                    logger.error('清理單個孤立文件失敗', {
                        fileId: file.uuid,
                        error: error.message
                    });
                }
            }

            logger.info('孤立文件清理完成', {
                cleanedCount: deletedFiles.length,
                userId: req.user?.userId
            });

            res.json({
                success: true,
                message: `清理了 ${deletedFiles.length} 個孤立文件`,
                data: {
                    deletedFiles
                }
            });

        } catch (error) {
            logger.error('清理孤立文件失敗', {
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