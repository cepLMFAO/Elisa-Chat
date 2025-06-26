const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs').promises;

const config = require('./config/constants');
const database = require('./config/database');
const logger = require('./utils/logger');
const AuthMiddleware = require('./middleware/auth');
const RateLimitMiddleware = require('./middleware/rateLimit');
const ValidationMiddleware = require('./middleware/validation');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const roomRoutes = require('./routes/rooms');
const messageRoutes = require('./routes/messages');
const fileRoutes = require('./routes/files');

// 導入 WebSocket 處理器
const SocketHandler = require('./websocket/socketHandler');

class ChatServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: process.env.FRONTEND_URL || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });

        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupErrorHandling();
    }

    async setupDatabase() {
        try {
            await database.initialize();
            logger.info('Database initialized successfully');
        } catch (error) {
            logger.error('Database initialization failed:', error);
            process.exit(1);
        }
    }

    setupMiddleware() {
        // 安全中間件
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com"],
                    imgSrc: ["'self'", "data:", "https:"],
                    scriptSrc: ["'self'"],
                    connectSrc: ["'self'", "ws:", "wss:"]
                }
            }
        }));

        // CORS 設置
        this.app.use(cors({
            origin: process.env.FRONTEND_URL || "http://localhost:3000",
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        // 壓縮和解析
        this.app.use(compression());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // 靜態文件服務
        this.app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
        this.app.use(express.static(path.join(__dirname, '../frontend')));

        // 請求日誌
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.originalUrl}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                userId: req.user?.userId
            });
            next();
        });

        // 全局速率限制
        this.app.use('/api', RateLimitMiddleware.apiLimiter);

        // 輸入清理
        this.app.use(ValidationMiddleware.sanitizeInput);
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

        // API 路由
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/users', userRoutes);
        this.app.use('/api/rooms', roomRoutes);
        this.app.use('/api/messages', messageRoutes);
        this.app.use('/api/files', fileRoutes);

        // 前端路由（SPA 支持）
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../frontend/index.html'));
        });

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
        // WebSocket 認證中間件
        this.io.use(AuthMiddleware.authenticateWebSocket);

        // 創建 WebSocket 處理器
        const socketHandler = new SocketHandler(this.io);

        this.io.on('connection', (socket) => {
            socketHandler.handleConnection(socket);
        });

        logger.info('WebSocket server configured');
    }

    setupErrorHandling() {
        // 全局錯誤處理
        this.app.use((error, req, res, next) => {
            logger.error('Request error:', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method,
                ip: req.ip,
                userId: req.user?.userId
            });

            // 根據環境返回錯誤詳情
            const isDevelopment = process.env.NODE_ENV === 'development';

            res.status(error.status || 500).json({
                success: false,
                error: isDevelopment ? error.message : 'Internal server error',
                code: error.code || 'INTERNAL_ERROR',
                ...(isDevelopment && { stack: error.stack })
            });
        });

        // 進程錯誤處理
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            this.gracefulShutdown('SIGTERM');
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
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
        });

        // 關閉 WebSocket 連接
        this.io.close(() => {
            logger.info('WebSocket server closed');
        });

        // 關閉數據庫連接
        try {
            await database.close();
            logger.info('Database connection closed');
        } catch (error) {
            logger.error('Error closing database:', error);
        }

        process.exit(0);
    }

    async start() {
        const port = config.SERVER.PORT;
        const host = config.SERVER.HOST;

        // 確保上傳目錄存在
        await this.ensureDirectories();

        this.server.listen(port, host, () => {
            logger.info(`Chat server running on http://${host}:${port}`);
            logger.info(`Environment: ${config.SERVER.NODE_ENV}`);
        });
    }

    async ensureDirectories() {
        const directories = [
            config.UPLOAD.UPLOAD_PATH,
            config.UPLOAD.TEMP_PATH,
            config.DATABASE.BACKUP_PATH
        ];

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                logger.error(`Failed to create directory ${dir}:`, error);
            }
        }
    }
}

// WebSocket 事件處理器
class socketHandler {
    constructor(io) {
        this.io = io;
        this.onlineUsers = new Map();
        this.roomUsers = new Map();
    }

    handleConnection(socket) {
        const userId = socket.user.userId;
        const username = socket.user.username;

        logger.info(`User connected: ${username} (${userId})`);

        // 添加用戶到在線列表
        this.onlineUsers.set(userId, {
            socketId: socket.id,
            username,
            userId,
            joinedAt: new Date()
        });

        // 廣播用戶上線
        this.io.emit('user:online', {
            userId,
            username,
            timestamp: new Date()
        });

        // 處理加入房間
        socket.on('room:join', async (data) => {
            await this.handleRoomJoin(socket, data);
        });

        // 處理離開房間
        socket.on('room:leave', (data) => {
            this.handleRoomLeave(socket, data);
        });

        // 處理發送消息
        socket.on('message:send', async (data) => {
            await this.handleMessageSend(socket, data);
        });

        // 處理消息編輯
        socket.on('message:edit', async (data) => {
            await this.handleMessageEdit(socket, data);
        });

        // 處理消息刪除
        socket.on('message:delete', async (data) => {
            await this.handleMessageDelete(socket, data);
        });

        // 處理正在輸入狀態
        socket.on('typing:start', (data) => {
            this.handleTypingStart(socket, data);
        });

        socket.on('typing:stop', (data) => {
            this.handleTypingStop(socket, data);
        });

        // 處理斷開連接
        socket.on('disconnect', () => {
            this.handleDisconnect(socket);
        });
    }

    async handleRoomJoin(socket, { roomId }) {
        try {
            const userId = socket.user.userId;

            // 驗證用戶是否為房間成員
            const membership = await database.get(
                'SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, userId]
            );

            if (!membership) {
                socket.emit('error', {
                    code: 'ACCESS_DENIED',
                    message: 'Not a member of this room'
                });
                return;
            }

            // 加入 Socket.IO 房間
            socket.join(roomId);

            // 記錄房間用戶
            if (!this.roomUsers.has(roomId)) {
                this.roomUsers.set(roomId, new Set());
            }
            this.roomUsers.get(roomId).add(userId);

            // 通知房間其他用戶
            socket.to(roomId).emit('room:user_joined', {
                userId,
                username: socket.user.username,
                timestamp: new Date()
            });

            // 獲取房間最近消息
            const messages = await database.all(`
                SELECT m.*, u.username, u.avatar
                FROM messages m
                LEFT JOIN users u ON m.user_uuid = u.uuid
                WHERE m.room_uuid = ?
                ORDER BY m.created_at DESC
                LIMIT 50
            `, [roomId]);

            socket.emit('room:joined', {
                roomId,
                messages: messages.reverse(),
                onlineUsers: Array.from(this.roomUsers.get(roomId) || [])
            });

        } catch (error) {
            logger.error('Room join error:', error);
            socket.emit('error', {
                code: 'ROOM_JOIN_FAILED',
                message: 'Failed to join room'
            });
        }
    }

    handleRoomLeave(socket, { roomId }) {
        const userId = socket.user.userId;

        socket.leave(roomId);

        // 從房間用戶列表移除
        if (this.roomUsers.has(roomId)) {
            this.roomUsers.get(roomId).delete(userId);
            if (this.roomUsers.get(roomId).size === 0) {
                this.roomUsers.delete(roomId);
            }
        }

        // 通知房間其他用戶
        socket.to(roomId).emit('room:user_left', {
            userId,
            username: socket.user.username,
            timestamp: new Date()
        });
    }

    async handleMessageSend(socket, data) {
        try {
            const { roomId, content, type = 'text', replyTo } = data;
            const userId = socket.user.userId;

            // 創建消息
            const messageId = require('crypto').randomUUID();
            await database.run(`
                INSERT INTO messages (uuid, room_uuid, user_uuid, content, type, reply_to, created_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `, [messageId, roomId, userId, content, type, replyTo]);

            // 獲取完整消息信息
            const message = await database.get(`
                SELECT m.*, u.username, u.avatar,
                       rm.content as reply_content, ru.username as reply_username
                FROM messages m
                LEFT JOIN users u ON m.user_uuid = u.uuid
                LEFT JOIN messages rm ON m.reply_to = rm.uuid
                LEFT JOIN users ru ON rm.user_uuid = ru.uuid
                WHERE m.uuid = ?
            `, [messageId]);

            // 廣播消息到房間
            this.io.to(roomId).emit('message:new', message);

        } catch (error) {
            logger.error('Message send error:', error);
            socket.emit('error', {
                code: 'MESSAGE_SEND_FAILED',
                message: 'Failed to send message'
            });
        }
    }

    async handleMessageEdit(socket, { messageId, content }) {
        try {
            const userId = socket.user.userId;

            // 驗證消息所有權
            const message = await database.get(
                'SELECT * FROM messages WHERE uuid = ? AND user_uuid = ?',
                [messageId, userId]
            );

            if (!message) {
                socket.emit('error', {
                    code: 'ACCESS_DENIED',
                    message: 'Cannot edit this message'
                });
                return;
            }

            // 更新消息
            await database.run(`
                UPDATE messages 
                SET content = ?, edited_at = datetime('now')
                WHERE uuid = ?
            `, [content, messageId]);

            // 廣播編輯事件
            this.io.to(message.room_uuid).emit('message:edited', {
                messageId,
                content,
                editedAt: new Date()
            });

        } catch (error) {
            logger.error('Message edit error:', error);
            socket.emit('error', {
                code: 'MESSAGE_EDIT_FAILED',
                message: 'Failed to edit message'
            });
        }
    }

    async handleMessageDelete(socket, { messageId }) {
        try {
            const userId = socket.user.userId;

            // 驗證消息所有權或管理員權限
            const message = await database.get(`
                SELECT m.*, rm.role
                FROM messages m
                LEFT JOIN room_members rm ON m.room_uuid = rm.room_uuid AND rm.user_uuid = ?
                WHERE m.uuid = ? AND (m.user_uuid = ? OR rm.role IN ('owner', 'admin'))
            `, [userId, messageId, userId]);

            if (!message) {
                socket.emit('error', {
                    code: 'ACCESS_DENIED',
                    message: 'Cannot delete this message'
                });
                return;
            }

            // 軟刪除消息
            await database.run(`
                UPDATE messages 
                SET deleted_at = datetime('now')
                WHERE uuid = ?
            `, [messageId]);

            // 廣播刪除事件
            this.io.to(message.room_uuid).emit('message:deleted', {
                messageId,
                deletedAt: new Date()
            });

        } catch (error) {
            logger.error('Message delete error:', error);
            socket.emit('error', {
                code: 'MESSAGE_DELETE_FAILED',
                message: 'Failed to delete message'
            });
        }
    }

    handleTypingStart(socket, { roomId }) {
        socket.to(roomId).emit('typing:start', {
            userId: socket.user.userId,
            username: socket.user.username
        });
    }

    handleTypingStop(socket, { roomId }) {
        socket.to(roomId).emit('typing:stop', {
            userId: socket.user.userId
        });
    }

    handleDisconnect(socket) {
        const userId = socket.user.userId;
        const username = socket.user.username;

        logger.info(`User disconnected: ${username} (${userId})`);

        // 從在線用戶列表移除
        this.onlineUsers.delete(userId);

        // 從所有房間移除
        for (const [roomId, users] of this.roomUsers.entries()) {
            if (users.has(userId)) {
                users.delete(userId);
                socket.to(roomId).emit('room:user_left', {
                    userId,
                    username,
                    timestamp: new Date()
                });
            }
        }

        // 廣播用戶下線
        this.io.emit('user:offline', {
            userId,
            username,
            timestamp: new Date()
        });
    }
}

// 啟動服務器
if (require.main === module) {
    const server = new ChatServer();
    server.start().catch(error => {
        logger.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = ChatServer;