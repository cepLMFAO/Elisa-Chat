const User = require('../models/User');
const database = require('../config/database');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, USER_STATUS, FRIENDSHIP_STATUS } = require('../config/constants');

class UserController {
    // 獲取用戶資料
    static async getUser(req, res) {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.userId;

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
                currentUserId: req.user?.userId
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
            const currentUserId = req.user.userId;
            const isAdmin = req.user.role === 'admin';

            // 檢查權限
            if (userId !== currentUserId && !isAdmin) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '只能修改自己的資料',
                    code: ERROR_CODES.ACCESS_DENIED
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

            const updateData = req.body;

            // 如果更新用戶名，檢查是否已存在
            if (updateData.username && updateData.username !== user.username) {
                const existingUser = await User.findByUsername(updateData.username);
                if (existingUser) {
                    return res.status(HTTP_STATUS.CONFLICT).json({
                        success: false,
                        error: '用戶名已存在',
                        code: ERROR_CODES.USER_ALREADY_EXISTS
                    });
                }
            }

            // 如果更新郵箱，檢查是否已存在
            if (updateData.email && updateData.email !== user.email) {
                const existingUser = await User.findByEmail(updateData.email);
                if (existingUser) {
                    return res.status(HTTP_STATUS.CONFLICT).json({
                        success: false,
                        error: '郵箱已存在',
                        code: ERROR_CODES.USER_ALREADY_EXISTS
                    });
                }
            }

            await user.update(updateData);

            // 如果更新了狀態，通過 WebSocket 廣播
            if (updateData.status) {
                const io = req.app.get('io');
                if (io) {
                    const socketHandler = req.app.get('socketHandler');
                    if (socketHandler) {
                        await socketHandler.broadcastUserStatus(userId, updateData.status);
                    }
                }
            }

            logger.info('用戶資料更新成功', {
                userId,
                updatedFields: Object.keys(updateData),
                updatedBy: currentUserId
            });

            res.json({
                success: true,
                message: '用戶資料更新成功',
                data: {
                    user: user.toJSON()
                }
            });

        } catch (error) {
            logger.error('更新用戶資料失敗', {
                error: error.message,
                userId: req.params.userId,
                updateData: req.body,
                currentUserId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '更新用戶資料失敗';

            if (error.message.includes('No valid fields')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '沒有有效的更新字段';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
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
                    users,
                    query: query.trim()
                }
            });

        } catch (error) {
            logger.error('搜索用戶失敗', {
                error: error.message,
                query: req.query.q,
                userId: req.user?.userId
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
            const currentUserId = req.user.userId;
            const isAdmin = req.user.role === 'admin';

            // 檢查權限
            if (userId !== currentUserId && !isAdmin) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權查看統計信息',
                    code: ERROR_CODES.ACCESS_DENIED
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

            const stats = await user.getStats();

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('獲取用戶統計失敗', {
                error: error.message,
                userId: req.params.userId,
                currentUserId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取統計失敗'
            });
        }
    }

    // 發送好友請求
    static async sendFriendRequest(req, res) {
        try {
            const { userId: targetUserId } = req.body;
            const requesterUserId = req.user.userId;

            if (targetUserId === requesterUserId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '不能向自己發送好友請求',
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

            // 檢查是否已經是好友或已發送請求
            const existingFriendship = await database.get(
                `SELECT * FROM friendships 
                 WHERE (requester_uuid = ? AND addressee_uuid = ?) 
                    OR (requester_uuid = ? AND addressee_uuid = ?)`,
                [requesterUserId, targetUserId, targetUserId, requesterUserId]
            );

            if (existingFriendship) {
                let message = '';
                switch (existingFriendship.status) {
                    case FRIENDSHIP_STATUS.PENDING:
                        message = '好友請求已發送或待處理';
                        break;
                    case FRIENDSHIP_STATUS.ACCEPTED:
                        message = '已經是好友';
                        break;
                    case FRIENDSHIP_STATUS.BLOCKED:
                        message = '無法發送好友請求';
                        break;
                    default:
                        message = '好友關係已存在';
                }

                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: message,
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 檢查是否被對方封鎖
            const blocked = await database.get(
                'SELECT 1 FROM blocked_users WHERE blocker_uuid = ? AND blocked_uuid = ?',
                [targetUserId, requesterUserId]
            );

            if (blocked) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無法發送好友請求',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            // 創建好友請求
            await database.run(
                `INSERT INTO friendships (requester_uuid, addressee_uuid, status, created_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [requesterUserId, targetUserId, FRIENDSHIP_STATUS.PENDING]
            );

            // 創建通知
            const notificationUuid = require('uuid').v4();
            await database.run(
                `INSERT INTO notifications (uuid, user_uuid, type, title, content, data, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    notificationUuid,
                    targetUserId,
                    'friend_request',
                    '好友請求',
                    `${req.user.username} 向您發送了好友請求`,
                    JSON.stringify({
                        requesterId: requesterUserId,
                        requesterName: req.user.username,
                        requesterAvatar: req.user.avatar
                    })
                ]
            );

            // 通過 WebSocket 發送通知
            const io = req.app.get('io');
            if (io) {
                io.to(`user:${targetUserId}`).emit('friend_request', {
                    id: notificationUuid,
                    requester: {
                        uuid: requesterUserId,
                        username: req.user.username,
                        avatar: req.user.avatar
                    },
                    timestamp: new Date().toISOString()
                });
            }

            logger.info('好友請求發送', {
                requesterUserId,
                targetUserId,
                requesterName: req.user.username
            });

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: '好友請求已發送'
            });

        } catch (error) {
            logger.error('發送好友請求失敗', {
                error: error.message,
                requesterUserId: req.user?.userId,
                targetUserId: req.body.userId
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
            const addresseeUserId = req.user.userId;

            if (!['accept', 'reject'].includes(action)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '無效的操作',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 查找好友請求
            const friendship = await database.get(
                `SELECT f.*, u.username as requester_name, u.avatar as requester_avatar
                 FROM friendships f
                 JOIN users u ON f.requester_uuid = u.uuid
                 WHERE f.id = ? AND f.addressee_uuid = ? AND f.status = ?`,
                [requestId, addresseeUserId, FRIENDSHIP_STATUS.PENDING]
            );

            if (!friendship) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '好友請求不存在或已處理',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            const newStatus = action === 'accept' ? FRIENDSHIP_STATUS.ACCEPTED : FRIENDSHIP_STATUS.REJECTED;

            // 更新好友請求狀態
            await database.run(
                'UPDATE friendships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newStatus, requestId]
            );

            // 創建通知給請求者
            const notificationUuid = require('uuid').v4();
            const notificationContent = action === 'accept'
                ? `${req.user.username} 接受了您的好友請求`
                : `${req.user.username} 拒絕了您的好友請求`;

            await database.run(
                `INSERT INTO notifications (uuid, user_uuid, type, title, content, data, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    notificationUuid,
                    friendship.requester_uuid,
                    'friend_request_response',
                    '好友請求回應',
                    notificationContent,
                    JSON.stringify({
                        addresseeId: addresseeUserId,
                        addresseeName: req.user.username,
                        addresseeAvatar: req.user.avatar,
                        action
                    })
                ]
            );

            // 通過 WebSocket 發送通知
            const io = req.app.get('io');
            if (io) {
                io.to(`user:${friendship.requester_uuid}`).emit('friend_request_response', {
                    id: notificationUuid,
                    addressee: {
                        uuid: addresseeUserId,
                        username: req.user.username,
                        avatar: req.user.avatar
                    },
                    action,
                    timestamp: new Date().toISOString()
                });

                // 如果接受，向雙方發送好友添加事件
                if (action === 'accept') {
                    const friendData = {
                        friendshipId: requestId,
                        timestamp: new Date().toISOString()
                    };

                    io.to(`user:${friendship.requester_uuid}`).emit('friend_added', {
                        ...friendData,
                        friend: {
                            uuid: addresseeUserId,
                            username: req.user.username,
                            avatar: req.user.avatar,
                            status: req.user.status
                        }
                    });

                    io.to(`user:${addresseeUserId}`).emit('friend_added', {
                        ...friendData,
                        friend: {
                            uuid: friendship.requester_uuid,
                            username: friendship.requester_name,
                            avatar: friendship.requester_avatar,
                            status: 'offline' // 需要從實際用戶狀態獲取
                        }
                    });
                }
            }

            logger.info('好友請求處理', {
                requestId,
                requesterUserId: friendship.requester_uuid,
                addresseeUserId,
                action
            });

            res.json({
                success: true,
                message: action === 'accept' ? '已接受好友請求' : '已拒絕好友請求'
            });

        } catch (error) {
            logger.error('處理好友請求失敗', {
                error: error.message,
                requestId: req.params.requestId,
                action: req.body.action,
                userId: req.user?.userId
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
            const { page = 1, limit = 50 } = req.query;
            const userId = req.user.userId;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            // 獲取總數
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM friendships
                 WHERE (requester_uuid = ? OR addressee_uuid = ?) AND status = ?`,
                [userId, userId, FRIENDSHIP_STATUS.ACCEPTED]
            );

            // 獲取好友列表
            const friends = await database.query(
                `SELECT 
                    f.id as friendship_id,
                    f.created_at as friends_since,
                    CASE 
                        WHEN f.requester_uuid = ? THEN f.addressee_uuid 
                        ELSE f.requester_uuid 
                    END as friend_id,
                    CASE 
                        WHEN f.requester_uuid = ? THEN addressee.username 
                        ELSE requester.username 
                    END as username,
                    CASE 
                        WHEN f.requester_uuid = ? THEN addressee.avatar 
                        ELSE requester.avatar 
                    END as avatar,
                    CASE 
                        WHEN f.requester_uuid = ? THEN addressee.status 
                        ELSE requester.status 
                    END as status,
                    CASE 
                        WHEN f.requester_uuid = ? THEN addressee.last_seen 
                        ELSE requester.last_seen 
                    END as last_seen
                 FROM friendships f
                 LEFT JOIN users requester ON f.requester_uuid = requester.uuid
                 LEFT JOIN users addressee ON f.addressee_uuid = addressee.uuid
                 WHERE (f.requester_uuid = ? OR f.addressee_uuid = ?) AND f.status = ?
                 ORDER BY 
                    CASE 
                        WHEN f.requester_uuid = ? THEN addressee.status 
                        ELSE requester.status 
                    END = 'online' DESC,
                    f.created_at DESC
                 LIMIT ? OFFSET ?`,
                [userId, userId, userId, userId, userId, userId, userId, FRIENDSHIP_STATUS.ACCEPTED, userId, parseInt(limit), offset]
            );

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
                userId: req.user?.userId
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
            const userId = req.user.userId;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            let whereClause = '';
            let orderBy = 'f.created_at DESC';

            if (type === 'received') {
                whereClause = 'f.addressee_uuid = ?';
            } else if (type === 'sent') {
                whereClause = 'f.requester_uuid = ?';
            } else {
                whereClause = '(f.requester_uuid = ? OR f.addressee_uuid = ?)';
            }

            // 獲取總數
            const countParams = type === 'both' ? [userId, userId] : [userId];
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM friendships f
                 WHERE ${whereClause} AND f.status = ?`,
                [...countParams, FRIENDSHIP_STATUS.PENDING]
            );

            // 獲取請求列表
            const queryParams = type === 'both' ? [userId, userId] : [userId];
            const requests = await database.query(
                `SELECT 
                    f.id,
                    f.requester_uuid,
                    f.addressee_uuid,
                    f.status,
                    f.created_at,
                    requester.username as requester_name,
                    requester.avatar as requester_avatar,
                    addressee.username as addressee_name,
                    addressee.avatar as addressee_avatar
                 FROM friendships f
                 JOIN users requester ON f.requester_uuid = requester.uuid
                 JOIN users addressee ON f.addressee_uuid = addressee.uuid
                 WHERE ${whereClause} AND f.status = ?
                 ORDER BY ${orderBy}
                 LIMIT ? OFFSET ?`,
                [...queryParams, FRIENDSHIP_STATUS.PENDING, parseInt(limit), offset]
            );

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
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取好友請求失敗'
            });
        }
    }

    // 刪除好友
    static async removeFriend(req, res) {
        try {
            const { friendId } = req.params;
            const userId = req.user.userId;

            // 查找好友關係
            const friendship = await database.get(
                `SELECT * FROM friendships
                 WHERE ((requester_uuid = ? AND addressee_uuid = ?) 
                     OR (requester_uuid = ? AND addressee_uuid = ?))
                 AND status = ?`,
                [userId, friendId, friendId, userId, FRIENDSHIP_STATUS.ACCEPTED]
            );

            if (!friendship) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '好友關係不存在',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            // 刪除好友關係
            await database.run('DELETE FROM friendships WHERE id = ?', [friendship.id]);

            // 通過 WebSocket 通知雙方
            const io = req.app.get('io');
            if (io) {
                const friendRemovedData = {
                    friendshipId: friendship.id,
                    removedBy: userId,
                    timestamp: new Date().toISOString()
                };

                io.to(`user:${friendId}`).emit('friend_removed', {
                    ...friendRemovedData,
                    removedFriend: {
                        uuid: userId,
                        username: req.user.username
                    }
                });

                io.to(`user:${userId}`).emit('friend_removed', {
                    ...friendRemovedData,
                    removedFriend: {
                        uuid: friendId
                    }
                });
            }

            logger.info('好友刪除', {
                friendshipId: friendship.id,
                userId,
                friendId
            });

            res.json({
                success: true,
                message: '已刪除好友'
            });

        } catch (error) {
            logger.error('刪除好友失敗', {
                error: error.message,
                userId: req.user?.userId,
                friendId: req.params.friendId
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
            const blockerUserId = req.user.userId;

            if (targetUserId === blockerUserId) {
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
            const existingBlock = await database.get(
                'SELECT 1 FROM blocked_users WHERE blocker_uuid = ? AND blocked_uuid = ?',
                [blockerUserId, targetUserId]
            );

            if (existingBlock) {
                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: '用戶已被封鎖',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 開始事務
            await database.beginTransaction();

            try {
                // 添加封鎖記錄
                await database.run(
                    `INSERT INTO blocked_users (blocker_uuid, blocked_uuid, created_at)
                     VALUES (?, ?, CURRENT_TIMESTAMP)`,
                    [blockerUserId, targetUserId]
                );

                // 刪除好友關係（如果存在）
                await database.run(
                    `DELETE FROM friendships
                     WHERE ((requester_uuid = ? AND addressee_uuid = ?) 
                         OR (requester_uuid = ? AND addressee_uuid = ?))`,
                    [blockerUserId, targetUserId, targetUserId, blockerUserId]
                );

                await database.commit();

                logger.info('用戶封鎖', {
                    blockerUserId,
                    targetUserId,
                    targetUsername: targetUser.username
                });

                res.json({
                    success: true,
                    message: '用戶已被封鎖'
                });

            } catch (error) {
                await database.rollback();
                throw error;
            }

        } catch (error) {
            logger.error('封鎖用戶失敗', {
                error: error.message,
                blockerUserId: req.user?.userId,
                targetUserId: req.body.userId
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
            const blockerUserId = req.user.userId;

            const result = await database.run(
                'DELETE FROM blocked_users WHERE blocker_uuid = ? AND blocked_uuid = ?',
                [blockerUserId, targetUserId]
            );

            if (result.changes === 0) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '封鎖記錄不存在',
                    code: ERROR_CODES.NOT_FOUND
                });
            }

            logger.info('解除封鎖', {
                blockerUserId,
                targetUserId
            });

            res.json({
                success: true,
                message: '已解除封鎖'
            });

        } catch (error) {
            logger.error('解除封鎖失敗', {
                error: error.message,
                blockerUserId: req.user?.userId,
                targetUserId: req.params.userId
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
            const userId = req.user.userId;
            const offset = (parseInt(page) - 1) * parseInt(limit);

            // 獲取總數
            const countResult = await database.get(
                'SELECT COUNT(*) as total FROM blocked_users WHERE blocker_uuid = ?',
                [userId]
            );

            // 獲取封鎖列表
            const blockedUsers = await database.query(
                `SELECT b.blocked_uuid, b.created_at, u.username, u.avatar
                 FROM blocked_users b
                 JOIN users u ON b.blocked_uuid = u.uuid
                 WHERE b.blocker_uuid = ?
                 ORDER BY b.created_at DESC
                 LIMIT ? OFFSET ?`,
                [userId, parseInt(limit), offset]
            );

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
                userId: req.user?.userId
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
            const users = await User.getOnlineUsers();

            res.json({
                success: true,
                data: {
                    users: users.map(user => user.toPublic()),
                    count: users.length
                }
            });

        } catch (error) {
            logger.error('獲取在線用戶失敗', {
                error: error.message,
                userId: req.user?.userId
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

            await user.softDelete();

            // 通過 WebSocket 強制斷開用戶連接
            const io = req.app.get('io');
            if (io) {
                const socketHandler = req.app.get('socketHandler');
                if (socketHandler) {
                    socketHandler.disconnectUser(userId, 'Account deleted by administrator');
                }
            }

            logger.info('用戶被刪除', {
                userId,
                username: user.username,
                deletedBy: req.user.userId
            });

            res.json({
                success: true,
                message: '用戶已被刪除'
            });

        } catch (error) {
            logger.error('刪除用戶失敗', {
                error: error.message,
                userId: req.params.userId,
                adminUserId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '刪除用戶失敗'
            });
        }
    }

    // 獲取所有用戶（管理員功能）
    static async getAllUsers(req, res) {
        try {
            const { page = 1, limit = 20, status, role, search } = req.query;

            const filters = {};
            if (status) filters.status = status;
            if (role) filters.role = role;
            if (search) filters.search = search;

            const result = await User.getAll(parseInt(page), parseInt(limit), filters);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('獲取所有用戶失敗', {
                error: error.message,
                filters: req.query,
                adminUserId: req.user?.userId
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
            const userId = req.user.userId;

            if (!Object.values(USER_STATUS).includes(status)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '無效的狀態值',
                    code: ERROR_CODES.VALIDATION_ERROR
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

            await user.updateStatus(status);

            // 通過 WebSocket 廣播狀態變更
            const io = req.app.get('io');
            if (io) {
                const socketHandler = req.app.get('socketHandler');
                if (socketHandler) {
                    await socketHandler.broadcastUserStatus(userId, status);
                }
            }

            logger.info('用戶狀態更新', {
                userId,
                status,
                username: user.username
            });

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
                userId: req.user?.userId,
                status: req.body.status
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '狀態更新失敗'
            });
        }
    }
}

module.exports = UserController;