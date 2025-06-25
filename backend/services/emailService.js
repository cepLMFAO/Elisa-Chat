const nodemailer = require('nodemailer');
const { config, isProduction } = require('../config/environment');
const logger = require('../utils/logger');

class EmailService {
    constructor() {
        this.transporter = null;
        this.isEnabled = config.email?.enabled || false;
        this.initialize();
    }

    // 初始化郵件傳輸器
    initialize() {
        try {
            if (!this.isEnabled) {
                logger.info('郵件服務未啟用');
                return;
            }

            if (config.email.provider === 'smtp' && config.email.smtp) {
                // SMTP 配置
                this.transporter = nodemailer.createTransporter({
                    host: config.email.smtp.host,
                    port: config.email.smtp.port,
                    secure: config.email.smtp.secure,
                    auth: {
                        user: config.email.smtp.auth.user,
                        pass: config.email.smtp.auth.pass
                    },
                    pool: true,
                    maxConnections: 5,
                    maxMessages: 100,
                    rateLimit: 14 // 每秒最多14封郵件
                });
            } else if (config.email.provider === 'console' || !isProduction) {
                // 開發環境使用控制台輸出
                this.transporter = nodemailer.createTransporter({
                    streamTransport: true,
                    newline: 'unix',
                    buffer: true
                });
            } else {
                logger.warn('郵件服務配置不完整');
                this.isEnabled = false;
                return;
            }

            // 驗證連接
            this.verifyConnection();

        } catch (error) {
            logger.error('郵件服務初始化失敗', { error: error.message });
            this.isEnabled = false;
        }
    }

    // 驗證郵件服務連接
    async verifyConnection() {
        if (!this.transporter) return false;

        try {
            await this.transporter.verify();
            logger.info('郵件服務連接驗證成功');
            return true;
        } catch (error) {
            logger.error('郵件服務連接驗證失敗', { error: error.message });
            this.isEnabled = false;
            return false;
        }
    }

    // 發送郵件的通用方法
    async sendMail(mailOptions) {
        if (!this.isEnabled || !this.transporter) {
            logger.warn('郵件服務未啟用，跳過發送', { to: mailOptions.to });
            return { success: false, reason: '郵件服務未啟用' };
        }

        try {
            // 設置默認發件人
            mailOptions.from = mailOptions.from || process.env.EMAIL_FROM || 'noreply@elitechat.com';

            // 添加默認設置
            mailOptions.encoding = 'utf-8';

            const result = await this.transporter.sendMail(mailOptions);

            logger.info('郵件發送成功', {
                to: mailOptions.to,
                subject: mailOptions.subject,
                messageId: result.messageId
            });

            return { success: true, messageId: result.messageId };

        } catch (error) {
            logger.error('郵件發送失敗', {
                error: error.message,
                to: mailOptions.to,
                subject: mailOptions.subject
            });

            return { success: false, error: error.message };
        }
    }

    // 發送歡迎郵件
    async sendWelcomeEmail(userEmail, username) {
        const subject = '歡迎加入 Elite Chat！';
        const html = this.generateWelcomeTemplate(username);
        const text = `歡迎 ${username}！\n\n感謝您加入 Elite Chat。您現在可以開始與朋友聊天了。\n\n祝您使用愉快！\nElite Chat 團隊`;

        return await this.sendMail({
            to: userEmail,
            subject,
            html,
            text
        });
    }

    // 發送郵箱驗證郵件
    async sendEmailVerification(userEmail, username, verificationToken) {
        const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email/${verificationToken}`;
        const subject = '請驗證您的郵箱地址';
        const html = this.generateVerificationTemplate(username, verificationUrl);
        const text = `請點擊以下鏈接驗證您的郵箱：\n${verificationUrl}`;

        return await this.sendMail({
            to: userEmail,
            subject,
            html,
            text
        });
    }

    // 發送密碼重置郵件
    async sendPasswordReset(userEmail, username, resetToken) {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
        const subject = '重置您的密碼';
        const html = this.generatePasswordResetTemplate(username, resetUrl);
        const text = `請點擊以下鏈接重置您的密碼：\n${resetUrl}\n\n如果您沒有請求重置密碼，請忽略此郵件。`;

        return await this.sendMail({
            to: userEmail,
            subject,
            html,
            text
        });
    }

    // 發送密碼變更通知
    async sendPasswordChangeNotification(userEmail, username) {
        const subject = '密碼已變更';
        const html = this.generatePasswordChangeTemplate(username);
        const text = `${username}，您好！\n\n您的 Elite Chat 帳戶密碼已成功變更。\n\n如果這不是您的操作，請立即聯繫我們。`;

        return await this.sendMail({
            to: userEmail,
            subject,
            html,
            text
        });
    }

    // 發送雙因素認證啟用通知
    async sendTwoFactorEnabledNotification(userEmail, username) {
        const subject = '雙因素認證已啟用';
        const html = this.generateTwoFactorEnabledTemplate(username);
        const text = `${username}，您好！\n\n您的 Elite Chat 帳戶已成功啟用雙因素認證。\n\n您的帳戶安全性已得到提升。`;

        return await this.sendMail({
            to: userEmail,
            subject,
            html,
            text
        });
    }

    // 發送登錄警報
    async sendLoginAlert(userEmail, username, ipAddress, location = '未知') {
        const subject = '新的登錄活動';
        const html = this.generateLoginAlertTemplate(username, ipAddress, location);
        const text = `${username}，您好！\n\n我們檢測到您的帳戶有新的登錄活動：\nIP地址：${ipAddress}\n位置：${location}\n時間：${new Date().toLocaleString()}\n\n如果這不是您的操作，請立即更改密碼。`;

        return await this.sendMail({
            to: userEmail,
            subject,
            html,
            text
        });
    }

    // 生成歡迎郵件模板
    generateWelcomeTemplate(username) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>歡迎加入 Elite Chat</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f8f9fa; }
                .footer { text-align: center; padding: 20px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>歡迎加入 Elite Chat！</h1>
                </div>
                <div class="content">
                    <p>親愛的 ${username}，</p>
                    <p>感謝您加入 Elite Chat！我們很高興您成為我們社群的一員。</p>
                    <p>現在您可以：</p>
                    <ul>
                        <li>與朋友即時聊天</li>
                        <li>創建和加入聊天房間</li>
                        <li>分享文件和圖片</li>
                        <li>進行語音和視頻通話</li>
                    </ul>
                    <p>祝您使用愉快！</p>
                </div>
                <div class="footer">
                    <p>Elite Chat 團隊</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // 生成郵箱驗證模板
    generateVerificationTemplate(username, verificationUrl) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>驗證您的郵箱</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #28a745; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f8f9fa; }
                .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>驗證您的郵箱地址</h1>
                </div>
                <div class="content">
                    <p>親愛的 ${username}，</p>
                    <p>請點擊下方按鈕驗證您的郵箱地址：</p>
                    <a href="${verificationUrl}" class="button">驗證郵箱</a>
                    <p>或複製以下鏈接到瀏覽器：</p>
                    <p>${verificationUrl}</p>
                    <p>此鏈接將在24小時後過期。</p>
                </div>
                <div class="footer">
                    <p>Elite Chat 團隊</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // 生成密碼重置模板
    generatePasswordResetTemplate(username, resetUrl) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>重置密碼</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f8f9fa; }
                .button { display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 4px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>重置您的密碼</h1>
                </div>
                <div class="content">
                    <p>親愛的 ${username}，</p>
                    <p>我們收到了重置您密碼的請求。請點擊下方按鈕設置新密碼：</p>
                    <a href="${resetUrl}" class="button">重置密碼</a>
                    <p>或複製以下鏈接到瀏覽器：</p>
                    <p>${resetUrl}</p>
                    <div class="warning">
                        <strong>注意：</strong>
                        <ul>
                            <li>此鏈接將在1小時後過期</li>
                            <li>如果您沒有請求重置密碼，請忽略此郵件</li>
                            <li>為了您的安全，請不要將此鏈接分享給他人</li>
                        </ul>
                    </div>
                </div>
                <div class="footer">
                    <p>Elite Chat 團隊</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // 生成密碼變更通知模板
    generatePasswordChangeTemplate(username) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>密碼已變更</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #28a745; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f8f9fa; }
                .footer { text-align: center; padding: 20px; color: #666; }
                .alert { background: #d1ecf1; border: 1px solid #bee5eb; padding: 10px; border-radius: 4px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>密碼變更通知</h1>
                </div>
                <div class="content">
                    <p>親愛的 ${username}，</p>
                    <p>您的 Elite Chat 帳戶密碼已成功變更。</p>
                    <div class="alert">
                        <p><strong>變更時間：</strong>${new Date().toLocaleString()}</p>
                    </div>
                    <p>如果這不是您的操作，請立即聯繫我們的客服團隊。</p>
                </div>
                <div class="footer">
                    <p>Elite Chat 團隊</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // 生成雙因素認證啟用模板
    generateTwoFactorEnabledTemplate(username) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>雙因素認證已啟用</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #17a2b8; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f8f9fa; }
                .footer { text-align: center; padding: 20px; color: #666; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 10px; border-radius: 4px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 雙因素認證已啟用</h1>
                </div>
                <div class="content">
                    <p>親愛的 ${username}，</p>
                    <div class="success">
                        <p><strong>恭喜！</strong>您的帳戶安全性已得到提升。</p>
                    </div>
                    <p>您已成功啟用雙因素認證。從現在開始，登錄時除了密碼外，還需要提供驗證碼。</p>
                    <p><strong>請妥善保管您的備份碼，以防手機遺失時使用。</strong></p>
                </div>
                <div class="footer">
                    <p>Elite Chat 團隊</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // 生成登錄警報模板
    generateLoginAlertTemplate(username, ipAddress, location) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>新的登錄活動</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #ffc107; color: #212529; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f8f9fa; }
                .footer { text-align: center; padding: 20px; color: #666; }
                .info { background: #e2e3e5; border: 1px solid #d6d8db; padding: 10px; border-radius: 4px; margin: 10px 0; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 4px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚠️ 新的登錄活動</h1>
                </div>
                <div class="content">
                    <p>親愛的 ${username}，</p>
                    <p>我們檢測到您的帳戶有新的登錄活動：</p>
                    <div class="info">
                        <p><strong>登錄時間：</strong>${new Date().toLocaleString()}</p>
                        <p><strong>IP地址：</strong>${ipAddress}</p>
                        <p><strong>位置：</strong>${location}</p>
                    </div>
                    <div class="warning">
                        <p><strong>如果這不是您的操作：</strong></p>
                        <ul>
                            <li>立即更改您的密碼</li>
                            <li>檢查帳戶活動</li>
                            <li>考慮啟用雙因素認證</li>
                        </ul>
                    </div>
                </div>
                <div class="footer">
                    <p>Elite Chat 團隊</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // 關閉郵件服務
    async close() {
        if (this.transporter) {
            this.transporter.close();
            logger.info('郵件服務已關閉');
        }
    }

    // 獲取服務狀態
    getStatus() {
        return {
            enabled: this.isEnabled,
            provider: config.email?.provider || 'none',
            ready: !!this.transporter
        };
    }
}

// 創建郵件服務實例
const emailService = new EmailService();

module.exports = emailService;