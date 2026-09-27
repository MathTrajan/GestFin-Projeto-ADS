-- =============================================================================
-- 007 — Lançamentos
-- =============================================================================
-- Tabela central do sistema. Concentra receitas, despesas, investimentos e
-- pagamentos de fatura.
--
-- Três garantias importantes vivem aqui, e não na aplicação:
--
--   1. reference_month é sempre o primeiro dia do mês (RN01). É a chave de toda
--      agregação mensal; um valor com dia diferente tornaria o lançamento
--      invisível às consultas por igualdade.
--
--   2. Pagamento de fatura não tem categoria, e os demais tipos têm
--      obrigatoriamente. As duas metades da regra são verificadas juntas.
--
--   3. UNIQUE (recurring_rule_id, reference_month) é o que torna a materialização
--      idempotente (RN08). Verificação prévia em memória não resolveria: duas
--      requisições simultâneas passariam pela verificação antes de qualquer uma
--      inserir. NULLs são distintos entre si no PostgreSQL, então lançamentos
--      manuais (sem regra) não colidem entre si.
-- =============================================================================

CREATE TABLE transactions (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         UUID          NOT NULL,
  created_by_user_id   UUID          NOT NULL,
  paid_by_user_id      UUID,
  category_id          UUID,
  payment_method_id    UUID          NOT NULL,
  installment_plan_id  UUID,
  recurring_rule_id    UUID,

  kind                 VARCHAR(16)   NOT NULL,
  description          VARCHAR(160)  NOT NULL,
  amount               NUMERIC(14,2) NOT NULL,

  -- Data de vencimento. Em cartão de crédito, o dia do vencimento da fatura (RN03).
  transaction_date     DATE          NOT NULL,
  -- Data efetiva da compra. Em cartão, é a data informada pelo membro.
  purchase_date        DATE,
  -- Mês de competência: primeiro dia do mês. Chave de toda agregação (RN01).
  reference_month      DATE          NOT NULL,

  status               VARCHAR(12)   NOT NULL DEFAULT 'paid',
  installment_number   SMALLINT,
  notes                TEXT,
  archived             BOOLEAN       NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Referências ------------------------------------------------------------
  CONSTRAINT transactions_household_fk FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE RESTRICT,
  CONSTRAINT transactions_created_by_fk FOREIGN KEY (created_by_user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT transactions_paid_by_fk FOREIGN KEY (paid_by_user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT transactions_category_fk FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT transactions_method_fk FOREIGN KEY (payment_method_id)
    REFERENCES payment_methods (id) ON DELETE RESTRICT,
  -- Plano removido desvincula as parcelas em vez de apagá-las
  CONSTRAINT transactions_plan_fk FOREIGN KEY (installment_plan_id)
    REFERENCES installment_plans (id) ON DELETE SET NULL,
  -- Regra excluída preserva os lançamentos já gerados (RF41)
  CONSTRAINT transactions_rule_fk FOREIGN KEY (recurring_rule_id)
    REFERENCES recurring_rules (id) ON DELETE SET NULL,

  -- Domínio -----------------------------------------------------------------
  CONSTRAINT transactions_kind_valido
    CHECK (kind IN ('income', 'expense', 'investment', 'card_payment')),
  CONSTRAINT transactions_status_valido
    CHECK (status IN ('paid', 'pending', 'scheduled')),
  CONSTRAINT transactions_amount_positivo CHECK (amount > 0),
  CONSTRAINT transactions_description_nao_vazia
    CHECK (length(btrim(description)) > 0),
  CONSTRAINT transactions_installment_number_valido
    CHECK (installment_number IS NULL OR installment_number BETWEEN 1 AND 60),

  -- Regras de negócio -------------------------------------------------------
  -- RN01: mês de competência é sempre o primeiro dia do mês
  CONSTRAINT transactions_reference_month_dia_1
    CHECK (EXTRACT(DAY FROM reference_month) = 1),
  -- Pagamento de fatura não tem categoria; os demais tipos têm obrigatoriamente
  CONSTRAINT transactions_categoria_conforme_tipo CHECK (
    (kind = 'card_payment' AND category_id IS NULL)
    OR (kind <> 'card_payment' AND category_id IS NOT NULL)
  ),
  -- Parcela pertence a um plano, e plano implica numeração
  CONSTRAINT transactions_parcela_coerente CHECK (
    (installment_plan_id IS NULL AND installment_number IS NULL)
    OR (installment_plan_id IS NOT NULL AND installment_number IS NOT NULL)
  ),
  -- Pagamento de fatura nunca é parcela de um plano
  CONSTRAINT transactions_card_payment_sem_plano CHECK (
    kind <> 'card_payment' OR installment_plan_id IS NULL
  ),

  -- RN08: no máximo um lançamento por regra por mês de competência
  CONSTRAINT transactions_recorrencia_unica_no_mes
    UNIQUE (recurring_rule_id, reference_month)
);

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  transactions IS 'Lançamento financeiro: receita, despesa, investimento ou pagamento de fatura.';
COMMENT ON COLUMN transactions.reference_month IS 'Mês de competência (1º dia do mês). Chave de toda agregação mensal (RN01).';
COMMENT ON COLUMN transactions.transaction_date IS 'Data de vencimento; em cartão, o dia do vencimento da fatura (RN03).';
COMMENT ON COLUMN transactions.purchase_date IS 'Data efetiva da compra; nulo indica coincidência com o vencimento.';
COMMENT ON COLUMN transactions.status IS 'paid, pending ou scheduled. Não altera o mês de competência (RN06).';
COMMENT ON CONSTRAINT transactions_recorrencia_unica_no_mes ON transactions IS
  'Garante a idempotência da materialização de recorrências (RN08, RNF19).';
