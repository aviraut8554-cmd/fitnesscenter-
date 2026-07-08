'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import type { TeamMember, TeamRole } from '@/lib/admin-types';
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  RoleBadge,
  TagChips,
  TeamStatusBadge,
} from '@/components/ui';

const INVITABLE_ROLES: Exclude<TeamRole, 'owner'>[] = ['manager', 'support'];

export function TeamManager({ viewerRole }: { viewerRole: TeamRole }) {
  const isOwner = viewerRole === 'owner';
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Exclude<TeamRole, 'owner'>>('support');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteEmailed, setInviteEmailed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const data = await api.get<{ teamMembers: TeamMember[] }>('/api/team');
      setMembers(data.teamMembers);
      setError(null);
    } catch (err) {
      setMembers([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load team');
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ teamMembers: TeamMember[] }>('/api/team')
      .then((data) => {
        if (cancelled) return;
        setMembers(data.teamMembers);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMembers([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load team');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteLink(null);
    try {
      const res = await api.post<{ inviteLink: string | null; emailSent: boolean }>('/api/team', {
        email,
        name,
        role,
      });
      setInviteLink(res.inviteLink);
      setInviteEmailed(res.emailSent);
      setEmail('');
      setName('');
      setRole('support');
      await load();
    } catch (err) {
      setInviteError(err instanceof ApiClientError ? err.message : 'Could not invite member');
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(member: TeamMember, next: Exclude<TeamRole, 'owner'>) {
    setError(null);
    try {
      await api.patch(`/api/team/${member.id}`, { role: next });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not change role');
    }
  }

  async function setActive(member: TeamMember, isActive: boolean) {
    setError(null);
    try {
      await api.patch(`/api/team/${member.id}`, { isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update member');
    }
  }

  async function remove(member: TeamMember) {
    if (!confirm(`Remove ${member.email ?? 'this member'} from the team?`)) return;
    setError(null);
    try {
      await api.del(`/api/team/${member.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not remove member');
    }
  }

  return (
    <div className="space-y-6">
      {isOwner ? (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              Invite a team member
            </h2>
            <Button
              variant="secondary"
              onClick={() => {
                setShowInvite((v) => !v);
                setInviteLink(null);
                setInviteError(null);
              }}
            >
              {showInvite ? 'Close' : 'Invite member'}
            </Button>
          </div>

          {showInvite ? (
            <form onSubmit={invite} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Name"
                  name="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                />
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">Role</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Exclude<TeamRole, 'owner'>)}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    {INVITABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs text-ink-500">
                The member receives an email link to set their own password — no temporary
                password needed.
              </p>
              {inviteError ? <Alert>{inviteError}</Alert> : null}
              <Button type="submit" loading={inviting}>
                Send invite
              </Button>
            </form>
          ) : null}

          {inviteLink ? (
            <Alert tone="info">
              <div className="space-y-2">
                <p>
                  {inviteEmailed
                    ? 'Invite emailed. You can also share this link directly:'
                    : 'Invite created. Email delivery is not configured yet — share this link with the member so they can set their password:'}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-700"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="secondary"
                    className="shrink-0 px-2.5 py-1.5 text-xs"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </Alert>
          ) : null}
        </Card>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {members === null ? (
        <p className="text-sm text-ink-500">Loading team…</p>
      ) : members.length === 0 ? (
        <EmptyState title="No team members" />
      ) : (
        <div className="grid gap-3">
          {members.map((member) => {
            const editable = isOwner && member.role !== 'owner' && !member.isSelf;
            return (
              <Card key={member.id}>
                <div className="flex items-start gap-4">
                  <Avatar name={member.name} photoUrl={member.profile_photo_url} size={48} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/team/${member.id}`}
                        className="font-semibold text-ink-900 hover:text-brand-600"
                      >
                        {member.name ?? member.email ?? 'Member'}
                      </Link>
                      {member.isSelf ? <span className="text-xs text-ink-400">(you)</span> : null}
                      <RoleBadge role={member.role} />
                      <TeamStatusBadge status={member.status} />
                    </div>
                    {member.email ? (
                      <div className="text-xs text-ink-500">{member.email}</div>
                    ) : null}
                    <TagChips tags={member.specialty_tags ?? []} />
                    <div className="text-xs text-ink-500">
                      {member.classCount} {member.classCount === 1 ? 'class' : 'classes'} assigned
                    </div>
                  </div>

                  {editable ? (
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <select
                        value={member.role}
                        onChange={(e) =>
                          changeRole(member, e.target.value as Exclude<TeamRole, 'owner'>)
                        }
                        aria-label={`Change role for ${member.email ?? 'member'}`}
                        className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      >
                        {INVITABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="px-2.5 py-1.5 text-xs"
                          onClick={() => setActive(member, member.status === 'inactive')}
                        >
                          {member.status === 'inactive' ? 'Activate' : 'Deactivate'}
                        </Button>
                        <Button
                          variant="danger"
                          className="px-2.5 py-1.5 text-xs"
                          onClick={() => remove(member)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Link
                      href={`/admin/team/${member.id}`}
                      className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      View
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
