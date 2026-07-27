"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./middleware/logger");
const rateLimit_1 = require("./middleware/rateLimit");
const security_1 = require("./middleware/security");
const routes = __importStar(require("./routes"));
const callback_1 = __importDefault(require("./routes/callback"));
const app = (0, express_1.default)();
app.set('trust proxy', true);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || env_1.env.ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    methods: ['POST', 'OPTIONS', 'GET'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'ngrok-skip-browser-warning'],
}));
app.use(logger_1.httpLogger);
app.use(security_1.whitelistIpAndGeo);
app.use(rateLimit_1.ipLimiter);
app.use((0, express_1.json)({ limit: '10mb' }));
app.use((0, express_1.urlencoded)({ extended: true }));
app.get('/', routes.info);
app.post('/', routes.root);
app.get('/health', routes.health);
app.get('/test-auth', routes.testAuth);
app.post('/api/transactions', routes.createTransaction);
app.post('/api/mpesa/stk-push', routes.createTransaction);
app.post('/stk-push', routes.createTransaction);
app.post('/stkpush', routes.createTransaction);
app.post('/monthlycontributions', routes.createTransaction);
app.post('/loans_repayment', routes.createTransaction);
app.post('/fines', routes.createTransaction);
app.post('/sharecapital', routes.createTransaction);
app.post('/wallet', routes.createTransaction);
app.post('/savings', routes.createTransaction);
app.post('/api/mpesa/callback', callback_1.default);
app.post('/callback', callback_1.default);
app.get('/callback-test', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Callback endpoint is reachable',
        timestamp: new Date().toISOString(),
    });
});
app.use(errorHandler_1.errorHandler);
app.listen(env_1.env.PORT, () => {
    console.log(`M-Pesa STK server running on port ${env_1.env.PORT}`);
});
