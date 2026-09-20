import { randomBytes } from "node:crypto";
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { mapTeamMember, str, type Row } from "@/server/db/mappers";
import type { TeamMember } from "@/shared/contract/models";
import type { TeamRole } from "@/shared/contract/enums";
import { hashPassword } from "@/server/auth/password";
import { errors } from "@/server/errors";

export async function listTeamMembers(restaurantId: string, ctx: RequestContext): Promise<TeamMember[]> {
  const rows = await getDb({ restaurantId }).query<Row>(
    { ...ctx, restaurantId },
    `select * from team_members where restaurant_id = $1 order by is_active desc, created_at`,
    [restaurantId],
  );
  return rows.map(mapTeamMember);
}

export async function getTeamMemberByUserId(userId: string, ctx: RequestContext = {}): Promise<TeamMember | null> {
  const row = await getDb(ctx).queryOne<Row>(
    ctx,
    `select * from team_members where user_id = $1 and is_active order by created_at limit 1`,
    [userId],
  );
  return row ? mapTeamMember(row) : null;
}

export async function getTeamMemberByEmail(
  restaurantId: string,
  email: string,
  ctx: RequestContext = {},
): Promise<TeamMember | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(
    ctx,
    `select * from team_members where restaurant_id = $1 and lower(email) = lower($2) limit 1`,
    [restaurantId, email],
  );
  return row ? mapTeamMember(row) : null;
}

export interface TeamMemberInput {
  email: string;
  fullName: string;
  phone?: string | null;
  role: TeamRole;
  locationId?: string | null;
  permissions?: { allow?: string[]; deny?: string[] };
  isActive?: boolean;
  /** when provided, an auth user is created/updated with this password */
  password?: string;
}

export async function createTeamMember(
  restaurantId: string,
  input: TeamMemberInput,
  ctx: RequestContext,
): Promise<TeamMember> {
  const db = getDb({ restaurantId });
  const email = input.email.trim().toLowerCase();
  return db.write({ ...ctx, restaurantId }, async (tx) => {
    const existingUser = await tx.queryOne<Row>(`select id from auth.users where lower(email) = $1`, [email]);
    let userId = existingUser ? str(existingUser.id) : null;

    if (!userId) {
      const password = input.password ?? randomBytes(12).toString("base64url");
      const row = await tx.queryOne<Row>(
        `insert into auth.users (email, encrypted_password, raw_user_meta_data)
         values ($1,$2, jsonb_build_object('name', $3::text))
         returning id`,
        [email, await hashPassword(password), input.fullName],
      );
      userId = row ? str(row.id) : null;
    } else if (input.password) {
      await tx.query(`update auth.users set encrypted_password = $2 where id = $1`, [
        userId,
        await hashPassword(input.password),
      ]);
    }
    if (!userId) throw errors.internal("Unable to create the staff account");

    const row = await tx.queryOne<Row>(
      `insert into team_members
         (restaurant_id, user_id, location_id, email, full_name, phone, role, permissions, is_active, accepted_at)
       values ($1,$2,$3,$4,$5,$6,$7::team_role, coalesce($8::jsonb,'{}'::jsonb), coalesce($9,true), now())
       on conflict (restaurant_id, email) do update set
         user_id = excluded.user_id,
         full_name = excluded.full_name,
         phone = excluded.phone,
         role = excluded.role,
         permissions = excluded.permissions,
         is_active = excluded.is_active,
         accepted_at = now()
       returning *`,
      [
        restaurantId, userId, input.locationId ?? null, email, input.fullName, input.phone ?? null,
        input.role, input.permissions ? JSON.stringify(input.permissions) : null, input.isActive ?? null,
      ],
    );
    if (!row) throw errors.internal("Unable to create the team member");
    return mapTeamMember(row);
  });
}

export async function updateTeamMember(
  memberId: string,
  patch: Partial<Omit<TeamMemberInput, "email" | "password">>,
  ctx: RequestContext,
): Promise<TeamMember> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update team_members set
         full_name = coalesce($2, full_name),
         phone = coalesce($3, phone),
         role = coalesce($4::team_role, role),
         location_id = coalesce($5, location_id),
         permissions = coalesce($6::jsonb, permissions),
         is_active = coalesce($7, is_active)
       where id = $1 returning *`,
      [
        memberId, patch.fullName ?? null, patch.phone ?? null, patch.role ?? null, patch.locationId ?? null,
        patch.permissions ? JSON.stringify(patch.permissions) : null, patch.isActive ?? null,
      ],
    );
    if (!row) throw errors.notFound("Team member");
    return mapTeamMember(row);
  });
}

export async function setTeamMemberActive(memberId: string, isActive: boolean, ctx: RequestContext): Promise<void> {
  const db = getDb(ctx);
  await db.write(ctx, async (tx) => {
    // never leave a restaurant without an active owner
    const member = await tx.queryOne<Row>(`select restaurant_id, role from team_members where id = $1`, [memberId]);
    if (!member) throw errors.notFound("Team member");
    if (!isActive && str(member.role) === "owner") {
      const owners = await tx.queryCount(
        `select count(*) from team_members where restaurant_id = $1 and role = 'owner' and is_active and id <> $2`,
        [str(member.restaurant_id), memberId],
      );
      if (owners === 0) throw errors.conflict("A restaurant must keep at least one active owner.");
    }
    await tx.query(`update team_members set is_active = $2 where id = $1`, [memberId, isActive]);
  });
}

export async function deleteTeamMember(memberId: string, ctx: RequestContext): Promise<void> {
  const db = getDb(ctx);
  await db.write(ctx, async (tx) => {
    const member = await tx.queryOne<Row>(`select role from team_members where id = $1`, [memberId]);
    if (!member) throw errors.notFound("Team member");
    if (str(member.role) === "owner") throw errors.conflict("The owner account cannot be deleted.");
    await tx.query(`delete from team_members where id = $1`, [memberId]);
  });
}

/** Restaurants the current user can administer (used by the admin switcher). */
export async function listMemberRestaurants(userId: string, ctx: RequestContext = {}): Promise<{ restaurantId: string; role: TeamRole }[]> {
  const rows = await getDb(ctx).query<Row>(
    { ...ctx, userId },
    `select restaurant_id, role from team_members where user_id = $1 and is_active order by created_at`,
    [userId],
  );
  return rows.map((row) => ({ restaurantId: str(row.restaurant_id), role: str(row.role) as TeamRole }));
}
