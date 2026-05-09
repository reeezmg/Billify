import { useEffect, useMemo, useState } from 'react';
import type { SessionUser } from '../types';

type UserFormState = {
  id: number | null;
  name: string;
  email: string;
  role: SessionUser['role'];
  must_change_password: boolean;
};

const emptyForm: UserFormState = {
  id: null,
  name: '',
  email: '',
  role: 'staff',
  must_change_password: true,
};

export default function Users() {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, currentSession] = await Promise.all([window.api.users.list(), window.api.auth.getSession()]);
      setUsers(list as SessionUser[]);
      setSession(currentSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const adminCount = useMemo(() => users.filter((user) => user.role === 'admin').length, [users]);
  const isEditing = form.id !== null;
  const isSelf = form.id !== null && session?.id === form.id;

  const openCreate = () => {
    setError(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (user: SessionUser) => {
    setError(null);
    setForm({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(emptyForm);
  };

  const saveUser = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.api.users.save({
        id: form.id ?? undefined,
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        must_change_password: form.must_change_password,
        password: form.id ? undefined : 'qwertyuiop',
      });
      closeModal();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save user.');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user: SessionUser) => {
    const confirmed = window.confirm(`Delete ${user.name}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(user.id);
    setError(null);
    try {
      await window.api.users.delete(user.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete user.');
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = (user: SessionUser) => user.id !== session?.id && !(user.role === 'admin' && adminCount === 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-white">Users</h1>
          <p className="mt-2 text-slate-400">Admin and staff access control.</p>
        </div>
        <button onClick={openCreate} className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400">
          Add User
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Forced Reset</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={5}>
                  Loading users...
                </td>
              </tr>
            ) : users.length > 0 ? (
              users.map((user) => (
                <tr key={user.id} className="border-t border-white/10">
                  <td className="px-4 py-3 text-white">{user.name}</td>
                  <td className="px-4 py-3 text-slate-300">{user.email}</td>
                  <td className="px-4 py-3 text-slate-300 capitalize">{user.role}</td>
                  <td className="px-4 py-3 text-slate-300">{user.must_change_password ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
                        onClick={() => openEdit(user)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => void deleteUser(user)}
                        disabled={!canDelete(user) || deletingId === user.id}
                      >
                        {deletingId === user.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={5}>
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">{isEditing ? 'Edit User' : 'Add User'}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Update the user profile and access level.
                </p>
              </div>
              <button onClick={closeModal} className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white">
                x
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Name</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none"
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Email</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                  placeholder="Email"
                  disabled={isEditing}
                />
                {isEditing ? <div className="mt-1 text-xs text-slate-500">Email stays locked for edits.</div> : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Role</label>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-70"
                    value={form.role}
                    onChange={(e) => setForm((current) => ({ ...current, role: e.target.value as SessionUser['role'] }))}
                    disabled={isSelf}
                  >
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                  {isSelf ? <div className="mt-1 text-xs text-slate-500">Your own role is locked.</div> : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Password reset</label>
                  <div className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                    {form.must_change_password ? 'Will be required to change' : 'Not forced'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveUser()}
                disabled={saving || !form.name.trim() || !form.email.trim()}
                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
