import { afterAll, describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "@/server/notifications/types";
import { BELLA, testDatabase } from "./helpers/db";

/**
 * The real verification and password-reset flows against the test database, with only the email provider faked (it
 * records what would be sent). The code is read back OUT OF THE RENDERED EMAIL, so this proves the redesigned email
 * carries exactly the code the service stored — and that wrong, expired and replaced codes are still refused.
 */
const sent: EmailMessage[] = [];
vi.mock("@/server/services/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/notifications")>()),
  getEmailProvider: () => ({
    async send(message: EmailMessage) {
      sent.push(message);
      return { ok: true as const, id: `fake-${sent.length}` };
    },
  }),
}));

const { signUpCustomer, sendVerificationCode, verifyEmailCode, requestPasswordReset, verifyPasswordResetCode, completePasswordReset } = await import(
  "@/server/services/customer-auth"
);
const { signInCustomer } = await import("@/server/auth/auth-service");

const RESTAURANT = { id: BELLA.restaurantId, name: "Bella Napoli", logoUrl: null, primaryColor: "#c2410c", email: "hello@bella.example", phone: "+92 42 111 000" };
const stamp = Date.now();
const phone = (n: number) => `+92300${String((stamp + n) % 10_000_000).padStart(7, "0")}`;

/** The 6-digit code as it appears in the last email's code block, and in its plain-text part. */
function lastCode(): string {
  const mail = sent.at(-1)!;
  const fromHtml = /font-size:36px[^>]*>(\d{6})<\/p>/.exec(mail.html)?.[1];
  const fromText = /code: (\d{6})/i.exec(mail.text ?? "")?.[1];
  expect(fromHtml, "code in the HTML code block").toBeTruthy();
  expect(fromText).toBe(fromHtml);
  return fromHtml!;
}

afterAll(async () => {
  await testDatabase.end();
});

describe("email verification code, end to end", () => {
  const email = `verify.flow+${stamp}@example.com`;
  let customerId = "";

  it("sends the redesigned email with the stored code; a wrong code is refused, the right one accepted", async () => {
    customerId = (await signUpCustomer(RESTAURANT, { fullName: "Verify Flow", email, phone: phone(1), password: "Correct#Horse1" }, `ip-v-${stamp}`)).customerId;
    await sendVerificationCode(customerId, email, `ip-v-${stamp}`, RESTAURANT);
    const mail = sent.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.subject).toMatch(/^\d{6} is your Bella Napoli verification code$/);
    expect(mail.html).toContain("Verify your email address");
    expect(mail.html).toContain("10 minutes");
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    await expect(verifyEmailCode(customerId, wrong)).rejects.toThrow(/not correct/);
    await expect(verifyEmailCode(customerId, code)).resolves.toBeUndefined();
  });

  it("a resend replaces the old code, and an expired code is refused", async () => {
    await sendVerificationCode(customerId, email, `ip-v2-${stamp}`, RESTAURANT);
    const first = lastCode();
    await sendVerificationCode(customerId, email, `ip-v2-${stamp}`, RESTAURANT);
    const second = lastCode();
    if (first !== second) await expect(verifyEmailCode(customerId, first)).rejects.toThrow(/not correct|expired/);
    await testDatabase.write({ restaurantId: BELLA.restaurantId }, (tx) =>
      tx.query("update email_verification_codes set expires_at = now() - interval '1 minute' where email = $1 and consumed_at is null", [email]),
    );
    await expect(verifyEmailCode(customerId, second)).rejects.toThrow(/expired/);
  });
});

describe("password reset, end to end", () => {
  const email = `reset.flow+${stamp}@example.com`;

  it("emails the redesigned reset code, which then resets the password", async () => {
    await signUpCustomer(RESTAURANT, { fullName: "Reset Flow", email, phone: phone(2), password: "Old#Password1" }, `ip-r-${stamp}`);
    await requestPasswordReset(RESTAURANT, email, `ip-r-${stamp}`);
    const mail = sent.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.subject).toMatch(/^\d{6} is your Bella Napoli password reset code$/);
    expect(mail.html).toContain("Reset your password");
    expect(mail.html).toMatch(/your password stays the same/);
    const code = lastCode();

    await expect(verifyPasswordResetCode(RESTAURANT, email, code === "000000" ? "111111" : "000000", `ip-r-${stamp}`)).rejects.toThrow(/not correct/);
    const token = await verifyPasswordResetCode(RESTAURANT, email, code, `ip-r-${stamp}`);
    await completePasswordReset(RESTAURANT, token, "New#Password2");
    await expect(signInCustomer(email, "Old#Password1", RESTAURANT, `ip-r2-${stamp}`)).rejects.toThrow(/Invalid email or password/);
    await expect(signInCustomer(email, "New#Password2", RESTAURANT, `ip-r2-${stamp}`)).resolves.toMatchObject({ emailVerified: true });
  });

  it("an unknown email gets no email at all (no account enumeration)", async () => {
    const before = sent.length;
    await requestPasswordReset(RESTAURANT, `nobody+${stamp}@example.com`, `ip-r3-${stamp}`);
    expect(sent.length).toBe(before);
  });
});
