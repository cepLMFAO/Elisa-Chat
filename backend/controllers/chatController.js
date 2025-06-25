const Message = require('../models/messages');
const User = require('../models/User');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, MESSAGE_TYPES } = require('../config/constants');

class ChatController {
    // 發送消息
    static async sendMessage(req, res) {
        try {
            const { content, messageType = MESSAGE_TYPES.TEXT, roomId, receiverId, replyTo } = req.body;
            const senderId = req.user.userId;

            // 驗證發送目標
            if (!roomId && !receiverId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '必須指定房間或接收者',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 如果是房間消息，檢查用戶是否為房間成員
            if (roomId) {
                const database = require('../config/database');
                const membership = await database.get(
                    'SELECT role, muted_until FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                    [roomId, senderId]
                );

                if (!membership) {
                    return res.status(HTTP_STATUS.FORBIDDEN).json({
                        success: false,
                        error: '您不是此房間的成員',
                        code: ERROR_CODES.ACCESS_DENIED
                    });
                }

                // 檢查是否被靜音
                if (membership.muted_until && new Date(membership.muted_until) > new Date()) {
                    return res.status(HTTP_STATUS.FORBIDDEN).json({
                        success: false,
                        error: '您已被靜音，無法發送消息',
                        code: ERROR_CODES.ACCESS_DENIED
                    });
                }
            }

            // 如果是私人消息，檢查用戶是否存在
            if (receiverId) {
                const receiver = await User.findByUuid(receiverId);
                if (!receiver) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json({
                        success: false,
                        error: '接收者不存在',
                        code: ERROR_CODES.USER_NOT_FOUND
                    });
                }

                // 檢查是否被對方封鎖
                const database = require('../config/database');
                const blocked = await database.get(
                    'SELECT 1 FROM blocked_users WHERE blocker_uuid = ? AND blocked_uuid = ?',
                    [receiverId, senderId]
                );

                if (blocked) {
                    return res.status(HTTP_STATUS.FORBIDDEN).json({
                        success: false,
                        error: '無法發送消息給此用戶',
                        code: ERROR_CODES.ACCESS_DENIED
                    });
                }
            }

            // 創建消息
            const message = await Message.create({
                roomUuid: roomId,
                senderUuid: senderId,
                receiverUuid: receiverId,
                content,
                messageType,
                replyTo
            });

            // 透過 WebSocket 廣播消息
            const io = req.app.get('io');
            if (io) {
                const messageData = {
                    ...message.toJSON(),
                    senderUsername: req.user.username,
                    senderAvatar: req.user.avatar
                };

                if (roomId) {
                    io.to(`room:${roomId}`).emit('message', messageData);
                } else if (receiverId) {
                    io.to(`user:${receiverId}`).emit('private_message', messageData);
                    io.to(`user:${senderId}`).emit('private_message', messageData);
                }
            }

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: '消息發送成功',
                data: {
                    message: message.toJSON()
                }
            });

        } catch (error) {
            logger.error('發送消息失敗', {
                error: error.message,
                userId: req.user?.userId,
                body: req.body
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '發送消息失敗',
                code: ERROR_CODES.INTERNAL_ERROR
            });
        }
    }

    // 獲取房間消息歷史
    static async getRoomMessages(req, res) {
        try {
            const { roomId } = req.params;
            const { page = 1, limit = 50 } = req.query;
            const userId = req.user.userId;

            const result = await Message.getByRoom(roomId, parseInt(page), parseInt(limit), userId);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('獲取房間消息失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '獲取消息失敗';

            if (error.message.includes('not a member')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '您不是此房間的成員';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 獲取私人消息歷史
    static async getPrivateMessages(req, res) {
        try {
            const { userId: targetUserId } = req.params;
            const { page = 1, limit = 50 } = req.query;
            const userId = req.user.userId;

            const result = await Message.getPrivateMessages(userId, targetUserId, parseInt(page), parseInt(limit));

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('獲取私人消息失敗', {
                error: error.message,
                targetUserId: req.params.userId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取消息失敗'
            });
        }
    }

    // 編輯消息
    static async editMessage(req, res) {
        try {
            const { messageId } = req.params;
            const { content } = req.body;
            const userId = req.user.userId;

            const message = await Message.findByUuid(messageId);
            if (!message) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '消息不存在',
                    code: ERROR_CODES.MESSAGE_NOT_FOUND
                });
            }

            // 檢查用戶是否能編輯此消息
            const canEdit = await message.canUserView(userId);
            if (!canEdit) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權編輯此消息',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            await message.edit(content, userId);

            // 透過 WebSocket 廣播消息編輯
            const io = req.app.get('io');
            if (io) {
                const editData = {
                    messageId: message.uuid,
                    content: message.content,
                    editedAt: message.editedAt
                };

                if (message.roomUuid) {
                    io.to(`room:${message.roomUuid}`).emit('message_edited', editData);
                } else if (message.receiverUuid) {
                    io.to(`user:${message.receiverUuid}`).emit('message_edited', editData);
                    io.to(`user:${message.senderUuid}`).emit('message_edited', editData);
                }
            }

            res.json({
                success: true,
                message: '消息編輯成功',
                data: {
                    message: message.toJSON()
                }
            });

        } catch (error) {
            logger.error('編輯消息失敗', {
                error: error.message,
                messageId: req.params.messageId,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '編輯消息失敗';

            if (error.message.includes('edit time limit')) {
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorMessage = '已超過編輯時間限制';
            } else if (error.message.includes('Only the sender')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '只能編輯自己的消息';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 刪除消息
    static async deleteMessage(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.user.userId;
            const isAdmin = req.user.role === 'admin';

            const message = await Message.findByUuid(messageId);
            if (!message) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '消息不存在',
                    code: ERROR_CODES.MESSAGE_NOT_FOUND
                });
            }

            await message.delete(userId, isAdmin);

            // 透過 WebSocket 廣播消息刪除
            const io = req.app.get('io');
            if (io) {
                const deleteData = {
                    messageId: message.uuid,
                    deletedAt: message.deletedAt
                };

                if (message.roomUuid) {
                    io.to(`room:${message.roomUuid}`).emit('message_deleted', deleteData);
                } else if (message.receiverUuid) {
                    io.to(`user:${message.receiverUuid}`).emit('message_deleted', deleteData);
                    io.to(`user:${message.senderUuid}`).emit('message_deleted', deleteData);
                }
            }

            res.json({
                success: true,
                message: '消息刪除成功'
            });

        } catch (error) {
            logger.error('刪除消息失敗', {
                error: error.message,
                messageId: req.params.messageId,
                userId: req.user?.userId
            });

            let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            let errorMessage = '刪除消息失敗';

            if (error.message.includes('Only the sender')) {
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorMessage = '只能刪除自己的消息或需要管理員權限';
            }

            res.status(statusCode).json({
                success: false,
                error: errorMessage
            });
        }
    }

    // 轉發消息
    static async forwardMessage(req, res) {
        try {
            const { messageId } = req.params;
            const { targetRoomId, targetUserId } = req.body;
            const forwarderUserId = req.user.userId;

            if (!targetRoomId && !targetUserId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '必須指定轉發目標',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            const forwardedMessage = await Message.forward(
                messageId,
                targetRoomId,
                targetUserId,
                forwarderUserId
            );

            // 透過 WebSocket 發送轉發的消息
            const io = req.app.get('io');
            if (io) {
                const messageData = {
                    ...forwardedMessage.toJSON(),
                    senderUsername: req.user.username,
                    senderAvatar: req.user.avatar
                };

                if (targetRoomId) {
                    io.to(`room:${targetRoomId}`).emit('message', messageData);
                } else if (targetUserId) {
                    io.to(`user:${targetUserId}`).emit('private_message', messageData);
                }
            }

            res.json({
                success: true,
                message: '消息轉發成功',
                data: {
                    message: forwardedMessage.toJSON()
                }
            });

        } catch (error) {
            logger.error('轉發消息失敗', {
                error: error.message,
                messageId: req.params.messageId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '轉發消息失敗'
            });
        }
    }

    // 搜索消息
    static async searchMessages(req, res) {
        try {
            const { q: query, roomId, page = 1, limit = 20 } = req.query;
            const userId = req.user.userId;

            const result = await Message.search(
                query,
                roomId,
                userId,
                parseInt(page),
                parseInt(limit)
            );

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('搜索消息失敗', {
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

    // 獲取消息回復鏈
    static async getMessageReplyChain(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.user.userId;

            const message = await Message.findByUuid(messageId);
            if (!message) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '消息不存在',
                    code: ERROR_CODES.MESSAGE_NOT_FOUND
                });
            }

            // 檢查用戶是否能查看此消息
            const canView = await message.canUserView(userId);
            if (!canView) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '無權查看此消息',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            const replyChain = await message.getReplyChain();

            res.json({
                success: true,
                data: {
                    originalMessage: message.toJSON(),
                    replyChain: replyChain.map(msg => msg.toJSON())
                }
            });

        } catch (error) {
            logger.error('獲取消息回復鏈失敗', {
                error: error.message,
                messageId: req.params.messageId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取回復鏈失敗'
            });
        }
    }

    // 獲取消息統計
    static async getMessageStats(req, res) {
        try {
            const userId = req.user.userId;
            const stats = await Message.getUserStats(userId);

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('獲取消息統計失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取統計失敗'
            });
        }
    }

    // 獲取未讀消息數量
    static async getUnreadCount(req, res) {
        try {
            const userId = req.user.userId;
            const database = require('../config/database');

            // 獲取未讀的房間消息數量
            const roomUnread = await database.query(
                `SELECT rm.room_uuid, COUNT(m.uuid) as unread_count
                 FROM room_members rm
                 LEFT JOIN messages m ON rm.room_uuid = m.room_uuid 
                     AND m.created_at > rm.joined_at
                     AND m.sender_uuid != ?
                     AND m.deleted_at IS NULL
                 WHERE rm.user_uuid = ?
                 GROUP BY rm.room_uuid`,
                [userId, userId]
            );

            // 獲取未讀的私人消息數量
            const privateUnread = await database.get(
                `SELECT COUNT(*) as count FROM messages
                 WHERE receiver_uuid = ? AND sender_uuid != ? AND deleted_at IS NULL`,
                [userId, userId]
            );

            res.json({
                success: true,
                data: {
                    roomMessages: roomUnread,
                    privateMessages: privateUnread.count || 0,
                    total: roomUnread.reduce((sum, room) => sum + room.unread_count, 0) + (privateUnread.count || 0)
                }
            });

        } catch (error) {
            logger.error('獲取未讀消息數量失敗', {
                error: error.message,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '獲取未讀數量失敗'
            });
        }
    }

    // 標記房間消息為已讀
    static async markRoomMessagesAsRead(req, res) {
        try {
            const { roomId } = req.params;
            const userId = req.user.userId;

            // 檢查用戶是否為房間成員
            const database = require('../config/database');
            const membership = await database.get(
                'SELECT 1 FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, userId]
            );

            if (!membership) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: '您不是此房間的成員',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            // 這裡可以實現已讀狀態的邏輯
            // 由於沒有專門的已讀表，我們使用 user_settings 來記錄最後閱讀時間
            await database.run(
                `INSERT OR REPLACE INTO user_settings (user_uuid, setting_key, setting_value)
                 VALUES (?, ?, ?)`,
                [userId, `last_read_${roomId}`, new Date().toISOString()]
            );

            res.json({
                success: true,
                message: '已標記為已讀'
            });

        } catch (error) {
            logger.error('標記消息為已讀失敗', {
                error: error.message,
                roomId: req.params.roomId,
                userId: req.user?.userId
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '標記已讀失敗'
            });
        }
    }

    // 發送系統消息（管理員功能）
    static async sendSystemMessage(req, res) {
        try {
            const { content, roomId } = req.body;
            const senderId = req.user.userId;

            const message = await Message.create({
                roomUuid: roomId,
                senderUuid: senderId,
                content,
                messageType: MESSAGE_TYPES.SYSTEM
            });

            // 透過 WebSocket 廣播系統消息
            const io = req.app.get('io');
            if (io) {
                const messageData = {
                    ...message.toJSON(),
                    senderUsername: 'System'
                };

                if (roomId) {
                    io.to(`room:${roomId}`).emit('system_message', messageData);
                } else {
                    io.emit('system_message', messageData);
                }
            }

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: '系統消息發送成功',
                data: {
                    message: message.toJSON()
                }
            });

        } catch (error) {
            logger.error('發送系統消息失敗', {
                error: error.message,
                userId: req.user?.userId,
                body: req.body
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '發送系統消息失敗'
            });
        }
    }

    // 批量刪除消息（管理員功能）
    static async bulkDeleteMessages(req, res) {
        try {
            const { messageIds } = req.body;
            const userId = req.user.userId;

            const deletedCount = await Message.bulkDelete(messageIds, userId);

            // 透過 WebSocket 廣播批量刪除
            const io = req.app.get('io');
            if (io) {
                messageIds.forEach(messageId => {
                    io.emit('message_deleted', {
                        messageId,
                        deletedAt: new Date().toISOString(),
                        deletedBy: 'admin'
                    });
                });
            }

            res.json({
                success: true,
                message: `成功刪除 ${deletedCount} 條消息`,
                data: {
                    deletedCount
                }
            });

        } catch (error) {
            logger.error('批量刪除消息失敗', {
                error: error.message,
                userId: req.user?.userId,
                messageIds: req.body.messageIds
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '批量刪除失敗'
            });
        }
    }

    // 處理消息反應
    static async handleMessageReaction(req, res) {
        try {
            const { messageId } = req.params;
            const { reaction, action = 'add' } = req.body; // action: 'add' or 'remove'
            const userId = req.user.userId;

            // 這裡可以實現消息反應的邏輯
            // 由於沒有專門的反應表，我們可以擴展 messages 表或使用 user_settings

            const database = require('../config/database');
            const message = await database.get('SELECT * FROM messages WHERE uuid = ?', [messageId]);

            if (!message) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    error: '消息不存在',
                    code: ERROR_CODES.MESSAGE_NOT_FOUND
                });
            }

            // 透過 WebSocket 廣播反應更新
            const io = req.app.get('io');
            if (io) {
                const reactionData = {
                    messageId,
                    userId,
                    reaction,
                    action,
                    timestamp: new Date().toISOString()
                };

                if (message.room_uuid) {
                    io.to(`room:${message.room_uuid}`).emit('message_reaction', reactionData);
                } else if (message.receiver_uuid) {
                    io.to(`user:${message.receiver_uuid}`).emit('message_reaction', reactionData);
                    io.to(`user:${message.sender_uuid}`).emit('message_reaction', reactionData);
                }
            }

            res.json({
                success: true,
                message: '反應更新成功',
                data: {
                    messageId,
                    reaction,
                    action
                }
            });

        } catch (error) {
            logger.error('處理消息反應失敗', {
                error: error.message,
                messageId: req.params.messageId,
                userId: req.user?.userId,
                body: req.body
            });

            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: '處理反應失敗'
            });
        }
    }
}

module.exports = ChatController;