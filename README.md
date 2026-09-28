<div align="center">

# 💰 GestFin — Gestão Financeira Doméstica

Sistema web de controle financeiro compartilhado por uma residência: lançamentos, compras parceladas, faturas de cartão por data de fechamento, contas recorrentes e dashboard mensal, sempre por mês de competência.

![Status](https://img.shields.io/badge/status-concluído-2EA043?style=flat-square)
![Disciplina](https://img.shields.io/badge/Projeto_ADS-acadêmico-6E6E6E?style=flat-square)

![Node.js](https://img.shields.io/badge/Node_20-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express_4-000000?style=flat-square&logo=express&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-316192?style=flat-square&logo=postgresql&logoColor=white)
![Angular](https://img.shields.io/badge/Angular_17-DD0031?style=flat-square&logo=angular&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![ECharts](https://img.shields.io/badge/ECharts_6-AA344D?style=flat-square&logo=apacheecharts&logoColor=white)

</div>

---

## Visão geral

O GestFin organiza as finanças de uma casa em que mais de uma pessoa lança gasto.
Receitas, despesas e investimentos ficam agrupados por **mês de competência**, e
não pela data em que o dinheiro saiu: uma compra parcelada em dez vezes aparece
como uma parcela em cada um dos dez meses, e uma compra no crédito entra no mês
da fatura que vai pagá-la.

A API é escrita em camadas (controller, service, repository) com **SQL
parametrizado, sem ORM**, e o esquema do banco é versionado em migrações
idempotentes. A interface é Angular 17 com componentes autônomos, pensada para o
celular.

Projeto individual da disciplina **Projeto ADS**, no Centro Universitário
UniGoiás.

## Funcionalidades

- **Lançamentos** de receita, despesa e investimento, com busca, filtros e
  arquivamento reversível
- **Compras parceladas**, incluindo lançar uma compra **já em andamento**
  ("estou na parcela 7 de 21") e corrigir a numeração de um plano existente
- **Fatura por dia de fechamento** — compra feita no dia do fechamento ou depois
  cai na fatura do mês seguinte; a mesma regra vale para as recorrências
- **Pagamento de fatura** como lançamento próprio, que abate o cartão sem contar
  duas vezes no mês
- **Contas recorrentes** com geração em lote por intervalo de meses
- **Categorias em árvore** (categoria e subcategoria), com teto de gasto e
  arquivamento
- **Formas de pagamento** com limite, uso do mês e limite comprometido pelas
  parcelas futuras
- **Dashboard mensal** — saldo, entradas, saídas, gasto por categoria, uso dos
  cartões, evolução dos meses e projeção das parcelas à frente
- **Acesso em duas etapas** — código de destravamento e depois escolha de perfil,
  com bloqueio temporário após tentativas erradas
- **Multiusuário** com presença de quem está online
- **Pré-carga de treze meses** em uma requisição, para a troca de mês ser
  instantânea

## Stack

| Camada | Tecnologia |
|---|---|
| Banco | PostgreSQL 16 · migrações SQL versionadas e idempotentes |
| Back-end | Node 20 · Express 4 · JavaScript |
| Acesso a dados | Driver `pg` com SQL parametrizado, sem ORM |
| Arquitetura da API | Camadas: controller · service · repository |
| Segurança | Cookies de sessão assinados · bcrypt no código de acesso · limitador de tentativas |
| Front-end | Angular 17 com componentes autônomos · Tailwind 3 · ECharts · lucide-angular |
| Testes | `node:test` — regras financeiras em teste unitário e API em teste de integração contra PostgreSQL real |

## Estrutura do repositório

```text
GestFin-Projeto-ADS/
├─ database/       # migrações SQL numeradas, carga inicial e o executor
├─ backend/        # API REST em camadas
├─ frontend/       # aplicação Angular
└─ docs/entrega/   # documento da disciplina, em Word
```

## Como rodar (desenvolvimento)

### Pré-requisitos

| Requisito | Versão mínima | Verificar com |
|---|---|---|
| Node.js | 20 | `node -v` |
| npm | 10 | `npm -v` |
| PostgreSQL | 16 | `psql --version` |

> O front-end usa Angular 17, que **não** funciona em Node.js acima da 22. Use a
> versão 20.

### 1. Clonar o projeto

```bash
git clone https://github.com/MathTrajan/GestFin-Projeto-ADS.git
cd GestFin-Projeto-ADS
```

### 2. Garantir o PostgreSQL em execução

```bash
brew services start postgresql@16   # macOS com Homebrew
sudo systemctl start postgresql     # Linux
```

No Windows, inicie o serviço PostgreSQL pelo Gerenciador de Serviços. Confirme
que o banco responde:

```bash
psql -h localhost -p 5433 -l
```

> Se o seu PostgreSQL escuta na porta padrão 5432, ajuste a porta no `.env` do
> passo 4.

### 3. Criar o banco

```bash
createdb -h localhost -p 5433 gestfin_dev
```

### 4. Configurar as variáveis de ambiente

```bash
cd backend
cp .env.example .env
```

Ajuste a linha de conexão com o seu usuário do PostgreSQL. O arquivo já vem com
valores adequados a um ambiente local.

### 5. Instalar as dependências e criar o esquema

```bash
# na pasta backend
npm install
npm run migrate    # cria tabelas, restrições e índices
npm run seed       # cria a residência, os perfis e as categorias iniciais
```

O `migrate` é idempotente: rodar de novo aplica apenas as migrações pendentes.

### 6. Subir a API

```bash
npm run dev
```

A API responde em `http://localhost:3600`. Para conferir:

```bash
curl http://localhost:3600/api/health
```

### 7. Subir o front-end

Em **outro terminal**:

```bash
cd frontend
npm install
npm start
```

A interface abre em `http://localhost:4300`.

### 8. Primeiro acesso

Como ainda não existe código de acesso configurado, o sistema segue direto para a
escolha de perfil. Escolha um dos perfis criados pela carga inicial. Para definir
um código, abra o seu perfil no menu lateral.

## Portas utilizadas

| Porta | Serviço |
|---|---|
| 3600 | API (back-end) |
| 4300 | Interface (front-end) |
| 5433 | PostgreSQL |

```bash
lsof -ti:3600 -ti:4300   # confira se estão livres antes de subir
```

## Variáveis de ambiente

Arquivo `backend/.env`, a partir de [`.env.example`](./backend/.env.example):

| Variável | Padrão local | Descrição |
|---|---|---|
| `PORT` | `3600` | Porta da API |
| `DATABASE_URL` | `postgresql://localhost:5433/gestfin_dev` | Conexão com o banco |
| `COOKIE_SECRET` | valor de desenvolvimento | Segredo que assina os cookies de sessão |
| `NODE_ENV` | `development` | Ambiente de execução |
| `CORS_ORIGIN` | `http://localhost:4300` | Origem autorizada em desenvolvimento |

> `COOKIE_SECRET` protege contra forja de sessão. Em desenvolvimento, o valor de
> exemplo basta. Em qualquer uso real, gere um valor aleatório e não o versione.

## Comandos disponíveis

**Back-end** (`backend/`)

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe a API com recarga automática |
| `npm start` | Sobe a API em modo de produção |
| `npm run migrate` | Aplica as migrações pendentes |
| `npm run migrate:status` | Lista as migrações aplicadas e pendentes |
| `npm run seed` | Cria a estrutura inicial em banco vazio |
| `npm test` | Roda os testes unitários |
| `npm run test:integration` | Roda os testes de integração |
| `npm run test:all` | Roda as duas suítes |

**Front-end** (`frontend/`)

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor de desenvolvimento |
| `npm run build` | Gera a versão de produção |

## Testes

```bash
cd backend
npm test
```

A suíte cobre as regras de negócio que dão errado calado: alocação da compra na
fatura correta, divisão de parcelas com sobra de centavo, renumeração de
parcelamento e agregação mensal.

Os testes de integração rodam contra um **PostgreSQL de verdade**, nunca contra
mock: é o mesmo motor da produção, então erro de SQL aparece aqui e não depois.
Eles usam um banco separado do de desenvolvimento, porque limpam as tabelas entre
os casos:

```bash
createdb -h localhost -p 5433 gestfin_test
npm run test:integration
```

⚠️ **Nunca aponte a suíte de integração para o `gestfin_dev`** — ela apaga as
tabelas entre os casos e você perderia os lançamentos de trabalho.

## API

| Método e caminho | Função |
|---|---|
| `GET /api/health` | Estado do serviço e do banco |
| `GET /api/auth/status` | Informa se há código de acesso configurado |
| `POST /api/auth/unlock` | Destrava o acesso com o código |
| `POST /api/auth/set-pin` | Define ou altera o código |
| `POST /api/auth/login` | Entra com um perfil |
| `POST /api/auth/logout` | Encerra a sessão |
| `GET /api/auth/me` | Perfil da sessão atual |
| `GET /api/users` | Perfis disponíveis |
| `GET /api/users/online` | Presença dos membros |
| `PATCH /api/users/me/avatar` | Personaliza o avatar |
| `GET /api/categories` | Categorias, em lista ou árvore |
| `GET /api/categories/summary` | Gasto do mês por categoria |
| `POST PATCH DELETE /api/categories` | Cadastro, edição e arquivamento |
| `GET /api/payment-methods` | Formas com uso do mês e limite comprometido |
| `POST PATCH DELETE /api/payment-methods` | Cadastro, edição e arquivamento |
| `GET /api/transactions` | Lançamentos do mês, com filtros e busca |
| `POST /api/transactions` | Registra lançamento, parcelamento ou pagamento de fatura |
| `PATCH /api/transactions/:id` | Edita lançamento |
| `DELETE /api/transactions/:id` | Arquiva lançamento |
| `POST /api/transactions/:id/restore` | Desfaz o arquivamento |
| `PATCH /api/transactions/plans/:id/renumber` | Corrige a numeração de um parcelamento |
| `GET POST PATCH DELETE /api/recurring` | Regras de recorrência |
| `GET /api/dashboard` | Indicadores do mês |
| `GET /api/bundle` | Pré-carga de treze meses |

## Banco de dados

Sete tabelas, criadas por oito migrações numeradas em
[`database/migrations/`](./database/migrations):

| Migração | Conteúdo |
|---|---|
| `001_setup` | Extensões e o controle das próprias migrações |
| `002_households_users` | Residência e perfis de usuário |
| `003_categories` | Categorias e subcategorias, em árvore |
| `004_payment_methods` | Formas de pagamento e cartões |
| `005_installment_plans` | Planos de parcelamento |
| `006_recurring_rules` | Regras de recorrência |
| `007_transactions` | Lançamentos |
| `008_indexes` | Índices de consulta |

As restrições de integridade ficam no banco, não só na aplicação: 36 `CHECK` e
19 chaves estrangeiras. `TIMESTAMPTZ` em todo registro de data e hora, para o
fuso não se perder.

## Documentação

O documento da disciplina está em
[`docs/entrega/`](./docs/entrega), na estrutura do modelo pedido pelo professor:

| Seção | Conteúdo |
|---|---|
| 1 a 10 | Identificação, TAP, riscos, custos, cronograma e atas de reunião |
| 11 a 13 | Requisitos funcionais, requisitos não funcionais e diagrama de casos de uso |
| 14 | Detalhamento dos 15 casos de uso, com fluxo principal e fluxos alternativos |
| 15 e 16 | MER e dicionário de dados, conferido campo a campo contra as migrações |
| 17 e 18 | Diagrama de classes e diagrama de sequência |
| 19 e 20 | Tecnologias utilizadas e telas do sistema em execução |

## Decisões de implementação

As escolhas que não se explicam sozinhas lendo o código, e o motivo de cada uma:

| Decisão | Motivo |
|---|---|
| Datas trafegam como texto `AAAA-MM-DD` | A API não usa instantes. `new Date('2026-08-15')` é lido em UTC e exibiria 14/08 no horário de Brasília |
| Chave de cache com o mês em texto | Some a conversão entre o mês do servidor e a chave local |
| SQL parametrizado, sem ORM | Requisito da disciplina, e deixa o plano de execução visível |
| Restrições de integridade no banco, não só na aplicação | Regra que vive só no código é burlada por qualquer acesso direto ao banco |
| Teste de integração contra PostgreSQL real, sem mock | É o mesmo motor da produção: erro de SQL aparece na suíte, e não depois |
| Código de acesso configurável na tela de perfil | O RF04 exige que o código possa ser definido, e não havia tela para isso |
| Tempo de espera exibido na tela de acesso | A API informa a espera após tentativas sucessivas (RF03), e o usuário precisa vê-la |
| Biometria e aplicativo instalável fora do escopo | Registrados como evolução futura no documento da disciplina |
