/* Arquitetura de adapters de WhatsApp:
     WhatsAppAdapter
     ├── MetaCloudAdapter        -> Cloud API OFICIAL, conexão via Meta
     └── ExternalProviderAdapter -> conector externo (ex.: QR Code), opção separada
   A interface não depende de um único fornecedor. Implementações reais NÃO
   são feitas nesta fase; apenas mocks, sem credenciais reais. */

export type WhatsAppConnectionKind = 'cloud_api' | 'qr_external';
export type WebhookState = 'active' | 'inactive' | 'pending';

export interface WhatsAppChannel {
  id: string;
  alias: string;       // ex.: "Chip 1"
  phone: string;       // ex.: "(11) 99955-1234"
  kind: WhatsAppConnectionKind;
  connected: boolean;
  webhook: WebhookState;
  /** fonte de aquisição registrada como padrão para leads deste número */
  source: string | null;
  lastSync: string | null;
  /** segredos jamais retornam aqui — apenas um rótulo de status */
  credentials: 'configured_securely' | 'not_configured';
}

export interface ConnectionTest {
  ok: boolean;
  latencyMs: number;
}

export interface WhatsAppAdapter {
  readonly kind: WhatsAppConnectionKind;
  readonly label: string;
  /** params nunca incluem segredos crus no frontend */
  connect(orgId: string, params: Record<string, unknown>): Promise<WhatsAppChannel>;
  getStatus(channelId: string): Promise<WhatsAppChannel>;
  testConnection(channelId: string): Promise<ConnectionTest>;
  sync(channelId: string): Promise<{ syncedAt: string }>;
  disconnect(channelId: string): Promise<void>;
}
