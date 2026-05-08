# Arquitetura CasaSync

O CasaSync foi organizado como uma base full-stack escalável, separando responsabilidades por domínio.

## Backend

- `core`: configuração, segurança JWT e dependências compartilhadas.
- `database`: engine, sessão SQLAlchemy e inicialização do schema.
- `models`: entidades persistidas no PostgreSQL.
- `schemas`: contratos Pydantic de entrada e saída da API.
- `services`: regras de negócio, pontuação, família, tarefas, IA simulada e integrações.
- `routes`: camada HTTP do FastAPI.

Essa separação evita rotas gigantes e facilita evoluir para casos como múltiplas famílias por usuário, permissões, auditoria, Alembic e serviços externos.

## Frontend

- `layouts`: cascas visuais reutilizáveis para auth e app.
- `components`: blocos pequenos de UI, como cards, badges, lista de tarefas e cabeçalhos.
- `pages`: telas roteadas.
- `services`: cliente HTTP centralizado.
- `hooks`: estado de sessão/autenticação.

O design segue os mockups do CasaSync: dashboard SaaS, sidebar clara, cartões suaves, tons pastel, tabelas densas e foco em produtividade familiar.

## Integrações Futuras

- Google Agenda já possui modelo, service e endpoints de status/connect-url.
- Planejador IA já possui service isolado. Hoje usa mock, mas pode ser substituído por OpenAI/agents sem alterar as telas.
- Migrações Alembic devem substituir `create_all` antes de produção.
