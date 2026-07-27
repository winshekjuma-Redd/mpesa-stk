import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const whitelistIpAndGeo = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.get('x-api-key');
  if (env.API_KEY_FOR_BACKEND && apiKey === env.API_KEY_FOR_BACKEND) return next();

  const origin = req.get('origin');
  if (origin && !env.ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const ip = req.ip || req.socket.remoteAddress || '';
  const country = String(req.headers['cf-ipcountry'] || '').toUpperCase();

  if (env.ALLOWED_IPS.length && !env.ALLOWED_IPS.includes(ip)) {
    return res.status(403).json({ error: 'IP not allowed' });
  }

  if (env.ALLOWED_COUNTRIES.length && (!country || !env.ALLOWED_COUNTRIES.includes(country))) {
    return res.status(403).json({ error: 'Country not allowed' });
  }

  next();
};
