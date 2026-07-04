// A deliberately simple session scheme for a 5-person shared login:
// the cookie value is "<expiry>.<hmac signature>". No database session
// table needed, no third-party auth provider — just enough to keep the
// dashboard off the open internet.
//
// Uses the Web Crypto API (globalThis.crypto.subtle) rather than Node's
// `crypto` module because this file is imported from middleware.ts,
// which runs on Next.js's Edge runtime — Node built-ins aren't available
// there, but Web Crypto is available in both Edge and Node 18+.

export const SESSION_COOKIE_NAME = "wfm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Missing SESSION_SECRET env var. Generate one with `openssl rand -base64 32`."
    );
  }
  return secret;
}

async function getHmacKey(): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(getSecret());
  return crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(): Promise<string> {
  const expiry = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const key = await getHmacKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(expiry))
  );
  return `${expiry}.${bufferToHex(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const [expiryStr, signatureHex] = token.split(".");
  if (!expiryStr || !signatureHex) return false;

  const expiry = Number(expiryStr);
  if (isNaN(expiry) || Date.now() > expiry) return false;

  try {
    const key = await getHmacKey();
    const expectedSignatureBuf = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(expiryStr)
    );
    const expectedHex = bufferToHex(expectedSignatureBuf);

    // Simple constant-length comparison (both are fixed-length hex digests)
    if (expectedHex.length !== signatureHex.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expectedHex.length; i++) {
      mismatch |= expectedHex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

export function checkCredentials(username: string, password: string): boolean {
  const validUser = process.env.DASHBOARD_USERNAME;
  const validPass = process.env.DASHBOARD_PASSWORD;
  if (!validUser || !validPass) return false;
  return username === validUser && password === validPass;
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
