import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../middleware/logger';
import { getTimestamp } from '../utils/helpers';

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

const getMpesaConfig = () => MPESA_ENDPOINTS[env.MPESA_ENVIRONMENT] || MPESA_ENDPOINTS.sandbox;
const MPESA_HTTP_TIMEOUT_MS = Number(process.env.MPESA_HTTP_TIMEOUT_MS || 45000);

export async function getToken(): Promise<string> {
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET) {
    throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET');
  }

  const mpesa = getMpesaConfig();
  const credentials = Buffer.from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`).toString('base64');

  try {
    const response = await axios.get(`${mpesa.baseUrl}${mpesa.oauthPath}`, {
      headers: { Authorization: `Basic ${credentials}` },
      timeout: MPESA_HTTP_TIMEOUT_MS,
    });
    return response.data.access_token;
  } catch (error: any) {
    const detail = error.response?.data || error.message;
    logger.error('Token fetch failed', { detail });
    throw new Error('Failed to obtain M-Pesa access token');
  }
}

interface StkPushParams {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  callbackUrl: string;
  description: string;
  transactionType?: string;
  partyB?: string;
}

export async function stkPush(params: StkPushParams): Promise<any> {
  const token = await getToken();
  const mpesa = getMpesaConfig();
  const timestamp = getTimestamp();
  const password = Buffer.from(`${env.MPESA_BUSINESS_SHORT_CODE}${env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: env.MPESA_BUSINESS_SHORT_CODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: params.transactionType || env.MPESA_TRANSACTION_TYPE,
    Amount: params.amount,
    PartyA: params.phoneNumber,
    PartyB: params.partyB || env.MPESA_BUSINESS_SHORT_CODE,
    PhoneNumber: params.phoneNumber,
    CallBackURL: params.callbackUrl,
    AccountReference: params.accountReference,
    TransactionDesc: params.description,
  };

  try {
    const response = await axios.post(`${mpesa.baseUrl}${mpesa.stkPushPath}`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: MPESA_HTTP_TIMEOUT_MS,
    });

    return response.data;
  } catch (error: any) {
    const detail = error.response?.data || error.message;
    logger.error('STK push failed', { detail, accountReference: params.accountReference });
    if (error.code === 'ECONNABORTED') {
      throw new Error('M-Pesa took too long to accept the phone prompt request');
    }
    throw new Error(error.response?.data?.errorMessage || error.response?.data?.ResponseDescription || 'STK Push failed');
  }
}
