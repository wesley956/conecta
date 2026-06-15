import { useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/shared';
import { plans as mockPlans, notices as mockNotices, logs as mockLogs } from '@/data/mock';
import { useAppStore } from '@/stores/appStore';
import { fetchM3UContent } from '@/utils/fetchM3U';
import type { LogEntry, Notice, Plan, Playlist } from '@/types';

function todayLabel() {
  return new Date().toLocaleString('pt-BR');
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ===== PLANS SCREEN =====
export function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>(mockPlans);
  const [showAdd, setShowAdd] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const emptyForm = {
    name: '',
    price: '',
    maxDevices: '',
    durationDays: '',
  };

  const [form, setForm] = useState(emptyForm);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingPlanId(null);
    setShowAdd(false);
  };

  const openNewPlan = () => {
    setMessage(null);
    setEditingPlanId(null);
    setForm(emptyForm);
    setShowAdd(true);
  };

  const openEditPlan = (plan: Plan) => {
    setMessage(null);
    setEditingPlanId(plan.id);
    setForm({
      name: plan.name,
      price: String(plan.price),
      maxDevices: String(plan.maxDevices),
      durationDays: String(plan.durationDays),
    });
    setShowAdd(true);
  };

  const savePlan = () => {
    const name = form.name.trim();
    const price = Number(form.price);
    const maxDevices = Number(form.maxDevices);
    const durationDays = Number(form.durationDays);

    if (!name || Number.isNaN(price) || Number.isNaN(maxDevices) || Number.isNaN(durationDays)) {
      setMessage('Preencha nome, valor, dispositivos e duração corretamente.');
      return;
    }

    if (editingPlanId) {
      setPlans(current =>
        current.map(plan =>
          plan.id === editingPlanId
            ? { ...plan, name, price, maxDevices, durationDays }
            : plan
        )
      );
      setMessage('Plano atualizado.');
      resetForm();
      return;
    }

    const plan: Plan = {
      id: newId('plan'),
      name,
      price,
      maxDevices,
      durationDays,
      status: 'active',
    };

    setPlans(current => [plan, ...current]);
    setMessage('Plano criado.');
    resetForm();
  };

  const removePlan = (plan: Plan) => {
    setPlans(current => current.filter(item => item.id !== plan.id));
    setMessage(`Plano removido: ${plan.name}`);
    if (editingPlanId === plan.id) resetForm();
  };

  const togglePlanStatus = (plan: Plan) => {
    setPlans(current =>
      current.map(item =>
        item.id === plan.id
          ? { ...item, status: item.status === 'active' ? 'inactive' : 'active' }
          : item
      )
    );
    setMessage(`${plan.name}: ${plan.status === 'active' ? 'desativado' : 'ativado'}.`);
  };

  return (
    <div>
      <AdminHeader title="Planos">
        <button onClick={openNewPlan} className="btn-neon px-4 py-2 text-sm">
          + Novo Plano
        </button>
      </AdminHeader>

      {message && <AdminNotice tone={message.includes('Preencha') ? 'error' : 'success'}>{message}</AdminNotice>}

      {showAdd && (
        <div className="glass-panel rounded-[1.35rem] border-neon-orange/30 p-4 mb-4 animate-scale-in">
          <h3 className="mb-3 text-xl font-black text-text-white">
            {editingPlanId ? 'Editar Plano' : 'Novo Plano'}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
              placeholder="Nome do Plano"
              className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />
            <input
              value={form.price}
              onChange={e => setForm(current => ({ ...current, price: e.target.value }))}
              placeholder="Valor (R$)"
              type="number"
              step="0.01"
              className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />
            <input
              value={form.maxDevices}
              onChange={e => setForm(current => ({ ...current, maxDevices: e.target.value }))}
              placeholder="Máx. Dispositivos"
              type="number"
              className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />
            <input
              value={form.durationDays}
              onChange={e => setForm(current => ({ ...current, durationDays: e.target.value }))}
              placeholder="Duração (dias)"
              type="number"
              className="input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={savePlan} className="btn-neon px-4 py-2 text-sm">Salvar</button>
            <button onClick={resetForm} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {plans.map(plan => (
          <div key={plan.id} className={`premium-card rounded-[1.35rem] p-5 hover:border-neon-orange/30 transition-all ${plan.price === 0 ? 'border-active-green/30' : 'border-white/10'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-black text-text-white">{plan.name}</h3>
              <StatusBadge status={plan.status} />
            </div>

            <div className="text-3xl font-extrabold text-neon-orange mb-1">
              {plan.price === 0 ? 'GRÁTIS' : `R$ ${plan.price.toFixed(2)}`}
            </div>

            <p className="text-text-gray/60 text-xs mb-4">/mês</p>

            <div className="space-y-2 text-sm">
              <InfoLine>{plan.maxDevices} dispositivo{plan.maxDevices > 1 ? 's' : ''}</InfoLine>
              <InfoLine>{plan.durationDays} dias</InfoLine>
              <InfoLine>Suporte incluso</InfoLine>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => openEditPlan(plan)} className="flex-1 bg-white/[0.04] border border-white/10 text-text-gray py-2 rounded-lg text-xs hover:border-neon-orange/50">
                ✏️ Editar
              </button>
              <button onClick={() => togglePlanStatus(plan)} className="flex-1 bg-white/[0.04] border border-white/10 text-text-gray py-2 rounded-lg text-xs hover:border-neon-cyan/50">
                {plan.status === 'active' ? 'Desativar' : 'Ativar'}
              </button>
              <button onClick={() => removePlan(plan)} className="flex-1 bg-white/[0.04] border border-white/10 text-text-gray py-2 rounded-lg text-xs hover:border-error-red/50">
                🗑️ Remover
              </button>
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

  const [adminPlaylists, setAdminPlaylists] = useState<Playlist[]>(playlists);
  const [showAdd, setShowAdd] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
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
    setEditingPlaylistId(null);
    setShowAdd(false);
  };

  const openNewPlaylist = () => {
    setMessage(null);
    setError(null);
    resetForm();
    setShowAdd(true);
  };

  const openEditPlaylist = (playlist: Playlist) => {
    setMessage(null);
    setError(null);
    setEditingPlaylistId(playlist.id);
    setPlaylistName(playlist.name);
    setPlaylistType(playlist.type === 'm3u' ? 'm3u' : playlist.type === 'xtream' ? 'xtream' : 'stalker');
    setPlaylistUrl(playlist.url ?? '');
    setM3uContent('');
    setShowAdd(true);
  };

  const handleSavePlaylist = async () => {
    setMessage(null);
    setError(null);

    const name = playlistName.trim();
    const url = playlistUrl.trim();
    const pastedContent = m3uContent.trim();

    if (!name) {
      setError('Informe o nome da lista.');
      return;
    }

    if (playlistType !== 'm3u') {
      setError('Por enquanto, a importação automática está ativa apenas para listas M3U autorizadas. Xtream/Stalker entram em uma próxima fase.');
      return;
    }

    if (!url && !pastedContent && !editingPlaylistId) {
      setError('Informe uma URL M3U ou cole o conteúdo da lista.');
      return;
    }

    if (url && !/^https?:\/\//i.test(url)) {
      setError('A URL precisa começar com http:// ou https://');
      return;
    }

    if (url.startsWith('http://') && window.location.protocol === 'https:') {
      setError('URL HTTP bloqueada em HTTPS. Use HTTPS ou cole o conteúdo M3U manualmente.');
      return;
    }

    if (editingPlaylistId) {
      setAdminPlaylists(current =>
        current.map(item =>
          item.id === editingPlaylistId
            ? { ...item, name, type: playlistType, url, lastSync: todayLabel() }
            : item
        )
      );
      setMessage('Lista atualizada.');
      resetForm();
      return;
    }

    setIsAdding(true);

    try {
      let content = pastedContent;
      if (!content && url) content = await fetchM3UContent(url);

      const result = content.trim()
        ? importM3UPlaylist(name, url, content)
        : addDirectStreamChannel(name, url);

      const playlist: Playlist = {
        id: newId('playlist'),
        name,
        type: 'm3u',
        url,
        status: 'active',
        channelCount: result.imported,
        movieCount: 0,
        seriesCount: 0,
        lastSync: todayLabel(),
      };

      setAdminPlaylists(current => [playlist, ...current]);
      setMessage(`Lista adicionada: ${result.imported} canal(is) importado(s).`);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar a lista.');
    } finally {
      setIsAdding(false);
    }
  };

  const testPlaylist = (playlist: Playlist) => {
    setAdminPlaylists(current =>
      current.map(item =>
        item.id === playlist.id
          ? { ...item, status: playlist.url || item.channelCount > 0 ? 'active' : 'error', lastSync: todayLabel() }
          : item
      )
    );
    setMessage(`Teste concluído para ${playlist.name}.`);
  };

  const removePlaylist = (playlist: Playlist) => {
    setAdminPlaylists(current => current.filter(item => item.id !== playlist.id));
    setMessage(`Lista removida: ${playlist.name}`);
    if (editingPlaylistId === playlist.id) resetForm();
  };

  return (
    <div>
      <AdminHeader title="Listas de Reprodução">
        <button onClick={openNewPlaylist} className="btn-neon px-4 py-2 text-sm">
          + Nova Lista
        </button>
      </AdminHeader>

      <AdminNotice tone="warning">
        ⚖️ <strong>Aviso:</strong> Cadastre apenas listas e fontes autorizadas. O app não fornece canais, filmes, séries ou listas.
      </AdminNotice>

      {message && <AdminNotice tone="success">{message}</AdminNotice>}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {showAdd && (
        <div className="glass-panel rounded-[1.35rem] border-neon-orange/30 p-4 mb-4 animate-scale-in">
          <h3 className="mb-3 text-xl font-black text-text-white">
            {editingPlaylistId ? 'Editar Lista' : 'Nova Lista'}
          </h3>

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
              onClick={handleSavePlaylist}
              disabled={isAdding}
              className="btn-neon px-4 py-2 text-sm disabled:opacity-50"
            >
              {isAdding ? 'Salvando...' : editingPlaylistId ? 'Salvar' : 'Adicionar'}
            </button>

            <button onClick={resetForm} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">
              Cancelar
            </button>
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
            {adminPlaylists.map(playlist => (
              <tr key={playlist.id} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                <td className="px-4 py-3">
                  <p className="text-text-white text-sm font-medium">{playlist.name}</p>
                  <p className="text-text-gray/50 text-[10px]">Sync: {playlist.lastSync}</p>
                </td>
                <td className="px-4 py-3 text-text-gray text-sm">{playlist.type.toUpperCase()}</td>
                <td className="px-4 py-3 text-text-white text-sm">{playlist.channelCount}</td>
                <td className="px-4 py-3 text-text-white text-sm">{playlist.movieCount}/{playlist.seriesCount}</td>
                <td className="px-4 py-3"><StatusBadge status={playlist.status} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => testPlaylist(playlist)} className="rounded-lg border border-neon-cyan/25 bg-neon-cyan/10 px-3 py-1 text-xs font-black text-neon-cyan hover:border-neon-orange/50 hover:text-neon-orange">
                      Testar
                    </button>
                    <button onClick={() => openEditPlaylist(playlist)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-text-gray hover:border-neon-orange/50 hover:text-neon-orange">
                      Editar
                    </button>
                    <button onClick={() => removePlaylist(playlist)} className="rounded-lg border border-error-red/25 bg-error-red/10 px-3 py-1 text-xs font-black text-error-red hover:bg-error-red/20">
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {adminPlaylists.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-gray text-sm">
                  Nenhuma lista cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== NOTICES SCREEN =====
export function AdminNotices() {
  const [adminNotices, setAdminNotices] = useState<Notice[]>(mockNotices);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [target, setTarget] = useState<'all' | string>('all');
  const [message, setMessage] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setNoticeMessage('');
    setTarget('all');
    setShowAdd(false);
  };

  const sendNotice = () => {
    const cleanTitle = title.trim();
    const cleanMessage = noticeMessage.trim();

    if (!cleanTitle || !cleanMessage) {
      setMessage('Preencha título e mensagem.');
      return;
    }

    const notice: Notice = {
      id: newId('notice'),
      title: cleanTitle,
      message: cleanMessage,
      target,
      active: true,
      createdAt: todayDate(),
    };

    setAdminNotices(current => [notice, ...current]);
    setMessage('Aviso enviado.');
    resetForm();
  };

  const toggleNotice = (notice: Notice) => {
    setAdminNotices(current =>
      current.map(item =>
        item.id === notice.id ? { ...item, active: !item.active } : item
      )
    );
    setMessage(`${notice.title}: ${notice.active ? 'desativado' : 'ativado'}.`);
  };

  const removeNotice = (notice: Notice) => {
    setAdminNotices(current => current.filter(item => item.id !== notice.id));
    setMessage(`Aviso removido: ${notice.title}`);
  };

  return (
    <div>
      <AdminHeader title="Avisos">
        <button onClick={() => setShowAdd(!showAdd)} className="btn-neon px-4 py-2 text-sm">
          + Novo Aviso
        </button>
      </AdminHeader>

      {message && <AdminNotice tone={message.includes('Preencha') ? 'error' : 'success'}>{message}</AdminNotice>}

      {showAdd && (
        <div className="glass-panel rounded-[1.35rem] border-neon-orange/30 p-4 mb-4 animate-scale-in">
          <h3 className="mb-3 text-xl font-black text-text-white">Novo Aviso</h3>

          <div className="space-y-3">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título do Aviso"
              className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            />

            <textarea
              value={noticeMessage}
              onChange={e => setNoticeMessage(e.target.value)}
              placeholder="Mensagem do aviso..."
              rows={3}
              className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none resize-none"
            />

            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="w-full input-dark rounded-lg px-3 py-2 text-text-white text-sm focus:border-neon-orange focus:outline-none"
            >
              <option value="all">Todos os clientes</option>
              <option value="expiring">Apenas vencendo</option>
              <option value="expired">Apenas vencidos</option>
            </select>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={sendNotice} className="btn-neon px-4 py-2 text-sm">
              Enviar Aviso
            </button>
            <button onClick={resetForm} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {adminNotices.map(notice => (
          <div key={notice.id} className={`premium-card rounded-[1.35rem] p-4 ${notice.active ? 'border-neon-orange/30' : 'border-white/10 opacity-60'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-text-white font-bold">{notice.title}</h3>
              <div className="flex items-center gap-2">
                <StatusBadge status={notice.active ? 'active' : 'inactive'} />
                <span className="text-text-gray/50 text-xs">{notice.createdAt}</span>
              </div>
            </div>

            <p className="text-text-gray text-sm mb-3">{notice.message}</p>

            <div className="flex items-center justify-between">
              <span className="text-text-gray/50 text-xs">Destino: {notice.target === 'all' ? 'Todos' : notice.target}</span>

              <div className="flex gap-2">
                <button onClick={() => toggleNotice(notice)} className="rounded-lg border border-neon-cyan/25 bg-neon-cyan/10 px-3 py-1 text-xs font-black text-neon-cyan hover:border-neon-orange/50 hover:text-neon-orange">
                  {notice.active ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => removeNotice(notice)} className="rounded-lg border border-error-red/25 bg-error-red/10 px-3 py-1 text-xs font-black text-error-red hover:bg-error-red/20">
                  Remover
                </button>
              </div>
            </div>
          </div>
        ))}

        {adminNotices.length === 0 && (
          <div className="premium-card rounded-[1.35rem] p-6 text-center text-text-gray">
            Nenhum aviso cadastrado.
          </div>
        )}
      </div>
    </div>
  );
}

// ===== LOGS SCREEN =====
export function AdminLogs() {
  const [adminLogs, setAdminLogs] = useState<LogEntry[]>(mockLogs);
  const [filter, setFilter] = useState<'all' | 'admin' | 'system' | 'customer'>('all');

  const filtered = adminLogs.filter(log => filter === 'all' || log.actorType === filter);

  const clearLogs = () => setAdminLogs([]);

  const actorIcon = (type: string) => {
    const icons: Record<string, string> = { admin: '👑', system: '🤖', customer: '👤' };
    return icons[type] || '📝';
  };

  return (
    <div>
      <AdminHeader title="Logs">
        <button onClick={clearLogs} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-text-gray hover:border-neon-orange/50">
          🗑️ Limpar Logs
        </button>
      </AdminHeader>

      <div className="flex gap-2 mb-4">
        {(['all', 'admin', 'system', 'customer'] as const).map(item => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === item
                ? 'bg-neon-orange text-bg-primary'
                : 'bg-white/[0.04] border border-white/10 text-text-gray hover:border-neon-orange/50'
            }`}
          >
            {item === 'all' ? 'Todos' : item === 'admin' ? '👑 Admin' : item === 'system' ? '🤖 Sistema' : '👤 Cliente'}
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
            {filtered.map(log => (
              <tr key={log.id} className="border-b border-white/10 hover:bg-white/[0.06] transition-colors">
                <td className="px-4 py-3">
                  <span className="text-sm">{actorIcon(log.actorType)}</span>
                  <span className="text-text-gray text-xs ml-2 capitalize">{log.actorType}</span>
                </td>
                <td className="px-4 py-3 text-text-white text-sm">{log.action}</td>
                <td className="px-4 py-3 text-text-gray/60 text-xs">{log.metadata || '—'}</td>
                <td className="px-4 py-3 text-text-gray/50 text-xs">{log.createdAt}</td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-gray text-sm">
                  Nenhum log encontrado.
                </td>
              </tr>
            )}
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
            <SettingLine label="Validação de dispositivo" value="Ativo" />
            <SettingLine label="Token de acesso" value="Ativo" />
            <SettingLine label="Bloqueio remoto" value="Ativo" />
            <SettingLine label="Limite por dispositivo" value="Ativo" />
            <SettingLine label="Proteção contra compartilhamento" value="Ativo" />
          </div>
        </div>

        <div className="premium-card rounded-[1.35rem] p-4">
          <h3 className="mb-3 text-xl font-black text-text-white">📱 Aplicativo</h3>
          <div className="space-y-3">
            <SettingLine label="Versão mínima" value="1.0.0" neutral />
            <SettingLine label="Validação online" value="A cada 6h" neutral />
            <SettingLine label="Forçar atualização" value="Desativado" inactive />
            <SettingLine label="Manutenção" value="Desativado" inactive />
          </div>
        </div>

        <div className="premium-card rounded-[1.35rem] p-4">
          <h3 className="mb-3 text-xl font-black text-text-white">💬 Comunicação</h3>
          <div className="space-y-3">
            <SettingLine label="WhatsApp suporte" value="+55 11 99999-9999" cyan />
            <SettingLine label="Aviso automático vencimento" value="Ativo" />
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

function AdminHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-4xl font-black text-text-white">{title}</h1>
      {children}
    </div>
  );
}

function AdminNotice({ children, tone }: { children: ReactNode; tone: 'success' | 'error' | 'warning' }) {
  const className =
    tone === 'success'
      ? 'border-active-green/25 bg-active-green/10 text-active-green'
      : tone === 'error'
        ? 'border-error-red/25 bg-error-red/10 text-error-red'
        : 'border-alert-yellow/25 bg-alert-yellow/10 text-alert-yellow';

  return (
    <div className={`rounded-[1.35rem] border p-3 mb-4 ${className}`}>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function InfoLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-active-green">✓</span>
      <span className="text-text-gray">{children}</span>
    </div>
  );
}

function SettingLine({
  label,
  value,
  neutral,
  inactive,
  cyan,
}: {
  label: string;
  value: string;
  neutral?: boolean;
  inactive?: boolean;
  cyan?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-gray text-sm">{label}</span>
      <span className={`text-xs ${cyan ? 'text-neon-cyan' : inactive ? 'text-text-gray' : neutral ? 'text-text-white' : 'text-active-green'}`}>
        {value}
      </span>
    </div>
  );
}
