/* Integração Meta Business (páginas, Messenger, Lead Ads, métricas de anúncio).
   Implementação real NÃO é feita nesta fase; apenas mock, sem credenciais reais.
   Tokens vivem no backend; o frontend recebe apenas status e ativos não sensíveis. */

export type MetaAssetType = 'page' | 'ad_account' | 'lead_form';

export interface MetaAsset {
  id: string;
  name: string;
  type: MetaAssetType;
}

export interface MetaAuthorization {
  authorized: boolean;
  business: string | null;
  portfolio: string | null;
  /** estado da sessão (sem expor token) */
  sessionValidUntil: string | null;
  messengerEnabled: boolean;
  lastSync: string | null;
  credentials: 'configured_securely' | 'not_configured';
}

export interface MetricSyncResult {
  syncedAt: string;
  leads: number;
}

export interface MetaIntegrationProvider {
  readonly name: string;
  getAuthorization(orgId: string): Promise<MetaAuthorization>;
  authorize(orgId: string): Promise<MetaAuthorization>;
  listAssets(orgId: string, type: MetaAssetType): Promise<MetaAsset[]>;
  syncMetrics(orgId: string): Promise<MetricSyncResult>;
  renewAuthorization(orgId: string): Promise<MetaAuthorization>;
  disconnect(orgId: string): Promise<void>;
}
