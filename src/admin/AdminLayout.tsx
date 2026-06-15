import { useAppStore } from '@/stores/appStore';
import type { AdminView } from '@/types';
import { customers, devices, plans, playlists, logs } from '@/data/mock';

// ===== ADMIN LAYOUT =====
export function AdminLayout({ children, activeView, onViewChange }: {
  children: React.ReactNode;
  activeView: AdminView;
  onViewChange: (v: AdminView) => void;
}) {
  const { setAdminMode } = useAppStore();

  const navItems: { id: AdminView; icon: string; label: string; hint: string }[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', hint: 'Visão geral' },
    { id: 'customers', icon: '👥', label: 'Clientes', hint: 'Assinaturas' },
    { id: 'devices', icon: '📱', label: 'Dispositivos', hint: 'Liberações' },
    { id: 'plans', icon: '💎', label: 'Planos', hint: 'Valores' },
    { id: 'playlists', icon: '📋', label: 'Listas', hint: 'Fontes' },
    { id: 'notices', icon: '📢', label: 'Avisos', hint: 'Mensagens' },
    { id: 'logs', icon: '📝', label: 'Logs', hint: 'Auditoria' },
    { id: 'settings', icon: '⚙️', label: 'Config', hint: 'Sistema' },
  ];

  return (
    <div className="premium-bg flex h-full w-full overflow-hidden">
      <aside className="m-4 mr-0 flex w-72 flex-shrink-0 flex-col rounded-[1.6rem] glass-panel p-4">
        <div className="mb-5 rounded-[1.35rem] border border-neon-orange/25 bg-neon-orange/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-orange to-neon-cyan text-3xl font-black text-bg-primary">
              R
            </div>
            <div>
              <h1 className="text-xl font-black text-text-white">
                Roneca<span className="font-medium text-text-white/80">Admin</span>
              </h1>
              <p className="text-[0.68rem] uppercase tracking-[0.28em] text-neon-cyan/80">
                Painel Premium
              </p>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                activeView === item.id
                  ? 'border-neon-orange bg-neon-orange/12 text-neon-orange glow-orange'
                  : 'border-white/10 bg-white/[0.035] text-text-gray hover:border-neon-orange/60 hover:text-text-white'
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-xl">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">{item.label}</span>
                <span className="block truncate text-[0.68rem] text-text-gray/65">{item.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="mt-4 border-t border-white/10 pt-4">
          <button
            onClick={() => setAdminMode(false)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-text-gray transition-all hover:border-neon-orange/60 hover:text-neon-orange"
          >
            ← Voltar ao App
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[1500px]">
          {children}
        </div>
      </main>
    </div>
  );
}

// ===== DASHBOARD =====
export function AdminDashboard() {
  const activeCustomers = customers.filter(c => c.status === 'active').length;
  const expiredCustomers = customers.filter(c => c.status === 'expired').length;
  const activeDevices = devices.filter(d => d.status === 'active').length;
  const pendingDevices = devices.filter(d => d.status === 'pending').length;
  const totalRevenue = customers.filter(c => c.status === 'active').reduce((acc, c) => {
    const plan = plans.find(p => p.id === c.planId);
    return acc + (plan?.price || 0);
  }, 0);

  const stats = [
    { icon: '👥', label: 'Clientes Ativos', value: activeCustomers, color: 'text-active-green', detail: 'assinaturas liberadas' },
    { icon: '⚠️', label: 'Clientes Vencidos', value: expiredCustomers, color: 'text-alert-yellow', detail: 'precisam renovação' },
    { icon: '📱', label: 'Dispositivos Ativos', value: activeDevices, color: 'text-neon-cyan', detail: 'aparelhos conectados' },
    { icon: '🆕', label: 'Solicitações', value: pendingDevices, color: 'text-neon-orange', detail: 'pendentes de aprovação' },
    { icon: '💰', label: 'Receita Estimada', value: `R$ ${totalRevenue.toFixed(2)}`, color: 'text-active-green', detail: 'mensal aproximada' },
    { icon: '📋', label: 'Listas Ativas', value: playlists.filter(p => p.status === 'active').length, color: 'text-neon-cyan', detail: 'fontes autorizadas' },
  ];

  const expiringCustomers = customers
    .filter(c => c.status === 'active')
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
    .slice(0, 5);

  const pendingDeviceList = devices.filter(d => d.status === 'pending');

  return (
    <div className="animate-fade-in">
      <header className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.34em] text-neon-cyan/75">Centro de controle</p>
          <h1 className="text-4xl font-black text-text-white">Dashboard administrativo</h1>
          <p className="mt-2 text-text-gray">Controle clientes, dispositivos, planos, listas e avisos do RonecaPlayTV.</p>
        </div>

        <div className="glass-panel rounded-2xl px-5 py-4 text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-text-gray/70">Status</p>
          <p className="mt-1 text-lg font-black text-active-green">● Sistema online</p>
        </div>
      </header>

      <section className="mb-7 grid grid-cols-3 gap-5">
        {stats.map(stat => (
          <div key={stat.label} className="premium-card rounded-[1.45rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-text-gray/65">{stat.label}</p>
                <p className={`mt-3 text-3xl font-black ${stat.color}`}>{stat.value}</p>
                <p className="mt-1 text-xs text-text-gray">{stat.detail}</p>
              </div>
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-3xl">
                {stat.icon}
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-[1fr_1fr] gap-6">
        <div className="glass-panel rounded-[1.5rem] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-text-white">Atividade recente</h2>
              <p className="text-sm text-text-gray">Últimas ações registradas no sistema</p>
            </div>
            <span className="rounded-full border border-neon-cyan/25 bg-neon-cyan/10 px-3 py-1 text-xs font-black text-neon-cyan">
              Logs
            </span>
          </div>

          <div className="space-y-3">
            {logs.slice(0, 6).map(log => (
              <div key={log.id} className="premium-card flex items-start gap-3 rounded-2xl p-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-xl">
                  {log.actorType === 'admin' ? '👑' : log.actorType === 'system' ? '🤖' : '👤'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-text-white">{log.action}</p>
                  <p className="mt-1 text-xs text-text-gray/65">{log.createdAt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[1.5rem] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-text-white">Assinaturas vencendo</h2>
              <p className="text-sm text-text-gray">Clientes que precisam de atenção</p>
            </div>
            <span className="rounded-full border border-alert-yellow/25 bg-alert-yellow/10 px-3 py-1 text-xs font-black text-alert-yellow">
              Renovação
            </span>
          </div>

          <div className="space-y-3">
            {expiringCustomers.map(customer => {
              const days = Math.ceil((new Date(customer.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

              return (
                <div key={customer.id} className="premium-card flex items-center justify-between rounded-2xl p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-text-white">{customer.name}</p>
                    <p className="mt-1 text-xs text-text-gray/65">{customer.expiresAt}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${
                    days <= 7
                      ? 'border-alert-yellow/30 bg-alert-yellow/10 text-alert-yellow'
                      : 'border-active-green/30 bg-active-green/10 text-active-green'
                  }`}>
                    {days}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {pendingDeviceList.length > 0 && (
        <section className="mt-6 glass-panel rounded-[1.5rem] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-neon-orange">Dispositivos pendentes</h2>
              <p className="text-sm text-text-gray">Solicitações aguardando liberação do administrador</p>
            </div>
            <span className="rounded-full border border-neon-orange/25 bg-neon-orange/10 px-3 py-1 text-xs font-black text-neon-orange">
              {pendingDeviceList.length} pendente{pendingDeviceList.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-3">
            {pendingDeviceList.map(device => (
              <div key={device.id} className="premium-card flex items-center justify-between rounded-2xl p-4">
                <div>
                  <p className="font-mono text-lg font-black text-text-white">{device.deviceCode}</p>
                  <p className="text-xs text-text-gray">{device.deviceType}</p>
                </div>

                <div className="flex gap-2">
                  <button className="rounded-xl border border-active-green/30 bg-active-green/12 px-4 py-2 text-xs font-black text-active-green hover:bg-active-green/20">
                    Liberar
                  </button>
                  <button className="rounded-xl border border-error-red/30 bg-error-red/12 px-4 py-2 text-xs font-black text-error-red hover:bg-error-red/20">
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 grid grid-cols-3 gap-5">
        <AdminQuickCard title="Planos" value={plans.length} description="Pacotes cadastrados" icon="💎" />
        <AdminQuickCard title="Listas" value={playlists.length} description="Fontes no sistema" icon="📋" />
        <AdminQuickCard title="Auditoria" value={logs.length} description="Eventos registrados" icon="📝" />
      </section>
    </div>
  );
}

function AdminQuickCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: string;
}) {
  return (
    <div className="premium-card rounded-[1.45rem] p-5">
      <span className="text-4xl">{icon}</span>
      <p className="mt-4 text-xs uppercase tracking-[0.24em] text-text-gray/65">{title}</p>
      <p className="mt-2 text-3xl font-black text-text-white">{value}</p>
      <p className="mt-1 text-sm text-text-gray">{description}</p>
    </div>
  );
}
