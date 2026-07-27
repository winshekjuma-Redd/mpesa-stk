import { env } from '../config/env';

export function pathToCategory(path: string): string {
  const map: Record<string, string> = {
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

export function formatPhone(phone: string): string {
  let value = String(phone || '').replace(/\D/g, '');
  if (value.startsWith('0')) value = `254${value.slice(1)}`;
  if (value.startsWith('7') && value.length === 9) value = `254${value}`;
  if (!value.startsWith('254') || value.length !== 12) {
    throw new Error('Invalid phone number. Must be 254XXXXXXXXX');
  }
  return value;
}

export function getTimestamp(): string {
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
}

export function getCallbackUrl(override?: string): string {
  if (override) return override;
  if (env.MPESA_CALLBACK_URL) return env.MPESA_CALLBACK_URL;
  if (env.BACKEND_BASE_URL) return `${env.BACKEND_BASE_URL.replace(/\/$/, '')}/api/mpesa/callback`;
  return '';
}
