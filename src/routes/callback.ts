import { Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { logger } from '../middleware/logger';

export default async function callback(req: Request, res: Response) {
  try {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    logger.info('M-Pesa callback received', { callback: raw });

    const stk = raw?.Body?.stkCallback || raw?.stkCallback || raw?.result || raw;
    if (!stk) {
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;
    const success = ResultCode === 0;

    const items = CallbackMetadata?.Item || [];
    const receipt = items.find((item: any) => item.Name === 'MpesaReceiptNumber')?.Value;
    const amount = items.find((item: any) => item.Name === 'Amount')?.Value;

    const updates: Record<string, any> = {
      status: success ? 'SUCCESS' : 'FAILED',
      description: ResultDesc,
    };

    if (receipt) updates.reference = receipt;
    if (amount) updates.amount = Number(amount);

    const matchValue = CheckoutRequestID || MerchantRequestID;
    if (matchValue) {
      const { error } = await supabase
        .from('Transactions')
        .update(updates)
        .or(`reference.eq.${matchValue},internalReference.eq.${matchValue}`);

      if (error) logger.error('Supabase callback update error', error);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err: any) {
    logger.error('Callback exception', { error: err.message });
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
}
