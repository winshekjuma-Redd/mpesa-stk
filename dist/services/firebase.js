"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTransactionByReference = exports.insertTransaction = exports.findTransactionByReference = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const tokenCache = {};
const base64Url = (value) => Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const getAccessToken = async () => {
    if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now() + 60000) {
        return tokenCache.token;
    }
    if (!env_1.env.FIREBASE_PROJECT_ID || !env_1.env.FIREBASE_CLIENT_EMAIL || !env_1.env.FIREBASE_PRIVATE_KEY) {
        throw new Error('Missing Firebase service account credentials');
    }
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64Url(JSON.stringify({
        iss: env_1.env.FIREBASE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    }));
    const unsignedJwt = `${header}.${claim}`;
    const signature = crypto_1.default.sign('RSA-SHA256', Buffer.from(unsignedJwt), env_1.env.FIREBASE_PRIVATE_KEY);
    const assertion = `${unsignedJwt}.${base64Url(signature)}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
        throw new Error(data.error_description || data.error || 'Failed to authenticate with Firebase');
    }
    tokenCache.token = data.access_token;
    tokenCache.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    return tokenCache.token;
};
const firestoreBaseUrl = () => `https://firestore.googleapis.com/v1/projects/${env_1.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const documentIdFromName = (name) => name?.split('/').pop();
const decodeValue = (value) => {
    if (!value || typeof value !== 'object')
        return value;
    if ('nullValue' in value)
        return null;
    if ('stringValue' in value)
        return value.stringValue;
    if ('integerValue' in value)
        return Number(value.integerValue);
    if ('doubleValue' in value)
        return Number(value.doubleValue);
    if ('booleanValue' in value)
        return Boolean(value.booleanValue);
    if ('timestampValue' in value)
        return value.timestampValue;
    if ('arrayValue' in value)
        return (value.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in value)
        return decodeFields(value.mapValue.fields || {});
    return value;
};
const encodeValue = (value) => {
    if (value === null || typeof value === 'undefined')
        return { nullValue: null };
    if (typeof value === 'boolean')
        return { booleanValue: value };
    if (typeof value === 'number')
        return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (Array.isArray(value))
        return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === 'object')
        return { mapValue: { fields: encodeFields(value) } };
    return { stringValue: String(value) };
};
const decodeFields = (fields) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
const encodeFields = (data) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));
const decodeDocument = (document) => {
    if (!document)
        return null;
    const data = decodeFields(document.fields || {});
    return { id: data.id || documentIdFromName(document.name), ...data };
};
const firebaseRequest = async (path, init = {}) => {
    const token = await getAccessToken();
    const response = await fetch(`${firestoreBaseUrl()}${path}`, {
        ...init,
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            ...(init.headers || {}),
        },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(data.error?.message || 'Firestore request failed');
    return data;
};
const runQuery = async (field, value, extraFilters = {}) => {
    const filters = [
        { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeValue(value) } },
        ...Object.entries(extraFilters).map(([key, item]) => ({
            fieldFilter: { field: { fieldPath: key }, op: 'EQUAL', value: encodeValue(item) },
        })),
    ];
    const data = await firebaseRequest(':runQuery', {
        method: 'POST',
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: env_1.env.FIRESTORE_TRANSACTIONS_COLLECTION }],
                where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } },
                limit: 1,
            },
        }),
    });
    return decodeDocument(data.find((entry) => entry.document)?.document);
};
const findTransactionByReference = async (reference) => await runQuery('reference', reference) || await runQuery('internalReference', reference);
exports.findTransactionByReference = findTransactionByReference;
const insertTransaction = async (transaction) => {
    await firebaseRequest(`/${env_1.env.FIRESTORE_TRANSACTIONS_COLLECTION}?documentId=${encodeURIComponent(transaction.id)}`, {
        method: 'POST',
        body: JSON.stringify({ fields: encodeFields(transaction) }),
    });
    return transaction;
};
exports.insertTransaction = insertTransaction;
const updateTransactionByReference = async (matchValue, updates) => {
    const transaction = await (0, exports.findTransactionByReference)(matchValue);
    if (!transaction?.id)
        return null;
    const updateMask = Object.keys(updates).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
    const data = await firebaseRequest(`/${env_1.env.FIRESTORE_TRANSACTIONS_COLLECTION}/${encodeURIComponent(transaction.id)}?${updateMask}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: encodeFields(updates) }),
    });
    return decodeDocument(data);
};
exports.updateTransactionByReference = updateTransactionByReference;
