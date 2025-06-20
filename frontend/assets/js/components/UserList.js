class UserListComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            showSearch: true,
            showOnlineOnly: false,
            groupByStatus: true,
            showUserCount: true,
            enableContextMenu: true,
            sortBy: 'name', // name, status, lastSeen
            sortOrder: 'asc',
            enablePresence: true,
            maxUsers: 500,
            ...options
        };

        this.users = [];
        this.filteredUsers = [];
        this.searchQuery = '';
        this.selectedUser = null;
        this.onlineFilter = false;

        this.init();
    }

    init() {
        this.createUserListInterface();
        this.bindEvents();
        this.loadUsers();
    }

    createUserListInterface() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="user-list-container">
                <!-- 標題和搜尋 -->
                <div class="user-list-header">
                    <div class="header-title">
                        <h3>成員</h3>
                        ${this.options.showUserCount ? `
                            <span class="user-count" id="user-count">0</span>
                        ` : ''}
                    </div>
                    
                    ${this.options.showSearch ? `
                        <div class="search-container">
                            <div class="search-input-wrapper">
                                <input type="text" 
                                       id="user-search" 
                                       class="search-input" 
                                       placeholder="搜尋成員..."
                                       autocomplete="off">
                                <i class="fas fa-search search-icon"></i>
                                <button class="clear-search hidden" id="clear-search">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- 過濾器 -->
                <div class="user-filters">
                    <div class="filter-toggles">
                        <label class="toggle-switch">
                            <input type="checkbox" id="online-only-toggle">
                            <span class="toggle-slider"></span>
                            <span class="toggle-label">僅顯示線上</span>
                        </label>
                        
                        <label class="toggle-switch">
                            <input type="checkbox" id="group-by-status-toggle" 
                                   ${this.options.groupByStatus ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                            <span class="toggle-label">依狀態分組</span>
                        </label>
                    </div>

                    <div class="sort-options">
                        <select id="sort-select" class="sort-select">
                            <option value="name">依名稱排序</option>
                            <option value="status">依狀態排序</option>
                            <option value="lastSeen">依最後上線時間</option>
                        </select>
                    </div>
                </div>

                <!-- 使用者列表 -->
                <div class="user-list-content">
                    <div class="user-items" id="user-items">
                        <!-- 使用者項目會在這裡動態載入 -->
                    </div>
                    
                    <!-- 載入指示器 -->
                    <div class="loading-indicator hidden" id="loading-indicator">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>載入中...</span>
                    </div>
                    
                    <!-- 空狀態 -->
                    <div class="empty-state hidden" id="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <h4>沒有找到成員</h4>
                        <p class="empty-message">試試不同的搜尋關鍵字</p>
                    </div>
                </div>
            </div>
        `;

        this.getElements();
    }

    getElements() {
        this.userItems = this.container.querySelector('#user-items');
        this.userCount = this.container.querySelector('#user-count');
        this.searchInput = this.container.querySelector('#user-search');
        this.clearSearchBtn = this.container.querySelector('#clear-search');
        this.onlineOnlyToggle = this.container.querySelector('#online-only-toggle');
        this.groupByStatusToggle = this.container.querySelector('#group-by-status-toggle');
        this.sortSelect = this.container.querySelector('#sort-select');
        this.loadingIndicator = this.container.querySelector('#loading-indicator');
        this.emptyState = this.container.querySelector('#empty-state');
    }

    bindEvents() {
        // 搜尋事件
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearch.bind(this));
            this.searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));
        }

        this.clearSearchBtn?.addEventListener('click', this.clearSearch.bind(this));

        // 過濾器事件
        this.onlineOnlyToggle?.addEventListener('change', this.handleOnlineFilter.bind(this));
        this.groupByStatusToggle?.addEventListener('change', this.handleGroupByStatus.bind(this));
        this.sortSelect?.addEventListener('change', this.handleSortChange.bind(this));

        // 使用者項目事件
        this.userItems?.addEventListener('click', this.handleUserClick.bind(this));

        if (this.options.enableContextMenu) {
            this.userItems?.addEventListener('contextmenu', this.handleUserContextMenu.bind(this));
        }
    }

    // 資料載入
    async loadUsers() {
        this.setLoading(true);

        try {
            const users = await this.fetchUsers();
            this.users = users;
            this.applyFiltersAndSort();
            this.renderUsers();
        } catch (error) {
            console.error('載入使用者失敗:', error);
            this.showError('載入成員列表失敗');
        } finally {
            this.setLoading(false);
        }
    }

    async fetchUsers() {
        // 模擬 API 調用
        return new Promise(resolve => {
            setTimeout(() => {
                resolve([
                    {
                        id: '1',
                        username: 'alice',
                        displayName: 'Alice Chen',
                        email: 'alice@example.com',
                        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
                        status: 'online',
                        lastSeen: new Date(),
                        role: 'admin',
                        isBot: false,
                        customStatus: '正在工作中',
                        timezone: 'Asia/Taipei'
                    },
                    {
                        id: '2',
                        username: 'bob',
                        displayName: 'Bob Wang',
                        email: 'bob@example.com',
                        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
                        status: 'away',
                        lastSeen: new Date(Date.now() - 300000),
                        role: 'moderator',
                        isBot: false,
                        customStatus: '午餐時間',
                        timezone: 'Asia/Taipei'
                    },
                    {
                        id: '3',
                        username: 'charlie',
                        displayName: 'Charlie Liu',
                        email: 'charlie@example.com',
                        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
                        status: 'busy',
                        lastSeen: new Date(Date.now() - 60000),
                        role: 'member',
                        isBot: false,
                        customStatus: '開會中',
                        timezone: 'Asia/Taipei'
                    },
                    {
                        id: '4',
                        username: 'diana',
                        displayName: 'Diana Lee',
                        email: 'diana@example.com',
                        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana',
                        status: 'offline',
                        lastSeen: new Date(Date.now() - 3600000),
                        role: 'member',
                        isBot: false,
                        customStatus: null,
                        timezone: 'Asia/Taipei'
                    },
                    {
                        id: '5',
                        username: 'chatbot',
                        displayName: 'ChatBot',
                        email: null,
                        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=chatbot',
                        status: 'online',
                        lastSeen: new Date(),
                        role: 'bot',
                        isBot: true,
                        customStatus: '24/7 線上服務',
                        timezone: null
                    }
                ]);
            }, 1000);
        });
    }

    // 搜尋和過濾
    handleSearch() {
        const query = this.searchInput.value.trim();
        this.searchQuery = query;

        if (query) {
            this.clearSearchBtn?.classList.remove('hidden');
        } else {
            this.clearSearchBtn?.classList.add('hidden');
        }

        this.applyFiltersAndSort();
        this.renderUsers();
    }

    handleSearchKeydown(e) {
        if (e.key === 'Escape') {
            this.clearSearch();
        }
    }

    clearSearch() {
        this.searchInput.value = '';
        this.searchQuery = '';
        this.clearSearchBtn?.classList.add('hidden');
        this.applyFiltersAndSort();
        this.renderUsers();
    }

    handleOnlineFilter() {
        this.onlineFilter = this.onlineOnlyToggle.checked;
        this.applyFiltersAndSort();
        this.renderUsers();
    }

    handleGroupByStatus() {
        this.options.groupByStatus = this.groupByStatusToggle.checked;
        this.renderUsers();
    }

    handleSortChange() {
        this.options.sortBy = this.sortSelect.value;
        this.applyFiltersAndSort();
        this.renderUsers();
    }

    applyFiltersAndSort() {
        let filtered = [...this.users];

        // 搜尋過濾
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(user =>
                user.username.toLowerCase().includes(query) ||
                user.displayName.toLowerCase().includes(query) ||
                user.email?.toLowerCase().includes(query)
            );
        }

        // 線上狀態過濾
        if (this.onlineFilter) {
            filtered = filtered.filter(user => user.status === 'online');
        }

        // 排序
        filtered.sort((a, b) => {
            let valueA, valueB;

            switch (this.options.sortBy) {
                case 'status':
                    const statusOrder = { online: 0, away: 1, busy: 2, offline: 3 };
                    valueA = statusOrder[a.status] || 999;
                    valueB = statusOrder[b.status] || 999;
                    break;
                case 'lastSeen':
                    valueA = a.lastSeen;
                    valueB = b.lastSeen;
                    break;
                case 'name':
                default:
                    valueA = a.displayName.toLowerCase();
                    valueB = b.displayName.toLowerCase();
                    break;
            }

            if (this.options.sortOrder === 'desc') {
                return valueB > valueA ? 1 : valueB < valueA ? -1 : 0;
            } else {
                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
            }
        });

        this.filteredUsers = filtered;
        this.updateUserCount();
    }

    // 渲染方法
    renderUsers() {
        if (!this.userItems) return;

        if (this.filteredUsers.length === 0) {
            this.showEmptyState();
            return;
        }

        this.hideEmptyState();

        if (this.options.groupByStatus) {
            this.renderGroupedUsers();
        } else {
            this.renderFlatUsers();
        }

        // 更新選中狀態
        this.updateSelectedUser();
    }

    renderGroupedUsers() {
        const grouped = this.groupUsersByStatus();

        const groupsHTML = Object.entries(grouped)
            .filter(([status, users]) => users.length > 0)
            .map(([status, users]) => this.createUserGroupHTML(status, users))
            .join('');

        this.userItems.innerHTML = groupsHTML;
    }

    renderFlatUsers() {
        const usersHTML = this.filteredUsers
            .map(user => this.createUserItemHTML(user))
            .join('');

        this.userItems.innerHTML = usersHTML;
    }

    groupUsersByStatus() {
        const groups = {
            online: [],
            away: [],
            busy: [],
            offline: []
        };

        this.filteredUsers.forEach(user => {
            if (groups[user.status]) {
                groups[user.status].push(user);
            }
        });

        return groups;
    }

    createUserGroupHTML(status, users) {
        const statusLabels = {
            online: '線上',
            away: '離開',
            busy: '忙碌',
            offline: '離線'
        };

        const statusIcon = this.getStatusIcon(status);
        const usersHTML = users.map(user => this.createUserItemHTML(user)).join('');

        return `
            <div class="user-group" data-status="${status}">
                <div class="user-group-header">
                    <div class="group-status">
                        ${statusIcon}
                        <span class="group-label">${statusLabels[status]}</span>
                        <span class="group-count">${users.length}</span>
                    </div>
                    <button class="group-toggle" data-action="toggle-group">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <div class="user-group-content">
                    ${usersHTML}
                </div>
            </div>
        `;
    }

    createUserItemHTML(user) {
        const statusIcon = this.getStatusIcon(user.status);
        const roleIcon = this.getRoleIcon(user.role);
        const lastSeenText = this.getLastSeenText(user);

        return `
            <div class="user-item ${user.status}" data-user-id="${user.id}">
                <div class="user-avatar-container">
                    <img src="${user.avatar}" alt="${user.displayName}" class="user-avatar">
                    <div class="status-indicator ${user.status}">
                        ${statusIcon}
                    </div>
                    ${user.isBot ? '<div class="bot-badge"><i class="fas fa-robot"></i></div>' : ''}
                </div>

                <div class="user-info">
                    <div class="user-header">
                        <div class="user-name">
                            <span class="display-name">${user.displayName}</span>
                            ${roleIcon ? `<span class="role-badge">${roleIcon}</span>` : ''}
                        </div>
                        <div class="user-meta">
                            <span class="username">@${user.username}</span>
                            ${!user.isBot ? `<span class="last-seen">${lastSeenText}</span>` : ''}
                        </div>
                    </div>

                    ${user.customStatus ? `
                        <div class="custom-status">
                            <i class="fas fa-comment-dots"></i>
                            <span class="status-text">${user.customStatus}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="user-actions">
                    <button class="btn-icon message-btn" data-action="message" title="發送訊息">
                        <i class="fas fa-comment"></i>
                    </button>
                    
                    ${!user.isBot ? `
                        <button class="btn-icon call-btn" data-action="call" title="語音通話">
                            <i class="fas fa-phone"></i>
                        </button>
                        <button class="btn-icon video-btn" data-action="video" title="視訊通話">
                            <i class="fas fa-video"></i>
                        </button>
                    ` : ''}
                    
                    <button class="btn-icon more-btn" data-action="more" title="更多選項">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </div>
        `;
    }

    getStatusIcon(status) {
        const icons = {
            online: '<i class="fas fa-circle"></i>',
            away: '<i class="fas fa-moon"></i>',
            busy: '<i class="fas fa-minus-circle"></i>',
            offline: '<i class="fas fa-circle"></i>'
        };
        return icons[status] || icons.offline;
    }

    getRoleIcon(role) {
        const icons = {
            admin: '<i class="fas fa-crown" title="管理員"></i>',
            moderator: '<i class="fas fa-shield-alt" title="版主"></i>',
            bot: '<i class="fas fa-robot" title="機器人"></i>'
        };
        return icons[role] || null;
    }

    getLastSeenText(user) {
        if (user.status === 'online') {
            return '線上';
        }

        const now = new Date();
        const lastSeen = new Date(user.lastSeen);
        const diff = now - lastSeen;

        if (diff < 60000) { // 小於 1 分鐘
            return '剛剛活動';
        } else if (diff < 3600000) { // 小於 1 小時
            return `${Math.floor(diff / 60000)} 分鐘前活動`;
        } else if (diff < 86400000) { // 小於 1 天
            return `${Math.floor(diff / 3600000)} 小時前活動`;
        } else {
            const days = Math.floor(diff / 86400000);
            return `${days} 天前活動`;
        }
    }

    // 事件處理
    handleUserClick(e) {
        const userItem = e.target.closest('.user-item');
        const groupToggle = e.target.closest('.group-toggle');

        if (groupToggle) {
            e.stopPropagation();
            this.toggleGroup(groupToggle);
            return;
        }

        if (!userItem) return;

        const userId = userItem.dataset.userId;
        const action = e.target.closest('[data-action]')?.dataset.action;

        if (action && action !== 'toggle-group') {
            e.stopPropagation();
            this.handleUserAction(userId, action, e.target);
            return;
        }

        // 選擇使用者
        this.selectUser(userId);
    }

    handleUserContextMenu(e) {
        e.preventDefault();

        const userItem = e.target.closest('.user-item');
        if (!userItem) return;

        const userId = userItem.dataset.userId;
        this.showUserContextMenu(userId, e.clientX, e.clientY);
    }

    handleUserAction(userId, action, target) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;

        switch (action) {
            case 'message':
                this.startDirectMessage(user);
                break;
            case 'call':
                this.startVoiceCall(user);
                break;
            case 'video':
                this.startVideoCall(user);
                break;
            case 'more':
                this.showUserMenu(user, target);
                break;
        }
    }

    selectUser(userId) {
        this.selectedUser = userId;
        this.updateSelectedUser();

        const user = this.users.find(u => u.id === userId);
        this.emit('userSelected', { user });
    }

    updateSelectedUser() {
        this.userItems?.querySelectorAll('.user-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.userId === this.selectedUser);
        });
    }

    toggleGroup(toggleButton) {
        const group = toggleButton.closest('.user-group');
        const content = group.querySelector('.user-group-content');
        const icon = toggleButton.querySelector('i');

        const isCollapsed = content.classList.contains('collapsed');

        if (isCollapsed) {
            content.classList.remove('collapsed');
            icon.className = 'fas fa-chevron-down';
        } else {
            content.classList.add('collapsed');
            icon.className = 'fas fa-chevron-right';
        }
    }

    // 使用者操作
    startDirectMessage(user) {
        this.emit('startDirectMessage', { user });
    }

    startVoiceCall(user) {
        this.emit('startVoiceCall', { user });
    }

    startVideoCall(user) {
        this.emit('startVideoCall', { user });
    }

    showUserMenu(user, target) {
        const menuItems = this.createUserMenu(user);
        this.showContextMenu(menuItems, target);
    }

    showUserContextMenu(userId, x, y) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;

        const menuItems = this.createUserContextMenu(user);
        this.showContextMenuAt(menuItems, x, y);
    }

    createUserMenu(user) {
        const menuItems = [
            { label: '發送私訊', icon: 'fas fa-comment', action: 'message' },
            { label: '查看個人資料', icon: 'fas fa-user', action: 'profile' }
        ];

        if (!user.isBot) {
            menuItems.push(
                { label: '語音通話', icon: 'fas fa-phone', action: 'call' },
                { label: '視訊通話', icon: 'fas fa-video', action: 'video' }
            );
        }

        menuItems.push(
            { type: 'divider' },
            { label: '添加為好友', icon: 'fas fa-user-plus', action: 'addFriend' },
            { label: '封鎖使用者', icon: 'fas fa-ban', action: 'block', className: 'danger' }
        );

        return menuItems;
    }

    createUserContextMenu(user) {
        return this.createUserMenu(user);
    }

    showContextMenu(menuItems, target) {
        this.emit('contextMenu', { menuItems, target });
    }

    showContextMenuAt(menuItems, x, y) {
        this.emit('contextMenuAt', { menuItems, x, y });
    }

    // 狀態更新
    updateUserStatus(userId, status, lastSeen = new Date()) {
        const user = this.users.find(u => u.id === userId);
        if (user) {
            user.status = status;
            user.lastSeen = lastSeen;

            // 重新應用過濾和排序
            this.applyFiltersAndSort();
            this.renderUsers();

            this.emit('userStatusChanged', { user, status });
        }
    }

    updateUserCustomStatus(userId, customStatus) {
        const user = this.users.find(u => u.id === userId);
        if (user) {
            user.customStatus = customStatus;
            this.renderUsers();
            this.emit('userCustomStatusChanged', { user, customStatus });
        }
    }

    addUser(user) {
        this.users.push(user);
        this.applyFiltersAndSort();
        this.renderUsers();
        this.emit('userAdded', { user });
    }

    removeUser(userId) {
        const index = this.users.findIndex(u => u.id === userId);
        if (index > -1) {
            const user = this.users[index];
            this.users.splice(index, 1);
            this.applyFiltersAndSort();
            this.renderUsers();
            this.emit('userRemoved', { user });
        }
    }

    updateUser(userId, updates) {
        const user = this.users.find(u => u.id === userId);
        if (user) {
            Object.assign(user, updates);
            this.applyFiltersAndSort();
            this.renderUsers();
            this.emit('userUpdated', { user });
        }
    }

    // UI 狀態管理
    setLoading(loading) {
        this.isLoading = loading;

        if (loading) {
            this.loadingIndicator?.classList.remove('hidden');
            this.userItems?.classList.add('loading');
        } else {
            this.loadingIndicator?.classList.add('hidden');
            this.userItems?.classList.remove('loading');
        }
    }

    showEmptyState() {
        this.emptyState?.classList.remove('hidden');
        this.userItems?.classList.add('hidden');
    }

    hideEmptyState() {
        this.emptyState?.classList.add('hidden');
        this.userItems?.classList.remove('hidden');
    }

    updateUserCount() {
        if (this.userCount) {
            const onlineCount = this.filteredUsers.filter(u => u.status === 'online').length;
            const totalCount = this.filteredUsers.length;

            if (this.onlineFilter) {
                this.userCount.textContent = onlineCount;
            } else {
                this.userCount.textContent = `${onlineCount}/${totalCount}`;
            }
        }
    }

    showError(message) {
        this.emit('error', { message });
    }

    // 公共 API
    getUsers() {
        return [...this.users];
    }

    getSelectedUser() {
        return this.users.find(u => u.id === this.selectedUser);
    }

    getOnlineUsers() {
        return this.users.filter(u => u.status === 'online');
    }

    getUserById(userId) {
        return this.users.find(u => u.id === userId);
    }

    setSelectedUser(userId) {
        this.selectUser(userId);
    }

    refreshUsers() {
        this.loadUsers();
    }

    setOnlineFilter(enabled) {
        this.onlineFilter = enabled;
        if (this.onlineOnlyToggle) {
            this.onlineOnlyToggle.checked = enabled;
        }
        this.applyFiltersAndSort();
        this.renderUsers();
    }

    setGroupByStatus(enabled) {
        this.options.groupByStatus = enabled;
        if (this.groupByStatusToggle) {
            this.groupByStatusToggle.checked = enabled;
        }
        this.renderUsers();
    }

    // 事件系統
    emit(event, data = {}) {
        if (this.options.onEvent) {
            this.options.onEvent(event, data);
        }

        const customEvent = new CustomEvent(`userList:${event}`, {
            detail: { ...data, userList: this }
        });
        this.container.dispatchEvent(customEvent);
    }

    on(event, callback) {
        this.container.addEventListener(`userList:${event}`, callback);
    }

    off(event, callback) {
        this.container.removeEventListener(`userList:${event}`, callback);
    }

    // 銷毀方法
    destroy() {
        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 重置狀態
        this.users = [];
        this.filteredUsers = [];
        this.selectedUser = null;
        this.searchQuery = '';
        this.onlineFilter = false;
        this.isLoading = false;
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserListComponent;
} else {
    window.UserListComponent = UserListComponent;
}