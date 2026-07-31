"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.env = {
    PORT: parseInt(process.env.PORT || '3000', 10),
    MPESA_ENVIRONMENT: (process.env.MPESA_ENVIRONMENT || 'sandbox').toLowerCase(),
    MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    MPESA_BUSINESS_SHORT_CODE: process.env.MPESA_BUSINESS_SHORT_CODE || '174379',
    MPESA_TRANSACTION_TYPE: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
    MPESA_PASSKEY: process.env.MPESA_PASSKEY,
    MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
    BACKEND_BASE_URL: process.env.BACKEND_BASE_URL,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    FIRESTORE_TRANSACTIONS_COLLECTION: process.env.FIRESTORE_TRANSACTIONS_COLLECTION || 'Transactions',
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS ||
        'http://localhost:3000,https://endpoint-unknotted-wind.ngrok-free.dev').split(',').map((s) => s.trim()).filter(Boolean),
    ALLOWED_IPS: process.env.ALLOWED_IPS?.split(',').map((s) => s.trim()).filter(Boolean) || [],
    ALLOWED_COUNTRIES: process.env.ALLOWED_COUNTRIES?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) || [],
    API_KEY_FOR_BACKEND: process.env.API_KEY_FOR_BACKEND,
};
