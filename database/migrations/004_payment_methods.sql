-- =============================================================================
-- 004 — Formas de pagamento
-- =============================================================================
-- Os atributos de crédito (limite, fechamento e vencimento) só fazem sentido em
-- cartão de crédito. A restrição payment_methods_credito_somente_cartao garante
-- isso no banco, e não apenas na aplicação: uma falha na camada de serviço não
-- consegue gravar um Pix com dia de fechamento.
-- =============================================================================

CREATE TABLE payment_methods (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID          NOT NULL,
  name          VARCHAR(60)   NOT NULL,
  kind          VARCHAR(20)   NOT NULL,
  owner_label   VARCHAR(40),
  color         VARCHAR(9)    NOT NULL,
  limit_value   NUMERIC(14,2),
  closing_day   SMALLINT,
  due_day       SMALLINT,
  archived      BOOLEAN       NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT payment_methods_household_fk FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE RESTRICT,
  CONSTRAINT payment_methods_kind_valido
    CHECK (kind IN ('credit_card', 'pix', 'boleto', 'debit', 'cash')),
  CONSTRAINT payment_methods_name_nao_vazio CHECK (length(btrim(name)) > 0),
  CONSTRAINT payment_methods_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT payment_methods_limite_positivo
    CHECK (limit_value IS NULL OR limit_value > 0),
  CONSTRAINT payment_methods_closing_day_valido
    CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31),
  CONSTRAINT payment_methods_due_day_valido
    CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  -- Atributos de crédito exclusivos de cartão de crédito (RF18)
  CONSTRAINT payment_methods_credito_somente_cartao CHECK (
    kind = 'credit_card'
    OR (limit_value IS NULL AND closing_day IS NULL AND due_day IS NULL)
  )
);

CREATE INDEX idx_payment_methods_household_ativas
  ON payment_methods (household_id, created_at)
  WHERE archived = false;

CREATE TRIGGER payment_methods_set_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  payment_methods IS 'Forma de pagamento: cartão de crédito, Pix, boleto, débito ou dinheiro.';
COMMENT ON COLUMN payment_methods.closing_day IS 'Dia de fechamento da fatura; determina em qual fatura a compra cai (RN02).';
COMMENT ON COLUMN payment_methods.due_day IS 'Dia de vencimento da fatura; determina a data do lançamento (RN03).';
