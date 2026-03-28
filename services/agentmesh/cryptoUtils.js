const crypto = require('crypto');

/**
 * Computes shared secret using ECDH (secp256k1) from public and private keys.
 * @param {string} publicKeyHex - Uncompressed public key hex (64 bytes = 128 hex chars)
 * @param {string} privateKeyHex - Private key hex (32 bytes = 64 hex chars)
 * @returns {Buffer} Shared secret (32 bytes)
 * @throws {Error} If inputs are invalid hex or wrong length
 */
function computeSecret(publicKeyHex, privateKeyHex) {
  // Validate hex format
  if (!/^[0-9a-fA-F]+$/.test(publicKeyHex)) {
    throw new Error('Invalid public key hex');
  }
  if (!/^[0-9a-fA-F]+$/.test(privateKeyHex)) {
    throw new Error('Invalid private key hex');
  }

  // Convert to buffers  const publicKeyBuf = Buffer.from(publicKeyHex, 'hex');
  const privateKeyBuf = Buffer.from(privateKeyHex, 'hex');

  // Validate key lengths (uncompressed secp256k1)
  if (publicKeyBuf.length !== 64) {
    throw new Error('Public key must be 64 bytes (uncompressed)');
  }
  if (privateKeyBuf.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }

  // ECDH key agreement
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(privateKeyBuf);
  return ecdh.computeSecret(publicKeyBuf);
}

/**
 * Encrypts data using AES-256-GCM.
 * @param {Buffer} data - Data to encrypt
 * @param {Buffer} key - 32-byte encryption key
 * @returns {{iv: string, encryptedData: string, tag: string}} Encryption result
 */
function encrypt(data, key) {
  if (!(key instanceof Buffer) || key.length !== 32) {
    throw new Error('Key must be 32-byte Buffer');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted.toString('hex'),
    tag: cipher.getAuthTag().toString('hex')
  };
}

/**
 * Decrypts data using AES-256-GCM.
 * @param {string} encryptedDataHex - Encrypted data hex
 * @param {string} ivHex - IV hex (24 chars = 12 bytes)
 * @param {string} tagHex - Auth tag hex (32 chars = 16 bytes)
 * @param {Buffer} key - 32-byte decryption key
 * @returns {Buffer} Decrypted data
 * @throws {Error} If inputs are invalid or decryption fails
 */
function decrypt(encryptedDataHex, ivHex, tagHex, key) {
  // Validate hex strings  if (!/^[0-9a-fA-F]+$/.test(encryptedDataHex)) {
    throw new Error('Invalid encrypted data hex');
  }
  if (!/^[0-9a-fA-F]+$/.test(ivHex) || ivHex.length !== 24) {
    throw new Error('Invalid IV hex');
  }
  if (!/^[0-9a-fA-F]+$/.test(tagHex) || tagHex.length !== 32) {
    throw new Error('Invalid auth tag hex');
  }
  if (!(key instanceof Buffer) || key.length !== 32) {
    throw new Error('Key must be 32-byte Buffer');
  }

  // Decrypt
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedData = Buffer.from(encryptedDataHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

module.exports = { computeSecret, encrypt, decrypt };