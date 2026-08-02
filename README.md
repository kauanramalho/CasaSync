# CasaSync

CasaSync é uma base profissional de um sistema colaborativo de tarefas para casal/família. A proposta é substituir combinados espalhados em grupos de WhatsApp por um dashboard bonito, organizado e compartilhado, com tarefas, responsáveis, prazos, ranking, espaço do casal e preparação para integrações com IA e Google Agenda.

## Stack

- Frontend: React, Vite, TailwindCSS, React Router, Recharts e Lucide Icons
- Backend: Python, FastAPI, SQLAlchemy, JWT e Passlib/Bcrypt
- Banco: PostgreSQL
- Infra local: Docker Compose

## Funcionalidades Entregues

- Cadastro, login, senha criptografada e autenticação JWT
- Criação de família e entrada por código de convite
- Membros vinculados à família
- Categorias padrão do CasaSync
- CRUD inicial de tarefas com responsável, criador, categoria, prazo, prioridade, status e pontuação
- Dashboard com estatísticas, tarefas recentes, gráfico de produtividade, categorias e ranking
- Gamificação: baixa = 5 pontos, média = 10 pontos, alta = 20 pontos
- Espaço do Casal com metas, ideias de dates e notas rápidas
- Planejador IA simulado que transforma sugestões em tarefas reais
- Estrutura inicial para Google Agenda
- Telas: Login, Cadastro, Dashboard, Tarefas, Nova tarefa, Calendário, Categorias, Família, Ranking, Espaço do Casal, Planejador IA, Relatórios e Configurações

## Como Rodar com Docker

1. Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

2. Suba os containers:

```bash
docker compose up --build
```

3. Em outro terminal, gere dados fake:

```bash
docker compose exec api python -m app.seeds
```

4. Acesse:

- Frontend: http://localhost:5173
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

Login demo:

- `kauan@casasync.app`
- `12345678`

Também existe o usuário `bia@casasync.app` com a mesma senha.

## Rodando Localmente sem Docker

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Para rodar localmente, ajuste `DATABASE_URL` em um `.env` apontando para seu PostgreSQL.

Para testes locais controlados de cadastro, login e 2FA sem SMTP real, coloque
`ENVIRONMENT=development` e `EMAIL_DEV_MODE=true` no `.env` local da raiz do
projeto e recrie o container `api` com `docker compose up -d --build --force-recreate api`.
Nesse modo, a entrega de e-mail e simulada e o codigo 2FA de desenvolvimento e
`000000`. O `.env` local nao deve ser commitado. Nao use esse modo em producao;
o backend rejeita `EMAIL_DEV_MODE=true` quando `ENVIRONMENT=production`.

## Deploy em Produção

Backend (Render, Docker ou serviço equivalente):

- Root/build directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Docker: o `backend/Dockerfile` já usa `${PORT:-8000}` e bind em `0.0.0.0`.
- O startup executa `alembic upgrade head` antes de aceitar tráfego. Para uma migração manual controlada: `cd backend` e `alembic upgrade head`.
- Readiness com banco: `GET /health/ready`. O endpoint retorna `503` sem expor a string de conexão quando o PostgreSQL estiver indisponível.

Variáveis obrigatórias/recomendadas no backend:

- `ENVIRONMENT=production`
- `DATABASE_URL=postgresql+psycopg2://...`
- `JWT_SECRET_KEY=<segredo aleatorio com pelo menos 32 caracteres>`
- `FRONTEND_URL=https://seu-frontend.vercel.app`
- `CORS_ORIGINS=["https://seu-frontend.vercel.app"]` para origens extras, se necessário
- `CORS_ORIGIN_REGEX=^https://casa-sync(?:-[a-z0-9-]+)*\.vercel\.app$` somente se previews da Vercel precisarem acessar a API
- `TWO_FACTOR_HMAC_SECRET=<segredo forte separado do JWT>` obrigatorio
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, `EMAIL_FROM` para envio real de 2FA
- `EMAIL_DEV_MODE=false` em producao; codigos 2FA nunca sao gravados em logs
- `INTEGRATION_TOKEN_ENCRYPTION_KEY=<segredo forte e separado>` quando Google Agenda estiver habilitado

Frontend (Vercel/Netlify):

- Root/build directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Configure `VITE_API_URL=https://seu-backend-publico/api`. O cliente também aceita a URL sem `/api` e normaliza automaticamente.
- `NEXT_PUBLIC_API_URL` também é aceito como alias público. Não use `API_URL` genérico no frontend Vite.

Checklist rápido de autenticação em produção:

1. No DevTools > Network, o cadastro deve chamar `https://seu-backend-publico/api/auth/register`.
2. A requisição `OPTIONS` de preflight deve retornar 200/204 com `access-control-allow-origin` igual à URL do frontend.
3. A requisição `POST` deve retornar JSON. Se SMTP/2FA estiver ausente, o frontend deve exibir a mensagem real do backend, não `Failed to fetch`.
4. O build de produção do frontend não deve usar `localhost` em `VITE_API_URL`.

## Estrutura

```text
backend/
  app/
    core/       # config, auth, dependências
    database/   # engine e sessão SQLAlchemy
    models/     # entidades do domínio
    schemas/    # contratos Pydantic
    services/   # regras de negócio
    routes/     # endpoints FastAPI
frontend/
  src/
    components/ # UI reutilizável
    hooks/      # auth/session
    layouts/    # layout auth e dashboard
    pages/      # telas
    services/   # cliente HTTP
    utils/      # formatadores
docs/
  ARCHITECTURE.md
```

## Decisões de Arquitetura

- As regras de negócio ficam em `services`, não nas rotas.
- O frontend usa um cliente HTTP centralizado em `services/api.js`.
- O layout do app é compartilhado por todas as páginas autenticadas.
- O Planejador IA e o Google Agenda foram isolados em services próprios para trocar mocks por APIs reais depois.
- O schema é versionado pelo Alembic. O startup aplica somente migrations pendentes; `create_all` não é usado em produção.
- O cadastro é uma única transação: usuário e desafio 2FA só são confirmados depois da entrega SMTP; falhas fazem rollback.

## Próximos Passos Recomendados

- Criar uma migration Alembic para cada mudança futura de modelo antes do deploy.
- Implementar seleção de família ativa quando o usuário pertencer a mais de uma família.
- Criar permissões por papel (`owner`, `member`).
- Completar edição/exclusão de tarefas e categorias.
- Implementar notificações e lembretes.
- Integrar OAuth real do Google Agenda.
- Trocar o mock do Planejador IA por uma API de agentes.
- Adicionar testes unitários e de integração para services e rotas.
