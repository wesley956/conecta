# RonecaPlayTV - Database Schema

## Visão Geral

Este documento descreve o esquema do banco de dados do RonecaPlayTV.

**Banco de Dados:** PostgreSQL  
**ORM:** Prisma ou similar

## Tabelas

### users (Administradores)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### customers (Clientes)

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active, blocked, pending
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_email ON customers(email);
```

### devices (Dispositivos)

```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  device_code VARCHAR(50) UNIQUE NOT NULL,
  device_type VARCHAR(50) NOT NULL, -- mobile, tablet, tvbox, android_tv, google_tv
  app_version VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, blocked
  last_seen_at TIMESTAMP WITH TIME ZONE,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_devices_code ON devices(device_code);
CREATE INDEX idx_devices_customer ON devices(customer_id);
CREATE INDEX idx_devices_status ON devices(status);
```

### plans (Planos)

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  max_devices INTEGER DEFAULT 1,
  duration_days INTEGER DEFAULT 30,
  status VARCHAR(50) DEFAULT 'active',
  features JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_plans_status ON plans(status);
```

### subscriptions (Assinaturas)

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id),
  status VARCHAR(50) DEFAULT 'active', -- active, expired, cancelled
  starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  payment_method VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);
```

### playlists (Listas de Reprodução)

```sql
CREATE TABLE playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- m3u, xtream, stalker, local
  url_or_config TEXT,
  status VARCHAR(50) DEFAULT 'active',
  channels_count INTEGER DEFAULT 0,
  movies_count INTEGER DEFAULT 0,
  series_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_playlists_status ON playlists(status);
```

### customer_playlists (Vínculo Cliente-Playlist)

```sql
CREATE TABLE customer_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(customer_id, playlist_id)
);

CREATE INDEX idx_customer_playlists_customer ON customer_playlists(customer_id);
CREATE INDEX idx_customer_playlists_playlist ON customer_playlists(playlist_id);
```

### channels (Canais)

```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  logo_url VARCHAR(500),
  category VARCHAR(100),
  stream_url TEXT NOT NULL,
  epg_id VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_channels_playlist ON channels(playlist_id);
CREATE INDEX idx_channels_category ON channels(category);
CREATE INDEX idx_channels_active ON channels(is_active);
```

### movies (Filmes)

```sql
CREATE TABLE movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url VARCHAR(500),
  year INTEGER,
  duration INTEGER, -- em segundos
  category VARCHAR(100),
  stream_url TEXT NOT NULL,
  rating DECIMAL(3, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_movies_playlist ON movies(playlist_id);
CREATE INDEX idx_movies_category ON movies(category);
CREATE INDEX idx_movies_year ON movies(year);
```

### series (Séries)

```sql
CREATE TABLE series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url VARCHAR(500),
  year INTEGER,
  category VARCHAR(100),
  rating DECIMAL(3, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_series_playlist ON series(playlist_id);
CREATE INDEX idx_series_category ON series(category);
```

### seasons (Temporadas)

```sql
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(series_id, season_number)
);

CREATE INDEX idx_seasons_series ON seasons(series_id);
```

### episodes (Episódios)

```sql
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID REFERENCES seasons(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration INTEGER, -- em segundos
  stream_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(season_id, episode_number)
);

CREATE INDEX idx_episodes_season ON episodes(season_id);
```

### notices (Avisos)

```sql
CREATE TABLE notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  target VARCHAR(50) DEFAULT 'all', -- all, customer, device
  target_id UUID,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notices_active ON notices(active);
CREATE INDEX idx_notices_target ON notices(target, target_id);
```

### logs (Logs do Sistema)

```sql
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type VARCHAR(50) NOT NULL, -- admin, customer, system
  actor_id UUID,
  action VARCHAR(100) NOT NULL,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_logs_actor ON logs(actor_type, actor_id);
CREATE INDEX idx_logs_action ON logs(action);
CREATE INDEX idx_logs_created ON logs(created_at);
```

### watch_history (Histórico de Visualização)

```sql
CREATE TABLE watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL, -- channel, movie, series
  content_id UUID NOT NULL,
  content_name VARCHAR(255) NOT NULL,
  progress INTEGER DEFAULT 0, -- porcentagem
  watched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_history_device ON watch_history(device_id);
CREATE INDEX idx_history_content ON watch_history(content_type, content_id);
CREATE INDEX idx_history_watched ON watch_history(watched_at);
```

### favorites (Favoritos)

```sql
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL, -- channel, movie, series, category
  content_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(device_id, content_type, content_id)
);

CREATE INDEX idx_favorites_device ON favorites(device_id);
CREATE INDEX idx_favorites_content ON favorites(content_type, content_id);
```

### app_settings (Configurações do App)

```sql
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_settings_key ON app_settings(key);
```

## Views

### Customer Overview

```sql
CREATE VIEW customer_overview AS
SELECT 
  c.id,
  c.name,
  c.email,
  c.phone,
  c.status,
  COUNT(DISTINCT d.id) as devices_count,
  MAX(s.expires_at) as subscription_expires,
  s.status as subscription_status
FROM customers c
LEFT JOIN devices d ON d.customer_id = c.id
LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status = 'active'
GROUP BY c.id, c.name, c.email, c.phone, c.status, s.status, s.expires_at;
```

## Triggers

### Update Timestamp

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- (Repetir para outras tabelas conforme necessário)
```

## Seed Data

### Planos Padrão

```sql
INSERT INTO plans (name, description, price, max_devices, duration_days, status) VALUES
('Básico', '1 dispositivo', 14.90, 1, 30, 'active'),
('Standard', '2 dispositivos', 24.90, 2, 30, 'active'),
('Premium', '3 dispositivos', 34.90, 3, 30, 'active'),
('Familiar', 'Até 5 dispositivos', 49.90, 5, 30, 'active');
```

---

**Versão:** 1.0.0  
**Última atualização:** Janeiro 2024
