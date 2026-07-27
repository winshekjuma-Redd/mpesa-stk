"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.root = exports.info = exports.health = exports.testAuth = exports.createTransaction = void 0;
const supabase_1 = require("../services/supabase");
const mpesa_1 = require("../services/mpesa");
const helpers_1 = require("../utils/helpers");
const rateLimitStore_1 = require("../services/rateLimitStore");
const logger_1 = require("../middleware/logger");
const createTransaction = async (req, res) => {
    try {
        const category = (0, helpers_1.pathToCategory)(req.path);
        const body = req.body || {};
        const phone = body.phone || body.phoneNumber || body.PhoneNumber || body.PartyA;
        const amount = Number(body.amount || body.Amount || 1);
        if (!phone || body.amount === undefined && body.Amount === undefined) {
            return res.status(400).json({ error: 'Missing phone or amount' });
        }
        let formattedPhone;
        try {
            formattedPhone = (0, helpers_1.formatPhone)(phone);
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
        if (!Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Amount must be a positive integer' });
        }
        const phoneLimitOk = await (0, rateLimitStore_1.rateLimit)(`phone:${formattedPhone}`, 3, 60);
        if (!phoneLimitOk) {
            return res.status(429).json({ error: 'Too many requests for this phone. Try again in 1 minute.' });
        }
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        const ipLimitOk = await (0, rateLimitStore_1.rateLimit)(`ip:${clientIp}`, 10, 60);
        if (!ipLimitOk) {
            return res.status(429).json({ error: 'Too many requests from this IP.' });
        }
        const accountReference = body.accountReference || body.internalReference || `AYEDOSSACCO-${category.slice(0, 6)}-${Date.now().toString().slice(-6)}`;
        const description = body.transactionDesc || body.description || category.slice(0, 13);
        const callbackUrl = (0, helpers_1.getCallbackUrl)(body.callbackUrl || body.CallBackURL);
        if (!callbackUrl) {
            return res.status(500).json({ error: 'Missing callback URL. Set MPESA_CALLBACK_URL or BACKEND_BASE_URL.' });
        }
        const stkResult = await (0, mpesa_1.stkPush)({
            phoneNumber: formattedPhone,
            amount,
            accountReference,
            callbackUrl,
            description,
            transactionType: body.transactionType,
            partyB: body.partyB,
        });
        if (stkResult.ResponseCode !== '0') {
            return res.status(400).json({ error: stkResult.CustomerMessage || stkResult.ResponseDescription || 'STK Push failed', mpesa: stkResult });
        }
        const reference = stkResult.CheckoutRequestID || stkResult.MerchantRequestID || body.reference || accountReference;
        const transaction = {
            memberId: body.memberId || null,
            loanId: body.loanId || null,
            type: body.type || 'DEPOSIT',
            amount,
            method: body.method || 'MPESA',
            status: body.status || 'PENDING',
            reference,
            description,
            paymentCategory: body.paymentCategory || body.category || category,
            kcbEndpoint: body.kcbEndpoint || 'mpesa-stk',
            internalReference: body.internalReference || accountReference,
            promptChannel: body.promptChannel || 'MPESA_STK',
        };
        const { data, error } = await supabase_1.supabase
            .from('Transactions')
            .insert(transaction)
            .select()
            .single();
        if (error) {
            logger_1.logger.error('Supabase insert error', error);
            return res.status(500).json({ error: error.message, mpesa: stkResult });
        }
        res.json({
            success: true,
            merchantRequestId: stkResult.MerchantRequestID,
            checkoutRequestId: stkResult.CheckoutRequestID,
            accountReference,
            category,
            message: stkResult.CustomerMessage || 'STK Push sent successfully',
            transaction: data,
            mpesa: stkResult,
        });
    }
    catch (err) {
        logger_1.logger.error(err);
        res.status(500).json({ error: err.message });
    }
};
exports.createTransaction = createTransaction;
const testAuth = async (req, res) => {
    try {
        const token = await (0, mpesa_1.getToken)();
        res.json({ success: true, token_preview: `${token.slice(0, 20)}...` });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.testAuth = testAuth;
const health = async (req, res) => {
    res.json({ success: true, service: 'mpesa-stk' });
};
exports.health = health;
const info = async (req, res) => {
    res.json({
        service: 'mpesa-stk',
        routes: {
            transactions: 'POST /api/transactions',
            stkPush: 'POST /api/mpesa/stk-push',
            stkPushAlias: 'POST /stk-push',
            health: 'GET /health',
        },
        backendCallbackPath: '/api/mpesa/callback',
    });
};
exports.info = info;
exports.root = exports.createTransaction;
