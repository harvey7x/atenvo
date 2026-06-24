import type { WhatsAppAdapter, WhatsAppChannel, WhatsAppConnectionKind, ConnectionTest } from '@/types/whatsapp';

const delay = (ms = 280) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => 'agora há pouco';

class BaseWhatsAppAdapter implements WhatsAppAdapter {
  constructor(
    readonly kind: WhatsAppConnectionKind,
    readonly label: string,
  ) {}

  async connect(_orgId: string, params: Record<string, unknown>): Promise<WhatsAppChannel> {
    await delay();
    return {
      id: 'wa_' + Math.random().toString(36).slice(2, 8),
      alias: (params.alias as string) ?? 'Novo número',
      phone: (params.phone as string) ?? '(11) 90000-0000',
      kind: this.kind,
      connected: true,
      webhook: 'active',
      source: (params.source as string) ?? null,
      lastSync: now(),
      credentials: 'configured_securely',
    };
  }
  async getStatus(channelId: string): Promise<WhatsAppChannel> {
    await delay(140);
    return {
      id: channelId, alias: 'Chip 1', phone: '(11) 99955-1234', kind: this.kind,
      connected: true, webhook: 'active', source: 'Tráfego 1', lastSync: now(),
      credentials: 'configured_securely',
    };
  }
  async testConnection(_channelId: string): Promise<ConnectionTest> {
    await delay(200);
    return { ok: true, latencyMs: 142 };
  }
  async sync(_channelId: string): Promise<{ syncedAt: string }> {
    await delay(260);
    return { syncedAt: now() };
  }
  async disconnect(_channelId: string): Promise<void> {
    await delay();
  }
}

/** Cloud API oficial — conexão via Meta. */
export const metaCloudAdapter: WhatsAppAdapter = new BaseWhatsAppAdapter('cloud_api', 'WhatsApp Cloud API (Meta)');

/** Conector externo (ex.: QR Code) — opção separada, não oficial. */
export const externalProviderAdapter: WhatsAppAdapter = new BaseWhatsAppAdapter('qr_external', 'Conector externo (QR Code)');

export const whatsappAdapters: Record<WhatsAppConnectionKind, WhatsAppAdapter> = {
  cloud_api: metaCloudAdapter,
  qr_external: externalProviderAdapter,
};
