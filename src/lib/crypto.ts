import crypto from "node:crypto";

// 算法：AES-256-GCM（带认证的对称加密，防篡改）
const ALGORITHM = "aes-256-gcm";
// 密钥长度要求：AES-256 需要 32 字节 → hex 编码后 64 字符
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("API_KEY_ENCRYPTION_SECRET 环境变量未设置");
  }
  const buf = Buffer.from(secret, "hex");
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `API_KEY_ENCRYPTION_SECRET 长度不正确：需要 ${KEY_LENGTH * 2} 位 hex（${KEY_LENGTH} 字节），实际 ${buf.length} 字节`
    );
  }
  return buf;
}

/**
 * 加密用户提供的 API Key
 * 返回格式：iv:authTag:ciphertext（三部分冒号分隔，均为 hex 编码）
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16); // GCM 推荐 12-16 字节
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * 解密从 Cookie 中读取的加密串
 * 输入格式：iv:authTag:ciphertext
 * 如果解密失败（Key 不对 / 数据被篡改），返回 null
 */
export function decryptApiKey(encrypted: string): string | null {
  try {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");

    if (!ivHex || !authTagHex || !ciphertextHex) {
      return null;
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, "hex")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    return null; // 解密失败（Key 过期、数据损坏、篡改）
  }
}
