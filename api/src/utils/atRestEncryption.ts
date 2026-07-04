import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const ENVELOPE_VERSION = "v1";

export interface EncryptedEnvelope {
  __enc: typeof ENVELOPE_VERSION;
  iv: string;
  tag: string;
  data: string;
}

export function calSessionEncryptionConfigured(): boolean {
  return Boolean(process.env.CAL_SESSION_ENCRYPTION_KEY?.trim());
}

function deriveKey(): Buffer {
  const raw = process.env.CAL_SESSION_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("CAL_SESSION_ENCRYPTION_KEY is not set");
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return scryptSync(raw, "cal-session-at-rest", 32);
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as EncryptedEnvelope;
  return (
    envelope.__enc === ENVELOPE_VERSION &&
    typeof envelope.iv === "string" &&
    typeof envelope.tag === "string" &&
    typeof envelope.data === "string"
  );
}

export function encryptJson(value: unknown): EncryptedEnvelope {
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    __enc: ENVELOPE_VERSION,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };
}

export function decryptJson<T>(envelope: EncryptedEnvelope): T {
  const key = deriveKey();
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ciphertext = Buffer.from(envelope.data, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf-8")) as T;
}
