const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const { DATABASE } = require('../config/constants');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.db = null;
        this.isConnected = false;
        this.connectionPromise = null;
    }

    // 連接數據庫
    async connect() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = this._connect();
        return this.connectionPromise;
    }

    async _connect() {
        try {
            // 確保數據庫目錄存在
            const dbDir = path.dirname(DATABASE.PATH);
            await fs.mkdir(dbDir, { recursive: true });

            // 創建數據庫連接
            this.db = new sqlite3.Database(DATABASE.PATH, (err) => {
                if (err) {
                    logger.error('數據庫連接失敗:', err);
                    throw err;
                }
            });

            // 設置數據庫配置
            await this.configure();

            // 初始化數據庫表
            await this.initializeTables();

            this.isConnected = true;
            logger.info('數據庫連接成功');

        } catch (error) {
            logger.error('數據庫初始化失敗:', error);
            throw error;
        }
    }

    // 配置數據庫
    async configure() {
        const configurations = [
            'PRAGMA foreign_keys = ON',
            'PRAGMA journal_mode = WAL',
            'PRAGMA synchronous = NORMAL',
            'PRAGMA temp_store = MEMORY',
            'PRAGMA mmap_size = 268435456', // 256MB
            `PRAGMA busy_timeout = ${DATABASE.BUSY_TIMEOUT}`
        ];

        for (const config of configurations) {
            await this.run(config);
        }
    }

    // 初始化數據庫表
    async initializeTables() {
        const tables = [
            // 用戶表
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT,
                avatar TEXT,
                phone TEXT,
                bio TEXT,
                status TEXT DEFAULT 'offline',
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                email_verified BOOLEAN DEFAULT FALSE,
                phone_verified BOOLEAN DEFAULT FALSE,
                two_factor_enabled BOOLEAN DEFAULT FALSE,
                two_factor_secret TEXT,
                is_admin BOOLEAN DEFAULT FALSE,
                is_banned BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 房間表
            `CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                type TEXT DEFAULT 'group',
                avatar TEXT,
                password TEXT,
                max_members INTEGER DEFAULT 100,
                is_private BOOLEAN DEFAULT FALSE,
                created_by TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users (uuid)
            )`,

            // 房間成員表
            `CREATE TABLE IF NOT EXISTS room_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_uuid TEXT NOT NULL,
                user_uuid TEXT NOT NULL,
                role TEXT DEFAULT 'member',
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                muted_until DATETIME,
                is_banned BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (room_uuid) REFERENCES rooms (uuid),
                FOREIGN KEY (user_uuid) REFERENCES users (uuid),
                UNIQUE(room_uuid, user_uuid)
            )`,

            // 訊息表
            `CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                room_uuid TEXT,
                sender_uuid TEXT NOT NULL,
                receiver_uuid TEXT,
                content TEXT NOT NULL,
                message_type TEXT DEFAULT 'text',
                reply_to TEXT,
                forwarded_from TEXT,
                edited_at DATETIME,
                deleted_at DATETIME,
                is_system BOOLEAN DEFAULT FALSE,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_uuid) REFERENCES rooms (uuid),
                FOREIGN KEY (sender_uuid) REFERENCES users (uuid),
                FOREIGN KEY (receiver_uuid) REFERENCES users (uuid),
                FOREIGN KEY (reply_to) REFERENCES messages (uuid)
            )`,

            // 訊息反應表
            `CREATE TABLE IF NOT EXISTS message_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_uuid TEXT NOT NULL,
                user_uuid TEXT NOT NULL,
                emoji TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (message_uuid) REFERENCES messages (uuid),
                FOREIGN KEY (user_uuid) REFERENCES users (uuid),
                UNIQUE(message_uuid, user_uuid, emoji)
            )`,

            // 文件表
            `CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                original_name TEXT NOT NULL,
                filename TEXT NOT NULL,
                mimetype TEXT NOT NULL,
                size INTEGER NOT NULL,
                path TEXT NOT NULL,
                uploaded_by TEXT NOT NULL,
                message_uuid TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (uploaded_by) REFERENCES users (uuid),
                FOREIGN KEY (message_uuid) REFERENCES messages (uuid)
            )`,

            // 好友關係表
            `CREATE TABLE IF NOT EXISTS friendships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requester_uuid TEXT NOT NULL,
                addressee_uuid TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (requester_uuid) REFERENCES users (uuid),
                FOREIGN KEY (addressee_uuid) REFERENCES users (uuid),
                UNIQUE(requester_uuid, addressee_uuid)
            )`,

            // 黑名單表
            `CREATE TABLE IF NOT EXISTS blocked_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                blocker_uuid TEXT NOT NULL,
                blocked_uuid TEXT NOT NULL,
                reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (blocker_uuid) REFERENCES users (uuid),
                FOREIGN KEY (blocked_uuid) REFERENCES users (uuid),
                UNIQUE(blocker_uuid, blocked_uuid)
            )`,

            // 會話表
            `CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                user_uuid TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_uuid) REFERENCES users (uuid)
            )`,

            // 通知表
            `CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                user_uuid TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                data TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_uuid) REFERENCES users (uuid)
            )`
        ];

        for (const tableSQL of tables) {
            await this.run(tableSQL);
        }

        // 創建索引
        await this.createIndexes();
    }

    // 創建索引
    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)',
            'CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_uuid)'
        ];

        for (const indexSQL of indexes) {
            await this.run(indexSQL);
        }
    }

    // 執行 SQL 查詢
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    logger.error('SQL 執行錯誤:', { sql, params, error: err.message });
                    reject(err);
                } else {
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            });
        });
    }

    // 獲取單行資料
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    logger.error('SQL 查詢錯誤:', { sql, params, error: err.message });
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // 獲取多行資料
    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logger.error('SQL 查詢錯誤:', { sql, params, error: err.message });
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    // 開始事務
    async beginTransaction() {
        return this.run('BEGIN TRANSACTION');
    }

    // 提交事務
    async commit() {
        return this.run('COMMIT');
    }

    // 回滾事務
    async rollback() {
        return this.run('ROLLBACK');
    }

    // 執行事務
    async transaction(callback) {
        await this.beginTransaction();
        try {
            const result = await callback();
            await this.commit();
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    // 關閉數據庫連接
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        logger.error('關閉數據庫失敗:', err);
                    } else {
                        logger.info('數據庫連接已關閉');
                    }
                    this.isConnected = false;
                    resolve();
                });
            });
        }
    }

    // 檢查健康狀態
    async healthCheck() {
        try {
            const result = await this.get('SELECT 1 as test');
            return result && result.test === 1;
        } catch (error) {
            logger.error('數據庫健康檢查失敗:', error);
            return false;
        }
    }

    // 備份數據庫
    async backup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(DATABASE.BACKUP_PATH, `backup-${timestamp}.db`);

            // 確保備份目錄存在
            await fs.mkdir(DATABASE.BACKUP_PATH, { recursive: true });

            // 複製數據庫文件
            await fs.copyFile(DATABASE.PATH, backupPath);

            logger.info('數據庫備份成功:', backupPath);
            return backupPath;
        } catch (error) {
            logger.error('數據庫備份失敗:', error);
            throw error;
        }
    }
}

// 創建數據庫實例
const database = new Database();

module.exports = database;