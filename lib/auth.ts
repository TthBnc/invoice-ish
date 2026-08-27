import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "invoice-ish-admin-session";
export const ADMIN_SESSION_TTL_SECONDS = 4 * 60 * 60;
export const DEFAULT_ADMIN_PASSWORD = "majonéz";

class AuthConfigurationError extends Error {
  constructor() {
    super("ADMIN_SESSION_SECRET is not configured");
    this.name = "AuthConfigurationError";
  }
}

function configuredAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.length > 0 ? password : DEFAULT_ADMIN_PASSWORD;
}

function sessionSecret(): string {
  const configuredSecret = process.env.ADMIN_SESSION_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new AuthConfigurationError();
  }

  // This fallback keeps local setup frictionless. Deployments should always set
  // a separate random secret in Vercel (see .env.example).
  return `invoice-ish-development-session:${configuredAdminPassword()}`;
}

function passwordDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Compare fixed-size digests so the password comparison is constant-time. */
export function isCorrectAdminPassword(password: string): boolean {
  const suppliedDigest = passwordDigest(password);
  const configuredDigest = passwordDigest(configuredAdminPassword());
  return timingSafeEqual(suppliedDigest, configuredDigest);
}

function encodePayload(payload: string): string {
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodePayload(payload: string): string {
  return Buffer.from(payload, "base64url").toString("utf8");
}

function sign(encodedPayload: string): Buffer {
  return createHmac("sha256", sessionSecret()).update(encodedPayload, "ascii").digest();
}

export function createAdminSessionToken(now = Math.floor(Date.now() / 1000)): string {
  const payload = encodePayload(
    JSON.stringify({
      v: 1,
      iat: now,
      exp: now + ADMIN_SESSION_TTL_SECONDS,
      nonce: randomBytes(16).toString("hex"),
    }),
  );

  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function verifyAdminSessionToken(token: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!token || token.length > 4096) {
    return false;
  }

  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1 || token.indexOf(".", separator + 1) !== -1) {
    return false;
  }

  const encodedPayload = token.slice(0, separator);
  const encodedSignature = token.slice(separator + 1);

  try {
    const expectedSignature = sign(encodedPayload);
    const suppliedSignature = Buffer.from(encodedSignature, "base64url");

    if (suppliedSignature.length !== expectedSignature.length) {
      return false;
    }

    if (!timingSafeEqual(suppliedSignature, expectedSignature)) {
      return false;
    }

    const payload = JSON.parse(decodePayload(encodedPayload)) as {
      v?: unknown;
      iat?: unknown;
      exp?: unknown;
      nonce?: unknown;
    };

    return (
      payload.v === 1 &&
      typeof payload.iat === "number" &&
      Number.isSafeInteger(payload.iat) &&
      typeof payload.exp === "number" &&
      Number.isSafeInteger(payload.exp) &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 16 &&
      payload.exp > now &&
      payload.iat <= now + 60
    );
  } catch {
    return false;
  }
}

function cookieValue(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }

  for (const chunk of header.split(";")) {
    const separator = chunk.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const name = chunk.slice(0, separator).trim();
    if (name !== ADMIN_SESSION_COOKIE) {
      continue;
    }

    const value = chunk.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function hasValidAdminSession(request: Request): boolean {
  const token = cookieValue(request);
  return token ? verifyAdminSessionToken(token) : false;
}

