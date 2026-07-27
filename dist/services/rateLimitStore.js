"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = rateLimit;
const store = new Map();
async function rateLimit(key, max, windowSeconds) {
    const now = Date.now();
    const current = store.get(key);
    if (!current || current.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        return true;
    }
    if (current.count >= max)
        return false;
    current.count += 1;
    store.set(key, current);
    return true;
}
