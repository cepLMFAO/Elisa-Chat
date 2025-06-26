const database = require('../config/database');
const logger = require('../utils/logger');
const { WS_EVENTS } = require('../config/constants');

class RoomHandler {
    constructor(io, socketHandler) {
        this.io = io;
        this.socketHandler = socketHandler;
    }

    // 處理加入房間
    async handleJoinRoom(socket, data) {
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

            // 檢查房間是否存在
            const room = await database.get(
                'SELECT * FROM rooms WHERE uuid = ?',
                [roomId]
            );

            if (!room) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '房間不存在',
                    code: 'ROOM_NOT_FOUND'
                });
                return;
            }

            // 檢查用戶是否是房間成員
            const membership = await database.get(
                'SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, userId]
            );

            if (!membership && room.type !== 'public') {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '無權限加入此房間',
                    code: 'ACCESS_DENIED'
                });
                return;
            }

            // 加入 Socket.IO 房間
            socket.join(`room:${roomId}`);

            // 記錄房間用戶
            this.socketHandler.addUserToRoom(roomId, userId);

            // 更新最後活動時間
            if (membership) {
                await database.run(
                    'UPDATE room_members SET last_activity = CURRENT_TIMESTAMP WHERE room_uuid = ? AND user_uuid = ?',
                    [roomId, userId]
                );
            }

            // 獲取用戶信息
            const user = await database.get(
                'SELECT uuid, username, avatar FROM users WHERE uuid = ?',
                [userId]
            );

            // 通知房間內其他成員
            socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_ONLINE, {
                roomId,
                user: {
                    id: user.uuid,
                    username: user.username,
                    avatar: user.avatar
                },
                timestamp: new Date().toISOString()
            });

            // 確認加入成功
            socket.emit('room_joined', {
                roomId,
                roomName: room.name,
                timestamp: new Date().toISOString()
            });

            logger.websocket('User joined room', userId, {
                roomId,
                roomName: room.name
            });

        } catch (error) {
            logger.error('Failed to handle join room', {
                error: error.message,
                roomId: data.roomId,
                userId: socket.userId
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '加入房間失敗',
                code: 'JOIN_ROOM_FAILED'
            });
        }
    }

    // 處理離開房間
    async handleLeaveRoom(socket, data) {
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

            // 離開 Socket.IO 房間
            socket.leave(`room:${roomId}`);

            // 從房間用戶記錄中移除
            this.socketHandler.removeUserFromRoom(roomId, userId);

            // 獲取用戶信息
            const user = await database.get(
                'SELECT uuid, username, avatar FROM users WHERE uuid = ?',
                [userId]
            );

            // 通知房間內其他成員
            socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_OFFLINE, {
                roomId,
                user: {
                    id: user.uuid,
                    username: user.username,
                    avatar: user.avatar
                },
                timestamp: new Date().toISOString()
            });

            // 確認離開成功
            socket.emit('room_left', {
                roomId,
                timestamp: new Date().toISOString()
            });

            logger.websocket('User left room', userId, {
                roomId
            });

        } catch (error) {
            logger.error('Failed to handle leave room', {
                error: error.message,
                roomId: data.roomId,
                userId: socket.userId
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '離開房間失敗',
                code: 'LEAVE_ROOM_FAILED'
            });
        }
    }

    // 處理創建房間
    async handleCreateRoom(socket, data) {
        try {
            const { name, description, type = 'private', password } = data;
            const userId = socket.userId;

            // 基本驗證
            if (!name || name.trim().length === 0) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '房間名稱是必需的',
                    code: 'ROOM_NAME_REQUIRED'
                });
                return;
            }

            // 這裡應該調用 Room 模型的創建方法
            // 由於沒有 Room 模型，我們直接操作數據庫
            const { v4: uuidv4 } = require('uuid');
            const roomUuid = uuidv4();

            // 創建房間
            await database.run(
                `INSERT INTO rooms (uuid, name, description, type, password, created_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [roomUuid, name.trim(), description || '', type, password || null, userId]
            );

            // 將創建者添加為管理員
            await database.run(
                `INSERT INTO room_members (room_uuid, user_uuid, role, joined_at)
                 VALUES (?, ?, 'owner', CURRENT_TIMESTAMP)`,
                [roomUuid, userId]
            );

            // 發送房間創建成功事件
            socket.emit(WS_EVENTS.ROOM_CREATED, {
                room: {
                    id: roomUuid,
                    name: name.trim(),
                    description: description || '',
                    type,
                    createdBy: userId
                },
                timestamp: new Date().toISOString()
            });

            logger.websocket('Room created', userId, {
                roomId: roomUuid,
                roomName: name.trim(),
                roomType: type
            });

        } catch (error) {
            logger.error('Failed to create room', {
                error: error.message,
                userId: socket.userId,
                roomData: data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '創建房間失敗',
                code: 'CREATE_ROOM_FAILED'
            });
        }
    }

    // 處理房間邀請
    async handleRoomInvite(socket, data) {
        try {
            const { roomId, targetUserId, message } = data;
            const inviterUserId = socket.userId;

            // 檢查房間和權限
            const membership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, inviterUserId]
            );

            if (!membership || !['owner', 'admin'].includes(membership.role)) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '無權限邀請用戶',
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
                return;
            }

            // 檢查目標用戶是否已經是成員
            const existingMember = await database.get(
                'SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, targetUserId]
            );

            if (existingMember) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '用戶已經是房間成員',
                    code: 'USER_ALREADY_MEMBER'
                });
                return;
            }

            // 獲取房間和邀請者信息
            const room = await database.get('SELECT name FROM rooms WHERE uuid = ?', [roomId]);
            const inviter = await database.get('SELECT username FROM users WHERE uuid = ?', [inviterUserId]);

            // 發送邀請通知給目標用戶
            this.io.to(`user:${targetUserId}`).emit('room_invitation', {
                roomId,
                roomName: room.name,
                inviterName: inviter.username,
                message: message || `${inviter.username} 邀請您加入房間 "${room.name}"`,
                timestamp: new Date().toISOString()
            });

            socket.emit('invitation_sent', {
                roomId,
                targetUserId,
                timestamp: new Date().toISOString()
            });

            logger.websocket('Room invitation sent', inviterUserId, {
                roomId,
                targetUserId,
                roomName: room.name
            });

        } catch (error) {
            logger.error('Failed to send room invitation', {
                error: error.message,
                userId: socket.userId,
                inviteData: data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '發送邀請失敗',
                code: 'INVITE_FAILED'
            });
        }
    }

    // 獲取房間在線用戶
    async handleGetRoomUsers(socket, data) {
        try {
            const { roomId } = data;
            const userId = socket.userId;

            // 檢查用戶是否有權限查看房間成員
            const membership = await database.get(
                'SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, userId]
            );

            if (!membership) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '無權限查看房間成員',
                    code: 'ACCESS_DENIED'
                });
                return;
            }

            // 獲取房間所有成員
            const members = await database.query(
                `SELECT u.uuid, u.username, u.avatar, u.status, rm.role, rm.joined_at
                 FROM room_members rm
                 JOIN users u ON rm.user_uuid = u.uuid
                 WHERE rm.room_uuid = ?
                 ORDER BY rm.joined_at`,
                [roomId]
            );

            // 獲取在線成員
            const onlineUsers = this.socketHandler.getRoomUsers(roomId);

            const roomUsers = members.map(member => ({
                id: member.uuid,
                username: member.username,
                avatar: member.avatar,
                role: member.role,
                joinedAt: member.joined_at,
                isOnline: onlineUsers.has(member.uuid)
            }));

            socket.emit('room_users', {
                roomId,
                users: roomUsers,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Failed to get room users', {
                error: error.message,
                roomId: data.roomId,
                userId: socket.userId
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '獲取房間成員失敗',
                code: 'GET_ROOM_USERS_FAILED'
            });
        }
    }
}

module.exports = RoomHandler;