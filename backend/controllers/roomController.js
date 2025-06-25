const Room = require('../models/room');
const User = require('../models/User');
const database = require('../config/database');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, ROOM_TYPES, ROOM_ROLES } = require('../config/constants');

class RoomController {
    // 創建房間
    static async createRoom(req, res) {
        try {
            const { name, description, type = ROOM_TYPES.PUBLIC, password, maxMembers } = req.body;
            const creatorId = req.user.userId;

            const room = await Room.create({
                name,
                description,
                type,
                password,
                maxMembers
            }, creatorId);

            // 通過 WebSocket 廣播房間創建事件
            const io = req.app.get('io');
            if (io && type === ROOM_TYPES.PUBLIC) {
                io.emit('room_created', {
                    room: room.toPublic(),
                    createdBy: req.user.username
                });
            }

            logger.info('房間創建成功', {
                roomId: room.uuid,
                roomName: name,
                creatorId,
                type
            });

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: '房間創建成功',
                data: {
                    room: room.toJSON()
                }
            });

        } catch (error) {
            logger.error('創建房間失敗', {
                error: error.message,
                userId: req.user?.userId,
                body: req.body
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '創建房間失敗';

            if (error.message.includes('Room name')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = error.message;
            } else if (error.message.includes('Cannot create more than')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage,
                code: ERROR_CODES.VALIDATION_ERROR
            });
        }
    }

    // 獲取房間信息
    static async getRoom(req, res) {
        try {
            const { roomId } = req.params;
            const userId = req.user.userId;

            const room = await Room.findByUuid(roomId, userId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            // 如果是私有房間，檢查用戶是否為成員
            if (room.type === ROOM_TYPES.PRIVATE && !room.userRole) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權查看此房間',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            res.json({
                success: true,
                data: {
                    room: room.toJSON()
                }
            });

        } catch (error) {
            logger.error('獲取房間信息失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取房間信息失敗'
            });
        }
    }

    // 搜索房間
    static async searchRooms(req, res) {
        try {
            const { q: query, type, page = 1, limit = 20 } = req.query;
            const userId = req.user.userId;

            const result = await Room.search(
                query,
                type,
                parseInt(page),
                parseInt(limit),
                userId
            );

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('搜索房間失敗', {
                error: error.message,
                query: req.query,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '搜索失敗'
            });
        }
    }

    // 獲取用戶房間列表
    static async getUserRooms(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const userId = req.user.userId;

            const result = await Room.getUserRooms(userId, parseInt(page), parseInt(limit));

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('獲取用戶房間列表失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取房間列表失敗'
            });
        }
    }

    // 加入房間
    static async joinRoom(req, res) {
        try {
            const { roomId } = req.params;
            const { password } = req.body;
            const userId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            await room.join(userId, password);

            // 獲取用戶信息用於廣播
            const user = await User.findByUuid(userId);

            // 通過 WebSocket 通知房間成員
            const io = req.app.get('io');
            if (io) {
                // 用戶加入房間頻道
                const userSockets = io.sockets.sockets;
                for (const [socketId, socket] of userSockets) {
                    if (socket.userId === userId) {
                        socket.join(`room:${roomId}`);
                    }
                }

                // 廣播用戶加入事件
                io.to(`room:${roomId}`).emit('user_joined_room', {
                    roomId,
                    user: user.toPublic(),
                    timestamp: new Date().toISOString()
                });
            }

            logger.info('用戶加入房間', {
                roomId,
                userId,
                roomName: room.name
            });

            res.json({
                success: true,
                message: '成功加入房間',
                data: {
                    room: room.toJSON()
                }
            });

        } catch (error) {
            logger.error('加入房間失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '加入房間失敗';

            if (error.message.includes('already a member')) {
                statusCode = HTTP_STATUS.CONFLICT;
                errorMessage = '您已經是房間成員';
            } else if (error.message.includes('Room is full')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '房間已滿';
            } else if (error.message.includes('Password is required') || error.message.includes('Invalid room password')) {
                statusCode = HTTP_STATUS.UNAUTHORIZED;
                errorMessage = '房間密碼錯誤';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 離開房間
    static async leaveRoom(req, res) {
        try {
            const { roomId } = req.params;
            const userId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            const result = await room.leave(userId);

            // 獲取用戶信息用於廣播
            const user = await User.findByUuid(userId);

            // 通過 WebSocket 通知房間成員
            const io = req.app.get('io');
            if (io) {
                // 用戶離開房間頻道
                const userSockets = io.sockets.sockets;
                for (const [socketId, socket] of userSockets) {
                    if (socket.userId === userId) {
                        socket.leave(`room:${roomId}`);
                    }
                }

                // 廣播用戶離開事件
                if (!result.roomDeleted) {
                    io.to(`room:${roomId}`).emit('user_left_room', {
                        roomId,
                        user: user.toPublic(),
                        timestamp: new Date().toISOString()
                    });
                } else {
                    // 房間被刪除
                    io.emit('room_deleted', {
                        roomId,
                        roomName: room.name,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            logger.info('用戶離開房間', {
                roomId,
                userId,
                roomDeleted: result.roomDeleted
            });

            res.json({
                success: true,
                message: result.roomDeleted ? '房間已解散' : '成功離開房間',
                data: {
                    roomDeleted: result.roomDeleted
                }
            });

        } catch (error) {
            logger.error('離開房間失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '離開房間失敗';

            if (error.message.includes('not a member')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '您不是房間成員';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 獲取房間成員
    static async getRoomMembers(req, res) {
        try {
            const { roomId } = req.params;
            const { page = 1, limit = 50 } = req.query;
            const userId = req.user.userId;

            const room = await Room.findByUuid(roomId, userId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            // 檢查用戶是否為房間成員
            if (!room.userRole) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只有房間成員可以查看成員列表',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            const result = await room.getMembers(parseInt(page), parseInt(limit));

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('獲取房間成員失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取成員列表失敗'
            });
        }
    }

    // 踢出成員
    static async kickMember(req, res) {
        try {
            const { roomId, memberId } = req.params;
            const kickerUserId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            await room.kickMember(memberId, kickerUserId);

            // 獲取被踢用戶信息
            const kickedUser = await User.findByUuid(memberId);

            // 通過 WebSocket 通知
            const io = req.app.get('io');
            if (io) {
                // 通知被踢用戶
                io.to(`user:${memberId}`).emit('kicked_from_room', {
                    roomId,
                    roomName: room.name,
                    kickedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });

                // 通知房間其他成員
                io.to(`room:${roomId}`).emit('member_kicked', {
                    roomId,
                    kickedUser: kickedUser.toPublic(),
                    kickedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });

                // 強制被踢用戶離開房間頻道
                const userSockets = io.sockets.sockets;
                for (const [socketId, socket] of userSockets) {
                    if (socket.userId === memberId) {
                        socket.leave(`room:${roomId}`);
                    }
                }
            }

            logger.info('成員被踢出房間', {
                roomId,
                kickedUserId: memberId,
                kickerUserId
            });

            res.json({
                success: true,
                message: '成員已被踢出房間'
            });

        } catch (error) {
            logger.error('踢出成員失敗', {
                error: error.message,
                roomId: req.params.roomId,
                memberId: req.params.memberId,
                kickerUserId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '踢出成員失敗';

            if (error.message.includes('Insufficient permissions')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '權限不足';
            } else if (error.message.includes('not a member')) {
                statusCode = HTTP_STATUS.NOT_FOUND;
                errorMessage = '用戶不是房間成員';
            } else if (error.message.includes('Cannot kick room owner')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '無法踢出房間擁有者';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 更新成員角色
    static async updateMemberRole(req, res) {
        try {
            const { roomId, memberId } = req.params;
            const { role } = req.body;
            const updaterUserId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            await room.updateMemberRole(memberId, role, updaterUserId);

            // 獲取成員信息
            const member = await User.findByUuid(memberId);

            // 通過 WebSocket 通知
            const io = req.app.get('io');
            if (io) {
                // 通知成員角色變更
                io.to(`user:${memberId}`).emit('role_updated', {
                    roomId,
                    roomName: room.name,
                    newRole: role,
                    updatedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });

                // 通知房間其他成員
                io.to(`room:${roomId}`).emit('member_role_updated', {
                    roomId,
                    member: member.toPublic(),
                    newRole: role,
                    updatedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });
            }

            logger.info('成員角色更新', {
                roomId,
                memberId,
                newRole: role,
                updaterUserId
            });

            res.json({
                success: true,
                message: '成員角色更新成功'
            });

        } catch (error) {
            logger.error('更新成員角色失敗', {
                error: error.message,
                roomId: req.params.roomId,
                memberId: req.params.memberId,
                role: req.body.role,
                updaterUserId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '更新角色失敗';

            if (error.message.includes('Only room owner')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '只有房間擁有者可以更改角色';
            } else if (error.message.includes('Invalid role')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '無效的角色';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 更新房間信息
    static async updateRoom(req, res) {
        try {
            const { roomId } = req.params;
            const updateData = req.body;
            const updaterUserId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            await room.update(updateData, updaterUserId);

            // 通過 WebSocket 廣播房間更新
            const io = req.app.get('io');
            if (io) {
                io.to(`room:${roomId}`).emit('room_updated', {
                    roomId,
                    updates: updateData,
                    updatedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });

                // 如果是公開房間，向所有人廣播
                if (room.type === ROOM_TYPES.PUBLIC) {
                    io.emit('room_info_updated', {
                        room: room.toPublic(),
                        updatedBy: req.user.username
                    });
                }
            }

            logger.info('房間信息更新', {
                roomId,
                updates: Object.keys(updateData),
                updaterUserId
            });

            res.json({
                success: true,
                message: '房間信息更新成功',
                data: {
                    room: room.toJSON()
                }
            });

        } catch (error) {
            logger.error('更新房間信息失敗', {
                error: error.message,
                roomId: req.params.roomId,
                updateData: req.body,
                updaterUserId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '更新房間信息失敗';

            if (error.message.includes('Insufficient permissions')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '權限不足';
            } else if (error.message.includes('Room name')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = error.message;
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 更改房間密碼
    static async updateRoomPassword(req, res) {
        try {
            const { roomId } = req.params;
            const { password } = req.body;
            const updaterUserId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            await room.updatePassword(password, updaterUserId);

            logger.info('房間密碼更新', {
                roomId,
                updaterUserId,
                hasPassword: !!password
            });

            res.json({
                success: true,
                message: password ? '房間密碼設置成功' : '房間密碼已移除'
            });

        } catch (error) {
            logger.error('更新房間密碼失敗', {
                error: error.message,
                roomId: req.params.roomId,
                updaterUserId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '更新密碼失敗';

            if (error.message.includes('Only room owner')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '只有房間擁有者可以更改密碼';
            } else if (error.message.includes('Password can only be set')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '只有私有房間可以設置密碼';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 刪除房間
    static async deleteRoom(req, res) {
        try {
            const { roomId } = req.params;
            const deleterUserId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            await room.delete(deleterUserId);

            // 通過 WebSocket 通知所有相關用戶
            const io = req.app.get('io');
            if (io) {
                // 通知房間成員
                io.to(`room:${roomId}`).emit('room_deleted', {
                    roomId,
                    roomName: room.name,
                    deletedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });

                // 強制所有用戶離開房間頻道
                const socketsInRoom = await io.in(`room:${roomId}`).fetchSockets();
                socketsInRoom.forEach(socket => {
                    socket.leave(`room:${roomId}`);
                });

                // 如果是公開房間，向所有人廣播
                if (room.type === ROOM_TYPES.PUBLIC) {
                    io.emit('public_room_deleted', {
                        roomId,
                        roomName: room.name,
                        deletedBy: req.user.username
                    });
                }
            }

            logger.info('房間刪除成功', {
                roomId,
                roomName: room.name,
                deleterUserId
            });

            res.json({
                success: true,
                message: '房間刪除成功'
            });

        } catch (error) {
            logger.error('刪除房間失敗', {
                error: error.message,
                roomId: req.params.roomId,
                deleterUserId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '刪除房間失敗';

            if (error.message.includes('Only room owner')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '只有房間擁有者可以刪除房間';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 靜音成員
    static async muteMember(req, res) {
        try {
            const { roomId, memberId } = req.params;
            const { duration } = req.body; // 靜音時長（分鐘）
            const muterUserId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            await room.muteMember(memberId, muterUserId, duration);

            // 獲取被靜音用戶信息
            const mutedUser = await User.findByUuid(memberId);

            // 通過 WebSocket 通知
            const io = req.app.get('io');
            if (io) {
                // 通知被靜音用戶
                io.to(`user:${memberId}`).emit('muted_in_room', {
                    roomId,
                    roomName: room.name,
                    duration,
                    mutedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });

                // 通知房間其他成員
                io.to(`room:${roomId}`).emit('member_muted', {
                    roomId,
                    mutedUser: mutedUser.toPublic(),
                    duration,
                    mutedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });
            }

            logger.info('成員被靜音', {
                roomId,
                mutedUserId: memberId,
                muterUserId,
                duration
            });

            res.json({
                success: true,
                message: duration ? `成員已被靜音 ${duration} 分鐘` : '成員已被永久靜音'
            });

        } catch (error) {
            logger.error('靜音成員失敗', {
                error: error.message,
                roomId: req.params.roomId,
                memberId: req.params.memberId,
                muterUserId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '靜音失敗';

            if (error.message.includes('Insufficient permissions')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '權限不足';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 取消靜音
    static async unmuteMember(req, res) {
        try {
            const { roomId, memberId } = req.params;
            const unmuterUserId = req.user.userId;

            const room = await Room.findByUuid(roomId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            await room.unmuteMember(memberId, unmuterUserId);

            // 獲取用戶信息
            const unmutedUser = await User.findByUuid(memberId);

            // 通過 WebSocket 通知
            const io = req.app.get('io');
            if (io) {
                // 通知被取消靜音用戶
                io.to(`user:${memberId}`).emit('unmuted_in_room', {
                    roomId,
                    roomName: room.name,
                    unmutedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });

                // 通知房間其他成員
                io.to(`room:${roomId}`).emit('member_unmuted', {
                    roomId,
                    unmutedUser: unmutedUser.toPublic(),
                    unmutedBy: req.user.username,
                    timestamp: new Date().toISOString()
                });
            }

            logger.info('成員取消靜音', {
                roomId,
                unmutedUserId: memberId,
                unmuterUserId
            });

            res.json({
                success: true,
                message: '成員已取消靜音'
            });

        } catch (error) {
            logger.error('取消靜音失敗', {
                error: error.message,
                roomId: req.params.roomId,
                memberId: req.params.memberId,
                unmuterUserId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '取消靜音失敗';

            if (error.message.includes('Insufficient permissions')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '權限不足';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 獲取房間統計
    static async getRoomStats(req, res) {
        try {
            const { roomId } = req.params;
            const userId = req.user.userId;

            const room = await Room.findByUuid(roomId, userId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            // 檢查用戶是否為房間成員
            if (!room.userRole) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只有房間成員可以查看統計',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            const stats = await room.getStats();

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('獲取房間統計失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取統計失敗'
            });
        }
    }

    // 邀請用戶加入房間
    static async inviteUser(req, res) {
        try {
            const { roomId } = req.params;
            const { userId: targetUserId, message } = req.body;
            const inviterUserId = req.user.userId;

            const room = await Room.findByUuid(roomId, inviterUserId);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            // 檢查邀請者是否為房間成員
            if (!room.userRole) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只有房間成員可以邀請他人',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            // 檢查目標用戶是否存在
            const targetUser = await User.findByUuid(targetUserId);
            if (!targetUser) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            // 檢查目標用戶是否已經是成員
            const existingMember = await database.get(
                'SELECT 1 FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, targetUserId]
            );

            if (existingMember) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: '用戶已經是房間成員',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 創建邀請通知
            const notificationUuid = require('uuid').v4();
            await database.run(
                `INSERT INTO notifications (uuid, user_uuid, type, title, content, data, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    notificationUuid,
                    targetUserId,
                    'room_invite',
                    '房間邀請',
                    `${req.user.username} 邀請您加入房間 "${room.name}"`,
                    JSON.stringify({
                        roomId,
                        roomName: room.name,
                        inviterId: inviterUserId,
                        inviterName: req.user.username,
                        message
                    })
                ]
            );

            // 通過 WebSocket 發送邀請通知
            const io = req.app.get('io');
            if (io) {
                io.to(`user:${targetUserId}`).emit('room_invitation', {
                    id: notificationUuid,
                    roomId,
                    roomName: room.name,
                    inviterName: req.user.username,
                    message,
                    timestamp: new Date().toISOString()
                });
            }

            logger.info('房間邀請發送', {
                roomId,
                inviterUserId,
                targetUserId,
                roomName: room.name
            });

            res.json({
                success: true,
                message: '邀請已發送'
            });

        } catch (error) {
            logger.error('發送房間邀請失敗', {
                error: error.message,
                roomId: req.params.roomId,
                targetUserId: req.body.userId,
                inviterUserId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '發送邀請失敗'
            });
        }
    }

    // 獲取公開房間列表
    static async getPublicRooms(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const userId = req.user.userId;

            const result = await Room.search(
                null,
                ROOM_TYPES.PUBLIC,
                parseInt(page),
                parseInt(limit),
                userId
            );

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('獲取公開房間列表失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取房間列表失敗'
            });
        }
    }
}

module.exports = RoomController;