import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { AppLayout, Header, CategoryPills, BottomNav } from '@/components/shared';
import { channelCategories } from '@/data/mock';
import type { Channel } from '@/types';

const programs = [
  'Agora: programação ao vivo',
  'Jornal e informação',
  'Entretenimento premium',
  'Sessão especial',
  'Conteúdo autorizado',
  'Transmissão ao vivo',
];

function getProgram(channelName: string) {
  return programs[Math.abs(channelName.charCodeAt(0) * 7) % programs.length];
}

function getGroupName(group: string) {
  return channelCategories.find(c => c.id === group)?.name || group;
}

export function ChannelsScreen() {
  const { channels, setScreen, setCurrentChannel, toggleChannelFavorite } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [selectedChannel, setSelectedChannel] = useState<string | null>(channels[0]?.id ?? null);

  const categories = channelCategories.map(c => c.name);

  const filteredChannels = useMemo(() => {
    if (selectedCategory === 'Todos') return channels;
    if (selectedCategory === 'Favoritos') return channels.filter(channel => channel.isFavorite);
    const category = channelCategories.find(c => c.name === selectedCategory);
    if (!category) return channels;
    return channels.filter(channel => channel.group === category.id);
  }, [channels, selectedCategory]);

  const activeChannel = selectedChannel
    ? filteredChannels.find(channel => channel.id === selectedChannel) ?? filteredChannels[0] ?? null
    : filteredChannels[0] ?? null;

  const handlePlay = (channel: Channel) => {
    setCurrentChannel(channel);
    setScreen('player');
  };

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        <Header title="Canais ao Vivo" showBack showSearch onBack={() => setScreen('home')} />

        <main className="grid min-h-0 flex-1 grid-cols-[1fr_.72fr] gap-8">
          <section className="min-h-0">
            <div className="mb-5">
              <p className="text-sm uppercase tracking-[0.34em] text-neon-cyan/75">Ao vivo</p>
              <h2 className="text-4xl font-black text-text-white">Grade de canais</h2>
            </div>

            <CategoryPills categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />

            {filteredChannels.length === 0 ? (
              <div className="premium-card rounded-[1.5rem] p-12 text-center">
                <span className="text-6xl">📺</span>
                <h3 className="mt-4 text-2xl font-black text-text-white">Nenhum canal encontrado</h3>
                <p className="mt-2 text-text-gray">Tente outra categoria ou importe uma lista autorizada.</p>
              </div>
            ) : (
              <div className="grid gap-4 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 245px)' }}>
                {filteredChannels.map((channel, index) => (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedChannel(channel.id)}
                    onDoubleClick={() => handlePlay(channel)}
                    className={`premium-card flex items-center gap-5 rounded-[1.4rem] p-5 text-left transition-all ${
                      activeChannel?.id === channel.id ? 'selected glow-orange' : ''
                    }`}
                  >
                    <div className={`flex h-20 w-24 shrink-0 items-center justify-center rounded-2xl border text-4xl ${
                      activeChannel?.id === channel.id
                        ? 'border-neon-orange/60 bg-neon-orange/12'
                        : 'border-neon-cyan/20 bg-neon-cyan/8'
                    }`}>
                      {channel.logo ? <img src={channel.logo} alt="" className="h-full w-full object-contain p-3" /> : '📺'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-text-gray">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="truncate text-2xl font-black text-text-white">{channel.name}</h3>
                      </div>

                      <p className="truncate text-sm text-text-gray">{getProgram(channel.name)}</p>

                      <div className="mt-3 flex items-center gap-3">
                        <span className="rounded-full border border-active-green/25 bg-active-green/10 px-3 py-1 text-[0.68rem] font-black uppercase text-active-green">
                          ● ao vivo
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.68rem] font-bold uppercase text-text-gray">
                          {getGroupName(channel.group)}
                        </span>
                        {!channel.url && (
                          <span className="rounded-full border border-alert-yellow/25 bg-alert-yellow/10 px-3 py-1 text-[0.68rem] font-bold text-alert-yellow">
                            Sem URL
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleChannelFavorite(channel.id);
                      }}
                      className={`text-3xl transition-all ${channel.isFavorite ? 'text-alert-yellow' : 'text-white/25 hover:text-alert-yellow'}`}
                    >
                      {channel.isFavorite ? '⭐' : '☆'}
                    </button>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="min-h-0">
            <div className="glass-panel rounded-[1.7rem] p-6">
              {activeChannel ? (
                <>
                  <div className="relative mb-5 flex h-56 items-center justify-center overflow-hidden rounded-[1.5rem] border border-neon-cyan/25 bg-gradient-to-br from-neon-cyan/18 via-white/5 to-neon-orange/14">
                    <span className="text-8xl">📺</span>
                    <div className="absolute left-4 top-4 rounded-full border border-active-green/30 bg-active-green/15 px-3 py-1 text-xs font-black uppercase text-active-green">
                      ● ao vivo
                    </div>
                  </div>

                  <h3 className="text-3xl font-black text-text-white">{activeChannel.name}</h3>
                  <p className="mt-2 text-text-gray">{getProgram(activeChannel.name)}</p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <InfoTile label="Categoria" value={getGroupName(activeChannel.group)} />
                    <InfoTile label="Fonte" value={activeChannel.url ? 'Configurada' : 'Pendente'} highlight={!activeChannel.url} />
                  </div>

                  <button
                    onClick={() => handlePlay(activeChannel)}
                    className="btn-neon mt-6 w-full py-4 text-base"
                  >
                    Assistir agora
                  </button>

                  <button
                    onClick={() => toggleChannelFavorite(activeChannel.id)}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-text-white transition-all hover:border-alert-yellow/50 hover:text-alert-yellow"
                  >
                    {activeChannel.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                  </button>

                  <p className="mt-5 text-center text-[0.68rem] text-text-gray/60">
                    Use apenas canais e listas autorizadas pelo seu provedor.
                  </p>
                </>
              ) : (
                <p className="text-text-gray">Selecione um canal.</p>
              )}
            </div>
          </aside>
        </main>

        <BottomNav />
      </div>
    </AppLayout>
  );
}

function InfoTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[0.66rem] uppercase tracking-[0.22em] text-text-gray/65">{label}</p>
      <p className={`mt-2 truncate text-lg font-black ${highlight ? 'text-alert-yellow' : 'text-text-white'}`}>{value}</p>
    </div>
  );
}
