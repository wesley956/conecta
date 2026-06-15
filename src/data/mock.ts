import type { Channel, ChannelCategory, Movie, Series, Customer, Device, Plan, Playlist, Notice, LogEntry, WatchHistory } from '@/types';

// ===== CHANNEL CATEGORIES =====
export const channelCategories: ChannelCategory[] = [
  { id: 'all', name: 'Todos', icon: '📺', count: 48 },
  { id: 'favorites', name: 'Favoritos', icon: '⭐', count: 5 },
  { id: 'open', name: 'Abertos', icon: '📡', count: 12 },
  { id: 'news', name: 'Notícias', icon: '📰', count: 8 },
  { id: 'movies', name: 'Filmes', icon: '🎬', count: 6 },
  { id: 'series', name: 'Séries', icon: '🎥', count: 4 },
  { id: 'kids', name: 'Infantil', icon: '🧸', count: 5 },
  { id: 'sports', name: 'Esportes', icon: '⚽', count: 7 },
  { id: 'docs', name: 'Documentários', icon: '🔬', count: 3 },
  { id: 'religious', name: 'Religiosos', icon: '⛪', count: 4 },
  { id: 'music', name: 'Música', icon: '🎵', count: 6 },
  { id: 'variety', name: 'Variedades', icon: '🎭', count: 5 },
];

// ===== CHANNELS =====
export const channels: Channel[] = [
  { id: 'ch1', name: 'Canal Aberto HD', group: 'open', url: '', isFavorite: true },
  { id: 'ch2', name: 'TV Cultura', group: 'open', url: '', isFavorite: false },
  { id: 'ch3', name: 'TV Brasil', group: 'open', url: '', isFavorite: false },
  { id: 'ch4', name: 'Jornal 24h Demo', group: 'news', url: '', isFavorite: true },
  { id: 'ch5', name: 'Notícias Livre Demo', group: 'news', url: '', isFavorite: false },
  { id: 'ch6', name: 'Rede Notícias Demo', group: 'news', url: '', isFavorite: false },
  { id: 'ch7', name: 'Canal Informativo Demo', group: 'news', url: '', isFavorite: true },
  { id: 'ch8', name: 'Cine Premium Demo', group: 'movies', url: '', isFavorite: false },
  { id: 'ch9', name: 'Cine Ação Demo', group: 'movies', url: '', isFavorite: false },
  { id: 'ch10', name: 'Cine Max Demo', group: 'movies', url: '', isFavorite: true },
  { id: 'ch11', name: 'Cine Plus Demo', group: 'movies', url: '', isFavorite: false },
  { id: 'ch12', name: 'Séries Plus Demo', group: 'series', url: '', isFavorite: false },
  { id: 'ch13', name: 'Ação Séries Demo', group: 'series', url: '', isFavorite: false },
  { id: 'ch14', name: 'Cartoon Kids Demo', group: 'kids', url: '', isFavorite: false },
  { id: 'ch15', name: 'Mundo Kids Demo', group: 'kids', url: '', isFavorite: false },
  { id: 'ch16', name: 'Nick Kids Demo', group: 'kids', url: '', isFavorite: false },
  { id: 'ch17', name: 'Arena Sports Demo', group: 'sports', url: '', isFavorite: true },
  { id: 'ch18', name: 'Esporte Total Demo', group: 'sports', url: '', isFavorite: false },
  { id: 'ch19', name: 'Sports Max Demo', group: 'sports', url: '', isFavorite: false },
  { id: 'ch20', name: 'Esporte Brasil Demo', group: 'sports', url: '', isFavorite: false },
  { id: 'ch21', name: 'Doc Natureza Demo', group: 'docs', url: '', isFavorite: false },
  { id: 'ch22', name: 'Mundo Geo Demo', group: 'docs', url: '', isFavorite: false },
  { id: 'ch23', name: 'História Retrô TV Demo Demo', group: 'docs', url: '', isFavorite: false },
  { id: 'ch24', name: 'Rede Vida', group: 'religious', url: '', isFavorite: false },
  { id: 'ch25', name: 'Canção Nova', group: 'religious', url: '', isFavorite: false },
  { id: 'ch26', name: 'Música Jovem Demo', group: 'music', url: '', isFavorite: false },
  { id: 'ch27', name: 'Clássicos Music Demo', group: 'music', url: '', isFavorite: false },
  { id: 'ch28', name: 'Music Box', group: 'music', url: '', isFavorite: false },
  { id: 'ch29', name: 'Variedades Show Demo', group: 'variety', url: '', isFavorite: false },
  { id: 'ch30', name: 'Casa e Estilo Demo', group: 'variety', url: '', isFavorite: false },
  { id: 'ch31', name: 'Retrô TV Demo', group: 'variety', url: '', isFavorite: false },
  { id: 'ch32', name: 'Canal Aberto 2 HD', group: 'open', url: '', isFavorite: false },
  { id: 'ch33', name: 'Canal Aberto 3 HD', group: 'open', url: '', isFavorite: false },
  { id: 'ch34', name: 'Canal Aberto 4 HD', group: 'open', url: '', isFavorite: false },
  { id: 'ch35', name: 'Cine Explosão Demo', group: 'movies', url: '', isFavorite: false },
  { id: 'ch36', name: 'Cine Clássico Demo', group: 'movies', url: '', isFavorite: false },
  { id: 'ch37', name: 'Estádio Plus Demo', group: 'sports', url: '', isFavorite: false },
  { id: 'ch38', name: 'Bebê TV Demo', group: 'kids', url: '', isFavorite: false },
  { id: 'ch39', name: 'Kids Ciência Demo', group: 'kids', url: '', isFavorite: false },
  { id: 'ch40', name: 'Mundo Educativo Demo', group: 'kids', url: '', isFavorite: false },
  { id: 'ch41', name: 'Palco Music Demo', group: 'music', url: '', isFavorite: false },
  { id: 'ch42', name: 'Cine Mix Demo', group: 'movies', url: '', isFavorite: false },
  { id: 'ch43', name: 'Universal Séries Demo', group: 'series', url: '', isFavorite: false },
  { id: 'ch44', name: 'Warner Demo', group: 'series', url: '', isFavorite: false },
  { id: 'ch45', name: 'Ação & Estilo Demo', group: 'series', url: '', isFavorite: false },
  { id: 'ch46', name: 'APAE TV', group: 'variety', url: '', isFavorite: false },
  { id: 'ch47', name: 'TV Aparecida', group: 'religious', url: '', isFavorite: false },
  { id: 'ch48', name: 'Internacional', group: 'variety', url: '', isFavorite: false },
];

// ===== MOVIE CATEGORIES =====
export const movieCategories = [
  'Todos', 'Ação', 'Comédia', 'Drama', 'Ficção Científica', 'Terror', 'Romance', 'Animação', 'Documentário', 'Aventura'
];

// ===== MOVIES =====
export const movies: Movie[] = [
  { id: 'mv1', name: 'Horizonte Digital', year: 2024, duration: '2h 15min', synopsis: 'Em um futuro próximo, um hacker descobre uma verdade que pode mudar o mundo digital para sempre.', category: 'Ficção Científica', isFavorite: true, progress: 35 },
  { id: 'mv2', name: 'A Última Fronteira', year: 2024, duration: '1h 52min', synopsis: 'Uma equipe de exploradores parte em uma missão para os confins do espaço conhecido.', category: 'Aventura', isFavorite: false, progress: 0 },
  { id: 'mv3', name: 'Código Neon', year: 2023, duration: '2h 05min', synopsis: 'Na cidade iluminada por neon, um detetive busca resolver o crime mais complexo de sua carreira.', category: 'Ação', isFavorite: true, progress: 72 },
  { id: 'mv4', name: 'Risos na Escuridão', year: 2024, duration: '1h 40min', synopsis: 'Uma comédia que mostra o lado engraçado das situações mais improváveis da vida.', category: 'Comédia', isFavorite: false, progress: 0 },
  { id: 'mv5', name: 'Ecos do Passado', year: 2023, duration: '2h 20min', synopsis: 'Uma história emocionante sobre memórias, perdas e a busca pela redenção.', category: 'Drama', isFavorite: false, progress: 15 },
  { id: 'mv6', name: 'Sombras Virtuais', year: 2024, duration: '1h 55min', synopsis: 'Quando a realidade virtual e a realidade se misturam, nada é o que parece.', category: 'Terror', isFavorite: false, progress: 0 },
  { id: 'mv7', name: 'Estrelas de Amor', year: 2023, duration: '1h 48min', synopsis: 'Dois astrônomos descobrem que o amor pode ser tão vasto quanto o universo.', category: 'Romance', isFavorite: true, progress: 50 },
  { id: 'mv8', name: 'O Mundo Mágico', year: 2024, duration: '1h 35min', synopsis: 'Uma aventura animada que encanta crianças e adultos com sua magia e beleza.', category: 'Animação', isFavorite: false, progress: 0 },
  { id: 'mv9', name: 'Profundezas', year: 2023, duration: '1h 42min', synopsis: 'Um documentário fascinante sobre os mistérios das profundezas oceânicas.', category: 'Documentário', isFavorite: false, progress: 0 },
  { id: 'mv10', name: 'Tempestade de Aço', year: 2024, duration: '2h 10min', synopsis: 'Em um mundo devastado pela guerra, um herói improvável surge das cinzas.', category: 'Ação', isFavorite: false, progress: 0 },
  { id: 'mv11', name: 'Conexão Perdida', year: 2024, duration: '1h 50min', synopsis: 'Quando toda a internet cai, a humanidade precisa redescobrir como viver conectada de verdade.', category: 'Ficção Científica', isFavorite: false, progress: 88 },
  { id: 'mv12', name: 'A Correnteza', year: 2023, duration: '1h 38min', synopsis: 'Uma família enfrenta as águas revoltas de um rio enquanto descobre os laços que os unem.', category: 'Drama', isFavorite: false, progress: 0 },
];

// ===== SERIES =====
export const series: Series[] = [
  {
    id: 'sr1', name: 'Neon Nights', category: 'Ficção Científica', synopsis: 'Em uma metrópole futurista, um grupo de rebeldes luta contra a opressão corporativa usando tecnologia proibida.',
    isFavorite: true, progress: 40,
    seasons: [
      { number: 1, episodes: [
        { id: 'ep1', number: 1, name: 'O Despertar', url: '', duration: '45min', progress: 100 },
        { id: 'ep2', number: 2, name: 'Sinais', url: '', duration: '42min', progress: 100 },
        { id: 'ep3', number: 3, name: 'Conexão', url: '', duration: '48min', progress: 65 },
        { id: 'ep4', number: 4, name: 'Fraturas', url: '', duration: '44min', progress: 0 },
        { id: 'ep5', number: 5, name: 'Revelação', url: '', duration: '46min', progress: 0 },
      ]},
      { number: 2, episodes: [
        { id: 'ep6', number: 1, name: 'Novo Amanhecer', url: '', duration: '50min', progress: 0 },
        { id: 'ep7', number: 2, name: 'Resistência', url: '', duration: '45min', progress: 0 },
        { id: 'ep8', number: 3, name: 'O Cruzamento', url: '', duration: '47min', progress: 0 },
      ]},
    ]
  },
  {
    id: 'sr2', name: 'Diário Digital', category: 'Drama', synopsis: 'A vida de uma jovem programadora que descobre segredos escondidos no código de uma rede social.',
    isFavorite: false, progress: 20,
    seasons: [
      { number: 1, episodes: [
        { id: 'ep9', number: 1, name: 'Primeiro Login', url: '', duration: '40min', progress: 100 },
        { id: 'ep10', number: 2, name: 'Bug Oculto', url: '', duration: '38min', progress: 30 },
        { id: 'ep11', number: 3, name: 'Stack Overflow', url: '', duration: '42min', progress: 0 },
      ]},
    ]
  },
  {
    id: 'sr3', name: 'Guerreiros do Stream', category: 'Ação', synopsis: 'Equipe de elite especializada em proteger servidores críticos contra ataques cibernéticos.',
    isFavorite: true, progress: 0,
    seasons: [
      { number: 1, episodes: [
        { id: 'ep12', number: 1, name: 'Protocolo Zero', url: '', duration: '52min', progress: 0 },
        { id: 'ep13', number: 2, name: 'Firewall', url: '', duration: '48min', progress: 0 },
      ]},
    ]
  },
  {
    id: 'sr4', name: 'Risada em Série', category: 'Comédia', synopsis: 'Comédia sobre os bastidores de um programa de TV que tenta não ser cancelado.',
    isFavorite: false, progress: 55,
    seasons: [
      { number: 1, episodes: [
        { id: 'ep14', number: 1, name: 'Piloto', url: '', duration: '30min', progress: 100 },
        { id: 'ep15', number: 2, name: 'Audiência', url: '', duration: '28min', progress: 100 },
        { id: 'ep16', number: 3, name: 'Cancelado?', url: '', duration: '32min', progress: 55 },
      ]},
    ]
  },
  {
    id: 'sr5', name: 'Além do Código', category: 'Suspense', synopsis: 'Um detetive virtual investiga crimes que acontecem apenas no mundo digital.',
    isFavorite: false, progress: 0,
    seasons: [
      { number: 1, episodes: [
        { id: 'ep17', number: 1, name: 'Log 001', url: '', duration: '45min', progress: 0 },
        { id: 'ep18', number: 2, name: 'TraceRoute', url: '', duration: '43min', progress: 0 },
      ]},
    ]
  },
];

// ===== PLAYLISTS =====
export const playlists: Playlist[] = [
  { id: 'pl1', name: 'Lista Principal', type: 'm3u', status: 'active', channelCount: 48, movieCount: 12, seriesCount: 5, lastSync: '2025-01-15 10:30' },
  { id: 'pl2', name: 'Lista Esportes', type: 'xtream', status: 'active', channelCount: 15, movieCount: 0, seriesCount: 0, lastSync: '2025-01-14 18:00' },
  { id: 'pl3', name: 'Lista Infantil', type: 'm3u', status: 'active', channelCount: 8, movieCount: 20, seriesCount: 3, lastSync: '2025-01-13 09:15' },
];

// ===== ADMIN DATA =====

export const customers: Customer[] = [
  { id: 'c1', name: 'João Silva', phone: '(11) 99999-1111', email: 'joao@email.com', status: 'active', planId: 'p2', expiresAt: '2025-02-28', deviceCount: 2, createdAt: '2024-06-15' },
  { id: 'c2', name: 'Maria Santos', phone: '(21) 98888-2222', email: 'maria@email.com', status: 'active', planId: 'p1', expiresAt: '2025-01-31', deviceCount: 1, createdAt: '2024-08-20' },
  { id: 'c3', name: 'Carlos Oliveira', phone: '(31) 97777-3333', email: 'carlos@email.com', status: 'expired', planId: 'p3', expiresAt: '2025-01-05', deviceCount: 3, createdAt: '2024-03-10' },
  { id: 'c4', name: 'Ana Costa', phone: '(41) 96666-4444', email: 'ana@email.com', status: 'blocked', planId: 'p1', expiresAt: '2024-12-31', deviceCount: 1, notes: 'Violação de termos', createdAt: '2024-05-22' },
  { id: 'c5', name: 'Pedro Lima', phone: '(51) 95555-5555', email: 'pedro@email.com', status: 'active', planId: 'p4', expiresAt: '2025-03-15', deviceCount: 4, createdAt: '2024-07-01' },
  { id: 'c6', name: 'Lucia Ferreira', phone: '(61) 94444-6666', email: 'lucia@email.com', status: 'active', planId: 'p2', expiresAt: '2025-02-10', deviceCount: 2, createdAt: '2024-09-18' },
  { id: 'c7', name: 'Roberto Alves', phone: '(71) 93333-7777', email: 'roberto@email.com', status: 'expired', planId: 'p1', expiresAt: '2024-12-25', deviceCount: 1, createdAt: '2024-04-30' },
  { id: 'c8', name: 'Fernanda Dias', phone: '(81) 92222-8888', email: 'fernanda@email.com', status: 'active', planId: 'p3', expiresAt: '2025-04-01', deviceCount: 3, createdAt: '2024-10-05' },
];

export const devices: Device[] = [
  { id: 'd1', deviceCode: 'RPTV-A1B2C3', deviceType: 'tvbox', customerId: 'c1', customerName: 'João Silva', status: 'active', lastSeenAt: '2025-01-15 22:30', ip: '189.xxx.xxx.1', appVersion: '1.0.0', createdAt: '2024-06-15' },
  { id: 'd2', deviceCode: 'RPTV-D4E5F6', deviceType: 'celular', customerId: 'c1', customerName: 'João Silva', status: 'active', lastSeenAt: '2025-01-15 20:15', ip: '189.xxx.xxx.2', appVersion: '1.0.0', createdAt: '2024-06-20' },
  { id: 'd3', deviceCode: 'RPTV-G7H8I9', deviceType: 'androidtv', customerId: 'c2', customerName: 'Maria Santos', status: 'active', lastSeenAt: '2025-01-15 21:00', ip: '200.xxx.xxx.1', appVersion: '1.0.0', createdAt: '2024-08-20' },
  { id: 'd4', deviceCode: 'RPTV-J1K2L3', deviceType: 'tvbox', customerId: 'c3', customerName: 'Carlos Oliveira', status: 'blocked', lastSeenAt: '2025-01-05 18:00', ip: '177.xxx.xxx.1', appVersion: '0.9.5', createdAt: '2024-03-10' },
  { id: 'd5', deviceCode: 'RPTV-M4N5O6', deviceType: 'celular', customerId: 'c3', customerName: 'Carlos Oliveira', status: 'active', lastSeenAt: '2025-01-05 17:30', ip: '177.xxx.xxx.2', appVersion: '1.0.0', createdAt: '2024-03-15' },
  { id: 'd6', deviceCode: 'RPTV-P7Q8R9', deviceType: 'tablet', customerId: 'c4', customerName: 'Ana Costa', status: 'blocked', lastSeenAt: '2024-12-31 10:00', ip: '150.xxx.xxx.1', appVersion: '0.9.5', createdAt: '2024-05-22' },
  { id: 'd7', deviceCode: 'RPTV-S1T2U3', deviceType: 'smarttv', customerId: 'c5', customerName: 'Pedro Lima', status: 'active', lastSeenAt: '2025-01-15 23:00', ip: '201.xxx.xxx.1', appVersion: '1.0.0', createdAt: '2024-07-01' },
  { id: 'd8', deviceCode: 'RPTV-V4W5X6', deviceType: 'celular', customerId: 'c5', customerName: 'Pedro Lima', status: 'pending', lastSeenAt: '2025-01-15 14:00', ip: '201.xxx.xxx.2', appVersion: '1.0.0', createdAt: '2025-01-15' },
  { id: 'd9', deviceCode: 'RPTV-Y7Z8A1', deviceType: 'tvbox', customerId: 'c5', customerName: 'Pedro Lima', status: 'active', lastSeenAt: '2025-01-14 22:00', ip: '201.xxx.xxx.3', appVersion: '1.0.0', createdAt: '2024-07-05' },
  { id: 'd10', deviceCode: 'RPTV-B2C3D4', deviceType: 'googletv', customerId: 'c5', customerName: 'Pedro Lima', status: 'active', lastSeenAt: '2025-01-13 20:30', ip: '201.xxx.xxx.4', appVersion: '1.0.0', createdAt: '2024-07-10' },
  { id: 'd11', deviceCode: 'RPTV-E5F6G7', deviceType: 'celular', status: 'pending', lastSeenAt: '2025-01-15 16:00', ip: '190.xxx.xxx.1', appVersion: '1.0.0', createdAt: '2025-01-15' },
  { id: 'd12', deviceCode: 'RPTV-H8I9J1', deviceType: 'tvbox', status: 'pending', lastSeenAt: '2025-01-15 12:00', ip: '172.xxx.xxx.1', appVersion: '1.0.0', createdAt: '2025-01-15' },
];

export const plans: Plan[] = [
  { id: 'p1', name: 'Básico', price: 14.90, maxDevices: 1, durationDays: 30, status: 'active' },
  { id: 'p2', name: 'Duplo', price: 24.90, maxDevices: 2, durationDays: 30, status: 'active' },
  { id: 'p3', name: 'Triplo', price: 34.90, maxDevices: 3, durationDays: 30, status: 'active' },
  { id: 'p4', name: 'Familiar', price: 49.90, maxDevices: 5, durationDays: 30, status: 'active' },
  { id: 'p5', name: 'Teste Grátis', price: 0, maxDevices: 1, durationDays: 3, status: 'active' },
];

export const notices: Notice[] = [
  { id: 'n1', title: 'Manutenção Programada', message: 'Manutenção programada hoje às 23h. O serviço pode ficar instável por até 30 minutos.', target: 'all', active: true, createdAt: '2025-01-15 10:00' },
  { id: 'n2', title: 'Renovação', message: 'Sua assinatura vence em 3 dias. Renove para continuar usando o aplicativo.', target: 'c3', active: true, createdAt: '2025-01-12 09:00' },
  { id: 'n3', title: 'Nova Atualização', message: 'Nova atualização disponível! Atualize para a versão 1.1.0 com melhorias no player.', target: 'all', active: true, createdAt: '2025-01-10 15:00' },
];

export const logs: LogEntry[] = [
  { id: 'l1', actorType: 'admin', actorId: 'admin1', action: 'Liberou dispositivo RPTV-A1B2C3', createdAt: '2025-01-15 22:35' },
  { id: 'l2', actorType: 'system', actorId: 'system', action: 'Assinatura expirada - Carlos Oliveira', createdAt: '2025-01-05 00:00' },
  { id: 'l3', actorType: 'admin', actorId: 'admin1', action: 'Bloqueou dispositivo RPTV-P7Q8R9', metadata: 'Violação de termos', createdAt: '2024-12-31 10:30' },
  { id: 'l4', actorType: 'system', actorId: 'system', action: 'Novo dispositivo registrado - RPTV-E5F6G7', createdAt: '2025-01-15 16:00' },
  { id: 'l5', actorType: 'admin', actorId: 'admin1', action: 'Criou plano Familiar', createdAt: '2024-06-01 09:00' },
  { id: 'l6', actorType: 'system', actorId: 'system', action: 'Sincronização de lista concluída', createdAt: '2025-01-15 10:30' },
  { id: 'l7', actorType: 'admin', actorId: 'admin1', action: 'Enviou aviso: Manutenção Programada', createdAt: '2025-01-15 10:00' },
  { id: 'l8', actorType: 'customer', actorId: 'c5', action: 'Novo dispositivo solicitado - RPTV-V4W5X6', createdAt: '2025-01-15 14:00' },
  { id: 'l9', actorType: 'system', actorId: 'system', action: 'Backup automático realizado', createdAt: '2025-01-15 03:00' },
  { id: 'l10', actorType: 'admin', actorId: 'admin1', action: 'Renovou assinatura - Fernanda Dias', createdAt: '2025-01-14 11:00' },
];

export const watchHistory: WatchHistory[] = [
  { id: 'wh1', contentType: 'channel', contentId: 'ch17', name: 'Arena Sports Demo', watchedAt: '2025-01-15 22:00', progress: undefined },
  { id: 'wh2', contentType: 'movie', contentId: 'mv3', name: 'Código Neon', watchedAt: '2025-01-15 20:00', progress: 72 },
  { id: 'wh3', contentType: 'episode', contentId: 'ep3', name: 'Neon Nights S1E3', watchedAt: '2025-01-15 18:00', progress: 65, seasonNum: 1, episodeNum: 3 },
  { id: 'wh4', contentType: 'movie', contentId: 'mv11', name: 'Conexão Perdida', watchedAt: '2025-01-14 21:00', progress: 88 },
  { id: 'wh5', contentType: 'channel', contentId: 'ch10', name: 'Cine Max Demo', watchedAt: '2025-01-14 19:00', progress: undefined },
  { id: 'wh6', contentType: 'movie', contentId: 'mv7', name: 'Estrelas de Amor', watchedAt: '2025-01-13 20:00', progress: 50 },
];

// ===== DEVICE CODE FOR DEMO =====
export const DEVICE_CODE = 'RPTV-X9Y8Z7';

// ===== LEGAL NOTICE =====
export const LEGAL_NOTICE = `RonecaPlayTV é um player IPTV/P2P legal. Este aplicativo NÃO fornece canais, filmes, séries, listas piratas, DRM bypass, desbloqueio de conteúdo pago ou qualquer conteúdo sem autorização. O usuário e/ou provedor é responsável por adicionar apenas listas e fontes autorizadas. O uso indevido é de inteira responsabilidade do usuário.`;
