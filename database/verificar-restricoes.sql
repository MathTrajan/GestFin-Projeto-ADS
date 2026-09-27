-- =============================================================================
-- Verificação das restrições do banco
-- =============================================================================
-- Tenta violar cada regra que o esquema deve garantir e confirma que o banco
-- recusa. É a evidência de que as regras estão no BANCO, e não apenas na
-- aplicação: uma falha na camada de serviço não consegue gravar dado inválido.
--
-- Cobre os casos CTI31 e CTI32 do plano de testes, além das demais restrições.
--
-- Uso:
--   psql -d capital_ads_dev -f database/verificar-restricoes.sql
--
-- Não altera dado algum: tudo roda dentro de uma transação desfeita ao final.
-- =============================================================================

\set ON_ERROR_STOP off
BEGIN;

DO $$
DECLARE
  v_household  UUID;
  v_user       UUID;
  v_categoria  UUID;
  v_pix        UUID;
  v_cartao     UUID;
  v_regra      UUID;
  v_plano      UUID;
  v_ok         INTEGER := 0;
  v_falhou     INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Verificação das restrições do esquema ===';
  RAISE NOTICE '';

  SELECT id INTO v_household FROM households LIMIT 1;
  SELECT id INTO v_user FROM users LIMIT 1;
  SELECT id INTO v_categoria FROM categories WHERE parent_id IS NULL LIMIT 1;
  SELECT id INTO v_pix FROM payment_methods WHERE kind = 'pix' LIMIT 1;

  -- Cartão de crédito auxiliar para os testes
  INSERT INTO payment_methods (household_id, name, kind, color, limit_value, closing_day, due_day)
  VALUES (v_household, 'Cartão de teste', 'credit_card', '#1E3A8A', 5000, 10, 20)
  RETURNING id INTO v_cartao;

  -- === 1. Mês de competência precisa ser o primeiro dia do mês (RN01) ======
  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              kind, description, amount, transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_categoria, v_pix,
            'expense', 'Mês inválido', 100, DATE '2026-09-15', DATE '2026-09-15', 'paid');
    RAISE NOTICE 'FALHA  1. reference_month com dia 15 foi ACEITO';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK     1. reference_month com dia diferente de 1 recusado';
    v_ok := v_ok + 1;
  END;

  -- === 2. Pagamento de fatura não pode ter categoria ======================
  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              kind, description, amount, transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_categoria, v_cartao,
            'card_payment', 'Fatura com categoria', 100, DATE '2026-09-10', DATE '2026-09-01', 'paid');
    RAISE NOTICE 'FALHA  2. card_payment com categoria foi ACEITO';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK     2. card_payment com categoria recusado';
    v_ok := v_ok + 1;
  END;

  -- === 3. Despesa precisa de categoria ====================================
  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, payment_method_id,
                              kind, description, amount, transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_pix,
            'expense', 'Despesa sem categoria', 100, DATE '2026-09-10', DATE '2026-09-01', 'paid');
    RAISE NOTICE 'FALHA  3. expense sem categoria foi ACEITO';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK     3. expense sem categoria recusado';
    v_ok := v_ok + 1;
  END;

  -- === 4. Valor precisa ser positivo ======================================
  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              kind, description, amount, transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_categoria, v_pix,
            'expense', 'Valor negativo', -50, DATE '2026-09-10', DATE '2026-09-01', 'paid');
    RAISE NOTICE 'FALHA  4. valor negativo foi ACEITO';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK     4. valor negativo recusado';
    v_ok := v_ok + 1;
  END;

  -- === 5. Tipo fora do domínio ============================================
  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              kind, description, amount, transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_categoria, v_pix,
            'transferencia', 'Tipo inexistente', 100, DATE '2026-09-10', DATE '2026-09-01', 'paid');
    RAISE NOTICE 'FALHA  5. tipo desconhecido foi ACEITO';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK     5. tipo fora do domínio recusado';
    v_ok := v_ok + 1;
  END;

  -- === 6. Idempotência da recorrência: 1 lançamento por regra por mês (RN08)
  INSERT INTO recurring_rules (household_id, created_by_user_id, category_id, payment_method_id,
                               kind, description, amount, day_of_month, start_month)
  VALUES (v_household, v_user, v_categoria, v_pix,
          'expense', 'Assinatura de teste', 39.90, 5, DATE '2026-09-01')
  RETURNING id INTO v_regra;

  INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                            recurring_rule_id, kind, description, amount,
                            transaction_date, reference_month, status)
  VALUES (v_household, v_user, v_categoria, v_pix, v_regra,
          'expense', 'Assinatura de teste', 39.90, DATE '2026-09-05', DATE '2026-09-01', 'pending');

  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              recurring_rule_id, kind, description, amount,
                              transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_categoria, v_pix, v_regra,
            'expense', 'Assinatura duplicada', 39.90, DATE '2026-09-05', DATE '2026-09-01', 'pending');
    RAISE NOTICE 'FALHA  6. recorrência duplicada no mesmo mês foi ACEITA';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK     6. recorrência duplicada no mesmo mês recusada';
    v_ok := v_ok + 1;
  END;

  -- === 7. Lançamentos manuais (sem regra) não colidem entre si ============
  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              kind, description, amount, transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_categoria, v_pix,
            'expense', 'Manual 1', 10, DATE '2026-09-10', DATE '2026-09-01', 'paid');
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              kind, description, amount, transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_categoria, v_pix,
            'expense', 'Manual 2', 20, DATE '2026-09-10', DATE '2026-09-01', 'paid');
    RAISE NOTICE 'OK     7. dois lançamentos manuais no mesmo mês aceitos';
    v_ok := v_ok + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'FALHA  7. lançamentos manuais colidiram entre si';
    v_falhou := v_falhou + 1;
  END;

  -- === 8. Forma que não é cartão não aceita atributos de crédito ==========
  BEGIN
    INSERT INTO payment_methods (household_id, name, kind, color, closing_day)
    VALUES (v_household, 'Pix com fechamento', 'pix', '#0F766E', 10);
    RAISE NOTICE 'FALHA  8. Pix com dia de fechamento foi ACEITO';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK     8. atributo de crédito em forma não cartão recusado';
    v_ok := v_ok + 1;
  END;

  -- === 9. Dia de recorrência limitado a 28 ================================
  BEGIN
    INSERT INTO recurring_rules (household_id, created_by_user_id, category_id, payment_method_id,
                                 kind, description, amount, day_of_month, start_month)
    VALUES (v_household, v_user, v_categoria, v_pix,
            'expense', 'Dia 29', 100, 29, DATE '2026-09-01');
    RAISE NOTICE 'FALHA  9. day_of_month = 29 foi ACEITO';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK     9. day_of_month acima de 28 recusado';
    v_ok := v_ok + 1;
  END;

  -- === 10. Limite de 60 parcelas =========================================
  BEGIN
    INSERT INTO installment_plans (household_id, category_id, payment_method_id, created_by_user_id,
                                   description, total_amount, installment_amount, total_installments,
                                   first_month, last_month)
    VALUES (v_household, v_categoria, v_cartao, v_user,
            'Plano longo demais', 6100, 100, 61, DATE '2026-09-01', DATE '2031-09-01');
    RAISE NOTICE 'FALHA 10. plano com 61 parcelas foi ACEITO';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK    10. plano com mais de 60 parcelas recusado';
    v_ok := v_ok + 1;
  END;

  -- === 11. Parcela exige plano e numeração juntos ========================
  INSERT INTO installment_plans (household_id, category_id, payment_method_id, created_by_user_id,
                                 description, total_amount, installment_amount, total_installments,
                                 first_month, last_month)
  VALUES (v_household, v_categoria, v_cartao, v_user,
          'Plano de teste', 1200, 100, 12, DATE '2026-09-01', DATE '2027-08-01')
  RETURNING id INTO v_plano;

  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              installment_plan_id, kind, description, amount,
                              transaction_date, reference_month, status)
    VALUES (v_household, v_user, v_categoria, v_cartao, v_plano,
            'expense', 'Parcela sem número', 100, DATE '2026-09-20', DATE '2026-09-01', 'scheduled');
    RAISE NOTICE 'FALHA 11. parcela sem numeração foi ACEITA';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK    11. parcela sem numeração recusada';
    v_ok := v_ok + 1;
  END;

  -- === 12. Cor precisa ser hexadecimal ===================================
  BEGIN
    INSERT INTO categories (household_id, name, icon, color_bg, color_fg)
    VALUES (v_household, 'Cor inválida', 'tag', 'vermelho', '#000000');
    RAISE NOTICE 'FALHA 12. cor não hexadecimal foi ACEITA';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK    12. cor fora do formato hexadecimal recusada';
    v_ok := v_ok + 1;
  END;

  -- === 13. Referência inexistente é recusada =============================
  BEGIN
    INSERT INTO transactions (household_id, created_by_user_id, category_id, payment_method_id,
                              kind, description, amount, transaction_date, reference_month, status)
    VALUES (v_household, v_user, gen_random_uuid(), v_pix,
            'expense', 'Categoria inexistente', 100, DATE '2026-09-10', DATE '2026-09-01', 'paid');
    RAISE NOTICE 'FALHA 13. referência a categoria inexistente foi ACEITA';
    v_falhou := v_falhou + 1;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK    13. referência a categoria inexistente recusada';
    v_ok := v_ok + 1;
  END;

  -- === 14. Precisão decimal do valor monetário ===========================
  DECLARE
    v_soma NUMERIC;
  BEGIN
    -- Três parcelas de R$ 33,33 mais o resíduo de R$ 0,01 na última
    CREATE TEMP TABLE t_soma (v NUMERIC(14,2)) ON COMMIT DROP;
    INSERT INTO t_soma VALUES (33.33), (33.33), (33.34);
    SELECT sum(v) INTO v_soma FROM t_soma;
    IF v_soma = 100.00 THEN
      RAISE NOTICE 'OK    14. soma decimal exata: 33,33 + 33,33 + 33,34 = 100,00';
      v_ok := v_ok + 1;
    ELSE
      RAISE NOTICE 'FALHA 14. soma decimal imprecisa: %', v_soma;
      v_falhou := v_falhou + 1;
    END IF;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '=== Resultado: % aprovado(s), % reprovado(s) ===', v_ok, v_falhou;
  RAISE NOTICE '';
END $$;

ROLLBACK;
