import bcrypt from "bcryptjs";

/**
 * Every password in this app is ONE format: bcrypt (`$2a$`/`$2b$`), the same one Supabase Auth writes, so a login made by
 * any path — `scripts/db/create-staff.ts`, the seeds, a customer sign-up or reset, or the Staff screen (which on hosted
 * Supabase creates the login through the Auth Admin API, services/team.ts) — is checked the same way.
 * Unified 2026-10-09: the app used to write `scrypt$…` while Supabase wrote bcrypt, and verifyPassword only knew scrypt, so
 * staff added from the admin could never sign in. All earlier (dummy) logins and customers were deleted then; scrypt
 * hashes are no longer accepted.
 *
 * Cost 10 matches Supabase. bcrypt reads at most 72 bytes, so longer passwords are refused (validation caps them) instead
 * of being silently cut.
 */
const COST = 10;
export const MAX_PASSWORD_BYTES = 72;
const BCRYPT = /^\$2[aby]\$\d{2}\$/;

/** True when `password` fits bcrypt's input (72 bytes in UTF-8). */
export function fitsPasswordLimit(password: string): boolean {
  return Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!fitsPasswordLimit(password)) throw new Error(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`);
  return bcrypt.hash(password, COST);
}

/** The password as typed (no normalisation, like Supabase) against a stored bcrypt hash. Anything else is refused. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !BCRYPT.test(stored)) return false;
  try {
    return await bcrypt.compare(password, stored);
  } catch {
    return false;
  }
}
