class ChatComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            autoScroll: true,
            showTypingIndicator: true,
            enableMarkdown: false,
            maxMessages: 1000,
            ...options
        };

        this.messages = [];
        this.currentChat = null;
        this.isTyping = false;
        this.typingUsers = new Set();
        this.messageInput = null;
        this.messagesContainer = null;
        this.typingIndicator = null;

        this.init();
    }

    init() {
        this.createChatInterface();
        this.bindEvents();
        this.setupMessageInput();
    }

    createChatInterface() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="chat-interface">
                <!-- 聊天標題 -->
                <div class="chat-header">
                    <div class="chat-info">
                        <div class="chat-avatar-container">
                            <img id="chat-avatar" src="" alt="聊天頭像" class="chat-avatar">
                            <div class="status-indicator" id="chat-status"></div>
                        </div>
                        <div class="chat-details">
                            <h3 id="chat-name" class="chat-name">選擇聊天</h3>
                            <div id="chat-status-text" class="chat-status-text">離線</div>
                        </div>
                    </div>
                    <div class="chat-actions">
                        <button class="btn-icon" id="voice-call-btn" title="語音通話">
                            <i class="fas fa-phone"></i>
                        </button>
                        <button class="btn-icon" id="video-call-btn" title="視頻通話">
                            <i class="fas fa-video"></i>
                        </button>
                        <button class="btn-icon" id="chat-info-btn" title="聊天資訊">
                            <i class="fas fa-info-circle"></i>
                        </button>
                        <button class="btn-icon" id="chat-menu-btn" title="更多選項">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                </div>

                <!-- 輸入指示器 -->
                <div id="typing-indicator" class="typing-indicator hidden">
                    <span class="typing-text">正在輸入</span>
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>

                <!-- 訊息容器 -->
                <div id="messages-container" class="messages-container">
                    <div class="welcome-message">
                        <div class="welcome-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <h3>開始聊天</h3>
                        <p>選擇聯絡人或群組開始對話</p>
                    </div>
                </div>

                <!-- 回覆預覽 -->
                <div id="reply-preview" class="reply-preview hidden">
                    <div class="reply-content">
                        <div class="reply-header">
                            <i class="fas fa-reply"></i>
                            <span>回覆</span>
                            <span id="reply-to-user"></span>
                        </div>
                        <div id="reply-message" class="reply-message"></div>
                    </div>
                    <button class="btn-icon reply-cancel" id="cancel-reply">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- 檔案上傳預覽 -->
                <div id="upload-preview" class="upload-preview hidden">
                    <div class="upload-header">
                        <span>準備發送的檔案</span>
                        <button class="btn-icon" id="clear-uploads">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="upload-items" class="upload-items"></div>
                </div>

                <!-- 訊息輸入區域 -->
                <div class="message-input-area">
                    <div class="input-container">
                        <button class="btn-icon" id="attach-btn" title="附加檔案">
                            <i class="fas fa-paperclip"></i>
                        </button>
                        <div class="input-wrapper">
                            <div id="message-input" 
                                 class="message-input" 
                                 contenteditable="true" 
                                 data-placeholder="輸入訊息..."></div>
                            <button class="btn-icon" id="emoji-btn" title="表情符號">
                                <i class="fas fa-smile"></i>
                            </button>
                        </div>
                        <button class="btn btn-primary" id="send-btn" title="發送" disabled>
                            <i class="fas fa-paper-plane"></i>
                        </button>
                        <button class="btn-icon voice-btn hidden" id="voice-btn" title="語音訊息">
                            <i class="fas fa-microphone"></i>
                        </button>
                    </div>
                </div>

                <!-- 隱藏的檔案輸入 -->
                <input type="file" id="file-input" multiple style="display: none;">
            </div>
        `;

        // 取得元素參考
        this.messagesContainer = this.container.querySelector('#messages-container');
        this.messageInput = this.container.querySelector('#message-input');
        this.typingIndicator = this.container.querySelector('#typing-indicator');
        this.replyPreview = this.container.querySelector('#reply-preview');
        this.uploadPreview = this.container.querySelector('#upload-preview');
    }

    bindEvents() {
        if (!this.container) return;

        // 訊息輸入事件
        if (this.messageInput) {
            this.messageInput.addEventListener('input', this.handleInput.bind(this));
            this.messageInput.addEventListener('keydown', this.handleKeydown.bind(this));
            this.messageInput.addEventListener('paste', this.handlePaste.bind(this));
            this.messageInput.addEventListener('focus', this.handleFocus.bind(this));
            this.messageInput.addEventListener('blur', this.handleBlur.bind(this));
        }

        // 按鈕事件
        this.bindButtonEvents();

        // 訊息容器事件
        if (this.messagesContainer) {
            this.messagesContainer.addEventListener('scroll', this.handleScroll.bind(this));
            this.messagesContainer.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        }

        // 檔案上傳事件
        const fileInput = this.container.querySelector('#file-input');
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        }
    }

    bindButtonEvents() {
        // 發送按鈕
        const sendBtn = this.container.querySelector('#send-btn');
        sendBtn?.addEventListener('click', this.sendMessage.bind(this));

        // 附件按鈕
        const attachBtn = this.container.querySelector('#attach-btn');
        attachBtn?.addEventListener('click', () => {
            this.container.querySelector('#file-input')?.click();
        });

        // 表情符號按鈕
        const emojiBtn = this.container.querySelector('#emoji-btn');
        emojiBtn?.addEventListener('click', this.toggleEmojiPicker.bind(this));

        // 語音按鈕
        const voiceBtn = this.container.querySelector('#voice-btn');
        voiceBtn?.addEventListener('click', this.toggleVoiceRecording.bind(this));

        // 通話按鈕
        const voiceCallBtn = this.container.querySelector('#voice-call-btn');
        voiceCallBtn?.addEventListener('click', this.startVoiceCall.bind(this));

        const videoCallBtn = this.container.querySelector('#video-call-btn');
        videoCallBtn?.addEventListener('click', this.startVideoCall.bind(this));

        // 聊天資訊按鈕
        const chatInfoBtn = this.container.querySelector('#chat-info-btn');
        chatInfoBtn?.addEventListener('click', this.showChatInfo.bind(this));

        // 聊天選單按鈕
        const chatMenuBtn = this.container.querySelector('#chat-menu-btn');
        chatMenuBtn?.addEventListener('click', this.showChatMenu.bind(this));

        // 取消回覆按鈕
        const cancelReplyBtn = this.container.querySelector('#cancel-reply');
        cancelReplyBtn?.addEventListener('click', this.cancelReply.bind(this));

        // 清除上傳按鈕
        const clearUploadsBtn = this.container.querySelector('#clear-uploads');
        clearUploadsBtn?.addEventListener('click', this.clearUploads.bind(this));
    }

    setupMessageInput() {
        if (!this.messageInput) return;

        // 設置佔位符行為
        this.updatePlaceholder();

        // 設置自動調整高度
        this.setupAutoResize();
    }

    updatePlaceholder() {
        if (!this.messageInput) return;

        if (this.messageInput.textContent.trim() === '') {
            this.messageInput.classList.add('empty');
        } else {
            this.messageInput.classList.remove('empty');
        }
    }

    setupAutoResize() {
        if (!this.messageInput) return;

        const minHeight = 44; // 最小高度
        const maxHeight = 120; // 最大高度

        const autoResize = () => {
            this.messageInput.style.height = 'auto';
            const scrollHeight = this.messageInput.scrollHeight;
            const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
            this.messageInput.style.height = newHeight + 'px';
        };

        this.messageInput.addEventListener('input', autoResize);
        autoResize(); // 初始化
    }

    // 事件處理方法
    handleInput(e) {
        this.updatePlaceholder();
        this.updateSendButton();
        this.sendTypingIndicator(true);

        // 延遲停止輸入指示器
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.sendTypingIndicator(false);
        }, 2000);
    }

    handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            this.sendMessage();
        } else if (e.key === 'Escape') {
            this.cancelReply();
        }
    }

    handlePaste(e) {
        e.preventDefault();

        // 處理純文字貼上
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) {
            document.execCommand('insertText', false, text);
        }

        // 處理檔案貼上
        const items = (e.clipboardData || window.clipboardData).items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                this.handleFileUpload([blob]);
            }
        }
    }

    handleFocus() {
        this.sendTypingIndicator(true);
    }

    handleBlur() {
        this.sendTypingIndicator(false);
    }

    handleScroll() {
        // 檢查是否滾動到頂部，載入更多訊息
        if (this.messagesContainer.scrollTop === 0) {
            this.loadMoreMessages();
        }
    }

    handleContextMenu(e) {
        e.preventDefault();

        // 檢查是否點擊在訊息上
        const messageElement = e.target.closest('.message');
        if (messageElement) {
            this.showMessageContextMenu(e, messageElement);
        }
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.handleFileUpload(files);
        }
        e.target.value = ''; // 重置檔案輸入
    }

    // 核心方法
    loadChat(chatData) {
        this.currentChat = chatData;
        this.updateChatHeader(chatData);
        this.clearMessages();
        this.loadMessages(chatData.id);
        this.showWelcomeMessage(false);
    }

    updateChatHeader(chatData) {
        if (!chatData) return;

        const chatName = this.container.querySelector('#chat-name');
        const chatAvatar = this.container.querySelector('#chat-avatar');
        const chatStatus = this.container.querySelector('#chat-status');
        const chatStatusText = this.container.querySelector('#chat-status-text');

        if (chatName) chatName.textContent = chatData.name || '未知聊天';
        if (chatAvatar) {
            chatAvatar.src = chatData.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + (chatData.name || 'U');
            chatAvatar.alt = chatData.name || '聊天頭像';
        }

        if (chatData.type === 'group') {
            if (chatStatusText) chatStatusText.textContent = `${chatData.memberCount || 0} 位成員`;
            if (chatStatus) chatStatus.style.display = 'none';
        } else {
            if (chatStatusText) chatStatusText.textContent = this.getStatusText(chatData.status);
            if (chatStatus) {
                chatStatus.className = `status-indicator ${chatData.status || 'offline'}`;
                chatStatus.style.display = 'block';
            }
        }
    }

    getStatusText(status) {
        const statusMap = {
            online: '線上',
            away: '離開',
            busy: '忙碌',
            offline: '離線'
        };
        return statusMap[status] || '離線';
    }

    async loadMessages(chatId) {
        try {
            // 這裡應該調用 API 載入訊息
            // 目前使用模擬資料
            const messages = await this.fetchMessages(chatId);
            this.displayMessages(messages);
        } catch (error) {
            console.error('載入訊息失敗:', error);
            this.showError('載入訊息失敗');
        }
    }

    async fetchMessages(chatId) {
        // 模擬 API 調用
        return new Promise(resolve => {
            setTimeout(() => {
                resolve([
                    {
                        id: '1',
                        content: '你好！',
                        type: 'text',
                        sender: {
                            id: 'other',
                            name: 'Alice',
                            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice'
                        },
                        timestamp: new Date(Date.now() - 300000),
                        isOwn: false
                    },
                    {
                        id: '2',
                        content: '嗨！最近好嗎？',
                        type: 'text',
                        sender: {
                            id: 'me',
                            name: '我',
                            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me'
                        },
                        timestamp: new Date(Date.now() - 180000),
                        isOwn: true
                    },
                    {
                        id: '3',
                        content: '很好！工作很順利 😊',
                        type: 'text',
                        sender: {
                            id: 'other',
                            name: 'Alice',
                            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice'
                        },
                        timestamp: new Date(Date.now() - 60000),
                        isOwn: false
                    }
                ]);
            }, 500);
        });
    }

    displayMessages(messages) {
        if (!this.messagesContainer) return;

        this.messages = messages;
        this.renderMessages();
        this.scrollToBottom();
    }

    renderMessages() {
        if (!this.messagesContainer) return;

        const messagesHTML = this.messages.map(message => this.createMessageHTML(message)).join('');
        this.messagesContainer.innerHTML = messagesHTML;

        // 綁定訊息事件
        this.bindMessageEvents();
    }

    createMessageHTML(message) {
        const isOwn = message.isOwn;
        const timeStr = this.formatMessageTime(message.timestamp);

        return `
            <div class="message ${isOwn ? 'own' : ''}" data-message-id="${message.id}">
                ${!isOwn ? `<img src="${message.sender.avatar}" alt="${message.sender.name}" class="message-avatar">` : ''}
                <div class="message-content-wrapper">
                    ${!isOwn ? `
                        <div class="message-header">
                            <span class="message-sender">${message.sender.name}</span>
                            <span class="message-time">${timeStr}</span>
                        </div>
                    ` : ''}
                    <div class="message-bubble">
                        ${this.renderMessageContent(message)}
                        ${isOwn ? `<div class="message-time">${timeStr}</div>` : ''}
                    </div>
                    <div class="message-actions">
                        <button class="message-action-btn" data-action="reply" title="回覆">
                            <i class="fas fa-reply"></i>
                        </button>
                        <button class="message-action-btn" data-action="react" title="反應">
                            <i class="fas fa-heart"></i>
                        </button>
                        <button class="message-action-btn" data-action="more" title="更多">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    renderMessageContent(message) {
        switch (message.type) {
            case 'text':
                return `<p class="message-text">${this.escapeHtml(message.content)}</p>`;
            case 'image':
                return `
                    <div class="message-image-container">
                        <img src="${message.content}" alt="圖片" class="message-image" loading="lazy">
                    </div>
                `;
            case 'file':
                return `
                    <div class="message-file">
                        <div class="file-icon">
                            <i class="fas fa-file"></i>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${message.fileName}</div>
                            <div class="file-size">${this.formatFileSize(message.fileSize)}</div>
                        </div>
                        <button class="file-download" data-url="${message.content}">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                `;
            case 'voice':
                return `
                    <div class="message-voice">
                        <button class="voice-play-btn" data-url="${message.content}">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="voice-waveform">
                            <div class="voice-duration">${message.duration || '0:00'}</div>
                        </div>
                    </div>
                `;
            default:
                return `<p class="message-text">${this.escapeHtml(message.content)}</p>`;
        }
    }

    bindMessageEvents() {
        // 綁定訊息動作按鈕
        this.messagesContainer.querySelectorAll('.message-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const messageElement = btn.closest('.message');
                const messageId = messageElement.dataset.messageId;
                this.handleMessageAction(action, messageId);
            });
        });

        // 綁定檔案下載
        this.messagesContainer.querySelectorAll('.file-download').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                this.downloadFile(url);
            });
        });

        // 綁定語音播放
        this.messagesContainer.querySelectorAll('.voice-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                this.playVoiceMessage(url, btn);
            });
        });

        // 綁定圖片點擊
        this.messagesContainer.querySelectorAll('.message-image').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showImageModal(img.src);
            });
        });
    }

    sendMessage() {
        if (!this.messageInput || !this.currentChat) return;

        const content = this.messageInput.textContent.trim();
        if (!content && !this.hasUploadedFiles()) return;

        const messageData = {
            content,
            type: 'text',
            chatId: this.currentChat.id,
            replyTo: this.replyTo || null
        };

        // 發送訊息
        this.emit('sendMessage', messageData);

        // 清理輸入
        this.clearInput();
        this.cancelReply();
        this.clearUploads();
    }

    addMessage(message) {
        this.messages.push(message);

        // 如果訊息太多，移除舊的
        if (this.messages.length > this.options.maxMessages) {
            this.messages = this.messages.slice(-this.options.maxMessages);
        }

        // 添加到 DOM
        this.appendMessageToDOM(message);

        if (this.options.autoScroll) {
            this.scrollToBottom();
        }
    }

    appendMessageToDOM(message) {
        if (!this.messagesContainer) return;

        const messageHTML = this.createMessageHTML(message);
        const messageElement = document.createElement('div');
        messageElement.innerHTML = messageHTML;
        const messageNode = messageElement.firstElementChild;

        this.messagesContainer.appendChild(messageNode);

        // 添加動畫
        messageNode.classList.add('animate-message-in');

        // 重新綁定事件
        this.bindMessageEvents();
    }

    clearMessages() {
        this.messages = [];
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
        }
    }

    clearInput() {
        if (this.messageInput) {
            this.messageInput.textContent = '';
            this.updatePlaceholder();
            this.updateSendButton();
        }
    }

    updateSendButton() {
        const sendBtn = this.container.querySelector('#send-btn');
        const voiceBtn = this.container.querySelector('#voice-btn');

        if (!sendBtn || !voiceBtn) return;

        const hasContent = this.messageInput?.textContent.trim().length > 0 || this.hasUploadedFiles();

        sendBtn.disabled = !hasContent;

        if (hasContent) {
            sendBtn.classList.remove('hidden');
            voiceBtn.classList.add('hidden');
        } else {
            sendBtn.classList.add('hidden');
            voiceBtn.classList.remove('hidden');
        }
    }

    // 輸入指示器相關方法
    showTypingIndicator(users) {
        if (!this.options.showTypingIndicator || !this.typingIndicator) return;

        if (users && users.length > 0) {
            const typingText = this.getTypingText(users);
            this.typingIndicator.querySelector('.typing-text').textContent = typingText;
            this.typingIndicator.classList.remove('hidden');
        } else {
            this.typingIndicator.classList.add('hidden');
        }
    }

    getTypingText(users) {
        if (users.length === 1) {
            return `${users[0].name} 正在輸入`;
        } else if (users.length === 2) {
            return `${users[0].name} 和 ${users[1].name} 正在輸入`;
        } else {
            return `${users[0].name} 等 ${users.length} 人正在輸入`;
        }
    }

    sendTypingIndicator(isTyping) {
        if (this.isTyping === isTyping) return;

        this.isTyping = isTyping;
        this.emit('typing', {
            chatId: this.currentChat?.id,
            isTyping
        });
    }

    // 回覆相關方法
    replyToMessage(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return;

        this.replyTo = messageId;
        this.showReplyPreview(message);
        this.focusInput();
    }

    showReplyPreview(message) {
        if (!this.replyPreview) return;

        const replyToUser = this.replyPreview.querySelector('#reply-to-user');
        const replyMessage = this.replyPreview.querySelector('#reply-message');

        if (replyToUser) replyToUser.textContent = message.sender.name;
        if (replyMessage) replyMessage.textContent = this.getMessagePreview(message);

        this.replyPreview.classList.remove('hidden');
    }

    cancelReply() {
        this.replyTo = null;
        if (this.replyPreview) {
            this.replyPreview.classList.add('hidden');
        }
    }

    getMessagePreview(message) {
        switch (message.type) {
            case 'text':
                return message.content.length > 50
                    ? message.content.substring(0, 50) + '...'
                    : message.content;
            case 'image':
                return '📷 圖片';
            case 'file':
                return `📄 ${message.fileName}`;
            case 'voice':
                return '🎤 語音訊息';
            default:
                return '訊息';
        }
    }

    // 檔案處理相關方法
    handleFileUpload(files) {
        const validFiles = this.validateFiles(files);
        if (validFiles.length === 0) return;

        validFiles.forEach(file => {
            this.addFileToPreview(file);
        });

        this.showUploadPreview();
        this.updateSendButton();
    }

    validateFiles(files) {
        const maxSize = 50 * 1024 * 1024; // 50MB
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm',
            'audio/mp3', 'audio/wav', 'audio/ogg',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];

        return files.filter(file => {
            if (file.size > maxSize) {
                this.showError(`檔案 ${file.name} 超過 50MB 限制`);
                return false;
            }
            if (!allowedTypes.includes(file.type)) {
                this.showError(`不支援的檔案類型: ${file.name}`);
                return false;
            }
            return true;
        });
    }

    addFileToPreview(file) {
        const uploadItems = this.container.querySelector('#upload-items');
        if (!uploadItems) return;

        const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const fileItem = document.createElement('div');
        fileItem.className = 'upload-item';
        fileItem.dataset.fileId = fileId;

        fileItem.innerHTML = `
            <div class="upload-item-preview">
                ${this.getFilePreview(file)}
            </div>
            <div class="upload-item-info">
                <div class="upload-item-name">${file.name}</div>
                <div class="upload-item-size">${this.formatFileSize(file.size)}</div>
                <div class="upload-progress">
                    <div class="progress-bar" style="width: 0%"></div>
                </div>
            </div>
            <button type="button" class="upload-item-remove" title="移除">
                <i class="fas fa-times"></i>
            </button>
        `;

        // 綁定移除事件
        fileItem.querySelector('.upload-item-remove').addEventListener('click', () => {
            this.removeFileFromPreview(fileId);
        });

        uploadItems.appendChild(fileItem);

        // 儲存檔案參考
        this.uploadedFiles = this.uploadedFiles || new Map();
        this.uploadedFiles.set(fileId, file);
    }

    getFilePreview(file) {
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            return `<img src="${url}" alt="預覽" onload="URL.revokeObjectURL(this.src)">`;
        } else if (file.type.startsWith('video/')) {
            return '<i class="fas fa-video"></i>';
        } else if (file.type.startsWith('audio/')) {
            return '<i class="fas fa-music"></i>';
        } else if (file.type === 'application/pdf') {
            return '<i class="fas fa-file-pdf"></i>';
        } else if (file.type.includes('word')) {
            return '<i class="fas fa-file-word"></i>';
        } else {
            return '<i class="fas fa-file"></i>';
        }
    }

    removeFileFromPreview(fileId) {
        const fileItem = this.container.querySelector(`[data-file-id="${fileId}"]`);
        if (fileItem) {
            fileItem.remove();
        }

        if (this.uploadedFiles) {
            this.uploadedFiles.delete(fileId);
        }

        // 檢查是否還有檔案
        if (!this.hasUploadedFiles()) {
            this.hideUploadPreview();
        }

        this.updateSendButton();
    }

    showUploadPreview() {
        if (this.uploadPreview) {
            this.uploadPreview.classList.remove('hidden');
        }
    }

    hideUploadPreview() {
        if (this.uploadPreview) {
            this.uploadPreview.classList.add('hidden');
        }
    }

    clearUploads() {
        const uploadItems = this.container.querySelector('#upload-items');
        if (uploadItems) {
            uploadItems.innerHTML = '';
        }

        this.uploadedFiles = new Map();
        this.hideUploadPreview();
        this.updateSendButton();
    }

    hasUploadedFiles() {
        return this.uploadedFiles && this.uploadedFiles.size > 0;
    }

    // 訊息動作處理
    handleMessageAction(action, messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return;

        switch (action) {
            case 'reply':
                this.replyToMessage(messageId);
                break;
            case 'react':
                this.showReactionPicker(messageId);
                break;
            case 'more':
                this.showMessageMenu(messageId);
                break;
        }
    }

    showReactionPicker(messageId) {
        // 實作反應選擇器
        this.emit('showReactionPicker', { messageId });
    }

    showMessageMenu(messageId) {
        // 實作訊息選單
        this.emit('showMessageMenu', { messageId });
    }

    showMessageContextMenu(event, messageElement) {
        const messageId = messageElement.dataset.messageId;
        this.emit('showContextMenu', {
            messageId,
            x: event.clientX,
            y: event.clientY
        });
    }

    // 通話相關方法
    startVoiceCall() {
        if (!this.currentChat) return;
        this.emit('startVoiceCall', { chatId: this.currentChat.id });
    }

    startVideoCall() {
        if (!this.currentChat) return;
        this.emit('startVideoCall', { chatId: this.currentChat.id });
    }

    // 其他功能
    toggleEmojiPicker() {
        this.emit('toggleEmojiPicker');
    }

    toggleVoiceRecording() {
        this.emit('toggleVoiceRecording');
    }

    showChatInfo() {
        if (!this.currentChat) return;
        this.emit('showChatInfo', { chatId: this.currentChat.id });
    }

    showChatMenu() {
        if (!this.currentChat) return;
        this.emit('showChatMenu', { chatId: this.currentChat.id });
    }

    // 多媒體處理
    showImageModal(imageSrc) {
        this.emit('showImageModal', { src: imageSrc });
    }

    downloadFile(url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    playVoiceMessage(url, button) {
        // 實作語音播放
        if (this.currentAudio) {
            this.currentAudio.pause();
        }

        this.currentAudio = new Audio(url);
        const icon = button.querySelector('i');

        icon.className = 'fas fa-pause';

        this.currentAudio.addEventListener('ended', () => {
            icon.className = 'fas fa-play';
        });

        this.currentAudio.addEventListener('error', () => {
            icon.className = 'fas fa-play';
            this.showError('無法播放語音訊息');
        });

        this.currentAudio.play();
    }

    // 載入更多訊息
    async loadMoreMessages() {
        if (this.isLoadingMore || !this.currentChat) return;

        this.isLoadingMore = true;

        try {
            const olderMessages = await this.fetchOlderMessages(this.currentChat.id, this.messages[0]?.id);
            if (olderMessages.length > 0) {
                const oldScrollHeight = this.messagesContainer.scrollHeight;

                this.messages.unshift(...olderMessages);
                this.renderMessages();

                // 保持滾動位置
                const newScrollHeight = this.messagesContainer.scrollHeight;
                this.messagesContainer.scrollTop = newScrollHeight - oldScrollHeight;
            }
        } catch (error) {
            console.error('載入更多訊息失敗:', error);
        } finally {
            this.isLoadingMore = false;
        }
    }

    async fetchOlderMessages(chatId, beforeMessageId) {
        // 模擬 API 調用
        return new Promise(resolve => {
            setTimeout(() => {
                resolve([]); // 返回空陣列表示沒有更多訊息
            }, 500);
        });
    }

    // 滾動相關方法
    scrollToBottom(smooth = true) {
        if (!this.messagesContainer) return;

        const scrollOptions = {
            top: this.messagesContainer.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        };

        this.messagesContainer.scrollTo(scrollOptions);
    }

    scrollToMessage(messageId) {
        const messageElement = this.messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElement.classList.add('highlight');
            setTimeout(() => {
                messageElement.classList.remove('highlight');
            }, 2000);
        }
    }

    // 歡迎訊息相關
    showWelcomeMessage(show = true) {
        const welcomeMessage = this.messagesContainer?.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = show ? 'flex' : 'none';
        }
    }

    // 焦點管理
    focusInput() {
        if (this.messageInput) {
            this.messageInput.focus();

            // 將游標移到最後
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(this.messageInput);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    // 工具方法
    formatMessageTime(timestamp) {
        const now = new Date();
        const messageTime = new Date(timestamp);
        const diff = now - messageTime;

        if (diff < 60000) { // 小於1分鐘
            return '剛剛';
        } else if (diff < 3600000) { // 小於1小時
            return `${Math.floor(diff / 60000)} 分鐘前`;
        } else if (messageTime.toDateString() === now.toDateString()) { // 今天
            return messageTime.toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (diff < 86400000 * 7) { // 一週內
            return messageTime.toLocaleDateString('zh-TW', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else { // 更早
            return messageTime.toLocaleDateString('zh-TW', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 錯誤處理
    showError(message) {
        this.emit('error', { message });
    }

    // 事件發射器
    emit(event, data) {
        if (this.options.onEvent) {
            this.options.onEvent(event, data);
        }

        // 也可以使用自定義事件
        const customEvent = new CustomEvent(`chat:${event}`, { detail: data });
        this.container.dispatchEvent(customEvent);
    }

    // 公共 API 方法
    getMessages() {
        return [...this.messages];
    }

    getCurrentChat() {
        return this.currentChat;
    }

    insertText(text) {
        if (!this.messageInput) return;

        if (document.execCommand) {
            document.execCommand('insertText', false, text);
        } else {
            // 備用方法
            this.messageInput.textContent += text;
        }

        this.updatePlaceholder();
        this.updateSendButton();
        this.focusInput();
    }

    insertEmoji(emoji) {
        this.insertText(emoji);
    }

    setTypingUsers(users) {
        this.showTypingIndicator(users);
    }

    markMessagesAsRead() {
        if (!this.currentChat) return;

        this.emit('markAsRead', {
            chatId: this.currentChat.id
        });
    }

    // 清理方法
    destroy() {
        // 清理事件監聽器
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        // 清理檔案 URL
        if (this.uploadedFiles) {
            this.uploadedFiles.forEach(file => {
                if (file.preview) {
                    URL.revokeObjectURL(file.preview);
                }
            });
        }

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatComponent;
} else {
    window.ChatComponent = ChatComponent;
}