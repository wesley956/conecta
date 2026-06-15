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

  const navItems: { id: AdminView; icon: string; label: string }[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'customers', icon: '👥', label: 'Clientes' },
    { id: 'devices', icon: '📱', label: 'Dispositivos' },
    { id: 'plans', icon: '💎', label: 'Planos' },
    { id: 'playlists', icon: '📋', label: 'Listas' },
    { id: 'notices', icon: '📢', label: 'Avisos' },
    { id: 'logs', icon: '📝', label: 'Logs' },
    { id: 'settings', icon: '⚙️', label: 'Config' },
  ];

  return (
    <div className="h-full w-full bg-bg-primary flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-bg-dark border-r border-border flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-neon-orange font-extrabold text-lg">RONECA</span>
            <span className="text-neon-cyan font-extrabold text-lg">PLAY</span>
            <span className="text-text-gray text-xs">Admin</span>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all ${
                activeView === item.id
                  ? 'bg-neon-orange/10 border border-neon-orange/30 text-neon-orange'
                  : 'text-text-gray hover:bg-card hover:text-text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <button
            onClick={() => setAdminMode(false)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-gray hover:text-neon-orange hover:bg-card transition-all text-sm"
          >
            ← Voltar ao App
          </button>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
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
    { icon: '👥', label: 'Clientes Ativos', value: activeCustomers, color: 'text-active-green' },
    { icon: '⚠️', label: 'Clientes Vencidos', value: expiredCustomers, color: 'text-alert-yellow' },
    { icon: '📱', label: 'Dispositivos Ativos', value: activeDevices, color: 'text-neon-cyan' },
    { icon: '🆕', label: 'Novas Solicitações', value: pendingDevices, color: 'text-neon-orange' },
    { icon: '💰', label: 'Receita Estimada', value: `R$ ${totalRevenue.toFixed(2)}`, color: 'text-active-green' },
    { icon: '📋', label: 'Listas Ativas', value: playlists.filter(p => p.status === 'active').length, color: 'text-neon-cyan' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-white mb-6">Dashboard</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {stats.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:border-neon-orange/30 transition-all">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="text-text-gray text-xs">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Logs */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-text-white font-bold mb-3">Atividade Recente</h3>
          <div className="space-y-2">
            {logs.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-bg-dark/50">
                <span className="text-xs">{log.actorType === 'admin' ? '👑' : log.actorType === 'system' ? '🤖' : '👤'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-text-white text-xs truncate">{log.action}</p>
                  <p className="text-text-gray/50 text-[10px]">{log.createdAt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-text-white font-bold mb-3">Assinaturas Vencendo</h3>
          <div className="space-y-2">
            {customers.filter(c => c.status === 'active').sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)).slice(0, 5).map(c => {
              const days = Math.ceil((new Date(c.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-bg-dark/50">
                  <div>
                    <p className="text-text-white text-xs">{c.name}</p>
                    <p className="text-text-gray/50 text-[10px]">{c.expiresAt}</p>
                  </div>
                  <span className={`text-xs font-bold ${days <= 7 ? 'text-alert-yellow' : 'text-active-green'}`}>
                    {days}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pending Devices */}
      {pendingDevices > 0 && (
        <div className="mt-4 bg-neon-orange/5 border border-neon-orange/20 rounded-xl p-4">
          <h3 className="text-neon-orange font-bold mb-3">⚡ Dispositivos Pendentes</h3>
          <div className="space-y-2">
            {devices.filter(d => d.status === 'pending').map(d => (
              <div key={d.id} className="flex items-center justify-between p-2 rounded-lg bg-bg-dark/50">
                <div>
                  <span className="text-text-white text-xs font-mono">{d.deviceCode}</span>
                  <span className="text-text-gray/50 text-[10px] ml-2">{d.deviceType}</span>
                </div>
                <div className="flex gap-2">
                  <button className="bg-active-green/20 text-active-green px-3 py-1 rounded text-xs font-bold hover:bg-active-green/30">
                    Liberar
                  </button>
                  <button className="bg-error-red/20 text-error-red px-3 py-1 rounded text-xs font-bold hover:bg-error-red/30">
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
