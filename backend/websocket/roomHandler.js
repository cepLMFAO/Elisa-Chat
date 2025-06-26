const logger = require('../utils/logger');
const Room = require('../models/room');
const RoomMember = require('../models/roomMember');
const { WS_EVENTS, ERROR_CODES, ROOM_ROLES } = require('../utils/constants');

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
            const user = socket.user;

            logger.websocket('用戶嘗試加入房間', userId, { roomId });

            // 驗證房間是否存在
            const room = await Room.findByUuid(roomId);
            if (!room) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ROOM_NOT_FOUND,
                    message: '房間不存在'
                });
                return;
            }

            // 檢查用戶是否為房間成員
            const membership = await RoomMember.findByRoomAndUser(roomId, userId);
            if (!membership) {
                // 檢查是否為公開房間
                if (room.type === 'private' || room.is_private) {
                    socket.emit(WS_EVENTS.ERROR, {
                        code: ERROR_CODES.ROOM_PRIVATE,
                        message: '無權限加入私人房間'
                    });
                    return;
                }

                // 自動加入公開房間
                await RoomMember.create({
                    roomUuid: roomId,
                    userUuid: userId,
                    role: ROOM_ROLES.MEMBER
                });
            }

            // 加入 Socket.IO 房間
            socket.join(`room:${roomId}`);

            // 記錄房間用戶
            this.socketHandler.addUserToRoom(roomId, userId);

            // 發送加入成功事件
            socket.emit(WS_EVENTS.JOIN_ROOM, {
                roomId,
                room: await room.toJSON(userId),
                timestamp: new Date().toISOString()
            });

            // 通知房間其他成員
            socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_JOIN_ROOM, {
                userId,
                username: user.username,
                displayName: user.displayName,
                avatar: user.avatar,
                roomId,
                timestamp: new Date().toISOString()
            });

            // 獲取房間最近訊息
            const messages = await this.getRecentMessages(roomId, 50);
            socket.emit('room:messages', {
                roomId,
                messages,
                hasMore: messages.length === 50
            });

            // 獲取在線成員列表
            const onlineMembers = await this.getOnlineMembers(roomId);
            socket.emit('room:members', {
                roomId,
                members: onlineMembers
            });

            logger.websocket('用戶成功加入房間', userId, { roomId });

        } catch (error) {
            logger.error('加入房間失敗', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '加入房間失敗'
            });
        }
    }

    // 處理離開房間
    async handleLeaveRoom(socket, data) {
        try {
            const { roomId } = data;
            const userId = socket.userId;
            const user = socket.user;

            logger.websocket('用戶離開房間', userId, { roomId });

            // 離開 Socket.IO 房間
            socket.leave(`room:${roomId}`);

            // 從房間用戶列表移除
            this.socketHandler.removeUserFromRoom(roomId, userId);

            // 發送離開確認
            socket.emit(WS_EVENTS.LEAVE_ROOM, {
                roomId,
                timestamp: new Date().toISOString()
            });

            // 通知房間其他成員
            socket.to(`room:${roomId}`).emit(WS_EVENTS.USER_LEAVE_ROOM, {
                userId,
                username: user.username,
                roomId,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('離開房間失敗', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });
        }
    }

    // 處理房間設置更新
    async handleRoomUpdate(socket, data) {
        try {
            const { roomId, updates } = data;
            const userId = socket.userId;

            // 檢查權限
            const membership = await RoomMember.findByRoomAndUser(roomId, userId);
            if (!membership || !['owner', 'admin'].includes(membership.role)) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ACCESS_DENIED,
                    message: '無權限修改房間設置'
                });
                return;
            }

            // 更新房間信息
            const room = await Room.findByUuid(roomId);
            if (!room) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ROOM_NOT_FOUND,
                    message: '房間不存在'
                });
                return;
            }

            await room.update(updates);

            // 廣播房間更新
            this.io.to(`room:${roomId}`).emit(WS_EVENTS.ROOM_UPDATED, {
                roomId,
                updates,
                updatedBy: userId,
                timestamp: new Date().toISOString()
            });

            logger.websocket('房間信息已更新', userId, { roomId, updates });

        } catch (error) {
            logger.error('更新房間失敗', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '更新房間失敗'
            });
        }
    }

    // 處理邀請用戶
    async handleInviteUser(socket, data) {
        try {
            const { roomId, userIds } = data;
            const inviterId = socket.userId;

            // 檢查邀請權限
            const membership = await RoomMember.findByRoomAndUser(roomId, inviterId);
            if (!membership) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.NOT_ROOM_MEMBER,
                    message: '您不是房間成員'
                });
                return;
            }

            const room = await Room.findByUuid(roomId);
            if (!room) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ROOM_NOT_FOUND,
                    message: '房間不存在'
                });
                return;
            }

            // 批量邀請用戶
            const inviteResults = [];
            for (const userId of userIds) {
                try {
                    // 檢查用戶是否已經是成員
                    const existingMember = await RoomMember.findByRoomAndUser(roomId, userId);
                    if (existingMember) {
                        inviteResults.push({
                            userId,
                            status: 'already_member',
                            message: '用戶已是房間成員'
                        });
                        continue;
                    }

                    // 添加為房間成員
                    await RoomMember.create({
                        roomUuid: roomId,
                        userUuid: userId,
                        role: ROOM_ROLES.MEMBER
                    });

                    // 發送邀請通知
                    this.io.to(`user:${userId}`).emit(WS_EVENTS.ROOM_INVITE, {
                        roomId,
                        roomName: room.name,
                        inviterId,
                        inviterName: socket.user.username,
                        timestamp: new Date().toISOString()
                    });

                    inviteResults.push({
                        userId,
                        status: 'invited',
                        message: '邀請成功'
                    });

                } catch (error) {
                    inviteResults.push({
                        userId,
                        status: 'error',
                        message: error.message
                    });
                }
            }

            socket.emit('room:invite_results', {
                roomId,
                results: inviteResults
            });

        } catch (error) {
            logger.error('邀請用戶失敗', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '邀請用戶失敗'
            });
        }
    }

    // 處理踢出用戶
    async handleKickUser(socket, data) {
        try {
            const { roomId, targetUserId, reason } = data;
            const operatorId = socket.userId;

            // 檢查操作權限
            const operatorMembership = await RoomMember.findByRoomAndUser(roomId, operatorId);
            const targetMembership = await RoomMember.findByRoomAndUser(roomId, targetUserId);

            if (!operatorMembership || !['owner', 'admin', 'moderator'].includes(operatorMembership.role)) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ACCESS_DENIED,
                    message: '無權限踢出用戶'
                });
                return;
            }

            if (!targetMembership) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.USER_NOT_FOUND,
                    message: '目標用戶不在房間中'
                });
                return;
            }

            // 權限等級檢查
            const roleHierarchy = { owner: 3, admin: 2, moderator: 1, member: 0 };
            if (roleHierarchy[targetMembership.role] >= roleHierarchy[operatorMembership.role]) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ACCESS_DENIED,
                    message: '無法踢出同等或更高權限的用戶'
                });
                return;
            }

            // 移除用戶成員資格
            await targetMembership.delete();

            // 強制目標用戶離開房間
            this.io.to(`user:${targetUserId}`).emit('room:kicked', {
                roomId,
                reason,
                operatorId,
                timestamp: new Date().toISOString()
            });

            // 通知房間成員
            this.io.to(`room:${roomId}`).emit('room:user_kicked', {
                roomId,
                targetUserId,
                operatorId,
                reason,
                timestamp: new Date().toISOString()
            });

            logger.websocket('用戶被踢出房間', operatorId, {
                roomId,
                targetUserId,
                reason
            });

        } catch (error) {
            logger.error('踢出用戶失敗', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '踢出用戶失敗'
            });
        }
    }

    // 獲取房間最近訊息
    async getRecentMessages(roomId, limit = 50) {
        try {
            const database = require('../config/database');
            const messages = await database.query(`
                SELECT m.*, u.username, u.display_name, u.avatar,
                       COUNT(mr.id) as reaction_count
                FROM messages m
                LEFT JOIN users u ON m.sender_uuid = u.uuid
                LEFT JOIN message_reactions mr ON m.uuid = mr.message_uuid
                WHERE m.room_uuid = ? AND m.deleted_at IS NULL
                GROUP BY m.uuid
                ORDER BY m.created_at DESC
                LIMIT ?
            `, [roomId, limit]);

            return messages.reverse(); // 返回時間順序
        } catch (error) {
            logger.error('獲取房間訊息失敗', { roomId, error: error.message });
            return [];
        }
    }

    // 獲取在線成員
    async getOnlineMembers(roomId) {
        try {
            const database = require('../config/database');
            const members = await database.query(`
                SELECT u.uuid, u.username, u.display_name, u.avatar, u.status,
                       rm.role, rm.joined_at
                FROM room_members rm
                JOIN users u ON rm.user_uuid = u.uuid
                WHERE rm.room_uuid = ?
                ORDER BY rm.role DESC, u.username ASC
            `, [roomId]);

            return members;
        } catch (error) {
            logger.error('獲取房間成員失敗', { roomId, error: error.message });
            return [];
        }
    }
}

module.exports = RoomHandler;