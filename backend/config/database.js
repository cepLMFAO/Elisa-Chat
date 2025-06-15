// backend/config/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../database/chat.db');
        this.init();
    }

    async init() {
        try {
            // 確保數據庫目錄存在
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // 創建數據庫連接
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables();
                }
            });

            // 啟用外鍵約束
            this.db.run('PRAGMA foreign_keys = ON');
        } catch (error) {
            console.error('Database initialization error:', error);
        }
    }

    createTables() {
        const tables = [
            // 用戶表
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                avatar TEXT,
                status TEXT DEFAULT 'offline',
                last_seen DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_verified BOOLEAN DEFAULT FALSE,
                two_factor_enabled BOOLEAN DEFAULT FALSE,
                two_factor_secret TEXT,
                role TEXT DEFAULT 'user'
            )`,

            // 房間表
            `CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                type TEXT DEFAULT 'public',
                password TEXT,
                avatar TEXT,
                max_members INTEGER DEFAULT 100,
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_uuid) REFERENCES rooms (uuid),
                FOREIGN KEY (sender_uuid) REFERENCES users (uuid),
                FOREIGN KEY (receiver_uuid) REFERENCES users (uuid)
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
                read_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_uuid) REFERENCES users (uuid)
            )`,

            // 系統設置表
            `CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT,
                type TEXT DEFAULT 'string',
                description TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 用戶設置表
            `CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_uuid TEXT NOT NULL,
                setting_key TEXT NOT NULL,
                setting_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_uuid) REFERENCES users (uuid),
                UNIQUE(user_uuid, setting_key)
            )`,

            // 審計日誌表
            `CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_uuid TEXT,
                action TEXT NOT NULL,
                resource_type TEXT,
                resource_id TEXT,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_uuid) REFERENCES users (uuid)
            )`
        ];

        // 創建索引
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_files_message ON files(message_uuid)'
        ];

        // 執行創建表格
        tables.forEach(sql => {
            this.db.run(sql, (err) => {
                if (err) {
                    console.error('Error creating table:', err.message);
                }
            });
        });

        // 執行創建索引
        indexes.forEach(sql => {
            this.db.run(sql, (err) => {
                if (err) {
                    console.error('Error creating index:', err.message);
                }
            });
        });

        // 插入默認設置
        this.insertDefaultSettings();
    }

    insertDefaultSettings() {
        const defaultSettings = [
            ['site_name', 'Elite Chat App', 'string', '網站名稱'],
            ['max_file_size', '10485760', 'number', '最大文件大小（字節）'],
            ['allowed_file_types', 'image/jpeg,image/png,image/gif,text/plain,application/pdf', 'string', '允許的文件類型'],
            ['max_message_length', '1000', 'number', '最大訊息長度'],
            ['registration_enabled', 'true', 'boolean', '是否允許註冊'],
            ['email_verification_required', 'false', 'boolean', '是否需要郵箱驗證'],
            ['rate_limit_messages', '60', 'number', '每分鐘最大訊息數'],
            ['rate_limit_uploads', '10', 'number', '每分鐘最大上傳數'],
            ['default_theme', 'light', 'string', '默認主題'],
            ['welcome_message', '歡迎加入 Elite Chat！', 'string', '歡迎訊息']
        ];

        const insertSetting = this.db.prepare(`
            INSERT OR IGNORE INTO settings (key, value, type, description) 
            VALUES (?, ?, ?, ?)
        `);

        defaultSettings.forEach(setting => {
            insertSetting.run(setting);
        });

        insertSetting.finalize();
    }

    // 通用查詢方法
    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // 通用執行方法
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    // 獲取單行數據
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
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

    // 關閉數據庫連接
    close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed');
                }
                resolve();
            });
        });
    }

    // 數據庫備份
    async backup(backupPath) {
        return new Promise((resolve, reject) => {
            const backup = new sqlite3.Database(backupPath);
            this.db.backup(backup, (err) => {
                if (err) {
                    reject(err);
                } else {
                    backup.close();
                    resolve();
                }
            });
        });
    }

    // 獲取數據庫統計信息
    async getStats() {
        const stats = {};

        const tables = [
            'users', 'rooms', 'messages', 'files',
            'friendships', 'sessions', 'notifications'
        ];

        for (const table of tables) {
            const result = await this.get(`SELECT COUNT(*) as count FROM ${table}`);
            stats[table] = result.count;
        }

        return stats;
    }
}

// 創建全局數據庫實例
const database = new Database();

module.exports = database;