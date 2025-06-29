class FormHandler {
    constructor() {
        this.authService = null;
        this.notification = null;
        this.isLoading = false;

        // 等待服務初始化
        this.init();
    }

    async init() {
        // 等待腳本載入完成
        document.addEventListener('scriptsLoaded', () => {
            this.initializeServices();
            this.setupEventListeners();
        });

        // 如果腳本已經載入，直接初始化
        if (typeof AuthService !== 'undefined') {
            this.initializeServices();
            this.setupEventListeners();
        }
    }

    initializeServices() {
        try {
            this.authService = new AuthService();
            this.notification = window.notificationComponent || new NotificationComponent();
            console.log('FormHandler services initialized');
        } catch (error) {
            console.error('Failed to initialize FormHandler services:', error);
        }
    }

    setupEventListeners() {
        // 註冊表單
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', this.handleRegistration.bind(this));

            // 實時驗證
            this.setupRealTimeValidation(registerForm);
        }

        // 登錄表單
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));

            // 實時驗證
            this.setupRealTimeValidation(loginForm);
        }

        // 密碼顯示/隱藏切換
        this.setupPasswordToggle();

        // 表單切換
        this.setupFormSwitching();
    }

    // 處理註冊
    async handleRegistration(event) {
        event.preventDefault();

        if (this.isLoading) return;

        const form = event.target;
        const formData = new FormData(form);

        const userData = {
            username: formData.get('username'),
            email: formData.get('email'),
            password: formData.get('password'),
            confirmPassword: formData.get('confirmPassword'),
            agreeTerms: formData.get('agreeTerms') === 'on'
        };

        try {
            // 清除之前的錯誤
            this.clearFormErrors(form);

            // 前端驗證
            const validationErrors = this.validateRegistrationData(userData);
            if (validationErrors.length > 0) {
                this.showValidationErrors(form, validationErrors);
                return;
            }

            // 設置載入狀態
            this.setFormLoading(form, true);

            // 調用註冊API
            const result = await this.authService.register(userData);

            if (result.success) {
                this.notification.show('註冊成功！正在跳轉...', 'success');

                // 延遲跳轉，讓用戶看到成功消息
                setTimeout(() => {
                    window.location.href = '/chat.html';
                }, 1500);
            } else {
                throw new Error(result.error || '註冊失敗');
            }

        } catch (error) {
            console.error('Registration error:', error);

            if (error.name === 'ValidationError' && error.details) {
                this.showValidationErrors(form, error.details);
            } else {
                this.notification.show(error.message || '註冊失敗，請稍後再試', 'error');
            }
        } finally {
            this.setFormLoading(form, false);
        }
    }

    // 處理登錄
    async handleLogin(event) {
        event.preventDefault();

        if (this.isLoading) return;

        const form = event.target;
        const formData = new FormData(form);

        const loginData = {
            identifier: formData.get('identifier'),
            password: formData.get('password'),
            rememberMe: formData.get('rememberMe') === 'on'
        };

        try {
            // 清除之前的錯誤
            this.clearFormErrors(form);

            // 基本驗證
            if (!loginData.identifier || !loginData.password) {
                this.showFieldError(form, 'identifier', '請填寫完整的登錄信息');
                return;
            }

            // 設置載入狀態
            this.setFormLoading(form, true);

            // 調用登錄API
            const result = await this.authService.login(
                loginData.identifier,
                loginData.password,
                loginData.rememberMe
            );

            if (result.success) {
                this.notification.show('登錄成功！正在跳轉...', 'success');

                setTimeout(() => {
                    window.location.href = '/chat.html';
                }, 1000);
            } else {
                throw new Error(result.error || '登錄失敗');
            }

        } catch (error) {
            console.error('Login error:', error);
            this.notification.show(error.message || '登錄失敗，請檢查用戶名和密碼', 'error');
        } finally {
            this.setFormLoading(form, false);
        }
    }

    // 註冊數據驗證
    validateRegistrationData(data) {
        const errors = [];

        // 用戶名驗證
        if (!data.username || data.username.trim().length < 3) {
            errors.push({ field: 'username', message: '用戶名長度至少3個字符' });
        } else if (data.username.trim().length > 30) {
            errors.push({ field: 'username', message: '用戶名長度不能超過30個字符' });
        } else if (!/^[a-zA-Z0-9_-]+$/.test(data.username.trim())) {
            errors.push({ field: 'username', message: '用戶名只能包含字母、數字、下劃線和連字符' });
        }

        // 郵箱驗證
        if (!data.email || !this.isValidEmail(data.email)) {
            errors.push({ field: 'email', message: '請輸入有效的郵箱地址' });
        }

        // 密碼驗證
        if (!data.password || data.password.length < 8) {
            errors.push({ field: 'password', message: '密碼長度至少8個字符' });
        } else if (data.password.length > 128) {
            errors.push({ field: 'password', message: '密碼長度不能超過128個字符' });
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.password)) {
            errors.push({ field: 'password', message: '密碼必須包含大小寫字母和數字' });
        }

        // 密碼確認
        if (data.password !== data.confirmPassword) {
            errors.push({ field: 'confirmPassword', message: '密碼確認不匹配' });
        }

        // 服務條款
        if (!data.agreeTerms) {
            errors.push({ field: 'agreeTerms', message: '請同意服務條款和隱私政策' });
        }

        return errors;
    }

    // 郵箱格式驗證
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // 顯示驗證錯誤
    showValidationErrors(form, errors) {
        errors.forEach(error => {
            if (typeof error === 'string') {
                // 如果是字符串，顯示通用錯誤
                this.notification.show(error, 'error');
            } else {
                // 如果是對象，顯示字段特定錯誤
                this.showFieldError(form, error.field, error.message);
            }
        });
    }

    // 顯示字段錯誤
    showFieldError(form, fieldName, message) {
        const field = form.querySelector(`[name="${fieldName}"]`);
        if (!field) return;

        const formGroup = field.closest('.form-group');
        if (!formGroup) return;

        // 移除之前的錯誤
        const existingError = formGroup.querySelector('.form-error');
        if (existingError) {
            existingError.textContent = message;
        } else {
            const errorElement = document.createElement('div');
            errorElement.className = 'form-error';
            errorElement.textContent = message;
            formGroup.appendChild(errorElement);
        }

        // 添加錯誤樣式
        field.classList.add('error');
        formGroup.classList.add('has-error');
    }

    // 清除表單錯誤
    clearFormErrors(form) {
        // 清除所有錯誤消息
        const errorElements = form.querySelectorAll('.form-error');
        errorElements.forEach(element => {
            element.textContent = '';
        });

        // 移除錯誤樣式
        const errorFields = form.querySelectorAll('.error');
        errorFields.forEach(field => {
            field.classList.remove('error');
        });

        const errorGroups = form.querySelectorAll('.has-error');
        errorGroups.forEach(group => {
            group.classList.remove('has-error');
        });
    }

    // 設置表單載入狀態
    setFormLoading(form, isLoading) {
        this.isLoading = isLoading;

        const submitButton = form.querySelector('button[type="submit"]');
        if (!submitButton) return;

        const btnText = submitButton.querySelector('.btn-text');
        const btnSpinner = submitButton.querySelector('.btn-spinner');

        if (isLoading) {
            submitButton.disabled = true;
            if (btnText) btnText.classList.add('hidden');
            if (btnSpinner) btnSpinner.classList.remove('hidden');

            // 禁用所有表單字段
            const inputs = form.querySelectorAll('input, button, select, textarea');
            inputs.forEach(input => {
                if (input !== submitButton) {
                    input.disabled = true;
                }
            });
        } else {
            submitButton.disabled = false;
            if (btnText) btnText.classList.remove('hidden');
            if (btnSpinner) btnSpinner.classList.add('hidden');

            // 重新啟用所有表單字段
            const inputs = form.querySelectorAll('input, button, select, textarea');
            inputs.forEach(input => {
                input.disabled = false;
            });
        }
    }

    // 設置實時驗證
    setupRealTimeValidation(form) {
        const inputs = form.querySelectorAll('input[required]');

        inputs.forEach(input => {
            // 失去焦點時驗證
            input.addEventListener('blur', () => {
                this.validateField(form, input);
            });

            // 輸入時清除錯誤（延遲執行）
            let timeout;
            input.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    if (input.classList.contains('error')) {
                        this.clearFieldError(form, input);
                    }
                }, 500);
            });
        });
    }

    // 驗證單個字段
    validateField(form, field) {
        const fieldName = field.name;
        const value = field.value;

        let errorMessage = '';

        switch (fieldName) {
            case 'username':
                if (!value || value.trim().length < 3) {
                    errorMessage = '用戶名長度至少3個字符';
                } else if (!/^[a-zA-Z0-9_-]+$/.test(value.trim())) {
                    errorMessage = '用戶名只能包含字母、數字、下劃線和連字符';
                }
                break;

            case 'email':
                if (!value || !this.isValidEmail(value)) {
                    errorMessage = '請輸入有效的郵箱地址';
                }
                break;

            case 'password':
                if (!value || value.length < 8) {
                    errorMessage = '密碼長度至少8個字符';
                } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
                    errorMessage = '密碼必須包含大小寫字母和數字';
                }
                break;

            case 'confirmPassword':
                const passwordField = form.querySelector('[name="password"]');
                if (passwordField && value !== passwordField.value) {
                    errorMessage = '密碼確認不匹配';
                }
                break;

            case 'identifier':
                if (!value || value.trim().length < 3) {
                    errorMessage = '請輸入用戶名或郵箱';
                }
                break;
        }

        if (errorMessage) {
            this.showFieldError(form, fieldName, errorMessage);
        } else {
            this.clearFieldError(form, field);
        }
    }

    // 清除單個字段錯誤
    clearFieldError(form, field) {
        const formGroup = field.closest('.form-group');
        if (!formGroup) return;

        const errorElement = formGroup.querySelector('.form-error');
        if (errorElement) {
            errorElement.textContent = '';
        }

        field.classList.remove('error');
        formGroup.classList.remove('has-error');
    }

    // 設置密碼顯示/隱藏切換
    setupPasswordToggle() {
        const passwordToggles = document.querySelectorAll('.password-toggle');

        passwordToggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const input = toggle.previousElementSibling;
                if (input && input.type === 'password') {
                    input.type = 'text';
                    toggle.innerHTML = '<i class="fas fa-eye-slash"></i>';
                } else if (input && input.type === 'text') {
                    input.type = 'password';
                    toggle.innerHTML = '<i class="fas fa-eye"></i>';
                }
            });
        });
    }

    // 設置表單切換
    setupFormSwitching() {
        // 切換到註冊表單
        const showRegisterLinks = document.querySelectorAll('#show-register');
        showRegisterLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToForm('register');
            });
        });

        // 切換到登錄表單
        const showLoginLinks = document.querySelectorAll('#show-login');
        showLoginLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchToForm('login');
            });
        });
    }

    // 切換表單
    switchToForm(formType) {
        const loginPage = document.getElementById('login-page');
        const registerPage = document.getElementById('register-page');

        if (formType === 'register') {
            if (loginPage) loginPage.classList.add('hidden');
            if (registerPage) registerPage.classList.remove('hidden');

            // 清除登錄表單的錯誤
            const loginForm = document.getElementById('login-form');
            if (loginForm) this.clearFormErrors(loginForm);
        } else {
            if (registerPage) registerPage.classList.add('hidden');
            if (loginPage) loginPage.classList.remove('hidden');

            // 清除註冊表單的錯誤
            const registerForm = document.getElementById('register-form');
            if (registerForm) this.clearFormErrors(registerForm);
        }

        // 添加切換動畫效果
        this.addSwitchAnimation(formType);
    }

    // 添加表單切換動畫
    addSwitchAnimation(formType) {
        const activeForm = document.querySelector('.auth-page:not(.hidden)');
        if (activeForm) {
            activeForm.style.animation = 'slideInRight 0.3s ease-out';

            // 動畫結束後清除樣式
            setTimeout(() => {
                activeForm.style.animation = '';
            }, 300);
        }
    }

    // 檢查表單狀態
    isFormValid(form) {
        const errors = form.querySelectorAll('.form-error');
        const hasErrors = Array.from(errors).some(error => error.textContent.trim() !== '');

        const requiredFields = form.querySelectorAll('[required]');
        const hasEmptyFields = Array.from(requiredFields).some(field => !field.value.trim());

        return !hasErrors && !hasEmptyFields;
    }

    // 獲取表單數據
    getFormData(form) {
        const formData = new FormData(form);
        const data = {};

        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }

        return data;
    }

    // 重置表單
    resetForm(form) {
        form.reset();
        this.clearFormErrors(form);
        this.setFormLoading(form, false);
    }

    // 自動填充測試數據（僅開發環境）
    fillTestData(formType) {
        if (process.env.NODE_ENV !== 'development') return;

        if (formType === 'register') {
            const form = document.getElementById('register-form');
            if (form) {
                form.querySelector('[name="username"]').value = 'testuser' + Math.floor(Math.random() * 1000);
                form.querySelector('[name="email"]').value = 'test' + Math.floor(Math.random() * 1000) + '@example.com';
                form.querySelector('[name="password"]').value = 'TestPass123';
                form.querySelector('[name="confirmPassword"]').value = 'TestPass123';
                form.querySelector('[name="agreeTerms"]').checked = true;
            }
        } else if (formType === 'login') {
            const form = document.getElementById('login-form');
            if (form) {
                form.querySelector('[name="identifier"]').value = 'testuser';
                form.querySelector('[name="password"]').value = 'TestPass123';
            }
        }
    }
}

// 自定義CSS樣式（如果不存在）
function injectFormStyles() {
    if (document.getElementById('form-handler-styles')) return;

    const styles = `
        .form-group {
            margin-bottom: 1.5rem;
            position: relative;
        }

        .form-group.has-error input {
            border-color: #e53e3e;
            box-shadow: 0 0 0 3px rgba(229, 62, 62, 0.1);
        }

        .form-error {
            color: #e53e3e;
            font-size: 0.875rem;
            margin-top: 0.5rem;
            display: block;
            animation: shake 0.3s ease-in-out;
        }

        .form-success {
            color: #38a169;
            font-size: 0.875rem;
            margin-top: 0.5rem;
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .btn-spinner {
            display: inline-block;
        }

        .btn-spinner.hidden {
            display: none;
        }

        .btn-text.hidden {
            display: none;
        }

        .password-input {
            position: relative;
        }

        .password-toggle {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            color: #666;
            padding: 4px;
        }

        .password-toggle:hover {
            color: #333;
        }

        .auth-page {
            transition: all 0.3s ease;
        }

        .auth-page.hidden {
            display: none;
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }

        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(30px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        }

        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .form-help {
            font-size: 0.8rem;
            color: #666;
            margin-top: 0.25rem;
        }

        .strength-meter {
            height: 4px;
            background: #e2e8f0;
            border-radius: 2px;
            margin-top: 0.5rem;
            overflow: hidden;
        }

        .strength-bar {
            height: 100%;
            transition: all 0.3s ease;
            border-radius: 2px;
        }

        .strength-weak { background: #e53e3e; width: 33%; }
        .strength-medium { background: #f59e0b; width: 66%; }
        .strength-strong { background: #38a169; width: 100%; }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'form-handler-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

// 密碼強度檢測器
class PasswordStrengthChecker {
    static checkStrength(password) {
        let score = 0;
        let feedback = [];

        if (!password) {
            return { score: 0, level: 'none', feedback: ['請輸入密碼'] };
        }

        // 長度檢查
        if (password.length >= 8) score++;
        else feedback.push('至少8個字符');

        if (password.length >= 12) score++;

        // 字符類型檢查
        if (/[a-z]/.test(password)) score++;
        else feedback.push('包含小寫字母');

        if (/[A-Z]/.test(password)) score++;
        else feedback.push('包含大寫字母');

        if (/\d/.test(password)) score++;
        else feedback.push('包含數字');

        if (/[^a-zA-Z\d]/.test(password)) score++;
        else feedback.push('包含特殊字符');

        // 常見密碼檢查
        const commonPasswords = ['password', '123456', 'qwerty', 'abc123'];
        if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
            score = Math.max(0, score - 2);
            feedback.push('避免使用常見密碼');
        }

        let level;
        if (score <= 2) level = 'weak';
        else if (score <= 4) level = 'medium';
        else level = 'strong';

        return { score, level, feedback };
    }

    static addStrengthMeter(passwordField) {
        const formGroup = passwordField.closest('.form-group');
        if (!formGroup || formGroup.querySelector('.strength-meter')) return;

        const meter = document.createElement('div');
        meter.className = 'strength-meter';
        meter.innerHTML = '<div class="strength-bar"></div>';

        const feedback = document.createElement('div');
        feedback.className = 'strength-feedback';
        feedback.style.cssText = 'font-size: 0.8rem; margin-top: 0.25rem; color: #666;';

        passwordField.parentNode.appendChild(meter);
        passwordField.parentNode.appendChild(feedback);

        passwordField.addEventListener('input', () => {
            const strength = this.checkStrength(passwordField.value);
            const bar = meter.querySelector('.strength-bar');

            bar.className = `strength-bar strength-${strength.level}`;

            if (strength.level === 'none') {
                feedback.textContent = '';
            } else {
                const levelText = {
                    weak: '弱',
                    medium: '中等',
                    strong: '強'
                };
                feedback.textContent = `密碼強度: ${levelText[strength.level]}`;

                if (strength.feedback.length > 0) {
                    feedback.textContent += ` (建議: ${strength.feedback.join(', ')})`;
                }
            }
        });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 注入樣式
    injectFormStyles();

    // 創建表單處理器實例
    window.formHandler = new FormHandler();

    // 為密碼字段添加強度檢測
    const passwordFields = document.querySelectorAll('input[type="password"][name="password"]');
    passwordFields.forEach(field => {
        PasswordStrengthChecker.addStrengthMeter(field);
    });

    // 開發環境下的快捷鍵
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        document.addEventListener('keydown', (e) => {
            // Ctrl + Shift + T = 填充測試數據
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                const activeForm = document.querySelector('.auth-page:not(.hidden)');
                if (activeForm) {
                    const formType = activeForm.id === 'register-page' ? 'register' : 'login';
                    window.formHandler.fillTestData(formType);
                }
            }
        });
    }
});

// 導出到全局
if (typeof window !== 'undefined') {
    window.FormHandler = FormHandler;
    window.PasswordStrengthChecker = PasswordStrengthChecker;
}