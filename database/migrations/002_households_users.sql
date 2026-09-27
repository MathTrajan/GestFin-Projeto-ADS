-- =============================================================================
-- 002 — Residência e membros
-- =============================================================================
-- households é o agregador de todo o sistema: nenhuma informação existe fora de
-- uma residência. É esse vínculo que sustenta o isolamento exigido pelo RNF12.
-- =============================================================================

CREATE TABLE households (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(80)  NOT NULL,
  -- Resumo bcrypt do código de acesso. Nulo indica primeira execução: o sistema
  -- libera o acesso até que um código seja definido (RF01, fluxo alternativo A1).
  pin_hash    VARCHAR(72),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT households_name_nao_vazio CHECK (length(btrim(name)) > 0)
);

CREATE TRIGGER households_set_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  households IS 'Residência: agregador de todos os dados do sistema.';
COMMENT ON COLUMN households.pin_hash IS 'Resumo bcrypt do código de acesso; nulo = acesso ainda não configurado.';


CREATE TABLE users (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID         NOT NULL,
  name            VARCHAR(80)  NOT NULL,
  email           VARCHAR(160) NOT NULL,
  avatar_color    VARCHAR(9)   NOT NULL,
  avatar_initial  CHAR(1)      NOT NULL,
  -- Chave do ícone escolhido pelo membro. Nulo indica uso da inicial do nome.
  avatar_icon     VARCHAR(40),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT users_household_fk FOREIGN KEY (household_id)
    REFERENCES households (id) ON DELETE RESTRICT,
  CONSTRAINT users_email_unico UNIQUE (email),
  CONSTRAINT users_name_nao_vazio CHECK (length(btrim(name)) > 0),
  CONSTRAINT users_avatar_color_hex CHECK (avatar_color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE INDEX idx_users_household ON users (household_id);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  users IS 'Membro da residência. Não possui senha individual (ver decisão DA06).';
COMMENT ON COLUMN users.avatar_icon IS 'Chave do ícone; nulo = exibe avatar_initial.';
