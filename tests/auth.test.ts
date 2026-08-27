import { afterEach, describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  DEFAULT_ADMIN_PASSWORD,
  hasValidAdminSession,
  isCorrectAdminPassword,
  verifyAdminSessionToken,
} from "@/lib/auth";

const originalPassword = process.env.ADMIN_PASSWORD;
const originalSecret = process.env.ADMIN_SESSION_SECRET;
const environment = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalPassword === undefined) delete environment.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete environment.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalSecret;
});

describe("admin password", () => {
  it("uses the documented default and compares it correctly", () => {
    delete environment.ADMIN_PASSWORD;
    expect(DEFAULT_ADMIN_PASSWORD).toBe("majonéz");
    expect(isCorrectAdminPassword("majonéz")).toBe(true);
    expect(isCorrectAdminPassword("majon ez")).toBe(false);
  });

  it("honors an explicitly configured password", () => {
    process.env.ADMIN_PASSWORD = "a different passphrase";
    expect(isCorrectAdminPassword("a different passphrase")).toBe(true);
    expect(isCorrectAdminPassword("majonéz")).toBe(false);
  });
});

describe("signed admin session", () => {
  it("accepts a valid cookie and rejects tampering", () => {
    process.env.ADMIN_SESSION_SECRET = "test-only-session-secret";
    const token = createAdminSessionToken();
    const request = new Request("http://localhost/api/profiles", {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
    });

    expect(verifyAdminSessionToken(token)).toBe(true);
    expect(hasValidAdminSession(request)).toBe(true);

    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifyAdminSessionToken(tampered)).toBe(false);
  });

  it("rejects an expired token", () => {
    process.env.ADMIN_SESSION_SECRET = "test-only-session-secret";
    const issuedAt = Math.floor(Date.now() / 1000) - 5 * 60 * 60;
    const token = createAdminSessionToken(issuedAt);
    expect(verifyAdminSessionToken(token)).toBe(false);
  });
});
