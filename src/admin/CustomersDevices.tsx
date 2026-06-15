import { useState } from 'react';
import { StatusBadge } from '@/components/shared';
import { customers as mockCustomers, devices as mockDevices, plans } from '@/data/mock';
import type { Customer, Device } from '@/types';

function addDays(days: number, from?: string) {
  const base = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  planId: string;
};

// ===== CUSTOMERS SCREEN =====
export function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'blocked'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const emptyForm: CustomerForm = {
    name: '',
    phone: '',
    email: '',
    planId: plans[0]?.id ?? '',
  };

  const [form, setForm] = useState<CustomerForm>(emptyForm);

  const selectedCustomer = selectedCustomerId
    ? customers.find(customer => customer.id === selectedCustomerId) ?? null
    : null;

  const filtered = customers.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openNewCustomer = () => {
    setEditingCustomerId(null);
    setForm(emptyForm);
    setShowAdd(true);
    setMessage(null);
  };

  const openEditCustomer = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      planId: customer.planId,
    });
    setShowAdd(true);
    setMessage(null);
  };

  const closeForm = () => {
    setShowAdd(false);
    setEditingCustomerId(null);
    setForm(emptyForm);
  };

  const saveCustomer = () => {
    const name = form.name.trim();
    const email = form.email.trim();

    if (!name || !email) {
      setMessage('Informe pelo menos nome e e-mail.');
      return;
    }

    const selectedPlan = plans.find(plan => plan.id === form.planId) ?? plans[0];
    const durationDays = selectedPlan?.durationDays ?? 30;

    if (editingCustomerId) {
      setCustomers(current =>
        current.map(customer =>
          customer.id === editingCustomerId
            ? {
                ...customer,
                name,
                phone: form.phone.trim(),
                email,
                planId: form.planId,
              }
            : customer
        )
      );
      setMessage('Cliente atualizado.');
      closeForm();
      return;
    }

    const customer: Customer = {
      id: `customer-${Date.now()}`,
      name,
      phone: form.phone.trim(),
      email,
      status: 'active',
      planId: form.planId,
      expiresAt: addDays(durationDays),
      deviceCount: 0,
      createdAt: todayString(),
    };

    setCustomers(current => [customer, ...current]);
    setSelectedCustomerId(customer.id);
    setMessage('Cliente criado.');
    closeForm();
  };

  const renewCustomer = (customer: Customer) => {
    const selectedPlan = plans.find(plan => plan.id === customer.planId) ?? plans[0];
    const durationDays = selectedPlan?.durationDays ?? 30;

    setCustomers(current =>
      current.map(item =>
        item.id === customer.id
          ? { ...item, status: 'active', expiresAt: addDays(durationDays, item.expiresAt) }
          : item
      )
    );
    setMessage(`Cliente renovado: ${customer.name}`);
  };

  const setCustomerStatus = (customer: Customer, status: Customer['status']) => {
    setCustomers(current =>
      current.map(item =>
        item.id === customer.id ? { ...item, status } : item
      )
    );
    setMessage(`${customer.name}: ${status === 'blocked' ? 'bloqueado' : 'ativado'}.`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-text-white">Clientes</h1>
        <button onClick={openNewCustomer} className="btn-neon px-4 py-2 text-sm">
          + Novo Cliente
        </button>
      </div>

      {message && (
        <div className="rounded-[1.35rem] border border-active-green/25 bg-active-green/10 p-3 mb-4">
          <p className="text-active-green text-sm">{message}</p>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 premium-card rounded-xl px-4 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
        />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as typeof filter)}
          className="premium-card rounded-xl px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="expired">Vencidos</option>
          <option value="blocked">Bloqueados</option>
        </select>
      </div>

      {showAdd && (
        <div className="glass-panel rounded-[1.35rem] border-neon-orange/30 p-4 mb-4 animate-scale-in">
          <h3 className="mb-3 text-xl font-black text-text-white">
            {editingCustomerId ? 'Editar Cliente' : 'Novo Cliente'}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
              placeholder="Nome"
              className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />
            <input
              value={form.phone}
              onChange={e => setForm(current => ({ ...current, phone: e.target.value }))}
              placeholder="Telefone"
              className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />
            <input
              value={form.email}
              onChange={e => setForm(current => ({ ...current, email: e.target.value }))}
              placeholder="E-mail"
              className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />
            <select
              value={form.planId}
              onChange={e => setForm(current => ({ ...current, planId: e.target.value }))}
              className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            >
              {plans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} - R$ {plan.price.toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={saveCustomer} className="btn-neon px-4 py-2 text-sm">
              Salvar
            </button>
            <button onClick={closeForm} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="glass-panel rounded-[1.35rem] border-neon-cyan/30 p-4 mb-4 animate-scale-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-black text-text-white">{selectedCustomer.name}</h3>
            <button onClick={() => setSelectedCustomerId(null)} className="text-text-gray hover:text-white">✕</button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-text-gray">Telefone:</span> <span className="text-text-white">{selectedCustomer.phone}</span></div>
            <div><span className="text-text-gray">E-mail:</span> <span className="text-text-white">{selectedCustomer.email}</span></div>
            <div><span className="text-text-gray">Plano:</span> <span className="text-neon-orange">{plans.find(p => p.id === selectedCustomer.planId)?.name}</span></div>
            <div><span className="text-text-gray">Vencimento:</span> <span className="text-text-white">{selectedCustomer.expiresAt}</span></div>
            <div><span className="text-text-gray">Dispositivos:</span> <span className="text-text-white">{selectedCustomer.deviceCount}</span></div>
            <div><span className="text-text-gray">Status:</span> <StatusBadge status={selectedCustomer.status} /></div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => renewCustomer(selectedCustomer)} className="bg-active-green/20 text-active-green px-4 py-2 rounded-lg text-sm font-bold hover:bg-active-green/30">
              ✅ Renovar
            </button>
            {selectedCustomer.status === 'blocked' ? (
              <button onClick={() => setCustomerStatus(selectedCustomer, 'active')} className="bg-active-green/20 text-active-green px-4 py-2 rounded-lg text-sm font-bold hover:bg-active-green/30">
                ✅ Desbloquear
              </button>
            ) : (
              <button onClick={() => setCustomerStatus(selectedCustomer, 'blocked')} className="bg-error-red/20 text-error-red px-4 py-2 rounded-lg text-sm font-bold hover:bg-error-red/30">
                🚫 Bloquear
              </button>
            )}
            <button onClick={() => openEditCustomer(selectedCustomer)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">
              ✏️ Editar
            </button>
          </div>
        </div>
      )}

      <div className="premium-card rounded-[1.35rem] overflow-hidden">
        <table className="w-full overflow-hidden rounded-[1.35rem]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Nome</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Plano</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Vencimento</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Dispositivos</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Status</th>
              <th className="text-right text-text-gray text-xs font-medium px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(customer => (
              <tr key={customer.id} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="text-text-white text-sm font-medium">{customer.name}</p>
                    <p className="text-text-gray/50 text-xs">{customer.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-neon-orange text-sm">{plans.find(plan => plan.id === customer.planId)?.name}</td>
                <td className="px-4 py-3 text-text-white text-sm">{customer.expiresAt}</td>
                <td className="px-4 py-3 text-text-gray text-sm">{customer.deviceCount}</td>
                <td className="px-4 py-3"><StatusBadge status={customer.status} /></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setSelectedCustomerId(customer.id)} className="text-neon-cyan text-xs hover:text-neon-orange transition-colors">
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== DEVICES SCREEN =====
export function AdminDevices() {
  const [devices, setDevices] = useState<Device[]>(mockDevices);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'blocked' | 'pending'>('all');
  const [message, setMessage] = useState<string | null>(null);

  const filtered = devices.filter(d => {
    if (filter !== 'all' && d.status !== filter) return false;
    if (search && !d.deviceCode.toLowerCase().includes(search.toLowerCase()) && !(d.customerName || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendingCount = devices.filter(device => device.status === 'pending').length;

  const updateDeviceStatus = (device: Device, status: Device['status']) => {
    setDevices(current =>
      current.map(item =>
        item.id === device.id
          ? { ...item, status, lastSeenAt: status === 'active' ? new Date().toLocaleString('pt-BR') : item.lastSeenAt }
          : item
      )
    );

    const label = status === 'active' ? 'liberado' : status === 'blocked' ? 'bloqueado' : 'pendente';
    setMessage(`Dispositivo ${device.deviceCode} ${label}.`);
  };

  const deviceTypeIcon = (type: string) => {
    const icons: Record<string, string> = { celular: '📱', tablet: '📱', tvbox: '📺', androidtv: '📺', googletv: '📺', smarttv: '📺' };
    return icons[type] || '📱';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-text-white">Dispositivos</h1>
      </div>

      {message && (
        <div className="rounded-[1.35rem] border border-active-green/25 bg-active-green/10 p-3 mb-4">
          <p className="text-active-green text-sm">{message}</p>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por código ou cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 premium-card rounded-xl px-4 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
        />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as typeof filter)}
          className="premium-card rounded-xl px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="blocked">Bloqueados</option>
          <option value="pending">Pendentes</option>
        </select>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-[1.35rem] border border-neon-orange/25 bg-neon-orange/10 p-4 mb-4">
          <p className="text-neon-orange text-sm font-bold">⚡ {pendingCount} dispositivo(s) aguardando liberação</p>
        </div>
      )}

      <div className="premium-card rounded-[1.35rem] overflow-hidden">
        <table className="w-full overflow-hidden rounded-[1.35rem]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Código</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Tipo</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Cliente</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Último Acesso</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Status</th>
              <th className="text-right text-text-gray text-xs font-medium px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(device => (
              <tr key={device.id} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                <td className="px-4 py-3 text-neon-cyan font-mono text-sm">{device.deviceCode}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-text-white text-sm">
                    {deviceTypeIcon(device.deviceType)} {device.deviceType}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-white text-sm">{device.customerName || '—'}</td>
                <td className="px-4 py-3 text-text-gray text-xs">{device.lastSeenAt}</td>
                <td className="px-4 py-3"><StatusBadge status={device.status} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    {device.status === 'pending' && (
                      <button onClick={() => updateDeviceStatus(device, 'active')} className="bg-active-green/20 text-active-green px-3 py-1 rounded text-xs font-bold hover:bg-active-green/30">
                        Liberar
                      </button>
                    )}
                    {device.status === 'active' && (
                      <button onClick={() => updateDeviceStatus(device, 'blocked')} className="bg-error-red/20 text-error-red px-3 py-1 rounded text-xs font-bold hover:bg-error-red/30">
                        Bloquear
                      </button>
                    )}
                    {device.status === 'blocked' && (
                      <button onClick={() => updateDeviceStatus(device, 'active')} className="bg-active-green/20 text-active-green px-3 py-1 rounded text-xs font-bold hover:bg-active-green/30">
                        Desbloquear
                      </button>
                    )}
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
