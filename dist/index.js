"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const TRANSACTION_PATHS = new Set([
    '/',
    '/register',
    '/kcbmpesa',
    '/stkpush',
    '/stk-push',
    '/api/transactions',
    '/api/mpesa/stk-push',
    '/monthlycontributions',
    '/loans_repayment',
    '/fines',
    '/sharecapital',
    '/wallet',
    '/savings',
]);
const CATEGORY_BY_PATH = {
    '/': 'transaction',
    '/register': 'registration',
    '/kcbmpesa': 'mpesa_stk',
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
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'content-type': 'application/json; charset=utf-8',
        ...headers,
    },
});
const corsHeaders = (request, env) => {
    const origin = request.headers.get('origin') || '*';
    const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((item) => item.trim()).filter(Boolean);
    const allowOrigin = allowed.includes('*') || allowed.includes(origin) ? origin : allowed[0] || '*';
    return {
        'access-control-allow-origin': allowOrigin,
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'Content-Type,Authorization,X-API-Key,ngrok-skip-browser-warning',
    };
};
const mpesaConfig = (env) => {
    const environment = (env.MPESA_ENVIRONMENT || 'sandbox').toLowerCase();
    return MPESA_ENDPOINTS[environment] || MPESA_ENDPOINTS.sandbox;
};
const serviceKey = (env) => env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || '';
const formatPhone = (phone) => {
    let value = String(phone || '').replace(/\D/g, '');
    if (value.startsWith('0'))
        value = `254${value.slice(1)}`;
    if (value.startsWith('7') && value.length === 9)
        value = `254${value}`;
    if (!value.startsWith('254') || value.length !== 12) {
        throw new Error('Invalid phone number. Must be 254XXXXXXXXX');
    }
    return value;
};
const timestamp = () => {
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
};
const callbackUrl = (request, env, override) => {
    if (override)
        return override;
    if (env.MPESA_CALLBACK_URL)
        return env.MPESA_CALLBACK_URL;
    if (env.WORKER_BASE_URL)
        return `${env.WORKER_BASE_URL.replace(/\/$/, '')}/callback`;
    return `${new URL(request.url).origin}/callback`;
};
async function getToken(env) {
    if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET) {
        throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET');
    }
    const mpesa = mpesaConfig(env);
    const credentials = btoa(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`);
    const response = await fetch(`${mpesa.baseUrl}${mpesa.oauthPath}`, {
        headers: { authorization: `Basic ${credentials}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
        throw new Error(data.errorMessage || data.error_description || 'Failed to obtain M-Pesa access token');
    }
    return data.access_token;
}
async function stkPush(env, params) {
    const token = await getToken(env);
    const mpesa = mpesaConfig(env);
    const time = timestamp();
    const shortCode = env.MPESA_BUSINESS_SHORT_CODE || '174379';
    const password = btoa(`${shortCode}${env.MPESA_PASSKEY}${time}`);
    const payload = {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: time,
        TransactionType: params.transactionType || env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
        Amount: params.amount,
        PartyA: params.phoneNumber,
        PartyB: params.partyB || shortCode,
        PhoneNumber: params.phoneNumber,
        CallBackURL: params.callbackUrl,
        AccountReference: params.accountReference,
        TransactionDesc: params.description,
    };
    const response = await fetch(`${mpesa.baseUrl}${mpesa.stkPushPath}`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        return { ...data, ResponseCode: data.ResponseCode || String(response.status) };
    return data;
}
async function supabaseFetch(env, path, init) {
    const key = serviceKey(env);
    if (!env.SUPABASE_URL || !key)
        throw new Error('Missing Supabase URL or service key');
    return fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            prefer: 'return=representation',
            ...(init.headers || {}),
        },
    });
}
async function insertTransaction(env, transaction) {
    const response = await supabaseFetch(env, 'Transactions', {
        method: 'POST',
        body: JSON.stringify(transaction),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
        throw new Error(data?.message || data?.hint || 'Supabase transaction insert failed');
    return Array.isArray(data) ? data[0] : data;
}
async function findTransactionByReference(env, reference) {
    const value = encodeURIComponent(reference);
    const response = await supabaseFetch(env, `Transactions?select=id,reference,internalReference&or=(reference.eq.${value},internalReference.eq.${value})&limit=1`, {
        method: 'GET',
    });
    const data = await response.json().catch(() => []);
    if (!response.ok)
        throw new Error(data?.message || data?.hint || 'Supabase transaction lookup failed');
    return Array.isArray(data) ? data[0] : null;
}
async function updateTransaction(env, matchValue, updates) {
    const value = encodeURIComponent(matchValue);
    const response = await supabaseFetch(env, `Transactions?or=(reference.eq.${value},internalReference.eq.${value})`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { prefer: 'return=minimal' },
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error('Supabase callback update error', data);
    }
}
async function createTransaction(request, env, path, headers) {
    if (env.API_KEY_FOR_BACKEND) {
        const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
        if (apiKey !== env.API_KEY_FOR_BACKEND)
            return json({ error: 'Unauthorized' }, 401, headers);
    }
    const body = await request.json().catch(() => ({}));
    const category = CATEGORY_BY_PATH[path] || 'transaction';
    const phone = body.phone || body.phoneNumber || body.PhoneNumber || body.PartyA;
    const amount = Number(body.amount || body.Amount);
    if (!phone || body.amount === undefined && body.Amount === undefined) {
        return json({ error: 'Missing phone or amount' }, 400, headers);
    }
    let formattedPhone = '';
    try {
        formattedPhone = formatPhone(phone);
    }
    catch (error) {
        return json({ error: error.message }, 400, headers);
    }
    if (!Number.isInteger(amount) || amount <= 0) {
        return json({ error: 'Amount must be a positive integer' }, 400, headers);
    }
    const accountReference = body.accountReference || body.internalReference || `AYEDOSSACCO-${category.slice(0, 6)}-${Date.now().toString().slice(-6)}`;
    const description = body.transactionDesc || body.description || category.slice(0, 13);
    const existingReference = await findTransactionByReference(env, accountReference);
    if (existingReference) {
        return json({ error: 'Duplicate transaction reference', reference: accountReference }, 409, headers);
    }
    const result = await stkPush(env, {
        phoneNumber: formattedPhone,
        amount,
        accountReference,
        callbackUrl: callbackUrl(request, env, body.callbackUrl || body.CallBackURL),
        description,
        transactionType: body.transactionType,
        partyB: body.partyB,
    });
    if (result.ResponseCode !== '0') {
        return json({ error: result.CustomerMessage || result.ResponseDescription || 'STK Push failed', mpesa: result }, 400, headers);
    }
    const reference = result.CheckoutRequestID || result.MerchantRequestID || body.reference || accountReference;
    const now = new Date().toISOString();
    const transaction = await insertTransaction(env, {
        id: crypto.randomUUID(),
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
        createdAt: now,
        updatedAt: now,
    });
    return json({
        success: true,
        merchantRequestId: result.MerchantRequestID,
        checkoutRequestId: result.CheckoutRequestID,
        accountReference,
        category,
        message: result.CustomerMessage || 'STK Push sent successfully',
        transaction,
        mpesa: result,
    }, 200, headers);
}
const metadataValue = (items = [], name) => items.find((item) => item.Name === name)?.Value;
async function callback(request, env, headers) {
    try {
        const raw = await request.json().catch(() => ({}));
        console.log('M-Pesa callback received', raw);
        const stk = raw?.Body?.stkCallback || raw?.stkCallback || raw?.result || raw;
        if (stk) {
            const success = Number(stk.ResultCode) === 0;
            const items = stk.CallbackMetadata?.Item || [];
            const updates = {
                status: success ? 'SUCCESS' : 'FAILED',
                description: stk.ResultDesc,
            };
            const receipt = metadataValue(items, 'MpesaReceiptNumber');
            const amount = metadataValue(items, 'Amount');
            if (receipt)
                updates.reference = receipt;
            if (amount)
                updates.amount = Number(amount);
            const matchValue = stk.CheckoutRequestID || stk.MerchantRequestID;
            if (matchValue)
                await updateTransaction(env, matchValue, updates);
        }
    }
    catch (error) {
        console.error('Callback exception', error.message);
    }
    return json({ ResultCode: 0, ResultDesc: 'Accepted' }, 200, headers);
}
exports.default = {
    async fetch(request, env) {
        const headers = corsHeaders(request, env);
        if (request.method === 'OPTIONS')
            return new Response(null, { status: 204, headers });
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, '') || '/';
        try {
            if (request.method === 'GET' && path === '/') {
                return json({
                    service: 'mpesa-stk',
                    routes: {
                        transactions: 'POST /api/transactions',
                        stkPush: 'POST /api/mpesa/stk-push',
                        kcbCompatible: 'POST /kcbmpesa',
                        callback: 'POST /callback',
                    },
                }, 200, headers);
            }
            if (request.method === 'GET' && path === '/health')
                return json({ success: true, service: 'mpesa-stk' }, 200, headers);
            if (request.method === 'GET' && path === '/test-auth') {
                const token = await getToken(env);
                return json({ success: true, token_preview: `${token.slice(0, 20)}...` }, 200, headers);
            }
            if (request.method === 'GET' && path === '/callback-test') {
                return json({ status: 'OK', message: 'Callback endpoint is reachable', timestamp: new Date().toISOString() }, 200, headers);
            }
            if (request.method === 'POST' && (path === '/callback' || path === '/api/mpesa/callback'))
                return callback(request, env, headers);
            if (request.method === 'POST' && TRANSACTION_PATHS.has(path))
                return createTransaction(request, env, path, headers);
            return json({ error: 'Not found' }, 404, headers);
        }
        catch (error) {
            console.error(error);
            return json({ error: error.message || 'Internal server error' }, 500, headers);
        }
    },
};
