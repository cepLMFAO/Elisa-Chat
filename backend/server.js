#!/usr/bin/env node

/**
 * Elite Chat Server
 * 高性能實時聊天應用後端服務器
 */

require('dotenv').config();

const App = require('./app');
const logger = require('./utils/logger');

// 檢查 Node.js 版本
const requiredVersion = '16.0.0';
const currentVersion = process.version;

if (process.version < `v${requiredVersion}`) {
    console.error(`❌ Node.js version ${requiredVersion} or higher is required. Current version: ${currentVersion}`);
    process.exit(1);
}

// 檢查必要的環境變量
const requiredEnvVars = ['NODE_ENV'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    process.exit(1);
}

// 創建並啟動應用
async function bootstrap() {
    try {
        logger.info('Starting Elite Chat server...', {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            environment: process.env.NODE_ENV,
            pid: process.pid
        });

        const app = new App();
        await app.start();

    } catch (error) {
        logger.error('Failed to start server:', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

// 啟動應用
if (require.main === module) {
    bootstrap();
}

module.exports = bootstrap;