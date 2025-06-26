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

// 異常處理器配置
const exceptionHandlers = [];
const rejectionHandlers = [];

// 文件輸出和異常處理
if (config.logging.file && config.logging.path) {
    // 確保日誌目錄存在
    const fs = require('fs');
    if (!fs.existsSync(config.logging.path)) {
        fs.mkdirSync(config.logging.path, { recursive: true });
    }

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

    // 異常處理器 - 文件
    exceptionHandlers.push(
        new winston.transports.File({
            filename: path.join(config.logging.path, 'exceptions.log'),
            format: logFormat
        })
    );

    // Promise 拒絕處理器 - 文件
    rejectionHandlers.push(
        new winston.transports.File({
            filename: path.join(config.logging.path, 'rejections.log'),
            format: logFormat
        })
    );
}

// 開發環境也添加控制台異常處理器
if (env === 'development') {
    exceptionHandlers.push(
        new winston.transports.Console({
            format: consoleFormat
        })
    );

    rejectionHandlers.push(
        new winston.transports.Console({
            format: consoleFormat
        })
    );
}

// 創建 logger 實例 - 修復關鍵配置
const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    defaultMeta: { service: 'elite-chat' },
    transports,

    // 修復：只有當有異常處理器時才啟用 exitOnError
    exitOnError: false, // 設為 false 避免錯誤

    // 異常處理器
    exceptionHandlers: exceptionHandlers.length > 0 ? exceptionHandlers : undefined,

    // Promise 拒絕處理器
    rejectionHandlers: rejectionHandlers.length > 0 ? rejectionHandlers : undefined,

    // 靜默模式（測試環境）
    silent: env === 'test'
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

    // 結構化錯誤日誌
    errorWithStack(error, context = {}) {
        return this.error(error.message, {
            stack: error.stack,
            name: error.name,
            context,
            timestamp: new Date().toISOString()
        });
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

// 處理未捕獲的異常（兜底處理）
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // 不要立即退出，讓應用嘗試恢復
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // 記錄但不退出
});

module.exports = appLogger;