const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../database/chat.db');
        this.isInitialized = false;
        this.initPromise = null;
    }

    // 初始化方法
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.init();
        return this.initPromise;
    }

    async init() {
        try {
            // 確保數據庫目錄存在
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // 創建數據庫連接
            await new Promise((resolve, reject) => {
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        console.error('Error opening database:', err.message);
                        reject(err);
                    } else {
                        console.log('Connected to SQLite database');
                        resolve();
                    }
                });
            });

            // 啟用外鍵約束
            await this.run('PRAGMA foreign_keys = ON');

            // 創建表格
            await this.createTables();

            this.isInitialized = true;
            console.log('Database initialization completed');

        } catch (error) {
            console.error('Database initialization error:', error);
            throw error;
        }
    }

    async createTables() {
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
                                                  max_members INTEGER DEFAULT 100,
                                                  created_by TEXT NOT NULL,
                                                  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
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
                                                         last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                         FOREIGN KEY (room_uuid) REFERENCES rooms (uuid),
                FOREIGN KEY (user_uuid) REFERENCES users (uuid),
                UNIQUE(room_uuid, user_uuid)
                )`,

            // 消息表
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
                FOREIGN KEY (receiver_uuid) REFERENCES users (uuid),
                FOREIGN KEY (reply_to) REFERENCES messages (uuid)
                )`,

            // 消息反應表
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
                                                  path TEXT NOT NULL,
                                                  size INTEGER NOT NULL,
                                                  mimetype TEXT NOT NULL,
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

        // 執行創建表格
        for (const sql of tables) {
            await this.run(sql);
        }

        // 創建索引
        await this.createIndexes();

        // 插入默認設置
        await this.insertDefaultSettings();
    }

    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_files_message ON files(message_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploaded_by)',
            'CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_uuid)',
            'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)'
        ];

        for (const sql of indexes) {
            await this.run(sql);
        }
    }

    async insertDefaultSettings() {
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

        for (const [key, value, type, description] of defaultSettings) {
            try {
                await this.run(
                    'INSERT OR IGNORE INTO settings (key, value, type, description) VALUES (?, ?, ?, ?)',
                    [key, value, type, description]
                );
            } catch (error) {
                console.warn(`Failed to insert default setting ${key}:`, error.message);
            }
        }
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
            if (!this.db) {
                resolve();
                return;
            }

            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed');
                }
                this.isInitialized = false;
                resolve();
            });
        });
    }

    // 數據庫備份
    async backup(backupPath) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

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
            try {
                const result = await this.get(`SELECT COUNT(*) as count FROM ${table}`);
                stats[table] = result ? result.count : 0;
            } catch (error) {
                console.warn(`Failed to get stats for table ${table}:`, error.message);
                stats[table] = 0;
            }
        }

        return stats;
    }

    // 檢查數據庫健康狀態
    async healthCheck() {
        try {
            await this.get('SELECT 1 as test');
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// 創建全局數據庫實例
const database = new Database();

module.exports = database;