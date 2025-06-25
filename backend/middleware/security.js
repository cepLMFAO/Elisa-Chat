const helmet = require('helmet');
const crypto = require('crypto');
const { config, isProduction } = require('../config/environment');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');

class SecurityMiddleware {
    // Helmet 安全頭配置
    static helmetConfig = helmet({
        // 內容安全策略
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
                mediaSrc: ["'self'", 'blob:'],
                connectSrc: ["'self'", 'ws:', 'wss:'],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"]
            },
            reportOnly: !isProduction
        },

        // 跨域嵌入保護
        crossOriginEmbedderPolicy: false,

        // DNS 預取控制
        dnsPrefetchControl: {
            allow: false
        },

        // 預期 CT
        expectCt: {
            maxAge: 86400,
            enforce: isProduction
        },

        // 功能策略
        permittedCrossDomainPolicies: false,

        // 隱藏 X-Powered-By
        hidePoweredBy: true,

        // HSTS（僅生產環境）
        hsts: isProduction ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        } : false,

        // IE 無嗅探
        noSniff: true,

        // 引用者策略
        referrerPolicy: {
            policy: "strict-origin-when-cross-origin"
        },

        // XSS 過濾
        xssFilter: true
    });

    // CSRF 保護
    static csrfProtection(req, res, next) {
        // 跳過 GET、HEAD、OPTIONS 請求
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }

        // 跳過 WebSocket 升級請求
        if (req.headers.upgrade === 'websocket') {
            return next();
        }

        // 檢查 CSRF token
        const token = req.headers['x-csrf-token'] || req.body._csrf;
        const sessionToken = req.session?.csrfToken;

        if (!token || !sessionToken || token !== sessionToken) {
            logger.security('CSRF token validation failed', {
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                providedToken: token ? 'present' : 'missing',
                sessionToken: sessionToken ? 'present' : 'missing'
            });

            return res.status(HTTP_STATUS.FORBIDDEN).json({
                success: false,
                error: 'CSRF token validation failed',
                code: ERROR_CODES.ACCESS_DENIED
            });
        }

        next();
    }

    // 生成 CSRF token
    static generateCsrfToken(req, res, next) {
        if (!req.session) {
            return next();
        }

        if (!req.session.csrfToken) {
            req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        }

        // 將 token 添加到響應頭
        res.setHeader('X-CSRF-Token', req.session.csrfToken);
        next();
    }

    // IP 白名單檢查
    static ipWhitelist(whitelist = []) {
        return (req, res, next) => {
            if (whitelist.length === 0) {
                return next();
            }

            const clientIp = req.ip || req.connection.remoteAddress;

            if (!whitelist.includes(clientIp)) {
                logger.security('IP whitelist violation', {
                    ip: clientIp,
                    path: req.path,
                    method: req.method,
                    whitelist
                });

                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: 'Access denied from this IP address',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            next();
        };
    }

    // IP 黑名單檢查
    static ipBlacklist(blacklist = []) {
        return (req, res, next) => {
            const clientIp = req.ip || req.connection.remoteAddress;

            if (blacklist.includes(clientIp)) {
                logger.security('IP blacklist violation', {
                    ip: clientIp,
                    path: req.path,
                    method: req.method
                });

                return res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    error: 'Access denied',
                    code: ERROR_CODES.ACCESS_DENIED
                });
            }

            next();
        };
    }

    // 惡意請求檢測
    static maliciousRequestDetection(req, res, next) {
        const suspiciousPatterns = [
            /(\<script\>)/gi,
            /(javascript:)/gi,
            /(\<iframe)/gi,
            /(eval\()/gi,
            /(union.*select)/gi,
            /(drop.*table)/gi,
            /(insert.*into)/gi,
            /(delete.*from)/gi,
            /(\.\.\/)|\.\.\\/gi,
            /(etc\/passwd)/gi,
            /(cmd\.exe)/gi
        ];

        // 檢查 URL
        for (const pattern of suspiciousPatterns) {
            if (pattern.test(req.url)) {
                logger.security('Malicious URL detected', {
                    url: req.url,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });

                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Malicious request detected',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }
        }

        // 檢查請求體
        if (req.body && typeof req.body === 'object') {
            const bodyString = JSON.stringify(req.body);
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(bodyString)) {
                    logger.security('Malicious payload detected', {
                        path: req.path,
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        bodySize: bodyString.length
                    });

                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        error: 'Malicious payload detected',
                        code: ERROR_CODES.VALIDATION_ERROR
                    });
                }
            }
        }

        next();
    }

    // SQL 注入檢測
    static sqlInjectionDetection(req, res, next) {
        const sqlPatterns = [
            /(\bunion\b.*\bselect\b)/gi,
            /(\bselect\b.*\bfrom\b)/gi,
            /(\binsert\b.*\binto\b)/gi,
            /(\bdelete\b.*\bfrom\b)/gi,
            /(\bdrop\b.*\btable\b)/gi,
            /(\balter\b.*\btable\b)/gi,
            /(\bexec\b|\bexecute\b)/gi,
            /(\bor\b.*=.*)/gi,
            /(\band\b.*=.*)/gi,
            /(\'.*(\bor\b|\band\b).*\')/gi
        ];

        const checkString = (str) => {
            return sqlPatterns.some(pattern => pattern.test(str));
        };

        // 檢查查詢參數
        for (const [key, value] of Object.entries(req.query || {})) {
            if (typeof value === 'string' && checkString(value)) {
                logger.security('SQL injection attempt in query', {
                    parameter: key,
                    value,
                    ip: req.ip,
                    path: req.path
                });

                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Invalid request parameters',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }
        }

        // 檢查請求體
        if (req.body && typeof req.body === 'object') {
            const bodyString = JSON.stringify(req.body);
            if (checkString(bodyString)) {
                logger.security('SQL injection attempt in body', {
                    ip: req.ip,
                    path: req.path,
                    bodySize: bodyString.length
                });

                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Invalid request payload',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }
        }

        next();
    }

    // XSS 保護
    static xssProtection(req, res, next) {
        const xssPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<img[^>]+src[^>]*>/gi
        ];

        const sanitize = (obj) => {
            if (typeof obj === 'string') {
                for (const pattern of xssPatterns) {
                    if (pattern.test(obj)) {
                        logger.security('XSS attempt detected', {
                            content: obj.substring(0, 200),
                            ip: req.ip,
                            path: req.path
                        });

                        return null; // 標記為惡意內容
                    }
                }
                return obj;
            }

            if (typeof obj === 'object' && obj !== null) {
                for (const key in obj) {
                    const sanitized = sanitize(obj[key]);
                    if (sanitized === null) {
                        return null;
                    }
                    obj[key] = sanitized;
                }
            }

            return obj;
        };

        // 檢查請求體
        if (req.body) {
            const sanitized = sanitize({ ...req.body });
            if (sanitized === null) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Potentially malicious content detected',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }
            req.body = sanitized;
        }

        next();
    }

    // 檔案上傳安全檢查
    static fileUploadSecurity(req, res, next) {
        if (!req.files || !Array.isArray(req.files)) {
            return next();
        }

        const dangerousExtensions = [
            '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js',
            '.jar', '.php', '.asp', '.aspx', '.jsp', '.sh', '.py', '.rb'
        ];

        for (const file of req.files) {
            // 檢查文件擴展名
            const ext = path.extname(file.originalname).toLowerCase();
            if (dangerousExtensions.includes(ext)) {
                logger.security('Dangerous file upload attempt', {
                    filename: file.originalname,
                    mimetype: file.mimetype,
                    size: file.size,
                    ip: req.ip,
                    userId: req.user?.userId
                });

                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'File type not allowed',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            // 檢查 MIME 類型與擴展名是否匹配
            const mimeExtMap = {
                'image/jpeg': ['.jpg', '.jpeg'],
                'image/png': ['.png'],
                'image/gif': ['.gif'],
                'image/webp': ['.webp'],
                'text/plain': ['.txt'],
                'application/pdf': ['.pdf']
            };

            if (mimeExtMap[file.mimetype] &&
                !mimeExtMap[file.mimetype].includes(ext)) {
                logger.security('MIME type and extension mismatch', {
                    filename: file.originalname,
                    mimetype: file.mimetype,
                    extension: ext,
                    ip: req.ip,
                    userId: req.user?.userId
                });

                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'File type validation failed',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }
        }

        next();
    }

    // 請求大小限制
    static requestSizeLimit(maxSize = 10 * 1024 * 1024) { // 默認 10MB
        return (req, res, next) => {
            const contentLength = parseInt(req.get('content-length')) || 0;

            if (contentLength > maxSize) {
                logger.security('Request size limit exceeded', {
                    contentLength,
                    maxSize,
                    ip: req.ip,
                    path: req.path
                });

                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: 'Request size too large',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            next();
        };
    }

    // 安全頭設置
    static securityHeaders(req, res, next) {
        // 防止點擊劫持
        res.setHeader('X-Frame-Options', 'DENY');

        // 防止 MIME 類型嗅探
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // XSS 保護
        res.setHeader('X-XSS-Protection', '1; mode=block');

        // 引用者策略
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

        // 權限策略
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        // 在生產環境中設置 HSTS
        if (isProduction) {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }

        next();
    }

    // 綜合安全中間件
    static comprehensive() {
        return [
            SecurityMiddleware.helmetConfig,
            SecurityMiddleware.securityHeaders,
            SecurityMiddleware.maliciousRequestDetection,
            SecurityMiddleware.sqlInjectionDetection,
            SecurityMiddleware.xssProtection,
            SecurityMiddleware.requestSizeLimit()
        ];
    }
}

module.exports = SecurityMiddleware;