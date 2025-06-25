const Message = require('../models/messages');
const User = require('../models/User');
const database = require('../config/database');
const logger = require('../utils/logger');
const { MESSAGE_TYPES, SYSTEM, NOTIFICATION_TYPES } = require('../config/constants');

class ChatService {
    // 發送訊息
    static async sendMessage(messageData) {
        try {
            const { senderUuid, roomUuid, receiverUuid, content, messageType, replyTo } = messageData;

            // 驗證發送者
            const sender = await User.findByUuid(senderUuid);
            if (!sender) {
                throw new Error('發送者不存在');
            }

            // 如果是房間訊息，檢查權限
            if (roomUuid) {
                const hasPermission = await ChatService.checkRoomMessagePermission(senderUuid, roomUuid);
                if (!hasPermission) {
                    throw new Error('無權在此房間發送訊息');
                }
            }

            // 如果是私人訊息，檢查是否被封鎖
            if (receiverUuid) {
                const isBlocked = await ChatService.checkIfBlocked(senderUuid, receiverUuid);
                if (isBlocked) {
                    throw new Error('無法發送訊息給此用戶');
                }
            }

            // 檢查訊息內容
            const sanitizedContent = ChatService.sanitizeMessageContent(content);
            if (!sanitizedContent) {
                throw new Error('訊息內容無效');
            }

            // 創建訊息
            const message = await Message.create({
                senderUuid,
                roomUuid,
                receiverUuid,
                content: sanitizedContent,
                messageType: messageType || MESSAGE_TYPES.TEXT,
                replyTo
            });

            // 更新最後活動時間
            await sender.updateStatus(sender.status);

            // 如果是回覆訊息，創建通知
            if (replyTo) {
                await ChatService.createReplyNotification(message, replyTo);
            }

            // 如果是私人訊息，創建通知
            if (receiverUuid && !roomUuid) {
                await ChatService.createPrivateMessageNotification(message);
            }

            logger.info('訊息發送成功', {
                messageId: message.uuid,
                senderId: senderUuid,
                roomId: roomUuid,
                receiverId: receiverUuid,
                type: messageType
            });

            return message;

        } catch (error) {
            logger.error('發送訊息失敗', {
                error: error.message,
                messageData
            });
            throw error;
        }
    }

    // 檢查房間訊息權限
    static async checkRoomMessagePermission(userId, roomUuid) {
        try {
            const membership = await database.get(
                'SELECT role, muted_until FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomUuid, userId]
            );

            if (!membership) {
                return false; // 不是房間成員
            }

            // 檢查是否被靜音
            if (membership.muted_until && new Date(membership.muted_until) > new Date()) {
                return false; // 被靜音中
            }

            return true;

        } catch (error) {
            logger.error('檢查房間訊息權限失敗', {
                error: error.message,
                userId,
                roomUuid
            });
            return false;
        }
    }

    // 檢查是否被封鎖
    static async checkIfBlocked(senderUuid, receiverUuid) {
        try {
            const blocked = await database.get(
                'SELECT 1 FROM blocked_users WHERE blocker_uuid = ? AND blocked_uuid = ?',
                [receiverUuid, senderUuid]
            );

            return !!blocked;

        } catch (error) {
            logger.error('檢查封鎖狀態失敗', {
                error: error.message,
                senderUuid,
                receiverUuid
            });
            return false;
        }
    }

    // 訊息內容淨化
    static sanitizeMessageContent(content) {
        if (!content || typeof content !== 'string') {
            return null;
        }

        // 移除潛在的惡意內容
        const cleaned = content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();

        // 檢查長度
        if (cleaned.length === 0 || cleaned.length > SYSTEM.MAX_MESSAGE_LENGTH) {
            return null;
        }

        return cleaned;
    }

    // 創建回覆通知
    static async createReplyNotification(message, replyToUuid) {
        try {
            const originalMessage = await Message.findByUuid(replyToUuid);
            if (!originalMessage || originalMessage.senderUuid === message.senderUuid) {
                return; // 不給自己創建通知
            }

            const sender = await User.findByUuid(message.senderUuid);
            if (!sender) return;

            const notificationUuid = require('uuid').v4();
            await database.run(
                `INSERT INTO notifications (uuid, user_uuid, type, title, content, data, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    notificationUuid,
                    originalMessage.senderUuid,
                    NOTIFICATION_TYPES.MENTION,
                    '有人回覆了您的訊息',
                    `${sender.username} 回覆了您的訊息`,
                    JSON.stringify({
                        messageId: message.uuid,
                        originalMessageId: replyToUuid,
                        senderId: message.senderUuid,
                        senderName: sender.username,
                        content: message.content.substring(0, 100)
                    })
                ]
            );

        } catch (error) {
            logger.error('創建回覆通知失敗', {
                error: error.message,
                messageId: message.uuid,
                replyToUuid
            });
        }
    }

    // 創建私人訊息通知
    static async createPrivateMessageNotification(message) {
        try {
            const sender = await User.findByUuid(message.senderUuid);
            if (!sender) return;

            const notificationUuid = require('uuid').v4();
            await database.run(
                `INSERT INTO notifications (uuid, user_uuid, type, title, content, data, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    notificationUuid,
                    message.receiverUuid,
                    NOTIFICATION_TYPES.MESSAGE,
                    '新的私人訊息',
                    `${sender.username} 向您發送了一條訊息`,
                    JSON.stringify({
                        messageId: message.uuid,
                        senderId: message.senderUuid,
                        senderName: sender.username,
                        content: message.content.substring(0, 100)
                    })
                ]
            );

        } catch (error) {
            logger.error('創建私人訊息通知失敗', {
                error: error.message,
                messageId: message.uuid
            });
        }
    }

    // 檢查是否提及用戶
    static extractMentions(content) {
        const mentionRegex = /@(\w+)/g;
        const mentions = [];
        let match;

        while ((match = mentionRegex.exec(content)) !== null) {
            mentions.push(match[1]);
        }

        return mentions;
    }

    // 處理訊息提及
    static async handleMentions(message, mentions) {
        try {
            if (!mentions || mentions.length === 0) return;

            const sender = await User.findByUuid(message.senderUuid);
            if (!sender) return;

            for (const username of mentions) {
                const mentionedUser = await User.findByUsername(username);
                if (!mentionedUser || mentionedUser.uuid === message.senderUuid) {
                    continue; // 跳過不存在的用戶或自己
                }

                // 檢查被提及用戶是否能看到此訊息
                const canView = await message.canUserView(mentionedUser.uuid);
                if (!canView) continue;

                // 創建提及通知
                const notificationUuid = require('uuid').v4();
                await database.run(
                    `INSERT INTO notifications (uuid, user_uuid, type, title, content, data, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [
                        notificationUuid,
                        mentionedUser.uuid,
                        NOTIFICATION_TYPES.MENTION,
                        '有人提及了您',
                        `${sender.username} 在訊息中提及了您`,
                        JSON.stringify({
                            messageId: message.uuid,
                            senderId: message.senderUuid,
                            senderName: sender.username,
                            roomId: message.roomUuid,
                            content: message.content.substring(0, 100)
                        })
                    ]
                );

                logger.info('創建提及通知', {
                    messageId: message.uuid,
                    mentionedUserId: mentionedUser.uuid,
                    mentionedUsername: username
                });
            }

        } catch (error) {
            logger.error('處理訊息提及失敗', {
                error: error.message,
                messageId: message.uuid,
                mentions
            });
        }
    }

    // 獲取訊息歷史記錄
    static async getMessageHistory(roomUuid, userId, page = 1, limit = 50) {
        try {
            // 檢查用戶權限
            if (roomUuid) {
                const hasPermission = await ChatService.checkRoomMessagePermission(userId, roomUuid);
                if (!hasPermission) {
                    throw new Error('無權查看此房間的訊息');
                }
            }

            const result = await Message.getByRoom(roomUuid, page, limit, userId);
            return result;

        } catch (error) {
            logger.error('獲取訊息歷史失敗', {
                error: error.message,
                roomUuid,
                userId
            });
            throw error;
        }
    }

    // 標記訊息為已讀
    static async markMessagesAsRead(userId, roomUuid) {
        try {
            // 更新最後閱讀時間
            await database.run(
                `INSERT OR REPLACE INTO user_settings (user_uuid, setting_key, setting_value, updated_at)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [userId, `last_read_${roomUuid}`, new Date().toISOString()]
            );

            logger.debug('訊息標記為已讀', {
                userId,
                roomUuid
            });

            return true;

        } catch (error) {
            logger.error('標記訊息已讀失敗', {
                error: error.message,
                userId,
                roomUuid
            });
            throw error;
        }
    }
    // 搜索訊息
    static async searchMessages(query, options = {}) {
        try {
            const { userId, roomUuid, page = 1, limit = 20 } = options;

            const result = await Message.search(query, roomUuid, userId, page, limit);
            return result;

        } catch (error) {
            logger.error('搜索訊息失敗', {
                error: error.message,
                query,
                options
            });
            throw error;
        }
    }

    // 獲取未讀訊息數
    static async getUnreadCount(userId) {
        try {
            // 獲取用戶加入的所有房間
            const rooms = await database.query(
                'SELECT room_uuid, joined_at FROM room_members WHERE user_uuid = ?',
                [userId]
            );

            let totalUnread = 0;
            const roomUnread = {};

            for (const room of rooms) {
                // 獲取最後閱讀時間
                const lastRead = await database.get(
                    'SELECT setting_value FROM user_settings WHERE user_uuid = ? AND setting_key = ?',
                    [userId, `last_read_${room.room_uuid}`]
                );

                const lastReadTime = lastRead ? lastRead.setting_value : room.joined_at;

                // 計算未讀訊息數
                const unreadCount = await database.get(
                    `SELECT COUNT(*) as count FROM messages 
                     WHERE room_uuid = ? 
                     AND sender_uuid != ? 
                     AND created_at > ?
                     AND deleted_at IS NULL`,
                    [room.room_uuid, userId, lastReadTime]
                );

                roomUnread[room.room_uuid] = unreadCount.count || 0;
                totalUnread += unreadCount.count || 0;
            }

            // 獲取私人訊息未讀數
            const privateUnread = await database.get(
                `SELECT COUNT(*) as count FROM messages
                 WHERE receiver_uuid = ?
                 AND sender_uuid != ?
                 AND deleted_at IS NULL`,
                [userId, userId]
            );

            return {
                total: totalUnread + (privateUnread.count || 0),
                rooms: roomUnread,
                private: privateUnread.count || 0
            };

        } catch (error) {
            logger.error('獲取未讀訊息數失敗', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // 刪除訊息
    static async deleteMessage(messageUuid, userId, isAdmin = false) {
        try {
            const message = await Message.findByUuid(messageUuid);
            if (!message) {
                throw new Error('訊息不存在');
            }

            await message.delete(userId, isAdmin);

            logger.info('訊息刪除成功', {
                messageId: messageUuid,
                deletedBy: userId,
                isAdmin
            });

            return message;

        } catch (error) {
            logger.error('刪除訊息失敗', {
                error: error.message,
                messageUuid,
                userId
            });
            throw error;
        }
    }

    // 編輯訊息
    static async editMessage(messageUuid, newContent, userId) {
        try {
            const message = await Message.findByUuid(messageUuid);
            if (!message) {
                throw new Error('訊息不存在');
            }

            const sanitizedContent = ChatService.sanitizeMessageContent(newContent);
            if (!sanitizedContent) {
                throw new Error('訊息內容無效');
            }

            await message.edit(sanitizedContent, userId);

            logger.info('訊息編輯成功', {
                messageId: messageUuid,
                editedBy: userId
            });

            return message;

        } catch (error) {
            logger.error('編輯訊息失敗', {
                error: error.message,
                messageUuid,
                userId
            });
            throw error;
        }
    }

    // 轉發訊息
    static async forwardMessage(messageUuid, targetRoomUuid, targetUserUuid, forwarderUuid) {
        try {
            const originalMessage = await Message.findByUuid(messageUuid);
            if (!originalMessage) {
                throw new Error('原始訊息不存在');
            }

            // 檢查轉發者是否能查看原始訊息
            const canView = await originalMessage.canUserView(forwarderUuid);
            if (!canView) {
                throw new Error('無權轉發此訊息');
            }

            // 檢查目標權限
            if (targetRoomUuid) {
                const hasPermission = await ChatService.checkRoomMessagePermission(forwarderUuid, targetRoomUuid);
                if (!hasPermission) {
                    throw new Error('無權向此房間轉發訊息');
                }
            }

            if (targetUserUuid) {
                const isBlocked = await ChatService.checkIfBlocked(forwarderUuid, targetUserUuid);
                if (isBlocked) {
                    throw new Error('無法轉發訊息給此用戶');
                }
            }

            const forwardedMessage = await Message.forward(
                messageUuid,
                targetRoomUuid,
                targetUserUuid,
                forwarderUuid
            );

            logger.info('訊息轉發成功', {
                originalMessageId: messageUuid,
                forwardedMessageId: forwardedMessage.uuid,
                forwarderId: forwarderUuid
            });

            return forwardedMessage;

        } catch (error) {
            logger.error('轉發訊息失敗', {
                error: error.message,
                messageUuid,
                forwarderUuid
            });
            throw error;
        }
    }

    // 清理舊訊息
    static async cleanupOldMessages(daysToKeep = 90) {
        try {
            const deletedCount = await Message.cleanup(daysToKeep);

            logger.info('舊訊息清理完成', {
                deletedCount,
                daysToKeep
            });

            return deletedCount;

        } catch (error) {
            logger.error('清理舊訊息失敗', {
                error: error.message,
                daysToKeep
            });
            throw error;
        }
    }

    // 獲取聊天統計
    static async getChatStatistics(userId) {
        try {
            const stats = await Message.getUserStats(userId);

            // 獲取最活躍的聊天房間
            const activeRooms = await database.query(
                `SELECT r.uuid, r.name, COUNT(m.uuid) as message_count
                 FROM room_members rm
                 JOIN rooms r ON rm.room_uuid = r.uuid
                 LEFT JOIN messages m ON r.uuid = m.room_uuid AND m.sender_uuid = ?
                 WHERE rm.user_uuid = ?
                 GROUP BY r.uuid, r.name
                 ORDER BY message_count DESC
                 LIMIT 5`,
                [userId, userId]
            );

            return {
                ...stats,
                activeRooms
            };

        } catch (error) {
            logger.error('獲取聊天統計失敗', {
                error: error.message,
                userId
            });
            throw error;
        }
    }
}

module.exports = ChatService;