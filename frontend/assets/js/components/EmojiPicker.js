class EmojiPickerComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            position: 'bottom-right', // top-left, top-right, bottom-left, bottom-right
            showCategories: true,
            showSearch: true,
            recentEmojis: true,
            maxRecent: 30,
            autoClose: true,
            theme: 'light',
            ...options
        };

        this.isVisible = false;
        this.currentCategory = 'smileys';
        this.searchQuery = '';
        this.recentEmojis = this.loadRecentEmojis();

        // 表情符號資料
        this.emojiData = {
            smileys: {
                name: '笑臉與人物',
                icon: 'fas fa-smile',
                emojis: [
                    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
                    '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
                    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
                    '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
                    '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧',
                    '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐'
                ]
            },
            people: {
                name: '人物與身體',
                icon: 'fas fa-user',
                emojis: [
                    '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌', '🤞', '🤟',
                    '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝', '👍', '👎',
                    '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏',
                    '✍', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻',
                    '👃', '🧠', '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '🩸'
                ]
            },
            nature: {
                name: '動物與自然',
                icon: 'fas fa-leaf',
                emojis: [
                    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
                    '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🐣',
                    '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝',
                    '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🕸', '🦂',
                    '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀'
                ]
            },
            food: {
                name: '食物與飲料',
                icon: 'fas fa-utensils',
                emojis: [
                    '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑',
                    '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒',
                    '🌶', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥖', '🍞',
                    '🥨', '🥯', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩',
                    '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮'
                ]
            },
            activities: {
                name: '活動',
                icon: 'fas fa-futbol',
                emojis: [
                    '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
                    '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁',
                    '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸', '🥌',
                    '🎿', '⛷', '🏂', '🪂', '🏋', '🤼', '🤸', '⛹', '🤺', '🏊',
                    '🏄', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅'
                ]
            },
            travel: {
                name: '旅行與地點',
                icon: 'fas fa-plane',
                emojis: [
                    '🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐',
                    '🛻', '🚚', '🚛', '🚜', '🏍', '🛵', '🚲', '🛴', '🛹', '🛼',
                    '🚁', '✈', '🛩', '🛫', '🛬', '🪂', '💺', '🚀', '🛸', '🚉',
                    '🚊', '🚝', '🚞', '🚋', '🚃', '🚆', '🚄', '🚅', '🚈', '🚂',
                    '🚇', '🚟', '🚠', '🚡', '⛴', '🛥', '🚤', '⛵', '🛶', '🚢'
                ]
            },
            objects: {
                name: '物品',
                icon: 'fas fa-lightbulb',
                emojis: [
                    '⌚', '📱', '📲', '💻', '⌨', '🖥', '🖨', '🖱', '🖲', '🕹',
                    '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽',
                    '🎞', '📞', '☎', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛',
                    '🧭', '⏱', '⏲', '⏰', '🕰', '⌛', '⏳', '📡', '🔋', '🔌',
                    '💡', '🔦', '🕯', '🪔', '🧯', '🛢', '💸', '💵', '💴', '💶'
                ]
            },
            symbols: {
                name: '符號',
                icon: 'fas fa-heart',
                emojis: [
                    '❤', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
                    '❣', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮',
                    '✝', '☪', '🕉', '☸', '✡', '🔯', '🕎', '☯', '☦', '🛐',
                    '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐',
                    '♑', '♒', '♓', '🆔', '⚛', '🉑', '☢', '☣', '📴', '📳'
                ]
            },
            flags: {
                name: '旗幟',
                icon: 'fas fa-flag',
                emojis: [
                    '🏁', '🚩', '🎌', '🏴', '🏳', '🏳‍🌈', '🏳‍⚧', '🏴‍☠', '🇦🇨', '🇦🇩',
                    '🇦🇪', '🇦🇫', '🇦🇬', '🇦🇮', '🇦🇱', '🇦🇲', '🇦🇴', '🇦🇶', '🇦🇷', '🇦🇸',
                    '🇦🇹', '🇦🇺', '🇦🇼', '🇦🇽', '🇦🇿', '🇧🇦', '🇧🇧', '🇧🇩', '🇧🇪', '🇧🇫',
                    '🇧🇬', '🇧🇭', '🇧🇮', '🇧🇯', '🇧🇱', '🇧🇲', '🇧🇳', '🇧🇴', '🇧🇶', '🇧🇷',
                    '🇧🇸', '🇧🇹', '🇧🇻', '🇧🇼', '🇧🇾', '🇧🇿', '🇨🇦', '🇨🇨', '🇨🇩', '🇨🇫'
                ]
            }
        };

        this.init();
    }

    init() {
        this.createPicker();
        this.bindEvents();
        this.loadCategory(this.currentCategory);
    }

    createPicker() {
        if (!this.container) return;

        const pickerHTML = `
            <div class="emoji-picker ${this.options.theme}" style="display: none;">
                <div class="emoji-picker-header">
                    ${this.options.showSearch ? this.createSearchHTML() : ''}
                    ${this.options.showCategories ? this.createCategoriesHTML() : ''}
                </div>
                <div class="emoji-picker-content">
                    <div class="emoji-grid" id="emoji-grid">
                        <!-- 表情符號會在這裡動態載入 -->
                    </div>
                </div>
                <div class="emoji-picker-footer">
                    <div class="emoji-info">
                        <span id="emoji-name">選擇表情符號</span>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = pickerHTML;
        this.picker = this.container.querySelector('.emoji-picker');
        this.emojiGrid = this.container.querySelector('#emoji-grid');
        this.emojiName = this.container.querySelector('#emoji-name');
    }

    createSearchHTML() {
        return `
            <div class="emoji-search">
                <input type="text" 
                       id="emoji-search-input" 
                       placeholder="搜尋表情符號..." 
                       autocomplete="off">
                <i class="fas fa-search"></i>
            </div>
        `;
    }

    createCategoriesHTML() {
        const categories = Object.keys(this.emojiData);
        const categoryButtons = categories.map(category => {
            const categoryData = this.emojiData[category];
            const isActive = category === this.currentCategory ? 'active' : '';

            return `
                <button class="emoji-category-btn ${isActive}" 
                        data-category="${category}"
                        title="${categoryData.name}">
                    <i class="${categoryData.icon}"></i>
                </button>
            `;
        }).join('');

        return `
            <div class="emoji-categories">
                ${this.options.recentEmojis && this.recentEmojis.length > 0 ?
            `<button class="emoji-category-btn" data-category="recent" title="最近使用">
                        <i class="fas fa-clock"></i>
                    </button>` : ''
        }
                ${categoryButtons}
            </div>
        `;
    }

    bindEvents() {
        if (!this.picker) return;

        // 搜尋事件
        if (this.options.showSearch) {
            const searchInput = this.picker.querySelector('#emoji-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', this.handleSearch.bind(this));
                searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));
            }
        }

        // 分類按鈕事件
        if (this.options.showCategories) {
            this.picker.querySelectorAll('.emoji-category-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const category = e.target.closest('.emoji-category-btn').dataset.category;
                    this.switchCategory(category);
                });
            });
        }

        // 表情符號點擊事件
        this.emojiGrid.addEventListener('click', this.handleEmojiClick.bind(this));

        // 表情符號懸停事件
        this.emojiGrid.addEventListener('mouseover', this.handleEmojiHover.bind(this));

        // 鍵盤導航
        this.picker.addEventListener('keydown', this.handleKeydown.bind(this));

        // 外部點擊關閉
        if (this.options.autoClose) {
            document.addEventListener('click', this.handleOutsideClick.bind(this));
        }
    }

    show() {
        if (this.isVisible) return;

        this.isVisible = true;
        this.picker.style.display = 'block';
        this.picker.classList.add('animate-scale-in');

        // 設置位置
        this.setPosition();

        // 焦點管理
        if (this.options.showSearch) {
            const searchInput = this.picker.querySelector('#emoji-search-input');
            if (searchInput) {
                searchInput.focus();
            }
        }

        this.emit('show');
    }

    hide() {
        if (!this.isVisible) return;

        this.isVisible = false;
        this.picker.classList.add('animate-scale-out');

        setTimeout(() => {
            this.picker.style.display = 'none';
            this.picker.classList.remove('animate-scale-out', 'animate-scale-in');
        }, 150);

        this.emit('hide');
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    setPosition() {
        if (!this.picker || !this.options.anchor) return;

        const pickerRect = this.picker.getBoundingClientRect();
        const anchorRect = this.options.anchor.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };

        let top, left;

        // 根據位置選項計算座標
        switch (this.options.position) {
            case 'top-left':
                top = anchorRect.top - pickerRect.height - 10;
                left = anchorRect.left;
                break;
            case 'top-right':
                top = anchorRect.top - pickerRect.height - 10;
                left = anchorRect.right - pickerRect.width;
                break;
            case 'bottom-left':
                top = anchorRect.bottom + 10;
                left = anchorRect.left;
                break;
            case 'bottom-right':
            default:
                top = anchorRect.bottom + 10;
                left = anchorRect.right - pickerRect.width;
                break;
        }

        // 確保不超出視窗邊界
        if (left < 10) left = 10;
        if (left + pickerRect.width > viewport.width - 10) {
            left = viewport.width - pickerRect.width - 10;
        }
        if (top < 10) top = anchorRect.bottom + 10;
        if (top + pickerRect.height > viewport.height - 10) {
            top = anchorRect.top - pickerRect.height - 10;
        }

        this.picker.style.position = 'fixed';
        this.picker.style.top = top + 'px';
        this.picker.style.left = left + 'px';
        this.picker.style.zIndex = '9999';
    }

    switchCategory(category) {
        if (this.currentCategory === category) return;

        // 更新按鈕狀態
        this.picker.querySelectorAll('.emoji-category-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = this.picker.querySelector(`[data-category="${category}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        this.currentCategory = category;
        this.loadCategory(category);
    }

    loadCategory(category) {
        if (!this.emojiGrid) return;

        let emojis = [];

        if (category === 'recent') {
            emojis = this.recentEmojis;
        } else if (this.emojiData[category]) {
            emojis = this.emojiData[category].emojis;
        }

        this.renderEmojis(emojis);
    }

    renderEmojis(emojis) {
        if (!this.emojiGrid) return;

        const emojiHTML = emojis.map(emoji => {
            return `
                <button class="emoji-item" 
                        data-emoji="${emoji}"
                        title="${this.getEmojiName(emoji)}"
                        tabindex="0">
                    ${emoji}
                </button>
            `;
        }).join('');

        this.emojiGrid.innerHTML = emojiHTML;

        // 如果沒有表情符號，顯示空狀態
        if (emojis.length === 0) {
            this.emojiGrid.innerHTML = `
                <div class="emoji-empty-state">
                    <i class="fas fa-search"></i>
                    <p>沒有找到表情符號</p>
                </div>
            `;
        }
    }

    handleSearch(e) {
        const query = e.target.value.toLowerCase().trim();
        this.searchQuery = query;

        if (query === '') {
            this.loadCategory(this.currentCategory);
            return;
        }

        // 搜尋表情符號
        const results = this.searchEmojis(query);
        this.renderEmojis(results);
    }

    handleSearchKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            // 選擇第一個搜尋結果
            const firstEmoji = this.emojiGrid.querySelector('.emoji-item');
            if (firstEmoji) {
                this.selectEmoji(firstEmoji.dataset.emoji);
            }
        } else if (e.key === 'Escape') {
            e.target.value = '';
            this.handleSearch(e);
        }
    }

    searchEmojis(query) {
        const results = [];

        // 搜尋所有分類的表情符號
        Object.values(this.emojiData).forEach(category => {
            category.emojis.forEach(emoji => {
                const emojiName = this.getEmojiName(emoji).toLowerCase();
                if (emojiName.includes(query) || this.getEmojiKeywords(emoji).some(keyword =>
                    keyword.toLowerCase().includes(query))) {
                    results.push(emoji);
                }
            });
        });

        // 去重並限制結果數量
        return [...new Set(results)].slice(0, 50);
    }

    handleEmojiClick(e) {
        if (!e.target.classList.contains('emoji-item')) return;

        e.preventDefault();
        const emoji = e.target.dataset.emoji;
        this.selectEmoji(emoji);
    }

    handleEmojiHover(e) {
        if (!e.target.classList.contains('emoji-item')) return;

        const emoji = e.target.dataset.emoji;
        const emojiName = this.getEmojiName(emoji);

        if (this.emojiName) {
            this.emojiName.textContent = emojiName;
        }
    }

    handleKeydown(e) {
        if (e.key === 'Escape') {
            this.hide();
        } else if (e.key === 'Tab') {
            // 處理 Tab 導航
            this.handleTabNavigation(e);
        }
    }

    handleTabNavigation(e) {
        const focusableElements = this.picker.querySelectorAll(
            'input, button, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    }

    handleOutsideClick(e) {
        if (!this.isVisible) return;

        if (!this.picker.contains(e.target) &&
            (!this.options.anchor || !this.options.anchor.contains(e.target))) {
            this.hide();
        }
    }

    selectEmoji(emoji) {
        // 添加到最近使用
        this.addToRecent(emoji);

        // 發射選擇事件
        this.emit('select', { emoji });

        // 自動關閉
        if (this.options.autoClose) {
            this.hide();
        }
    }

    addToRecent(emoji) {
        if (!this.options.recentEmojis) return;

        // 移除已存在的
        const index = this.recentEmojis.indexOf(emoji);
        if (index > -1) {
            this.recentEmojis.splice(index, 1);
        }

        // 添加到開頭
        this.recentEmojis.unshift(emoji);

        // 限制數量
        if (this.recentEmojis.length > this.options.maxRecent) {
            this.recentEmojis = this.recentEmojis.slice(0, this.options.maxRecent);
        }

        // 儲存到本地存儲
        this.saveRecentEmojis();

        // 更新最近使用分類按鈕的顯示
        this.updateRecentButton();
    }

    updateRecentButton() {
        const recentBtn = this.picker.querySelector('[data-category="recent"]');
        if (!recentBtn) return;

        if (this.recentEmojis.length === 0) {
            recentBtn.style.display = 'none';
        } else {
            recentBtn.style.display = 'block';
        }
    }

    loadRecentEmojis() {
        try {
            const stored = localStorage.getItem('emoji_picker_recent');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.warn('載入最近使用的表情符號失敗:', error);
            return [];
        }
    }

    saveRecentEmojis() {
        try {
            localStorage.setItem('emoji_picker_recent', JSON.stringify(this.recentEmojis));
        } catch (error) {
            console.warn('儲存最近使用的表情符號失敗:', error);
        }
    }

    getEmojiName(emoji) {
        // 這裡應該有一個完整的表情符號名稱對照表
        // 為了簡化，這裡只提供一些基本的映射
        const emojiNames = {
            '😀': '露齒笑',
            '😃': '開心笑',
            '😄': '開懷大笑',
            '😁': '咧嘴笑',
            '😆': '瞇眼笑',
            '😅': '尷尬笑',
            '🤣': '滾地笑',
            '😂': '哭笑',
            '🙂': '微笑',
            '🙃': '顛倒笑',
            '😉': '眨眼',
            '😊': '害羞笑',
            '😇': '天使笑',
            '🥰': '愛心眼',
            '😍': '花癡',
            '🤩': '星星眼',
            '😘': '飛吻',
            '😗': '嘟嘴',
            '😚': '閉眼吻',
            '😙': '微笑吻',
            '😋': '好吃',
            '😛': '吐舌',
            '😜': '調皮吐舌',
            '🤪': '瘋狂臉',
            '😝': '吐舌閉眼',
            '🤑': '金錢眼',
            '🤗': '擁抱',
            '🤭': '偷笑',
            '🤫': '噓',
            '🤔': '思考',
            '❤': '紅心',
            '💛': '黃心',
            '💚': '綠心',
            '💙': '藍心',
            '💜': '紫心',
            '🖤': '黑心',
            '🤍': '白心',
            '🤎': '棕心',
            '👍': '讚',
            '👎': '不讚',
            '👋': '揮手',
            '🤚': '舉手',
            '✋': '停止手勢',
            '👌': 'OK手勢',
            '✌': '勝利手勢',
            '🤞': '交叉手指',
            '🤟': '愛你手勢',
            '🤘': '搖滾手勢',
            '🤙': '打電話手勢',
            '👏': '拍手',
            '🙌': '舉雙手',
            '🙏': '祈禱',
            '💪': '肌肉'
        };

        return emojiNames[emoji] || emoji;
    }

    getEmojiKeywords(emoji) {
        // 這裡應該有一個完整的表情符號關鍵字對照表
        // 為了簡化，這裡只提供一些基本的關鍵字
        const emojiKeywords = {
            '😀': ['笑', '開心', '快樂'],
            '😃': ['笑', '開心', '高興'],
            '😄': ['笑', '大笑', '開心'],
            '😁': ['笑', '咧嘴', '開心'],
            '😆': ['笑', '瞇眼', '好笑'],
            '😅': ['笑', '尷尬', '冷汗'],
            '🤣': ['笑', '大笑', '滾地'],
            '😂': ['笑', '哭笑', '眼淚'],
            '❤': ['愛', '心', '紅色', '愛心'],
            '💛': ['愛', '心', '黃色', '愛心'],
            '💚': ['愛', '心', '綠色', '愛心'],
            '💙': ['愛', '心', '藍色', '愛心'],
            '💜': ['愛', '心', '紫色', '愛心'],
            '👍': ['讚', '好', '同意', '手勢'],
            '👎': ['不讚', '不好', '反對', '手勢'],
            '👋': ['揮手', '再見', '你好', '招手'],
            '👏': ['拍手', '鼓掌', '讚賞']
        };

        return emojiKeywords[emoji] || [];
    }

    // 設置方法
    setAnchor(element) {
        this.options.anchor = element;
    }

    setPosition(position) {
        this.options.position = position;
    }

    setTheme(theme) {
        this.options.theme = theme;
        if (this.picker) {
            this.picker.className = `emoji-picker ${theme}`;
        }
    }

    // 獲取方法
    getRecentEmojis() {
        return [...this.recentEmojis];
    }

    getCurrentCategory() {
        return this.currentCategory;
    }

    isOpen() {
        return this.isVisible;
    }

    // 清理方法
    clearRecentEmojis() {
        this.recentEmojis = [];
        this.saveRecentEmojis();
        this.updateRecentButton();

        if (this.currentCategory === 'recent') {
            this.switchCategory('smileys');
        }
    }

    // 事件發射器
    emit(event, data = {}) {
        if (this.options.onEvent) {
            this.options.onEvent(event, data);
        }

        // 自定義事件
        const customEvent = new CustomEvent(`emoji:${event}`, {
            detail: { ...data, picker: this }
        });
        this.container.dispatchEvent(customEvent);
    }

    // 銷毀方法
    destroy() {
        // 移除事件監聽器
        if (this.options.autoClose) {
            document.removeEventListener('click', this.handleOutsideClick.bind(this));
        }

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 重置狀態
        this.isVisible = false;
        this.picker = null;
        this.emojiGrid = null;
        this.emojiName = null;
    }

    // 靜態方法：創建簡單的表情符號選擇器
    static create(options = {}) {
        const container = document.createElement('div');
        container.className = 'emoji-picker-container';
        document.body.appendChild(container);

        return new EmojiPickerComponent(container, {
            ...options,
            autoClose: true
        });
    }

    // 靜態方法：在指定元素旁邊顯示選擇器
    static showNear(anchorElement, options = {}) {
        const picker = EmojiPickerComponent.create({
            ...options,
            anchor: anchorElement
        });

        picker.show();

        // 選擇後自動銷毀
        picker.container.addEventListener('emoji:select', () => {
            setTimeout(() => {
                picker.destroy();
                if (picker.container.parentNode) {
                    picker.container.parentNode.removeChild(picker.container);
                }
            }, 100);
        });

        // 隱藏後自動銷毀
        picker.container.addEventListener('emoji:hide', () => {
            setTimeout(() => {
                picker.destroy();
                if (picker.container.parentNode) {
                    picker.container.parentNode.removeChild(picker.container);
                }
            }, 200);
        });

        return picker;
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmojiPickerComponent;
} else {
    window.EmojiPickerComponent = EmojiPickerComponent;
}