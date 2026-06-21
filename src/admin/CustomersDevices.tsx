import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/shared';
import { customers as mockCustomers, plans } from '@/data/mock';
import type { Customer } from '@/types';
import {
  clearAdminToken,
  getAdminToken,
  listPanelDevices,
  listPanelPlaylists,
  setAdminToken,
  updatePanelDevice,
  type PanelDevice,
  type PanelDeviceStatus,
  type PanelPlaylist,
} from '@/utils/adminPanelApi';

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
function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function dateInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

function statusLabel(status: PanelDeviceStatus) {
  const labels: Record<PanelDeviceStatus, string> = {
    pending: 'Pendente',
    active: 'Ativo',
    blocked: 'Bloqueado',
    expired: 'Vencido',
    inactive: 'Inativo',
  };

  return labels[status] || status;
}

function deviceTypeIcon(type: string) {
  const icons: Record<string, string> = {
    celular: '📱',
    tablet: '📱',
    tvbox: '📺',
    androidtv: '📺',
    googletv: '📺',
    smarttv: '📺',
  };

  return icons[type] || '📱';
}

export function AdminDevices() {
  const [adminToken, setAdminTokenState] = useState(getAdminToken());
  const [devices, setDevices] = useState<PanelDevice[]>([]);
  const [playlists, setPlaylists] = useState<PanelPlaylist[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | PanelDeviceStatus>('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [status, setStatus] = useState<PanelDeviceStatus>('pending');
  const [playlistId, setPlaylistId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedDevice = selectedDeviceId
    ? devices.find(device => device.id === selectedDeviceId) ?? null
    : null;

  const filtered = devices.filter(device => {
    if (filter !== 'all' && device.status !== filter) return false;

    const term = search.trim().toLowerCase();
    if (!term) return true;

    return (
      device.deviceCode.toLowerCase().includes(term) ||
      String(device.clientName || '').toLowerCase().includes(term) ||
      String(device.playlistName || '').toLowerCase().includes(term)
    );
  });

  const pendingCount = devices.filter(device => device.status === 'pending').length;
  const activeCount = devices.filter(device => device.status === 'active').length;
  const blockedCount = devices.filter(device => device.status === 'blocked').length;

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [deviceList, playlistList] = await Promise.all([
        listPanelDevices(),
        listPanelPlaylists(),
      ]);

      setDevices(deviceList);
      setPlaylists(playlistList);
      setMessage('Painel sincronizado com o Supabase.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o painel.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!adminToken) return;
    void loadData();
  }, [adminToken]);

  function saveToken() {
    const token = adminToken.trim();

    if (!token) {
      setError('Informe o token de administrador.');
      return;
    }

    setAdminToken(token);
    setError(null);
    setMessage('Token salvo neste navegador.');
    void loadData();
  }

  function logoutToken() {
    clearAdminToken();
    setAdminTokenState('');
    setDevices([]);
    setPlaylists([]);
    setSelectedDeviceId(null);
    setMessage('Token removido deste navegador.');
  }

  function openDevice(device: PanelDevice) {
    setSelectedDeviceId(device.id);
    setClientName(device.clientName || '');
    setStatus(device.status);
    setPlaylistId(device.playlistId || playlists[0]?.id || '');
    setExpiresAt(dateInputValue(device.expiresAt) || dateInputValue(addDaysIso(30)));
    setMessage(null);
    setError(null);
  }

  async function saveSelectedDevice() {
    if (!selectedDevice) return;

    setSaving(true);
    setError(null);

    try {
      await updatePanelDevice({
        id: selectedDevice.id,
        status,
        clientName,
        playlistId,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : '',
      });

      setMessage(`Aparelho ${selectedDevice.deviceCode} atualizado.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o aparelho.');
    } finally {
      setSaving(false);
    }
  }

  async function quickActivate(device: PanelDevice) {
    const firstPlaylist = device.playlistId || playlists[0]?.id || '';

    if (!firstPlaylist) {
      setError('Cadastre ou selecione uma playlist antes de ativar o aparelho.');
      openDevice(device);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updatePanelDevice({
        id: device.id,
        status: 'active',
        clientName: device.clientName || 'Cliente sem nome',
        playlistId: firstPlaylist,
        expiresAt: addDaysIso(30),
      });

      setMessage(`Aparelho ${device.deviceCode} liberado por 30 dias.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível liberar o aparelho.');
    } finally {
      setSaving(false);
    }
  }

  async function blockDevice(device: PanelDevice) {
    setSaving(true);
    setError(null);

    try {
      await updatePanelDevice({
        id: device.id,
        status: 'blocked',
      });

      setMessage(`Aparelho ${device.deviceCode} bloqueado.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível bloquear o aparelho.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.34em] text-neon-cyan/75">Supabase real</p>
          <h1 className="text-4xl font-black text-text-white">Dispositivos</h1>
          <p className="mt-2 text-sm text-text-gray">
            Libere, bloqueie e vincule playlists sem abrir o SQL Editor.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={!adminToken || loading}
          className="rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 px-4 py-2 text-sm font-black text-neon-cyan disabled:opacity-50"
        >
          {loading ? 'Sincronizando...' : 'Recarregar'}
        </button>
      </div>

      <div className="glass-panel mb-5 rounded-[1.35rem] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-text-white">Token do painel</h2>
            <p className="text-xs text-text-gray">
              Token salvo apenas neste navegador. Não coloque no GitHub.
            </p>
          </div>

          {adminToken && (
            <button onClick={logoutToken} className="rounded-xl border border-error-red/30 bg-error-red/10 px-3 py-2 text-xs font-black text-error-red">
              Remover token
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <input
            type="password"
            value={adminToken}
            onChange={event => setAdminTokenState(event.target.value)}
            placeholder="Cole/digite o ADMIN_PANEL_TOKEN"
            className="input-dark flex-1 rounded-xl px-4 py-3 text-sm text-text-white focus:border-neon-orange focus:outline-none"
          />

          <button onClick={saveToken} className="btn-neon px-5 py-3 text-sm">
            Entrar
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-[1.35rem] border border-active-green/25 bg-active-green/10 p-3">
          <p className="text-sm text-active-green">{message}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-[1.35rem] border border-error-red/25 bg-error-red/10 p-3">
          <p className="text-sm text-error-red">{error}</p>
        </div>
      )}

      <section className="mb-5 grid grid-cols-4 gap-4">
        <div className="premium-card rounded-[1.35rem] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-text-gray/65">Total</p>
          <p className="mt-2 text-3xl font-black text-text-white">{devices.length}</p>
        </div>
        <div className="premium-card rounded-[1.35rem] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-text-gray/65">Pendentes</p>
          <p className="mt-2 text-3xl font-black text-neon-orange">{pendingCount}</p>
        </div>
        <div className="premium-card rounded-[1.35rem] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-text-gray/65">Ativos</p>
          <p className="mt-2 text-3xl font-black text-active-green">{activeCount}</p>
        </div>
        <div className="premium-card rounded-[1.35rem] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-text-gray/65">Bloqueados</p>
          <p className="mt-2 text-3xl font-black text-error-red">{blockedCount}</p>
        </div>
      </section>

      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder="Buscar por código, cliente ou lista..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="premium-card flex-1 rounded-xl px-4 py-2 text-sm text-text-white focus:border-neon-orange focus:outline-none"
        />
        <select
          value={filter}
          onChange={event => setFilter(event.target.value as typeof filter)}
          className="premium-card rounded-xl px-3 py-2 text-sm text-text-white focus:border-neon-orange focus:outline-none"
        >
          <option value="all">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="active">Ativos</option>
          <option value="blocked">Bloqueados</option>
          <option value="expired">Vencidos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      {selectedDevice && (
        <div className="glass-panel mb-5 rounded-[1.35rem] border-neon-orange/30 p-4 animate-scale-in">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-2xl font-black text-neon-orange">{selectedDevice.deviceCode}</p>
              <p className="text-xs text-text-gray">
                Criado em {formatDateTime(selectedDevice.createdAt)} · Último acesso {formatDateTime(selectedDevice.lastSeenAt)}
              </p>
            </div>

            <button onClick={() => setSelectedDeviceId(null)} className="text-text-gray hover:text-white">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <input
              value={clientName}
              onChange={event => setClientName(event.target.value)}
              placeholder="Nome do cliente"
              className="input-dark rounded-xl px-3 py-2 text-sm text-text-white focus:border-neon-orange focus:outline-none"
            />

            <select
              value={status}
              onChange={event => setStatus(event.target.value as PanelDeviceStatus)}
              className="input-dark rounded-xl px-3 py-2 text-sm text-text-white focus:border-neon-orange focus:outline-none"
            >
              <option value="pending">Pendente</option>
              <option value="active">Ativo</option>
              <option value="blocked">Bloqueado</option>
              <option value="expired">Vencido</option>
              <option value="inactive">Inativo</option>
            </select>

            <select
              value={playlistId}
              onChange={event => setPlaylistId(event.target.value)}
              className="input-dark rounded-xl px-3 py-2 text-sm text-text-white focus:border-neon-orange focus:outline-none"
            >
              <option value="">Sem playlist</option>
              {playlists.map(playlist => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={expiresAt}
              onChange={event => setExpiresAt(event.target.value)}
              className="input-dark rounded-xl px-3 py-2 text-sm text-text-white focus:border-neon-orange focus:outline-none"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={saveSelectedDevice} disabled={saving} className="btn-neon px-4 py-2 text-sm disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar aparelho'}
            </button>

            <button onClick={() => quickActivate(selectedDevice)} disabled={saving} className="rounded-xl border border-active-green/30 bg-active-green/12 px-4 py-2 text-sm font-black text-active-green disabled:opacity-50">
              Liberar 30 dias
            </button>

            <button onClick={() => blockDevice(selectedDevice)} disabled={saving} className="rounded-xl border border-error-red/30 bg-error-red/12 px-4 py-2 text-sm font-black text-error-red disabled:opacity-50">
              Bloquear
            </button>
          </div>
        </div>
      )}

      <div className="premium-card overflow-hidden rounded-[1.35rem]">
        <table className="w-full overflow-hidden rounded-[1.35rem]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-medium text-text-gray">Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-gray">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-gray">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-gray">Lista</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-gray">Vencimento</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-gray">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-gray">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(device => (
              <tr key={device.id} className="border-b border-white/10 transition-colors hover:bg-white/[0.06]">
                <td className="px-4 py-3 font-mono text-sm font-black text-neon-cyan">{device.deviceCode}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-sm text-text-white">
                    {deviceTypeIcon(device.deviceType)} {device.deviceType}
                  </span>
                  {device.appVersion && <p className="mt-1 text-[0.65rem] text-text-gray/60">v{device.appVersion}</p>}
                </td>
                <td className="px-4 py-3 text-sm text-text-white">{device.clientName || '—'}</td>
                <td className="px-4 py-3 text-sm text-text-gray">{device.playlistName || '—'}</td>
                <td className="px-4 py-3 text-xs text-text-gray">{formatDateTime(device.expiresAt)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={device.status} />
                  <p className="mt-1 text-[0.65rem] text-text-gray/50">{statusLabel(device.status)}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openDevice(device)} className="rounded bg-white/[0.06] px-3 py-1 text-xs font-bold text-text-gray hover:text-neon-orange">
                      Editar
                    </button>

                    {device.status === 'pending' && (
                      <button onClick={() => quickActivate(device)} disabled={saving} className="rounded bg-active-green/20 px-3 py-1 text-xs font-bold text-active-green hover:bg-active-green/30">
                        Liberar
                      </button>
                    )}

                    {device.status === 'active' ? (
                      <button onClick={() => blockDevice(device)} disabled={saving} className="rounded bg-error-red/20 px-3 py-1 text-xs font-bold text-error-red hover:bg-error-red/30">
                        Bloquear
                      </button>
                    ) : device.status === 'blocked' ? (
                      <button onClick={() => quickActivate(device)} disabled={saving} className="rounded bg-active-green/20 px-3 py-1 text-xs font-bold text-active-green hover:bg-active-green/30">
                        Desbloquear
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-gray">
                  Nenhum aparelho encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

