/* Ponto unico de acesso aos adapters/providers da aplicacao.
   billing: usa Supabase REAL quando ha env configurado; senao, MOCK (dev).
   meta/whatsapp seguem MOCK (fora do escopo desta fase: Meta/WhatsApp/Asaas reais). */
import { isSupabaseConfigured } from '@/lib/supabase';
import { mockBilling } from './mockBilling';
import { supabaseBilling } from './supabaseBilling';
import { mockMeta } from './mockMeta';
import { whatsappAdapters, metaCloudAdapter, externalProviderAdapter } from './mockWhatsApp';

export const billing = isSupabaseConfigured ? supabaseBilling : mockBilling;
export const meta = mockMeta;
export { whatsappAdapters, metaCloudAdapter, externalProviderAdapter };
