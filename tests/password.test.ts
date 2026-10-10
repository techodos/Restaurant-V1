import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { fitsPasswordLimit, hashPassword, verifyPassword } from "@/server/auth/password";

describe("passwords: one format (bcrypt) whoever creates the login", () => {
  it("hashes as bcrypt and verifies it", async () => {
    const stored = await hashPassword("temp/1234");
    expect(stored).toMatch(/^\$2[ab]\$10\$/);
    expect(await verifyPassword("temp/1234", stored)).toBe(true);
    expect(await verifyPassword("temp/12345", stored)).toBe(false);
  });

  it("verifies Supabase Auth's own hashes ($2a$, staff created through the Auth Admin API)", async () => {
    const stored = bcrypt.hashSync("temp/123", 10).replace(/^\$2b\$/, "$2a$");
    expect(await verifyPassword("temp/123", stored)).toBe(true);
    expect(await verifyPassword("Temp/123", stored)).toBe(false);
  });

  it("refuses empty, old scrypt and broken hashes", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("temp/1234", "scrypt$16384$8$1$00$00")).toBe(false);
    expect(await verifyPassword("x", "$2a$10$broken")).toBe(false);
  });

  it("refuses passwords bcrypt would silently cut (over 72 bytes)", async () => {
    expect(fitsPasswordLimit("a".repeat(72))).toBe(true);
    expect(fitsPasswordLimit("a".repeat(73))).toBe(false);
    expect(fitsPasswordLimit("ب".repeat(37))).toBe(false); // 2 bytes each in UTF-8
    await expect(hashPassword("a".repeat(73))).rejects.toThrow();
  });
});
