-- =============================================================================
-- SEED — Estrutura inicial
-- =============================================================================
-- Cria a residência, os perfis, as categorias e as formas de pagamento com que o
-- sistema começa a ser usado. NÃO cria lançamentos: a residência começa com a
-- estrutura pronta e o histórico vazio.
--
-- Idempotente: se já existir uma residência, o script não faz nada. Executá-lo
-- novamente é seguro.
--
-- Nenhum código de acesso é definido aqui. O primeiro acesso entra direto na
-- escolha de perfil, e o código é configurado pela interface (RF04).
-- =============================================================================

DO $$
DECLARE
  v_household_id UUID;
  v_user_id      UUID;
  v_parent_id    UUID;
  v_sort         INTEGER := 0;
  v_sub_sort     INTEGER;
  v_grupo        RECORD;
  v_sub          TEXT;
BEGIN
  -- Guarda de idempotência
  IF EXISTS (SELECT 1 FROM households) THEN
    RAISE NOTICE 'Banco já populado: nenhuma alteração feita.';
    RETURN;
  END IF;

  RAISE NOTICE 'Banco vazio: criando a estrutura inicial...';

  -- Residência -------------------------------------------------------------
  INSERT INTO households (name) VALUES ('Casa Exemplo')
    RETURNING id INTO v_household_id;

  -- Perfis -----------------------------------------------------------------
  INSERT INTO users (household_id, name, email, avatar_color, avatar_initial)
  VALUES (v_household_id, 'Ana',   'ana@exemplo.local',   '#1E3A8A', 'A')
  RETURNING id INTO v_user_id;

  INSERT INTO users (household_id, name, email, avatar_color, avatar_initial)
  VALUES (v_household_id, 'Bruno', 'bruno@exemplo.local', '#0369A1', 'B');

  -- Categorias -------------------------------------------------------------
  -- Cada grupo vira uma categoria de topo; os itens de subs viram subcategorias
  -- herdando ícone e cores do grupo.
  FOR v_grupo IN
    SELECT * FROM (VALUES
      ('Moradia e casa',          'home',           '#FCE7F3', '#BE185D', ARRAY['Contas de casa', 'Compras para casa', 'Mercado']),
      ('Transporte',              'car',            '#DBEAFE', '#1E3A8A', ARRAY['Carro', 'Combustível', 'Transporte por aplicativo']),
      ('Educação',                'book-open',      '#DCFCE7', '#15803D', ARRAY['Cursos', 'Livros']),
      ('Assinaturas e serviços',  'tv',             '#EDE9FE', '#6D28D9', ARRAY['Assinaturas', 'Telefonia']),
      ('Alimentação fora',        'utensils',       '#FEF3C7', '#B45309', ARRAY['Lanches do dia a dia', 'Restaurantes']),
      ('Saúde e bem-estar',       'heart-pulse',    '#CCFBF1', '#0F766E', ARRAY['Plano de saúde', 'Farmácia', 'Consultas', 'Academia']),
      ('Pessoal',                 'shirt',          '#FCE7F3', '#BE185D', ARRAY['Vestuário', 'Presentes']),
      ('Lazer',                   'ferris-wheel',   '#EDE9FE', '#6D28D9', ARRAY['Passeios', 'Viagem', 'Hobbies']),
      ('Pets',                    'paw-print',      '#ECFCCB', '#4D7C0F', ARRAY['Pet']),
      ('Financeiro',              'landmark',       '#E0F2FE', '#0369A1', ARRAY['Fatura de cartão', 'Empréstimos e financiamentos', 'Investimentos', 'Reserva', 'Entradas']),
      ('Imprevistos',             'alert-triangle', '#FEE2E2', '#B91C1C', ARRAY['Imprevistos'])
    ) AS g(nome, icone, cor_bg, cor_fg, subs)
  LOOP
    INSERT INTO categories (household_id, name, icon, color_bg, color_fg, sort_order)
    VALUES (v_household_id, v_grupo.nome, v_grupo.icone, v_grupo.cor_bg, v_grupo.cor_fg, v_sort)
    RETURNING id INTO v_parent_id;

    v_sort := v_sort + 1;
    v_sub_sort := 0;

    FOREACH v_sub IN ARRAY v_grupo.subs LOOP
      INSERT INTO categories (household_id, parent_id, name, icon, color_bg, color_fg, sort_order)
      VALUES (v_household_id, v_parent_id, v_sub, v_grupo.icone, v_grupo.cor_bg, v_grupo.cor_fg, v_sub_sort);
      v_sub_sort := v_sub_sort + 1;
    END LOOP;
  END LOOP;

  -- Formas de pagamento ----------------------------------------------------
  -- Sem cartões de crédito: cada residência cadastra os seus, com os dias reais
  -- de fechamento e vencimento (RF18).
  INSERT INTO payment_methods (household_id, name, kind, color) VALUES
    (v_household_id, 'Pix',      'pix',    '#0F766E'),
    (v_household_id, 'Boleto',   'boleto', '#B45309'),
    (v_household_id, 'Débito',   'debit',  '#0369A1'),
    (v_household_id, 'Dinheiro', 'cash',   '#15803D');

  RAISE NOTICE 'Estrutura inicial criada: 1 residência, 2 perfis, % categorias de topo, 4 formas de pagamento.', v_sort;
END $$;
