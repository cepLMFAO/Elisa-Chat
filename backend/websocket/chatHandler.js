const database = require('../config/database');
const logger = require('../utils/logger');
const { WS_EVENTS } = require('../config/constants');

class ChatHandler {
    constructor(io, socketHandler) {
        this.io = io;
        this.socketHandler = socketHandler;
    }

    // 處理發送消息
    async handleMessage(socket, data) {
        try {
            const { roomId, content, type = 'text', replyTo = null } = data;
            const userId = socket.userId;

            if (!roomId || !content) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '房間ID和消息內容是必需的',
                    code: 'INVALID_MESSAGE_DATA'
                });
                return;
            }

            // 檢查用戶是否是房間成員
            const membership = await database.get(
                'SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [roomId, userId]
            );

            if (!membership) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '您不是此房間的成員',
                    code: 'NOT_ROOM_MEMBER'
                });
                return;
            }

            // 創建消息
            const { v4: uuidv4 } = require('uuid');
            const messageUuid = uuidv4();

            await database.run(
                `INSERT INTO messages (uuid, room_uuid, user_uuid, content, type, reply_to, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [messageUuid, roomId, userId, content, type, replyTo]
            );

            // 獲取完整消息信息
            const message = await database.get(
                `SELECT m.*, u.username, u.avatar
                 FROM messages m
                 JOIN users u ON m.user_uuid = u.uuid
                 WHERE m.uuid = ?`,
                [messageUuid]
            );

            const messageData = {
                id: message.uuid,
                roomId: message.room_uuid,
                content: message.content,
                type: message.type,
                replyTo: message.reply_to,
                sender: {
                    id: message.user_uuid,
                    username: message.username,
                    avatar: message.avatar
                },
                timestamp: message.created_at,
                editedAt: message.updated_at !== message.created_at ? message.updated_at : null
            };

            // 廣播消息到房間內所有成員
            this.io.to(`room:${roomId}`).emit(WS_EVENTS.MESSAGE, messageData);

            // 更新房間最後活動時間
            await database.run(
                'UPDATE rooms SET last_activity = CURRENT_TIMESTAMP WHERE uuid = ?',
                [roomId]
            );

            logger.websocket('Message sent', userId, {
                messageId: messageUuid,
                roomId,
                messageType: type
            });

        } catch (error) {
            logger.error('Failed to handle message', {
                error: error.message,
                userId: socket.userId,
                messageData: data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '發送消息失敗',
                code: 'SEND_MESSAGE_FAILED'
            });
        }
    }

    // 處理私人消息
    async handlePrivateMessage(socket, data) {
        try {
            const { targetUserId, content, type = 'text' } = data;
            const senderUserId = socket.userId;

            if (!targetUserId || !content) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '目標用戶ID和消息內容是必需的',
                    code: 'INVALID_PRIVATE_MESSAGE_DATA'
                });
                return;
            }

            // 檢查目標用戶是否存在
            const targetUser = await database.get(
                'SELECT uuid, username, avatar FROM users WHERE uuid = ?',
                [targetUserId]
            );

            if (!targetUser) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '目標用戶不存在',
                    code: 'TARGET_USER_NOT_FOUND'
                });
                return;
            }

            // 創建或獲取私人聊天房間
            let privateRoom = await database.get(
                `SELECT uuid FROM rooms 
                 WHERE type = 'direct' 
                 AND uuid IN (
                     SELECT room_uuid FROM room_members 
                     WHERE user_uuid = ? 
                     INTERSECT 
                     SELECT room_uuid FROM room_members 
                     WHERE user_uuid = ?
                 )`,
                [senderUserId, targetUserId]
            );

            if (!privateRoom) {
                // 創建新的私人聊天房間
                const { v4: uuidv4 } = require('uuid');
                const roomUuid = uuidv4();

                await database.run(
                    `INSERT INTO rooms (uuid, name, type, created_by, created_at, updated_at)
                     VALUES (?, ?, 'direct', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [roomUuid, `${socket.user.username} & ${targetUser.username}`, senderUserId]
                );

                // 添加兩個用戶為房間成員
                await database.run(
                    `INSERT INTO room_members (room_uuid, user_uuid, role, joined_at)
                     VALUES (?, ?, 'member', CURRENT_TIMESTAMP), (?, ?, 'member', CURRENT_TIMESTAMP)`,
                    [roomUuid, senderUserId, roomUuid, targetUserId]
                );

                privateRoom = { uuid: roomUuid };
            }

            // 創建消息
            const { v4: uuidv4 } = require('uuid');
            const messageUuid = uuidv4();

            await database.run(
                `INSERT INTO messages (uuid, room_uuid, user_uuid, content, type, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [messageUuid, privateRoom.uuid, senderUserId, content, type]
            );

            const messageData = {
                id: messageUuid,
                roomId: privateRoom.uuid,
                content: content,
                type: type,
                sender: {
                    id: senderUserId,
                    username: socket.user.username,
                    avatar: socket.user.avatar
                },
                timestamp: new Date().toISOString(),
                isPrivate: true
            };

            // 發送給發送者和接收者
            socket.emit(WS_EVENTS.PRIVATE_MESSAGE, messageData);
            this.io.to(`user:${targetUserId}`).emit(WS_EVENTS.PRIVATE_MESSAGE, messageData);

            logger.websocket('Private message sent', senderUserId, {
                messageId: messageUuid,
                targetUserId,
                messageType: type
            });

        } catch (error) {
            logger.error('Failed to handle private message', {
                error: error.message,
                userId: socket.userId,
                messageData: data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '發送私人消息失敗',
                code: 'SEND_PRIVATE_MESSAGE_FAILED'
            });
        }
    }

    // 處理消息反應
    async handleMessageReaction(socket, data) {
        try {
            const { messageId, emoji, action = 'add' } = data;
            const userId = socket.userId;

            if (!messageId || !emoji) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '消息ID和表情符號是必需的',
                    code: 'INVALID_REACTION_DATA'
                });
                return;
            }

            // 獲取消息信息
            const message = await database.get(
                'SELECT room_uuid FROM messages WHERE uuid = ?',
                [messageId]
            );

            if (!message) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '消息不存在',
                    code: 'MESSAGE_NOT_FOUND'
                });
                return;
            }

            // 檢查用戶是否有權限對此消息做反應
            const membership = await database.get(
                'SELECT * FROM room_members WHERE room_uuid = ? AND user_uuid = ?',
                [message.room_uuid, userId]
            );

            if (!membership) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '無權限對此消息做反應',
                    code: 'NO_REACTION_PERMISSION'
                });
                return;
            }

            if (action === 'add') {
                // 添加反應
                await database.run(
                    `INSERT OR REPLACE INTO message_reactions (message_uuid, user_uuid, emoji, created_at)
                     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                    [messageId, userId, emoji]
                );
            } else if (action === 'remove') {
                // 移除反應
                await database.run(
                    'DELETE FROM message_reactions WHERE message_uuid = ? AND user_uuid = ? AND emoji = ?',
                    [messageId, userId, emoji]
                );
            }

            // 獲取消息的所有反應
            const reactions = await database.query(
                `SELECT emoji, COUNT(*) as count, GROUP_CONCAT(u.username) as users
                 FROM message_reactions mr
                 JOIN users u ON mr.user_uuid = u.uuid
                 WHERE mr.message_uuid = ?
                 GROUP BY emoji`,
                [messageId]
            );

            const reactionData = {
                messageId,
                reactions: reactions.map(r => ({
                    emoji: r.emoji,
                    count: r.count,
                    users: r.users.split(',')
                })),
                user: {
                    id: userId,
                    username: socket.user.username
                },
                action,
                emoji,
                timestamp: new Date().toISOString()
            };

            // 廣播反應到房間
            this.io.to(`room:${message.room_uuid}`).emit(WS_EVENTS.MESSAGE_REACTION, reactionData);

            logger.websocket('Message reaction', userId, {
                messageId,
                emoji,
                action
            });

        } catch (error) {
            logger.error('Failed to handle message reaction', {
                error: error.message,
                userId: socket.userId,
                reactionData: data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '反應操作失敗',
                code: 'REACTION_FAILED'
            });
        }
    }

    // 處理消息編輯
    async handleEditMessage(socket, data) {
        try {
            const { messageId, newContent } = data;
            const userId = socket.userId;

            if (!messageId || !newContent) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '消息ID和新內容是必需的',
                    code: 'INVALID_EDIT_DATA'
                });
                return;
            }

            // 檢查消息是否存在且是用戶發送的
            const message = await database.get(
                'SELECT * FROM messages WHERE uuid = ? AND user_uuid = ?',
                [messageId, userId]
            );

            if (!message) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '消息不存在或無權限編輯',
                    code: 'MESSAGE_NOT_EDITABLE'
                });
                return;
            }

            // 更新消息內容
            await database.run(
                'UPDATE messages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [newContent, messageId]
            );

            const editData = {
                messageId,
                newContent,
                editedAt: new Date().toISOString(),
                editor: {
                    id: userId,
                    username: socket.user.username
                }
            };

            // 廣播編輯事件到房間
            this.io.to(`room:${message.room_uuid}`).emit(WS_EVENTS.MESSAGE_EDITED, editData);

            logger.websocket('Message edited', userId, {
                messageId,
                roomId: message.room_uuid
            });

        } catch (error) {
            logger.error('Failed to edit message', {
                error: error.message,
                userId: socket.userId,
                editData: data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '編輯消息失敗',
                code: 'EDIT_MESSAGE_FAILED'
            });
        }
    }

    // 處理消息刪除
    async handleDeleteMessage(socket, data) {
        try {
            const { messageId } = data;
            const userId = socket.userId;

            if (!messageId) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '消息ID是必需的',
                    code: 'MESSAGE_ID_REQUIRED'
                });
                return;
            }

            // 檢查消息是否存在且用戶有權限刪除
            const message = await database.get(
                `SELECT m.*, rm.role 
                 FROM messages m
                 JOIN room_members rm ON m.room_uuid = rm.room_uuid
                 WHERE m.uuid = ? AND (m.user_uuid = ? OR rm.role IN ('owner', 'admin'))`,
                [messageId, userId, userId]
            );

            if (!message) {
                socket.emit(WS_EVENTS.ERROR, {
                    message: '消息不存在或無權限刪除',
                    code: 'MESSAGE_NOT_DELETABLE'
                });
                return;
            }

            // 軟刪除消息
            await database.run(
                'UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE uuid = ?',
                [messageId]
            );

            const deleteData = {
                messageId,
                deletedAt: new Date().toISOString(),
                deletedBy: {
                    id: userId,
                    username: socket.user.username
                }
            };

            // 廣播刪除事件到房間
            this.io.to(`room:${message.room_uuid}`).emit(WS_EVENTS.MESSAGE_DELETED, deleteData);

            logger.websocket('Message deleted', userId, {
                messageId,
                roomId: message.room_uuid
            });

        } catch (error) {
            logger.error('Failed to delete message', {
                error: error.message,
                userId: socket.userId,
                deleteData: data
            });

            socket.emit(WS_EVENTS.ERROR, {
                message: '刪除消息失敗',
                code: 'DELETE_MESSAGE_FAILED'
            });
        }
    }
}

module.exports = ChatHandler;