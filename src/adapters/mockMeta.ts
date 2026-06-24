import type { MetaIntegrationProvider, MetaAuthorization, MetaAsset, MetaAssetType, MetricSyncResult } from '@/types/meta';

const delay = (ms = 280) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => 'agora há pouco';

const ASSETS: Record<MetaAssetType, MetaAsset[]> = {
  page: [
    { id: 'pg_1', name: 'Empresa Demonstração', type: 'page' },
    { id: 'pg_2', name: 'Atendimento Atenvo', type: 'page' },
  ],
  ad_account: [
    { id: 'act_2048', name: 'Conta Principal', type: 'ad_account' },
    { id: 'act_3090', name: 'Conta Secundária', type: 'ad_account' },
  ],
  lead_form: [
    { id: 'lf_1', name: 'Aposentados Maio', type: 'lead_form' },
    { id: 'lf_2', name: 'Revisão de Contrato', type: 'lead_form' },
    { id: 'lf_3', name: 'Juros Abusivos', type: 'lead_form' },
  ],
};

const authorizedState: MetaAuthorization = {
  authorized: true,
  business: 'Empresa Demonstração',
  portfolio: 'Empresa Demonstração Holding',
  sessionValidUntil: 'renova em 48 dias',
  messengerEnabled: true,
  lastSync: now(),
  credentials: 'configured_securely',
};

class MockMetaProvider implements MetaIntegrationProvider {
  readonly name = 'mock';
  async getAuthorization(_orgId: string): Promise<MetaAuthorization> {
    await delay(160);
    return { ...authorizedState };
  }
  async authorize(_orgId: string): Promise<MetaAuthorization> {
    await delay();
    return { ...authorizedState, lastSync: now() };
  }
  async listAssets(_orgId: string, type: MetaAssetType): Promise<MetaAsset[]> {
    await delay(160);
    return ASSETS[type].slice();
  }
  async syncMetrics(_orgId: string): Promise<MetricSyncResult> {
    await delay(320);
    return { syncedAt: now(), leads: 12 };
  }
  async renewAuthorization(_orgId: string): Promise<MetaAuthorization> {
    await delay();
    return { ...authorizedState, sessionValidUntil: 'renova em 60 dias', lastSync: now() };
  }
  async disconnect(_orgId: string): Promise<void> {
    await delay();
  }
}

export const mockMeta: MetaIntegrationProvider = new MockMetaProvider();
