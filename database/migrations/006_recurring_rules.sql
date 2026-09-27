-- =============================================================================
-- 006 — Regras de recorrência
-- =============================================================================
-- Contas fixas que se repetem mensalmente. A regra descreve a cobrança; os
-- lançamentos são criados sob demanda pela materialização (UC18).
--
-- day_of_month é limitado a 28 de propósito: garante que a regra tenha o mesmo
-- comportamento em todos os meses do ano, inclusive fevereiro.
-- =============================================================================

CREATE TABLE recurring_rules (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        UUID          NOT NULL,
  created_by_user_id  UUID          NOT NULL,
  category_id         UUID          NOT NULL,
  payment_method_id   UUID          NOT NULL,
  kind                VARCHAR(16)   NOT NULL,
  description         VARCHAR(160)  NOT NULL,
  amount              NUMERIC(14,2) NOT NULL,
  day_of_month        SMALLINT      NOT NULL,
  -- Situação aplicada aos lançamentos gerados por esta regra
  status              VARCHAR(12)   NOT NULL DEFAULT 'pending',
  active              BOOLEAN       NOT NULL DEFAULT true,
  start_month         DATE          NOT NULL,
  -- Nulo indica vigência por prazo indeterminado
  end_month           DATE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT recurring_rules_household_fk FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE RESTRICT,
  CONSTRAINT recurring_rules_user_fk FOREIGN KEY (created_by_user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT recurring_rules_category_fk FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT recurring_rules_method_fk FOREIGN KEY (payment_method_id)
    REFERENCES payment_methods (id) ON DELETE RESTRICT,

  CONSTRAINT recurring_rules_kind_valido
    CHECK (kind IN ('income', 'expense', 'investment')),
  CONSTRAINT recurring_rules_status_valido
    CHECK (status IN ('paid', 'pending', 'scheduled')),
  CONSTRAINT recurring_rules_amount_positivo CHECK (amount > 0),
  CONSTRAINT recurring_rules_dia_valido CHECK (day_of_month BETWEEN 1 AND 28),
  CONSTRAINT recurring_rules_vigencia_coerente
    CHECK (end_month IS NULL OR end_month >= start_month),
  CONSTRAINT recurring_rules_start_month_dia_1
    CHECK (EXTRACT(DAY FROM start_month) = 1),
  CONSTRAINT recurring_rules_end_month_dia_1
    CHECK (end_month IS NULL OR EXTRACT(DAY FROM end_month) = 1)
);

-- Busca das regras vigentes, executada a cada consulta de mês (UC18)
CREATE INDEX idx_recurring_rules_vigentes
  ON recurring_rules (household_id, start_month)
  WHERE active = true;

CREATE TRIGGER recurring_rules_set_updated_at
  BEFORE UPDATE ON recurring_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  recurring_rules IS 'Regra de conta mensal recorrente.';
COMMENT ON COLUMN recurring_rules.day_of_month IS 'Dia da cobrança, de 1 a 28, para valer em todos os meses.';
COMMENT ON COLUMN recurring_rules.status IS 'Situação com que os lançamentos gerados nascem.';
