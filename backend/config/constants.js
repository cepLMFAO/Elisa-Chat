module.exports = {
    // 服務器配置
    SERVER: {
        PORT: process.env.PORT || 8080,
        HOST: process.env.HOST || 'localhost',
        NODE_ENV: process.env.NODE_ENV || 'development'
    },

    // 數據庫配置
    DATABASE: {
        PATH: process.env.DB_PATH || './backend/database/chat.db',
        BACKUP_PATH: process.env.DB_BACKUP_PATH || './backend/database/backups/',
        MAX_CONNECTIONS: 10,
        BUSY_TIMEOUT: 30000
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
        UPLOAD_PATH: './backend/uploads/',
        TEMP_PATH: './backend/uploads/temp/'
    },

    // WebSocket 事件
    WS_EVENTS: {
        // 認證相關
        AUTH: 'auth',
        AUTH_SUCCESS: 'auth_success',
        AUTH_ERROR: 'auth_error',
        LOGOUT: 'logout',

        // 用戶相關
        USER_ONLINE: 'user_online',
        USER_OFFLINE: 'user_offline',
        USER_STATUS: 'user_status',
        USER_TYPING: 'user_typing',
        USER_STOP_TYPING: 'user_stop_typing',

        // 房間相關
        JOIN_ROOM: 'join_room',
        LEAVE_ROOM: 'leave_room',
        ROOM_CREATED: 'room_created',
        ROOM_DELETED: 'room_deleted',
        ROOM_UPDATED: 'room_updated',

        // 訊息相關
        MESSAGE: 'message',
        MESSAGE_SENT: 'message_sent',
        MESSAGE_EDITED: 'message_edited',
        MESSAGE_DELETED: 'message_deleted',
        MESSAGE_REACTION: 'message_reaction',
        PRIVATE_MESSAGE: 'private_message',

        // 通知相關
        NOTIFICATION: 'notification',
        NOTIFICATION_READ: 'notification_read',

        // 呼叫相關
        CALL_OFFER: 'call_offer',
        CALL_ANSWER: 'call_answer',
        CALL_CANDIDATE: 'call_candidate',
        CALL_END: 'call_end',

        // 系統相關
        SYSTEM_MESSAGE: 'system_message',
        ERROR: 'error',
        PING: 'ping',
        PONG: 'pong'
    },

    // 訊息類型
    MESSAGE_TYPES: {
        TEXT: 'text',
        IMAGE: 'image',
        FILE: 'file',
        AUDIO: 'audio',
        VIDEO: 'video',
        EMOJI: 'emoji',
        STICKER: 'sticker',
        LOCATION: 'location',
        SYSTEM: 'system'
    },

    // 用戶狀態
    USER_STATUS: {
        ONLINE: 'online',
        OFFLINE: 'offline',
        AWAY: 'away',
        BUSY: 'busy',
        INVISIBLE: 'invisible'
    },

    // 用戶角色
    USER_ROLES: {
        ADMIN: 'admin',
        MODERATOR: 'moderator',
        USER: 'user',
        GUEST: 'guest'
    },

    // 房間類型
    ROOM_TYPES: {
        PUBLIC: 'public',
        PRIVATE: 'private',
        DIRECT: 'direct',
        GROUP: 'group'
    },

    // 房間成員角色
    ROOM_ROLES: {
        OWNER: 'owner',
        ADMIN: 'admin',
        MODERATOR: 'moderator',
        MEMBER: 'member'
    },

    // 好友狀態
    FRIENDSHIP_STATUS: {
        PENDING: 'pending',
        ACCEPTED: 'accepted',
        BLOCKED: 'blocked',
        REJECTED: 'rejected'
    },

    // 通知類型
    NOTIFICATION_TYPES: {
        MESSAGE: 'message',
        MENTION: 'mention',
        FRIEND_REQUEST: 'friend_request',
        ROOM_INVITE: 'room_invite',
        SYSTEM: 'system',
        CALL: 'call'
    },

    // 郵件配置
    EMAIL: {
        FROM: process.env.EMAIL_FROM || 'noreply@elitechat.com',
        SMTP_HOST: process.env.SMTP_HOST || 'localhost',
        SMTP_PORT: process.env.SMTP_PORT || 587,
        SMTP_USER: process.env.SMTP_USER || '',
        SMTP_PASS: process.env.SMTP_PASS || ''
    },

    // 系統設置
    SYSTEM: {
        MAX_MESSAGE_LENGTH: 4000,
        MAX_ROOM_MEMBERS: 1000,
        MAX_ROOMS_PER_USER: 100,
        MESSAGE_HISTORY_LIMIT: 1000,
        CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 24小時
        SESSION_CLEANUP_INTERVAL: 60 * 60 * 1000, // 1小時
        HEARTBEAT_INTERVAL: 30 * 1000, // 30秒
        CONNECTION_TIMEOUT: 60 * 1000 // 60秒
    },

    // 安全配置
    SECURITY: {
        PASSWORD_MIN_LENGTH: 8,
        PASSWORD_MAX_LENGTH: 128,
        USERNAME_MIN_LENGTH: 3,
        USERNAME_MAX_LENGTH: 30,
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_TIME: 15 * 60 * 1000, // 15分鐘
        SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24小時
        CSRF_SECRET: process.env.CSRF_SECRET || 'elite-chat-csrf-secret'
    },

    // API 響應狀態
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
        PRIVACY_MODE: false
    }
};