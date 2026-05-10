import { useEffect, useState, type FocusEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tenant } from '../types';

const focusSelectAll = (event: FocusEvent<HTMLInputElement>) => {
  event.currentTarget.select();
};

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [roomNo, setRoomNo] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [presentReading, setPresentReading] = useState('0.00');
  const [maintenanceFees, setMaintenanceFees] = useState('0.00');
  const [generatorFees, setGeneratorFees] = useState('0.00');
  const [active, setActive] = useState('1');
  const navigate = useNavigate();

  const refresh = async () => {
    setTenants(await window.api.tenants.list());
  };

  const resetForm = () => {
    setEditingTenantId(null);
    setRoomNo('');
    setName('');
    setPhone('');
    setPresentReading('0.00');
    setMaintenanceFees('0.00');
    setGeneratorFees('0.00');
    setActive('1');
  };

  const openAddModal = () => {
    resetForm();
    setIsAddOpen(true);
  };

  const openEditModal = (tenant: Tenant) => {
    setEditingTenantId(tenant.id);
    setRoomNo(tenant.room_no);
    setName(tenant.name);
    setPhone(tenant.phone ?? '');
    setPresentReading((tenant.present_reading ?? 0).toFixed(2));
    setMaintenanceFees((tenant.maintenance_fees ?? 0).toFixed(2));
    setGeneratorFees((tenant.generator_fees ?? 0).toFixed(2));
    setActive(String(tenant.active ?? 1));
    setIsAddOpen(true);
  };

  const handleSoftDelete = async (tenant: Tenant) => {
    const confirmed = window.confirm(`Soft delete ${tenant.name} (${tenant.room_no})? The tenant will become inactive but bill history will remain.`);
    if (!confirmed) return;
    await window.api.tenants.delete(tenant.id);
    refresh();
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Tenants</h1>
          <p className="mt-2 text-slate-400">Manage rooms, names, phone numbers, meter readings, and recurring fees.</p>
        </div>
        <button
          className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400"
          onClick={openAddModal}
        >
          Add Tenant
        </button>
      </div>

      {isAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">{editingTenantId ? 'Edit tenant' : 'Add tenant'}</h2>
                <p className="mt-1 text-sm text-slate-400">Enter the tenant details, current meter reading, and monthly fee amounts.</p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
                onClick={() => {
                  setIsAddOpen(false);
                  resetForm();
                }}
                aria-label="Close add tenant modal"
              >
                Close
              </button>
            </div>

            <form
              className="mt-6"
              onSubmit={async (event) => {
                event.preventDefault();
                await window.api.tenants.save({
                  id: editingTenantId ?? undefined,
                  room_no: roomNo.trim(),
                  name: name.trim(),
                  phone: phone.trim() || null,
                  present_reading: Number(presentReading || 0),
                  maintenance_fees: Number(maintenanceFees || 0),
                  generator_fees: Number(generatorFees || 0),
                  active: Number(active),
                });
                setIsAddOpen(false);
                resetForm();
                refresh();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Room no</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    value={roomNo}
                    onChange={(e) => setRoomNo(e.target.value)}
                    placeholder="Room no"
                    onFocus={focusSelectAll}
                    required
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Name</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    onFocus={focusSelectAll}
                    required
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Phone number</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Present meter reading</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    type="number"
                    min="0"
                    step="0.01"
                    value={presentReading}
                    onChange={(e) => setPresentReading(e.target.value)}
                    placeholder="0"
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Maintenance fees</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maintenanceFees}
                    onChange={(e) => setMaintenanceFees(e.target.value)}
                    placeholder="0"
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Generator fees</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    type="number"
                    min="0"
                    step="0.01"
                    value={generatorFees}
                    onChange={(e) => setGeneratorFees(e.target.value)}
                    placeholder="0"
                    onFocus={focusSelectAll}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-slate-300">Status</span>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white outline-none ring-0 transition focus:border-brand-400"
                    value={active}
                    onChange={(e) => setActive(e.target.value)}
                  >
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </select>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
                  onClick={() => {
                    setIsAddOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-500 px-4 py-2 text-white transition hover:bg-brand-400"
                >
                  {editingTenantId ? 'Update Tenant' : 'Save Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Present reading</th>
              <th className="px-4 py-3">Maintenance fees</th>
              <th className="px-4 py-3">Generator fees</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-white/10">
                <td className="px-4 py-3">{tenant.room_no}</td>
                <td className="px-4 py-3">{tenant.name}</td>
                <td className="px-4 py-3">{tenant.phone ?? '-'}</td>
                <td className="px-4 py-3">{tenant.present_reading.toFixed(2)}</td>
                <td className="px-4 py-3">{tenant.maintenance_fees.toFixed(2)}</td>
                <td className="px-4 py-3">{tenant.generator_fees.toFixed(2)}</td>
                <td className="px-4 py-3">{tenant.active ? 'Active' : 'Inactive'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                      onClick={() => openEditModal(tenant)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 transition hover:bg-red-500/20"
                      onClick={() => handleSoftDelete(tenant)}
                      disabled={!tenant.active}
                    >
                      {tenant.active ? 'Delete' : 'Inactive'}
                    </button>
                    <button
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
                      onClick={() => navigate(`/tenants/${tenant.id}/bills`)}
                    >
                      Open
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
