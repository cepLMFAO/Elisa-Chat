const winston = require('winston');
const path = require('path');
const { config, env } = require('../config/environment');

// 自定義日誌格式
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
);

// 控制台格式（開發環境）
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;

        // 添加額外的元數據
        if (Object.keys(meta).length > 0) {
            msg += '\n' + JSON.stringify(meta, null, 2);
        }

        return msg;
    })
);

// 創建傳輸器
const transports = [];

// 控制台輸出
if (config.logging.console) {
    transports.push(
        new winston.transports.Console({
            format: env === 'development' ? consoleFormat : logFormat,
            level: config.logging.level
        })
    );
}

// 文件輸出
if (config.logging.file && config.logging.path) {
    // 錯誤日誌
    transports.push(
        new winston.transports.File({
            filename: path.join(config.logging.path, 'error.log'),
            level: 'error',
            format: logFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 10
        })
    );

    // 組合日誌
    transports.push(
        new winston.transports.File({
            filename: path.join(config.logging.path, 'combined.log'),
            format: logFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 10
        })
    );

    // HTTP 請求日誌
    transports.push(
        new winston.transports.File({
            filename: path.join(config.logging.path, 'http.log'),
            level: 'http',
            format: logFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    );
}

// 創建 logger 實例
const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    defaultMeta: { service: 'elite-chat' },
    transports,
    // 處理未捕獲的異常
    exceptionHandlers: config.logging.file ? [
        new winston.transports.File({
            filename: path.join(config.logging.path, 'exceptions.log')
        })
    ] : [],
    // 處理未處理的 Promise 拒絕
    rejectionHandlers: config.logging.file ? [
        new winston.transports.File({
            filename: path.join(config.logging.path, 'rejections.log')
        })
    ] : []
});

// 擴展 logger 功能
class Logger {
    constructor() {
        this.winston = logger;
    }

    // 基本日誌方法
    error(message, meta = {}) {
        return this.winston.error(message, meta);
    }

    warn(message, meta = {}) {
        return this.winston.warn(message, meta);
    }

    info(message, meta = {}) {
        return this.winston.info(message, meta);
    }

    http(message, meta = {}) {
        return this.winston.http(message, meta);
    }

    debug(message, meta = {}) {
        return this.winston.debug(message, meta);
    }

    // 專用日誌方法
    auth(action, userId, meta = {}) {
        return this.info(`Auth: ${action}`, {
            userId,
            category: 'authentication',
            ...meta
        });
    }

    database(operation, table, meta = {}) {
        return this.debug(`DB: ${operation} on ${table}`, {
            category: 'database',
            operation,
            table,
            ...meta
        });
    }

    websocket(event, userId, meta = {}) {
        return this.debug(`WS: ${event}`, {
            userId,
            category: 'websocket',
            event,
            ...meta
        });
    }

    security(event, details, meta = {}) {
        return this.warn(`Security: ${event}`, {
            category: 'security',
            event,
            details,
            ...meta
        });
    }

    performance(operation, duration, meta = {}) {
        return this.info(`Performance: ${operation} took ${duration}ms`, {
            category: 'performance',
            operation,
            duration,
            ...meta
        });
    }

    api(method, path, statusCode, responseTime, meta = {}) {
        const level = statusCode >= 400 ? 'warn' : 'http';
        return this.winston[level](`${method} ${path} ${statusCode}`, {
            category: 'api',
            method,
            path,
            statusCode,
            responseTime,
            ...meta
        });
    }

    fileUpload(filename, size, userId, meta = {}) {
        return this.info(`File uploaded: ${filename}`, {
            category: 'file_upload',
            filename,
            size,
            userId,
            ...meta
        });
    }

    // 結構化錯誤日誌
    errorWithStack(error, context = {}) {
        return this.error(error.message, {
            stack: error.stack,
            name: error.name,
            context,
            timestamp: new Date().toISOString()
        });
    }

    // 請求日誌中間件
    requestLogger() {
        return (req, res, next) => {
            const start = Date.now();

            // 記錄請求開始
            this.http(`${req.method} ${req.originalUrl} - START`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                userId: req.user?.id
            });

            // 監聽響應結束
            res.on('finish', () => {
                const duration = Date.now() - start;
                this.api(
                    req.method,
                    req.originalUrl,
                    res.statusCode,
                    duration,
                    {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        userId: req.user?.id,
                        contentLength: res.get('Content-Length')
                    }
                );
            });

            next();
        };
    }

    // WebSocket 連接日誌
    wsConnection(action, socketId, userId = null, meta = {}) {
        return this.info(`WebSocket ${action}`, {
            category: 'websocket_connection',
            action,
            socketId,
            userId,
            ...meta
        });
    }

    // 清理舊日誌文件
    cleanup(daysToKeep = 30) {
        if (!config.logging.file) return;

        const fs = require('fs');
        const logDir = config.logging.path;

        try {
            const files = fs.readdirSync(logDir);
            const now = Date.now();
            const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

            files.forEach(file => {
                const filePath = path.join(logDir, file);
                const stats = fs.statSync(filePath);

                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    this.info(`Cleaned up old log file: ${file}`);
                }
            });
        } catch (error) {
            this.error('Failed to cleanup log files:', { error: error.message });
        }
    }

    // 獲取日誌統計
    async getStats() {
        if (!config.logging.file) {
            return { message: 'File logging not enabled' };
        }

        const fs = require('fs').promises;
        const logDir = config.logging.path;

        try {
            const files = await fs.readdir(logDir);
            const stats = {};

            for (const file of files) {
                const filePath = path.join(logDir, file);
                const fileStat = await fs.stat(filePath);
                stats[file] = {
                    size: fileStat.size,
                    created: fileStat.birthtime,
                    modified: fileStat.mtime
                };
            }

            return stats;
        } catch (error) {
            this.error('Failed to get log stats:', { error: error.message });
            return { error: error.message };
        }
    }

    // 設置日誌級別
    setLevel(level) {
        this.winston.level = level;
        this.info(`Log level changed to: ${level}`);
    }

    // 創建子 logger
    child(defaultMeta = {}) {
        return this.winston.child(defaultMeta);
    }
}

// 創建全局 logger 實例
const appLogger = new Logger();

// 在測試環境中靜默日誌
if (env === 'test') {
    appLogger.winston.silent = true;
}

// 定期清理日誌文件（生產環境）
if (env === 'production' && config.logging.file) {
    setInterval(() => {
        appLogger.cleanup(30); // 保留30天的日誌
    }, 24 * 60 * 60 * 1000); // 每天執行一次
}

module.exports = appLogger;