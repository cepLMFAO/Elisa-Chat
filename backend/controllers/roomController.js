const Room = require('../models/room');
const User = require('../models/User');
const database = require('../config/database');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, ROOM_TYPES, ROOM_ROLES } = require('../config/constants');
const Validators = require('../utils/validators');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

class RoomController {
    // 記錄房間活動日誌
    static async logRoomActivity(roomId, userId, action, data = {}) {
        try {
            await database.run(`
                INSERT INTO room_activity_logs (
                    uuid, room_uuid, user_uuid, action, data, created_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [uuidv4(), roomId, userId, action, JSON.stringify(data)]);
        } catch (error) {
            logger.error('記錄房間活動失敗', {
                error: error.message,
                roomId,
                userId,
                action
            });
        }
    }

    // 創建房間
    static async createRoom(req, res) {
        try {
            const { name, description, type, password, maxMembers } = req.body;
            const userId = req.user.uuid;

            // 驗證房間名稱
            const nameValidation = Validators.validateRoomName(name);
            if (!nameValidation.isValid) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: nameValidation.errors[0],
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 檢查用戶創建的房間數量限制
            const userRoomCount = await database.get(`
                SELECT COUNT(*) as count FROM rooms 
                WHERE owner_uuid = ? AND is_active = 1
            `, [userId]);

            const maxRoomsPerUser = process.env.MAX_ROOMS_PER_USER || 10;
            if (userRoomCount.count >= maxRoomsPerUser) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: `每個用戶最多只能創建 ${maxRoomsPerUser} 個房間`,
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            const roomData = {
                uuid: uuidv4(),
                name: nameValidation.sanitized,
                description: description?.trim() || null,
                type: type || 'public',
                maxMembers: maxMembers || 100,
                ownerUuid: userId,
                isActive: true
            };

            // 如果有密碼，進行加密
            if (password) {
                roomData.passwordHash = await bcrypt.hash(password, 10);
            }

            // 創建房間
            await database.run(`
                INSERT INTO rooms (
                    uuid, name, description, type, max_members, 
                    password_hash, owner_uuid, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [
                roomData.uuid, roomData.name, roomData.description,
                roomData.type, roomData.maxMembers, roomData.passwordHash,
                roomData.ownerUuid, roomData.isActive
            ]);

            // 將創建者加入房間並設為管理員
            await database.run(`
                INSERT INTO room_members (
                    room_uuid, user_uuid, role, joined_at, last_read_at
                ) VALUES (?, ?, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [roomData.uuid, userId]);

            // 記錄日誌
            await this.logRoomActivity(roomData.uuid, userId, 'create_room', {
                roomName: roomData.name,
                roomType: roomData.type
            });

            logger.info('房間創建成功', {
                roomId: roomData.uuid,
                roomName: roomData.name,
                creatorId: userId
            });

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: '房間創建成功',
                data: {
                    room: {
                        uuid: roomData.uuid,
                        name: roomData.name,
                        description: roomData.description,
                        type: roomData.type,
                        maxMembers: roomData.maxMembers,
                        memberCount: 1,
                        userRole: 'admin'
                    }
                }
            });

        } catch (error) {
            logger.error('創建房間失敗', {
                error: error.message,
                roomData: req.body,
                userId: req.user?.uuid
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '創建房間失敗';

            if (error.message.includes('UNIQUE constraint failed')) {
                statusCode = HTTP_STATUS.CONFLICT;
                errorMessage = '房間名稱已存在';
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
            const userId = req.user.uuid;

            const room = await database.get(`
                SELECT 
                    r.*,
                    rm.role as user_role,
                    rm.is_muted,
                    rm.muted_until,
                    u.username as owner_username,
                    (SELECT COUNT(*) FROM room_members WHERE room_uuid = r.uuid) as member_count
                FROM rooms r
                LEFT JOIN room_members rm ON r.uuid = rm.room_uuid AND rm.user_uuid = ?
                LEFT JOIN users u ON r.owner_uuid = u.uuid
                WHERE r.uuid = ? AND r.is_active = 1
            `, [userId, roomId]);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            // 如果是私有房間，檢查用戶是否為成員
            if (room.type === 'private' && !room.user_role) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權查看此房間',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            // 不返回密碼hash
            delete room.password_hash;

            res.json({
                success: true,
                data: {
                    room: {
                        ...room,
                        hasPassword: !!room.password_hash,
                        isMember: !!room.user_role
                    }
                }
            });

        } catch (error) {
            logger.error('獲取房間信息失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取房間信息失敗'
            });
        }
    }

    // 加入房間
    static async joinRoom(req, res) {
        try {
            const { roomId } = req.params;
            const { password } = req.body;
            const userId = req.user.uuid;

            const room = await database.get(`
                SELECT * FROM rooms WHERE uuid = ? AND is_active = 1
            `, [roomId]);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            // 檢查是否已經是成員
            const existingMember = await database.get(`
                SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?
            `, [roomId, userId]);

            if (existingMember) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: '已經是房間成員',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 檢查房間是否已滿
            const memberCount = await database.get(`
                SELECT COUNT(*) as count FROM room_members WHERE room_uuid = ?
            `, [roomId]);

            if (memberCount.count >= room.max_members) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '房間已滿',
                    code: ERROR_CODES.ROOM_FULL
                });
            }

            // 檢查密碼
            if (room.password_hash) {
                if (!password) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        error: '此房間需要密碼',
                        code: ERROR_CODES.VALIDATION_ERROR
                    });
                }

                const isPasswordValid = await bcrypt.compare(password, room.password_hash);
                if (!isPasswordValid) {
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                        success: false,
                        error: '房間密碼錯誤',
                        code: ERROR_CODES.INVALID_CREDENTIALS
                    });
                }
            }

            // 加入房間
            await database.run(`
                INSERT INTO room_members (
                    room_uuid, user_uuid, role, joined_at, last_read_at
                ) VALUES (?, ?, 'member', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [roomId, userId]);

            // 記錄日誌
            await this.logRoomActivity(roomId, userId, 'join_room');

            logger.info('用戶加入房間', {
                roomId,
                userId,
                roomName: room.name
            });

            res.json({
                success: true,
                message: '成功加入房間'
            });

        } catch (error) {
            logger.error('加入房間失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '加入房間失敗'
            });
        }
    }

    // 離開房間
    static async leaveRoom(req, res) {
        try {
            const { roomId } = req.params;
            const userId = req.user.uuid;

            const room = await database.get(`
                SELECT * FROM rooms WHERE uuid = ? AND is_active = 1
            `, [roomId]);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            const membership = await database.get(`
                SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?
            `, [roomId, userId]);

            if (!membership) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '您不是此房間的成員',
                    code: ERROR_CODES.NOT_ROOM_MEMBER
                });
            }

            // 房間所有者不能離開房間
            if (room.owner_uuid === userId) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '房間所有者不能離開房間，請轉讓所有權或刪除房間',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            // 離開房間
            await database.run(`
                DELETE FROM room_members WHERE room_uuid = ? AND user_uuid = ?
            `, [roomId, userId]);

            // 記錄日誌
            await this.logRoomActivity(roomId, userId, 'leave_room');

            logger.info('用戶離開房間', {
                roomId,
                userId,
                roomName: room.name
            });

            res.json({
                success: true,
                message: '成功離開房間'
            });

        } catch (error) {
            logger.error('離開房間失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '離開房間失敗'
            });
        }
    }

    // 獲取房間邀請鏈接
    static async getRoomInviteLink(req, res) {
        try {
            const { roomId } = req.params;
            const userId = req.user.uuid;

            // 檢查權限
            const membership = await database.get(`
                SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?
            `, [roomId, userId]);

            if (!membership) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只有房間成員才能獲取邀請鏈接',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            const room = await database.get(`
                SELECT type, invite_code FROM rooms WHERE uuid = ?
            `, [roomId]);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '房間不存在',
                    code: ERROR_CODES.ROOM_NOT_FOUND
                });
            }

            // 如果是私有房間，只有管理員和版主可以獲取邀請鏈接
            if (room.type === 'private' && !['admin', 'moderator'].includes(membership.role)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只有管理員和版主才能獲取私有房間的邀請鏈接',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            // 如果沒有邀請碼，生成一個
            let inviteCode = room.invite_code;
            if (!inviteCode) {
                inviteCode = uuidv4().substring(0, 8);
                await database.run(`
                    UPDATE rooms SET invite_code = ? WHERE uuid = ?
                `, [inviteCode, roomId]);
            }

            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const inviteLink = `${baseUrl}/invite/${inviteCode}`;

            res.json({
                success: true,
                data: {
                    invite_code: inviteCode,
                    invite_link: inviteLink,
                    expires_at: null // 邀請鏈接永不過期，可根據需要調整
                }
            });

        } catch (error) {
            logger.error('獲取房間邀請鏈接失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取邀請鏈接失敗'
            });
        }
    }

    // 通過邀請碼加入房間
    static async joinRoomByInvite(req, res) {
        try {
            const { inviteCode } = req.params;
            const userId = req.user.uuid;

            const room = await database.get(`
                SELECT uuid, name, type, max_members FROM rooms 
                WHERE invite_code = ? AND is_active = 1
            `, [inviteCode]);

            if (!room) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '邀請碼無效或已過期',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 檢查是否已經是成員
            const existingMember = await database.get(`
                SELECT 1 FROM room_members WHERE room_uuid = ? AND user_uuid = ?
            `, [room.uuid, userId]);

            if (existingMember) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: '您已經是此房間的成員',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 檢查房間是否已滿
            const memberCount = await database.get(`
                SELECT COUNT(*) as count FROM room_members WHERE room_uuid = ?
            `, [room.uuid]);

            if (memberCount.count >= room.max_members) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '房間已滿',
                    code: ERROR_CODES.ROOM_FULL
                });
            }

            // 加入房間
            await database.run(`
                INSERT INTO room_members (
                    room_uuid, user_uuid, role, joined_at, last_read_at
                ) VALUES (?, ?, 'member', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [room.uuid, userId]);

            // 記錄日誌
            await this.logRoomActivity(room.uuid, userId, 'join_by_invite', {
                inviteCode
            });

            logger.info('用戶通過邀請碼加入房間', {
                roomId: room.uuid,
                roomName: room.name,
                userId,
                inviteCode
            });

            res.json({
                success: true,
                message: '成功加入房間',
                data: {
                    room: {
                        uuid: room.uuid,
                        name: room.name,
                        type: room.type
                    }
                }
            });
        } catch (error) {
            logger.error('通過邀請碼加入房間失敗', {
                error: error.message,
                inviteCode: req.params.inviteCode,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '加入房間失敗'
            });
        }
    }
}

module.exports = RoomController;