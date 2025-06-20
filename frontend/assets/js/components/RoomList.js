class RoomListComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            showSearch: true,
            showCreateButton: true,
            enableDragDrop: false,
            sortBy: 'lastActivity', // name, memberCount, lastActivity
            sortOrder: 'desc',
            maxRooms: 100,
            enablePagination: false,
            roomsPerPage: 20,
            ...options
        };

        this.rooms = [];
        this.filteredRooms = [];
        this.selectedRoom = null;
        this.searchQuery = '';
        this.currentPage = 1;
        this.isLoading = false;

        this.init();
    }

    init() {
        this.createRoomListInterface();
        this.bindEvents();
        this.loadRooms();
    }

    createRoomListInterface() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="room-list-container">
                <!-- 標題和搜尋 -->
                <div class="room-list-header">
                    <div class="header-title">
                        <h3>聊天室</h3>
                        <span class="room-count" id="room-count">0</span>
                    </div>
                    
                    ${this.options.showSearch ? `
                        <div class="search-container">
                            <div class="search-input-wrapper">
                                <input type="text" 
                                       id="room-search" 
                                       class="search-input" 
                                       placeholder="搜尋聊天室..."
                                       autocomplete="off">
                                <i class="fas fa-search search-icon"></i>
                                <button class="clear-search hidden" id="clear-search">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${this.options.showCreateButton ? `
                        <button class="btn btn-primary create-room-btn" id="create-room-btn">
                            <i class="fas fa-plus"></i>
                            創建聊天室
                        </button>
                    ` : ''}
                </div>

                <!-- 過濾和排序 -->
                <div class="room-filters">
                    <div class="filter-group">
                        <label>排序:</label>
                        <select id="sort-select" class="sort-select">
                            <option value="lastActivity">最近活動</option>
                            <option value="name">名稱</option>
                            <option value="memberCount">成員數量</option>
                            <option value="created">創建時間</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>類型:</label>
                        <select id="type-filter" class="type-filter">
                            <option value="">全部</option>
                            <option value="public">公開</option>
                            <option value="private">私人</option>
                            <option value="channel">頻道</option>
                        </select>
                    </div>
                </div>

                <!-- 聊天室列表 -->
                <div class="room-list-content">
                    <div class="room-items" id="room-items">
                        <!-- 聊天室項目會在這裡動態載入 -->
                    </div>
                    
                    <!-- 載入指示器 -->
                    <div class="loading-indicator hidden" id="loading-indicator">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>載入中...</span>
                    </div>
                    
                    <!-- 空狀態 -->
                    <div class="empty-state hidden" id="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <h4>沒有找到聊天室</h4>
                        <p class="empty-message">試試不同的搜尋關鍵字，或創建一個新的聊天室</p>
                        ${this.options.showCreateButton ? `
                            <button class="btn btn-primary create-first-room">
                                <i class="fas fa-plus"></i>
                                創建第一個聊天室
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- 分頁 -->
                ${this.options.enablePagination ? `
                    <div class="room-pagination hidden" id="room-pagination">
                        <button class="btn btn-text prev-btn" id="prev-page" disabled>
                            <i class="fas fa-chevron-left"></i>
                            上一頁
                        </button>
                        <span class="page-info" id="page-info">1 / 1</span>
                        <button class="btn btn-text next-btn" id="next-page" disabled>
                            下一頁
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        this.getElements();
    }

    getElements() {
        this.roomItems = this.container.querySelector('#room-items');
        this.roomCount = this.container.querySelector('#room-count');
        this.searchInput = this.container.querySelector('#room-search');
        this.clearSearchBtn = this.container.querySelector('#clear-search');
        this.createRoomBtn = this.container.querySelector('#create-room-btn');
        this.createFirstRoomBtn = this.container.querySelector('.create-first-room');
        this.sortSelect = this.container.querySelector('#sort-select');
        this.typeFilter = this.container.querySelector('#type-filter');
        this.loadingIndicator = this.container.querySelector('#loading-indicator');
        this.emptyState = this.container.querySelector('#empty-state');
        this.pagination = this.container.querySelector('#room-pagination');
        this.prevPageBtn = this.container.querySelector('#prev-page');
        this.nextPageBtn = this.container.querySelector('#next-page');
        this.pageInfo = this.container.querySelector('#page-info');
    }

    bindEvents() {
        // 搜尋事件
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearch.bind(this));
            this.searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));
        }

        this.clearSearchBtn?.addEventListener('click', this.clearSearch.bind(this));

        // 排序和過濾
        this.sortSelect?.addEventListener('change', this.handleSortChange.bind(this));
        this.typeFilter?.addEventListener('change', this.handleTypeFilter.bind(this));

        // 創建聊天室
        this.createRoomBtn?.addEventListener('click', this.showCreateRoomModal.bind(this));
        this.createFirstRoomBtn?.addEventListener('click', this.showCreateRoomModal.bind(this));

        // 分頁
        this.prevPageBtn?.addEventListener('click', this.goToPrevPage.bind(this));
        this.nextPageBtn?.addEventListener('click', this.goToNextPage.bind(this));

        // 聊天室項目事件
        this.roomItems?.addEventListener('click', this.handleRoomClick.bind(this));
        this.roomItems?.addEventListener('contextmenu', this.handleRoomContextMenu.bind(this));

        // 拖放事件（如果啟用）
        if (this.options.enableDragDrop) {
            this.bindDragDropEvents();
        }
    }

    bindDragDropEvents() {
        this.roomItems?.addEventListener('dragstart', this.handleDragStart.bind(this));
        this.roomItems?.addEventListener('dragover', this.handleDragOver.bind(this));
        this.roomItems?.addEventListener('drop', this.handleDrop.bind(this));
    }

    // 資料載入
    async loadRooms() {
        this.setLoading(true);

        try {
            const rooms = await this.fetchRooms();
            this.rooms = rooms;
            this.applyFiltersAndSort();
            this.renderRooms();
        } catch (error) {
            console.error('載入聊天室失敗:', error);
            this.showError('載入聊天室失敗');
        } finally {
            this.setLoading(false);
        }
    }

    async fetchRooms() {
        // 模擬 API 調用
        return new Promise(resolve => {
            setTimeout(() => {
                resolve([
                    {
                        id: '1',
                        name: '技術討論',
                        description: '討論技術相關話題',
                        type: 'public',
                        memberCount: 42,
                        avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=tech',
                        lastMessage: {
                            content: '新的框架看起來很有前景',
                            sender: 'Alice',
                            timestamp: new Date(Date.now() - 300000)
                        },
                        lastActivity: new Date(Date.now() - 300000),
                        created: new Date(Date.now() - 7200000),
                        isJoined: true,
                        hasUnread: true,
                        unreadCount: 3
                    },
                    {
                        id: '2',
                        name: '設計師聚會',
                        description: 'UI/UX 設計師交流空間',
                        type: 'private',
                        memberCount: 18,
                        avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=design',
                        lastMessage: {
                            content: '分享一個很棒的設計資源',
                            sender: 'Bob',
                            timestamp: new Date(Date.now() - 600000)
                        },
                        lastActivity: new Date(Date.now() - 600000),
                        created: new Date(Date.now() - 14400000),
                        isJoined: true,
                        hasUnread: false,
                        unreadCount: 0
                    },
                    {
                        id: '3',
                        name: '產品公告',
                        description: '重要產品更新和公告',
                        type: 'channel',
                        memberCount: 156,
                        avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=announcement',
                        lastMessage: {
                            content: '版本 2.0 即將發布',
                            sender: 'Admin',
                            timestamp: new Date(Date.now() - 1800000)
                        },
                        lastActivity: new Date(Date.now() - 1800000),
                        created: new Date(Date.now() - 86400000),
                        isJoined: false,
                        hasUnread: false,
                        unreadCount: 0
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
        this.renderRooms();
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
        this.renderRooms();
    }

    handleSortChange() {
        this.options.sortBy = this.sortSelect.value;
        this.applyFiltersAndSort();
        this.renderRooms();
    }

    handleTypeFilter() {
        this.applyFiltersAndSort();
        this.renderRooms();
    }

    applyFiltersAndSort() {
        let filtered = [...this.rooms];

        // 搜尋過濾
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(room =>
                room.name.toLowerCase().includes(query) ||
                room.description?.toLowerCase().includes(query)
            );
        }

        // 類型過濾
        const typeFilter = this.typeFilter?.value;
        if (typeFilter) {
            filtered = filtered.filter(room => room.type === typeFilter);
        }

        // 排序
        filtered.sort((a, b) => {
            let valueA, valueB;

            switch (this.options.sortBy) {
                case 'name':
                    valueA = a.name.toLowerCase();
                    valueB = b.name.toLowerCase();
                    break;
                case 'memberCount':
                    valueA = a.memberCount;
                    valueB = b.memberCount;
                    break;
                case 'created':
                    valueA = a.created;
                    valueB = b.created;
                    break;
                case 'lastActivity':
                default:
                    valueA = a.lastActivity;
                    valueB = b.lastActivity;
                    break;
            }

            if (this.options.sortOrder === 'desc') {
                return valueB > valueA ? 1 : valueB < valueA ? -1 : 0;
            } else {
                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
            }
        });

        this.filteredRooms = filtered;
        this.updateRoomCount();

        // 如果啟用分頁，重置到第一頁
        if (this.options.enablePagination) {
            this.currentPage = 1;
            this.updatePagination();
        }
    }

    // 渲染方法
    renderRooms() {
        if (!this.roomItems) return;

        let roomsToShow = this.filteredRooms;

        // 分頁處理
        if (this.options.enablePagination) {
            const start = (this.currentPage - 1) * this.options.roomsPerPage;
            const end = start + this.options.roomsPerPage;
            roomsToShow = this.filteredRooms.slice(start, end);
        }

        if (roomsToShow.length === 0) {
            this.showEmptyState();
            return;
        }

        this.hideEmptyState();

        const roomsHTML = roomsToShow.map(room => this.createRoomItemHTML(room)).join('');
        this.roomItems.innerHTML = roomsHTML;

        // 更新選中狀態
        this.updateSelectedRoom();
    }

    createRoomItemHTML(room) {
        const typeIcon = this.getRoomTypeIcon(room.type);
        const lastMessageTime = this.formatTime(room.lastActivity);

        return `
            <div class="room-item ${room.isJoined ? 'joined' : ''} ${room.hasUnread ? 'unread' : ''}" 
                 data-room-id="${room.id}"
                 draggable="${this.options.enableDragDrop}">
                
                <div class="room-avatar-container">
                    <img src="${room.avatar}" alt="${room.name}" class="room-avatar">
                    <div class="room-type-badge">
                        ${typeIcon}
                    </div>
                    ${room.hasUnread && room.unreadCount > 0 ? `
                        <div class="unread-badge">${room.unreadCount > 99 ? '99+' : room.unreadCount}</div>
                    ` : ''}
                </div>

                <div class="room-content">
                    <div class="room-header">
                        <div class="room-title">
                            <h4 class="room-name">${room.name}</h4>
                            <div class="room-meta">
                                <span class="member-count">
                                    <i class="fas fa-users"></i>
                                    ${room.memberCount}
                                </span>
                                <span class="last-activity">${lastMessageTime}</span>
                            </div>
                        </div>
                        <div class="room-actions">
                            ${!room.isJoined ? `
                                <button class="btn btn-sm btn-primary join-btn" data-action="join">
                                    加入
                                </button>
                            ` : `
                                <button class="btn-icon more-btn" data-action="more">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                            `}
                        </div>
                    </div>

                    <div class="room-info">
                        ${room.description ? `
                            <div class="room-description">${room.description}</div>
                        ` : ''}
                        
                        ${room.lastMessage ? `
                            <div class="last-message">
                                <span class="sender">${room.lastMessage.sender}:</span>
                                <span class="content">${this.truncateText(room.lastMessage.content, 50)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                ${room.hasUnread ? '<div class="unread-indicator"></div>' : ''}
            </div>
        `;
    }

    getRoomTypeIcon(type) {
        const icons = {
            public: '<i class="fas fa-globe" title="公開聊天室"></i>',
            private: '<i class="fas fa-lock" title="私人聊天室"></i>',
            channel: '<i class="fas fa-bullhorn" title="頻道"></i>'
        };
        return icons[type] || icons.public;
    }

    formatTime(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diff = now - time;

        if (diff < 60000) { // 小於 1 分鐘
            return '剛剛';
        } else if (diff < 3600000) { // 小於 1 小時
            return `${Math.floor(diff / 60000)} 分鐘前`;
        } else if (time.toDateString() === now.toDateString()) { // 今天
            return time.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        } else {
            return time.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
        }
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    // 事件處理
    handleRoomClick(e) {
        const roomItem = e.target.closest('.room-item');
        if (!roomItem) return;

        const roomId = roomItem.dataset.roomId;
        const action = e.target.closest('[data-action]')?.dataset.action;

        if (action) {
            e.stopPropagation();
            this.handleRoomAction(roomId, action, e.target);
            return;
        }

        // 選擇聊天室
        this.selectRoom(roomId);
    }

    handleRoomContextMenu(e) {
        e.preventDefault();

        const roomItem = e.target.closest('.room-item');
        if (!roomItem) return;

        const roomId = roomItem.dataset.roomId;
        this.showRoomContextMenu(roomId, e.clientX, e.clientY);
    }

    handleRoomAction(roomId, action, target) {
        const room = this.rooms.find(r => r.id === roomId);
        if (!room) return;

        switch (action) {
            case 'join':
                this.joinRoom(room);
                break;
            case 'leave':
                this.leaveRoom(room);
                break;
            case 'more':
                this.showRoomMenu(room, target);
                break;
            case 'mute':
                this.toggleRoomMute(room);
                break;
            case 'favorite':
                this.toggleRoomFavorite(room);
                break;
        }
    }

    selectRoom(roomId) {
        // 更新選中狀態
        this.selectedRoom = roomId;
        this.updateSelectedRoom();

        // 發射事件
        const room = this.rooms.find(r => r.id === roomId);
        this.emit('roomSelected', { room });
    }

    updateSelectedRoom() {
        this.roomItems?.querySelectorAll('.room-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.roomId === this.selectedRoom);
        });
    }

    async joinRoom(room) {
        try {
            this.setRoomLoading(room.id, true);

            // 模擬 API 調用
            await new Promise(resolve => setTimeout(resolve, 1000));

            room.isJoined = true;
            room.memberCount++;

            this.renderRooms();
            this.emit('roomJoined', { room });

        } catch (error) {
            console.error('加入聊天室失敗:', error);
            this.showError('加入聊天室失敗');
        } finally {
            this.setRoomLoading(room.id, false);
        }
    }

    async leaveRoom(room) {
        try {
            this.setRoomLoading(room.id, true);

            // 模擬 API 調用
            await new Promise(resolve => setTimeout(resolve, 1000));

            room.isJoined = false;
            room.memberCount = Math.max(0, room.memberCount - 1);

            this.renderRooms();
            this.emit('roomLeft', { room });

        } catch (error) {
            console.error('離開聊天室失敗:', error);
            this.showError('離開聊天室失敗');
        } finally {
            this.setRoomLoading(room.id, false);
        }
    }

    setRoomLoading(roomId, loading) {
        const roomItem = this.roomItems?.querySelector(`[data-room-id="${roomId}"]`);
        if (!roomItem) return;

        roomItem.classList.toggle('loading', loading);

        const actionBtn = roomItem.querySelector('[data-action]');
        if (actionBtn) {
            actionBtn.disabled = loading;
        }
    }

    // 聊天室選單
    showRoomMenu(room, target) {
        const menu = this.createRoomMenu(room);
        this.showContextMenu(menu, target);
    }

    showRoomContextMenu(roomId, x, y) {
        const room = this.rooms.find(r => r.id === roomId);
        if (!room) return;

        const menu = this.createRoomContextMenu(room);
        this.showContextMenuAt(menu, x, y);
    }

    createRoomMenu(room) {
        const menuItems = [];

        if (room.isJoined) {
            menuItems.push(
                { label: '開啟聊天室', icon: 'fas fa-comments', action: 'open' },
                { label: '邀請朋友', icon: 'fas fa-user-plus', action: 'invite' },
                { type: 'divider' },
                { label: '靜音通知', icon: 'fas fa-bell-slash', action: 'mute' },
                { label: '加入我的最愛', icon: 'fas fa-star', action: 'favorite' },
                { type: 'divider' },
                { label: '聊天室設定', icon: 'fas fa-cog', action: 'settings' },
                { label: '離開聊天室', icon: 'fas fa-sign-out-alt', action: 'leave', className: 'danger' }
            );
        } else {
            menuItems.push(
                { label: '加入聊天室', icon: 'fas fa-sign-in-alt', action: 'join' },
                { label: '查看資訊', icon: 'fas fa-info-circle', action: 'info' }
            );
        }

        return menuItems;
    }

    createRoomContextMenu(room) {
        return this.createRoomMenu(room);
    }

    showContextMenu(menuItems, target) {
        // 實作右鍵選單顯示
        this.emit('contextMenu', { menuItems, target });
    }

    showContextMenuAt(menuItems, x, y) {
        // 實作在指定位置顯示右鍵選單
        this.emit('contextMenuAt', { menuItems, x, y });
    }

    // 創建聊天室
    showCreateRoomModal() {
        this.emit('createRoom');
    }

    // 拖放功能
    handleDragStart(e) {
        const roomItem = e.target.closest('.room-item');
        if (!roomItem) return;

        const roomId = roomItem.dataset.roomId;
        e.dataTransfer.setData('text/plain', roomId);
        e.dataTransfer.effectAllowed = 'move';

        roomItem.classList.add('dragging');
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const roomItem = e.target.closest('.room-item');
        if (!roomItem || roomItem.classList.contains('dragging')) return;

        // 顯示拖放指示器
        this.showDropIndicator(roomItem, e.clientY);
    }

    handleDrop(e) {
        e.preventDefault();

        const draggedRoomId = e.dataTransfer.getData('text/plain');
        const targetItem = e.target.closest('.room-item');

        if (!targetItem || !draggedRoomId) return;

        const targetRoomId = targetItem.dataset.roomId;

        // 執行拖放邏輯
        this.moveRoom(draggedRoomId, targetRoomId);

        // 清理
        this.cleanupDragDrop();
    }

    showDropIndicator(targetItem, clientY) {
        const rect = targetItem.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        // 移除之前的指示器
        this.roomItems?.querySelectorAll('.drop-indicator').forEach(indicator => {
            indicator.remove();
        });

        // 創建新的指示器
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';

        if (clientY < midY) {
            targetItem.parentNode.insertBefore(indicator, targetItem);
        } else {
            targetItem.parentNode.insertBefore(indicator, targetItem.nextSibling);
        }
    }

    moveRoom(draggedRoomId, targetRoomId) {
        // 實作聊天室重新排序邏輯
        this.emit('roomMoved', { draggedRoomId, targetRoomId });
    }

    cleanupDragDrop() {
        this.roomItems?.querySelectorAll('.room-item').forEach(item => {
            item.classList.remove('dragging');
        });

        this.roomItems?.querySelectorAll('.drop-indicator').forEach(indicator => {
            indicator.remove();
        });
    }

    // 分頁功能
    goToPrevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderRooms();
            this.updatePagination();
        }
    }

    goToNextPage() {
        const totalPages = this.getTotalPages();
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderRooms();
            this.updatePagination();
        }
    }

    getTotalPages() {
        return Math.ceil(this.filteredRooms.length / this.options.roomsPerPage);
    }

    updatePagination() {
        if (!this.options.enablePagination || !this.pagination) return;

        const totalPages = this.getTotalPages();

        if (totalPages <= 1) {
            this.pagination.classList.add('hidden');
            return;
        }

        this.pagination.classList.remove('hidden');

        // 更新按鈕狀態
        if (this.prevPageBtn) {
            this.prevPageBtn.disabled = this.currentPage === 1;
        }

        if (this.nextPageBtn) {
            this.nextPageBtn.disabled = this.currentPage === totalPages;
        }

        // 更新頁面資訊
        if (this.pageInfo) {
            this.pageInfo.textContent = `${this.currentPage} / ${totalPages}`;
        }
    }

    // UI 狀態管理
    setLoading(loading) {
        this.isLoading = loading;

        if (loading) {
            this.loadingIndicator?.classList.remove('hidden');
            this.roomItems?.classList.add('loading');
        } else {
            this.loadingIndicator?.classList.add('hidden');
            this.roomItems?.classList.remove('loading');
        }
    }

    showEmptyState() {
        this.emptyState?.classList.remove('hidden');
        this.roomItems?.classList.add('hidden');
        this.pagination?.classList.add('hidden');
    }

    hideEmptyState() {
        this.emptyState?.classList.add('hidden');
        this.roomItems?.classList.remove('hidden');

        if (this.options.enablePagination) {
            this.updatePagination();
        }
    }

    updateRoomCount() {
        if (this.roomCount) {
            this.roomCount.textContent = this.filteredRooms.length;
        }
    }

    showError(message) {
        this.emit('error', { message });
    }

    // 公共 API
    addRoom(room) {
        this.rooms.unshift(room);
        this.applyFiltersAndSort();
        this.renderRooms();
        this.emit('roomAdded', { room });
    }

    removeRoom(roomId) {
        const index = this.rooms.findIndex(r => r.id === roomId);
        if (index > -1) {
            const room = this.rooms[index];
            this.rooms.splice(index, 1);
            this.applyFiltersAndSort();
            this.renderRooms();
            this.emit('roomRemoved', { room });
        }
    }

    updateRoom(roomId, updates) {
        const room = this.rooms.find(r => r.id === roomId);
        if (room) {
            Object.assign(room, updates);
            this.applyFiltersAndSort();
            this.renderRooms();
            this.emit('roomUpdated', { room });
        }
    }

    markRoomAsRead(roomId) {
        const room = this.rooms.find(r => r.id === roomId);
        if (room) {
            room.hasUnread = false;
            room.unreadCount = 0;
            this.renderRooms();
        }
    }

    setSelectedRoom(roomId) {
        this.selectRoom(roomId);
    }

    refreshRooms() {
        this.loadRooms();
    }

    getRooms() {
        return [...this.rooms];
    }

    getSelectedRoom() {
        return this.rooms.find(r => r.id === this.selectedRoom);
    }

    // 事件系統
    emit(event, data = {}) {
        if (this.options.onEvent) {
            this.options.onEvent(event, data);
        }

        const customEvent = new CustomEvent(`roomList:${event}`, {
            detail: { ...data, roomList: this }
        });
        this.container.dispatchEvent(customEvent);
    }

    on(event, callback) {
        this.container.addEventListener(`roomList:${event}`, callback);
    }

    off(event, callback) {
        this.container.removeEventListener(`roomList:${event}`, callback);
    }

    // 銷毀方法
    destroy() {
        // 清理拖放事件
        this.cleanupDragDrop();

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 重置狀態
        this.rooms = [];
        this.filteredRooms = [];
        this.selectedRoom = null;
        this.searchQuery = '';
        this.currentPage = 1;
        this.isLoading = false;
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RoomListComponent;
} else {
    window.RoomListComponent = RoomListComponent;
}