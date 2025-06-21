// 頁面導航配置
const NavigationConfig = {
    // 頁面路徑配置
    pages: {
        home: '/pages/index.html',
        login: '/pages/login.html',
        chat: '/pages/chat.html'
    },

    // 認證檢查
    checkAuth() {
        try {
            const isAuthenticated = localStorage.getItem('isAuthenticated');
            const currentUser = localStorage.getItem('currentUser');
            return isAuthenticated === 'true' && currentUser && currentUser !== 'null';
        } catch (error) {
            console.error('Auth check error:', error);
            return false;
        }
    },

    // 頁面跳轉
    navigate(page, replace = false) {
        const url = this.pages[page];
        if (url) {
            if (replace) {
                window.location.replace(url);
            } else {
                window.location.href = url;
            }
        } else {
            console.error(`Page "${page}" not found in navigation config`);
        }
    },

    // 帶認證檢查的跳轉
    navigateWithAuth(page) {
        if (page === 'chat' && !this.checkAuth()) {
            this.navigate('login');
            return;
        }

        if ((page === 'login' || page === 'home') && this.checkAuth()) {
            this.navigate('chat');
            return;
        }

        this.navigate(page);
    },

    // 登出並跳轉
    logout() {
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('currentUser');
        this.navigate('login');
    },

    // 初始化頁面路由
    initPageRouting() {
        const currentPath = window.location.pathname;

        // 根據當前頁面決定是否需要重定向
        if (currentPath.includes('chat.html') && !this.checkAuth()) {
            this.navigate('login', true);
        } else if ((currentPath.includes('login.html') || currentPath.includes('index.html')) && this.checkAuth()) {
            this.navigate('chat', true);
        }
    }
};

// 全域可用
window.NavigationConfig = NavigationConfig;

// 頁面載入時初始化路由
document.addEventListener('DOMContentLoaded', () => {
    NavigationConfig.initPageRouting();
});

// 導出給其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationConfig;
}