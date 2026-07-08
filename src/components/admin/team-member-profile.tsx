'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import type { TeamMemberClass, TeamMemberDetail, TeamRole } from '@/lib/admin-types';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeading,
  RoleBadge,
  TagChips,
  TeamStatusBadge,
} from '@/components/ui';

type Detail = TeamMemberDetail['teamMember'];

export function TeamMemberProfile({
  memberId,
  viewerRole,
}: {
  memberId: string;
  viewerRole: TeamRole;
}) {
  const isOwner = viewerRole === 'owner';
  const [member, setMember] = useState<Detail | null>(null);
  const [classes, setClasses] = useState<TeamMemberClass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Edit fields
  const [photoUrl, setPhotoUrl] = useState('');
  const [bio, setBio] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<TeamMemberDetail>(`/api/team/${memberId}`);
      setMember(data.teamMember);
      setClasses(data.classes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load member');
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<TeamMemberDetail>(`/api/team/${memberId}`)
      .then((data) => {
        if (cancelled) return;
        setMember(data.teamMember);
        setClasses(data.classes);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Could not load member');
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  function startEdit() {
    if (!member) return;
    setPhotoUrl(member.profile_photo_url ?? '');
    setBio(member.bio ?? '');
    setTagsText((member.specialty_tags ?? []).join(', '));
    setSaveError(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const specialtyTags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await api.patch(`/api/team/${memberId}`, {
        profilePhotoUrl: photoUrl.trim() || null,
        bio: bio.trim() || null,
        specialtyTags,
      });
      setEditing(false);
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!member) return <p className="text-sm text-ink-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={member.name} photoUrl={member.profile_photo_url} size={72} />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-ink-900">
                {member.name ?? member.email ?? 'Member'}
              </h1>
              {member.email ? <p className="text-sm text-ink-500">{member.email}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <RoleBadge role={member.role} />
                <TeamStatusBadge status={member.status} />
              </div>
              <TagChips tags={member.specialty_tags ?? []} />
              {member.bio ? (
                <p className="max-w-prose text-sm text-ink-700">{member.bio}</p>
              ) : (
                <p className="text-sm italic text-ink-400">No bio yet.</p>
              )}
            </div>
          </div>
          {isOwner && member.role !== 'owner' && !editing ? (
            <Button variant="secondary" onClick={startEdit}>
              Edit profile
            </Button>
          ) : null}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-6 space-y-4 border-t border-ink-100 pt-6">
            <Field
              label="Profile photo URL"
              name="photoUrl"
              type="url"
              placeholder="https://…"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
            />
            <Field
              label="Specialty tags (comma-separated)"
              name="tags"
              placeholder="Yoga, Nutrition, Strength Training"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Bio</span>
              <textarea
                name="bio"
                rows={4}
                maxLength={1000}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </label>
            {saveError ? <Alert>{saveError}</Alert> : null}
            <div className="flex gap-2">
              <Button type="submit" loading={saving}>
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Assigned classes ({classes.length})
        </h2>
        {classes.length === 0 ? (
          <EmptyState title="No classes assigned" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {classes.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-3">
                <Link
                  href="/admin/classes"
                  className="font-medium text-ink-900 hover:text-brand-600"
                >
                  {c.title}
                </Link>
                <Badge tone={c.is_recorded ? 'neutral' : 'brand'}>
                  {c.is_recorded ? 'Recorded' : 'Live'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <div>
      <Link href="/admin/team" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
        ← Back to team
      </Link>
      <PageHeading title="Team member" />
    </div>
  );
}
