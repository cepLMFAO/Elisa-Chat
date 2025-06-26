const logger = require('../utils/logger');
const Message = require('../models/Message');
const Room = require('../models/room');
const RoomMember = require('../models/roomMember');
const File = require('../models/files');
const { WS_EVENTS, ERROR_CODES, MESSAGE_TYPES } = require('../utils/constants');
const { v4: uuidv4 } = require('uuid');

class ChatHandler {
    constructor(io, socketHandler) {
        this.io = io;
        this.socketHandler = socketHandler;
    }

    // 處理發送訊息
    async handleMessage(socket, data) {
        try {
            const { roomId, content, messageType = MESSAGE_TYPES.TEXT, replyTo, files } = data;
            const senderId = socket.userId;
            const sender = socket.user;

            logger.websocket('用戶發送訊息', senderId, {
                roomId,
                messageType,
                contentLength: content ? content.length : 0
            });

            // 驗證房間存在
            const room = await Room.findByUuid(roomId);
            if (!room) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ROOM_NOT_FOUND,
                    message: '房間不存在'
                });
                return;
            }

            // 檢查用戶是否為房間成員
            const membership = await RoomMember.findByRoomAndUser(roomId, senderId);
            if (!membership) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.NOT_ROOM_MEMBER,
                    message: '您不是房間成員'
                });
                return;
            }

            // 檢查用戶是否被禁言
            if (membership.muted_until && new Date(membership.muted_until) > new Date()) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ACCESS_DENIED,
                    message: '您已被禁言'
                });
                return;
            }

            // 創建訊息
            const messageUuid = uuidv4();
            const messageData = {
                uuid: messageUuid,
                roomUuid: roomId,
                senderUuid: senderId,
                content: content || '',
                messageType,
                replyTo: replyTo || null,
                metadata: JSON.stringify({
                    files: files || [],
                    edited: false
                })
            };

            const message = await Message.create(messageData);

            // 處理文件附件
            if (files && files.length > 0) {
                await this.handleMessageFiles(messageUuid, files);
            }

            // 構建完整訊息對象
            const fullMessage = {
                uuid: messageUuid,
                roomId,
                sender: {
                    uuid: senderId,
                    username: sender.username,
                    displayName: sender.displayName,
                    avatar: sender.avatar
                },
                content,
                messageType,
                replyTo,
                files: files || [],
                timestamp: new Date().toISOString(),
                edited: false,
                reactions: []
            };

            // 廣播訊息給房間所有成員
            this.io.to(`room:${roomId}`).emit(WS_EVENTS.MESSAGE_SENT, fullMessage);

            // 發送確認給發送者
            socket.emit(WS_EVENTS.MESSAGE_RECEIVED, {
                messageId: messageUuid,
                timestamp: fullMessage.timestamp
            });

            // 更新房間最後活動時間
            await room.updateLastActivity();

            logger.websocket('訊息發送成功', senderId, {
                messageId: messageUuid,
                roomId
            });

        } catch (error) {
            logger.error('發送訊息失敗', {
                error: error.message,
                userId: socket.userId,
                roomId: data.roomId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '發送訊息失敗'
            });
        }
    }

    // 處理私人訊息
    async handlePrivateMessage(socket, data) {
        try {
            const { receiverId, content, messageType = MESSAGE_TYPES.TEXT, files } = data;
            const senderId = socket.userId;
            const sender = socket.user;

            logger.websocket('用戶發送私人訊息', senderId, { receiverId });

            // 檢查接收者是否存在
            const User = require('../models/User');
            const receiver = await User.findByUuid(receiverId);
            if (!receiver) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.USER_NOT_FOUND,
                    message: '接收者不存在'
                });
                return;
            }

            // 檢查是否被對方封鎖
            const isBlocked = await this.checkIfBlocked(senderId, receiverId);
            if (isBlocked) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.USER_BLOCKED,
                    message: '無法發送訊息給此用戶'
                });
                return;
            }

            // 創建私人訊息
            const messageUuid = uuidv4();
            const messageData = {
                uuid: messageUuid,
                senderUuid: senderId,
                receiverUuid: receiverId,
                content: content || '',
                messageType,
                metadata: JSON.stringify({
                    files: files || [],
                    private: true
                })
            };

            await Message.create(messageData);

            // 處理文件附件
            if (files && files.length > 0) {
                await this.handleMessageFiles(messageUuid, files);
            }

            // 構建訊息對象
            const privateMessage = {
                uuid: messageUuid,
                sender: {
                    uuid: senderId,
                    username: sender.username,
                    displayName: sender.displayName,
                    avatar: sender.avatar
                },
                receiver: {
                    uuid: receiverId,
                    username: receiver.username,
                    displayName: receiver.displayName
                },
                content,
                messageType,
                files: files || [],
                timestamp: new Date().toISOString(),
                private: true
            };

            // 發送給接收者
            this.io.to(`user:${receiverId}`).emit(WS_EVENTS.PRIVATE_MESSAGE, privateMessage);

            // 發送確認給發送者
            socket.emit(WS_EVENTS.MESSAGE_RECEIVED, {
                messageId: messageUuid,
                timestamp: privateMessage.timestamp
            });

            logger.websocket('私人訊息發送成功', senderId, {
                messageId: messageUuid,
                receiverId
            });

        } catch (error) {
            logger.error('發送私人訊息失敗', {
                error: error.message,
                senderId: socket.userId,
                receiverId: data.receiverId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '發送私人訊息失敗'
            });
        }
    }

    // 處理訊息編輯
    async handleMessageEdit(socket, data) {
        try {
            const { messageId, newContent } = data;
            const userId = socket.userId;

            // 查找訊息
            const message = await Message.findByUuid(messageId);
            if (!message) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.MESSAGE_NOT_FOUND,
                    message: '訊息不存在'
                });
                return;
            }

            // 檢查是否為訊息發送者
            if (message.senderUuid !== userId) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ACCESS_DENIED,
                    message: '只能編輯自己的訊息'
                });
                return;
            }

            // 檢查訊息是否過期（5分鐘內可編輯）
            const messageAge = Date.now() - new Date(message.createdAt).getTime();
            if (messageAge > 5 * 60 * 1000) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ACCESS_DENIED,
                    message: '訊息編輯時間已過期'
                });
                return;
            }

            // 更新訊息
            await message.edit(newContent);

            // 構建編輯事件
            const editEvent = {
                messageId,
                newContent,
                editedAt: new Date().toISOString(),
                editedBy: userId
            };

            // 廣播編輯事件
            if (message.roomUuid) {
                this.io.to(`room:${message.roomUuid}`).emit(WS_EVENTS.MESSAGE_EDITED, editEvent);
            } else if (message.receiverUuid) {
                this.io.to(`user:${message.receiverUuid}`).emit(WS_EVENTS.MESSAGE_EDITED, editEvent);
                socket.emit(WS_EVENTS.MESSAGE_EDITED, editEvent);
            }

            logger.websocket('訊息編輯成功', userId, { messageId });

        } catch (error) {
            logger.error('編輯訊息失敗', {
                error: error.message,
                userId: socket.userId,
                messageId: data.messageId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '編輯訊息失敗'
            });
        }
    }

    // 處理訊息刪除
    async handleMessageDelete(socket, data) {
        try {
            const { messageId } = data;
            const userId = socket.userId;

            // 查找訊息
            const message = await Message.findByUuid(messageId);
            if (!message) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.MESSAGE_NOT_FOUND,
                    message: '訊息不存在'
                });
                return;
            }

            // 檢查刪除權限
            let canDelete = false;

            if (message.senderUuid === userId) {
                // 發送者可以刪除自己的訊息
                canDelete = true;
            } else if (message.roomUuid) {
                // 房間管理員可以刪除房間訊息
                const membership = await RoomMember.findByRoomAndUser(message.roomUuid, userId);
                if (membership && ['owner', 'admin', 'moderator'].includes(membership.role)) {
                    canDelete = true;
                }
            }

            if (!canDelete) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ACCESS_DENIED,
                    message: '無權限刪除此訊息'
                });
                return;
            }

            // 刪除訊息
            await message.delete();

            // 構建刪除事件
            const deleteEvent = {
                messageId,
                deletedAt: new Date().toISOString(),
                deletedBy: userId
            };

            // 廣播刪除事件
            if (message.roomUuid) {
                this.io.to(`room:${message.roomUuid}`).emit(WS_EVENTS.MESSAGE_DELETED, deleteEvent);
            } else if (message.receiverUuid) {
                this.io.to(`user:${message.receiverUuid}`).emit(WS_EVENTS.MESSAGE_DELETED, deleteEvent);
                socket.emit(WS_EVENTS.MESSAGE_DELETED, deleteEvent);
            }

            logger.websocket('訊息刪除成功', userId, { messageId });

        } catch (error) {
            logger.error('刪除訊息失敗', {
                error: error.message,
                userId: socket.userId,
                messageId: data.messageId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '刪除訊息失敗'
            });
        }
    }

    // 處理訊息反應
    async handleMessageReaction(socket, data) {
        try {
            const { messageId, emoji, action = 'add' } = data; // action: 'add' | 'remove'
            const userId = socket.userId;

            // 查找訊息
            const message = await Message.findByUuid(messageId);
            if (!message) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.MESSAGE_NOT_FOUND,
                    message: '訊息不存在'
                });
                return;
            }

            // 檢查用戶是否能看到此訊息
            const canAccess = await this.checkMessageAccess(userId, message);
            if (!canAccess) {
                socket.emit(WS_EVENTS.ERROR, {
                    code: ERROR_CODES.ACCESS_DENIED,
                    message: '無權限訪問此訊息'
                });
                return;
            }

            // 處理反應
            const database = require('../config/database');

            if (action === 'add') {
                // 添加反應
                await database.run(`
                    INSERT OR IGNORE INTO message_reactions 
                    (message_uuid, user_uuid, emoji) 
                    VALUES (?, ?, ?)
                `, [messageId, userId, emoji]);
            } else {
                // 移除反應
                await database.run(`
                    DELETE FROM message_reactions 
                    WHERE message_uuid = ? AND user_uuid = ? AND emoji = ?
                `, [messageId, userId, emoji]);
            }

            // 獲取更新後的反應統計
            const reactions = await database.query(`
                SELECT emoji, COUNT(*) as count, 
                       GROUP_CONCAT(u.username) as users
                FROM message_reactions mr
                JOIN users u ON mr.user_uuid = u.uuid
                WHERE mr.message_uuid = ?
                GROUP BY emoji
            `, [messageId]);

            // 構建反應事件
            const reactionEvent = {
                messageId,
                userId,
                emoji,
                action,
                reactions,
                timestamp: new Date().toISOString()
            };

            // 廣播反應事件
            if (message.roomUuid) {
                this.io.to(`room:${message.roomUuid}`).emit(WS_EVENTS.MESSAGE_REACTION, reactionEvent);
            } else if (message.receiverUuid) {
                this.io.to(`user:${message.receiverUuid}`).emit(WS_EVENTS.MESSAGE_REACTION, reactionEvent);
                socket.emit(WS_EVENTS.MESSAGE_REACTION, reactionEvent);
            }

            logger.websocket('訊息反應處理成功', userId, {
                messageId,
                emoji,
                action
            });

        } catch (error) {
            logger.error('處理訊息反應失敗', {
                error: error.message,
                userId: socket.userId,
                messageId: data.messageId
            });

            socket.emit(WS_EVENTS.ERROR, {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: '處理反應失敗'
            });
        }
    }

    // 處理訊息文件
    async handleMessageFiles(messageUuid, files) {
        try {
            for (const fileId of files) {
                const file = await File.findByUuid(fileId);
                if (file) {
                    // 關聯文件到訊息
                    await file.update({ messageUuid });
                }
            }
        } catch (error) {
            logger.error('處理訊息文件失敗', {
                error: error.message,
                messageUuid,
                files
            });
        }
    }

    // 檢查用戶是否被封鎖
    async checkIfBlocked(senderId, receiverId) {
        try {
            const database = require('../config/database');
            const result = await database.get(`
                SELECT 1 FROM blocked_users 
                WHERE blocker_uuid = ? AND blocked_uuid = ?
            `, [receiverId, senderId]);

            return !!result;
        } catch (error) {
            logger.error('檢查封鎖狀態失敗', { senderId, receiverId });
            return false;
        }
    }

    // 檢查訊息訪問權限
    async checkMessageAccess(userId, message) {
        try {
            if (message.roomUuid) {
                // 房間訊息：檢查是否為房間成員
                const membership = await RoomMember.findByRoomAndUser(message.roomUuid, userId);
                return !!membership;
            } else {
                // 私人訊息：檢查是否為發送者或接收者
                return message.senderUuid === userId || message.receiverUuid === userId;
            }
        } catch (error) {
            logger.error('檢查訊息訪問權限失敗', { userId, messageId: message.uuid });
            return false;
        }
    }
}

module.exports = ChatHandler;