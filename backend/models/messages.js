const database = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { MESSAGE_TYPES, SYSTEM } = require('../config/constants');

class Message {
    constructor(data = {}) {
        this.id = data.id;
        this.uuid = data.uuid;
        this.roomUuid = data.room_uuid;
        this.senderUuid = data.sender_uuid;
        this.receiverUuid = data.receiver_uuid;
        this.content = data.content;
        this.messageType = data.message_type || MESSAGE_TYPES.TEXT;
        this.replyTo = data.reply_to;
        this.forwardedFrom = data.forwarded_from;
        this.editedAt = data.edited_at;
        this.deletedAt = data.deleted_at;
        this.createdAt = data.created_at;
    }

    // 創建新消息
    static async create(messageData) {
        try {
            const {
                roomUuid = null,
                senderUuid,
                receiverUuid = null,
                content,
                messageType = MESSAGE_TYPES.TEXT,
                replyTo = null,
                forwardedFrom = null
            } = messageData;

            // 驗證必要字段
            if (!senderUuid || !content) {
                throw new Error('Sender UUID and content are required');
            }

            // 驗證消息長度
            if (content.length > SYSTEM.MAX_MESSAGE_LENGTH) {
                throw new Error(`Message content exceeds maximum length of ${SYSTEM.MAX_MESSAGE_LENGTH} characters`);
            }

            // 驗證消息類型
            if (!Object.values(MESSAGE_TYPES).includes(messageType)) {
                throw new Error('Invalid message type');
            }

            // 驗證房間或接收者
            if (!roomUuid && !receiverUuid) {
                throw new Error('Either room UUID or receiver UUID must be provided');
            }

            const messageUuid = uuidv4();

            const result = await database.run(
                `INSERT INTO messages (uuid, room_uuid, sender_uuid, receiver_uuid, content, message_type, reply_to, forwarded_from, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [messageUuid, roomUuid, senderUuid, receiverUuid, content, messageType, replyTo, forwardedFrom]
            );

            logger.info('Message created', {
                messageId: messageUuid,
                senderId: senderUuid,
                roomId: roomUuid,
                type: messageType
            });

            // 返回完整的消息對象
            return await Message.findByUuid(messageUuid);

        } catch (error) {
            logger.error('Failed to create message', {
                error: error.message,
                messageData
            });
            throw error;
        }
    }

    // 通過UUID查找消息
    static async findByUuid(uuid) {
        try {
            const message = await database.get(
                `SELECT m.*, u.username as sender_username, u.avatar as sender_avatar
                 FROM messages m
                 LEFT JOIN users u ON m.sender_uuid = u.uuid
                 WHERE m.uuid = ? AND m.deleted_at IS NULL`,
                [uuid]
            );

            return message ? new Message(message) : null;
        } catch (error) {
            logger.error('Failed to find message by UUID', { error: error.message, uuid });
            throw error;
        }
    }

    // 獲取房間消息（分頁）
    static async getByRoom(roomUuid, page = 1, limit = 50, userId = null) {
        try {
            const offset = (page - 1) * limit;

            // 檢查用戶是否是房間成員
            if (userId) {
                const membership = await database.get(
                    'SELECT 1 FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                    [roomUuid, userId]
                );

                if (!membership) {
                    throw new Error('User is not a member of this room');
                }
            }

            // 獲取消息總數
            const countResult = await database.get(
                'SELECT COUNT(*) as total FROM messages WHERE room_uuid = ? AND deleted_at IS NULL',
                [roomUuid]
            );

            // 獲取消息列表
            const messages = await database.query(
                `SELECT m.*, 
                        u.username as sender_username, 
                        u.avatar as sender_avatar,
                        reply_msg.content as reply_content,
                        reply_user.username as reply_username
                 FROM messages m
                 LEFT JOIN users u ON m.sender_uuid = u.uuid
                 LEFT JOIN messages reply_msg ON m.reply_to = reply_msg.uuid
                 LEFT JOIN users reply_user ON reply_msg.sender_uuid = reply_user.uuid
                 WHERE m.room_uuid = ? AND m.deleted_at IS NULL
                 ORDER BY m.created_at DESC
                 LIMIT ? OFFSET ?`,
                [roomUuid, limit, offset]
            );

            return {
                messages: messages.map(msg => new Message(msg)),
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to get room messages', {
                error: error.message,
                roomUuid,
                page,
                limit
            });
            throw error;
        }
    }

    // 獲取私人消息
    static async getPrivateMessages(user1Uuid, user2Uuid, page = 1, limit = 50) {
        try {
            const offset = (page - 1) * limit;

            // 獲取消息總數
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM messages 
                 WHERE ((sender_uuid = ? AND receiver_uuid = ?) OR (sender_uuid = ? AND receiver_uuid = ?))
                 AND deleted_at IS NULL`,
                [user1Uuid, user2Uuid, user2Uuid, user1Uuid]
            );

            // 獲取消息列表
            const messages = await database.query(
                `SELECT m.*, 
                        u.username as sender_username, 
                        u.avatar as sender_avatar,
                        reply_msg.content as reply_content,
                        reply_user.username as reply_username
                 FROM messages m
                 LEFT JOIN users u ON m.sender_uuid = u.uuid
                 LEFT JOIN messages reply_msg ON m.reply_to = reply_msg.uuid
                 LEFT JOIN users reply_user ON reply_msg.sender_uuid = reply_user.uuid
                 WHERE ((m.sender_uuid = ? AND m.receiver_uuid = ?) OR (m.sender_uuid = ? AND m.receiver_uuid = ?))
                 AND m.deleted_at IS NULL
                 ORDER BY m.created_at DESC
                 LIMIT ? OFFSET ?`,
                [user1Uuid, user2Uuid, user2Uuid, user1Uuid, limit, offset]
            );

            return {
                messages: messages.map(msg => new Message(msg)),
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                }
            };

        } catch (error) {
            logger.error('Failed to get private messages', {
                error: error.message,
                user1Uuid,
                user2Uuid
            });
            throw error;
        }
    }

    // 編輯消息
    async edit(newContent, userId) {
        try {
            // 檢查權限
            if (this.senderUuid !== userId) {
                throw new Error('Only the sender can edit this message');
            }

            // 檢查是否已被刪除
            if (this.deletedAt) {
                throw new Error('Cannot edit deleted message');
            }

            // 檢查編輯時間限制（例如：發送後15分鐘內可編輯）
            const editTimeLimit = 15 * 60 * 1000; // 15分鐘
            const messageAge = Date.now() - new Date(this.createdAt).getTime();

            if (messageAge > editTimeLimit) {
                throw new Error('Message edit time limit exceeded');
            }

            // 驗證新內容
            if (!newContent || newContent.trim().length === 0) {
                throw new Error('Message content cannot be empty');
            }

            if (newContent.length > SYSTEM.MAX_MESSAGE_LENGTH) {
                throw new Error(`Message content exceeds maximum length of ${SYSTEM.MAX_MESSAGE_LENGTH} characters`);
            }

            await database.run(
                'UPDATE messages SET content = ?, edited_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [newContent.trim(), this.uuid]
            );

            this.content = newContent.trim();
            this.editedAt = new Date().toISOString();

            logger.info('Message edited', {
                messageId: this.uuid,
                userId
            });

            return this;

        } catch (error) {
            logger.error('Failed to edit message', {
                error: error.message,
                messageId: this.uuid,
                userId
            });
            throw error;
        }
    }

    // 刪除消息
    async delete(userId, isAdmin = false) {
        try {
            // 檢查權限
            if (this.senderUuid !== userId && !isAdmin) {
                throw new Error('Only the sender or admin can delete this message');
            }

            // 檢查是否已被刪除
            if (this.deletedAt) {
                throw new Error('Message is already deleted');
            }

            await database.run(
                'UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [this.uuid]
            );

            this.deletedAt = new Date().toISOString();

            logger.info('Message deleted', {
                messageId: this.uuid,
                userId,
                isAdmin
            });

            return this;

        } catch (error) {
            logger.error('Failed to delete message', {
                error: error.message,
                messageId: this.uuid,
                userId
            });
            throw error;
        }
    }

    // 轉發消息
    static async forward(originalMessageUuid, targetRoomUuid, targetUserUuid, forwarderUuid) {
        try {
            const originalMessage = await Message.findByUuid(originalMessageUuid);
            if (!originalMessage) {
                throw new Error('Original message not found');
            }

            // 創建轉發消息
            const forwardedMessage = await Message.create({
                roomUuid: targetRoomUuid,
                receiverUuid: targetUserUuid,
                senderUuid: forwarderUuid,
                content: originalMessage.content,
                messageType: originalMessage.messageType,
                forwardedFrom: originalMessageUuid
            });

            logger.info('Message forwarded', {
                originalMessageId: originalMessageUuid,
                newMessageId: forwardedMessage.uuid,
                forwarderId: forwarderUuid
            });

            return forwardedMessage;

        } catch (error) {
            logger.error('Failed to forward message', {
                error: error.message,
                originalMessageUuid,
                forwarderUuid
            });
            throw error;
        }
    }

    // 搜索消息
    static async search(query, roomUuid = null, userId = null, page = 1, limit = 20) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE m.deleted_at IS NULL AND m.content LIKE ?';
            let params = [`%${query}%`];

            // 限制搜索範圍
            if (roomUuid) {
                whereClause += ' AND m.room_uuid = ?';
                params.push(roomUuid);

                // 檢查用戶是否是房間成員
                if (userId) {
                    const membership = await database.get(
                        'SELECT 1 FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                        [roomUuid, userId]
                    );

                    if (!membership) {
                        throw new Error('User is not a member of this room');
                    }
                }
            } else if (userId) {
                // 搜索用戶可見的消息
                whereClause += ` AND (
                    m.room_uuid IN (
                        SELECT room_uuid FROM room_members WHERE user_uuid = ?
                    ) OR 
                    (m.sender_uuid = ? OR m.receiver_uuid = ?)
                )`;
                params.push(userId, userId, userId);
            }

            // 獲取搜索結果總數
            const countResult = await database.get(
                `SELECT COUNT(*) as total FROM messages m ${whereClause}`,
                params
            );

            // 獲取搜索結果
            const messages = await database.query(
                `SELECT m.*, 
                        u.username as sender_username, 
                        u.avatar as sender_avatar,
                        r.name as room_name
                 FROM messages m
                 LEFT JOIN users u ON m.sender_uuid = u.uuid
                 LEFT JOIN rooms r ON m.room_uuid = r.uuid
                 ${whereClause}
                 ORDER BY m.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            return {
                messages: messages.map(msg => new Message(msg)),
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / limit)
                },
                query
            };

        } catch (error) {
            logger.error('Failed to search messages', {
                error: error.message,
                query,
                roomUuid,
                userId
            });
            throw error;
        }
    }

    // 獲取用戶消息統計
    static async getUserStats(userId) {
        try {
            const stats = await database.get(
                `SELECT 
                    COUNT(*) as totalMessages,
                    COUNT(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 END) as todayMessages,
                    COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as weekMessages,
                    COUNT(CASE WHEN message_type = 'image' THEN 1 END) as imageMessages,
                    COUNT(CASE WHEN message_type = 'file' THEN 1 END) as fileMessages
                 FROM messages 
                 WHERE sender_uuid = ? AND deleted_at IS NULL`,
                [userId]
            );

            return {
                totalMessages: stats.totalMessages || 0,
                todayMessages: stats.todayMessages || 0,
                weekMessages: stats.weekMessages || 0,
                imageMessages: stats.imageMessages || 0,
                fileMessages: stats.fileMessages || 0
            };

        } catch (error) {
            logger.error('Failed to get user message stats', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // 清理舊消息（管理員功能）
    static async cleanup(daysToKeep = 90) {
        try {
            const result = await database.run(
                `DELETE FROM messages 
                 WHERE created_at < datetime('now', '-${daysToKeep} days')
                 AND deleted_at IS NOT NULL`,
                []
            );

            logger.info('Message cleanup completed', {
                deletedCount: result.changes,
                daysToKeep
            });

            return result.changes;

        } catch (error) {
            logger.error('Failed to cleanup messages', {
                error: error.message,
                daysToKeep
            });
            throw error;
        }
    }

    // 批量刪除消息（管理員功能）
    static async bulkDelete(messageUuids, userId) {
        try {
            if (!Array.isArray(messageUuids) || messageUuids.length === 0) {
                throw new Error('Message UUIDs array is required');
            }

            const placeholders = messageUuids.map(() => '?').join(',');
            const result = await database.run(
                `UPDATE messages SET deleted_at = CURRENT_TIMESTAMP 
                 WHERE uuid IN (${placeholders}) AND deleted_at IS NULL`,
                messageUuids
            );

            logger.info('Bulk message deletion completed', {
                deletedCount: result.changes,
                userId,
                messageCount: messageUuids.length
            });

            return result.changes;

        } catch (error) {
            logger.error('Failed to bulk delete messages', {
                error: error.message,
                messageCount: messageUuids?.length,
                userId
            });
            throw error;
        }
    }

    // 獲取消息回復鏈
    async getReplyChain() {
        try {
            const chain = [];
            let currentMessage = this;

            while (currentMessage && currentMessage.replyTo) {
                const replyMessage = await Message.findByUuid(currentMessage.replyTo);
                if (replyMessage) {
                    chain.push(replyMessage);
                    currentMessage = replyMessage;
                } else {
                    break;
                }

                // 防止無限循環
                if (chain.length > 10) {
                    break;
                }
            }

            return chain;

        } catch (error) {
            logger.error('Failed to get reply chain', {
                error: error.message,
                messageId: this.uuid
            });
            throw error;
        }
    }

    // 檢查用戶是否能查看此消息
    async canUserView(userId) {
        try {
            // 系統消息所有人可見
            if (this.messageType === MESSAGE_TYPES.SYSTEM) {
                return true;
            }

            // 私人消息
            if (this.receiverUuid) {
                return this.senderUuid === userId || this.receiverUuid === userId;
            }

            // 房間消息
            if (this.roomUuid) {
                const membership = await database.get(
                    'SELECT 1 FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                    [this.roomUuid, userId]
                );
                return !!membership;
            }

            return false;

        } catch (error) {
            logger.error('Failed to check message view permission', {
                error: error.message,
                messageId: this.uuid,
                userId
            });
            return false;
        }
    }

    // 轉換為JSON格式
    toJSON() {
        return {
            uuid: this.uuid,
            roomUuid: this.roomUuid,
            senderUuid: this.senderUuid,
            receiverUuid: this.receiverUuid,
            content: this.content,
            messageType: this.messageType,
            replyTo: this.replyTo,
            forwardedFrom: this.forwardedFrom,
            editedAt: this.editedAt,
            deletedAt: this.deletedAt,
            createdAt: this.createdAt,
            // 包含額外信息（如果可用）
            senderUsername: this.senderUsername,
            senderAvatar: this.senderAvatar,
            replyContent: this.replyContent,
            replyUsername: this.replyUsername,
            roomName: this.roomName
        };
    }
}

module.exports = Message;