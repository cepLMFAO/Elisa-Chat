const database = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const { UPLOAD } = require('../config/constants');

class File {
    constructor(data = {}) {
        this.id = data.id;
        this.uuid = data.uuid;
        this.originalName = data.original_name;
        this.filename = data.filename;
        this.mimetype = data.mimetype;
        this.size = data.size;
        this.path = data.path;
        this.uploadedBy = data.uploaded_by;
        this.messageUuid = data.message_uuid;
        this.createdAt = data.created_at;
    }

    // 創建新文件記錄
    static async create(fileData) {
        try {
            const {
                originalName,
                filename,
                mimetype,
                size,
                filePath,
                uploadedBy,
                messageUuid = null
            } = fileData;

            const fileUuid = uuidv4();

            await database.run(
                `INSERT INTO files (uuid, original_name, filename, mimetype, size, path, uploaded_by, message_uuid, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [fileUuid, originalName, filename, mimetype, size, filePath, uploadedBy, messageUuid]
            );

            logger.info('文件記錄創建成功', {
                fileId: fileUuid,
                originalName,
                uploadedBy
            });

            return await File.findByUuid(fileUuid);

        } catch (error) {
            logger.error('創建文件記錄失敗', {
                error: error.message,
                fileData
            });
            throw error;
        }
    }

    // 通過UUID查找文件
    static async findByUuid(uuid) {
        try {
            const file = await database.get(
                `SELECT f.*, u.username as uploader_name
                 FROM files f
                 LEFT JOIN users u ON f.uploaded_by = u.uuid
                 WHERE f.uuid = ?`,
                [uuid]
            );

            return file ? new File(file) : null;
        } catch (error) {
            logger.error('查找文件失敗', { error: error.message, uuid });
            throw error;
        }
    }

    // 通過消息UUID查找文件
    static async findByMessageUuid(messageUuid) {
        try {
            const files = await database.query(
                `SELECT f.*, u.username as uploader_name
                 FROM files f
                 LEFT JOIN users u ON f.uploaded_by = u.uuid
                 WHERE f.message_uuid = ?
                 ORDER BY f.created_at ASC`,
                [messageUuid]
            );

            return files.map(file => new File(file));
        } catch (error) {
            logger.error('查找消息文件失敗', { error: error.message, messageUuid });
            throw error;
        }
    }

    // 獲取用戶文件
    static async getUserFiles(userId, page = 1, limit = 20, filters = {}) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE f.uploaded_by = ?';
            let params = [userId];

            // 添加類型篩選
            if (filters.mimetype) {
                whereClause += ' AND f.mimetype LIKE ?';
                params.push(`${filters.mimetype}%`);
            }

            // 添加搜索篩選
            if (filters.search) {
                whereClause += ' AND f.original_name LIKE ?';
                params.push(`%${filters.search}%`);
            }

            // 獲取總數
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM files f ${whereClause}`,
                params
            );

            // 獲取文件列表
            const files = await database.query(
                `SELECT f.*, u.username as uploader_name
                 FROM files f
                 LEFT JOIN users u ON f.uploaded_by = u.uuid
                 ${whereClause}
                 ORDER BY f.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            return {
                files: files.map(file => new File(file)),
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            };

        } catch (error) {
            logger.error('獲取用戶文件失敗', {
                error: error.message,
                userId,
                filters
            });
            throw error;
        }
    }

    // 刪除文件
    async delete() {
        try {
            // 刪除數據庫記錄
            await database.run('DELETE FROM files WHERE uuid = ?', [this.uuid]);

            // 刪除物理文件
            const fullPath = path.join(UPLOAD.UPLOAD_PATH, this.path);
            try {
                await fs.unlink(fullPath);
            } catch (error) {
                logger.warn('刪除物理文件失敗', {
                    path: fullPath,
                    error: error.message
                });
            }

            logger.info('文件刪除成功', {
                fileId: this.uuid,
                originalName: this.originalName
            });

            return true;

        } catch (error) {
            logger.error('刪除文件失敗', {
                error: error.message,
                fileId: this.uuid
            });
            throw error;
        }
    }

    // 檢查文件是否存在於磁盤
    async exists() {
        try {
            const fullPath = path.join(UPLOAD.UPLOAD_PATH, this.path);
            await fs.access(fullPath);
            return true;
        } catch (error) {
            return false;
        }
    }

    // 獲取文件統計
    static async getStats(userId = null) {
        try {
            let whereClause = '';
            let params = [];

            if (userId) {
                whereClause = 'WHERE uploaded_by = ?';
                params = [userId];
            }

            const stats = await database.get(
                `SELECT 
                    COUNT(*) as totalFiles,
                    SUM(size) as totalSize,
                    COUNT(CASE WHEN mimetype LIKE 'image/%' THEN 1 END) as imageCount,
                    COUNT(CASE WHEN mimetype LIKE 'audio/%' THEN 1 END) as audioCount,
                    COUNT(CASE WHEN mimetype LIKE 'video/%' THEN 1 END) as videoCount,
                    COUNT(CASE WHEN mimetype LIKE 'application/%' THEN 1 END) as documentCount,
                    COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as recentFiles
                 FROM files ${whereClause}`,
                params
            );

            return {
                totalFiles: stats.totalFiles || 0,
                totalSize: stats.totalSize || 0,
                categories: {
                    images: stats.imageCount || 0,
                    audio: stats.audioCount || 0,
                    video: stats.videoCount || 0,
                    documents: stats.documentCount || 0
                },
                recentFiles: stats.recentFiles || 0
            };

        } catch (error) {
            logger.error('獲取文件統計失敗', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // 清理孤立文件
    static async cleanupOrphanFiles() {
        try {
            // 查找沒有關聯消息的文件（超過24小時）
            const orphanFiles = await database.query(
                `SELECT * FROM files 
                 WHERE message_uuid IS NULL 
                 AND created_at < datetime('now', '-1 day')`
            );

            let cleanedCount = 0;

            for (const fileData of orphanFiles) {
                const file = new File(fileData);
                try {
                    await file.delete();
                    cleanedCount++;
                } catch (error) {
                    logger.error('清理孤立文件失敗', {
                        fileId: file.uuid,
                        error: error.message
                    });
                }
            }

            logger.info('孤立文件清理完成', { cleanedCount });
            return cleanedCount;

        } catch (error) {
            logger.error('孤立文件清理失敗', { error: error.message });
            throw error;
        }
    }

    // 獲取文件類型
    getFileType() {
        if (this.mimetype.startsWith('image/')) return 'image';
        if (this.mimetype.startsWith('audio/')) return 'audio';
        if (this.mimetype.startsWith('video/')) return 'video';
        if (this.mimetype.startsWith('application/')) return 'document';
        return 'other';
    }

    // 獲取文件大小格式化字符串
    getFormattedSize() {
        const bytes = this.size;
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 轉換為JSON格式
    toJSON() {
        return {
            uuid: this.uuid,
            originalName: this.originalName,
            filename: this.filename,
            mimetype: this.mimetype,
            size: this.size,
            formattedSize: this.getFormattedSize(),
            type: this.getFileType(),
            uploadedBy: this.uploadedBy,
            uploaderName: this.uploaderName,
            messageUuid: this.messageUuid,
            createdAt: this.createdAt,
            url: `/api/files/${this.uuid}`,
            downloadUrl: `/api/files/${this.uuid}/download`
        };
    }
}

module.exports = File;