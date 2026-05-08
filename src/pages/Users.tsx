import { useEffect, useState } from 'react';

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const refresh = async () => setUsers(await window.api.users.list());
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Users</h1>
          <p className="mt-2 text-slate-400">Admin and staff access control.</p>
        </div>
        <div className="flex gap-3">
          <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <input className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <button
            className="rounded-xl bg-brand-500 px-4 py-2 text-white"
            onClick={async () => {
              await window.api.users.save({ name, email, role: 'staff', must_change_password: 1, password: 'ChangeMe123!' });
              setName('');
              setEmail('');
              refresh();
            }}
          >
            Add User
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Forced Reset</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-white/10">
                <td className="px-4 py-3">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">{user.must_change_password ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
