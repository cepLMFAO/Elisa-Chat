// 基礎驗證器類
class BaseValidator {
    constructor(value) {
        this.value = value;
        this.errors = [];
    }

    addError(message) {
        this.errors.push(message);
        return this;
    }

    isValid() {
        return this.errors.length === 0;
    }

    getErrors() {
        return this.errors;
    }

    getFirstError() {
        return this.errors[0] || null;
    }
}

// 字串驗證器
class StringValidator extends BaseValidator {
    required(message = '此欄位為必填') {
        if (!this.value || this.value.trim() === '') {
            this.addError(message);
        }
        return this;
    }

    minLength(length, message = `最少需要 ${length} 個字符`) {
        if (this.value && this.value.length < length) {
            this.addError(message);
        }
        return this;
    }

    maxLength(length, message = `最多只能 ${length} 個字符`) {
        if (this.value && this.value.length > length) {
            this.addError(message);
        }
        return this;
    }

    length(min, max, message = `長度必須在 ${min} 到 ${max} 個字符之間`) {
        if (this.value && (this.value.length < min || this.value.length > max)) {
            this.addError(message);
        }
        return this;
    }

    pattern(regex, message = '格式不正確') {
        if (this.value && !regex.test(this.value)) {
            this.addError(message);
        }
        return this;
    }

    email(message = '請輸入有效的郵箱地址') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return this.pattern(emailRegex, message);
    }

    url(message = '請輸入有效的網址') {
        const urlRegex = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
        return this.pattern(urlRegex, message);
    }

    phone(message = '請輸入有效的手機號碼') {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return this.pattern(phoneRegex, message);
    }

    alphanumeric(message = '只能包含字母和數字') {
        const alphanumericRegex = /^[a-zA-Z0-9]+$/;
        return this.pattern(alphanumericRegex, message);
    }

    username(message = '用戶名只能包含字母、數字、下劃線和連字符') {
        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        return this.pattern(usernameRegex, message);
    }

    noWhitespace(message = '不能包含空格') {
        if (this.value && /\s/.test(this.value)) {
            this.addError(message);
        }
        return this;
    }

    noSpecialChars(message = '不能包含特殊字符') {
        const specialCharsRegex = /[!@#$%^&*(),.?":{}|<>]/;
        if (this.value && specialCharsRegex.test(this.value)) {
            this.addError(message);
        }
        return this;
    }

    equals(compareValue, message = '兩次輸入不一致') {
        if (this.value !== compareValue) {
            this.addError(message);
        }
        return this;
    }

    contains(substring, message = `必須包含 "${substring}"`) {
        if (this.value && !this.value.includes(substring)) {
            this.addError(message);
        }
        return this;
    }

    startsWith(prefix, message = `必須以 "${prefix}" 開頭`) {
        if (this.value && !this.value.startsWith(prefix)) {
            this.addError(message);
        }
        return this;
    }

    endsWith(suffix, message = `必須以 "${suffix}" 結尾`) {
        if (this.value && !this.value.endsWith(suffix)) {
            this.addError(message);
        }
        return this;
    }

    oneOf(allowedValues, message = '請選擇有效的選項') {
        if (this.value && !allowedValues.includes(this.value)) {
            this.addError(message);
        }
        return this;
    }
}

// 數字驗證器
class NumberValidator extends BaseValidator {
    required(message = '此欄位為必填') {
        if (this.value === null || this.value === undefined || this.value === '') {
            this.addError(message);
        }
        return this;
    }

    min(minValue, message = `最小值為 ${minValue}`) {
        if (this.value !== null && this.value !== undefined && Number(this.value) < minValue) {
            this.addError(message);
        }
        return this;
    }

    max(maxValue, message = `最大值為 ${maxValue}`) {
        if (this.value !== null && this.value !== undefined && Number(this.value) > maxValue) {
            this.addError(message);
        }
        return this;
    }

    range(minValue, maxValue, message = `值必須在 ${minValue} 到 ${maxValue} 之間`) {
        const numValue = Number(this.value);
        if (this.value !== null && this.value !== undefined && (numValue < minValue || numValue > maxValue)) {
            this.addError(message);
        }
        return this;
    }

    integer(message = '必須是整數') {
        if (this.value !== null && this.value !== undefined && !Number.isInteger(Number(this.value))) {
            this.addError(message);
        }
        return this;
    }

    positive(message = '必須是正數') {
        if (this.value !== null && this.value !== undefined && Number(this.value) <= 0) {
            this.addError(message);
        }
        return this;
    }

    negative(message = '必須是負數') {
        if (this.value !== null && this.value !== undefined && Number(this.value) >= 0) {
            this.addError(message);
        }
        return this;
    }

    divisibleBy(divisor, message = `必須能被 ${divisor} 整除`) {
        if (this.value !== null && this.value !== undefined && Number(this.value) % divisor !== 0) {
            this.addError(message);
        }
        return this;
    }
}

// 密碼驗證器
class PasswordValidator extends StringValidator {
    strong(message = '密碼強度不夠') {
        if (!this.value) return this;

        const requirements = {
            length: this.value.length >= 8,
            lowercase: /[a-z]/.test(this.value),
            uppercase: /[A-Z]/.test(this.value),
            number: /\d/.test(this.value),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(this.value)
        };

        const metRequirements = Object.values(requirements).filter(Boolean).length;

        if (metRequirements < 4) {
            this.addError(message);
        }

        return this;
    }

    medium(message = '密碼至少需要包含大小寫字母和數字') {
        if (!this.value) return this;

        const hasLower = /[a-z]/.test(this.value);
        const hasUpper = /[A-Z]/.test(this.value);
        const hasNumber = /\d/.test(this.value);

        if (!(hasLower && hasUpper && hasNumber)) {
            this.addError(message);
        }

        return this;
    }

    noCommonPasswords(message = '密碼太常見，請選擇更安全的密碼') {
        const commonPasswords = [
            'password', '123456', '123456789', 'qwerty', 'abc123',
            'password123', 'admin', 'letmein', 'welcome', 'monkey'
        ];

        if (this.value && commonPasswords.includes(this.value.toLowerCase())) {
            this.addError(message);
        }

        return this;
    }

    noPersonalInfo(personalInfo = [], message = '密碼不能包含個人資訊') {
        if (!this.value || personalInfo.length === 0) return this;

        const lowerPassword = this.value.toLowerCase();
        const hasPersonalInfo = personalInfo.some(info =>
            info && lowerPassword.includes(info.toLowerCase())
        );

        if (hasPersonalInfo) {
            this.addError(message);
        }

        return this;
    }
}

// 檔案驗證器
class FileValidator extends BaseValidator {
    required(message = '請選擇檔案') {
        if (!this.value || (this.value instanceof FileList && this.value.length === 0)) {
            this.addError(message);
        }
        return this;
    }

    maxSize(maxBytes, message = `檔案大小不能超過 ${this.formatFileSize(maxBytes)}`) {
        if (!this.value) return this;

        const files = this.value instanceof FileList ? Array.from(this.value) : [this.value];

        for (const file of files) {
            if (file.size > maxBytes) {
                this.addError(message);
                break;
            }
        }

        return this;
    }

    minSize(minBytes, message = `檔案大小至少需要 ${this.formatFileSize(minBytes)}`) {
        if (!this.value) return this;

        const files = this.value instanceof FileList ? Array.from(this.value) : [this.value];

        for (const file of files) {
            if (file.size < minBytes) {
                this.addError(message);
                break;
            }
        }

        return this;
    }

    allowedTypes(types, message = '不支援的檔案類型') {
        if (!this.value) return this;

        const files = this.value instanceof FileList ? Array.from(this.value) : [this.value];

        for (const file of files) {
            const isAllowed = types.some(type => {
                if (type.includes('*')) {
                    const baseType = type.replace('/*', '');
                    return file.type.startsWith(baseType);
                }
                if (type.startsWith('.')) {
                    return file.name.toLowerCase().endsWith(type.toLowerCase());
                }
                return file.type === type;
            });

            if (!isAllowed) {
                this.addError(message);
                break;
            }
        }

        return this;
    }

    maxCount(maxFiles, message = `最多只能選擇 ${maxFiles} 個檔案`) {
        if (!this.value) return this;

        const fileCount = this.value instanceof FileList ? this.value.length : 1;

        if (fileCount > maxFiles) {
            this.addError(message);
        }

        return this;
    }

    imageOnly(message = '只能上傳圖片檔案') {
        return this.allowedTypes(['image/*'], message);
    }

    documentOnly(message = '只能上傳文檔檔案') {
        const documentTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ];
        return this.allowedTypes(documentTypes, message);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// 陣列驗證器
class ArrayValidator extends BaseValidator {
    required(message = '至少需要選擇一項') {
        if (!this.value || !Array.isArray(this.value) || this.value.length === 0) {
            this.addError(message);
        }
        return this;
    }

    minLength(length, message = `至少需要 ${length} 項`) {
        if (this.value && Array.isArray(this.value) && this.value.length < length) {
            this.addError(message);
        }
        return this;
    }

    maxLength(length, message = `最多只能 ${length} 項`) {
        if (this.value && Array.isArray(this.value) && this.value.length > length) {
            this.addError(message);
        }
        return this;
    }

    unique(message = '不能有重複項目') {
        if (this.value && Array.isArray(this.value)) {
            const uniqueValues = new Set(this.value);
            if (uniqueValues.size !== this.value.length) {
                this.addError(message);
            }
        }
        return this;
    }

    contains(item, message = `必須包含 "${item}"`) {
        if (this.value && Array.isArray(this.value) && !this.value.includes(item)) {
            this.addError(message);
        }
        return this;
    }
}

// 日期驗證器
class DateValidator extends BaseValidator {
    required(message = '請選擇日期') {
        if (!this.value) {
            this.addError(message);
        }
        return this;
    }

    after(compareDate, message = '日期必須在指定日期之後') {
        if (this.value && new Date(this.value) <= new Date(compareDate)) {
            this.addError(message);
        }
        return this;
    }

    before(compareDate, message = '日期必須在指定日期之前') {
        if (this.value && new Date(this.value) >= new Date(compareDate)) {
            this.addError(message);
        }
        return this;
    }

    between(startDate, endDate, message = '日期必須在指定範圍內') {
        if (this.value) {
            const date = new Date(this.value);
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (date < start || date > end) {
                this.addError(message);
            }
        }
        return this;
    }

    future(message = '日期必須是未來時間') {
        if (this.value && new Date(this.value) <= new Date()) {
            this.addError(message);
        }
        return this;
    }

    past(message = '日期必須是過去時間') {
        if (this.value && new Date(this.value) >= new Date()) {
            this.addError(message);
        }
        return this;
    }

    weekday(message = '只能選擇工作日') {
        if (this.value) {
            const dayOfWeek = new Date(this.value).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) { // 0 = 星期日, 6 = 星期六
                this.addError(message);
            }
        }
        return this;
    }

    weekend(message = '只能選擇週末') {
        if (this.value) {
            const dayOfWeek = new Date(this.value).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                this.addError(message);
            }
        }
        return this;
    }
}

// 複合驗證器 - 用於驗證多個欄位
class FormValidator {
    constructor() {
        this.fields = {};
        this.errors = {};
    }

    field(name, value) {
        this.fields[name] = value;
        return this;
    }

    validate(name, validatorCallback) {
        const value = this.fields[name];
        const validator = this.createValidator(value);

        validatorCallback(validator);

        if (!validator.isValid()) {
            this.errors[name] = validator.getErrors();
        }

        return this;
    }

    validateString(name, validatorCallback) {
        const value = this.fields[name];
        const validator = new StringValidator(value);

        validatorCallback(validator);

        if (!validator.isValid()) {
            this.errors[name] = validator.getErrors();
        }

        return this;
    }

    validateNumber(name, validatorCallback) {
        const value = this.fields[name];
        const validator = new NumberValidator(value);

        validatorCallback(validator);

        if (!validator.isValid()) {
            this.errors[name] = validator.getErrors();
        }

        return this;
    }

    validatePassword(name, validatorCallback) {
        const value = this.fields[name];
        const validator = new PasswordValidator(value);

        validatorCallback(validator);

        if (!validator.isValid()) {
            this.errors[name] = validator.getErrors();
        }

        return this;
    }

    validateFile(name, validatorCallback) {
        const value = this.fields[name];
        const validator = new FileValidator(value);

        validatorCallback(validator);

        if (!validator.isValid()) {
            this.errors[name] = validator.getErrors();
        }

        return this;
    }

    validateArray(name, validatorCallback) {
        const value = this.fields[name];
        const validator = new ArrayValidator(value);

        validatorCallback(validator);

        if (!validator.isValid()) {
            this.errors[name] = validator.getErrors();
        }

        return this;
    }

    validateDate(name, validatorCallback) {
        const value = this.fields[name];
        const validator = new DateValidator(value);

        validatorCallback(validator);

        if (!validator.isValid()) {
            this.errors[name] = validator.getErrors();
        }

        return this;
    }

    custom(name, validatorFunction, message = '驗證失敗') {
        const value = this.fields[name];

        try {
            const isValid = validatorFunction(value, this.fields);
            if (!isValid) {
                if (!this.errors[name]) {
                    this.errors[name] = [];
                }
                this.errors[name].push(message);
            }
        } catch (error) {
            if (!this.errors[name]) {
                this.errors[name] = [];
            }
            this.errors[name].push(error.message || message);
        }

        return this;
    }

    createValidator(value) {
        // 根據值的類型選擇適當的驗證器
        if (typeof value === 'string') {
            return new StringValidator(value);
        } else if (typeof value === 'number') {
            return new NumberValidator(value);
        } else if (Array.isArray(value)) {
            return new ArrayValidator(value);
        } else if (value instanceof File || value instanceof FileList) {
            return new FileValidator(value);
        } else {
            return new BaseValidator(value);
        }
    }

    isValid() {
        return Object.keys(this.errors).length === 0;
    }

    getErrors() {
        return this.errors;
    }

    getFieldErrors(fieldName) {
        return this.errors[fieldName] || [];
    }

    getFirstError(fieldName) {
        const fieldErrors = this.getFieldErrors(fieldName);
        return fieldErrors[0] || null;
    }

    getAllErrors() {
        const allErrors = [];
        Object.values(this.errors).forEach(fieldErrors => {
            allErrors.push(...fieldErrors);
        });
        return allErrors;
    }

    reset() {
        this.fields = {};
        this.errors = {};
        return this;
    }
}

// 便捷函數
const validate = {
    string: (value) => new StringValidator(value),
    number: (value) => new NumberValidator(value),
    password: (value) => new PasswordValidator(value),
    file: (value) => new FileValidator(value),
    array: (value) => new ArrayValidator(value),
    date: (value) => new DateValidator(value),
    form: () => new FormValidator()
};

// 預定義的驗證規則
const rules = {
    required: (message) => (validator) => validator.required(message),
    email: (message) => (validator) => validator.email(message),
    minLength: (length, message) => (validator) => validator.minLength(length, message),
    maxLength: (length, message) => (validator) => validator.maxLength(length, message),
    min: (value, message) => (validator) => validator.min(value, message),
    max: (value, message) => (validator) => validator.max(value, message),
    pattern: (regex, message) => (validator) => validator.pattern(regex, message)
};

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BaseValidator,
        StringValidator,
        NumberValidator,
        PasswordValidator,
        FileValidator,
        ArrayValidator,
        DateValidator,
        FormValidator,
        validate,
        rules
    };
} else {
    window.BaseValidator = BaseValidator;
    window.StringValidator = StringValidator;
    window.NumberValidator = NumberValidator;
    window.PasswordValidator = PasswordValidator;
    window.FileValidator = FileValidator;
    window.ArrayValidator = ArrayValidator;
    window.DateValidator = DateValidator;
    window.FormValidator = FormValidator;
    window.validate = validate;
    window.rules = rules;
}