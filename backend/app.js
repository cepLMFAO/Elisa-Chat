const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const { config, env, isProduction } = require('./config/environment');
const database = require('./config/database');
const logger = require('./utils/logger');
const AuthMiddleware = require('./middleware/auth');
const RateLimitMiddleware = require('./middleware/rateLimit');

// 路由導入
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const roomRoutes = require('./routes/rooms');
const messageRoutes = require('./routes/messages');
const fileRoutes = require('./routes/files');

// WebSocket 處理程序導入
const SocketHandler = require('./websocket/socketHandler');

class App {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: config.security.corsOrigin || "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            connectionStateRecovery: {
                maxDisconnectionDuration: 2 * 60 * 1000,
                skipMiddlewares: true,
            }
        });

        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        // 安全中間件
        if (config.security.helmetEnabled) {
            this.app.use(helmet({
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        scriptSrc: ["'self'"],
                        imgSrc: ["'self'", "data:", "https:"],
                        connectSrc: ["'self'", "ws:", "wss:"]
                    }
                }
            }));
        }

        // 壓縮響應
        this.app.use(compression());

        // CORS 配置
        this.app.use(cors({
            origin: config.security.corsOrigin || true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        // 請求解析
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use(cookieParser());

        // 靜態文件服務
        this.app.use('/uploads', express.static(config.uploads.path, {
            maxAge: '1d',
            etag: true
        }));

        // 請求日誌
        if (env !== 'test') {
            this.app.use(morgan('combined', {
                stream: {
                    write: (message) => logger.http(message.trim())
                }
            }));
        }

        // 全局速率限制
        if (config.security.rateLimitEnabled) {
            this.app.use(RateLimitMiddleware.generalLimiter);
        }

        // 會話清理
        this.app.use(AuthMiddleware.sessionCleanup);

        // 健康檢查
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0'
            });
        });

        // API 信息
        this.app.get('/api', (req, res) => {
            res.json({
                name: 'Elite Chat API',
                version: '1.0.0',
                environment: env,
                documentation: '/api/docs'
            });
        });
    }

    setupRoutes() {
        // API 路由
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/users', userRoutes);
        this.app.use('/api/rooms', roomRoutes);
        this.app.use('/api/messages', messageRoutes);
        this.app.use('/api/files', fileRoutes);

        // 404 處理
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Route not found',
                code: 'ROUTE_NOT_FOUND'
            });
        });
    }

    setupWebSocket() {
        // WebSocket 認證
        this.io.use(AuthMiddleware.authenticateWebSocket);

        // WebSocket 處理
        const socketHandler = new SocketHandler(this.io);
        socketHandler.handleConnection();

        logger.info('WebSocket server configured');
    }

    setupErrorHandling() {
        // 全局錯誤處理
        this.app.use((error, req, res, next) => {
            logger.errorWithStack(error, {
                url: req.url,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                userId: req.user?.userId
            });

            // 不在生產環境中洩露錯誤詳情
            const message = isProduction ? 'Internal server error' : error.message;
            const stack = isProduction ? undefined : error.stack;

            res.status(error.status || 500).json({
                success: false,
                error: message,
                code: error.code || 'INTERNAL_ERROR',
                ...(stack && { stack })
            });
        });

        // 未捕獲異常處理
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection:', { reason, promise });
        });

        // 優雅關閉
        const gracefulShutdown = (signal) => {
            logger.info(`Received ${signal}. Starting graceful shutdown...`);

            this.server.close(() => {
                logger.info('HTTP server closed');

                database.close().then(() => {
                    logger.info('Database connection closed');
                    process.exit(0);
                }).catch((error) => {
                    logger.error('Error closing database:', { error: error.message });
                    process.exit(1);
                });
            });

            // 強制退出如果優雅關閉失敗
            setTimeout(() => {
                logger.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }

    async start() {
        try {
            // 等待數據庫初始化
            await this.waitForDatabase();

            // 啟動服務器
            this.server.listen(config.server.port, config.server.host, () => {
                logger.info(`Elite Chat server started`, {
                    port: config.server.port,
                    host: config.server.host,
                    environment: env,
                    nodeVersion: process.version,
                    pid: process.pid
                });

                if (env === 'development') {
                    console.log(`
🚀 Elite Chat Server Running!
📍 Server: http://${config.server.host}:${config.server.port}
🏥 Health: http://${config.server.host}:${config.server.port}/health
📚 API: http://${config.server.host}:${config.server.port}/api
🌍 Environment: ${env}
                    `);
                }
            });

            // 定期清理任務
            this.setupPeriodicTasks();

        } catch (error) {
            logger.error('Failed to start server:', { error: error.message });
            process.exit(1);
        }
    }

    async waitForDatabase() {
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
            try {
                await database.get('SELECT 1');
                logger.info('Database connection verified');
                return;
            } catch (error) {
                attempts++;
                logger.warn(`Database connection attempt ${attempts}/${maxAttempts} failed:`, {
                    error: error.message
                });

                if (attempts >= maxAttempts) {
                    throw new Error('Failed to connect to database after maximum attempts');
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    setupPeriodicTasks() {
        // 清理過期會話（每小時）
        setInterval(async () => {
            try {
                const AuthService = require('./services/authService');
                await AuthService.cleanupExpiredSessions();
            } catch (error) {
                logger.error('Session cleanup failed:', { error: error.message });
            }
        }, 60 * 60 * 1000);

        // 數據庫備份（每日，僅生產環境）
        if (isProduction && config.database.backupEnabled) {
            setInterval(async () => {
                try {
                    const backupPath = `${config.database.backupPath}/chat_backup_${Date.now()}.db`;
                    await database.backup(backupPath);
                    logger.info('Database backup completed:', { backupPath });
                } catch (error) {
                    logger.error('Database backup failed:', { error: error.message });
                }
            }, config.database.backupInterval || 24 * 60 * 60 * 1000);
        }

        // 日誌清理（每週）
        setInterval(() => {
            logger.cleanup(30); // 保留30天
        }, 7 * 24 * 60 * 60 * 1000);
    }

    getServer() {
        return this.server;
    }

    getApp() {
        return this.app;
    }

    getIO() {
        return this.io;
    }
}

module.exports = App;