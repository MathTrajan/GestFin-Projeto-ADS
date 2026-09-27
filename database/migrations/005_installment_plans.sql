-- =============================================================================
-- 005 — Planos de parcelamento
-- =============================================================================
-- Representa a compra parcelada como um todo. Cada parcela é uma linha em
-- transactions apontando para este plano.
--
-- first_month pode ser ANTERIOR à criação do registro: é o caso do parcelamento
-- já em andamento antes do uso do sistema (RF36), em que o plano guarda a janela
-- real da compra ainda que as parcelas antigas não sejam lançadas.
-- =============================================================================

CREATE TABLE installment_plans (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        UUID          NOT NULL,
  category_id         UUID          NOT NULL,
  payment_method_id   UUID          NOT NULL,
  created_by_user_id  UUID          NOT NULL,
  description         VARCHAR(160)  NOT NULL,
  total_amount        NUMERIC(14,2) NOT NULL,
  installment_amount  NUMERIC(14,2) NOT NULL,
  total_installments  SMALLINT      NOT NULL,
  first_month         DATE          NOT NULL,
  last_month          DATE          NOT NULL,
  archived            BOOLEAN       NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT installment_plans_household_fk FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE RESTRICT,
  CONSTRAINT installment_plans_category_fk FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT installment_plans_method_fk FOREIGN KEY (payment_method_id)
    REFERENCES payment_methods (id) ON DELETE RESTRICT,
  CONSTRAINT installment_plans_user_fk FOREIGN KEY (created_by_user_id)
    REFERENCES users (id) ON DELETE RESTRICT,

  CONSTRAINT installment_plans_total_valido
    CHECK (total_installments BETWEEN 1 AND 60),
  CONSTRAINT installment_plans_valores_positivos
    CHECK (total_amount > 0 AND installment_amount > 0),
  CONSTRAINT installment_plans_janela_coerente
    CHECK (last_month >= first_month),
  -- Meses de competência são sempre o primeiro dia do mês (RN01)
  CONSTRAINT installment_plans_first_month_dia_1
    CHECK (EXTRACT(DAY FROM first_month) = 1),
  CONSTRAINT installment_plans_last_month_dia_1
    CHECK (EXTRACT(DAY FROM last_month) = 1)
);

CREATE INDEX idx_installment_plans_household ON installment_plans (household_id);

CREATE TRIGGER installment_plans_set_updated_at
  BEFORE UPDATE ON installment_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  installment_plans IS 'Compra parcelada. As parcelas ficam em transactions.';
COMMENT ON COLUMN installment_plans.installment_amount IS 'Valor de cada parcela, exceto a última, que absorve o resíduo de centavos (RN05).';
COMMENT ON COLUMN installment_plans.first_month IS 'Mês da 1ª parcela; pode ser anterior ao início do uso do sistema (RF36).';
