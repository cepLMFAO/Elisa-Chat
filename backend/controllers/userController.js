const User = require('../models/User');
const database = require('../config/database');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const Validators = require('../utils/validators');

class UserController {
    // 獲取用戶資料
    static async getUser(req, res) {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.uuid;

            const user = await User.findByUuid(userId);

            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            // 如果是查看自己的資料，返回完整信息
            if (userId === currentUserId) {
                res.json({
                    success: true,
                    data: {
                        user: user.toJSON()
                    }
                });
                return;
            }

            // 查看他人資料，返回公開信息
            res.json({
                success: true,
                data: {
                    user: user.toPublic()
                }
            });

        } catch (error) {
            logger.error('獲取用戶資料失敗', {
                error: error.message,
                userId: req.params.userId,
                currentUserId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取用戶資料失敗'
            });
        }
    }

    // 更新用戶資料
    static async updateUser(req, res) {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.uuid;
            const isAdmin = req.user.isAdmin;

            // 檢查權限
            if (userId !== currentUserId && !isAdmin) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只能修改自己的資料',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            const { username, email, displayName, bio, avatar, status } = req.body;
            const updateData = {};

            // 驗證並準備更新數據
            if (username !== undefined) {
                const validation = Validators.validateUsername(username);
                if (!validation.isValid) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        error: validation.errors[0],
                        code: ERROR_CODES.VALIDATION_ERROR
                    });
                }

                // 檢查用戶名是否已被使用
                if (username !== user.username) {
                    const existingUser = await User.findByUsername(username);
                    if (existingUser) {
                        return res.status(HTTP_STATUS.CONFLICT).json({
                            success: false,
                            error: '用戶名已被使用',
                            code: ERROR_CODES.USER_ALREADY_EXISTS
                        });
                    }
                }
                updateData.username = validation.sanitized;
            }

            if (email !== undefined) {
                const validation = Validators.validateEmail(email);
                if (!validation.isValid) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        error: validation.errors[0],
                        code: ERROR_CODES.VALIDATION_ERROR
                    });
                }

                // 檢查郵箱是否已被使用
                if (email !== user.email) {
                    const existingUser = await User.findByEmail(email);
                    if (existingUser) {
                        return res.status(HTTP_STATUS.CONFLICT).json({
                            success: false,
                            error: '郵箱已被使用',
                            code: ERROR_CODES.USER_ALREADY_EXISTS
                        });
                    }
                }
                updateData.email = validation.sanitized;
            }

            if (displayName !== undefined) {
                updateData.displayName = displayName?.trim() || null;
            }

            if (bio !== undefined) {
                updateData.bio = bio?.trim() || null;
            }

            if (avatar !== undefined) {
                updateData.avatar = avatar?.trim() || null;
            }

            if (status !== undefined) {
                updateData.status = status;
            }

            // 執行更新
            const updatedUser = await user.update(updateData);

            res.json({
                success: true,
                message: '資料更新成功',
                data: {
                    user: updatedUser.toJSON()
                }
            });

        } catch (error) {
            logger.error('更新用戶資料失敗', {
                error: error.message,
                userId: req.params.userId,
                updateData: req.body,
                currentUserId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '更新用戶資料失敗'
            });
        }
    }

    // 搜索用戶
    static async searchUsers(req, res) {
        try {
            const { q: query, limit = 10 } = req.query;

            if (!query || query.trim().length < 2) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '搜索關鍵字至少需要2個字符',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const users = await User.search(query.trim(), parseInt(limit));

            res.json({
                success: true,
                data: {
                    users: users.map(user => user.toPublic()),
                    query: query.trim(),
                    count: users.length
                }
            });

        } catch (error) {
            logger.error('搜索用戶失敗', {
                error: error.message,
                query: req.query.q,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '搜索失敗'
            });
        }
    }

    // 獲取用戶統計
    static async getUserStats(req, res) {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.uuid;
            const isAdmin = req.user.isAdmin;

            // 檢查權限
            if (userId !== currentUserId && !isAdmin) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '沒有權限查看此統計',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            // 獲取統計數據
            const stats = await database.get(`
                SELECT 
                    (SELECT COUNT(*) FROM messages WHERE sender_uuid = ?) as messageCount,
                    (SELECT COUNT(*) FROM friends WHERE 
                        (user1_uuid = ? OR user2_uuid = ?) AND status = 'accepted') as friendCount,
                    (SELECT COUNT(*) FROM room_members WHERE user_uuid = ?) as roomCount
            `, [userId, userId, userId, userId]);

            res.json({
                success: true,
                data: {
                    stats: {
                        messageCount: stats.messageCount || 0,
                        friendCount: stats.friendCount || 0,
                        roomCount: stats.roomCount || 0,
                        joinedAt: user.createdAt,
                        lastSeen: user.lastSeenAt,
                        status: user.status
                    }
                }
            });

        } catch (error) {
            logger.error('獲取用戶統計失敗', {
                error: error.message,
                userId: req.params.userId,
                currentUserId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取統計失敗'
            });
        }
    }

    // 獲取所有用戶（管理員）
    static async getAllUsers(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                status,
                role,
                search
            } = req.query;

            const offset = (parseInt(page) - 1) * parseInt(limit);
            let whereConditions = [];
            let params = [];

            // 構建查詢條件
            if (status) {
                whereConditions.push('status = ?');
                params.push(status);
            }

            if (role) {
                whereConditions.push('role = ?');
                params.push(role);
            }

            if (search) {
                whereConditions.push('(username LIKE ? OR email LIKE ? OR displayName LIKE ?)');
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            // 獲取用戶列表
            const users = await database.all(`
                SELECT uuid, username, email, displayName, avatar, status, role, 
                       emailVerified, createdAt, lastSeenAt
                FROM users 
                ${whereClause}
                ORDER BY createdAt DESC
                LIMIT ? OFFSET ?
            `, [...params, parseInt(limit), offset]);

            // 獲取總數
            const countResult = await database.get(`
                SELECT COUNT(*) as total FROM users ${whereClause}
            `, params);

            res.json({
                success: true,
                data: {
                    users,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: countResult.total,
                        pages: Math.ceil(countResult.total / parseInt(limit))
                    }
                }
            });

        } catch (error) {
            logger.error('獲取用戶列表失敗', {
                error: error.message,
                query: req.query,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取用戶列表失敗'
            });
        }
    }

    // 更新用戶狀態
    static async updateUserStatus(req, res) {
        try {
            const { status } = req.body;
            const userId = req.user.uuid;

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            await user.update({ status });

            res.json({
                success: true,
                message: '狀態更新成功',
                data: {
                    status
                }
            });

        } catch (error) {
            logger.error('更新用戶狀態失敗', {
                error: error.message,
                status: req.body.status,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '更新狀態失敗'
            });
        }
    }

    // 發送好友請求
    static async sendFriendRequest(req, res) {
        try {
            const { userId: targetUserId } = req.body;
            const currentUserId = req.user.uuid;

            // 不能加自己為好友
            if (targetUserId === currentUserId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '不能添加自己為好友',
                    code: ERROR_CODES.VALIDATION_ERROR
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

            // 檢查是否已經是好友或已有請求
            const existingRelation = await database.get(`
                SELECT * FROM friends 
                WHERE (user1_uuid = ? AND user2_uuid = ?) 
                   OR (user1_uuid = ? AND user2_uuid = ?)
            `, [currentUserId, targetUserId, targetUserId, currentUserId]);

            if (existingRelation) {
                if (existingRelation.status === 'accepted') {
                    return res.status(HTTP_STATUS.CONFLICT).json({
                        success: false,
                        error: '已經是好友',
                        code: ERROR_CODES.VALIDATION_ERROR
                    });
                } else {
                    return res.status(HTTP_STATUS.CONFLICT).json({
                        success: false,
                        error: '好友請求已存在',
                        code: ERROR_CODES.VALIDATION_ERROR
                    });
                }
            }

            // 發送好友請求
            await database.run(`
                INSERT INTO friends (user1_uuid, user2_uuid, status, created_at)
                VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
            `, [currentUserId, targetUserId]);

            res.json({
                success: true,
                message: '好友請求已發送'
            });

        } catch (error) {
            logger.error('發送好友請求失敗', {
                error: error.message,
                targetUserId: req.body.userId,
                currentUserId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '發送好友請求失敗'
            });
        }
    }

    // 處理好友請求
    static async handleFriendRequest(req, res) {
        try {
            const { requestId } = req.params;
            const { action } = req.body; // 'accept' or 'reject'
            const currentUserId = req.user.uuid;

            // 查找好友請求
            const friendRequest = await database.get(`
                SELECT * FROM friends 
                WHERE id = ? AND user2_uuid = ? AND status = 'pending'
            `, [requestId, currentUserId]);

            if (!friendRequest) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '找不到好友請求',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            if (action === 'accept') {
                await database.run(`
                    UPDATE friends 
                    SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [requestId]);

                res.json({
                    success: true,
                    message: '已接受好友請求'
                });
            } else {
                await database.run(`
                    DELETE FROM friends WHERE id = ?
                `, [requestId]);

                res.json({
                    success: true,
                    message: '已拒絕好友請求'
                });
            }

        } catch (error) {
            logger.error('處理好友請求失敗', {
                error: error.message,
                requestId: req.params.requestId,
                action: req.body.action,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '處理好友請求失敗'
            });
        }
    }

    // 獲取好友列表
    static async getFriends(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const userId = req.user.uuid;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            const friends = await database.all(`
                SELECT 
                    f.id,
                    CASE 
                        WHEN f.user1_uuid = ? THEN u2.uuid
                        ELSE u1.uuid
                    END as friendUuid,
                    CASE 
                        WHEN f.user1_uuid = ? THEN u2.username
                        ELSE u1.username
                    END as username,
                    CASE 
                        WHEN f.user1_uuid = ? THEN u2.avatar
                        ELSE u1.avatar
                    END as avatar,
                    CASE 
                        WHEN f.user1_uuid = ? THEN u2.status
                        ELSE u1.status
                    END as status,
                    f.created_at as friendsSince
                FROM friends f
                JOIN users u1 ON f.user1_uuid = u1.uuid
                JOIN users u2 ON f.user2_uuid = u2.uuid
                WHERE (f.user1_uuid = ? OR f.user2_uuid = ?) 
                  AND f.status = 'accepted'
                ORDER BY f.created_at DESC
                LIMIT ? OFFSET ?
            `, [userId, userId, userId, userId, userId, userId, parseInt(limit), offset]);

            // 獲取總數
            const countResult = await database.get(`
                SELECT COUNT(*) as total FROM friends 
                WHERE (user1_uuid = ? OR user2_uuid = ?) AND status = 'accepted'
            `, [userId, userId]);

            res.json({
                success: true,
                data: {
                    friends,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: countResult.total,
                        pages: Math.ceil(countResult.total / parseInt(limit))
                    }
                }
            });

        } catch (error) {
            logger.error('獲取好友列表失敗', {
                error: error.message,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取好友列表失敗'
            });
        }
    }

    // 獲取好友請求列表
    static async getFriendRequests(req, res) {
        try {
            const { type = 'received', page = 1, limit = 20 } = req.query;
            const userId = req.user.uuid;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let query = '';
            let params = [];

            if (type === 'received') {
                query = `
                    SELECT f.id, f.created_at, u.uuid, u.username, u.avatar, u.status
                    FROM friends f
                    JOIN users u ON f.user1_uuid = u.uuid
                    WHERE f.user2_uuid = ? AND f.status = 'pending'
                    ORDER BY f.created_at DESC
                    LIMIT ? OFFSET ?
                `;
                params = [userId, parseInt(limit), offset];
            } else if (type === 'sent') {
                query = `
                    SELECT f.id, f.created_at, u.uuid, u.username, u.avatar, u.status
                    FROM friends f
                    JOIN users u ON f.user2_uuid = u.uuid
                    WHERE f.user1_uuid = ? AND f.status = 'pending'
                    ORDER BY f.created_at DESC
                    LIMIT ? OFFSET ?
                `;
                params = [userId, parseInt(limit), offset];
            } else {
                query = `
                    SELECT f.id, f.created_at, 
                           CASE WHEN f.user1_uuid = ? THEN 'sent' ELSE 'received' END as type,
                           CASE WHEN f.user1_uuid = ? THEN u2.uuid ELSE u1.uuid END as uuid,
                           CASE WHEN f.user1_uuid = ? THEN u2.username ELSE u1.username END as username,
                           CASE WHEN f.user1_uuid = ? THEN u2.avatar ELSE u1.avatar END as avatar,
                           CASE WHEN f.user1_uuid = ? THEN u2.status ELSE u1.status END as status
                    FROM friends f
                    JOIN users u1 ON f.user1_uuid = u1.uuid
                    JOIN users u2 ON f.user2_uuid = u2.uuid
                    WHERE (f.user1_uuid = ? OR f.user2_uuid = ?) AND f.status = 'pending'
                    ORDER BY f.created_at DESC
                    LIMIT ? OFFSET ?
                `;
                params = [userId, userId, userId, userId, userId, userId, userId, parseInt(limit), offset];
            }

            const requests = await database.all(query, params);

            // 獲取總數
            let countQuery = '';
            let countParams = [];

            if (type === 'received') {
                countQuery = `SELECT COUNT(*) as total FROM friends WHERE user2_uuid = ? AND status = 'pending'`;
                countParams = [userId];
            } else if (type === 'sent') {
                countQuery = `SELECT COUNT(*) as total FROM friends WHERE user1_uuid = ? AND status = 'pending'`;
                countParams = [userId];
            } else {
                countQuery = `SELECT COUNT(*) as total FROM friends WHERE (user1_uuid = ? OR user2_uuid = ?) AND status = 'pending'`;
                countParams = [userId, userId];
            }

            const countResult = await database.get(countQuery, countParams);

            res.json({
                success: true,
                data: {
                    requests,
                    type,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: countResult.total,
                        pages: Math.ceil(countResult.total / parseInt(limit))
                    }
                }
            });

        } catch (error) {
            logger.error('獲取好友請求列表失敗', {
                error: error.message,
                type: req.query.type,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取好友請求列表失敗'
            });
        }
    }

    // 刪除好友
    static async removeFriend(req, res) {
        try {
            const { friendId } = req.params;
            const userId = req.user.uuid;

            // 查找好友關係
            const friendship = await database.get(`
                SELECT * FROM friends 
                WHERE ((user1_uuid = ? AND user2_uuid = ?) OR (user1_uuid = ? AND user2_uuid = ?))
                  AND status = 'accepted'
            `, [userId, friendId, friendId, userId]);

            if (!friendship) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '好友關係不存在',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 刪除好友關係
            await database.run(`
                DELETE FROM friends 
                WHERE id = ?
            `, [friendship.id]);

            res.json({
                success: true,
                message: '已刪除好友'
            });

        } catch (error) {
            logger.error('刪除好友失敗', {
                error: error.message,
                friendId: req.params.friendId,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '刪除好友失敗'
            });
        }
    }

    // 封鎖用戶
    static async blockUser(req, res) {
        try {
            const { userId: targetUserId } = req.body;
            const currentUserId = req.user.uuid;

            // 不能封鎖自己
            if (targetUserId === currentUserId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '不能封鎖自己',
                    code: ERROR_CODES.VALIDATION_ERROR
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

            // 檢查是否已經封鎖
            const existingBlock = await database.get(`
                SELECT * FROM blocked_users 
                WHERE blocker_uuid = ? AND blocked_uuid = ?
            `, [currentUserId, targetUserId]);

            if (existingBlock) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: '已經封鎖此用戶',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 執行封鎖
            await database.run(`
                INSERT INTO blocked_users (blocker_uuid, blocked_uuid, created_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `, [currentUserId, targetUserId]);

            // 如果是好友，刪除好友關係
            await database.run(`
                DELETE FROM friends 
                WHERE ((user1_uuid = ? AND user2_uuid = ?) OR (user1_uuid = ? AND user2_uuid = ?))
            `, [currentUserId, targetUserId, targetUserId, currentUserId]);

            res.json({
                success: true,
                message: '用戶已封鎖'
            });

        } catch (error) {
            logger.error('封鎖用戶失敗', {
                error: error.message,
                targetUserId: req.body.userId,
                currentUserId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '封鎖用戶失敗'
            });
        }
    }

    // 解除封鎖
    static async unblockUser(req, res) {
        try {
            const { userId: targetUserId } = req.params;
            const currentUserId = req.user.uuid;

            // 查找封鎖記錄
            const blockRecord = await database.get(`
                SELECT * FROM blocked_users 
                WHERE blocker_uuid = ? AND blocked_uuid = ?
            `, [currentUserId, targetUserId]);

            if (!blockRecord) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '未封鎖此用戶',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 解除封鎖
            await database.run(`
                DELETE FROM blocked_users 
                WHERE blocker_uuid = ? AND blocked_uuid = ?
            `, [currentUserId, targetUserId]);

            res.json({
                success: true,
                message: '已解除封鎖'
            });

        } catch (error) {
            logger.error('解除封鎖失敗', {
                error: error.message,
                targetUserId: req.params.userId,
                currentUserId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '解除封鎖失敗'
            });
        }
    }

    // 獲取封鎖列表
    static async getBlockedUsers(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const userId = req.user.uuid;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            // 獲取封鎖用戶總數
            const countResult = await database.get(`
                SELECT COUNT(*) as total FROM blocked_users WHERE blocker_uuid = ?
            `, [userId]);

            // 獲取封鎖列表
            const blockedUsers = await database.all(`
                SELECT b.blocked_uuid, b.created_at, u.username, u.avatar
                FROM blocked_users b
                JOIN users u ON b.blocked_uuid = u.uuid
                WHERE b.blocker_uuid = ?
                ORDER BY b.created_at DESC
                LIMIT ? OFFSET ?
            `, [userId, parseInt(limit), offset]);

            res.json({
                success: true,
                data: {
                    blockedUsers,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: countResult.total,
                        pages: Math.ceil(countResult.total / parseInt(limit))
                    }
                }
            });

        } catch (error) {
            logger.error('獲取封鎖列表失敗', {
                error: error.message,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取封鎖列表失敗'
            });
        }
    }

    // 獲取在線用戶
    static async getOnlineUsers(req, res) {
        try {
            const users = await database.all(`
                SELECT uuid, username, avatar, status, lastSeenAt
                FROM users 
                WHERE status IN ('online', 'away', 'busy')
                ORDER BY lastSeenAt DESC
                LIMIT 50
            `);

            res.json({
                success: true,
                data: {
                    users,
                    count: users.length
                }
            });

        } catch (error) {
            logger.error('獲取在線用戶失敗', {
                error: error.message,
                userId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取在線用戶失敗'
            });
        }
    }

    // 軟刪除用戶（管理員功能）
    static async deleteUser(req, res) {
        try {
            const { userId } = req.params;

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            // 不能刪除自己
            if (userId === req.user.uuid) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '不能刪除自己的帳戶',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 軟刪除用戶
            await user.update({
                status: 'deleted',
                deletedAt: new Date().toISOString()
            });

            logger.info('User deleted by admin', {
                deletedUserId: userId,
                adminId: req.user.uuid
            });

            res.json({
                success: true,
                message: '用戶已刪除'
            });

        } catch (error) {
            logger.error('刪除用戶失敗', {
                error: error.message,
                userId: req.params.userId,
                adminId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '刪除用戶失敗'
            });
        }
    }

    // 封禁用戶（管理員）
    static async banUser(req, res) {
        try {
            const { userId } = req.params;
            const { reason, duration } = req.body; // duration in hours

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            // 不能封禁管理員
            if (user.isAdmin) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '不能封禁管理員',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            // 計算封禁結束時間
            let bannedUntil = null;
            if (duration) {
                const banEnd = new Date();
                banEnd.setHours(banEnd.getHours() + parseInt(duration));
                bannedUntil = banEnd.toISOString();
            }

            // 更新用戶狀態
            await user.update({
                status: 'banned',
                bannedAt: new Date().toISOString(),
                bannedUntil: bannedUntil,
                banReason: reason
            });

            logger.info('User banned by admin', {
                bannedUserId: userId,
                adminId: req.user.uuid,
                reason,
                duration: duration || 'permanent'
            });

            res.json({
                success: true,
                message: '用戶已封禁',
                data: {
                    bannedUntil,
                    reason
                }
            });

        } catch (error) {
            logger.error('封禁用戶失敗', {
                error: error.message,
                userId: req.params.userId,
                adminId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '封禁用戶失敗'
            });
        }
    }

    // 解封用戶（管理員）
    static async unbanUser(req, res) {
        try {
            const { userId } = req.params;

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            if (user.status !== 'banned') {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '用戶未被封禁',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 解封用戶
            await user.update({
                status: 'offline',
                bannedAt: null,
                bannedUntil: null,
                banReason: null
            });

            logger.info('User unbanned by admin', {
                unbannedUserId: userId,
                adminId: req.user.uuid
            });

            res.json({
                success: true,
                message: '用戶已解封'
            });

        } catch (error) {
            logger.error('解封用戶失敗', {
                error: error.message,
                userId: req.params.userId,
                adminId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '解封用戶失敗'
            });
        }
    }

    // 設置用戶角色（管理員）
    static async setUserRole(req, res) {
        try {
            const { userId } = req.params;
            const { role } = req.body;

            const user = await User.findByUuid(userId);
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '用戶不存在',
                    code: ERROR_CODES.USER_NOT_FOUND
                });
            }

            // 不能修改自己的角色
            if (userId === req.user.uuid) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '不能修改自己的角色',
                    code: ERROR_CODES.PERMISSION_DENIED
                });
            }

            // 更新用戶角色
            await user.update({ role });

            logger.info('User role changed by admin', {
                targetUserId: userId,
                newRole: role,
                adminId: req.user.uuid
            });

            res.json({
                success: true,
                message: '用戶角色已更新',
                data: {
                    role
                }
            });

        } catch (error) {
            logger.error('設置用戶角色失敗', {
                error: error.message,
                userId: req.params.userId,
                role: req.body.role,
                adminId: req.user?.uuid
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '設置用戶角色失敗'
            });
        }
    }
}

module.exports = UserController;