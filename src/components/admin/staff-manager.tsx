"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import {
  createStaffAction,
  deleteStaffAction,
  setStaffActiveAction,
  updateStaffAction,
} from "@/app/r/[restaurantSlug]/admin/(dashboard)/staff/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ROLE_LABELS, isBranchRole } from "@/server/auth/permissions";
import type { TeamRole } from "@/shared/contract/enums";
import type { TeamMember } from "@/shared/contract/models";

/** What the signed-in member may do on this screen. Only shapes the UI — services/team.ts re-checks all of it. */
interface StaffRules {
  assignableRoles: TeamRole[];
  branches: { id: string; name: string }[];
  /** a branch manager: every hire goes to this branch, no picker */
  lockedBranchId: string | null;
  /** owner/admin: the branch chosen in the header, preselected for a new hire */
  defaultBranchId: string | null;
}

function StaffEditForm({
  member,
  isSelf = false,
  rules,
  onCancel,
}: {
  member?: TeamMember;
  /** your own row: name and phone only */
  isSelf?: boolean;
  rules: StaffRules;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState(member?.email ?? "");
  const [fullName, setFullName] = useState(member?.fullName ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [role, setRole] = useState<TeamRole>(member?.role ?? rules.assignableRoles.at(-1) ?? "staff");
  const [locationId, setLocationId] = useState<string>(
    rules.lockedBranchId ?? member?.locationId ?? rules.defaultBranchId ?? rules.branches[0]?.id ?? "",
  );
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const roleOptions = isSelf && member ? [member.role] : rules.assignableRoles;
  const needsBranch = isBranchRole(role) && rules.branches.length > 0;
  const fixedBranch = Boolean(rules.lockedBranchId) || isSelf;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    const branch = needsBranch ? locationId || null : null;
    startTransition(() => {
      const request = member
        ? updateStaffAction(
            isSelf ? { id: member.id, fullName, phone, role: member.role } : { id: member.id, fullName, phone, role, locationId: branch },
          )
        : createStaffAction({ email, fullName, phone, role, locationId: branch, password });
      request.then((result) => {
        if (!result.success) {
          if (result.error.details) {
            setErrors(Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)])));
          }
          toast.error(result.error.message, { duration: member ? undefined : 12000 });
          return;
        }
        toast.success(member ? "Staff member updated." : "Staff account created.");
        router.refresh();
        onCancel();
      });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 surface-flat p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="staffEmail">Email</Label>
          <Input
            id="staffEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={Boolean(member)}
            required
          />
          <FieldError>{errors.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="staffName">Full name</Label>
          <Input id="staffName" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          <FieldError>{errors.fullName}</FieldError>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="staffPhone">Phone (optional)</Label>
          <Input id="staffPhone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="staffRole">Role</Label>
          <Select id="staffRole" value={role} onChange={(event) => setRole(event.target.value as TeamRole)} disabled={isSelf}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          {isSelf ? <p className="mt-1 text-xs text-[var(--color-muted-ink)]">You can&apos;t change your own role or branch.</p> : null}
        </div>
      </div>
      {needsBranch ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="staffBranch">Branch</Label>
            {fixedBranch ? (
              <Input
                id="staffBranch"
                value={rules.branches.find((branch) => branch.id === (rules.lockedBranchId ?? locationId))?.name ?? "—"}
                disabled
              />
            ) : (
              <Select id="staffBranch" value={locationId} onChange={(event) => setLocationId(event.target.value)} required>
                {rules.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            )}
            <FieldError>{errors.locationId}</FieldError>
          </div>
        </div>
      ) : null}
      {!member ? (
        <div>
          <Label htmlFor="staffPassword">Temporary password</Label>
          <Input
            id="staffPassword"
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters — share it with them directly"
            required
            minLength={8}
          />
          <p className="mt-1 text-xs text-[var(--color-muted-ink)]">If this email already has a staff login, it keeps its existing password.</p>
          <FieldError>{errors.password}</FieldError>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="size-4" aria-hidden />
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {member ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}

export function StaffManager({
  members,
  canManage,
  currentUserId,
  manageableIds,
  assignableRoles,
  branches,
  branchNames,
  lockedBranchId,
  defaultBranchId,
}: StaffRules & {
  members: TeamMember[];
  canManage: boolean;
  currentUserId: string;
  /** members the signed-in member may edit/disable/remove (not their own row) */
  manageableIds: string[];
  /** every branch's name, for the badges */
  branchNames: Record<string, string>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const rules: StaffRules = { assignableRoles, branches, lockedBranchId, defaultBranchId };
  const multiBranch = Object.keys(branchNames).length > 1;

  function toggleActive(member: TeamMember) {
    setBusyId(member.id);
    startTransition(() => {
      setStaffActiveAction(member.id, !member.isActive).then((result) => {
        setBusyId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success(member.isActive ? "Staff member disabled." : "Staff member enabled.");
        router.refresh();
      });
    });
  }

  async function handleDelete(member: TeamMember) {
    if (!(await confirm({ title: `Remove ${member.fullName}?`, variant: "danger", confirmLabel: "Remove" }))) return;
    setBusyId(member.id);
    startTransition(() => {
      deleteStaffAction(member.id).then((result) => {
        setBusyId(null);
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success("Staff member removed.");
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-2">
      {dialog}
      {members.map((member) => {
        const isSelf = member.userId === currentUserId;
        const manageable = manageableIds.includes(member.id);
        const branchName = member.locationId ? branchNames[member.locationId] : null;
        return editingId === member.id ? (
          <StaffEditForm key={member.id} member={member} isSelf={isSelf} rules={rules} onCancel={() => setEditingId(null)} />
        ) : (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 surface-flat px-3.5 py-2.5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{member.fullName}</span>
                <Badge variant="soft">{ROLE_LABELS[member.role]}</Badge>
                {multiBranch ? (
                  branchName ? (
                    <Badge variant="neutral">{branchName}</Badge>
                  ) : isBranchRole(member.role) ? (
                    <Badge variant="warning">No branch</Badge>
                  ) : (
                    <Badge variant="neutral">All branches</Badge>
                  )
                ) : null}
                {!member.isActive ? <Badge variant="neutral">Disabled</Badge> : null}
                {isSelf ? <Badge variant="info">You</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted-ink)]">
                {member.email}
                {member.phone ? ` · ${member.phone}` : ""}
              </p>
            </div>
            {canManage && (manageable || isSelf) ? (
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditingId(member.id)} aria-label="Edit staff member">
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleActive(member)}
                  disabled={busyId === member.id || isSelf}
                  aria-label={member.isActive ? "Disable staff member" : "Enable staff member"}
                  title={isSelf ? "You can't disable your own account" : member.isActive ? "Disable" : "Enable"}
                >
                  {busyId === member.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Power className={member.isActive ? "size-4 text-[var(--color-danger)]" : "size-4 text-[var(--color-success)]"} aria-hidden />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(member)}
                  disabled={busyId === member.id || isSelf}
                  aria-label="Remove staff member"
                  title={isSelf ? "You can't remove your own account" : "Remove"}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}

      {canManage && assignableRoles.length > 0 ? (
        adding ? (
          <StaffEditForm rules={rules} onCancel={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add staff
          </Button>
        )
      ) : null}
    </div>
  );
}
