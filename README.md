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
- O backend cria tabelas automaticamente no startup para facilitar o MVP. Antes de produção, substitua por migrations com Alembic.

## Próximos Passos Recomendados

- Adicionar Alembic com migrações versionadas.
- Implementar seleção de família ativa quando o usuário pertencer a mais de uma família.
- Criar permissões por papel (`owner`, `member`).
- Completar edição/exclusão de tarefas e categorias.
- Implementar notificações e lembretes.
- Integrar OAuth real do Google Agenda.
- Trocar o mock do Planejador IA por uma API de agentes.
- Adicionar testes unitários e de integração para services e rotas.
