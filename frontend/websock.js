// 初始化 WebSocket 連接
const socket = new WebSocket('ws://localhost:8080');  // 這裡是指向你的 WebSocket 伺服器

// 取得 DOM 元素
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-btn');
const chatBox = document.getElementById('chat-box');

// 發送訊息
sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (message) {
        // 發送訊息到 WebSocket 伺服器
        socket.send(message);

        // 顯示使用者訊息
        addMessageToChat(message, 'user');

        // 清空輸入框
        messageInput.value = '';
    }
});

// 顯示訊息到聊天框
function addMessageToChat(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender);
    messageElement.textContent = message;
    chatBox.appendChild(messageElement);

    // 滾動到底部
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 接收 WebSocket 訊息
socket.addEventListener('message', (event) => {
    const message = event.data;
    addMessageToChat(message, 'bot');
});
