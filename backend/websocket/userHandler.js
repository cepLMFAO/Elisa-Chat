const logger = require('../utils/logger');
const User = require('../models/User');
const { WS_EVENTS, USER_STATUS } = require('../utils/constants');

class UserHandler {
    constructor(io, socketHandler) {
        this.io = io;
        this.socketHandler = socketHandler;
        this.typingUsers = new Map(); // roomId -> Set of userIds
        this.typingTimeouts = new Map(); // userId -> timeoutId
    }

    // 處理用戶狀態變更
    async handleStatusChange(socket, data) {
        try {
            const { status } = data;
            const userId = socket.userId;

            // 驗證狀態值
            if (!Object.values(USER_STATUS).includes(status)) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '無效的用戶狀態'
                });
                return;
            }

            // 更新數據庫中的用戶狀態
            const user = await User.findByUuid(userId);
            if (user) {
                await user.updateStatus(status);
            }

            // 廣播狀態更新
            await this.socketHandler.broadcastUserStatus(userId, status);

            logger.websocket('用戶狀態更新', userId, { status });

        } catch (error) {
            logger.error('更新用戶狀態失敗', {
                error: error.message,
                userId: socket.userId,
                status: data.status
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '更新狀態失敗'
            });
        }
    }

    // 處理正在輸入
    handleTyping(socket, data) {
        try {
            const { roomId, isTyping = true } = data;
            const userId = socket.userId;
            const username = socket.user.username;

            if (!roomId) {
                return;
            }

            // 清除之前的計時器
            if (this.typingTimeouts.has(userId)) {
                clearTimeout(this.typingTimeouts.get(userId));
            }

            if (isTyping) {
                // 添加到正在輸入列表
                if (!this.typingUsers.has(roomId)) {
                    this.typingUsers.set(roomId, new Set());
                }
                this.typingUsers.get(roomId).add(userId);

                // 廣播正在輸入狀態
                socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_TYPING, {
                    roomId,
                    userId,
                    username,
                    timestamp: new Date().toISOString()
                });

                // 設置自動停止計時器（10秒後自動停止）
                const timeoutId = setTimeout(() => {
                    this.handleStopTyping(socket, { roomId });
                }, 10000);

                this.typingTimeouts.set(userId, timeoutId);

                logger.websocket('用戶開始輸入', userId, { roomId });
            }

        } catch (error) {
            logger.error('處理輸入狀態失敗', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });
        }
    }

    // 處理停止輸入
    handleStopTyping(socket, data) {
        try {
            const { roomId } = data;
            const userId = socket.userId;
            const username = socket.user.username;

            if (!roomId) {
                return;
            }

            // 清除計時器
            if (this.typingTimeouts.has(userId)) {
                clearTimeout(this.typingTimeouts.get(userId));
                this.typingTimeouts.delete(userId);
            }

            // 從正在輸入列表移除
            if (this.typingUsers.has(roomId)) {
                this.typingUsers.get(roomId).delete(userId);

                // 如果房間沒有人在輸入，清理Map
                if (this.typingUsers.get(roomId).size === 0) {
                    this.typingUsers.delete(roomId);
                }
            }

            // 廣播停止輸入狀態
            socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_STOP_TYPING, {
                roomId,
                userId,
                username,
                timestamp: new Date().toISOString()
            });

            logger.websocket('用戶停止輸入', userId, { roomId });

        } catch (error) {
            logger.error('處理停止輸入失敗', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });
        }
    }

    // 處理用戶斷線清理
    handleUserDisconnect(socket) {
        const userId = socket.userId;

        // 清理所有房間的輸入狀態
        for (const [roomId, typingUsers] of this.typingUsers.entries()) {
            if (typingUsers.has(userId)) {
                typingUsers.delete(userId);

                // 廣播用戶停止輸入
                socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_STOP_TYPING, {
                    roomId,
                    userId,
                    username: socket.user.username,
                    timestamp: new Date().toISOString()
                });

                // 清理空的房間
                if (typingUsers.size === 0) {
                    this.typingUsers.delete(roomId);
                }
            }
        }

        // 清理計時器
        if (this.typingTimeouts.has(userId)) {
            clearTimeout(this.typingTimeouts.get(userId));
            this.typingTimeouts.delete(userId);
        }
    }

    // 獲取房間正在輸入的用戶
    getRoomTypingUsers(roomId) {
        return Array.from(this.typingUsers.get(roomId) || []);
    }

    // 處理用戶設置更新
    async handleUserSettingsUpdate(socket, data) {
        try {
            const { settings } = data;
            const userId = socket.userId;

            const user = await User.findByUuid(userId);
            if (!user) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '用戶不存在'
                });
                return;
            }

            // 更新用戶設置
            await user.updateSettings(settings);

            socket.emit('user:settings_updated', {
                settings,
                timestamp: new Date().toISOString()
            });

            logger.websocket('用戶設置已更新', userId, { settings });

        } catch (error) {
            logger.error('更新用戶設置失敗', {
                error: error.message,
                userId: socket.userId
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '更新設置失敗'
            });
        }
    }

    // 處理用戶個人資料更新
    async handleProfileUpdate(socket, data) {
        try {
            const { profile } = data;
            const userId = socket.userId;

            const user = await User.findByUuid(userId);
            if (!user) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '用戶不存在'
                });
                return;
            }

            // 更新個人資料
            await user.updateProfile(profile);

            // 廣播個人資料更新給相關用戶
            await this.broadcastProfileUpdate(userId, profile);

            socket.emit('user:profile_updated', {
                profile,
                timestamp: new Date().toISOString()
            });

            logger.websocket('用戶個人資料已更新', userId, { profile });

        } catch (error) {
            logger.error('更新個人資料失敗', {
                error: error.message,
                userId: socket.userId
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '更新個人資料失敗'
            });
        }
    }

    // 廣播個人資料更新
    async broadcastProfileUpdate(userId, profile) {
        try {
            const database = require('../config/database');

            // 獲取用戶的好友列表
            const friends = await database.query(`
                SELECT addressee_uuid as friend_id FROM friendships
                WHERE requester_uuid = ? AND status = 'accepted'
                UNION
                SELECT requester_uuid as friend_id FROM friendships
                WHERE addressee_uuid = ? AND status = 'accepted'
            `, [userId, userId]);

            // 獲取用戶所在的房間成員
            const roomMembers = await database.query(`
                SELECT DISTINCT rm2.user_uuid as member_id
                FROM room_members rm1
                JOIN room_members rm2 ON rm1.room_uuid = rm2.room_uuid
                WHERE rm1.user_uuid = ? AND rm2.user_uuid != ?
            `, [userId, userId]);

            // 合併通知列表
            const notifyUsers = new Set();
            friends.forEach(friend => notifyUsers.add(friend.friend_id));
            roomMembers.forEach(member => notifyUsers.add(member.member_id));

            // 廣播更新
            const updateData = {
                userId,
                profile,
                timestamp: new Date().toISOString()
            };

            notifyUsers.forEach(targetUserId => {
                this.io.to(`user:${targetUserId}`).emit('user:profile_updated', updateData);
            });

        } catch (error) {
            logger.error('廣播個人資料更新失敗', {
                error: error.message,
                userId
            });
        }
    }
}

module.exports = UserHandler;