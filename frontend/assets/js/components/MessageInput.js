
class MessageInputComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            placeholder: '輸入訊息...',
            maxLength: 4000,
            autoResize: true,
            minHeight: 44,
            maxHeight: 120,
            enableMarkdown: false,
            enableMentions: true,
            enableEmojis: true,
            enableFiles: true,
            enableVoice: true,
            sendOnEnter: true,
            showCharacterCount: false,
            ...options
        };

        this.input = null;
        this.sendButton = null;
        this.attachButton = null;
        this.emojiButton = null;
        this.voiceButton = null;
        this.characterCount = null;

        this.isComposing = false;
        this.mentionSuggestions = [];
        this.currentMention = null;
        this.emojiPicker = null;
        this.fileUploader = null;
        this.voiceRecorder = null;

        this.init();
    }

    init() {
        this.createInputInterface();
        this.bindEvents();
        this.setupPlugins();
    }

    createInputInterface() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="message-input-container">
                <!-- 回覆預覽 -->
                <div class="reply-preview hidden" id="reply-preview">
                    <div class="reply-content">
                        <div class="reply-header">
                            <i class="fas fa-reply"></i>
                            <span>回覆</span>
                            <span class="reply-to-user" id="reply-to-user"></span>
                        </div>
                        <div class="reply-message" id="reply-message"></div>
                    </div>
                    <button class="btn-icon reply-cancel" id="cancel-reply">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- 提及建議 -->
                <div class="mention-suggestions hidden" id="mention-suggestions">
                    <div class="suggestions-list" id="suggestions-list">
                        <!-- 建議項目會動態插入 -->
                    </div>
                </div>

                <!-- 輸入區域 -->
                <div class="input-area">
                    <div class="input-wrapper">
                        <!-- 附件按鈕 -->
                        <button class="input-btn attach-btn" id="attach-btn" title="附加檔案">
                            <i class="fas fa-paperclip"></i>
                        </button>

                        <!-- 主要輸入框 -->
                        <div class="input-field-wrapper">
                            <div class="input-field" 
                                 id="message-input"
                                 contenteditable="true"
                                 data-placeholder="${this.options.placeholder}"
                                 role="textbox"
                                 aria-label="訊息輸入框"
                                 aria-multiline="true"></div>
                            
                            <!-- 字數統計 -->
                            ${this.options.showCharacterCount ? `
                                <div class="character-count" id="character-count">
                                    <span class="current">0</span>
                                    <span class="max">/${this.options.maxLength}</span>
                                </div>
                            ` : ''}
                        </div>

                        <!-- 表情符號按鈕 -->
                        <button class="input-btn emoji-btn" id="emoji-btn" title="表情符號">
                            <i class="fas fa-smile"></i>
                        </button>

                        <!-- 語音按鈕 -->
                        <button class="input-btn voice-btn" id="voice-btn" title="語音訊息">
                            <i class="fas fa-microphone"></i>
                        </button>

                        <!-- 發送按鈕 -->
                        <button class="btn btn-primary send-btn" id="send-btn" disabled title="發送訊息">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>

                <!-- 輸入提示 -->
                <div class="input-hints hidden" id="input-hints">
                    <div class="hint-item">
                        <kbd>Enter</kbd> 發送訊息
                    </div>
                    <div class="hint-item">
                        <kbd>Shift + Enter</kbd> 新行
                    </div>
                    <div class="hint-item">
                        <kbd>@</kbd> 提及使用者
                    </div>
                </div>
            </div>
        `;

        this.getElements();
    }

    getElements() {
        this.input = this.container.querySelector('#message-input');
        this.sendButton = this.container.querySelector('#send-btn');
        this.attachButton = this.container.querySelector('#attach-btn');
        this.emojiButton = this.container.querySelector('#emoji-btn');
        this.voiceButton = this.container.querySelector('#voice-btn');
        this.replyPreview = this.container.querySelector('#reply-preview');
        this.cancelReplyBtn = this.container.querySelector('#cancel-reply');
        this.mentionSuggestions = this.container.querySelector('#mention-suggestions');
        this.suggestionsList = this.container.querySelector('#suggestions-list');
        this.characterCount = this.container.querySelector('#character-count');
        this.inputHints = this.container.querySelector('#input-hints');
    }

    bindEvents() {
        if (!this.input) return;

        // 輸入事件
        this.input.addEventListener('input', this.handleInput.bind(this));
        this.input.addEventListener('keydown', this.handleKeydown.bind(this));
        this.input.addEventListener('keyup', this.handleKeyup.bind(this));
        this.input.addEventListener('paste', this.handlePaste.bind(this));
        this.input.addEventListener('focus', this.handleFocus.bind(this));
        this.input.addEventListener('blur', this.handleBlur.bind(this));

        // 中文輸入法支援
        this.input.addEventListener('compositionstart', () => {
            this.isComposing = true;
        });

        this.input.addEventListener('compositionend', () => {
            this.isComposing = false;
            this.handleInput();
        });

        // 按鈕事件
        this.sendButton?.addEventListener('click', this.sendMessage.bind(this));
        this.attachButton?.addEventListener('click', this.showFileUploader.bind(this));
        this.emojiButton?.addEventListener('click', this.toggleEmojiPicker.bind(this));
        this.voiceButton?.addEventListener('click', this.startVoiceRecording.bind(this));
        this.cancelReplyBtn?.addEventListener('click', this.cancelReply.bind(this));

        // 提及建議事件
        this.mentionSuggestions?.addEventListener('click', this.handleMentionClick.bind(this));

        // 自動調整高度
        if (this.options.autoResize) {
            this.setupAutoResize();
        }
    }

    setupPlugins() {
        // 初始化表情符號選擇器
        if (this.options.enableEmojis && typeof EmojiPickerComponent !== 'undefined') {
            this.initEmojiPicker();
        }

        // 初始化檔案上傳器
        if (this.options.enableFiles && typeof FileUploadComponent !== 'undefined') {
            this.initFileUploader();
        }

        // 初始化語音錄音器
        if (this.options.enableVoice && typeof VoiceRecorderComponent !== 'undefined') {
            this.initVoiceRecorder();
        }
    }

    initEmojiPicker() {
        const emojiContainer = document.createElement('div');
        emojiContainer.className = 'emoji-picker-container';
        document.body.appendChild(emojiContainer);

        this.emojiPicker = new EmojiPickerComponent(emojiContainer, {
            position: 'top-right',
            anchor: this.emojiButton,
            autoClose: true,
            onEvent: (event, data) => {
                if (event === 'select') {
                    this.insertEmoji(data.emoji);
                }
            }
        });
    }

    initFileUploader() {
        // 創建隱藏的檔案上傳容器
        const uploaderContainer = document.createElement('div');
        uploaderContainer.style.display = 'none';
        document.body.appendChild(uploaderContainer);

        this.fileUploader = new FileUploadComponent(uploaderContainer, {
            multiple: true,
            showPreview: true,
            uploadOnSelect: false,
            onEvent: (event, data) => {
                if (event === 'fileSelected') {
                    this.handleFileSelected(data.files);
                }
            }
        });
    }

    initVoiceRecorder() {
        const recorderContainer = document.createElement('div');
        recorderContainer.className = 'voice-recorder-modal';
        document.body.appendChild(recorderContainer);

        this.voiceRecorder = new VoiceRecorderComponent({
            container: recorderContainer,
            onEvent: (event, data) => {
                if (event === 'recordingSend') {
                    this.handleVoiceMessage(data);
                    this.hideVoiceRecorder();
                } else if (event === 'recordingCancelled') {
                    this.hideVoiceRecorder();
                }
            }
        });
    }

    setupAutoResize() {
        const resizeInput = () => {
            if (!this.input) return;

            // 重置高度以計算實際內容高度
            this.input.style.height = 'auto';

            const scrollHeight = this.input.scrollHeight;
            const newHeight = Math.min(
                Math.max(scrollHeight, this.options.minHeight),
                this.options.maxHeight
            );

            this.input.style.height = newHeight + 'px';

            // 如果內容超過最大高度，顯示滾動條
            if (scrollHeight > this.options.maxHeight) {
                this.input.style.overflowY = 'auto';
            } else {
                this.input.style.overflowY = 'hidden';
            }
        };

        this.input.addEventListener('input', resizeInput);
        resizeInput(); // 初始化
    }

    // 事件處理方法
    handleInput(e) {
        if (this.isComposing) return;

        this.updateSendButton();
        this.updateCharacterCount();
        this.handleMentions();

        this.emit('input', {
            content: this.getContent(),
            isEmpty: this.isEmpty()
        });

        // 發送輸入指示器
        this.sendTypingIndicator();
    }

    handleKeydown(e) {
        // Enter 鍵處理
        if (e.key === 'Enter') {
            if (this.options.sendOnEnter && !e.shiftKey && !e.ctrlKey && !this.isComposing) {
                e.preventDefault();
                this.sendMessage();
                return;
            }
        }

        // Escape 鍵
        if (e.key === 'Escape') {
            this.cancelReply();
            this.hideMentionSuggestions();
            this.hideEmojiPicker();
        }

        // 方向鍵處理（用於提及建議導航）
        if (this.isMentionSuggestionsVisible()) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateMentionSuggestions(e.key === 'ArrowDown' ? 1 : -1);
                return;
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                this.selectMentionSuggestion();
                return;
            }
        }

        // 字數限制檢查
        if (this.getContentLength() >= this.options.maxLength) {
            // 允許的鍵：Backspace, Delete, 方向鍵等
            const allowedKeys = [
                'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Escape'
            ];

            if (!allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
            }
        }
    }

    handleKeyup(e) {
        // 延遲處理，確保內容已更新
        setTimeout(() => {
            this.handleMentions();
        }, 0);
    }

    handlePaste(e) {
        e.preventDefault();

        // 處理純文字貼上
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        this.insertText(text);

        // 處理圖片貼上
        const items = (e.clipboardData || window.clipboardData).items;
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                this.handleFileSelected([file]);
            }
        }
    }

    handleFocus() {
        this.container.classList.add('focused');
        this.emit('focus');
    }

    handleBlur() {
        this.container.classList.remove('focused');

        // 延遲隱藏建議，允許點擊
        setTimeout(() => {
            this.hideMentionSuggestions();
        }, 200);

        this.emit('blur');
    }

    // 發送訊息
    sendMessage() {
        const content = this.getContent().trim();
        if (!content) return;

        const messageData = {
            content,
            type: 'text',
            replyTo: this.replyTo || null,
            mentions: this.extractMentions(content)
        };

        this.emit('send', messageData);
        this.clear();
        this.cancelReply();
    }

    // 內容管理
    getContent() {
        if (!this.input) return '';
        return this.input.textContent || '';
    }

    setContent(content) {
        if (!this.input) return;
        this.input.textContent = content;
        this.updateSendButton();
        this.updateCharacterCount();
    }

    clear() {
        this.setContent('');
        this.focus();
    }

    isEmpty() {
        return !this.getContent().trim();
    }

    getContentLength() {
        return this.getContent().length;
    }

    insertText(text) {
        if (!this.input) return;

        const selection = window.getSelection();
        const range = selection.getRangeAt(0);

        range.deleteContents();
        range.insertNode(document.createTextNode(text));

        // 移動游標到插入文字後
        range.setStartAfter(range.endContainer);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        this.handleInput();
    }

    insertEmoji(emoji) {
        this.insertText(emoji);
        this.focus();
    }

    focus() {
        if (this.input) {
            this.input.focus();

            // 將游標移到最後
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(this.input);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    // 回覆功能
    replyTo(message) {
        this.replyTo = message.id;
        this.showReplyPreview(message);
        this.focus();
    }

    showReplyPreview(message) {
        if (!this.replyPreview) return;

        const replyToUser = this.container.querySelector('#reply-to-user');
        const replyMessage = this.container.querySelector('#reply-message');

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
        const maxLength = 50;
        let preview = '';

        switch (message.type) {
            case 'text':
                preview = message.content;
                break;
            case 'image':
                preview = '📷 圖片';
                break;
            case 'file':
                preview = `📄 ${message.fileName}`;
                break;
            case 'voice':
                preview = '🎤 語音訊息';
                break;
            default:
                preview = '訊息';
        }

        return preview.length > maxLength ? preview.substring(0, maxLength) + '...' : preview;
    }

    // 提及功能
    handleMentions() {
        if (!this.options.enableMentions) return;

        const content = this.getContent();
        const cursorPosition = this.getCursorPosition();

        // 查找當前游標位置的 @ 符號
        const atIndex = content.lastIndexOf('@', cursorPosition);

        if (atIndex !== -1) {
            const query = content.substring(atIndex + 1, cursorPosition);

            // 檢查 @ 後面是否只有字母數字和下劃線
            if (/^[\w]*$/.test(query)) {
                this.currentMention = {
                    start: atIndex,
                    end: cursorPosition,
                    query: query
                };

                this.showMentionSuggestions(query);
                return;
            }
        }

        this.hideMentionSuggestions();
    }

    async showMentionSuggestions(query) {
        try {
            // 獲取建議使用者列表
            const suggestions = await this.getMentionSuggestions(query);

            if (suggestions.length === 0) {
                this.hideMentionSuggestions();
                return;
            }

            this.renderMentionSuggestions(suggestions);
            this.mentionSuggestions?.classList.remove('hidden');

        } catch (error) {
            console.error('獲取提及建議失敗:', error);
        }
    }

    async getMentionSuggestions(query) {
        // 這裡應該調用 API 獲取使用者列表
        // 模擬資料
        const allUsers = [
            { id: '1', username: 'alice', displayName: 'Alice Chen', avatar: 'avatar1.jpg' },
            { id: '2', username: 'bob', displayName: 'Bob Wang', avatar: 'avatar2.jpg' },
            { id: '3', username: 'charlie', displayName: 'Charlie Liu', avatar: 'avatar3.jpg' }
        ];

        return allUsers.filter(user =>
            user.username.toLowerCase().includes(query.toLowerCase()) ||
            user.displayName.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);
    }

    renderMentionSuggestions(suggestions) {
        if (!this.suggestionsList) return;

        this.suggestionsList.innerHTML = suggestions.map((user, index) => `
            <div class="suggestion-item ${index === 0 ? 'selected' : ''}" 
                 data-user-id="${user.id}" 
                 data-username="${user.username}">
                <img src="${user.avatar}" alt="${user.displayName}" class="suggestion-avatar">
                <div class="suggestion-info">
                    <div class="suggestion-name">${user.displayName}</div>
                    <div class="suggestion-username">@${user.username}</div>
                </div>
            </div>
        `).join('');
    }

    hideMentionSuggestions() {
        this.mentionSuggestions?.classList.add('hidden');
        this.currentMention = null;
    }

    isMentionSuggestionsVisible() {
        return this.mentionSuggestions && !this.mentionSuggestions.classList.contains('hidden');
    }

    navigateMentionSuggestions(direction) {
        const items = this.suggestionsList?.querySelectorAll('.suggestion-item');
        if (!items || items.length === 0) return;

        const currentIndex = Array.from(items).findIndex(item =>
            item.classList.contains('selected')
        );

        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = items.length - 1;
        if (newIndex >= items.length) newIndex = 0;

        items.forEach(item => item.classList.remove('selected'));
        items[newIndex].classList.add('selected');
    }

    selectMentionSuggestion() {
        const selectedItem = this.suggestionsList?.querySelector('.suggestion-item.selected');
        if (!selectedItem || !this.currentMention) return;

        const username = selectedItem.dataset.username;
        this.insertMention(username);
    }

    handleMentionClick(e) {
        const suggestionItem = e.target.closest('.suggestion-item');
        if (!suggestionItem) return;

        const username = suggestionItem.dataset.username;
        this.insertMention(username);
    }

    insertMention(username) {
        if (!this.currentMention) return;

        const content = this.getContent();
        const before = content.substring(0, this.currentMention.start);
        const after = content.substring(this.currentMention.end);
        const newContent = before + '@' + username + ' ' + after;

        this.setContent(newContent);

        // 設置游標位置
        const newPosition = this.currentMention.start + username.length + 2;
        this.setCursorPosition(newPosition);

        this.hideMentionSuggestions();
    }

    extractMentions(content) {
        const mentionRegex = /@(\w+)/g;
        const mentions = [];
        let match;

        while ((match = mentionRegex.exec(content)) !== null) {
            mentions.push(match[1]);
        }

        return mentions;
    }

    // 游標位置管理
    getCursorPosition() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return 0;

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(this.input);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        return preCaretRange.toString().length;
    }

    setCursorPosition(position) {
        const selection = window.getSelection();
        const range = document.createRange();

        let currentPosition = 0;
        const walker = document.createTreeWalker(
            this.input,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const nodeLength = node.textContent.length;
            if (currentPosition + nodeLength >= position) {
                range.setStart(node, position - currentPosition);
                range.collapse(true);
                break;
            }
            currentPosition += nodeLength;
        }

        selection.removeAllRanges();
        selection.addRange(range);
    }

    // UI 更新方法
    updateSendButton() {
        const hasContent = !this.isEmpty();

        if (this.sendButton) {
            this.sendButton.disabled = !hasContent;
        }

        // 切換語音和發送按鈕
        if (hasContent) {
            this.sendButton?.classList.remove('hidden');
            this.voiceButton?.classList.add('hidden');
        } else {
            this.sendButton?.classList.add('hidden');
            this.voiceButton?.classList.remove('hidden');
        }
    }

    updateCharacterCount() {
        if (!this.characterCount) return;

        const current = this.getContentLength();
        const max = this.options.maxLength;
        const currentSpan = this.characterCount.querySelector('.current');

        if (currentSpan) {
            currentSpan.textContent = current;
        }

        // 更新樣式
        this.characterCount.classList.toggle('warning', current > max * 0.8);
        this.characterCount.classList.toggle('error', current >= max);
    }

    sendTypingIndicator() {
        // 節流處理
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        this.emit('typing', { isTyping: true });

        this.typingTimeout = setTimeout(() => {
            this.emit('typing', { isTyping: false });
        }, 2000);
    }

    // 外部功能
    showFileUploader() {
        if (this.fileUploader) {
            // 顯示檔案上傳模態框
            this.showFileUploadModal();
        } else {
            // 備用方案：觸發檔案選擇
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx';

            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                this.handleFileSelected(files);
            });

            input.click();
        }
    }

    showFileUploadModal() {
        const modal = document.createElement('div');
        modal.className = 'file-upload-modal';
        modal.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>選擇檔案</h3>
                        <button class="btn-icon close-btn">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div id="file-upload-container"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 初始化檔案上傳器
        const container = modal.querySelector('#file-upload-container');
        const uploader = new FileUploadComponent(container, {
            uploadOnSelect: false,
            onEvent: (event, data) => {
                if (event === 'fileSelected') {
                    this.handleFileSelected(data.files);
                    this.closeModal(modal);
                }
            }
        });

        // 綁定關閉事件
        const closeBtn = modal.querySelector('.close-btn');
        const backdrop = modal.querySelector('.modal-backdrop');

        const closeModal = () => {
            uploader.destroy();
            document.body.removeChild(modal);
        };

        closeBtn.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal();
            }
        });
    }

    closeModal(modal) {
        document.body.removeChild(modal);
    }

    toggleEmojiPicker() {
        if (this.emojiPicker) {
            this.emojiPicker.toggle();
        }
    }

    hideEmojiPicker() {
        if (this.emojiPicker) {
            this.emojiPicker.hide();
        }
    }

    startVoiceRecording() {
        if (this.voiceRecorder) {
            this.showVoiceRecorder();
        } else {
            this.showError('語音錄音功能不可用');
        }
    }

    showVoiceRecorder() {
        const modal = document.createElement('div');
        modal.className = 'voice-recorder-modal';
        modal.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>語音訊息</h3>
                        <button class="btn-icon close-btn">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div id="voice-recorder-container"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 初始化語音錄音器
        const container = modal.querySelector('#voice-recorder-container');
        const recorder = new VoiceRecorderComponent({
            container: container,
            onEvent: (event, data) => {
                if (event === 'recordingSend') {
                    this.handleVoiceMessage(data);
                    this.hideVoiceRecorder(modal, recorder);
                } else if (event === 'recordingCancelled') {
                    this.hideVoiceRecorder(modal, recorder);
                }
            }
        });

        // 綁定關閉事件
        const closeBtn = modal.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
            this.hideVoiceRecorder(modal, recorder);
        });
    }

    hideVoiceRecorder(modal, recorder) {
        if (recorder) {
            recorder.destroy();
        }
        if (modal && modal.parentNode) {
            document.body.removeChild(modal);
        }
    }

    // 檔案和語音處理
    handleFileSelected(files) {
        this.emit('filesSelected', { files });
    }

    handleVoiceMessage(voiceData) {
        this.emit('voiceMessage', { voiceData });
    }

    // 設置方法
    setPlaceholder(placeholder) {
        this.options.placeholder = placeholder;
        if (this.input) {
            this.input.setAttribute('data-placeholder', placeholder);
        }
    }

    setMaxLength(maxLength) {
        this.options.maxLength = maxLength;
        this.updateCharacterCount();
    }

    setSendOnEnter(enabled) {
        this.options.sendOnEnter = enabled;
    }

    // 獲取方法
    isFocused() {
        return document.activeElement === this.input;
    }

    getState() {
        return {
            content: this.getContent(),
            isEmpty: this.isEmpty(),
            length: this.getContentLength(),
            isFocused: this.isFocused(),
            hasReply: !!this.replyTo,
            replyTo: this.replyTo
        };
    }

    // 工具方法
    showError(message) {
        this.emit('error', { message });
    }

    // 事件系統
    emit(event, data = {}) {
        if (this.options.onEvent) {
            this.options.onEvent(event, data);
        }

        const customEvent = new CustomEvent(`messageInput:${event}`, {
            detail: { ...data, input: this }
        });
        this.container.dispatchEvent(customEvent);
    }

    on(event, callback) {
        this.container.addEventListener(`messageInput:${event}`, callback);
    }

    off(event, callback) {
        this.container.removeEventListener(`messageInput:${event}`, callback);
    }

    // 銷毀方法
    destroy() {
        // 清理計時器
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // 銷毀子組件
        if (this.emojiPicker) {
            this.emojiPicker.destroy();
        }

        if (this.fileUploader) {
            this.fileUploader.destroy();
        }

        if (this.voiceRecorder) {
            this.voiceRecorder.destroy();
        }

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 重置狀態
        this.currentMention = null;
        this.replyTo = null;
    }
}

// 簡化版訊息輸入框
class SimpleMessageInput {
    constructor(inputElement, options = {}) {
        this.input = inputElement;
        this.options = {
            placeholder: '輸入訊息...',
            maxLength: 4000,
            sendOnEnter: true,
            onSend: null,
            onTyping: null,
            ...options
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.setupInput();
    }

    setupInput() {
        this.input.placeholder = this.options.placeholder;
        this.input.maxLength = this.options.maxLength;
    }

    bindEvents() {
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.options.sendOnEnter && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.input.addEventListener('input', () => {
            if (this.options.onTyping) {
                this.options.onTyping(this.input.value);
            }
        });
    }

    sendMessage() {
        const content = this.input.value.trim();
        if (!content) return;

        if (this.options.onSend) {
            this.options.onSend(content);
        }

        this.clear();
    }

    clear() {
        this.input.value = '';
    }

    focus() {
        this.input.focus();
    }

    getContent() {
        return this.input.value;
    }

    setContent(content) {
        this.input.value = content;
    }
}

// 自動完成輸入框
class AutoCompleteInput {
    constructor(inputElement, options = {}) {
        this.input = inputElement;
        this.options = {
            minLength: 2,
            maxSuggestions: 10,
            delay: 300,
            dataSource: null,
            onSelect: null,
            ...options
        };

        this.suggestions = [];
        this.currentIndex = -1;
        this.isVisible = false;

        this.init();
    }

    init() {
        this.createSuggestionsList();
        this.bindEvents();
    }

    createSuggestionsList() {
        this.suggestionsList = document.createElement('div');
        this.suggestionsList.className = 'autocomplete-suggestions';
        this.suggestionsList.style.display = 'none';

        this.input.parentNode.style.position = 'relative';
        this.input.parentNode.appendChild(this.suggestionsList);
    }

    bindEvents() {
        this.input.addEventListener('input', this.handleInput.bind(this));
        this.input.addEventListener('keydown', this.handleKeydown.bind(this));
        this.input.addEventListener('blur', this.handleBlur.bind(this));
        this.suggestionsList.addEventListener('click', this.handleClick.bind(this));
    }

    async handleInput() {
        const query = this.input.value.trim();

        if (query.length < this.options.minLength) {
            this.hideSuggestions();
            return;
        }

        // 延遲搜尋
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            try {
                const suggestions = await this.getSuggestions(query);
                this.showSuggestions(suggestions);
            } catch (error) {
                console.error('獲取建議失敗:', error);
            }
        }, this.options.delay);
    }

    async getSuggestions(query) {
        if (this.options.dataSource) {
            return await this.options.dataSource(query);
        }
        return [];
    }

    showSuggestions(suggestions) {
        this.suggestions = suggestions.slice(0, this.options.maxSuggestions);
        this.currentIndex = -1;

        if (this.suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        this.renderSuggestions();
        this.suggestionsList.style.display = 'block';
        this.isVisible = true;
    }

    renderSuggestions() {
        this.suggestionsList.innerHTML = this.suggestions
            .map((suggestion, index) => `
                <div class="suggestion-item ${index === this.currentIndex ? 'selected' : ''}"
                     data-index="${index}">
                    ${this.renderSuggestionItem(suggestion)}
                </div>
            `).join('');
    }

    renderSuggestionItem(suggestion) {
        if (typeof suggestion === 'string') {
            return suggestion;
        }
        return suggestion.text || suggestion.label || String(suggestion);
    }

    hideSuggestions() {
        this.suggestionsList.style.display = 'none';
        this.isVisible = false;
        this.currentIndex = -1;
    }

    handleKeydown(e) {
        if (!this.isVisible) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.moveSelection(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.moveSelection(-1);
                break;
            case 'Enter':
                e.preventDefault();
                this.selectCurrent();
                break;
            case 'Escape':
                this.hideSuggestions();
                break;
        }
    }

    moveSelection(direction) {
        this.currentIndex += direction;

        if (this.currentIndex < 0) {
            this.currentIndex = this.suggestions.length - 1;
        } else if (this.currentIndex >= this.suggestions.length) {
            this.currentIndex = 0;
        }

        this.renderSuggestions();
    }

    selectCurrent() {
        if (this.currentIndex >= 0 && this.currentIndex < this.suggestions.length) {
            this.selectSuggestion(this.suggestions[this.currentIndex]);
        }
    }

    handleBlur() {
        // 延遲隱藏，允許點擊
        setTimeout(() => {
            this.hideSuggestions();
        }, 200);
    }

    handleClick(e) {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;

        const index = parseInt(item.dataset.index);
        const suggestion = this.suggestions[index];
        this.selectSuggestion(suggestion);
    }

    selectSuggestion(suggestion) {
        const value = typeof suggestion === 'string' ? suggestion : suggestion.value || suggestion.text;
        this.input.value = value;

        if (this.options.onSelect) {
            this.options.onSelect(suggestion, value);
        }

        this.hideSuggestions();
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MessageInputComponent, SimpleMessageInput, AutoCompleteInput };
} else {
    window.MessageInputComponent = MessageInputComponent;
    window.SimpleMessageInput = SimpleMessageInput;
    window.AutoCompleteInput = AutoCompleteInput;
}