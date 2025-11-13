import crypto from 'crypto';
import secrets from 'secrets.js-grempe';

// AES-256-GCM encryption
export function encryptBuffer(buffer) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, ciphertext]);
  return { key, payload };
}

export function decryptBuffer(payload, key) {
  const iv = payload.slice(0, 12);
  const tag = payload.slice(12, 28);
  const ciphertext = payload.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function splitKey(keyBuffer, total = 3, threshold = 3) {
  const hex = keyBuffer.toString('hex');
  const shares = secrets.share(secrets.str2hex(hex), total, threshold);
  return shares;
}

export function combineShares(shares) {
  const hex = secrets.combine(shares);
  const keyHex = secrets.hex2str(hex);
  return Buffer.from(keyHex, 'hex');
}
