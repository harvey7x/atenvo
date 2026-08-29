-- ============================================================
-- FIX do bloqueio do dono (29/08): "permission denied for table
-- cobranca_numeros" ao Conectar WhatsApp. A pegadinha conhecida do
-- service_role (memória: maturação teve a mesma): tabelas criadas nas
-- migrations recentes nasceram SEM grant pro service_role — e o motor
-- (cobranca-processar) + a cobranca-wa operam exatamente com ele.
-- ============================================================
grant all on table
  public.cobranca_numeros,
  public.cobranca_mensagens,
  public.cobranca_regua,
  public.cobranca_regua_passos,
  public.cobranca_fila,
  public.cobranca_mensagem_itens,
  public.ciclos_vencimento,
  public.ciclo_vencimento_competencias
to service_role;
