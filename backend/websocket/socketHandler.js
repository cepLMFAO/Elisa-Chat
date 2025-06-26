const logger = require('../utils/logger');
const ChatHandler = require('./chatHandler');
const RoomHandler = require('./roomHandler');
const UserHandler = require('./userHandler');
const { WS_EVENTS, SYSTEM } = require('../config/constants');

class SocketHandler {
    constructor(io) {
        this.io = io;
        this.connectedUsers = new Map(); // userId -> Set of socketIds
        this.userSockets = new Map(); // socketId -> userId
        this.roomUsers = new Map(); // roomId -> Set of userIds

        // 初始化處理器
        this.chatHandler = new ChatHandler(io, this);
        this.roomHandler = new RoomHandler(io, this);
        this.userHandler = new UserHandler(io, this);

        // 心跳檢測
        this.setupHeartbeat();
    }

    handleConnection() {
        this.io.on('connection', (socket) => {
            this.onConnection(socket);
        });
    }

    onConnection(socket) {
        const userId = socket.userId;
        const user = socket.user;

        logger.websocket('User connected', userId, {
            socketId: socket.id,
            ip: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
        });

        // 記錄連接
        this.addUserConnection(userId, socket.id);

        // 加入用戶專用房間
        socket.join(`user:${userId}`);

        // 發送連接成功事件
        socket.emit(WS_EVENTS.AUTH_SUCCESS, {
            user: user,
            timestamp: new Date().toISOString()
        });

        // 廣播用戶上線狀態
        this.broadcastUserStatus(userId, 'online');

        // 設置事件監聽器
        this.setupEventListeners(socket);

        // 處理斷開連接
        socket.on('disconnect', (reason) => {
            this.onDisconnection(socket, reason);
        });

        // 錯誤處理
        socket.on('error', (error) => {
            logger.error('Socket error', {
                error: error.message,
                socketId: socket.id,
                userId
            });
        });
    }

    setupEventListeners(socket) {
        const userId = socket.userId;

        // 認證相關事件
        socket.on(WS_EVENTS.LOGOUT, () => {
            this.handleLogout(socket);
        });

        // 用戶狀態事件
        socket.on(WS_EVENTS.USER_STATUS, (data) => {
            this.userHandler.handleStatusChange(socket, data);
        });

        socket.on(WS_EVENTS.USER_TYPING, (data) => {
            this.userHandler.handleTyping(socket, data);
        });

        socket.on(WS_EVENTS.USER_STOP_TYPING, (data) => {
            this.userHandler.handleStopTyping(socket, data);
        });

        // 房間相關事件
        socket.on(WS_EVENTS.JOIN_ROOM, (data) => {
            this.roomHandler.handleJoinRoom(socket, data);
        });

        socket.on(WS_EVENTS.LEAVE_ROOM, (data) => {
            this.roomHandler.handleLeaveRoom(socket, data);
        });

        // 消息相關事件
        socket.on(WS_EVENTS.MESSAGE, (data) => {
            this.chatHandler.handleMessage(socket, data);
        });

        socket.on(WS_EVENTS.PRIVATE_MESSAGE, (data) => {
            this.chatHandler.handlePrivateMessage(socket, data);
        });

        socket.on(WS_EVENTS.MESSAGE_REACTION, (data) => {
            this.chatHandler.handleMessageReaction(socket, data);
        });

        // 通話相關事件
        socket.on(WS_EVENTS.CALL_OFFER, (data) => {
            this.handleCallOffer(socket, data);
        });

        socket.on(WS_EVENTS.CALL_ANSWER, (data) => {
            this.handleCallAnswer(socket, data);
        });

        socket.on(WS_EVENTS.CALL_CANDIDATE, (data) => {
            this.handleCallCandidate(socket, data);
        });

        socket.on(WS_EVENTS.CALL_END, (data) => {
            this.handleCallEnd(socket, data);
        });

        // 心跳事件
        socket.on(WS_EVENTS.PING, () => {
            socket.emit(WS_EVENTS.PONG, { timestamp: Date.now() });
        });

        // 通知已讀事件
        socket.on(WS_EVENTS.NOTIFICATION_READ, (data) => {
            this.handleNotificationRead(socket, data);
        });
    }

    onDisconnection(socket, reason) {
        const userId = socket.userId;

        logger.websocket('User disconnected', userId, {
            socketId: socket.id,
            reason,
            ip: socket.handshake.address
        });

        // 移除連接記錄
        this.removeUserConnection(userId, socket.id);

        // 如果用戶沒有其他連接，更新狀態為離線
        if (!this.connectedUsers.has(userId) || this.connectedUsers.get(userId).size === 0) {
            this.broadcastUserStatus(userId, 'offline');
            this.updateUserLastSeen(userId);
        }

        // 離開所有房間
        this.leaveAllRooms(socket);
    }

    // 房間用戶管理
    addUserToRoom(roomId, userId) {
        if (!this.roomUsers.has(roomId)) {
            this.roomUsers.set(roomId, new Set());
        }
        this.roomUsers.get(roomId).add(userId);
    }

    removeUserFromRoom(roomId, userId) {
        if (this.roomUsers.has(roomId)) {
            this.roomUsers.get(roomId).delete(userId);
            if (this.roomUsers.get(roomId).size === 0) {
                this.roomUsers.delete(roomId);
            }
        }
    }

    getRoomUsers(roomId) {
        return this.roomUsers.get(roomId) || new Set();
    }

    // 檢查用戶是否在線
    isUserOnline(userId) {
        return this.connectedUsers.has(userId) && this.connectedUsers.get(userId).size > 0;
    }

    // 離開所有房間
    leaveAllRooms(socket) {
        const userId = socket.userId;

        // 從所有房間移除用戶
        for (const [roomId, users] of this.roomUsers.entries()) {
            if (users.has(userId)) {
                users.delete(userId);

                // 通知房間其他成員
                socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_OFFLINE, {
                    roomId,
                    user: {
                        id: userId,
                        username: socket.user?.username
                    },
                    timestamp: new Date().toISOString()
                });

                // 如果房間沒有用戶了，清理房間記錄
                if (users.size === 0) {
                    this.roomUsers.delete(roomId);
                }
            }
        }

        // 清理用戶的輸入狀態
        if (this.userHandler) {
            this.userHandler.cleanupUserTyping(userId);
        }
    }

    // 更新用戶最後在線時間
    async updateUserLastSeen(userId) {
        try {
            await database.run(
                'UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE uuid = ?',
                [userId]
            );
        } catch (error) {
            logger.error('Failed to update user last seen', {
                error: error.message,
                userId
            });
        }
    }

    // 廣播用戶狀態
    broadcastUserStatus(userId, status) {
        // 廣播到用戶所在的所有房間
        for (const [roomId, users] of this.roomUsers.entries()) {
            if (users.has(userId)) {
                this.io.to(`room:${roomId}`).emit(WS_EVENTS.USER_STATUS, {
                    userId,
                    status,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
    // 用戶連接管理
    addUserConnection(userId, socketId) {
        if (!this.connectedUsers.has(userId)) {
            this.connectedUsers.set(userId, new Set());
        }
        this.connectedUsers.get(userId).add(socketId);
        this.userSockets.set(socketId, userId);
    }

    removeUserConnection(userId, socketId) {
        if (this.connectedUsers.has(userId)) {
            this.connectedUsers.get(userId).delete(socketId);
            if (this.connectedUsers.get(userId).size === 0) {
                this.connectedUsers.delete(userId);
            }
        }
        this.userSockets.delete(socketId);
    }

    // 房間用戶管理
    addUserToRoom(roomId, userId) {
        if (!this.roomUsers.has(roomId)) {
            this.roomUsers.set(roomId, new Set());
        }
        this.roomUsers.get(roomId).add(userId);
    }

    removeUserFromRoom(roomId, userId) {
        if (this.roomUsers.has(roomId)) {
            this.roomUsers.get(roomId).delete(userId);
            if (this.roomUsers.get(roomId).size === 0) {
                this.roomUsers.delete(roomId);
            }
        }
    }

    // 廣播用戶狀態
    async broadcastUserStatus(userId, status) {
        try {
            // 更新數據庫中的用戶狀態
            const User = require('../models/User');
            const user = await User.findByUuid(userId);
            if (user) {
                await user.updateStatus(status);
            }

            // 獲取用戶的好友和房間成員
            const database = require('../config/database');

            // 獲取好友列表
            const friends = await database.query(
                `SELECT addressee_uuid as friend_id FROM friendships
                 WHERE requester_uuid = ? AND status = 'accepted'
                 UNION
                 SELECT requester_uuid as friend_id FROM friendships
                 WHERE addressee_uuid = ? AND status = 'accepted'`,
                [userId, userId]
            );

            // 獲取用戶所在的房間成員
            const roomMembers = await database.query(
                `SELECT DISTINCT rm2.user_uuid as member_id
                 FROM room_members rm1
                          JOIN room_members rm2 ON rm1.room_uuid = rm2.room_uuid
                 WHERE rm1.user_uuid = ? AND rm2.user_uuid != ?`,
                [userId, userId]
            );

            // 合併好友和房間成員列表
            const notifyUsers = new Set();
            friends.forEach(friend => notifyUsers.add(friend.friend_id));
            roomMembers.forEach(member => notifyUsers.add(member.member_id));

            // 廣播狀態更新
            const statusData = {
                userId,
                status,
                timestamp: new Date().toISOString()
            };

            notifyUsers.forEach(targetUserId => {
                this.io.to(`user:${targetUserId}`).emit(WS_EVENTS.USER_STATUS, statusData);
            });

        } catch (error) {
            logger.error('Failed to broadcast user status', {
                error: error.message,
                userId,
                status
            });
        }
    }

    // 更新用戶最後在線時間
    async updateUserLastSeen(userId) {
        try {
            const User = require('../models/User');
            const user = await User.findByUuid(userId);
            if (user) {
                await user.updateStatus('offline');
            }
        } catch (error) {
            logger.error('Failed to update user last seen', {
                error: error.message,
                userId
            });
        }
    }

    // 離開所有房間
    leaveAllRooms(socket) {
        const userId = socket.userId;

        // 從所有房間中移除用戶
        for (const [roomId, users] of this.roomUsers.entries()) {
            if (users.has(userId)) {
                this.removeUserFromRoom(roomId, userId);

                // 通知房間其他成員用戶離開
                socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_OFFLINE, {
                    userId,
                    roomId,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    // 處理登出
    handleLogout(socket) {
        const userId = socket.userId;

        logger.websocket('User logout', userId, {
            socketId: socket.id
        });

        // 廣播用戶離線狀態
        this.broadcastUserStatus(userId, 'offline');

        // 斷開連接
        socket.disconnect(true);
    }

    // 通話相關處理
    handleCallOffer(socket, data) {
        const { targetUserId, offer, callType = 'audio' } = data;
        const callerId = socket.userId;

        logger.websocket('Call offer', callerId, {
            targetUserId,
            callType
        });

        // 轉發通話邀請給目標用戶
        this.io.to(`user:${targetUserId}`).emit(WS_EVENTS.CALL_OFFER, {
            callerId,
            callerName: socket.user.username,
            offer,
            callType,
            timestamp: new Date().toISOString()
        });
    }

    handleCallAnswer(socket, data) {
        const { callerId, answer, accepted } = data;
        const answerer = socket.userId;

        logger.websocket('Call answer', answerer, {
            callerId,
            accepted
        });

        // 轉發通話回應給發起者
        this.io.to(`user:${callerId}`).emit(WS_EVENTS.CALL_ANSWER, {
            answerer,
            answererName: socket.user.username,
            answer,
            accepted,
            timestamp: new Date().toISOString()
        });
    }

    handleCallCandidate(socket, data) {
        const { targetUserId, candidate } = data;
        const senderId = socket.userId;

        // 轉發ICE候選者信息
        this.io.to(`user:${targetUserId}`).emit(WS_EVENTS.CALL_CANDIDATE, {
            senderId,
            candidate
        });
    }

    handleCallEnd(socket, data) {
        const { targetUserId, reason = 'ended' } = data;
        const enderId = socket.userId;

        logger.websocket('Call ended', enderId, {
            targetUserId,
            reason
        });

        // 通知對方通話結束
        this.io.to(`user:${targetUserId}`).emit(WS_EVENTS.CALL_END, {
            enderId,
            reason,
            timestamp: new Date().toISOString()
        });
    }

    // 處理通知已讀
    async handleNotificationRead(socket, data) {
        try {
            const { notificationIds } = data;
            const userId = socket.userId;

            if (!Array.isArray(notificationIds)) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: 'Notification IDs must be an array'
                });
                return;
            }

            // 標記通知為已讀
            const database = require('../config/database');
            const placeholders = notificationIds.map(() => '?').join(',');

            await database.run(
                `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
                 WHERE uuid IN (${placeholders}) AND user_uuid = ? AND read_at IS NULL`,
                [...notificationIds, userId]
            );

            socket.emit(WS_EVENTS.NOTIFICATION_READ, {
                notificationIds,
                timestamp: new Date().toISOString()
            });

            logger.websocket('Notifications marked as read', userId, {
                count: notificationIds.length
            });

        } catch (error) {
            logger.error('Failed to mark notifications as read', {
                error: error.message,
                userId: socket.userId,
                data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: 'Failed to mark notifications as read'
            });
        }
    }

    // 心跳檢測
    setupHeartbeat() {
        setInterval(() => {
            this.io.emit(WS_EVENTS.PING, { timestamp: Date.now() });
        }, SYSTEM.HEARTBEAT_INTERVAL);
    }

    // 發送系統通知
    sendSystemNotification(targetUserId, notification) {
        this.io.to(`user:${targetUserId}`).emit(WS_EVENTS.SYSTEM_MESSAGE, {
            type: 'notification',
            notification,
            timestamp: new Date().toISOString()
        });
    }

    // 廣播系統消息
    broadcastSystemMessage(message, roomId = null) {
        const messageData = {
            type: 'system',
            message,
            timestamp: new Date().toISOString()
        };

        if (roomId) {
            this.io.to(`room:${roomId}`).emit(WS_EVENTS.SYSTEM_MESSAGE, messageData);
        } else {
            this.io.emit(WS_EVENTS.SYSTEM_MESSAGE, messageData);
        }

        logger.websocket('System message broadcasted', null, {
            message: message.substring(0, 100),
            roomId
        });
    }

    // 獲取在線用戶數
    getOnlineUserCount() {
        return this.connectedUsers.size;
    }

    // 獲取房間在線用戶數
    getRoomOnlineCount(roomId) {
        const roomUsers = this.roomUsers.get(roomId);
        if (!roomUsers) return 0;

        let onlineCount = 0;
        roomUsers.forEach(userId => {
            if (this.connectedUsers.has(userId)) {
                onlineCount++;
            }
        });

        return onlineCount;
    }

    // 檢查用戶是否在線
    isUserOnline(userId) {
        return this.connectedUsers.has(userId) && this.connectedUsers.get(userId).size > 0;
    }

    // 向特定用戶發送消息
    sendToUser(userId, event, data) {
        this.io.to(`user:${userId}`).emit(event, data);
    }

    // 向房間發送消息
    sendToRoom(roomId, event, data) {
        this.io.to(`room:${roomId}`).emit(event, data);
    }

    // 獲取統計信息
    getStats() {
        return {
            connectedUsers: this.connectedUsers.size,
            totalConnections: this.userSockets.size,
            activeRooms: this.roomUsers.size,
            timestamp: new Date().toISOString()
        };
    }

    // 強制斷開用戶連接（管理員功能）
    disconnectUser(userId, reason = 'Admin action') {
        const userSockets = this.connectedUsers.get(userId);
        if (userSockets) {
            userSockets.forEach(socketId => {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit(WS_EVENTS.SYSTEM_MESSAGE, {
                        type: 'disconnect',
                        message: `You have been disconnected: ${reason}`,
                        timestamp: new Date().toISOString()
                    });
                    socket.disconnect(true);
                }
            });
        }

        logger.websocket('User forcibly disconnected', userId, { reason });
    }
}

module.exports = SocketHandler;