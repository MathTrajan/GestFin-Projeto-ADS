-- =============================================================================
-- 010 — Índices de consulta
-- =============================================================================
-- Os índices de chave estrangeira e de listagem simples foram criados junto de
-- cada tabela. Esta migração cria os índices que atendem às TRÊS consultas mais
-- caras do sistema, isoladas aqui para deixar explícito o motivo de cada uma.
-- =============================================================================

-- 1. Listagem e agregação do mês.
-- É a consulta mais frequente do sistema: executada pela tela de lançamentos,
-- pelo painel, pela tela de categorias e pela de cartões, a cada troca de mês.
-- O filtro por archived entra no índice parcial porque toda consulta de leitura
-- descarta arquivados (RN10), e eles são minoria permanente da tabela.
CREATE INDEX idx_transactions_household_month
  ON transactions (household_id, reference_month)
  WHERE archived = false;

-- 2. Parcelas de um plano.
-- Usada na correção de numeração (UC12), que precisa de todas as parcelas do
-- plano ordenadas por competência.
CREATE INDEX idx_transactions_plan
  ON transactions (installment_plan_id, reference_month)
  WHERE installment_plan_id IS NOT NULL;

-- 3. Parcelas futuras agendadas.
-- Sustenta o cálculo do limite comprometido do cartão (RF21), que soma tudo o
-- que está agendado para meses posteriores ao exibido. Índice parcial: só as
-- linhas agendadas interessam, e elas são uma fração pequena da tabela.
CREATE INDEX idx_transactions_agendadas_futuras
  ON transactions (household_id, reference_month, payment_method_id)
  WHERE status = 'scheduled' AND archived = false;

-- 4. Materialização de recorrências.
-- Verifica quais regras já produziram lançamento em um mês (UC18). Sem este
-- índice, a verificação varreria todas as linhas do mês a cada consulta.
CREATE INDEX idx_transactions_regra_mes
  ON transactions (recurring_rule_id, reference_month)
  WHERE recurring_rule_id IS NOT NULL;

-- 5. Busca textual por descrição.
-- A busca da tela de lançamentos usa correspondência parcial sem diferenciar
-- maiúsculas (RF30). O índice sobre a descrição em caixa baixa evita a varredura
-- completa quando a busca começa por um prefixo conhecido.
CREATE INDEX idx_transactions_descricao_lower
  ON transactions (household_id, lower(description));

COMMENT ON INDEX idx_transactions_household_month IS
  'Consulta mais frequente do sistema: lançamentos e agregações de um mês.';
COMMENT ON INDEX idx_transactions_agendadas_futuras IS
  'Limite comprometido do cartão: soma das parcelas agendadas de meses futuros.';
