const webpush = require('web-push');
const database = require('../config/database');
const logger = require('../utils/logger');
const { NOTIFICATION_TYPES } = require('../config/constants');

class PushService {
    constructor() {
        this.isInitialized = false;
        this.initialize();
    }

    // 初始化推送服務
    initialize() {
        try {
            // 設置VAPID密鑰
            const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
            const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
            const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@elitechat.com';

            if (vapidPublicKey && vapidPrivateKey) {
                webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
                this.isInitialized = true;
                logger.info('推送服務初始化成功');
            } else {
                logger.warn('推送服務未配置VAPID密鑰');
            }
        } catch (error) {
            logger.error('推送服務初始化失敗', { error: error.message });
        }
    }

    // 訂閱推送通知
    async subscribe(userId, subscription) {
        try {
            if (!this.isInitialized) {
                throw new Error('推送服務未初始化');
            }

            // 驗證訂閱數據
            if (!subscription.endpoint || !subscription.keys) {
                throw new Error('無效的訂閱數據');
            }

            // 檢查是否已存在相同的訂閱
            const existingSubscription = await database.get(
                'SELECT id FROM push_subscriptions WHERE user_uuid = ? AND endpoint = ?',
                [userId, subscription.endpoint]
            );

            if (existingSubscription) {
                // 更新現有訂閱
                await database.run(
                    `UPDATE push_subscriptions 
                     SET auth_key = ?, p256dh_key = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [
                        subscription.keys.auth,
                        subscription.keys.p256dh,
                        existingSubscription.id
                    ]
                );

                logger.info('推送訂閱更新成功', { userId, endpoint: subscription.endpoint });
            } else {
                // 創建新訂閱
                await database.run(
                    `INSERT INTO push_subscriptions (user_uuid, endpoint, auth_key, p256dh_key, created_at)
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [
                        userId,
                        subscription.endpoint,
                        subscription.keys.auth,
                        subscription.keys.p256dh
                    ]
                );

                logger.info('推送訂閱創建成功', { userId, endpoint: subscription.endpoint });
            }

            return { success: true };

        } catch (error) {
            logger.error('推送訂閱失敗', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // 取消訂閱
    async unsubscribe(userId, endpoint = null) {
        try {
            let query = 'DELETE FROM push_subscriptions WHERE user_uuid = ?';
            let params = [userId];

            if (endpoint) {
                query += ' AND endpoint = ?';
                params.push(endpoint);
            }

            const result = await database.run(query, params);

            logger.info('推送訂閱取消成功', {
                userId,
                endpoint,
                deletedCount: result.changes
            });

            return { success: true, deletedCount: result.changes };

        } catch (error) {
            logger.error('取消推送訂閱失敗', {
                error: error.message,
                userId,
                endpoint
            });
            throw error;
        }
    }

    // 發送推送通知
    async sendNotification(userId, notification) {
        try {
            if (!this.isInitialized) {
                logger.warn('推送服務未初始化，跳過發送');
                return { success: false, reason: '推送服務未初始化' };
            }

            // 獲取用戶的所有推送訂閱
            const subscriptions = await database.query(
                'SELECT * FROM push_subscriptions WHERE user_uuid = ?',
                [userId]
            );

            if (subscriptions.length === 0) {
                logger.debug('用戶沒有推送訂閱', { userId });
                return { success: false, reason: '沒有推送訂閱' };
            }

            const results = [];
            const payload = JSON.stringify({
                title: notification.title,
                body: notification.body,
                icon: notification.icon || '/icon-192x192.png',
                badge: notification.badge || '/badge-72x72.png',
                image: notification.image,
                data: notification.data,
                actions: notification.actions,
                tag: notification.tag,
                requireInteraction: notification.requireInteraction || false,
                silent: notification.silent || false
            });

            // 向每個訂閱端點發送通知
            for (const subscription of subscriptions) {
                try {
                    const pushSubscription = {
                        endpoint: subscription.endpoint,
                        keys: {
                            auth: subscription.auth_key,
                            p256dh: subscription.p256dh_key
                        }
                    };

                    const options = {
                        TTL: 24 * 60 * 60, // 24小時
                        urgency: notification.urgency || 'normal',
                        topic: notification.topic
                    };

                    await webpush.sendNotification(pushSubscription, payload, options);

                    results.push({
                        endpoint: subscription.endpoint,
                        success: true
                    });

                } catch (error) {
                    logger.error('發送推送通知到特定端點失敗', {
                        error: error.message,
                        endpoint: subscription.endpoint,
                        userId
                    });

                    results.push({
                        endpoint: subscription.endpoint,
                        success: false,
                        error: error.message
                    });

                    // 如果是410錯誤（端點已失效），刪除訂閱
                    if (error.statusCode === 410) {
                        await this.removeInvalidSubscription(subscription.id);
                    }
                }
            }

            const successCount = results.filter(r => r.success).length;
            logger.info('推送通知發送完成', {
                userId,
                totalSubscriptions: subscriptions.length,
                successCount,
                title: notification.title
            });

            return {
                success: successCount > 0,
                results,
                successCount,
                totalSubscriptions: subscriptions.length
            };

        } catch (error) {
            logger.error('發送推送通知失敗', {
                error: error.message,
                userId,
                notification: notification.title
            });
            throw error;
        }
    }

    // 發送新消息通知
    async sendMessageNotification(userId, messageData) {
        const notification = {
            title: `來自 ${messageData.senderName} 的新消息`,
            body: messageData.content.length > 100
                ? messageData.content.substring(0, 100) + '...'
                : messageData.content,
            icon: messageData.senderAvatar || '/icon-192x192.png',
            tag: `message-${messageData.messageId}`,
            data: {
                type: 'message',
                messageId: messageData.messageId,
                senderId: messageData.senderId,
                roomId: messageData.roomId,
                url: messageData.roomId
                    ? `/rooms/${messageData.roomId}`
                    : `/chat/${messageData.senderId}`
            },
            actions: [
                {
                    action: 'reply',
                    title: '回覆'
                },
                {
                    action: 'view',
                    title: '查看'
                }
            ],
            requireInteraction: true
        };

        return await this.sendNotification(userId, notification);
    }

    // 發送好友請求通知
    async sendFriendRequestNotification(userId, requesterData) {
        const notification = {
            title: '新的好友請求',
            body: `${requesterData.username} 想要加您為好友`,
            icon: requesterData.avatar || '/icon-192x192.png',
            tag: `friend-request-${requesterData.userId}`,
            data: {
                type: 'friend_request',
                requesterId: requesterData.userId,
                url: '/friends/requests'
            },
            actions: [
                {
                    action: 'accept',
                    title: '接受'
                },
                {
                    action: 'decline',
                    title: '拒絕'
                }
            ]
        };

        return await this.sendNotification(userId, notification);
    }

    // 發送房間邀請通知
    async sendRoomInviteNotification(userId, inviteData) {
        const notification = {
            title: '房間邀請',
            body: `${inviteData.inviterName} 邀請您加入 "${inviteData.roomName}"`,
            icon: inviteData.roomAvatar || '/icon-192x192.png',
            tag: `room-invite-${inviteData.roomId}`,
            data: {
                type: 'room_invite',
                roomId: inviteData.roomId,
                inviterId: inviteData.inviterId,
                url: `/rooms/${inviteData.roomId}`
            },
            actions: [
                {
                    action: 'join',
                    title: '加入'
                },
                {
                    action: 'decline',
                    title: '拒絕'
                }
            ]
        };

        return await this.sendNotification(userId, notification);
    }

    // 發送提及通知
    async sendMentionNotification(userId, mentionData) {
        const notification = {
            title: '有人提及了您',
            body: `${mentionData.senderName} 在 ${mentionData.roomName || '私聊'} 中提及了您`,
            icon: mentionData.senderAvatar || '/icon-192x192.png',
            tag: `mention-${mentionData.messageId}`,
            data: {
                type: 'mention',
                messageId: mentionData.messageId,
                senderId: mentionData.senderId,
                roomId: mentionData.roomId,
                url: mentionData.roomId
                    ? `/rooms/${mentionData.roomId}`
                    : `/chat/${mentionData.senderId}`
            },
            actions: [
                {
                    action: 'view',
                    title: '查看'
                }
            ],
            requireInteraction: true
        };

        return await this.sendNotification(userId, notification);
    }

    // 發送系統通知
    async sendSystemNotification(userId, systemData) {
        const notification = {
            title: systemData.title || '系統通知',
            body: systemData.message,
            icon: '/icon-192x192.png',
            tag: `system-${Date.now()}`,
            data: {
                type: 'system',
                url: systemData.url || '/'
            },
            urgency: systemData.urgent ? 'high' : 'normal'
        };

        return await this.sendNotification(userId, notification);
    }

    // 批量發送通知
    async sendBulkNotifications(userIds, notification) {
        const results = [];

        for (const userId of userIds) {
            try {
                const result = await this.sendNotification(userId, notification);
                results.push({
                    userId,
                    success: result.success,
                    successCount: result.successCount
                });
            } catch (error) {
                results.push({
                    userId,
                    success: false,
                    error: error.message
                });
            }
        }

        const totalSuccess = results.filter(r => r.success).length;
        logger.info('批量推送通知完成', {
            totalUsers: userIds.length,
            successCount: totalSuccess,
            title: notification.title
        });

        return {
            success: totalSuccess > 0,
            results,
            totalUsers: userIds.length,
            successCount: totalSuccess
        };
    }

    // 移除無效訂閱
    async removeInvalidSubscription(subscriptionId) {
        try {
            await database.run(
                'DELETE FROM push_subscriptions WHERE id = ?',
                [subscriptionId]
            );

            logger.info('移除無效推送訂閱', { subscriptionId });
        } catch (error) {
            logger.error('移除無效推送訂閱失敗', {
                error: error.message,
                subscriptionId
            });
        }
    }

    // 獲取用戶訂閱統計
    async getUserSubscriptionStats(userId) {
        try {
            const stats = await database.get(
                `SELECT 
                    COUNT(*) as totalSubscriptions,
                    COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as recentSubscriptions
                 FROM push_subscriptions 
                 WHERE user_uuid = ?`,
                [userId]
            );

            return {
                totalSubscriptions: stats.totalSubscriptions || 0,
                recentSubscriptions: stats.recentSubscriptions || 0
            };

        } catch (error) {
            logger.error('獲取用戶訂閱統計失敗', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    // 清理過期訂閱
    async cleanupExpiredSubscriptions() {
        try {
            // 刪除超過30天未更新的訂閱
            const result = await database.run(
                `DELETE FROM push_subscriptions 
                 WHERE updated_at < datetime('now', '-30 days')`
            );

            logger.info('清理過期推送訂閱完成', {
                deletedCount: result.changes
            });

            return result.changes;

        } catch (error) {
            logger.error('清理過期推送訂閱失敗', { error: error.message });
            throw error;
        }
    }

    // 測試推送通知
    async testNotification(userId) {
        const notification = {
            title: '測試通知',
            body: '這是一條測試推送通知',
            icon: '/icon-192x192.png',
            tag: `test-${Date.now()}`,
            data: {
                type: 'test',
                timestamp: new Date().toISOString()
            }
        };

        return await this.sendNotification(userId, notification);
    }

    // 獲取服務狀態
    getStatus() {
        return {
            initialized: this.isInitialized,
            vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
        };
    }
}

// 創建推送服務實例
const pushService = new PushService();

module.exports = pushService;