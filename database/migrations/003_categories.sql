-- =============================================================================
-- 003 — Categorias
-- =============================================================================
-- Hierarquia de no máximo dois níveis: categorias de topo (parent_id nulo) e
-- subcategorias. O limite de dois níveis NÃO é expressável em CHECK sem gatilho,
-- e por isso é garantido na camada de serviço (ver documento 05, seção 5).
-- O que o banco garante aqui é que a categoria não seja pai de si mesma.
-- =============================================================================

CREATE TABLE categories (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID          NOT NULL,
  parent_id       UUID,
  name            VARCHAR(60)   NOT NULL,
  icon            VARCHAR(40)   NOT NULL DEFAULT 'tag',
  color_bg        VARCHAR(9)    NOT NULL,
  color_fg        VARCHAR(9)    NOT NULL,
  sort_order      INTEGER       NOT NULL DEFAULT 0,
  -- Teto de gasto mensal. Nulo indica categoria sem orçamento definido, que
  -- nunca gera alerta de estouro (RF14).
  monthly_budget  NUMERIC(14,2),
  archived        BOOLEAN       NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT categories_household_fk FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE RESTRICT,
  CONSTRAINT categories_parent_fk FOREIGN KEY (parent_id)
    REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT categories_nao_e_pai_de_si CHECK (id <> parent_id),
  CONSTRAINT categories_name_nao_vazio CHECK (length(btrim(name)) > 0),
  CONSTRAINT categories_budget_positivo CHECK (monthly_budget IS NULL OR monthly_budget > 0),
  CONSTRAINT categories_color_bg_hex CHECK (color_bg ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT categories_color_fg_hex CHECK (color_fg ~ '^#[0-9A-Fa-f]{6}$')
);

-- Listagem da árvore de categorias ativas, feita em toda abertura de formulário.
CREATE INDEX idx_categories_household_ativas
  ON categories (household_id, sort_order)
  WHERE archived = false;

CREATE INDEX idx_categories_parent ON categories (parent_id);

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  categories IS 'Categoria de classificação, em hierarquia de até dois níveis.';
COMMENT ON COLUMN categories.parent_id IS 'Categoria de topo à qual se subordina; nulo = é categoria de topo.';
COMMENT ON COLUMN categories.monthly_budget IS 'Teto mensal de gasto; nulo = sem teto.';
