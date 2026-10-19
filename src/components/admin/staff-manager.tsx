"use client";

import { AdminFormPanel, AdminFormSection, FormToggle } from "@/components/admin/admin-form-panel";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Power, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import {
  createStaffAction,
  deleteStaffAction,
  setStaffActiveAction,
  updateStaffAction,
} from "@/app/admin/(dashboard)/staff/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ROLE_LABELS, isBranchRole } from "@/server/auth/permissions";
import type { TeamRole } from "@/shared/contract/enums";
import type { TeamMember } from "@/shared/contract/models";
import { Avatar, StatusPill, addTileClass } from "@/components/admin/admin-ui";

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
    <AdminFormPanel
      title={member ? `Edit ${member.fullName}` : "Add a staff member"}
      description={member ? member.email : "They sign in at this restaurant's staff portal."}
      icon={UserPlus}
      onSubmit={submit}
      onCancel={onCancel}
      pending={pending}
      submitLabel={member ? "Save" : "Add staff member"}
    >
      <AdminFormSection title="Person" description="Name and how to reach them.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="staffName">Full name</Label>
            <Input id="staffName" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            <FieldError>{errors.fullName}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staffEmail">Work email</Label>
            <Input id="staffEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={Boolean(member)} required />
            {member ? <p className="text-xs text-[var(--color-muted-ink)]">The sign-in email can&apos;t be changed.</p> : null}
            <FieldError>{errors.email}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staffPhone">
              Phone <span className="font-normal text-[var(--color-muted-ink)]">(optional)</span>
            </Label>
            <Input id="staffPhone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </div>
      </AdminFormSection>

      <AdminFormSection title="Access" description="What they can see and change.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="staffRole">Role</Label>
            <Select id="staffRole" value={role} onChange={(event) => setRole(event.target.value as TeamRole)} disabled={isSelf}>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            {isSelf ? <p className="text-xs text-[var(--color-muted-ink)]">You can&apos;t change your own role or branch.</p> : null}
          </div>
          {needsBranch ? (
            <div className="space-y-1.5">
              <Label htmlFor="staffBranch">Branch</Label>
              {fixedBranch ? (
                <Input id="staffBranch" value={rules.branches.find((branch) => branch.id === (rules.lockedBranchId ?? locationId))?.name ?? "—"} disabled />
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
          ) : null}
        </div>
      </AdminFormSection>

      {!member ? (
        <AdminFormSection title="Sign-in" description="Share it with them directly. If this email already has a staff login, it keeps its password.">
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="staffPassword">Temporary password</Label>
            <Input id="staffPassword" type="text" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required minLength={8} />
            <FieldError>{errors.password}</FieldError>
          </div>
        </AdminFormSection>
      ) : null}
    </AdminFormPanel>
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {dialog}
      {members.map((member) => {
        const isSelf = member.userId === currentUserId;
        const manageable = manageableIds.includes(member.id);
        const branchName = member.locationId ? branchNames[member.locationId] : null;
        return editingId === member.id ? (
          <div key={member.id} className="col-span-full">
            <StaffEditForm member={member} isSelf={isSelf} rules={rules} onCancel={() => setEditingId(null)} />
          </div>
        ) : (
          <article key={member.id} className={`surface-card flex min-w-0 flex-col gap-3 p-4 sm:p-5 ${member.isActive ? "" : "opacity-70"}`}>
            <div className="flex items-start gap-3.5">
              <Avatar name={member.fullName} className="size-11 text-[14px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{member.fullName}</p>
                <p className="truncate text-[13px] text-[var(--color-muted-ink)]">{member.email}</p>
                {member.phone ? <p className="tabular truncate text-[13px] text-[var(--color-muted-ink)]">{member.phone}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill tone="brand" dot={false}>{ROLE_LABELS[member.role]}</StatusPill>
                {multiBranch ? (
                  branchName ? (
                    <StatusPill tone="neutral">{branchName}</StatusPill>
                  ) : isBranchRole(member.role) ? (
                    <StatusPill tone="warning">No branch</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">All branches</StatusPill>
                  )
                ) : null}
                {!member.isActive ? <StatusPill tone="neutral">Disabled</StatusPill> : null}
                {isSelf ? <StatusPill tone="info" dot={false}>You</StatusPill> : null}
            </div>
            {canManage && (manageable || isSelf) ? (
              <div className="-mx-2 -mb-2 mt-auto flex items-center justify-end gap-1 border-t border-[var(--admin-line,var(--color-hairline))] pt-2">
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
          </article>
        );
      })}

      {canManage && assignableRoles.length > 0 ? (
        adding ? (
          <div className="col-span-full">
            <StaffEditForm rules={rules} onCancel={() => setAdding(false)} />
          </div>
        ) : editingId ? null : (
          <button type="button" onClick={() => setAdding(true)} className={`${addTileClass} md:min-h-[9rem]`}>
            <Plus className="size-4" aria-hidden /> Add staff member
          </button>
        )
      ) : null}
    </div>
  );
}
