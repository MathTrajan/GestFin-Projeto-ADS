-- =============================================================================
-- 001 — Preparação do esquema
-- =============================================================================
-- Cria os elementos utilitários usados por todas as tabelas seguintes.
--
-- Sobre a geração de identificadores: no PostgreSQL 13 e superiores a função
-- gen_random_uuid() é nativa do servidor, sem necessidade da extensão pgcrypto.
-- O projeto exige a versão 16, então nenhuma extensão é criada aqui.
-- =============================================================================

-- Mantém a coluna updated_at sincronizada sem depender da camada de aplicação.
-- Um UPDATE que esqueça de atualizar o campo continua produzindo auditoria correta.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_at() IS
  'Gatilho de auditoria: atualiza updated_at a cada UPDATE da linha.';
