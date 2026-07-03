// Regressão @lid: o LID nunca pode virar nome do contato.
// Varre o fonte do webhook (Deno) e da data layer, sem executá-los.
import { describe, it, expect } from 'vitest';
import webhook from '../../supabase/functions/evolution-webhook/index.ts?raw';
import wa from './whatsapp.ts?raw';

describe('@lid — o LID nunca vira nome', () => {
  it('webhook: sem PN e sem pushName real => "Identidade protegida" (nunca o lid cru)', () => {
    // não deve mais existir o fallback antigo que usava o lid como nome
    expect(webhook).not.toMatch(/\?\?\s*\(phone\s*\?\?\s*lid!?\)/);
    expect(webhook).toContain("'Identidade protegida'");
    expect(webhook).toContain('identidade_tipo');
    // grava o mapa LID↔PN por canal
    expect(webhook).toContain("from('wa_lid_map')");
    expect(webhook).toContain('canal_id: canal.id');
  });

  it('webhook: ao resolver PN corrige o nome placeholder e marca estado', () => {
    expect(webhook).toMatch(/identidade_tipo:\s*'telefone'/);
    expect(webhook).toMatch(/\.eq\('nome',\s*'Identidade protegida'\)/);
  });

  it('data layer: exibição defensiva não mostra LID cru como nome', () => {
    expect(wa).toContain('nomeEhLid');
    expect(wa).toMatch(/\/\^\[0-9\]\{12,\}\$\//);
    expect(wa).toMatch(/nomeEhLid \? 'Identidade protegida'/);
  });
});
