const path = require('path');

module.exports = {
    // 服務器配置
    SERVER: {
        PORT: process.env.PORT || 8080,
        HOST: process.env.HOST || 'localhost',
        NODE_ENV: process.env.NODE_ENV || 'development',
        CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000'
    },

    // 數據庫配置
    DATABASE: {
        PATH: process.env.DB_PATH || path.join(__dirname, '../database/chat.db'),
        BACKUP_PATH: process.env.DB_BACKUP_PATH || path.join(__dirname, '../database/backups/'),
        MAX_CONNECTIONS: parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
        BUSY_TIMEOUT: parseInt(process.env.DB_BUSY_TIMEOUT) || 30000
    },

    // JWT 配置
    JWT: {
        SECRET: process.env.JWT_SECRET || 'elite-chat-super-secret-key-change-in-production',
        EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
        REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
    },

    // 加密配置
    ENCRYPTION: {
        BCRYPT_ROUNDS: 12,
        AES_KEY: process.env.AES_KEY || 'elite-chat-aes-key-256-bit-change-me',
        IV_LENGTH: 16
    },

    // 速率限制
    RATE_LIMIT: {
        WINDOW_MS: 15 * 60 * 1000, // 15分鐘
        MAX_REQUESTS: 100, // 每個IP最多100次請求
        MESSAGE_LIMIT: 60, // 每分鐘最多60條訊息
        UPLOAD_LIMIT: 10, // 每分鐘最多10次上傳
        LOGIN_ATTEMPTS: 5 // 每15分鐘最多5次登錄嘗試
    },

    // 文件上傳配置
    UPLOAD: {
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
        MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB for images
        ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        ALLOWED_FILE_TYPES: [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'text/plain', 'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'audio/mpeg', 'audio/wav', 'audio/ogg',
            'video/mp4', 'video/webm'
        ],
        UPLOAD_PATH: path.join(__dirname, '../uploads/'),
        TEMP_PATH: path.join(__dirname, '../uploads/temp/')
    },

    // WebSocket 事件
    WS_EVENTS: {
        // 連接事件
        CONNECTION: 'connection',
        DISCONNECT: 'disconnect',
        ERROR: 'error',

        // 認證事件
        AUTH_SUCCESS: 'auth:success',
        AUTH_FAILED: 'auth:failed',
        LOGOUT: 'logout',

        // 用戶事件
        USER_ONLINE: 'user:online',
        USER_OFFLINE: 'user:offline',
        USER_STATUS: 'user:status',
        USER_TYPING: 'user:typing',
        USER_STOP_TYPING: 'user:stop_typing',
        USER_JOIN_ROOM: 'user:join_room',
        USER_LEAVE_ROOM: 'user:leave_room',

        // 房間事件
        JOIN_ROOM: 'room:join',
        LEAVE_ROOM: 'room:leave',
        ROOM_CREATED: 'room:created',
        ROOM_UPDATED: 'room:updated',
        ROOM_DELETED: 'room:deleted',

        // 訊息事件
        MESSAGE: 'message',
        MESSAGE_SENT: 'message:sent',
        MESSAGE_RECEIVED: 'message:received',
        MESSAGE_EDITED: 'message:edited',
        MESSAGE_DELETED: 'message:deleted',
        MESSAGE_REACTION: 'message:reaction',
        PRIVATE_MESSAGE: 'private:message',

        // 通話事件
        CALL_OFFER: 'call:offer',
        CALL_ANSWER: 'call:answer',
        CALL_CANDIDATE: 'call:candidate',
        CALL_END: 'call:end',

        // 通知事件
        NOTIFICATION: 'notification',
        NOTIFICATION_READ: 'notification:read'
    },

    // 用戶狀態
    USER_STATUS: {
        ONLINE: 'online',
        AWAY: 'away',
        BUSY: 'busy',
        INVISIBLE: 'invisible',
        OFFLINE: 'offline'
    },

    // 房間類型
    ROOM_TYPES: {
        PUBLIC: 'public',
        PRIVATE: 'private',
        GROUP: 'group',
        DIRECT: 'direct'
    },

    // 房間角色
    ROOM_ROLES: {
        OWNER: 'owner',
        ADMIN: 'admin',
        MODERATOR: 'moderator',
        MEMBER: 'member'
    },

    // 訊息類型
    MESSAGE_TYPES: {
        TEXT: 'text',
        IMAGE: 'image',
        FILE: 'file',
        VOICE: 'voice',
        VIDEO: 'video',
        LOCATION: 'location',
        SYSTEM: 'system'
    },

    // 通知類型
    NOTIFICATION_TYPES: {
        MESSAGE: 'message',
        FRIEND_REQUEST: 'friend_request',
        ROOM_INVITE: 'room_invite',
        SYSTEM: 'system'
    },

    // HTTP 狀態碼
    HTTP_STATUS: {
        OK: 200,
        CREATED: 201,
        NO_CONTENT: 204,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        UNPROCESSABLE_ENTITY: 422,
        TOO_MANY_REQUESTS: 429,
        INTERNAL_SERVER_ERROR: 500,
        SERVICE_UNAVAILABLE: 503
    },

    // 錯誤代碼
    ERROR_CODES: {
        // 認證錯誤
        INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
        TOKEN_EXPIRED: 'TOKEN_EXPIRED',
        TOKEN_INVALID: 'TOKEN_INVALID',
        ACCESS_DENIED: 'ACCESS_DENIED',

        // 用戶錯誤
        USER_NOT_FOUND: 'USER_NOT_FOUND',
        USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
        USER_BLOCKED: 'USER_BLOCKED',

        // 房間錯誤
        ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
        ROOM_FULL: 'ROOM_FULL',
        ROOM_PRIVATE: 'ROOM_PRIVATE',
        NOT_ROOM_MEMBER: 'NOT_ROOM_MEMBER',

        // 訊息錯誤
        MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
        MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
        INVALID_MESSAGE_TYPE: 'INVALID_MESSAGE_TYPE',

        // 文件錯誤
        FILE_TOO_LARGE: 'FILE_TOO_LARGE',
        INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
        UPLOAD_FAILED: 'UPLOAD_FAILED',

        // 系統錯誤
        DATABASE_ERROR: 'DATABASE_ERROR',
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
        INTERNAL_ERROR: 'INTERNAL_ERROR'
    },

    // 系統角色
    SYSTEM: {
        BOT_USER_ID: 'system-bot',
        ADMIN_USER_ID: 'system-admin',
        ANNOUNCEMENT_ROOM_ID: 'announcements'
    },

    // 日誌級別
    LOG_LEVELS: {
        ERROR: 'error',
        WARN: 'warn',
        INFO: 'info',
        HTTP: 'http',
        DEBUG: 'debug'
    },

    // 默認設置
    DEFAULTS: {
        THEME: 'light',
        LANGUAGE: 'zh-TW',
        TIMEZONE: 'Asia/Taipei',
        NOTIFICATION_SOUND: true,
        DESKTOP_NOTIFICATIONS: true,
        EMAIL_NOTIFICATIONS: false,
        PRIVACY_MODE: false,
        MAX_MESSAGE_LENGTH: 4000,
        MESSAGE_HISTORY_LIMIT: 50
    }
};