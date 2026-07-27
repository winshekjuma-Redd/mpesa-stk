"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whitelistIpAndGeo = void 0;
const env_1 = require("../config/env");
const whitelistIpAndGeo = (req, res, next) => {
    const apiKey = req.get('x-api-key');
    if (env_1.env.API_KEY_FOR_BACKEND && apiKey === env_1.env.API_KEY_FOR_BACKEND)
        return next();
    const origin = req.get('origin');
    if (origin && !env_1.env.ALLOWED_ORIGINS.includes(origin)) {
        return res.status(403).json({ error: 'Origin not allowed' });
    }
    const ip = req.ip || req.socket.remoteAddress || '';
    const country = String(req.headers['cf-ipcountry'] || '').toUpperCase();
    if (env_1.env.ALLOWED_IPS.length && !env_1.env.ALLOWED_IPS.includes(ip)) {
        return res.status(403).json({ error: 'IP not allowed' });
    }
    if (env_1.env.ALLOWED_COUNTRIES.length && (!country || !env_1.env.ALLOWED_COUNTRIES.includes(country))) {
        return res.status(403).json({ error: 'Country not allowed' });
    }
    next();
};
exports.whitelistIpAndGeo = whitelistIpAndGeo;
