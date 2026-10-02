import { config } from "@/server/config";
import { errors } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Supabase Auth Admin API — the one way this app can create a new `auth.users` row on hosted
 * Supabase. The Postgres roles the app normally connects as (`app_service`/`app_runtime`) have no
 * real INSERT grant on `auth.users` there (only `supabase_auth_admin`/GoTrue does — confirmed by a
 * live test, see SKILL.md section 17/23 and DECISIONS.md section 26); this calls GoTrue's own HTTP
 * API instead of SQL, authenticated with the project's service-role key (`config.storage.supabase`,
 * the same `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` pair Storage already uses — no
 * new secret). `fetch` only, no `@supabase/supabase-js` dependency, matching the hand-rolled
 * convention `integrations/fcm.ts`/`integrations/google.ts` already use.
 *
 * Local/plain Postgres (no `config.storage.supabase`) never needs this: the app's own `auth` schema
 * shim there grants `app_service` real privileges, so the plain SQL `insert into auth.users` in
 * `repositories/team.ts#createTeamMember` already works and this function is never called.
 */

export function supabaseAuthAdminAvailable(): boolean {
  return config.storage.supabase !== null;
}

interface CreateSupabaseAuthUserInput {
  email: string;
  password: string;
  name: string;
}

/** Returns the new `auth.users.id`. Throws a clean, user-safe AppError — never the raw Supabase response. */
export async function createSupabaseAuthUser(input: CreateSupabaseAuthUserInput): Promise<string> {
  const supabase = config.storage.supabase;
  if (!supabase) throw errors.internal("Supabase Auth Admin is not configured.");

  const response = await fetch(`${supabase.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabase.serviceRoleKey}`,
      apikey: supabase.serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error("db", `supabase admin user create failed (${response.status})`, body);
    if (response.status === 422 || /already.*registered|already exists/i.test(body)) {
      throw errors.conflict("An account with this email already exists.");
    }
    throw errors.internal("Could not create the login. Please try again.");
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) throw errors.internal("Could not create the login. Please try again.");
  return data.id;
}
