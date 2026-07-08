'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { TeamMember, TeamRole } from '@/lib/admin-types';
import { Alert, Button, Card, EmptyState, Field, RoleBadge, Table } from '@/components/ui';

const INVITABLE_ROLES: Exclude<TeamRole, 'owner'>[] = ['manager', 'support'];

export function TeamManager({ viewerRole }: { viewerRole: TeamRole }) {
  const isOwner = viewerRole === 'owner';
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<TeamRole, 'owner'>>('support');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

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
    setInviteMsg(null);
    try {
      await api.post('/api/team', { email, name: name || undefined, password, role });
      setInviteMsg(`Added ${email} as ${role}.`);
      setEmail('');
      setName('');
      setPassword('');
      setRole('support');
      await load();
    } catch (err) {
      setInviteError(err instanceof ApiClientError ? err.message : 'Could not add member');
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
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Invite a team member
          </h2>
          <form onSubmit={invite} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field
                label="Temporary password"
                name="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            {inviteError ? <Alert>{inviteError}</Alert> : null}
            {inviteMsg ? <Alert tone="info">{inviteMsg}</Alert> : null}
            <Button type="submit" loading={inviting}>
              Add member
            </Button>
          </form>
        </Card>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {members === null ? (
        <p className="text-sm text-ink-500">Loading team…</p>
      ) : members.length === 0 ? (
        <EmptyState title="No team members" />
      ) : (
        <Table
          head={
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Added</th>
              {isOwner ? <th className="px-4 py-3 text-right">Actions</th> : null}
            </tr>
          }
        >
          {members.map((member) => {
            const editable = isOwner && member.role !== 'owner' && !member.isSelf;
            return (
              <tr key={member.id} className="hover:bg-ink-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink-900">{member.name ?? member.email ?? 'Member'}</div>
                  {member.email ? <div className="text-xs text-ink-500">{member.email}</div> : null}
                  {member.isSelf ? <span className="text-xs text-ink-400">(you)</span> : null}
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={member.role} />
                </td>
                <td className="px-4 py-3 text-ink-500 tabular-nums">
                  {new Date(member.created_at).toLocaleDateString()}
                </td>
                {isOwner ? (
                  <td className="px-4 py-3">
                    {editable ? (
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={member.role}
                          onChange={(e) => changeRole(member, e.target.value as Exclude<TeamRole, 'owner'>)}
                          aria-label={`Change role for ${member.email ?? 'member'}`}
                          className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        >
                          {INVITABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <Button variant="danger" className="px-2.5 py-1.5 text-xs" onClick={() => remove(member)}>
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="text-right text-xs text-ink-400">—</div>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
