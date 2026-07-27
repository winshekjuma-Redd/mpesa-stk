"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getToken = getToken;
exports.stkPush = stkPush;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const logger_1 = require("../middleware/logger");
const helpers_1 = require("../utils/helpers");
const MPESA_ENDPOINTS = {
    sandbox: {
        baseUrl: 'https://sandbox.safaricom.co.ke',
        oauthPath: '/oauth/v1/generate?grant_type=client_credentials',
        stkPushPath: '/mpesa/stkpush/v1/processrequest',
    },
    production: {
        baseUrl: 'https://api.safaricom.co.ke',
        oauthPath: '/oauth/v1/generate?grant_type=client_credentials',
        stkPushPath: '/mpesa/stkpush/v1/processrequest',
    },
};
const getMpesaConfig = () => MPESA_ENDPOINTS[env_1.env.MPESA_ENVIRONMENT] || MPESA_ENDPOINTS.sandbox;
async function getToken() {
    if (!env_1.env.MPESA_CONSUMER_KEY || !env_1.env.MPESA_CONSUMER_SECRET) {
        throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET');
    }
    const mpesa = getMpesaConfig();
    const credentials = Buffer.from(`${env_1.env.MPESA_CONSUMER_KEY}:${env_1.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    try {
        const response = await axios_1.default.get(`${mpesa.baseUrl}${mpesa.oauthPath}`, {
            headers: { Authorization: `Basic ${credentials}` },
        });
        return response.data.access_token;
    }
    catch (error) {
        const detail = error.response?.data || error.message;
        logger_1.logger.error('Token fetch failed', { detail });
        throw new Error('Failed to obtain M-Pesa access token');
    }
}
async function stkPush(params) {
    const token = await getToken();
    const mpesa = getMpesaConfig();
    const timestamp = (0, helpers_1.getTimestamp)();
    const password = Buffer.from(`${env_1.env.MPESA_BUSINESS_SHORT_CODE}${env_1.env.MPESA_PASSKEY}${timestamp}`).toString('base64');
    const payload = {
        BusinessShortCode: env_1.env.MPESA_BUSINESS_SHORT_CODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: params.transactionType || env_1.env.MPESA_TRANSACTION_TYPE,
        Amount: params.amount,
        PartyA: params.phoneNumber,
        PartyB: params.partyB || env_1.env.MPESA_BUSINESS_SHORT_CODE,
        PhoneNumber: params.phoneNumber,
        CallBackURL: params.callbackUrl,
        AccountReference: params.accountReference,
        TransactionDesc: params.description,
    };
    const response = await axios_1.default.post(`${mpesa.baseUrl}${mpesa.stkPushPath}`, payload, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    return response.data;
}
