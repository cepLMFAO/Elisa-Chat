
export const APP_CONFIG = {
    name: 'Elite Chat',
    version: '1.0.0',
    description: '世界上最屌的聊天應用',
    author: 'Amai',

    // API 配置
    api: {
        baseURL: '/api/v1',
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
    },

    // WebSocket 配置
    websocket: {
        url: null, // 會自動檢測
        autoReconnect: true,
        reconnectInterval: 3000,
        maxReconnectAttempts: 10,
        heartbeatInterval: 30000
    },

    // 儲存配置
    storage: {
        prefix: 'elite_chat_',
        defaultType: 'localStorage',
        enableEncryption: false,
        enableCompression: false
    }
};

// 使用者狀態
export const USER_STATUS = {
    ONLINE: 'online',
    AWAY: 'away',
    BUSY: 'busy',
    INVISIBLE: 'invisible',
    OFFLINE: 'offline'
};

export const USER_STATUS_LABELS = {
    [USER_STATUS.ONLINE]: '線上',
    [USER_STATUS.AWAY]: '離開',
    [USER_STATUS.BUSY]: '忙碌',
    [USER_STATUS.INVISIBLE]: '隱身',
    [USER_STATUS.OFFLINE]: '離線'
};

export const USER_STATUS_COLORS = {
    [USER_STATUS.ONLINE]: '#10b981',
    [USER_STATUS.AWAY]: '#f59e0b',
    [USER_STATUS.BUSY]: '#ef4444',
    [USER_STATUS.INVISIBLE]: '#6b7280',
    [USER_STATUS.OFFLINE]: '#9ca3af'
};

// 訊息類型
export const MESSAGE_TYPE = {
    TEXT: 'text',
    IMAGE: 'image',
    FILE: 'file',
    VOICE: 'voice',
    VIDEO: 'video',
    LOCATION: 'location',
    SYSTEM: 'system',
    NOTIFICATION: 'notification'
};

export const MESSAGE_TYPE_LABELS = {
    [MESSAGE_TYPE.TEXT]: '文字訊息',
    [MESSAGE_TYPE.IMAGE]: '圖片',
    [MESSAGE_TYPE.FILE]: '檔案',
    [MESSAGE_TYPE.VOICE]: '語音訊息',
    [MESSAGE_TYPE.VIDEO]: '影片',
    [MESSAGE_TYPE.LOCATION]: '位置',
    [MESSAGE_TYPE.SYSTEM]: '系統訊息',
    [MESSAGE_TYPE.NOTIFICATION]: '通知'
};

// 訊息狀態
export const MESSAGE_STATUS = {
    SENDING: 'sending',
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read',
    FAILED: 'failed'
};

export const MESSAGE_STATUS_LABELS = {
    [MESSAGE_STATUS.SENDING]: '發送中',
    [MESSAGE_STATUS.SENT]: '已發送',
    [MESSAGE_STATUS.DELIVERED]: '已送達',
    [MESSAGE_STATUS.READ]: '已讀',
    [MESSAGE_STATUS.FAILED]: '發送失敗'
};

// 聊天類型
export const CHAT_TYPE = {
    DIRECT: 'direct',
    GROUP: 'group',
    CHANNEL: 'channel',
    BROADCAST: 'broadcast'
};

export const CHAT_TYPE_LABELS = {
    [CHAT_TYPE.DIRECT]: '私人聊天',
    [CHAT_TYPE.GROUP]: '群組聊天',
    [CHAT_TYPE.CHANNEL]: '頻道',
    [CHAT_TYPE.BROADCAST]: '廣播'
};

// 通知類型
export const NOTIFICATION_TYPE = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
    LOADING: 'loading'
};

// 事件類型
export const EVENT_TYPE = {
    // 認證事件
    AUTH_LOGIN: 'auth:login',
    AUTH_LOGOUT: 'auth:logout',
    AUTH_TOKEN_EXPIRED: 'auth:tokenExpired',
    AUTH_UNAUTHORIZED: 'auth:unauthorized',
    AUTH_PROFILE_UPDATED: 'auth:profileUpdated',

    // 連接事件
    WS_CONNECTED: 'ws:connected',
    WS_DISCONNECTED: 'ws:disconnected',
    WS_ERROR: 'ws:error',
    WS_RECONNECTING: 'ws:reconnecting',

    // 訊息事件
    MESSAGE_RECEIVED: 'message:received',
    MESSAGE_SENT: 'message:sent',
    MESSAGE_READ: 'message:read',
    MESSAGE_TYPING: 'message:typing',

    // 聊天事件
    CHAT_OPENED: 'chat:opened',
    CHAT_CLOSED: 'chat:closed',
    CHAT_UPDATED: 'chat:updated',

    // 使用者事件
    USER_STATUS_CHANGED: 'user:statusChanged',
    USER_JOINED: 'user:joined',
    USER_LEFT: 'user:left'
};

// 主題
export const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
    SEPIA: 'sepia',
    OCEAN: 'ocean',
    FOREST: 'forest',
    SUNSET: 'sunset',
    PURPLE: 'purple',
    HIGH_CONTRAST: 'high-contrast',
    AUTO: 'auto'
};

export const THEME_LABELS = {
    [THEMES.LIGHT]: '明亮',
    [THEMES.DARK]: '深色',
    [THEMES.SEPIA]: '懷舊',
    [THEMES.OCEAN]: '海洋',
    [THEMES.FOREST]: '森林',
    [THEMES.SUNSET]: '日落',
    [THEMES.PURPLE]: '紫色',
    [THEMES.HIGH_CONTRAST]: '高對比',
    [THEMES.AUTO]: '跟隨系統'
};

// 檔案類型和大小限制
export const FILE_CONSTRAINTS = {
    // 圖片
    IMAGE: {
        maxSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    },

    // 影片
    VIDEO: {
        maxSize: 100 * 1024 * 1024, // 100MB
        allowedTypes: ['video/mp4', 'video/webm', 'video/ogg'],
        extensions: ['.mp4', '.webm', '.ogg', '.avi', '.mov']
    },

    // 音頻
    AUDIO: {
        maxSize: 50 * 1024 * 1024, // 50MB
        allowedTypes: ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'],
        extensions: ['.mp3', '.wav', '.ogg', '.webm', '.aac']
    },

    // 文件
    DOCUMENT: {
        maxSize: 50 * 1024 * 1024, // 50MB
        allowedTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/csv'
        ],
        extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv']
    },

    // 壓縮檔
    ARCHIVE: {
        maxSize: 100 * 1024 * 1024, // 100MB
        allowedTypes: [
            'application/zip',
            'application/x-rar-compressed',
            'application/x-7z-compressed',
            'application/x-tar',
            'application/gzip'
        ],
        extensions: ['.zip', '.rar', '.7z', '.tar', '.gz']
    }
};

// 語音錄音設定
export const VOICE_RECORDING = {
    maxDuration: 5 * 60 * 1000, // 5分鐘
    minDuration: 1000, // 1秒
    sampleRate: 44100,
    bitRate: 128,
    format: 'webm'
};

// 錯誤代碼
export const ERROR_CODES = {
    // 網路錯誤
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
    CONNECTION_ERROR: 'CONNECTION_ERROR',

    // 認證錯誤
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    AUTH_INVALID: 'AUTH_INVALID',
    AUTH_EXPIRED: 'AUTH_EXPIRED',
    TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',

    // 權限錯誤
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    ACCESS_FORBIDDEN: 'FORBIDDEN',

    // 資料錯誤
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    DATA_NOT_FOUND: 'NOT_FOUND',
    DATA_CONFLICT: 'CONFLICT',

    // 檔案錯誤
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
    UPLOAD_FAILED: 'UPLOAD_FAILED',

    // 系統錯誤
    SERVER_ERROR: 'SERVER_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    MAINTENANCE_MODE: 'MAINTENANCE_MODE'
};

// 鍵盤快捷鍵
export const KEYBOARD_SHORTCUTS = {
    // 全域快捷鍵
    SEARCH: { key: 'k', ctrl: true, description: '搜尋' },
    NEW_CHAT: { key: 'n', ctrl: true, description: '新建聊天' },
    TOGGLE_THEME: { key: '/', ctrl: true, description: '切換主題' },
    SETTINGS: { key: ',', ctrl: true, description: '設定' },

    // 聊天快捷鍵
    SEND_MESSAGE: { key: 'Enter', description: '發送訊息' },
    NEW_LINE: { key: 'Enter', shift: true, description: '新行' },
    EMOJI_PICKER: { key: 'e', ctrl: true, description: '表情符號' },
    ATTACH_FILE: { key: 'u', ctrl: true, description: '附加檔案' },
    VOICE_MESSAGE: { key: 'r', ctrl: true, description: '語音訊息' },

    // 導航快捷鍵
    NEXT_CHAT: { key: 'j', ctrl: true, description: '下一個聊天' },
    PREV_CHAT: { key: 'k', ctrl: true, description: '上一個聊天' },
    CLOSE_CHAT: { key: 'w', ctrl: true, description: '關閉聊天' },

    // 其他
    ESCAPE: { key: 'Escape', description: '取消/關閉' },
    HELP: { key: '?', ctrl: true, description: '說明' }
};

// URL 路徑
export const ROUTES = {
    HOME: '/',
    LOGIN: '/login',
    REGISTER: '/register',
    CHAT: '/chat',
    SETTINGS: '/settings',
    PROFILE: '/profile',
    HELP: '/help',
    ABOUT: '/about'
};

// 本地存儲鍵名
export const STORAGE_KEYS = {
    AUTH_TOKEN: 'auth_token',
    REFRESH_TOKEN: 'refresh_token',
    CURRENT_USER: 'current_user',
    THEME: 'theme',
    LANGUAGE: 'language',
    SETTINGS: 'settings',
    CHAT_HISTORY: 'chat_history',
    RECENT_EMOJIS: 'recent_emojis',
    WINDOW_STATE: 'window_state'
};

// 正規表達式
export const REGEX_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    USERNAME: /^[a-zA-Z0-9_-]{3,30}$/,
    PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    PHONE: /^[\+]?[1-9][\d]{0,15}$/,
    URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    MENTION: /@(\w+)/g,
    HASHTAG: /#(\w+)/g,
    EMOJI: /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g
};

// 時間格式
export const TIME_FORMATS = {
    FULL: 'YYYY-MM-DD HH:mm:ss',
    DATE: 'YYYY-MM-DD',
    TIME: 'HH:mm:ss',
    SHORT_TIME: 'HH:mm',
    RELATIVE: 'relative', // 相對時間，如 "5分鐘前"
    CHAT: 'chat' // 聊天專用格式
};

// 動畫持續時間
export const ANIMATION_DURATION = {
    FAST: 150,
    NORMAL: 250,
    SLOW: 350,
    LOADING: 1000
};

// 分頁設定
export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    MESSAGE_PAGE_SIZE: 50,
    CONTACT_PAGE_SIZE: 30
};

// 應用程式狀態
export const APP_STATE = {
    INITIALIZING: 'initializing',
    READY: 'ready',
    LOADING: 'loading',
    ERROR: 'error',
    OFFLINE: 'offline'
};

// 瀏覽器支援檢測
export const BROWSER_FEATURES = {
    WEBSOCKET: 'WebSocket' in window,
    INDEXEDDB: 'indexedDB' in window,
    GEOLOCATION: 'geolocation' in navigator,
    NOTIFICATIONS: 'Notification' in window,
    SERVICE_WORKER: 'serviceWorker' in navigator,
    MEDIA_RECORDER: 'MediaRecorder' in window,
    WEB_RTC: 'RTCPeerConnection' in window,
    FULL_SCREEN: 'requestFullscreen' in document.documentElement,
    FILE_API: 'File' in window && 'FileReader' in window,
    DRAG_DROP: 'draggable' in document.createElement('div')
};

// 預設設定
export const DEFAULT_SETTINGS = {
    theme: THEMES.LIGHT,
    language: 'zh-TW',
    notifications: {
        desktop: true,
        sound: true,
        vibration: false
    },
    privacy: {
        readReceipts: true,
        lastSeen: true,
        profilePhoto: 'everyone'
    },
    chat: {
        enterToSend: true,
        fontSize: 'medium',
        messagePreview: true,
        emojiSuggestions: true
    },
    media: {
        autoDownload: 'wifi',
        videoQuality: 'auto',
        voiceMessageAutoPlay: false
    }
};

// 如果在 CommonJS 環境中
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        APP_CONFIG,
        USER_STATUS,
        USER_STATUS_LABELS,
        USER_STATUS_COLORS,
        MESSAGE_TYPE,
        MESSAGE_TYPE_LABELS,
        MESSAGE_STATUS,
        MESSAGE_STATUS_LABELS,
        CHAT_TYPE,
        CHAT_TYPE_LABELS,
        NOTIFICATION_TYPE,
        EVENT_TYPE,
        THEMES,
        THEME_LABELS,
        FILE_CONSTRAINTS,
        VOICE_RECORDING,
        ERROR_CODES,
        KEYBOARD_SHORTCUTS,
        ROUTES,
        STORAGE_KEYS,
        REGEX_PATTERNS,
        TIME_FORMATS,
        ANIMATION_DURATION,
        PAGINATION,
        APP_STATE,
        BROWSER_FEATURES,
        DEFAULT_SETTINGS
    };
} else {
    // 瀏覽器環境，添加到全域物件
    Object.assign(window, {
        APP_CONFIG,
        USER_STATUS,
        USER_STATUS_LABELS,
        USER_STATUS_COLORS,
        MESSAGE_TYPE,
        MESSAGE_TYPE_LABELS,
        MESSAGE_STATUS,
        MESSAGE_STATUS_LABELS,
        CHAT_TYPE,
        CHAT_TYPE_LABELS,
        NOTIFICATION_TYPE,
        EVENT_TYPE,
        THEMES,
        THEME_LABELS,
        FILE_CONSTRAINTS,
        VOICE_RECORDING,
        ERROR_CODES,
        KEYBOARD_SHORTCUTS,
        ROUTES,
        STORAGE_KEYS,
        REGEX_PATTERNS,
        TIME_FORMATS,
        ANIMATION_DURATION,
        PAGINATION,
        APP_STATE,
        BROWSER_FEATURES,
        DEFAULT_SETTINGS
    });
}