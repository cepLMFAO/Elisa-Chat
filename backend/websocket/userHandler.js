const database = require('../config/database');
const logger = require('../utils/logger');
const { WS_EVENTS, USER_STATUS } = require('../config/constants');

class UserHandler {
    constructor(io, socketHandler) {
        this.io = io;
        this.socketHandler = socketHandler;
        this.typingUsers = new Map(); // roomId -> Set of userIds
        this.typingTimeouts = new Map(); // userId -> timeout
    }

    // 處理用戶狀態變更
    async handleStatusChange(socket, data) {
        try {
            const { status } = data;
            const userId = socket.userId;

            // 驗證狀態值
            if (!Object.values(USER_STATUS).includes(status)) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '無效的用戶狀態',
                    code: 'INVALID_STATUS'
                });
                return;
            }

            // 更新數據庫中的用戶狀態
            await database.run(
                'UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE uuid = ?',
                [status, userId]
            );

            // 獲取用戶所在的所有房間
            const userRooms = await database.query(
                'SELECT room_uuid FROM room_members WHERE user_uuid = ?',
                [userId]
            );

            // 廣播狀態變更到所有相關房間
            userRooms.forEach(room => {
                socket.to(`room:${room.room_uuid}`).emit(WS_EVENTS.USER_STATUS, {
                    userId,
                    username: socket.user.username,
                    status,
                    timestamp: new Date().toISOString()
                });
            });

            // 確認狀態更新成功
            socket.emit('status_updated', {
                status,
                timestamp: new Date().toISOString()
            });

            logger.websocket('User status changed', userId, {
                newStatus: status,
                previousStatus: socket.user.status
            });

            // 更新 socket 上的用戶信息
            socket.user.status = status;

        } catch (error) {
            logger.error('Failed to handle status change', {
                error: error.message,
                userId: socket.userId,
                requestedStatus: data.status
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '更新狀態失敗',
                code: 'STATUS_UPDATE_FAILED'
            });
        }
    }

    // 處理用戶開始輸入
    async handleTyping(socket, data) {
        try {
            const { roomId } = data;
            const userId = socket.userId;

            if (!roomId) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '房間ID是必需的',
                    code: 'ROOM_ID_REQUIRED'
                });
                return;
            }

            // 檢查用戶是否是房間成員
            const membership = await database.get(
                'SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, userId]
            );

            if (!membership) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '您不是此房間的成員',
                    code: 'NOT_ROOM_MEMBER'
                });
                return;
            }

            // 添加到輸入用戶列表
            if (!this.typingUsers.has(roomId)) {
                this.typingUsers.set(roomId, new Set());
            }
            this.typingUsers.get(roomId).add(userId);

            // 清除之前的超時
            if (this.typingTimeouts.has(userId)) {
                clearTimeout(this.typingTimeouts.get(userId));
            }

            // 設置自動停止輸入的超時（5秒）
            const timeout = setTimeout(() => {
                this.handleStopTyping(socket, { roomId });
            }, 5000);
            this.typingTimeouts.set(userId, timeout);

            // 廣播輸入狀態到房間（除了發送者）
            socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_TYPING, {
                roomId,
                user: {
                    id: userId,
                    username: socket.user.username
                },
                timestamp: new Date().toISOString()
            });

            logger.websocket('User started typing', userId, { roomId });

        } catch (error) {
            logger.error('Failed to handle typing', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });
        }
    }

    // 處理用戶停止輸入
    async handleStopTyping(socket, data) {
        try {
            const { roomId } = data;
            const userId = socket.userId;

            if (!roomId) {
                return; // 靜默失敗，因為這可能是自動調用
            }

            // 從輸入用戶列表中移除
            if (this.typingUsers.has(roomId)) {
                this.typingUsers.get(roomId).delete(userId);

                // 如果房間沒有輸入用戶了，清理該房間記錄
                if (this.typingUsers.get(roomId).size === 0) {
                    this.typingUsers.delete(roomId);
                }
            }

            // 清除超時
            if (this.typingTimeouts.has(userId)) {
                clearTimeout(this.typingTimeouts.get(userId));
                this.typingTimeouts.delete(userId);
            }

            // 廣播停止輸入狀態到房間（除了發送者）
            socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_STOP_TYPING, {
                roomId,
                user: {
                    id: userId,
                    username: socket.user.username
                },
                timestamp: new Date().toISOString()
            });

            logger.websocket('User stopped typing', userId, { roomId });

        } catch (error) {
            logger.error('Failed to handle stop typing', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });
        }
    }

    // 處理獲取在線用戶
    async handleGetOnlineUsers(socket, data) {
        try {
            const { roomId } = data;
            const userId = socket.userId;

            if (roomId) {
                // 獲取特定房間的在線用戶
                const membership = await database.get(
                    'SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                    [roomId, userId]
                );

                if (!membership) {
                    socket.emit(WS_EVENTS.ERROR, {
                        message: '無權限查看此房間信息',
                        code: 'ACCESS_DENIED'
                    });
                    return;
                }

                const onlineUsers = this.socketHandler.getRoomUsers(roomId);
                const userList = [];

                for (const onlineUserId of onlineUsers) {
                    const user = await database.get(
                        'SELECT uuid, username, avatar, status FROM users WHERE uuid = ?',
                        [onlineUserId]
                    );
                    if (user) {
                        userList.push({
                            id: user.uuid,
                            username: user.username,
                            avatar: user.avatar,
                            status: user.status,
                            isOnline: true
                        });
                    }
                }

                socket.emit('room_online_users', {
                    roomId,
                    users: userList,
                    count: userList.length,
                    timestamp: new Date().toISOString()
                });

            } else {
                // 獲取全局在線用戶（好友）
                const friends = await database.query(
                    `SELECT u.uuid, u.username, u.avatar, u.status
                     FROM friendships f
                     JOIN users u ON (f.user_uuid = u.uuid OR f.friend_uuid = u.uuid)
                     WHERE (f.user_uuid = ? OR f.friend_uuid = ?) 
                     AND f.status = 'accepted'
                     AND u.uuid != ?`,
                    [userId, userId, userId]
                );

                const onlineFriends = friends.filter(friend =>
                    this.socketHandler.isUserOnline(friend.uuid)
                ).map(friend => ({
                    id: friend.uuid,
                    username: friend.username,
                    avatar: friend.avatar,
                    status: friend.status,
                    isOnline: true
                }));

                socket.emit('online_friends', {
                    users: onlineFriends,
                    count: onlineFriends.length,
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            logger.error('Failed to get online users', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '獲取在線用戶失敗',
                code: 'GET_ONLINE_USERS_FAILED'
            });
        }
    }

    // 處理用戶個人資料更新
    async handleProfileUpdate(socket, data) {
        try {
            const { username, avatar, bio } = data;
            const userId = socket.userId;

            // 驗證用戶名是否已被使用（如果提供了新用戶名）
            if (username && username !== socket.user.username) {
                const existingUser = await database.get(
                    'SELECT uuid FROM users WHERE username = ? AND uuid != ?',
                    [username, userId]
                );

                if (existingUser) {
                    socket.emit(WS_EVENTS.ERROR, {
                        message: '用戶名已被使用',
                        code: 'USERNAME_TAKEN'
                    });
                    return;
                }
            }

            // 更新用戶資料
            const updateFields = [];
            const updateValues = [];

            if (username) {
                updateFields.push('username = ?');
                updateValues.push(username);
            }
            if (avatar) {
                updateFields.push('avatar = ?');
                updateValues.push(avatar);
            }
            if (bio !== undefined) {
                updateFields.push('bio = ?');
                updateValues.push(bio);
            }

            if (updateFields.length > 0) {
                updateFields.push('updated_at = CURRENT_TIMESTAMP');
                updateValues.push(userId);

                await database.run(
                    `UPDATE users SET ${updateFields.join(', ')} WHERE uuid = ?`,
                    updateValues
                );

                // 更新 socket 上的用戶信息
                if (username) socket.user.username = username;
                if (avatar) socket.user.avatar = avatar;
                if (bio !== undefined) socket.user.bio = bio;

                // 廣播個人資料更新到所有相關房間
                const userRooms = await database.query(
                    'SELECT room_uuid FROM room_members WHERE user_uuid = ?',
                    [userId]
                );

                const profileData = {
                    userId,
                    username: socket.user.username,
                    avatar: socket.user.avatar,
                    bio: socket.user.bio,
                    timestamp: new Date().toISOString()
                };

                userRooms.forEach(room => {
                    socket.to(`room:${room.room_uuid}`).emit('user_profile_updated', profileData);
                });

                // 確認更新成功
                socket.emit('profile_updated', profileData);

                logger.websocket('User profile updated', userId, {
                    updatedFields: updateFields.filter(f => f !== 'updated_at = CURRENT_TIMESTAMP')
                });
            }

        } catch (error) {
            logger.error('Failed to update profile', {
                error: error.message,
                userId: socket.userId,
                profileData: data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '更新個人資料失敗',
                code: 'PROFILE_UPDATE_FAILED'
            });
        }
    }

    // 清理用戶的輸入狀態（用戶斷開連接時調用）
    cleanupUserTyping(userId) {
        // 清除所有房間中該用戶的輸入狀態
        for (const [roomId, typingUsersSet] of this.typingUsers.entries()) {
            if (typingUsersSet.has(userId)) {
                typingUsersSet.delete(userId);

                // 如果房間沒有輸入用戶了，清理該房間記錄
                if (typingUsersSet.size === 0) {
                    this.typingUsers.delete(roomId);
                }

                // 廣播用戶停止輸入
                this.io.to(`room:${roomId}`).emit(WS_EVENTS.USER_STOP_TYPING, {
                    roomId,
                    user: { id: userId },
                    timestamp: new Date().toISOString()
                });
            }
        }

        // 清除用戶的輸入超時
        if (this.typingTimeouts.has(userId)) {
            clearTimeout(this.typingTimeouts.get(userId));
            this.typingTimeouts.delete(userId);
        }
    }

    // 獲取房間的輸入用戶
    getRoomTypingUsers(roomId) {
        return this.typingUsers.get(roomId) || new Set();
    }

    // 清理所有輸入狀態
    cleanup() {
        // 清除所有超時
        for (const timeout of this.typingTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.typingTimeouts.clear();
        this.typingUsers.clear();
    }
}

module.exports = UserHandler;