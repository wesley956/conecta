import { useState } from 'react';
import { StatusBadge } from '@/components/shared';
import { plans, notices, logs } from '@/data/mock';
import { useAppStore } from '@/stores/appStore';
import { fetchM3UContent } from '@/utils/fetchM3U';

// ===== PLANS SCREEN =====
export function AdminPlans() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-text-white">Planos</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-neon px-4 py-2 text-sm">
          + Novo Plano
        </button>
      </div>

      {showAdd && (
        <div className="glass-panel rounded-[1.35rem] border-neon-orange/30 p-4 mb-4 animate-scale-in">
          <h3 className="mb-3 text-xl font-black text-text-white">Novo Plano</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nome do Plano" className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none" />
            <input placeholder="Valor (R$)" type="number" step="0.01" className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none" />
            <input placeholder="Máx. Dispositivos" type="number" className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none" />
            <input placeholder="Duração (dias)" type="number" className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none" />
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn-neon px-4 py-2 text-sm">Salvar</button>
            <button onClick={() => setShowAdd(false)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {plans.map(p => (
          <div key={p.id} className={`premium-card rounded-[1.35rem] p-5 hover:border-neon-orange/30 transition-all ${p.price === 0 ? 'border-active-green/30' : 'border-white/10'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-black text-text-white">{p.name}</h3>
              <StatusBadge status={p.status} />
            </div>
            <div className="text-3xl font-extrabold text-neon-orange mb-1">
              {p.price === 0 ? 'GRÁTIS' : `R$ ${p.price.toFixed(2)}`}
            </div>
            <p className="text-text-gray/60 text-xs mb-4">/mês</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-active-green">✓</span>
                <span className="text-text-gray">{p.maxDevices} dispositivo{p.maxDevices > 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-active-green">✓</span>
                <span className="text-text-gray">{p.durationDays} dias</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-active-green">✓</span>
                <span className="text-text-gray">Suporte incluso</span>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="flex-1 bg-white/[0.04] border border-white/10 text-text-gray py-2 rounded-lg text-xs hover:border-neon-orange/50">✏️ Editar</button>
              <button className="flex-1 bg-white/[0.04] border border-white/10 text-text-gray py-2 rounded-lg text-xs hover:border-error-red/50">🗑️ Remover</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== ADMIN PLAYLISTS SCREEN =====
export function AdminPlaylists() {
  const { playlists, importM3UPlaylist, addDirectStreamChannel } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistType, setPlaylistType] = useState<'m3u' | 'xtream' | 'stalker'>('m3u');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [m3uContent, setM3uContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setPlaylistName('');
    setPlaylistType('m3u');
    setPlaylistUrl('');
    setM3uContent('');
  };

  const handleAddPlaylist = async () => {
    setMessage(null);
    setError(null);

    if (playlistType !== 'm3u') {
      setError('Por enquanto, a importação automática está ativa apenas para listas M3U autorizadas. Xtream/Stalker entram em uma próxima fase.');
      return;
    }

    const url = playlistUrl.trim();
    const pastedContent = m3uContent.trim();

    if (!url && !pastedContent) {
      setError('Informe uma URL M3U ou cole o conteúdo da lista.');
      return;
    }

    if (url && !/^https?:\/\//i.test(url)) {
      setError('A URL precisa começar com http:// ou https://');
      return;
    }

    if (url.startsWith('http://') && window.location.protocol === 'https:') {
      setError('Essa URL usa HTTP e foi bloqueada pelo navegador porque o Codespace roda em HTTPS. Use uma URL HTTPS, cole o conteúdo M3U manualmente ou teste depois no APK/backend.');
      return;
    }

    setIsAdding(true);

    try {
      let content = pastedContent;

      if (!content && url) {
        content = await fetchM3UContent(url);
      }

      const result = content.trim()
        ? importM3UPlaylist(playlistName, url, content)
        : addDirectStreamChannel(playlistName, url);
      setMessage(`Lista adicionada com sucesso: ${result.imported} canais importados${result.skipped ? `, ${result.skipped} itens ignorados` : ''}.`);
      resetForm();
      setShowAdd(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Se a URL estiver correta, o servidor pode estar bloqueando acesso pelo navegador/CORS. Nesse caso, cole o conteúdo M3U no campo manual.`
          : 'Não foi possível adicionar a lista.'
      );
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-text-white">Listas de Reprodução</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-neon px-4 py-2 text-sm">
          + Nova Lista
        </button>
      </div>

      <div className="rounded-[1.35rem] border border-alert-yellow/25 bg-alert-yellow/10 p-4 mb-4">
        <p className="text-alert-yellow text-sm">
          ⚖️ <strong>Aviso:</strong> Cadastre apenas listas e fontes autorizadas. O app não fornece canais, filmes, séries ou listas.
        </p>
      </div>

      {message && (
        <div className="rounded-[1.35rem] border border-active-green/25 bg-active-green/10 p-3 mb-4">
          <p className="text-active-green text-sm">{message}</p>
        </div>
      )}

      {error && (
        <div className="rounded-[1.35rem] border border-error-red/25 bg-error-red/10 p-3 mb-4">
          <p className="text-error-red text-sm">{error}</p>
        </div>
      )}

      {showAdd && (
        <div className="glass-panel rounded-[1.35rem] border-neon-orange/30 p-4 mb-4 animate-scale-in">
          <h3 className="mb-3 text-xl font-black text-text-white">Nova Lista</h3>
          <div className="space-y-3">
            <input
              value={playlistName}
              onChange={e => setPlaylistName(e.target.value)}
              placeholder="Nome da Lista"
              className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />

            <select
              value={playlistType}
              onChange={e => setPlaylistType(e.target.value as 'm3u' | 'xtream' | 'stalker')}
              className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            >
              <option value="m3u">M3U URL</option>
              <option value="xtream">Xtream Codes</option>
              <option value="stalker">Stalker (Autorizado)</option>
            </select>

            <input
              value={playlistUrl}
              onChange={e => setPlaylistUrl(e.target.value)}
              placeholder="URL M3U autorizada"
              className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />

            <textarea
              value={m3uContent}
              onChange={e => setM3uContent(e.target.value)}
              rows={6}
              placeholder="Opcional: cole aqui o conteúdo da lista M3U se a URL não puder ser acessada pelo navegador."
              className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-xs font-mono focus:border-neon-orange focus:outline-none resize-y"
            />
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAddPlaylist}
              disabled={isAdding}
              className="btn-neon px-4 py-2 text-sm disabled:opacity-50"
            >
              {isAdding ? 'Adicionando...' : 'Adicionar'}
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">Cancelar</button>
          </div>
        </div>
      )}

      <div className="premium-card rounded-[1.35rem] overflow-hidden">
        <table className="w-full overflow-hidden rounded-[1.35rem]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Nome</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Tipo</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Canais</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Filmes/Séries</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Status</th>
              <th className="text-right text-text-gray text-xs font-medium px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {playlists.map(p => (
              <tr key={p.id} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                <td className="px-4 py-3">
                  <p className="text-text-white text-sm font-medium">{p.name}</p>
                  <p className="text-text-gray/50 text-[10px]">Sync: {p.lastSync}</p>
                </td>
                <td className="px-4 py-3 text-text-gray text-sm">{p.type.toUpperCase()}</td>
                <td className="px-4 py-3 text-text-white text-sm">{p.channelCount}</td>
                <td className="px-4 py-3 text-text-white text-sm">{p.movieCount}/{p.seriesCount}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <button className="rounded-lg border border-neon-cyan/25 bg-neon-cyan/10 px-3 py-1 text-xs font-black text-neon-cyan hover:border-neon-orange/50 hover:text-neon-orange">Testar</button>
                    <button className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-text-gray hover:border-neon-orange/50 hover:text-neon-orange">Editar</button>
                    <button className="rounded-lg border border-error-red/25 bg-error-red/10 px-3 py-1 text-xs font-black text-error-red hover:bg-error-red/20">Remover</button>
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

// ===== NOTICES SCREEN =====
export function AdminNotices() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-text-white">Avisos</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-neon px-4 py-2 text-sm">
          + Novo Aviso
        </button>
      </div>

      {showAdd && (
        <div className="glass-panel rounded-[1.35rem] border-neon-orange/30 p-4 mb-4 animate-scale-in">
          <h3 className="mb-3 text-xl font-black text-text-white">Novo Aviso</h3>
          <div className="space-y-3">
            <input placeholder="Título do Aviso" className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none" />
            <textarea placeholder="Mensagem do aviso..." rows={3} className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none resize-none" />
            <select className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none">
              <option value="all">Todos os clientes</option>
              <option value="expiring">Apenas vencendo</option>
              <option value="expired">Apenas vencidos</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn-neon px-4 py-2 text-sm">Enviar Aviso</button>
            <button onClick={() => setShowAdd(false)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {notices.map(n => (
          <div key={n.id} className={`premium-card rounded-[1.35rem] p-4 ${n.active ? 'border-neon-orange/30' : 'border-white/10 opacity-60'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-text-white font-bold">{n.title}</h3>
              <div className="flex items-center gap-2">
                <StatusBadge status={n.active ? 'active' : 'inactive'} />
                <span className="text-text-gray/50 text-xs">{n.createdAt}</span>
              </div>
            </div>
            <p className="text-text-gray text-sm mb-3">{n.message}</p>
            <div className="flex items-center justify-between">
              <span className="text-text-gray/50 text-xs">Destino: {n.target === 'all' ? 'Todos' : n.target}</span>
              <div className="flex gap-2">
                <button className="rounded-lg border border-neon-cyan/25 bg-neon-cyan/10 px-3 py-1 text-xs font-black text-neon-cyan hover:border-neon-orange/50 hover:text-neon-orange">{n.active ? 'Desativar' : 'Ativar'}</button>
                <button className="rounded-lg border border-error-red/25 bg-error-red/10 px-3 py-1 text-xs font-black text-error-red hover:bg-error-red/20">Remover</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== LOGS SCREEN =====
export function AdminLogs() {
  const [filter, setFilter] = useState<'all' | 'admin' | 'system' | 'customer'>('all');

  const filtered = logs.filter(l => filter === 'all' || l.actorType === filter);

  const actorIcon = (type: string) => {
    const icons: Record<string, string> = { admin: '👑', system: '🤖', customer: '👤' };
    return icons[type] || '📝';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black text-text-white">Logs</h1>
        <button className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50 hover:border-neon-orange/50">
          🗑️ Limpar Logs
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(['all', 'admin', 'system', 'customer'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f
                ? 'bg-neon-orange text-bg-primary'
                : 'bg-white/[0.04] border border-white/10 text-text-gray hover:border-neon-orange/50'
            }`}
          >
            {f === 'all' ? 'Todos' : f === 'admin' ? '👑 Admin' : f === 'system' ? '🤖 Sistema' : '👤 Cliente'}
          </button>
        ))}
      </div>

      <div className="premium-card rounded-[1.35rem] overflow-hidden">
        <table className="w-full overflow-hidden rounded-[1.35rem]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Tipo</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Ação</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Detalhes</th>
              <th className="text-left text-text-gray text-xs font-medium px-4 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.id} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                <td className="px-4 py-3">
                  <span className="text-sm">{actorIcon(l.actorType)}</span>
                  <span className="text-text-gray text-xs ml-2 capitalize">{l.actorType}</span>
                </td>
                <td className="px-4 py-3 text-text-white text-sm">{l.action}</td>
                <td className="px-4 py-3 text-text-gray/60 text-xs">{l.metadata || '—'}</td>
                <td className="px-4 py-3 text-text-gray/50 text-xs">{l.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== ADMIN SETTINGS SCREEN =====
export function AdminSettings() {
  return (
    <div>
      <h1 className="mb-6 text-4xl font-black text-text-white">Configurações do Sistema</h1>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="premium-card rounded-[1.35rem] p-4">
          <h3 className="mb-3 text-xl font-black text-text-white">🔐 Segurança</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Validação de dispositivo</span>
              <span className="text-active-green text-xs">Ativo</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Token de acesso</span>
              <span className="text-active-green text-xs">Ativo</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Bloqueio remoto</span>
              <span className="text-active-green text-xs">Ativo</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Limite por dispositivo</span>
              <span className="text-active-green text-xs">Ativo</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Proteção contra compartilhamento</span>
              <span className="text-active-green text-xs">Ativo</span>
            </div>
          </div>
        </div>
        
        <div className="premium-card rounded-[1.35rem] p-4">
          <h3 className="mb-3 text-xl font-black text-text-white">📱 Aplicativo</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Versão mínima</span>
              <span className="text-text-white text-sm">1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Validação online</span>
              <span className="text-text-white text-sm">A cada 6h</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Forçar atualização</span>
              <span className="text-text-gray text-xs">Desativado</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Manutenção</span>
              <span className="text-text-gray text-xs">Desativado</span>
            </div>
          </div>
        </div>
        
        <div className="premium-card rounded-[1.35rem] p-4">
          <h3 className="mb-3 text-xl font-black text-text-white">💬 Comunicação</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">WhatsApp suporte</span>
              <span className="text-neon-cyan text-sm">+55 11 99999-9999</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-gray text-sm">Aviso automático vencimento</span>
              <span className="text-active-green text-xs">Ativo</span>
            </div>
          </div>
        </div>
        
        <div className="premium-card rounded-[1.35rem] p-4">
          <h3 className="mb-3 text-xl font-black text-text-white">⚖️ Legal</h3>
          <p className="text-text-gray text-xs leading-relaxed">
            RonecaPlayTV é um player IPTV/P2P legal. Este sistema NÃO fornece canais, filmes, séries, listas piratas, 
            DRM bypass, desbloqueio de conteúdo pago ou qualquer conteúdo sem autorização. 
            O administrador é responsável por cadastrar apenas listas e fontes autorizadas.
          </p>
        </div>
      </div>
    </div>
  );
}
