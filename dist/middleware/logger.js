"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
exports.logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console(),
        new winston_1.default.transports.File({ filename: 'logs/combined.log' }),
        new winston_1.default.transports.File({ filename: 'logs/error.log', level: 'error' }),
    ],
});
const httpLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        exports.logger.info({
            type: 'request',
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration_ms: Date.now() - start,
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
            country: req.headers['cf-ipcountry'] || 'unknown',
        });
    });
    next();
};
exports.httpLogger = httpLogger;
