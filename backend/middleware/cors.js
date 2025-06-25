const cors = require('cors');
const { config } = require('../config/environment');
const logger = require('../utils/logger');

// CORS 配置選項
const corsOptions = {
    // 允許的來源
    origin: (origin, callback) => {
        // 開發環境允許所有來源
        if (!config.security.corsOrigin || config.security.corsOrigin === '*') {
            return callback(null, true);
        }

        // 檢查允許的來源列表
        const allowedOrigins = Array.isArray(config.security.corsOrigin)
            ? config.security.corsOrigin
            : [config.security.corsOrigin];

        // 允許無來源的請求（例如移動應用）
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            logger.security('CORS blocked request', {
                origin,
                allowedOrigins
            });
            callback(new Error('Not allowed by CORS'));
        }
    },

    // 允許的 HTTP 方法
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

    // 允許的請求頭
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'X-File-Name',
        'X-CSRF-Token'
    ],

    // 暴露的響應頭
    exposedHeaders: [
        'Content-Length',
        'Content-Range',
        'X-Content-Range',
        'X-Total-Count'
    ],

    // 允許發送憑證（cookies、授權頭等）
    credentials: true,

    // 預檢請求的緩存時間（秒）
    maxAge: 86400, // 24小時

    // 為預檢請求提供成功狀態碼
    optionsSuccessStatus: 200,

    // 預檢請求失敗時不會觸發下一個處理器
    preflightContinue: false
};

// 動態 CORS 中間件
const dynamicCors = (req, res, next) => {
    // 獲取請求來源
    const origin = req.get('Origin');

    // 記錄 CORS 請求
    if (origin) {
        logger.http('CORS request', {
            origin,
            method: req.method,
            path: req.path,
            userAgent: req.get('User-Agent')
        });
    }

    // 應用 CORS 配置
    cors(corsOptions)(req, res, next);
};

// 嚴格的 CORS 中間件（用於敏感操作）
const strictCors = cors({
    origin: (origin, callback) => {
        // 嚴格模式下只允許配置的來源
        const allowedOrigins = config.security.corsOrigin;

        if (!allowedOrigins || allowedOrigins === '*') {
            return callback(new Error('Strict CORS requires explicit origin configuration'));
        }

        const allowedList = Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins];

        if (!origin || !allowedList.includes(origin)) {
            logger.security('Strict CORS blocked request', {
                origin,
                allowedOrigins: allowedList
            });
            return callback(new Error('Not allowed by strict CORS policy'));
        }

        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
});

// WebSocket CORS 檢查
const checkWebSocketOrigin = (origin) => {
    if (!config.security.corsOrigin || config.security.corsOrigin === '*') {
        return true;
    }

    const allowedOrigins = Array.isArray(config.security.corsOrigin)
        ? config.security.corsOrigin
        : [config.security.corsOrigin];

    return allowedOrigins.includes(origin);
};

// 預檢請求處理
const handlePreflight = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        logger.http('CORS preflight request', {
            origin: req.get('Origin'),
            method: req.get('Access-Control-Request-Method'),
            headers: req.get('Access-Control-Request-Headers')
        });
    }
    next();
};

// CORS 錯誤處理
const handleCorsError = (err, req, res, next) => {
    if (err && err.message && err.message.includes('CORS')) {
        logger.security('CORS error', {
            error: err.message,
            origin: req.get('Origin'),
            method: req.method,
            path: req.path,
            ip: req.ip
        });

        return res.status(403).json({
            success: false,
            error: 'CORS policy violation',
            code: 'CORS_ERROR'
        });
    }
    next(err);
};

// 開發環境 CORS（允許所有來源）
const devCors = cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200
});

// API CORS（用於 API 端點）
const apiCors = cors({
    origin: config.security.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-API-Key'
    ],
    maxAge: 3600 // 1小時緩存
});

// 文件上傳 CORS
const uploadCors = cors({
    origin: config.security.corsOrigin,
    credentials: true,
    methods: ['POST', 'PUT'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-File-Name',
        'X-File-Size'
    ]
});

module.exports = {
    // 默認 CORS 中間件
    default: dynamicCors,

    // 嚴格 CORS
    strict: strictCors,

    // 開發環境 CORS
    development: devCors,

    // API CORS
    api: apiCors,

    // 文件上傳 CORS
    upload: uploadCors,

    // 工具函數
    checkWebSocketOrigin,
    handlePreflight,
    handleCorsError,

    // CORS 選項
    options: corsOptions
};