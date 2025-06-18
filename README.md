# Elite Chat - 企業級即時聊天應用程式

<div align="center">
  <img src="https://api.dicebear.com/7.x/shapes/svg?seed=EliteChat&backgroundColor=667eea" alt="Elite Chat Logo" width="120" height="120">

<h3>現代化的企業級即時通訊解決方案</h3>

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/your-org/elite-chat-app)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![WebSocket](https://img.shields.io/badge/websocket-enabled-orange.svg)](https://github.com/websockets/ws)
[![SQLite](https://img.shields.io/badge/database-SQLite-lightblue.svg)](https://www.sqlite.org/)
</div>

## 📋 目錄

- [功能特色](#-功能特色)
- [技術架構](#-技術架構)
- [快速開始](#-快速開始)
- [安裝指南](#-安裝指南)
- [配置說明](#-配置說明)
- [API 文檔](#-api-文檔)
- [部署指南](#-部署指南)
- [開發指南](#-開發指南)
- [測試](#-測試)
- [貢獻指南](#-貢獻指南)
- [授權條款](#-授權條款)

## ✨ 功能特色

### 🔐 安全功能
- **JWT 身份驗證** - 安全的令牌機制
- **雙因素認證 (2FA)** - TOTP 支援，增強帳戶保護
- **密碼加密** - bcrypt 加密存儲
- **會話管理** - 多裝置會話控制
- **速率限制** - 防止濫用和攻擊

### 💬 聊天功能
- **即時消息** - WebSocket 實時通訊
- **私人聊天** - 一對一對話
- **群組聊天** - 多人聊天室
- **文件共享** - 支援多種文件格式
- **語音訊息** - 音頻錄製與播放
- **表情符號** - 豐富的表情選擇
- **訊息回覆** - 引用回覆功能
- **訊息編輯** - 發送後可編輯
- **訊息刪除** - 撤回已發送消息

### 👥 用戶管理
- **聯繫人系統** - 好友添加與管理
- **用戶狀態** - 在線/離開/忙碌/隱身
- **個人資料** - 頭像、暱稱自定義
- **用戶搜索** - 快速查找用戶

### 🎨 界面特性
- **響應式設計** - 適配各種螢幕尺寸
- **多主題支援** - 亮色/暗色/海洋/森林等主題
- **動畫效果** - 流暢的交互動畫
- **無障礙設計** - 支援鍵盤導航和螢幕閱讀器
- **PWA 支援** - 可安裝為桌面應用

### 🛠 管理功能
- **房間管理** - 創建、編輯、刪除聊天室
- **權限控制** - 角色權限管理
- **審計日誌** - 操作記錄追蹤
- **系統設置** - 靈活的配置選項

## 🏗 技術架構

### 後端技術
- **Node.js** - 高性能 JavaScript 運行環境
- **Express.js** - 輕量級 Web 框架
- **WebSocket** - 實時雙向通訊
- **SQLite** - 輕量級關係型資料庫
- **JWT** - JSON Web Token 身份驗證
- **bcrypt** - 密碼哈希加密
- **Joi** - 數據驗證
- **Winston** - 日誌記錄

### 前端技術
- **原生 JavaScript** - 無框架依賴
- **CSS Grid & Flexbox** - 現代布局技術
- **CSS Variables** - 動態主題系統
- **Web APIs** - 現代瀏覽器 API
- **WebSocket Client** - 實時通訊客戶端
- **Service Worker** - PWA 支援

### 開發工具
- **ESLint** - 代碼質量檢查
- **Prettier** - 代碼格式化
- **Jest** - 單元測試框架
- **Webpack** - 模塊打包器
- **Nodemon** - 開發環境熱重載

## 🚀 快速開始

### 環境要求
- Node.js 16.0+
- npm 8.0+

### 安裝與運行
```bash
# 克隆專案
git clone https://github.com/your-org/elite-chat-app.git
cd elite-chat-app

# 安裝依賴
npm install

# 初始化設置
npm run setup

# 啟動開發服務器
npm run dev
```

### 訪問應用
- 前端界面：http://localhost:8080
- 登錄頁面：http://localhost:8080/pages/login.html
- 聊天界面：http://localhost:8080/pages/chat.html

### 演示帳戶
- **管理員**：`admin` / `admin123`
- **一般用戶**：`demo` / `demo123`

## 📦 安裝指南

### 1. 環境準備
```bash
# 檢查 Node.js 版本
node --version  # 需要 >= 16.0.0
npm --version   # 需要 >= 8.0.0
```

### 2. 下載專案
```bash
# 使用 Git
git clone https://github.com/your-org/elite-chat-app.git

# 或下載 ZIP
wget https://github.com/your-org/elite-chat-app/archive/main.zip
unzip main.zip
```

### 3. 安裝依賴
```bash
cd elite-chat-app
npm install
```

### 4. 環境配置
```bash
# 複製環境變數範例
cp .env.example .env

# 編輯配置文件
nano .env
```

### 5. 初始化數據庫
```bash
# 運行初始化腳本
npm run setup

# 或手動初始化
npm run migrate
npm run seed
```

## ⚙️ 配置說明

### 環境變數

創建 `.env` 文件並配置以下變數：

```env
# 服務器配置
PORT=8080
HOST=localhost
NODE_ENV=development

# 數據庫配置
DB_PATH=./backend/database/chat.db
DB_BACKUP_PATH=./backend/database/backups/

# JWT 配置
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# 加密配置
AES_KEY=your-256-bit-aes-encryption-key-change-me
BCRYPT_ROUNDS=12

# 郵件配置 (可選)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# 文件上傳配置
MAX_FILE_SIZE=10485760  # 10MB
UPLOAD_PATH=./backend/uploads/

# 安全配置
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW=900000  # 15分鐘
RATE_LIMIT_MAX=100

# Redis 配置 (生產環境可選)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### 系統配置

主要配置文件位於 `backend/config/constants.js`：

```javascript
module.exports = {
    // 服務器設置
    SERVER: {
        PORT: process.env.PORT || 8080,
        HOST: process.env.HOST || 'localhost'
    },
    
    // 數據庫設置
    DATABASE: {
        PATH: process.env.DB_PATH || './backend/database/chat.db'
    },
    
    // 更多配置...
};
```

## 📚 API 文檔

### 認證 API

#### 用戶註冊
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "用戶名",
  "email": "email@example.com",
  "password": "密碼",
  "confirmPassword": "確認密碼"
}
```

#### 用戶登錄
```http
POST /api/auth/login
Content-Type: application/json

{
  "identifier": "用戶名或郵箱",
  "password": "密碼",
  "twoFactorToken": "2FA代碼 (可選)"
}
```

#### 刷新令牌
```http
POST /api/auth/refresh
Authorization: Bearer <refresh_token>
```

### 聊天 API

#### 獲取聊天列表
```http
GET /api/chats
Authorization: Bearer <access_token>
```

#### 獲取聊天歷史
```http
GET /api/chats/:chatId/messages?page=1&limit=50
Authorization: Bearer <access_token>
```

#### 發送消息
```http
POST /api/chats/:chatId/messages
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "content": "消息內容",
  "type": "text",
  "replyTo": "回覆的消息ID (可選)"
}
```

### WebSocket 事件

#### 連接認證
```javascript
const ws = new WebSocket('ws://localhost:8080');
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-token'
}));
```

#### 發送消息
```javascript
ws.send(JSON.stringify({
  type: 'message',
  chatId: 'chat-id',
  content: '消息內容',
  messageType: 'text'
}));
```

#### 接收消息
```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch(data.type) {
    case 'message':
      // 處理新消息
      break;
    case 'user_status':
      // 處理用戶狀態更新
      break;
  }
};
```

## 🚀 部署指南

### 開發環境
```bash
# 安裝依賴
npm install

# 啟動開發服務器
npm run dev
```

### 生產環境

#### 使用 PM2
```bash
# 安裝 PM2
npm install -g pm2

# 設置生產環境變數
export NODE_ENV=production

# 啟動應用
pm2 start ecosystem.config.js

# 查看狀態
pm2 status

# 查看日誌
pm2 logs
```

#### 使用 Docker
```bash
# 構建映像
docker build -t elite-chat .

# 運行容器
docker run -d \
  --name elite-chat \
  -p 8080:8080 \
  -v $(pwd)/data:/app/backend/database \
  elite-chat
```

#### 使用 Docker Compose
```bash
# 啟動服務
docker-compose up -d

# 查看日誌
docker-compose logs -f
```

### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 支援
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 👨‍💻 開發指南

### 專案結構
```
elite-chat-app/
├── backend/                 # 後端代碼
│   ├── config/             # 配置文件
│   ├── controllers/        # 控制器
│   ├── middleware/         # 中間件
│   ├── models/            # 數據模型
│   ├── routes/            # 路由
│   ├── services/          # 業務邏輯
│   ├── utils/             # 工具函數
│   ├── websocket/         # WebSocket 處理
│   ├── database/          # 數據庫文件
│   └── uploads/           # 上傳文件
├── frontend/               # 前端代碼
│   ├── assets/            # 靜態資源
│   │   ├── css/          # 樣式文件
│   │   ├── js/           # JavaScript 文件
│   │   └── images/       # 圖片資源
│   └── pages/            # HTML 頁面
├── scripts/               # 腳本文件
├── tests/                # 測試文件
└── docs/                 # 文檔
```

### 代碼規範

#### JavaScript 規範
- 使用 ES6+ 語法
- 遵循 ESLint 配置
- 使用 async/await 處理異步
- 函數命名使用駝峰命名法
- 常量使用全大寫命名

#### CSS 規範
- 使用 CSS Variables 進行主題管理
- 採用 BEM 命名方法
- 移動優先的響應式設計
- 使用現代布局技術 (Grid/Flexbox)

#### 提交規範
```bash
# 功能新增
git commit -m "feat: 添加用戶登錄功能"

# Bug 修復
git commit -m "fix: 修復消息發送問題"

# 文檔更新
git commit -m "docs: 更新 API 文檔"

# 樣式調整
git commit -m "style: 調整聊天界面布局"
```

### 添加新功能

#### 1. 後端 API
```javascript
// backend/controllers/yourController.js
class YourController {
    static async yourMethod(req, res) {
        try {
            // 業務邏輯
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
```

#### 2. 前端組件
```javascript
// frontend/assets/js/components/YourComponent.js
class YourComponent {
    constructor(element) {
        this.element = element;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // 事件綁定
    }
}
```

#### 3. 數據庫遷移
```javascript
// scripts/migrations/001_add_your_table.js
module.exports = {
    up: async (db) => {
        await db.run(`
            CREATE TABLE your_table (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    },
    
    down: async (db) => {
        await db.run('DROP TABLE your_table');
    }
};
```

## 🧪 測試

### 運行測試
```bash
# 運行所有測試
npm test

# 運行特定測試文件
npm test -- auth.test.js

# 監視模式
npm run test:watch

# 覆蓋率報告
npm test -- --coverage
```

### 測試結構
```
tests/
├── unit/              # 單元測試
│   ├── controllers/
│   ├── services/
│   └── utils/
├── integration/       # 集成測試
│   ├── api/
│   └── websocket/
└── e2e/              # 端到端測試
    ├── auth.test.js
    └── chat.test.js
```

### 編寫測試
```javascript
// tests/unit/services/authService.test.js
const AuthService = require('../../../backend/services/authService');

describe('AuthService', () => {
    describe('generateTokens', () => {
        it('should generate valid JWT tokens', async () => {
            const user = { uuid: '123', username: 'test' };
            const tokens = AuthService.generateTokens(user);
            
            expect(tokens).toHaveProperty('accessToken');
            expect(tokens).toHaveProperty('refreshToken');
        });
    });
});
```

## 🔧 故障排除

### 常見問題

#### 1. 數據庫連接失敗
```bash
# 檢查數據庫文件權限
ls -la backend/database/

# 重新初始化數據庫
rm backend/database/chat.db
npm run setup
```

#### 2. WebSocket 連接問題
```javascript
// 檢查瀏覽器控制台錯誤
// 確認防火牆設置
// 檢查代理配置
```

#### 3. 文件上傳失敗
```bash
# 檢查上傳目錄權限
chmod 755 backend/uploads/
mkdir -p backend/uploads/temp
```

#### 4. 主題不生效
```javascript
// 清除瀏覽器快取
// 檢查 CSS 載入順序
// 確認 CSS Variables 支援
```

### 日誌查看
```bash
# 查看應用日誌
tail -f backend/logs/combined.log

# 查看錯誤日誌
tail -f backend/logs/error.log

# 查看 WebSocket 日誌
grep "WebSocket" backend/logs/combined.log
```

## 🔐 安全最佳實踐

### 生產環境安全設置
1. **更改默認密鑰**：更新所有 `.env` 中的密鑰
2. **啟用 HTTPS**：使用 SSL/TLS 證書
3. **配置防火牆**：限制不必要的端口訪問
4. **定期備份**：設置自動數據備份
5. **監控日誌**：設置異常報警
6. **更新依賴**：定期更新依賴包

### 用戶數據保護
- 密碼使用 bcrypt 加密
- 敏感數據使用 AES 加密
- 實施速率限制防止攻擊
- 定期清理過期會話
- 記錄安全相關操作

## 🔄 版本更新

### 更新步驟
```bash
# 1. 備份數據
npm run backup

# 2. 拉取最新代碼
git pull origin main

# 3. 更新依賴
npm install

# 4. 運行遷移
npm run migrate

# 5. 重啟服務
pm2 restart elite-chat
```

### 版本歷史
- **v2.0.0** - 重構架構，新增 PWA 支援
- **v1.5.0** - 新增文件共享功能
- **v1.4.0** - 新增語音訊息功能
- **v1.3.0** - 新增多主題支援
- **v1.2.0** - 新增雙因素認證
- **v1.1.0** - 新增群組聊天功能
- **v1.0.0** - 初始版本發布

## 🤝 貢獻指南

### 如何參與
1. Fork 專案
2. 創建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 創建 Pull Request

### 開發流程
1. **問題報告**：使用 GitHub Issues
2. **功能請求**：提交詳細的功能說明
3. **代碼審查**：所有 PR 需要代碼審查
4. **測試要求**：新功能需要包含測試
5. **文檔更新**：更新相關文檔

### 代碼貢獻
- 遵循現有代碼風格
- 添加適當的註釋
- 包含單元測試
- 更新相關文檔

## 📄 授權條款

本專案採用 MIT 授權條款。詳情請參見 [LICENSE](LICENSE) 文件。

```
MIT License

Copyright (c) 2024 Elite Chat Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 📞 支援與聯繫

### 獲取幫助
- **文檔**：查看 [docs/](docs/) 目錄
- **Issues**：[GitHub Issues](https://github.com/your-org/elite-chat-app/issues)
- **討論**：[GitHub Discussions](https://github.com/your-org/elite-chat-app/discussions)
