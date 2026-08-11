import { Request, Response } from 'express';
import crypto from 'crypto';
import { findTransactionByReference, insertTransaction } from '../services/firebase';
import { getToken, stkPush } from '../services/mpesa';
import { formatPhone, getCallbackUrl, pathToCategory } from '../utils/helpers';
import { rateLimit } from '../services/rateLimitStore';
import { logger } from '../middleware/logger';

const shortApplicationCode = (value: unknown) => {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '');
  if (digits) return digits.slice(-5);
  let hash = 0;
  for (const char of raw) hash = ((hash * 31) + char.charCodeAt(0)) % 100000;
  return String(hash || 1).padStart(5, '0');
};

const isRegistrationPayment = (body: any, category: string) => {
  const tokens = [
    body?.paymentCategory,
    body?.category,
    body?.type,
    body?.transactionType,
    category,
  ].map((item) => String(item || '').toLowerCase());
  return Boolean(body?.applicationId || tokens.some((token) => token.includes('registration') || token.includes('membership')));
};

const resolveAccountReference = (body: any, category: string) => {
  if (isRegistrationPayment(body, category) && body?.applicationId) {
    return `AYEDOSSACCO-${shortApplicationCode(body.applicationId)}`;
  }
  return body.accountReference || body.member_number || body.memberNumber || body.internalReference || `AYEDOSSACCO-${category.slice(0, 6)}-${Date.now().toString().slice(-6)}`;
};

export const createTransaction = async (req: Request, res: Response) => {
  try {
    const category = pathToCategory(req.path);
    const body = req.body || {};
    const phone = body.phone || body.phoneNumber || body.PhoneNumber || body.PartyA;
    const amount = Number(body.amount || body.Amount || 1);

    if (!phone || body.amount === undefined && body.Amount === undefined) {
      return res.status(400).json({ error: 'Missing phone or amount' });
    }

    let formattedPhone: string;
    try {
      formattedPhone = formatPhone(phone);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive integer' });
    }

    const phoneLimitOk = await rateLimit(`phone:${formattedPhone}`, 3, 60);
    if (!phoneLimitOk) {
      return res.status(429).json({ error: 'Too many requests for this phone. Try again in 1 minute.' });
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const ipLimitOk = await rateLimit(`ip:${clientIp}`, 10, 60);
    if (!ipLimitOk) {
      return res.status(429).json({ error: 'Too many requests from this IP.' });
    }

    const accountReference = resolveAccountReference(body, category);
    const uniqueReference = body.internalReference || body.internal_reference || body.reference || `${accountReference}-${Date.now()}`;
    const description = body.transactionDesc || body.description || category.slice(0, 13);
    const callbackUrl = getCallbackUrl(body.callbackUrl || body.CallBackURL);

    if (!callbackUrl) {
      return res.status(500).json({ error: 'Missing callback URL. Set MPESA_CALLBACK_URL or BACKEND_BASE_URL.' });
    }

    const existingReference = await findTransactionByReference(uniqueReference);

    if (existingReference) {
      return res.status(409).json({ error: 'Duplicate transaction reference', reference: uniqueReference });
    }

    const stkResult = await stkPush({
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
    const now = new Date().toISOString();
    const transaction = {
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
    };

    const data = await insertTransaction(transaction);

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
  } catch (err: any) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const testAuth = async (req: Request, res: Response) => {
  try {
    const token = await getToken();
    res.json({ success: true, token_preview: `${token.slice(0, 20)}...` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const health = async (req: Request, res: Response) => {
  res.json({ success: true, service: 'mpesa-stk' });
};

export const info = async (req: Request, res: Response) => {
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

export const root = createTransaction;
