const database = require('../config/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { ROOM_TYPES, ROOM_ROLES, ENCRYPTION, SYSTEM } = require('../config/constants');

class Room {
    constructor(data = {}) {
        this.id = data.id;
        this.uuid = data.uuid;
        this.name = data.name;
        this.description = data.description;
        this.type = data.type || ROOM_TYPES.PUBLIC;
        this.password = data.password;
        this.avatar = data.avatar;
        this.maxMembers = data.max_members || 100;
        this.createdBy = data.created_by;
        this.createdAt = data.created_at;
        this.updatedAt = data.updated_at;

        // 額外信息
        this.memberCount = data.member_count;
        this.onlineCount = data.online_count;
        this.lastMessage = data.last_message;
        this.userRole = data.user_role; // 當前用戶在房間中的角色
    }

    // 創建新房間
    static async create(roomData, creatorUuid) {
        try {
            const {
                name,
                description = null,
                type = ROOM_TYPES.PUBLIC,
                password = null,
                avatar = null,
                maxMembers = 100
            } = roomData;

            // 驗證房間名稱
            if (!name || name.trim().length === 0) {
                throw new Error('Room name is required');
            }

            if (name.length > 100) {
                throw new Error('Room name cannot exceed 100 characters');
            }

            // 驗證房間類型
            if (!Object.values(ROOM_TYPES).includes(type)) {
                throw new Error('Invalid room type');
            }

            // 驗證最大成員數
            if (maxMembers < 2 || maxMembers > SYSTEM.MAX_ROOM_MEMBERS) {
                throw new Error(`Max members must be between 2 and ${SYSTEM.MAX_ROOM_MEMBERS}`);
            }

            // 檢查用戶創建的房間數量限制
            const userRoomCount = await database.get(
                'SELECT COUNT(*) as count FROM rooms WHERE created_by = ?',
                [creatorUuid]
            );

            if (userRoomCount.count >= SYSTEM.MAX_ROOMS_PER_USER) {
                throw new Error(`Cannot create more than ${SYSTEM.MAX_ROOMS_PER_USER} rooms`);
            }

            const roomUuid = uuidv4();
            let hashedPassword = null;

            // 加密密碼（如果提供）
            if (password && type === ROOM_TYPES.PRIVATE) {
                hashedPassword = await bcrypt.hash(password, ENCRYPTION.BCRYPT_ROUNDS);
            }

            // 生成默認頭像
            const defaultAvatar = avatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${name}`;

            // 開始事務
            await database.beginTransaction();

            try {
                // 創建房間
                await database.run(
                    `INSERT INTO rooms (uuid, name, description, type, password, avatar, max_members, created_by, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [roomUuid, name.trim(), description, type, hashedPassword, defaultAvatar, maxMembers, creatorUuid]
                );

                // 添加創建者為房間所有者
                await database.run(
                    `INSERT INTO room_members (room_uuid, user_uuid, role, joined_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                    [roomUuid, creatorUuid, ROOM_ROLES.OWNER]
                );

                await database.commit();

                logger.info('Room created successfully', {
                    roomId: roomUuid,
                    name,
                    type,
                    createdBy: creatorUuid
                });

                // 返回新創建的房間
                return await Room.findByUuid(roomUuid, creatorUuid);

            } catch (error) {
                await database.rollback();
                throw error;
            }

        } catch (error) {
            logger.error('Failed to create room', {
                error: error.message,
                roomData,
                creatorUuid
            });
            throw error;
        }
    }

    // 通過UUID查找房間
    static async findByUuid(uuid, userId = null) {
        try {
            let query = `
                SELECT r.*, 
                       COUNT(rm.user_uuid) as member_count,
                       COUNT(CASE WHEN u.status = 'online' THEN 1 END) as online_count,
                       creator.username as creator_username
                FROM rooms r
                LEFT JOIN room_members rm ON r.uuid = rm.room_uuid
                LEFT JOIN users u ON rm.user_uuid = u.uuid
                LEFT JOIN users creator ON r.created_by = creator.uuid
                WHERE r.uuid = ?
                GROUP BY r.uuid
            `;

            const room = await database.get(query, [uuid]);

            if (!room) {
                return null;
            }

            // 如果提供了用戶ID，獲取用戶在房間中的角色
            if (userId) {
                const membership = await database.get(
                    'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                    [uuid, userId]
                );

                if (membership) {
                    room.user_role = membership.role;
                }
            }

            // 獲取最後一條消息
            const lastMessage = await database.get(
                `SELECT m.content, m.message_type, m.created_at, u.username as sender_username
                 FROM messages m
                 LEFT JOIN users u ON m.sender_uuid = u.uuid
                 WHERE m.room_uuid = ? AND m.deleted_at IS NULL
                 ORDER BY m.created_at DESC
                 LIMIT 1`,
                [uuid]
            );

            if (lastMessage) {
                room.last_message = lastMessage;
            }

            return new Room(room);

        } catch (error) {
            logger.error('Failed to find room by UUID', { error: error.message, uuid });
            throw error;
        }
    }

    // 搜索房間
    static async search(query, type = null, page = 1, limit = 20, userId = null) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = "WHERE r.type IN ('public', 'group')";
            let params = [];

            // 添加搜索條件
            if (query) {
                whereClause += ' AND (r.name LIKE ? OR r.description LIKE ?)';
                params.push(`%${query}%`, `%${query}%`);
            }

            // 添加類型篩選
            if (type && Object.values(ROOM_TYPES).includes(type)) {
                whereClause += ' AND r.type = ?';
                params.push(type);
            }

            // 獲取總數
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM rooms r ${whereClause}`,
                params
            );

            // 獲取房間列表
            const rooms = await database.query(
                `SELECT r.*, 
                        COUNT(rm.user_uuid) as member_count,
                        COUNT(CASE WHEN u.status = 'online' THEN 1 END) as online_count,
                        creator.username as creator_username,
                        ${userId ? `user_rm.role as user_role` : 'NULL as user_role'}
                 FROM rooms r
                 LEFT JOIN room_members rm ON r.uuid = rm.room_uuid
                 LEFT JOIN users u ON rm.user_uuid = u.uuid
                 LEFT JOIN users creator ON r.created_by = creator.uuid
                 ${userId ? 'LEFT JOIN room_members user_rm ON r.uuid = user_rm.room_uuid AND user_rm.user_uuid = ?' : ''}
                 ${whereClause}
                 GROUP BY r.uuid
                 ORDER BY r.created_at DESC
                 LIMIT ? OFFSET ?`,
                userId ? [userId, ...params, limit, offset] : [...params, limit, offset]
            );

            return {
                rooms: rooms.map(room => new Room(room)),
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to search rooms', {
                error: error.message,
                query,
                type,
                page,
                limit
            });
            throw error;
        }
    }

    // 獲取用戶的房間列表
    static async getUserRooms(userId, page = 1, limit = 20) {
        try {
            const offset = (page - 1) * limit;

            // 獲取總數
            const countResult = await database.get(
                'SELECT COUNT(*) as total FROM room_members WHERE user_uuid = ?',
                [userId]
            );

            // 獲取房間列表
            const rooms = await database.query(
                `SELECT r.*, 
                        rm.role as user_role,
                        rm.joined_at,
                        COUNT(all_rm.user_uuid) as member_count,
                        COUNT(CASE WHEN u.status = 'online' THEN 1 END) as online_count
                 FROM room_members rm
                 JOIN rooms r ON rm.room_uuid = r.uuid
                 LEFT JOIN room_members all_rm ON r.uuid = all_rm.room_uuid
                 LEFT JOIN users u ON all_rm.user_uuid = u.uuid
                 WHERE rm.user_uuid = ?
                 GROUP BY r.uuid
                 ORDER BY rm.joined_at DESC
                 LIMIT ? OFFSET ?`,
                [userId, limit, offset]
            );

            // 為每個房間獲取最後一條消息
            for (const room of rooms) {
                const lastMessage = await database.get(
                    `SELECT m.content, m.message_type, m.created_at, u.username as sender_username
                     FROM messages m
                     LEFT JOIN users u ON m.sender_uuid = u.uuid
                     WHERE m.room_uuid = ? AND m.deleted_at IS NULL
                     ORDER BY m.created_at DESC
                     LIMIT 1`,
                    [room.uuid]
                );

                if (lastMessage) {
                    room.last_message = lastMessage;
                }
            }

            return {
                rooms: rooms.map(room => new Room(room)),
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to get user rooms', {
                error: error.message,
                userId,
                page,
                limit
            });
            throw error;
        }
    }

    // 加入房間
    async join(userId, password = null) {
        try {
            // 檢查是否已經是成員
            const existingMember = await database.get(
                'SELECT 1 FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, userId]
            );

            if (existingMember) {
                throw new Error('User is already a member of this room');
            }

            // 檢查房間是否已滿
            const memberCount = await database.get(
                'SELECT COUNT(*) as count FROM room_members WHERE room_uuid = ?',
                [this.uuid]
            );

            if (memberCount.count >= this.maxMembers) {
                throw new Error('Room is full');
            }

            // 檢查私有房間密碼
            if (this.type === ROOM_TYPES.PRIVATE && this.password) {
                if (!password) {
                    throw new Error('Password is required for private room');
                }

                const isPasswordValid = await bcrypt.compare(password, this.password);
                if (!isPasswordValid) {
                    throw new Error('Invalid room password');
                }
            }

            // 添加成員
            await database.run(
                `INSERT INTO room_members (room_uuid, user_uuid, role, joined_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [this.uuid, userId, ROOM_ROLES.MEMBER]
            );

            logger.info('User joined room', {
                roomId: this.uuid,
                userId,
                roomName: this.name
            });

            return true;

        } catch (error) {
            logger.error('Failed to join room', {
                error: error.message,
                roomId: this.uuid,
                userId
            });
            throw error;
        }
    }

    // 離開房間
    async leave(userId) {
        try {
            // 檢查是否是成員
            const membership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, userId]
            );

            if (!membership) {
                throw new Error('User is not a member of this room');
            }

            // 如果是房間所有者，需要轉移所有權或刪除房間
            if (membership.role === ROOM_ROLES.OWNER) {
                const memberCount = await database.get(
                    'SELECT COUNT(*) as count FROM room_members WHERE room_uuid = ?',
                    [this.uuid]
                );

                if (memberCount.count > 1) {
                    // 轉移所有權給最早加入的管理員或成員
                    const newOwner = await database.get(
                        `SELECT user_uuid FROM room_members 
                         WHERE room_uuid = ? AND user_uuid != ? 
                         ORDER BY 
                            CASE WHEN role = 'admin' THEN 1 
                                 WHEN role = 'moderator' THEN 2 
                                 ELSE 3 END, joined_at ASC
                         LIMIT 1`,
                        [this.uuid, userId]
                    );

                    if (newOwner) {
                        await database.run(
                            'UPDATE room_members SET role = ? WHERE room_uuid = ? AND user_uuid = ?',
                            [ROOM_ROLES.OWNER, this.uuid, newOwner.user_uuid]
                        );

                        logger.info('Room ownership transferred', {
                            roomId: this.uuid,
                            fromUserId: userId,
                            toUserId: newOwner.user_uuid
                        });
                    }
                } else {
                    // 房間只有所有者一人，刪除房間
                    await this.delete();
                    return { roomDeleted: true };
                }
            }

            // 移除成員
            await database.run(
                'DELETE FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, userId]
            );

            logger.info('User left room', {
                roomId: this.uuid,
                userId,
                roomName: this.name
            });

            return { success: true };

        } catch (error) {
            logger.error('Failed to leave room', {
                error: error.message,
                roomId: this.uuid,
                userId
            });
            throw error;
        }
    }

    // 踢出成員
    async kickMember(targetUserId, kickerUserId) {
        try {
            // 檢查踢出者權限
            const kickerMembership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, kickerUserId]
            );

            if (!kickerMembership || !['owner', 'admin', 'moderator'].includes(kickerMembership.role)) {
                throw new Error('Insufficient permissions to kick members');
            }

            // 檢查目標成員
            const targetMembership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, targetUserId]
            );

            if (!targetMembership) {
                throw new Error('Target user is not a member of this room');
            }

            // 不能踢出所有者
            if (targetMembership.role === ROOM_ROLES.OWNER) {
                throw new Error('Cannot kick room owner');
            }

            // 檢查權限層級
            const roleHierarchy = {
                'owner': 4,
                'admin': 3,
                'moderator': 2,
                'member': 1
            };

            if (roleHierarchy[targetMembership.role] >= roleHierarchy[kickerMembership.role]) {
                throw new Error('Cannot kick member with equal or higher permissions');
            }

            // 移除成員
            await database.run(
                'DELETE FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, targetUserId]
            );

            logger.info('Member kicked from room', {
                roomId: this.uuid,
                targetUserId,
                kickerUserId,
                roomName: this.name
            });

            return true;

        } catch (error) {
            logger.error('Failed to kick member', {
                error: error.message,
                roomId: this.uuid,
                targetUserId,
                kickerUserId
            });
            throw error;
        }
    }

    // 更新成員角色
    async updateMemberRole(targetUserId, newRole, updaterUserId) {
        try {
            // 驗證新角色
            if (!Object.values(ROOM_ROLES).includes(newRole)) {
                throw new Error('Invalid role');
            }

            // 檢查更新者權限
            const updaterMembership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, updaterUserId]
            );

            if (!updaterMembership || updaterMembership.role !== ROOM_ROLES.OWNER) {
                throw new Error('Only room owner can update member roles');
            }

            // 檢查目標成員
            const targetMembership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, targetUserId]
            );

            if (!targetMembership) {
                throw new Error('Target user is not a member of this room');
            }

            // 不能更改所有者角色
            if (targetMembership.role === ROOM_ROLES.OWNER || newRole === ROOM_ROLES.OWNER) {
                throw new Error('Cannot change owner role');
            }

            // 更新角色
            await database.run(
                'UPDATE room_members SET role = ? WHERE room_uuid = ? AND user_uuid = ?',
                [newRole, this.uuid, targetUserId]
            );

            logger.info('Member role updated', {
                roomId: this.uuid,
                targetUserId,
                updaterUserId,
                oldRole: targetMembership.role,
                newRole
            });

            return true;

        } catch (error) {
            logger.error('Failed to update member role', {
                error: error.message,
                roomId: this.uuid,
                targetUserId,
                newRole,
                updaterUserId
            });
            throw error;
        }
    }

    // 獲取房間成員
    async getMembers(page = 1, limit = 50) {
        try {
            const offset = (page - 1) * limit;

            // 獲取總數
            const countResult = await database.get(
                'SELECT COUNT(*) as total FROM room_members WHERE room_uuid = ?',
                [this.uuid]
            );

            // 獲取成員列表
            const members = await database.query(
                `SELECT rm.*, u.uuid, u.username, u.avatar, u.status, u.last_seen
                 FROM room_members rm
                 JOIN users u ON rm.user_uuid = u.uuid
                 WHERE rm.room_uuid = ?
                 ORDER BY 
                    CASE rm.role 
                        WHEN 'owner' THEN 1 
                        WHEN 'admin' THEN 2 
                        WHEN 'moderator' THEN 3 
                        ELSE 4 
                    END, rm.joined_at ASC
                 LIMIT ? OFFSET ?`,
                [this.uuid, limit, offset]
            );

            return {
                members,
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to get room members', {
                error: error.message,
                roomId: this.uuid
            });
            throw error;
        }
    }

    // 更新房間信息
    async update(updateData, updaterUserId) {
        try {
            // 檢查權限
            const membership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, updaterUserId]
            );

            if (!membership || !['owner', 'admin'].includes(membership.role)) {
                throw new Error('Insufficient permissions to update room');
            }

            const allowedFields = ['name', 'description', 'avatar', 'maxMembers'];
            const updates = [];
            const values = [];

            // 只更新允許的字段
            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    if (key === 'name') {
                        if (!value || value.trim().length === 0) {
                            throw new Error('Room name cannot be empty');
                        }
                        if (value.length > 100) {
                            throw new Error('Room name cannot exceed 100 characters');
                        }
                        updates.push('name = ?');
                        values.push(value.trim());
                    } else if (key === 'description') {
                        if (value && value.length > 500) {
                            throw new Error('Description cannot exceed 500 characters');
                        }
                        updates.push('description = ?');
                        values.push(value);
                    } else if (key === 'maxMembers') {
                        if (value < 2 || value > SYSTEM.MAX_ROOM_MEMBERS) {
                            throw new Error(`Max members must be between 2 and ${SYSTEM.MAX_ROOM_MEMBERS}`);
                        }
                        updates.push('max_members = ?');
                        values.push(value);
                    } else {
                        updates.push(`${key} = ?`);
                        values.push(value);
                    }
                }
            }

            if (updates.length === 0) {
                throw new Error('No valid fields to update');
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(this.uuid);

            await database.run(
                `UPDATE rooms SET ${updates.join(', ')} WHERE uuid = ?`,
                values
            );

            // 更新實例屬性
            Object.assign(this, updateData);
            this.updatedAt = new Date().toISOString();

            logger.info('Room updated successfully', {
                roomId: this.uuid,
                updaterUserId,
                updatedFields: Object.keys(updateData)
            });

            return this;

        } catch (error) {
            logger.error('Failed to update room', {
                error: error.message,
                roomId: this.uuid,
                updateData,
                updaterUserId
            });
            throw error;
        }
    }

    // 更改房間密碼
    async updatePassword(newPassword, updaterUserId) {
        try {
            // 檢查權限
            const membership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, updaterUserId]
            );

            if (!membership || membership.role !== ROOM_ROLES.OWNER) {
                throw new Error('Only room owner can change password');
            }

            // 只有私有房間可以設置密碼
            if (this.type !== ROOM_TYPES.PRIVATE) {
                throw new Error('Password can only be set for private rooms');
            }

            let hashedPassword = null;
            if (newPassword) {
                if (newPassword.length < 4 || newPassword.length > 50) {
                    throw new Error('Password must be between 4 and 50 characters');
                }
                hashedPassword = await bcrypt.hash(newPassword, ENCRYPTION.BCRYPT_ROUNDS);
            }

            await database.run(
                'UPDATE rooms SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [hashedPassword, this.uuid]
            );

            this.password = hashedPassword;

            logger.info('Room password updated', {
                roomId: this.uuid,
                updaterUserId,
                passwordSet: !!newPassword
            });

            return true;

        } catch (error) {
            logger.error('Failed to update room password', {
                error: error.message,
                roomId: this.uuid,
                updaterUserId
            });
            throw error;
        }
    }

    // 刪除房間
    async delete(deleterUserId = null) {
        try {
            // 檢查權限（如果提供了用戶ID）
            if (deleterUserId) {
                const membership = await database.get(
                    'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                    [this.uuid, deleterUserId]
                );

                if (!membership || membership.role !== ROOM_ROLES.OWNER) {
                    throw new Error('Only room owner can delete room');
                }
            }

            // 開始事務
            await database.beginTransaction();

            try {
                // 刪除房間成員
                await database.run(
                    'DELETE FROM room_members WHERE room_uuid = ?',
                    [this.uuid]
                );

                // 軟刪除消息（保留聊天記錄）
                await database.run(
                    'UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE room_uuid = ? AND deleted_at IS NULL',
                    [this.uuid]
                );

                // 刪除房間
                await database.run(
                    'DELETE FROM rooms WHERE uuid = ?',
                    [this.uuid]
                );

                await database.commit();

                logger.info('Room deleted successfully', {
                    roomId: this.uuid,
                    roomName: this.name,
                    deleterUserId
                });

                return true;

            } catch (error) {
                await database.rollback();
                throw error;
            }

        } catch (error) {
            logger.error('Failed to delete room', {
                error: error.message,
                roomId: this.uuid,
                deleterUserId
            });
            throw error;
        }
    }

    // 檢查用戶權限
    async checkUserPermission(userId, requiredRole = ROOM_ROLES.MEMBER) {
        try {
            const membership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, userId]
            );

            if (!membership) {
                return false;
            }

            const roleHierarchy = {
                'member': 1,
                'moderator': 2,
                'admin': 3,
                'owner': 4
            };

            return roleHierarchy[membership.role] >= roleHierarchy[requiredRole];

        } catch (error) {
            logger.error('Failed to check user permission', {
                error: error.message,
                roomId: this.uuid,
                userId,
                requiredRole
            });
            return false;
        }
    }

    // 靜音成員
    async muteMember(targetUserId, muterUserId, duration = null) {
        try {
            // 檢查權限
            const canMute = await this.checkUserPermission(muterUserId, ROOM_ROLES.MODERATOR);
            if (!canMute) {
                throw new Error('Insufficient permissions to mute members');
            }

            // 檢查目標成員
            const targetMembership = await database.get(
                'SELECT role FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, targetUserId]
            );

            if (!targetMembership) {
                throw new Error('Target user is not a member of this room');
            }

            // 計算靜音結束時間
            let mutedUntil = null;
            if (duration) {
                mutedUntil = new Date(Date.now() + duration * 60 * 1000).toISOString(); // duration in minutes
            }

            await database.run(
                'UPDATE room_members SET muted_until = ? WHERE room_uuid = ? AND user_uuid = ?',
                [mutedUntil, this.uuid, targetUserId]
            );

            logger.info('Member muted', {
                roomId: this.uuid,
                targetUserId,
                muterUserId,
                duration,
                mutedUntil
            });

            return true;

        } catch (error) {
            logger.error('Failed to mute member', {
                error: error.message,
                roomId: this.uuid,
                targetUserId,
                muterUserId
            });
            throw error;
        }
    }

    // 取消靜音
    async unmuteMember(targetUserId, unmuterUserId) {
        try {
            // 檢查權限
            const canUnmute = await this.checkUserPermission(unmuterUserId, ROOM_ROLES.MODERATOR);
            if (!canUnmute) {
                throw new Error('Insufficient permissions to unmute members');
            }

            await database.run(
                'UPDATE room_members SET muted_until = NULL WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, targetUserId]
            );

            logger.info('Member unmuted', {
                roomId: this.uuid,
                targetUserId,
                unmuterUserId
            });

            return true;

        } catch (error) {
            logger.error('Failed to unmute member', {
                error: error.message,
                roomId: this.uuid,
                targetUserId,
                unmuterUserId
            });
            throw error;
        }
    }

    // 檢查成員是否被靜音
    async isMemberMuted(userId) {
        try {
            const membership = await database.get(
                'SELECT muted_until FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [this.uuid, userId]
            );

            if (!membership || !membership.muted_until) {
                return false;
            }

            const mutedUntil = new Date(membership.muted_until);
            const now = new Date();

            // 如果靜音已過期，自動取消靜音
            if (now > mutedUntil) {
                await this.unmuteMember(userId, userId); // 系統自動取消
                return false;
            }

            return true;

        } catch (error) {
            logger.error('Failed to check if member is muted', {
                error: error.message,
                roomId: this.uuid,
                userId
            });
            return false;
        }
    }

    // 獲取房間統計信息
    async getStats() {
        try {
            const stats = await database.get(
                `SELECT 
                    COUNT(DISTINCT rm.user_uuid) as totalMembers,
                    COUNT(DISTINCT CASE WHEN u.status = 'online' THEN rm.user_uuid END) as onlineMembers,
                    COUNT(DISTINCT m.uuid) as totalMessages,
                    COUNT(DISTINCT CASE WHEN m.created_at > datetime('now', '-24 hours') THEN m.uuid END) as todayMessages
                 FROM room_members rm
                 LEFT JOIN users u ON rm.user_uuid = u.uuid
                 LEFT JOIN messages m ON rm.room_uuid = m.room_uuid AND m.deleted_at IS NULL
                 WHERE rm.room_uuid = ?`,
                [this.uuid]
            );

            return {
                totalMembers: stats.totalMembers || 0,
                onlineMembers: stats.onlineMembers || 0,
                totalMessages: stats.totalMessages || 0,
                todayMessages: stats.todayMessages || 0,
                createdAt: this.createdAt
            };

        } catch (error) {
            logger.error('Failed to get room stats', {
                error: error.message,
                roomId: this.uuid
            });
            throw error;
        }
    }

    // 轉換為JSON格式
    toJSON() {
        const roomObj = { ...this };
        delete roomObj.password; // 不返回密碼
        return roomObj;
    }

    // 轉換為公開信息（用於搜索結果）
    toPublic() {
        return {
            uuid: this.uuid,
            name: this.name,
            description: this.description,
            type: this.type,
            avatar: this.avatar,
            memberCount: this.memberCount,
            onlineCount: this.onlineCount,
            maxMembers: this.maxMembers,
            hasPassword: !!this.password,
            createdAt: this.createdAt
        };
    }
}

module.exports = Room;