const path = require('path');
require('dotenv').config();

const environment = {
    development: {
        server: {
            port: process.env.PORT || 8080,
            host: process.env.HOST || 'localhost'
        },
        database: {
            path: path.join(__dirname, '../database/chat_dev.db'),
            logging: true,
            backupEnabled: false
        },
        jwt: {
            secret: process.env.JWT_SECRET || 'dev-secret-key-change-me',
            expiresIn: '24h'
        },
        security: {
            rateLimitEnabled: false,
            corsOrigin: '*',
            helmetEnabled: false
        },
        logging: {
            level: 'debug',
            file: false,
            console: true
        },
        email: {
            enabled: false,
            provider: 'console' // 開發環境使用控制台輸出
        },
        uploads: {
            path: path.join(__dirname, '../uploads/dev/'),
            maxSize: 10 * 1024 * 1024 // 10MB
        }
    },

    production: {
        server: {
            port: process.env.PORT || 8080,
            host: process.env.HOST || '0.0.0.0'
        },
        database: {
            path: process.env.DB_PATH || path.join(__dirname, '../database/chat.db'),
            logging: false,
            backupEnabled: true,
            backupInterval: 24 * 60 * 60 * 1000 // 24小時
        },
        jwt: {
            secret: process.env.JWT_SECRET,
            expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        },
        security: {
            rateLimitEnabled: true,
            corsOrigin: process.env.CORS_ORIGIN || false,
            helmetEnabled: true,
            httpsOnly: true
        },
        logging: {
            level: 'info',
            file: true,
            console: false,
            path: path.join(__dirname, '../logs/')
        },
        email: {
            enabled: true,
            provider: 'smtp',
            smtp: {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            }
        },
        uploads: {
            path: process.env.UPLOAD_PATH || path.join(__dirname, '../uploads/'),
            maxSize: parseInt(process.env.MAX_UPLOAD_SIZE) || 10 * 1024 * 1024,
            cloudStorage: {
                enabled: process.env.CLOUD_STORAGE_ENABLED === 'true',
                provider: process.env.CLOUD_PROVIDER, // 'aws', 'gcp', 'azure'
                bucket: process.env.CLOUD_BUCKET
            }
        },
        redis: {
            enabled: process.env.REDIS_ENABLED === 'true',
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD,
            db: process.env.REDIS_DB || 0
        },
        monitoring: {
            enabled: true,
            apm: {
                serviceName: 'elite-chat-app',
                secretToken: process.env.APM_SECRET_TOKEN
            }
        }
    },

    test: {
        server: {
            port: 0, // 隨機端口
            host: 'localhost'
        },
        database: {
            path: ':memory:', // 內存數據庫
            logging: false,
            backupEnabled: false
        },
        jwt: {
            secret: 'test-secret-key',
            expiresIn: '1h'
        },
        security: {
            rateLimitEnabled: false,
            corsOrigin: '*',
            helmetEnabled: false
        },
        logging: {
            level: 'error',
            file: false,
            console: false
        },
        email: {
            enabled: false,
            provider: 'mock'
        },
        uploads: {
            path: path.join(__dirname, '../uploads/test/'),
            maxSize: 1024 * 1024 // 1MB for tests
        }
    }
};

const env = process.env.NODE_ENV || 'development';
const config = environment[env];

// 驗證必要的生產環境變量
if (env === 'production') {
    const requiredEnvVars = [
        'JWT_SECRET',
        'DB_PATH'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        console.error('Missing required environment variables:', missingVars.join(', '));
        process.exit(1);
    }
}

// 創建必要的目錄
const fs = require('fs');

const createDirectories = () => {
    const dirs = [
        config.uploads.path,
        path.join(config.uploads.path, 'images'),
        path.join(config.uploads.path, 'files'),
        path.join(config.uploads.path, 'audio'),
        path.join(config.uploads.path, 'temp'),
        path.dirname(config.database.path)
    ];

    if (config.logging.file && config.logging.path) {
        dirs.push(config.logging.path);
    }

    dirs.forEach(dir => {
        if (dir && dir !== ':memory:' && !fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`Created directory: ${dir}`);
            } catch (error) {
                console.error(`Failed to create directory ${dir}:`, error.message);
            }
        }
    });
};

// 只在非測試環境中創建目錄
if (env !== 'test') {
    createDirectories();
}

module.exports = {
    env,
    config,
    isDevelopment: env === 'development',
    isProduction: env === 'production',
    isTest: env === 'test'
};