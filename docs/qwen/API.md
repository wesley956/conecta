# RonecaPlayTV - API Documentation

## Visão Geral

Esta documentação descreve a API do backend do RonecaPlayTV para integração com o aplicativo mobile/TV e painel administrativo.

**Base URL:** `https://api.ronecaplaytv.com/v1`

## Autenticação

A API utiliza token de autenticação no header:

```http
Authorization: Bearer <token>
```

## Endpoints

### Dispositivos

#### Registrar Dispositivo
```http
POST /devices/register
```

**Request:**
```json
{
  "device_code": "ABCD-1234",
  "device_type": "tvbox",
  "app_version": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "device_id": "uuid",
    "status": "pending",
    "message": "Aguardando liberação do administrador"
  }
}
```

#### Verificar Status do Dispositivo
```http
GET /devices/:device_code/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "approved",
    "customer_id": "uuid",
    "subscription": {
      "status": "active",
      "expires_at": "2024-12-31T23:59:59Z"
    }
  }
}
```

### Assinaturas

#### Verificar Assinatura
```http
GET /subscriptions/:customer_id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": {
      "name": "Premium",
      "max_devices": 3
    },
    "status": "active",
    "expires_at": "2024-12-31T23:59:59Z",
    "days_remaining": 30
  }
}
```

#### Renovar Assinatura
```http
POST /subscriptions/renew
```

**Request:**
```json
{
  "customer_id": "uuid",
  "plan_id": "uuid",
  "payment_method": "pix"
}
```

### Playlists

#### Listar Playlists do Cliente
```http
GET /customers/:customer_id/playlists
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Lista Principal",
      "type": "m3u",
      "status": "active",
      "channels_count": 100,
      "movies_count": 500,
      "series_count": 50
    }
  ]
}
```

#### Ativar Playlist
```http
POST /playlists/:playlist_id/activate
```

**Request:**
```json
{
  "device_id": "uuid"
}
```

### Conteúdo

#### Listar Canais
```http
GET /playlists/:playlist_id/channels
```

**Query Parameters:**
- `category` (optional): Filtrar por categoria
- `search` (optional): Buscar por nome
- `page` (optional): Paginação
- `limit` (optional): Limite por página

**Response:**
```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "id": "uuid",
        "name": "Canal Demo",
        "logo": "https://...",
        "category": "Abertos",
        "stream_url": "https://...",
        "epg": [...]
      }
    ],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 20
    }
  }
}
```

#### Listar Filmes
```http
GET /playlists/:playlist_id/movies
```

**Response:** Similar a canais, com campos de filmes

#### Listar Séries
```http
GET /playlists/:playlist_id/series
```

**Response:** Similar a canais, com campos de séries

### EPG

#### Obter EPG do Canal
```http
GET /channels/:channel_id/epg
```

**Query Parameters:**
- `date`: Data (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Jornal da Noite",
      "description": "Notícias do dia",
      "start": "2024-01-20T18:00:00Z",
      "end": "2024-01-20T19:00:00Z"
    }
  ]
}
```

### Favoritos

#### Adicionar Favorito
```http
POST /favorites
```

**Request:**
```json
{
  "device_id": "uuid",
  "type": "channel",
  "content_id": "uuid"
}
```

#### Remover Favorito
```http
DELETE /favorites/:id
```

#### Listar Favoritos
```http
GET /devices/:device_id/favorites
```

### Histórico

#### Adicionar ao Histórico
```http
POST /history
```

**Request:**
```json
{
  "device_id": "uuid",
  "type": "movie",
  "content_id": "uuid",
  "progress": 45
}
```

#### Obter Histórico
```http
GET /devices/:device_id/history
```

### Avisos

#### Listar Avisos
```http
GET /notices
```

**Query Parameters:**
- `device_id`: Filtrar por dispositivo
- `active`: Apenas ativos

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Manutenção Programada",
      "message": "Realizaremos manutenção...",
      "active": true,
      "created_at": "2024-01-20T10:00:00Z"
    }
  ]
}
```

### Configurações

#### Obter Configurações do App
```http
GET /app/settings
```

**Response:**
```json
{
  "success": true,
  "data": {
    "maintenance_mode": false,
    "min_app_version": "1.0.0",
    "force_update": false,
    "p2p_enabled": true
  }
}
```

## Códigos de Erro

| Código | Descrição |
|--------|-----------|
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Token inválido |
| 403 | Forbidden - Acesso negado |
| 404 | Not Found - Recurso não encontrado |
| 423 | Locked - Dispositivo bloqueado |
| 426 | Upgrade Required - Atualização necessária |
| 500 | Internal Server Error |

## Exemplo de Resposta de Erro

```json
{
  "success": false,
  "error": {
    "code": "DEVICE_BLOCKED",
    "message": "Este dispositivo foi bloqueado pelo administrador",
    "details": {
      "blocked_at": "2024-01-20T10:00:00Z",
      "reason": "Violação dos termos de uso"
    }
  }
}
```

## Rate Limiting

- **Padrão:** 100 requisições por minuto
- **Autenticação:** 1000 requisições por minuto
- **Download de conteúdo:** Sem limite

## Webhooks

O sistema pode enviar webhooks para eventos importantes:

- `subscription.created`
- `subscription.expired`
- `device.activated`
- `device.blocked`

## Segurança

- Todos os endpoints usam HTTPS
- Tokens expiram em 24 horas
- Refresh token disponível
- Rate limiting por IP e dispositivo
- Validação de origem das requisições

---

**Versão da API:** 1.0.0  
**Última atualização:** Janeiro 2024
