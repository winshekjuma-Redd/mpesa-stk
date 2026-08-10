export interface Env {
  MPESA_ENVIRONMENT?: string;
  MPESA_CONSUMER_KEY: string;
  MPESA_CONSUMER_SECRET: string;
  MPESA_BUSINESS_SHORT_CODE: string;
  MPESA_TRANSACTION_TYPE?: string;
  MPESA_PASSKEY: string;
  MPESA_CALLBACK_URL?: string;
  WORKER_BASE_URL?: string;
  BACKEND_BASE_URL?: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  FIRESTORE_TRANSACTIONS_COLLECTION?: string;
  API_KEY_FOR_BACKEND?: string;
  ALLOWED_ORIGINS?: string;
}

let firebaseTokenCache: { token?: string; expiresAt?: number } = {};

const MPESA_ENDPOINTS: Record<string, { baseUrl: string; oauthPath: string; stkPushPath: string }> = {
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

const CATEGORY_BY_PATH: Record<string, string> = {
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

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });

const corsHeaders = (request: Request, env: Env) => {
  const origin = request.headers.get('origin') || '*';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowed.includes('*') || allowed.includes(origin) ? origin : allowed[0] || '*';

  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,Authorization,X-API-Key,ngrok-skip-browser-warning',
  };
};

const mpesaConfig = (env: Env) => {
  const environment = (env.MPESA_ENVIRONMENT || 'sandbox').toLowerCase();
  return MPESA_ENDPOINTS[environment] || MPESA_ENDPOINTS.sandbox;
};

const formatPhone = (phone: unknown) => {
  let value = String(phone || '').replace(/\D/g, '');
  if (value.startsWith('0')) value = `254${value.slice(1)}`;
  if (value.startsWith('7') && value.length === 9) value = `254${value}`;
  if (!value.startsWith('254') || value.length !== 12) {
    throw new Error('Invalid phone number. Must be 254XXXXXXXXX');
  }
  return value;
};

const timestamp = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
};

const callbackUrl = (request: Request, env: Env, override?: string) => {
  if (override) return override;
  if (env.MPESA_CALLBACK_URL) return env.MPESA_CALLBACK_URL;
  if (env.WORKER_BASE_URL) return `${env.WORKER_BASE_URL.replace(/\/$/, '')}/callback`;
  return `${new URL(request.url).origin}/callback`;
};

async function getToken(env: Env) {
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET) {
    throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET');
  }

  const mpesa = mpesaConfig(env);
  const credentials = btoa(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`);
  const response = await fetch(`${mpesa.baseUrl}${mpesa.oauthPath}`, {
    headers: { authorization: `Basic ${credentials}` },
  });

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.errorMessage || data.error_description || 'Failed to obtain M-Pesa access token');
  }

  return data.access_token as string;
}

async function stkPush(env: Env, params: Record<string, any>) {
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

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) return { ...data, ResponseCode: data.ResponseCode || String(response.status) };
  return data;
}

const base64Url = (value: string | ArrayBuffer) => {
  const binary = typeof value === 'string'
    ? value
    : String.fromCharCode(...new Uint8Array(value));
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const pemToArrayBuffer = (pem: string) => {
  const base64 = pem.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
};

async function getFirebaseAccessToken(env: Env) {
  if (firebaseTokenCache.token && firebaseTokenCache.expiresAt && firebaseTokenCache.expiresAt > Date.now() + 60000) {
    return firebaseTokenCache.token;
  }

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Missing Firebase service account credentials');
  }

  const now = Math.floor(Date.now() / 1000);
  const unsignedJwt = [
    base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64Url(JSON.stringify({
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })),
  ].join('.');

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.FIREBASE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedJwt));
  const assertion = `${unsignedJwt}.${base64Url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to authenticate with Firebase');
  }

  firebaseTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return data.access_token as string;
}

const transactionsCollection = (env: Env) => env.FIRESTORE_TRANSACTIONS_COLLECTION || 'Transactions';
const firestoreBaseUrl = (env: Env) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const documentIdFromName = (name?: string) => name?.split('/').pop();

const encodeFirestoreValue = (value: any): any => {
  if (value === null || typeof value === 'undefined') return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFirestoreFields(value) } };
  return { stringValue: String(value) };
};

const decodeFirestoreValue = (value: any): any => {
  if (!value || typeof value !== 'object') return value;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
  return value;
};

const encodeFirestoreFields = (data: Record<string, any>) =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)]));

const decodeFirestoreFields = (fields: Record<string, any>) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));

const decodeFirestoreDocument = (document: any) => {
  if (!document) return null;
  const data = decodeFirestoreFields(document.fields || {});
  return { id: data.id || documentIdFromName(document.name), ...data };
};

async function firestoreRequest(env: Env, path: string, init: RequestInit = {}) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(`${firestoreBaseUrl(env)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Firestore request failed');
  return data;
}

async function runTransactionQuery(env: Env, field: string, value: string) {
  const data = await firestoreRequest(env, ':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: transactionsCollection(env) }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: encodeFirestoreValue(value),
          },
        },
        limit: 1,
      },
    }),
  });

  return decodeFirestoreDocument(data.find((entry: any) => entry.document)?.document);
}

async function insertTransaction(env: Env, transaction: Record<string, any>) {
  await firestoreRequest(env, `/${transactionsCollection(env)}?documentId=${encodeURIComponent(transaction.id)}`, {
    method: 'POST',
    body: JSON.stringify({ fields: encodeFirestoreFields(transaction) }),
  });
  return transaction;
}

async function findTransactionByReference(env: Env, reference: string) {
  return await runTransactionQuery(env, 'reference', reference) || await runTransactionQuery(env, 'internalReference', reference);
}

async function updateTransaction(env: Env, matchValue: string, updates: Record<string, any>) {
  const transaction = await findTransactionByReference(env, matchValue);
  if (!transaction?.id) return;

  const updateMask = Object.keys(updates).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
  await firestoreRequest(env, `/${transactionsCollection(env)}/${encodeURIComponent(transaction.id)}?${updateMask}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encodeFirestoreFields(updates) }),
  });
}

async function createTransaction(request: Request, env: Env, path: string, headers: HeadersInit) {
  if (env.API_KEY_FOR_BACKEND) {
    const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (apiKey !== env.API_KEY_FOR_BACKEND) return json({ error: 'Unauthorized' }, 401, headers);
  }

  const body: any = await request.json().catch(() => ({}));
  const category = CATEGORY_BY_PATH[path] || 'transaction';
  const phone = body.phone || body.phoneNumber || body.PhoneNumber || body.PartyA;
  const amount = Number(body.amount || body.Amount);

  if (!phone || body.amount === undefined && body.Amount === undefined) {
    return json({ error: 'Missing phone or amount' }, 400, headers);
  }

  let formattedPhone = '';
  try {
    formattedPhone = formatPhone(phone);
  } catch (error: any) {
    return json({ error: error.message }, 400, headers);
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return json({ error: 'Amount must be a positive integer' }, 400, headers);
  }

  const accountReference = body.accountReference || body.member_number || body.memberNumber || body.internalReference || `AYEDOSSACCO-${category.slice(0, 6)}-${Date.now().toString().slice(-6)}`;
  const uniqueReference = body.internalReference || body.internal_reference || body.reference || `${accountReference}-${Date.now()}`;
  const description = body.transactionDesc || body.description || category.slice(0, 13);
  const existingReference = await findTransactionByReference(env, uniqueReference);

  if (existingReference) {
    return json({ error: 'Duplicate transaction reference', reference: uniqueReference }, 409, headers);
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
    internalReference: uniqueReference,
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

const metadataValue = (items: any[] = [], name: string) => items.find((item) => item.Name === name)?.Value;

async function callback(request: Request, env: Env, headers: HeadersInit) {
  try {
    const raw: any = await request.json().catch(() => ({}));
    console.log('M-Pesa callback received', raw);

    const stk = raw?.Body?.stkCallback || raw?.stkCallback || raw?.result || raw;
    if (stk) {
      const success = Number(stk.ResultCode) === 0;
      const items = stk.CallbackMetadata?.Item || [];
      const updates: Record<string, any> = {
        status: success ? 'SUCCESS' : 'FAILED',
        description: stk.ResultDesc,
      };
      const receipt = metadataValue(items, 'MpesaReceiptNumber');
      const amount = metadataValue(items, 'Amount');
      if (receipt) updates.reference = receipt;
      if (amount) updates.amount = Number(amount);

      const matchValue = stk.CheckoutRequestID || stk.MerchantRequestID;
      if (matchValue) await updateTransaction(env, matchValue, updates);
    }
  } catch (error: any) {
    console.error('Callback exception', error.message);
  }

  return json({ ResultCode: 0, ResultDesc: 'Accepted' }, 200, headers);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

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
      if (request.method === 'GET' && path === '/health') return json({ success: true, service: 'mpesa-stk' }, 200, headers);
      if (request.method === 'GET' && path === '/test-auth') {
        const token = await getToken(env);
        return json({ success: true, token_preview: `${token.slice(0, 20)}...` }, 200, headers);
      }
      if (request.method === 'GET' && path === '/callback-test') {
        return json({ status: 'OK', message: 'Callback endpoint is reachable', timestamp: new Date().toISOString() }, 200, headers);
      }
      if (request.method === 'POST' && (path === '/callback' || path === '/api/mpesa/callback')) return callback(request, env, headers);
      if (request.method === 'POST' && TRANSACTION_PATHS.has(path)) return createTransaction(request, env, path, headers);

      return json({ error: 'Not found' }, 404, headers);
    } catch (error: any) {
      console.error(error);
      return json({ error: error.message || 'Internal server error' }, 500, headers);
    }
  },
};
