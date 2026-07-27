"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathToCategory = pathToCategory;
exports.formatPhone = formatPhone;
exports.getTimestamp = getTimestamp;
exports.getCallbackUrl = getCallbackUrl;
const env_1 = require("../config/env");
function pathToCategory(path) {
    const map = {
        '/': 'transaction',
        '/api/transactions': 'transaction',
        '/api/mpesa/stk-push': 'mpesa_stk',
        '/stk-push': 'mpesa_stk',
        '/stkpush': 'stk_push',
        '/monthlycontributions': 'monthly_contribution',
        '/loans_repayment': 'loan_repayment',
        '/fines': 'fine',
        '/sharecapital': 'share_capital',
        '/wallet': 'wallet',
        '/savings': 'savings',
    };
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return map[cleanPath] || 'transaction';
}
function formatPhone(phone) {
    let value = String(phone || '').replace(/\D/g, '');
    if (value.startsWith('0'))
        value = `254${value.slice(1)}`;
    if (value.startsWith('7') && value.length === 9)
        value = `254${value}`;
    if (!value.startsWith('254') || value.length !== 12) {
        throw new Error('Invalid phone number. Must be 254XXXXXXXXX');
    }
    return value;
}
function getTimestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
    ].join('');
}
function getCallbackUrl(override) {
    if (override)
        return override;
    if (env_1.env.MPESA_CALLBACK_URL)
        return env_1.env.MPESA_CALLBACK_URL;
    if (env_1.env.BACKEND_BASE_URL)
        return `${env_1.env.BACKEND_BASE_URL.replace(/\/$/, '')}/api/mpesa/callback`;
    return '';
}
