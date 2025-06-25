const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const File = require('../models/files');
const EncryptionService = require('./encryptionService');
const logger = require('../utils/logger');
const { UPLOAD, ERROR_CODES } = require('../config/constants');

class FileService {
    // 支持的文件類型配置
    static FILE_TYPES = {
        IMAGE: {
            mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            maxSize: UPLOAD.MAX_IMAGE_SIZE,
            extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp']
        },
        AUDIO: {
            mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'],
            maxSize: UPLOAD.MAX_FILE_SIZE,
            extensions: ['.mp3', '.wav', '.ogg', '.m4a']
        },
        VIDEO: {
            mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
            maxSize: UPLOAD.MAX_FILE_SIZE,
            extensions: ['.mp4', '.webm', '.mov']
        },
        DOCUMENT: {
            mimeTypes: [
                'text/plain',
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ],
            maxSize: UPLOAD.MAX_FILE_SIZE,
            extensions: ['.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx']
        }
    };

    // 創建上傳配置
    static createUploadConfig() {
        const storage = multer.diskStorage({
            destination: async (req, file, cb) => {
                try {
                    const category = FileService.getFileCategory(file.mimetype);
                    const uploadDir = path.join(UPLOAD.UPLOAD_PATH, category);
                    await fs.mkdir(uploadDir, { recursive: true });
                    cb(null, uploadDir);
                } catch (error) {
                    cb(error);
                }
            },
            filename: (req, file, cb) => {
                const uniqueId = uuidv4();
                const ext = path.extname(file.originalname);
                const filename = `${uniqueId}_${Date.now()}${ext}`;
                cb(null, filename);
            }
        });

        const fileFilter = (req, file, cb) => {
            const isValid = FileService.validateFileType(file);
            if (isValid.success) {
                cb(null, true);
            } else {
                cb(new Error(isValid.error), false);
            }
        };

        return multer({
            storage,
            fileFilter,
            limits: {
                fileSize: UPLOAD.MAX_FILE_SIZE,
                files: 10 // 最多同時上傳10個文件
            }
        });
    }

    // 獲取文件分類
    static getFileCategory(mimetype) {
        if (mimetype.startsWith('image/')) return 'images';
        if (mimetype.startsWith('audio/')) return 'audio';
        if (mimetype.startsWith('video/')) return 'video';
        return 'files';
    }

    // 驗證文件類型
    static validateFileType(file) {
        const { mimetype, originalname } = file;
        const ext = path.extname(originalname).toLowerCase();

        // 檢查是否為允許的文件類型
        const isAllowedType = UPLOAD.ALLOWED_FILE_TYPES.includes(mimetype);
        if (!isAllowedType) {
            return {
                success: false,
                error: `不支持的文件類型: ${mimetype}`
            };
        }

        // 檢查文件擴展名與MIME類型是否匹配
        for (const [type, config] of Object.entries(FileService.FILE_TYPES)) {
            if (config.mimeTypes.includes(mimetype)) {
                if (!config.extensions.includes(ext)) {
                    return {
                        success: false,
                        error: `文件擴展名與類型不匹配: ${ext} / ${mimetype}`
                    };
                }
                break;
            }
        }

        return { success: true };
    }

    // 驗證文件大小
    static validateFileSize(file, maxSize = null) {
        const size = file.size;
        let allowedSize = maxSize || UPLOAD.MAX_FILE_SIZE;

        // 圖片文件有特殊的大小限制
        if (file.mimetype.startsWith('image/')) {
            allowedSize = Math.min(allowedSize, UPLOAD.MAX_IMAGE_SIZE);
        }

        if (size > allowedSize) {
            return {
                success: false,
                error: `文件大小超過限制: ${FileService.formatFileSize(size)} > ${FileService.formatFileSize(allowedSize)}`
            };
        }

        return { success: true };
    }

    // 處理文件上傳
    static async processUpload(files, userId, messageId = null) {
        const uploadedFiles = [];
        const errors = [];

        try {
            for (const file of files) {
                try {
                    // 驗證文件
                    const sizeValidation = FileService.validateFileSize(file);
                    if (!sizeValidation.success) {
                        errors.push({
                            filename: file.originalname,
                            error: sizeValidation.error
                        });
                        continue;
                    }

                    // 生成文件哈希（用於去重和完整性檢查）
                    const fileHash = await EncryptionService.generateFileHash(file.path);

                    // 檢查是否已存在相同文件
                    const existingFile = await FileService.findFileByHash(fileHash, userId);
                    if (existingFile) {
                        // 如果文件已存在，創建新的記錄但指向同一個物理文件
                        const fileRecord = await File.create({
                            originalName: file.originalname,
                            filename: existingFile.filename,
                            mimetype: file.mimetype,
                            size: file.size,
                            filePath: existingFile.path,
                            uploadedBy: userId,
                            messageUuid: messageId
                        });

                        uploadedFiles.push(fileRecord);
                        continue;
                    }

                    // 計算相對路徑
                    const relativePath = path.relative(UPLOAD.UPLOAD_PATH, file.path);

                    // 創建文件記錄
                    const fileRecord = await File.create({
                        originalName: file.originalname,
                        filename: file.filename,
                        mimetype: file.mimetype,
                        size: file.size,
                        filePath: relativePath,
                        uploadedBy: userId,
                        messageUuid: messageId
                    });

                    // 存儲文件哈希（用於去重）
                    await FileService.saveFileHash(fileRecord.uuid, fileHash);

                    uploadedFiles.push(fileRecord);

                    logger.info('文件上傳成功', {
                        fileId: fileRecord.uuid,
                        originalName: file.originalname,
                        size: file.size,
                        userId
                    });

                } catch (error) {
                    logger.error('處理單個文件失敗', {
                        filename: file.originalname,
                        error: error.message,
                        userId
                    });

                    errors.push({
                        filename: file.originalname,
                        error: error.message
                    });

                    // 清理失敗的文件
                    try {
                        await fs.unlink(file.path);
                    } catch (unlinkError) {
                        logger.error('清理失敗文件時出錯', {
                            path: file.path,
                            error: unlinkError.message
                        });
                    }
                }
            }

            return {
                success: uploadedFiles.length > 0,
                uploadedFiles,
                errors
            };

        } catch (error) {
            logger.error('文件上傳處理失敗', {
                error: error.message,
                userId,
                fileCount: files.length
            });
            throw error;
        }
    }

    // 保存文件哈希
    static async saveFileHash(fileUuid, hash) {
        try {
            const database = require('../config/database');
            await database.run(
                `INSERT OR REPLACE INTO file_hashes (file_uuid, hash, created_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP)`,
                [fileUuid, hash]
            );
        } catch (error) {
            logger.error('保存文件哈希失敗', { error: error.message });
        }
    }

    // 通過哈希查找文件
    static async findFileByHash(hash, userId) {
        try {
            const database = require('../config/database');
            const result = await database.get(
                `SELECT f.* FROM files f
                 JOIN file_hashes fh ON f.uuid = fh.file_uuid
                 WHERE fh.hash = ? AND f.uploaded_by = ?
                 LIMIT 1`,
                [hash, userId]
            );

            return result ? new File(result) : null;
        } catch (error) {
            logger.error('通過哈希查找文件失敗', { error: error.message });
            return null;
        }
    }

    // 生成縮略圖
    static async generateThumbnail(fileUuid, width = 150, height = 150) {
        try {
            const file = await File.findByUuid(fileUuid);
            if (!file || !file.mimetype.startsWith('image/')) {
                throw new Error('只能為圖片文件生成縮略圖');
            }

            // 這裡可以使用 sharp 或其他圖片處理庫
            // 由於沒有引入額外依賴，暫時返回原圖路徑
            const fullPath = path.join(UPLOAD.UPLOAD_PATH, file.path);

            // 檢查文件是否存在
            await fs.access(fullPath);

            return {
                success: true,
                thumbnailPath: fullPath,
                originalPath: fullPath
            };

        } catch (error) {
            logger.error('生成縮略圖失敗', {
                error: error.message,
                fileUuid,
                width,
                height
            });
            throw error;
        }
    }

    // 格式化文件大小
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 獲取文件MIME類型圖標
    static getFileIcon(mimetype) {
        const iconMap = {
            'application/pdf': '📄',
            'application/msword': '📝',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
            'application/vnd.ms-excel': '📊',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
            'text/plain': '📃',
            'application/zip': '🗜️',
            'application/x-rar-compressed': '🗜️'
        };

        if (mimetype.startsWith('image/')) return '🖼️';
        if (mimetype.startsWith('audio/')) return '🎵';
        if (mimetype.startsWith('video/')) return '🎬';

        return iconMap[mimetype] || '📁';
    }

    // 清理臨時文件
    static async cleanupTempFiles() {
        try {
            const tempDir = UPLOAD.TEMP_PATH;
            const files = await fs.readdir(tempDir);
            let cleanedCount = 0;

            for (const file of files) {
                try {
                    const filePath = path.join(tempDir, file);
                    const stats = await fs.stat(filePath);
                    const now = new Date();
                    const fileAge = now - stats.mtime;

                    // 刪除超過1小時的臨時文件
                    if (fileAge > 60 * 60 * 1000) {
                        await fs.unlink(filePath);
                        cleanedCount++;
                    }
                } catch (error) {
                    logger.error('清理單個臨時文件失敗', {
                        file,
                        error: error.message
                    });
                }
            }

            logger.info('臨時文件清理完成', { cleanedCount });
            return cleanedCount;

        } catch (error) {
            logger.error('清理臨時文件失敗', { error: error.message });
            throw error;
        }
    }

    // 檢查存儲空間
    static async checkStorageSpace() {
        try {
            const { execSync } = require('child_process');
            const uploadPath = UPLOAD.UPLOAD_PATH;

            // 在Unix系統上使用df命令
            if (process.platform !== 'win32') {
                const output = execSync(`df -h "${uploadPath}"`, { encoding: 'utf8' });
                const lines = output.trim().split('\n');
                const data = lines[1].split(/\s+/);

                return {
                    total: data[1],
                    used: data[2],
                    available: data[3],
                    usePercentage: data[4]
                };
            } else {
                // Windows系統的簡化版本
                return {
                    total: 'N/A',
                    used: 'N/A',
                    available: 'N/A',
                    usePercentage: 'N/A'
                };
            }

        } catch (error) {
            logger.error('檢查存儲空間失敗', { error: error.message });
            return {
                error: '無法獲取存儲空間信息'
            };
        }
    }

    // 批量刪除文件
    static async bulkDeleteFiles(fileUuids, userId, isAdmin = false) {
        const deletedFiles = [];
        const errors = [];

        try {
            for (const fileUuid of fileUuids) {
                try {
                    const file = await File.findByUuid(fileUuid);
                    if (!file) {
                        errors.push({
                            fileUuid,
                            error: '文件不存在'
                        });
                        continue;
                    }

                    // 檢查權限
                    if (file.uploadedBy !== userId && !isAdmin) {
                        errors.push({
                            fileUuid,
                            error: '無權刪除此文件'
                        });
                        continue;
                    }

                    await file.delete();
                    deletedFiles.push(fileUuid);

                } catch (error) {
                    logger.error('刪除單個文件失敗', {
                        fileUuid,
                        error: error.message
                    });

                    errors.push({
                        fileUuid,
                        error: error.message
                    });
                }
            }

            return {
                success: deletedFiles.length > 0,
                deletedFiles,
                errors
            };

        } catch (error) {
            logger.error('批量刪除文件失敗', {
                error: error.message,
                fileCount: fileUuids.length
            });
            throw error;
        }
    }

    // 文件病毒掃描（模擬）
    static async scanFile(filePath) {
        try {
            // 這裡可以集成實際的病毒掃描引擎
            // 目前只是模擬檢查

            const stats = await fs.stat(filePath);

            // 檢查文件大小是否異常
            if (stats.size > UPLOAD.MAX_FILE_SIZE * 2) {
                return {
                    safe: false,
                    reason: '文件大小異常'
                };
            }

            // 檢查文件是否為可執行文件
            const ext = path.extname(filePath).toLowerCase();
            const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.com', '.pif'];

            if (dangerousExtensions.includes(ext)) {
                return {
                    safe: false,
                    reason: '潛在危險的文件類型'
                };
            }

            return {
                safe: true,
                reason: '文件安全'
            };

        } catch (error) {
            logger.error('文件掃描失敗', {
                error: error.message,
                filePath
            });

            return {
                safe: false,
                reason: '掃描失敗'
            };
        }
    }
}

module.exports = FileService;