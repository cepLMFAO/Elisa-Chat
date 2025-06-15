// 引入 WebSocket 庫
const WebSocket = require('ws');

// 設定 WebSocket 伺服器，並綁定到 8080 埠口
const wss = new WebSocket.Server({ port: 8080 });

// 當有新的連接進來時
wss.on('connection', (ws) => {
    console.log('新用戶已連接');

    // 當接收到來自客戶端的訊息時
    ws.on('message', (message) => {
        console.log(`收到訊息: ${message}`);

        // 將訊息廣播給所有連接的用戶
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    // 當連接關閉時
    ws.on('close', () => {
        console.log('用戶已斷開連接');
    });

    // 當發生錯誤時
    ws.on('error', (error) => {
        console.error('WebSocket 錯誤:', error);
    });
});

console.log('WebSocket 伺服器正在運行於 ws://localhost:8080');
