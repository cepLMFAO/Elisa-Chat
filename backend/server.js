const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

// 導入基本配置
const logger = require('./utils/logger');

// 導入路由
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');

// 導入中間件
const RateLimitMiddleware = require('./middleware/rateLimit');

class ChatServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);

        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    async setupDatabase() {
        try {
            // 這裡應該初始化數據庫，現在先跳過
            logger.info('Database initialized successfully');
        } catch (error) {
            logger.error('Database initialization failed:', error);
            process.exit(1);
        }
    }

    setupMiddleware() {
        // CORS 設置
        this.app.use(cors({
            origin: process.env.FRONTEND_URL || "http://localhost:3000",
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        // 基本解析中間件
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // 靜態文件服務
        this.app.use(express.static(path.join(__dirname, '../frontend')));

        // 請求日誌
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.originalUrl}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            next();
        });

        // 全局速率限制 - 檢查中間件是否存在
        if (RateLimitMiddleware && RateLimitMiddleware.generalLimiter) {
            this.app.use('/api', RateLimitMiddleware.generalLimiter);
        }
    }

    setupRoutes() {
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
                environment: process.env.NODE_ENV || 'development',
                documentation: '/api/docs'
            });
        });

        // API 路由 - 檢查路由是否存在
        if (authRoutes) {
            this.app.use('/api/auth', authRoutes);
        } else {
            logger.warn('Auth routes not found');
        }

        if (roomRoutes) {
            this.app.use('/api/rooms', roomRoutes);
        } else {
            logger.warn('Room routes not found');
        }

        // 添加其他路由的佔位符
        this.app.use('/api/users', (req, res) => {
            res.json({ message: 'Users API not implemented yet' });
        });

        this.app.use('/api/messages', (req, res) => {
            res.json({ message: 'Messages API not implemented yet' });
        });

        this.app.use('/api/files', (req, res) => {
            res.json({ message: 'Files API not implemented yet' });
        });

        // 前端路由（SPA 支持）
        this.app.get('*', (req, res) => {
            const indexPath = path.join(__dirname, '../frontend/index.html');
            res.sendFile(indexPath);
        });
    }

    setupErrorHandling() {
        // 全局錯誤處理
        this.app.use((error, req, res, next) => {
            logger.error('Request error:', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method,
                ip: req.ip
            });

            const isDevelopment = process.env.NODE_ENV === 'development';

            res.status(error.status || 500).json({
                success: false,
                error: isDevelopment ? error.message : 'Internal server error',
                code: error.code || 'INTERNAL_ERROR',
                ...(isDevelopment && { stack: error.stack })
            });
        });

        // 404 處理
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Route not found',
                code: 'ROUTE_NOT_FOUND'
            });
        });

        // 進程錯誤處理
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });

        // 優雅關閉處理
        ['SIGTERM', 'SIGINT'].forEach(signal => {
            process.on(signal, () => this.gracefulShutdown(signal));
        });
    }

    async gracefulShutdown(signal) {
        logger.info(`Received ${signal}, starting graceful shutdown`);

        // 關閉服務器
        this.server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });

        // 設置強制退出的超時時間
        setTimeout(() => {
            logger.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    }

    start() {
        const port = process.env.PORT || 3001;
        const host = process.env.HOST || 'localhost';

        this.server.listen(port, host, () => {
            logger.info(`Chat server running on http://${host}:${port}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });

        // 處理服務器錯誤
        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${port} is already in use`);
                process.exit(1);
            } else {
                logger.error('Server error:', error);
                process.exit(1);
            }
        });
    }
}

// 創建並啟動服務器
const server = new ChatServer();
server.start();