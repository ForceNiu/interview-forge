import { test, expect, beforeEach, afterEach } from '@jest/globals';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto';

const SECRET = 'a'.repeat(64); // 64 位 hex = 32 字节，满足 AES-256 密钥长度

beforeEach(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.API_KEY_ENCRYPTION_SECRET;
});

test('encrypt → decrypt 可还原明文，密文为 iv:authTag:ciphertext 三段', () => {
  const enc = encryptApiKey('sk-abc-123');
  expect(enc).not.toBe('sk-abc-123');
  expect(enc.split(':')).toHaveLength(3);
  expect(decryptApiKey(enc)).toBe('sk-abc-123');
});

test('密钥不对时解密返回 null（防篡改/过期）', () => {
  const enc = encryptApiKey('sk-abc-123');
  process.env.API_KEY_ENCRYPTION_SECRET = 'b'.repeat(64);
  expect(decryptApiKey(enc)).toBeNull();
});

test('密文格式损坏时解密返回 null', () => {
  expect(decryptApiKey('broken')).toBeNull();
  expect(decryptApiKey('')).toBeNull();
});

test('未配置密钥时 encrypt 抛错', () => {
  delete process.env.API_KEY_ENCRYPTION_SECRET;
  expect(() => encryptApiKey('x')).toThrow();
});
