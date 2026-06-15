import { useState } from 'react';
import { StatusBadge } from '@/components/shared';
import { customers as mockCustomers, devices as mockDevices, plans } from '@/data/mock';
import type { Customer } from '@/types';

// ===== CUSTOMERS SCREEN =====
export function AdminCustomers() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'blocked'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const filtered = mockCustomers.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-text-white">Clientes</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-neon px-4 py-2 text-sm">
          + Novo Cliente
        </button>
      </div>

      {/* Filters */}
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

      {/* Add Form */}
      {showAdd && (
        <div className="glass-panel rounded-[1.35rem] border-neon-orange/30 p-4 mb-4 animate-scale-in">
          <h3 className="mb-3 text-xl font-black text-text-white">Novo Cliente</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nome" className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none" />
            <input placeholder="Telefone" className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none" />
            <input placeholder="E-mail" className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none" />
            <select className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none">
              {plans.map(p => <option key={p.id} value={p.id}>{p.name} - R$ {p.price.toFixed(2)}</option>)}
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn-neon px-4 py-2 text-sm">Salvar</button>
            <button onClick={() => setShowAdd(false)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">Cancelar</button>
          </div>
        </div>
      )}

      {/* Customer Detail */}
      {selectedCustomer && (
        <div className="bg-card border border-neon-cyan/30 rounded-xl p-4 mb-4 animate-scale-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-black text-text-white">{selectedCustomer.name}</h3>
            <button onClick={() => setSelectedCustomer(null)} className="text-text-gray hover:text-white">✕</button>
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
            <button className="bg-active-green/20 text-active-green px-4 py-2 rounded-lg text-sm font-bold hover:bg-active-green/30">✅ Renovar</button>
            <button className="bg-error-red/20 text-error-red px-4 py-2 rounded-lg text-sm font-bold hover:bg-error-red/30">🚫 Bloquear</button>
            <button className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50 hover:border-neon-orange/50">✏️ Editar</button>
          </div>
        </div>
      )}

      {/* Table */}
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
            {filtered.map(c => (
              <tr key={c.id} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="text-text-white text-sm font-medium">{c.name}</p>
                    <p className="text-text-gray/50 text-xs">{c.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-neon-orange text-sm">{plans.find(p => p.id === c.planId)?.name}</td>
                <td className="px-4 py-3 text-text-white text-sm">{c.expiresAt}</td>
                <td className="px-4 py-3 text-text-gray text-sm">{c.deviceCount}</td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setSelectedCustomer(c)} className="text-neon-cyan text-xs hover:text-neon-orange transition-colors">Ver</button>
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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'blocked' | 'pending'>('all');

  const filtered = mockDevices.filter(d => {
    if (filter !== 'all' && d.status !== filter) return false;
    if (search && !d.deviceCode.toLowerCase().includes(search.toLowerCase()) && !(d.customerName || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const deviceTypeIcon = (type: string) => {
    const icons: Record<string, string> = { celular: '📱', tablet: '📱', tvbox: '📺', androidtv: '📺', googletv: '📺', smarttv: '📺' };
    return icons[type] || '📱';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-text-white">Dispositivos</h1>
      </div>

      {/* Filters */}
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

      {/* Pending Alert */}
      {mockDevices.filter(d => d.status === 'pending').length > 0 && (
        <div className="rounded-[1.35rem] border border-neon-orange/25 bg-neon-orange/10 p-4 mb-4">
          <p className="text-neon-orange text-sm font-bold">⚡ {mockDevices.filter(d => d.status === 'pending').length} dispositivo(s) aguardando liberação</p>
        </div>
      )}

      {/* Table */}
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
            {filtered.map(d => (
              <tr key={d.id} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                <td className="px-4 py-3 text-neon-cyan font-mono text-sm">{d.deviceCode}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-text-white text-sm">
                    {deviceTypeIcon(d.deviceType)} {d.deviceType}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-white text-sm">{d.customerName || '—'}</td>
                <td className="px-4 py-3 text-text-gray text-xs">{d.lastSeenAt}</td>
                <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    {d.status === 'pending' && (
                      <button className="bg-active-green/20 text-active-green px-3 py-1 rounded text-xs font-bold hover:bg-active-green/30">
                        Liberar
                      </button>
                    )}
                    {d.status === 'active' && (
                      <button className="bg-error-red/20 text-error-red px-3 py-1 rounded text-xs font-bold hover:bg-error-red/30">
                        Bloquear
                      </button>
                    )}
                    {d.status === 'blocked' && (
                      <button className="bg-active-green/20 text-active-green px-3 py-1 rounded text-xs font-bold hover:bg-active-green/30">
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
