const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class DatabaseRepair {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '../data/chat.db');
        this.db = null;
        this.backupPath = null;
    }

    // 初始化修復過程
    async init() {
        try {
            console.log('🔧 開始數據庫修復過程...');

            // 創建備份
            await this.createBackup();

            // 連接數據庫
            await this.connectDatabase();

            // 檢查數據庫完整性
            await this.checkIntegrity();

            // 修復表結構
            await this.repairTables();

            // 修復索引
            await this.repairIndexes();

            // 修復數據一致性
            await this.repairDataConsistency();

            // 優化數據庫
            await this.optimizeDatabase();

            console.log('✅ 數據庫修復完成');

        } catch (error) {
            console.error('❌ 數據庫修復失敗:', error);

            // 嘗試從備份恢復
            if (this.backupPath) {
                await this.restoreFromBackup();
            }

            throw error;
        } finally {
            if (this.db) {
                this.db.close();
            }
        }
    }

    // 創建數據庫備份
    async createBackup() {
        return new Promise((resolve, reject) => {
            try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                this.backupPath = `${this.dbPath}.backup.${timestamp}`;

                if (fs.existsSync(this.dbPath)) {
                    fs.copyFileSync(this.dbPath, this.backupPath);
                    console.log(`📁 數據庫備份已創建: ${this.backupPath}`);
                } else {
                    console.log('📁 數據庫文件不存在，將創建新的數據庫');
                }

                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    // 連接數據庫
    async connectDatabase() {
        return new Promise((resolve, reject) => {
            // 確保數據目錄存在
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('🔗 數據庫連接成功');

                    // 啟用外鍵約束
                    this.db.run('PRAGMA foreign_keys = ON');

                    resolve();
                }
            });
        });
    }

    // 檢查數據庫完整性
    async checkIntegrity() {
        return new Promise((resolve, reject) => {
            this.db.get('PRAGMA integrity_check', (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row && row.integrity_check === 'ok') {
                        console.log('✅ 數據庫完整性檢查通過');
                    } else {
                        console.warn('⚠️ 數據庫完整性檢查發現問題:', row);
                    }
                    resolve();
                }
            });
        });
    }

    // 修復表結構
    async repairTables() {
        console.log('🔨 修復表結構...');

        const tables = this.getTableDefinitions();

        for (const tableDef of tables) {
            try {
                await this.createOrUpdateTable(tableDef);
            } catch (error) {
                console.error(`修復表 ${tableDef.name} 失敗:`, error);
            }
        }
    }

    // 獲取表定義
    getTableDefinitions() {
        return [
            {
                name: 'users',
                sql: `CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    avatar TEXT,
                    status TEXT DEFAULT 'offline',
                    is_verified BOOLEAN DEFAULT FALSE,
                    is_admin BOOLEAN DEFAULT FALSE,
                    last_seen_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'rooms',
                sql: `CREATE TABLE IF NOT EXISTS rooms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    type TEXT DEFAULT 'public',
                    max_members INTEGER DEFAULT 100,
                    password_hash TEXT,
                    avatar TEXT,
                    owner_uuid TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (owner_uuid) REFERENCES users(uuid) ON DELETE CASCADE
                )`
            },
            {
                name: 'room_members',
                sql: `CREATE TABLE IF NOT EXISTS room_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_uuid TEXT NOT NULL,
                    user_uuid TEXT NOT NULL,
                    role TEXT DEFAULT 'member',
                    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_read_at DATETIME,
                    is_muted BOOLEAN DEFAULT FALSE,
                    FOREIGN KEY (room_uuid) REFERENCES rooms(uuid) ON DELETE CASCADE,
                    FOREIGN KEY (user_uuid) REFERENCES users(uuid) ON DELETE CASCADE,
                    UNIQUE(room_uuid, user_uuid)
                )`
            },
            {
                name: 'messages',
                sql: `CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT UNIQUE NOT NULL,
                    room_uuid TEXT NOT NULL,
                    sender_uuid TEXT NOT NULL,
                    type TEXT DEFAULT 'text',
                    content TEXT NOT NULL,
                    reply_to_uuid TEXT,
                    edited_at DATETIME,
                    is_deleted BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (room_uuid) REFERENCES rooms(uuid) ON DELETE CASCADE,
                    FOREIGN KEY (sender_uuid) REFERENCES users(uuid) ON DELETE CASCADE,
                    FOREIGN KEY (reply_to_uuid) REFERENCES messages(uuid) ON DELETE SET NULL
                )`
            },
            {
                name: 'files',
                sql: `CREATE TABLE IF NOT EXISTS files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT UNIQUE NOT NULL,
                    message_uuid TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    path TEXT NOT NULL,
                    thumbnail_path TEXT,
                    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (message_uuid) REFERENCES messages(uuid) ON DELETE CASCADE
                )`
            },
            {
                name: 'sessions',
                sql: `CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT UNIQUE NOT NULL,
                    user_uuid TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    expires_at DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_uuid) REFERENCES users(uuid) ON DELETE CASCADE
                )`
            },
            {
                name: 'notifications',
                sql: `CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT UNIQUE NOT NULL,
                    user_uuid TEXT NOT NULL,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT,
                    data TEXT,
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_uuid) REFERENCES users(uuid) ON DELETE CASCADE
                )`
            },
            {
                name: 'settings',
                sql: `CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    value TEXT NOT NULL,
                    type TEXT DEFAULT 'string',
                    description TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`
            },
            {
                name: 'audit_logs',
                sql: `CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_uuid TEXT,
                    action TEXT NOT NULL,
                    resource_type TEXT,
                    resource_id TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_uuid) REFERENCES users(uuid) ON DELETE SET NULL
                )`
            }
        ];
    }

    // 創建或更新表
    async createOrUpdateTable(tableDef) {
        return new Promise((resolve, reject) => {
            this.db.run(tableDef.sql, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`✅ 表 ${tableDef.name} 創建/更新成功`);
                    resolve();
                }
            });
        });
    }

    // 修復索引
    async repairIndexes() {
        console.log('🔨 修復索引...');

        const indexes = this.getIndexDefinitions();

        for (const indexDef of indexes) {
            try {
                await this.createIndex(indexDef);
            } catch (error) {
                console.error(`創建索引 ${indexDef.name} 失敗:`, error);
            }
        }
    }

    // 獲取索引定義
    getIndexDefinitions() {
        return [
            {
                name: 'idx_users_username',
                sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)'
            },
            {
                name: 'idx_users_email',
                sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)'
            },
            {
                name: 'idx_users_uuid',
                sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)'
            },
            {
                name: 'idx_rooms_uuid',
                sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_uuid ON rooms(uuid)'
            },
            {
                name: 'idx_rooms_owner',
                sql: 'CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_uuid)'
            },
            {
                name: 'idx_room_members_room',
                sql: 'CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_uuid)'
            },
            {
                name: 'idx_room_members_user',
                sql: 'CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_uuid)'
            },
            {
                name: 'idx_messages_uuid',
                sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_uuid ON messages(uuid)'
            },
            {
                name: 'idx_messages_room',
                sql: 'CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_uuid)'
            },
            {
                name: 'idx_messages_sender',
                sql: 'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_uuid)'
            },
            {
                name: 'idx_messages_created',
                sql: 'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)'
            },
            {
                name: 'idx_files_message',
                sql: 'CREATE INDEX IF NOT EXISTS idx_files_message ON files(message_uuid)'
            },
            {
                name: 'idx_sessions_user',
                sql: 'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_uuid)'
            },
            {
                name: 'idx_sessions_expires',
                sql: 'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)'
            },
            {
                name: 'idx_notifications_user',
                sql: 'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_uuid)'
            },
            {
                name: 'idx_audit_logs_user',
                sql: 'CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_uuid)'
            },
            {
                name: 'idx_audit_logs_created',
                sql: 'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)'
            }
        ];
    }

    // 創建索引
    async createIndex(indexDef) {
        return new Promise((resolve, reject) => {
            this.db.run(indexDef.sql, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`✅ 索引 ${indexDef.name} 創建成功`);
                    resolve();
                }
            });
        });
    }

    // 修復數據一致性
    async repairDataConsistency() {
        console.log('🔨 修復數據一致性...');

        try {
            // 清理過期會話
            await this.cleanExpiredSessions();

            // 修復孤立數據
            await this.cleanOrphanedData();

            // 修復用戶狀態
            await this.repairUserStatuses();

            // 清理無效文件引用
            await this.cleanInvalidFileReferences();

        } catch (error) {
            console.error('數據一致性修復失敗:', error);
            throw error;
        }
    }

    // 清理過期會話
    async cleanExpiredSessions() {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM sessions WHERE expires_at < datetime("now")',
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`✅ 清理過期會話: ${this.changes} 條記錄`);
                        resolve();
                    }
                }
            );
        });
    }

    // 清理孤立數據
    async cleanOrphanedData() {
        const cleanupQueries = [
            {
                name: '清理孤立房間成員',
                sql: `DELETE FROM room_members 
                      WHERE user_uuid NOT IN (SELECT uuid FROM users)
                      OR room_uuid NOT IN (SELECT uuid FROM rooms)`
            },
            {
                name: '清理孤立消息',
                sql: `DELETE FROM messages 
                      WHERE sender_uuid NOT IN (SELECT uuid FROM users)
                      OR room_uuid NOT IN (SELECT uuid FROM rooms)`
            },
            {
                name: '清理孤立文件',
                sql: `DELETE FROM files 
                      WHERE message_uuid NOT IN (SELECT uuid FROM messages)`
            },
            {
                name: '清理孤立通知',
                sql: `DELETE FROM notifications 
                      WHERE user_uuid NOT IN (SELECT uuid FROM users)`
            }
        ];

        for (const query of cleanupQueries) {
            try {
                await new Promise((resolve, reject) => {
                    this.db.run(query.sql, function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            console.log(`✅ ${query.name}: ${this.changes} 條記錄`);
                            resolve();
                        }
                    });
                });
            } catch (error) {
                console.error(`${query.name} 失敗:`, error);
            }
        }
    }

    // 修復用戶狀態
    async repairUserStatuses() {
        return new Promise((resolve, reject) => {
            // 將所有非活動用戶設為離線
            this.db.run(
                `UPDATE users SET status = 'offline' 
                 WHERE status != 'offline' 
                 AND last_seen_at < datetime('now', '-5 minutes')`,
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`✅ 修復用戶狀態: ${this.changes} 條記錄`);
                        resolve();
                    }
                }
            );
        });
    }

    // 清理無效文件引用
    async cleanInvalidFileReferences() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT uuid, path FROM files',
                async (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let deletedCount = 0;
                    for (const row of rows) {
                        if (!fs.existsSync(row.path)) {
                            try {
                                await new Promise((res, rej) => {
                                    this.db.run(
                                        'DELETE FROM files WHERE uuid = ?',
                                        [row.uuid],
                                        function(deleteErr) {
                                            if (deleteErr) rej(deleteErr);
                                            else {
                                                deletedCount++;
                                                res();
                                            }
                                        }
                                    );
                                });
                            } catch (deleteError) {
                                console.error(`刪除無效文件記錄失敗: ${row.uuid}`, deleteError);
                            }
                        }
                    }

                    console.log(`✅ 清理無效文件引用: ${deletedCount} 條記錄`);
                    resolve();
                }
            );
        });
    }

    // 優化數據庫
    async optimizeDatabase() {
        console.log('🔨 優化數據庫...');

        const optimizations = [
            { name: 'ANALYZE', sql: 'ANALYZE' },
            { name: 'VACUUM', sql: 'VACUUM' },
            { name: 'REINDEX', sql: 'REINDEX' }
        ];

        for (const opt of optimizations) {
            try {
                await new Promise((resolve, reject) => {
                    this.db.run(opt.sql, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            console.log(`✅ ${opt.name} 完成`);
                            resolve();
                        }
                    });
                });
            } catch (error) {
                console.error(`${opt.name} 失敗:`, error);
            }
        }
    }

    // 插入默認設置
    async insertDefaultSettings() {
        console.log('🔨 插入默認設置...');

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
            ['welcome_message', '歡迎加入 Elite Chat！', 'string', '歡迎訊息'],
            ['maintenance_mode', 'false', 'boolean', '維護模式'],
            ['guest_access_enabled', 'false', 'boolean', '是否允許訪客訪問'],
            ['max_room_members', '100', 'number', '房間最大成員數'],
            ['message_retention_days', '365', 'number', '消息保留天數'],
            ['session_timeout_minutes', '1440', 'number', '會話超時時間（分鐘）']
        ];

        const insertPromises = defaultSettings.map(setting => {
            return new Promise((resolve, reject) => {
                this.db.run(
                    `INSERT OR IGNORE INTO settings (key, value, type, description) 
                     VALUES (?, ?, ?, ?)`,
                    setting,
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            if (this.changes > 0) {
                                console.log(`✅ 插入設置: ${setting[0]}`);
                            }
                            resolve();
                        }
                    }
                );
            });
        });

        try {
            await Promise.all(insertPromises);
            console.log('✅ 默認設置插入完成');
        } catch (error) {
            console.error('插入默認設置失敗:', error);
            throw error;
        }
    }

    // 創建管理員用戶
    async createAdminUser() {
        console.log('🔨 檢查管理員用戶...');

        return new Promise((resolve, reject) => {
            // 檢查是否已存在管理員
            this.db.get(
                'SELECT COUNT(*) as count FROM users WHERE is_admin = TRUE',
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (row.count > 0) {
                        console.log('✅ 管理員用戶已存在');
                        resolve();
                        return;
                    }

                    // 創建默認管理員
                    const bcrypt = require('bcrypt');
                    const { v4: uuidv4 } = require('uuid');

                    const adminData = {
                        uuid: uuidv4(),
                        username: 'admin',
                        email: 'admin@elitechat.com',
                        password: 'admin123', // 應該在首次登錄時要求更改
                        isAdmin: true
                    };

                    bcrypt.hash(adminData.password, 10, (hashErr, hash) => {
                        if (hashErr) {
                            reject(hashErr);
                            return;
                        }

                        this.db.run(
                            `INSERT INTO users (uuid, username, email, password_hash, is_admin, status, created_at)
                             VALUES (?, ?, ?, ?, ?, 'offline', CURRENT_TIMESTAMP)`,
                            [adminData.uuid, adminData.username, adminData.email, hash, adminData.isAdmin],
                            function(insertErr) {
                                if (insertErr) {
                                    reject(insertErr);
                                } else {
                                    console.log('✅ 默認管理員用戶已創建');
                                    console.log('⚠️  請使用以下憑證登錄並立即更改密碼:');
                                    console.log(`   用戶名: ${adminData.username}`);
                                    console.log(`   密碼: ${adminData.password}`);
                                    resolve();
                                }
                            }
                        );
                    });
                }
            );
        });
    }

    // 從備份恢復
    async restoreFromBackup() {
        if (!this.backupPath || !fs.existsSync(this.backupPath)) {
            throw new Error('備份文件不存在，無法恢復');
        }

        try {
            console.log('🔄 從備份恢復數據庫...');

            if (this.db) {
                this.db.close();
            }

            fs.copyFileSync(this.backupPath, this.dbPath);
            console.log('✅ 數據庫已從備份恢復');

        } catch (error) {
            console.error('從備份恢復失敗:', error);
            throw error;
        }
    }

    // 生成修復報告
    async generateRepairReport() {
        const report = {
            timestamp: new Date().toISOString(),
            databasePath: this.dbPath,
            backupPath: this.backupPath,
            tables: {},
            indexes: {},
            statistics: {}
        };

        try {
            // 獲取表信息
            const tables = await new Promise((resolve, reject) => {
                this.db.all(
                    "SELECT name FROM sqlite_master WHERE type='table'",
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            for (const table of tables) {
                const count = await new Promise((resolve, reject) => {
                    this.db.get(
                        `SELECT COUNT(*) as count FROM ${table.name}`,
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row.count);
                        }
                    );
                });
                report.tables[table.name] = count;
            }

            // 獲取索引信息
            const indexes = await new Promise((resolve, reject) => {
                this.db.all(
                    "SELECT name FROM sqlite_master WHERE type='index'",
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });

            report.indexes.count = indexes.length;
            report.indexes.names = indexes.map(idx => idx.name);

            // 獲取數據庫統計
            const dbSize = fs.statSync(this.dbPath).size;
            report.statistics.databaseSize = dbSize;
            report.statistics.totalTables = Object.keys(report.tables).length;
            report.statistics.totalRecords = Object.values(report.tables).reduce((sum, count) => sum + count, 0);

            console.log('📊 修復報告:');
            console.log(JSON.stringify(report, null, 2));

            return report;

        } catch (error) {
            console.error('生成修復報告失敗:', error);
            throw error;
        }
    }

    // 清理舊備份文件
    static cleanOldBackups(dbPath, keepDays = 7) {
        try {
            const dataDir = path.dirname(dbPath);
            const dbName = path.basename(dbPath);
            const files = fs.readdirSync(dataDir);

            const backupFiles = files.filter(file =>
                file.startsWith(`${dbName}.backup.`) &&
                file.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)
            );

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - keepDays);

            let deletedCount = 0;
            backupFiles.forEach(file => {
                const filePath = path.join(dataDir, file);
                const stats = fs.statSync(filePath);

                if (stats.mtime < cutoffDate) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            });

            if (deletedCount > 0) {
                console.log(`🗑️  清理了 ${deletedCount} 個舊備份文件`);
            }

        } catch (error) {
            console.error('清理舊備份文件失敗:', error);
        }
    }
}

// 主修復函數
async function repairDatabase(dbPath) {
    const repair = new DatabaseRepair(dbPath);

    try {
        await repair.init();
        await repair.insertDefaultSettings();
        await repair.createAdminUser();

        const report = await repair.generateRepairReport();

        // 清理舊備份
        DatabaseRepair.cleanOldBackups(dbPath);

        return {
            success: true,
            report: report,
            message: '數據庫修復完成'
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: '數據庫修復失敗'
        };
    }
}

// 命令行工具
if (require.main === module) {
    const dbPath = process.argv[2] || path.join(__dirname, '../data/chat.db');

    console.log('🚀 開始數據庫修復...');
    console.log(`📁 數據庫路徑: ${dbPath}`);

    repairDatabase(dbPath)
        .then(result => {
            if (result.success) {
                console.log('✅ 修復成功:', result.message);
                process.exit(0);
            } else {
                console.error('❌ 修復失敗:', result.message);
                console.error('錯誤詳情:', result.error);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 修復過程中發生錯誤:', error);
            process.exit(1);
        });
}

module.exports = {
    DatabaseRepair,
    repairDatabase
};