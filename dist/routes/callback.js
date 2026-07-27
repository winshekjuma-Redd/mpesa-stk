"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = callback;
const supabase_1 = require("../services/supabase");
const logger_1 = require("../middleware/logger");
async function callback(req, res) {
    try {
        const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        logger_1.logger.info('M-Pesa callback received', { callback: raw });
        const stk = raw?.Body?.stkCallback || raw?.stkCallback || raw?.result || raw;
        if (!stk) {
            return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }
        const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;
        const success = ResultCode === 0;
        const items = CallbackMetadata?.Item || [];
        const receipt = items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value;
        const amount = items.find((item) => item.Name === 'Amount')?.Value;
        const updates = {
            status: success ? 'SUCCESS' : 'FAILED',
            description: ResultDesc,
        };
        if (receipt)
            updates.reference = receipt;
        if (amount)
            updates.amount = Number(amount);
        const matchValue = CheckoutRequestID || MerchantRequestID;
        if (matchValue) {
            const { error } = await supabase_1.supabase
                .from('Transactions')
                .update(updates)
                .or(`reference.eq.${matchValue},internalReference.eq.${matchValue}`);
            if (error)
                logger_1.logger.error('Supabase callback update error', error);
        }
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
    catch (err) {
        logger_1.logger.error('Callback exception', { error: err.message });
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
}
