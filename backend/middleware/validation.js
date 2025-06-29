const { validationResult } = require('express-validator');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const logger = require('../utils/logger');

class ValidationMiddleware {
    // 處理驗證錯誤
    static handleValidationErrors(req, res, next) {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            const errorMessages = errors.array().map(error => ({
                field: error.path || error.param || error.location,
                message: error.msg,
                value: error.value
            }));

            logger.warn('Validation failed', {
                errors: errorMessages,
                path: req.path,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: '數據驗證失敗',
                code: ERROR_CODES.VALIDATION_ERROR,
                details: errorMessages
            });
        }

        next();
    }

    // 清理請求體
    static sanitizeBody(req, res, next) {
        if (req.body && typeof req.body === 'object') {
            for (const key in req.body) {
                if (typeof req.body[key] === 'string') {
                    // 移除前後空格
                    req.body[key] = req.body[key].trim();

                    // 如果是空字符串，轉換為 null
                    if (req.body[key] === '') {
                        req.body[key] = null;
                    }
                }
            }
        }
        next();
    }

    // 檢查內容類型
    static checkContentType(expectedType = 'application/json') {
        return (req, res, next) => {
            if (req.method === 'GET' || req.method === 'DELETE') {
                return next();
            }

            const contentType = req.get('Content-Type');
            if (!contentType || !contentType.includes(expectedType)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: `Expected Content-Type: ${expectedType}`,
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            next();
        };
    }

    // 檢查請求大小
    static checkRequestSize(maxSize = 1024 * 1024) { // 1MB
        return (req, res, next) => {
            const contentLength = parseInt(req.get('Content-Length') || '0');

            if (contentLength > maxSize) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '請求體過大',
                    code: ERROR_CODES.VALIDATION_ERROR,
                    maxSize: maxSize
                });
            }

            next();
        };
    }

    // 驗證 UUID 格式
    static validateUUID(paramName) {
        return (req, res, next) => {
            const uuid = req.params[paramName];
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

            if (!uuidRegex.test(uuid)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: `無效的 ${paramName} 格式`,
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            next();
        };
    }

    // 驗證分頁參數
    static validatePagination(req, res, next) {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        if (page < 1) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: '頁碼必須大於 0',
                code: ERROR_CODES.VALIDATION_ERROR
            });
        }

        if (limit < 1 || limit > 100) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: '每頁數量必須在 1-100 之間',
                code: ERROR_CODES.VALIDATION_ERROR
            });
        }

        req.pagination = {
            page,
            limit,
            offset: (page - 1) * limit
        };

        next();
    }

    // 驗證排序參數
    static validateSort(allowedFields = []) {
        return (req, res, next) => {
            const sort = req.query.sort;
            const order = req.query.order || 'asc';

            if (sort && !allowedFields.includes(sort)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: `無效的排序字段: ${sort}`,
                    code: ERROR_CODES.VALIDATION_ERROR,
                    allowedFields
                });
            }

            if (order && !['asc', 'desc'].includes(order.toLowerCase())) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    error: '排序方向必須是 asc 或 desc',
                    code: ERROR_CODES.VALIDATION_ERROR
                });
            }

            req.sort = {
                field: sort,
                order: order.toLowerCase()
            };

            next();
        };
    }

    // 自定義驗證器
    static custom(validatorFn, errorMessage = '驗證失敗') {
        return async (req, res, next) => {
            try {
                const isValid = await validatorFn(req);
                if (!isValid) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        error: errorMessage,
                        code: ERROR_CODES.VALIDATION_ERROR
                    });
                }
                next();
            } catch (error) {
                logger.error('Custom validation error', {
                    error: error.message,
                    path: req.path
                });

                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    error: '驗證過程中發生錯誤',
                    code: ERROR_CODES.INTERNAL_ERROR
                });
            }
        };
    }
}

module.exports = ValidationMiddleware;