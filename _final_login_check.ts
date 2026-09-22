import { signInStaff } from "./src/server/auth/auth-service";

async function check(email: string, password: string) {
  try {
    const r = await signInStaff(email, password, "bella-napoli", "probe");
    console.log("SUCCESS", email, r.member.role);
  } catch (e) {
    console.error("FAILED", email, e instanceof Error ? e.message : e);
  }
}

await check("owner@bellanapoli.pk", "BellaNapoli#1");
await check("usmanazeem00@gmail.com", "Temp/123");
process.exit(0);
