"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const logger_1 = require("./logger");
const errorHandler = (err, req, res, next) => {
    logger_1.logger.error({ error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
};
exports.errorHandler = errorHandler;
