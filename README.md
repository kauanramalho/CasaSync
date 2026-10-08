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

## Instalacao como aplicativo no iPhone, iPad e Android

O botao **Instalar aplicativo** aparece nas telas de acesso e nas configuracoes,
e fica oculto quando o CasaSync ja esta aberto como aplicativo. No iPhone/iPad,
o guia detecta tambem iPads em modo de navegacao desktop e explica o caminho
Safari → Compartilhar → Adicionar a Tela de Inicio → Adicionar. Se houver
**Abrir como App da Web**, mantenha essa opcao ativada. O guia inclui recuperacao
quando a acao nao aparece, instrucao para sair do navegador interno de outros apps
e escolha manual de plataforma. No Android/Chrome, o botao usa o prompt nativo
quando disponivel, com instrucoes alternativas quando ele nao e oferecido.

O manifesto `site.webmanifest` ja declara `display: standalone`, `id`, `scope` e
`start_url`; o HTML inclui os metadados Apple e o icone PNG 180x180. Os recursos
publicados de manifesto, icone Apple e service worker responderam HTTP 200 na
verificacao de 2026-10-07. Isso nao comprova instalacao em um iPhone fisico.

**Manter sessao aberta** no login preserva o token no armazenamento local deste
dispositivo; desmarcada, usa apenas o armazenamento da sessao da aba. A preferencia
da caixinha e lembrada sem salvar usuario ou senha. A autenticacao existente,
a verificacao 2FA e a validade do token continuam sendo determinadas pelo servidor.
Troca de senha, logout, expiracao ou limpeza dos dados do site podem exigir login.
Falha do navegador ao gravar o token gera orientacao explicita e nao e apresentada
como sessao persistente. Leituras e limpeza de armazenamento bloqueado nao lancam
erros brutos no fluxo de autenticacao.

No iOS, o login feito no Safari pode nao acompanhar o aplicativo instalado: o
CasaSync usa tokens no armazenamento local, que nao e copiado para o app durante
a instalacao. Abra pelo icone novo e entre uma vez com **Manter sessao aberta**.
Nao transferir tokens por URL nem alterar autenticacao para cookies apenas para
contornar essa separacao. Referencias: [guia oficial Apple](https://support.apple.com/pt-br/guide/iphone/iphea86e5236/ios)
e [separacao de armazenamento documentada pelo WebKit](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).

Aceitacao em aparelho real apos publicacao autorizada: instalar pelo Safari,
abrir pelo icone sem barra de endereco, entrar com persistencia marcada, fechar
e reabrir, e testar logout. Repetir a opcao desmarcada e conferir Android/iPad.
Interface emulada e testes locais nao substituem esses gestos no dispositivo.

Validacao local desta etapa: 72 testes frontend, 44 testes backend de autenticacao,
ESLint, build, diff check e Gitleaks aprovados. No Chrome local, foi conferida a
preferencia da caixinha apos recarga, a abertura/fechamento do guia, retorno do
foco, rolagem interna e ausencia de overflow horizontal em 320/390 px. Instalacao,
suspensao e reabertura em iPhone/iPad fisicos continuam pendentes, assim como deploy.

Arquivos desta etapa: `frontend/src/components/InstallApp.jsx`,
`frontend/src/hooks/usePwaInstall.jsx`, `frontend/src/utils/pwaInstall.js`,
`frontend/src/layouts/AuthLayout.jsx`, `frontend/src/main.jsx`,
`frontend/src/pages/Login.jsx`, `frontend/src/pages/Settings.jsx`,
`frontend/src/services/api.js`, `frontend/tests/pwaInstall.test.mjs`,
`frontend/tests/sessionPersistence.test.mjs` e este README. Os lotes anteriores
de recuperacao de senha e os arquivos pre-existentes foram preservados.

Comandos no PowerShell, na raiz canonica do CasaSync:

```powershell
Push-Location frontend
node --test tests/*.test.mjs
npm.cmd run lint
$env:VITE_API_URL = 'https://casasync-api.onrender.com/api'
npm.cmd run build
Pop-Location
Push-Location backend
.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_auth*.py'
Pop-Location
git diff --check
```

## Deploy em Produção

### Recuperacao de senha

Na tela de login, **Esqueci minha senha** abre `/recuperar-senha`. A pessoa informa
o e-mail da conta, recebe um codigo e define a nova senha. A conta, as familias e
as tarefas sao preservadas; sessoes e codigos anteriores sao invalidados na troca.
O fluxo tambem recupera cadastros ativos que ainda aguardam verificacao de e-mail.

O backend expoe `POST /api/auth/password/forgot` (email) e
`POST /api/auth/password/reset` (email, code, new_password). As solicitacoes nao
confirmam se uma conta existe. Codigos sao armazenados como HMAC, expiram no prazo
`TWO_FACTOR_CODE_TTL_MINUTES`, respeitam limite de tentativas e intervalo de reenvio.
`PASSWORD_RESET_ENABLED=false` desativa os endpoints. Sem canal de e-mail configurado,
a recuperacao fica indisponivel; nao ha troca de senha sem comprovar o codigo.

Para publicar esta funcionalidade, publique primeiro o frontend/relay que aceita
`password_reset`, depois o backend. Nao exige migracao de banco nem novas credenciais.
Teste a chegada do e-mail e a troca completa com uma conta de QA controlada antes de
considerar o fluxo validado em producao. Em desenvolvimento, a entrega pode ser simulada
com `EMAIL_DEV_MODE=true`; isso nao comprova envio real. Os limites por IP/e-mail sao
locais ao processo, enquanto prazo, tentativas e consumo do codigo ficam no banco.

Validacao local desta implementacao: 175 testes backend (11 de recuperacao), 62
testes frontend, ESLint, build, `git diff --check` e Gitleaks com redacao passaram.
O link de login e a tela inicial de recuperacao foram conferidos no navegador,
incluindo largura de celular. Envio real e fluxo completo em producao pendentes.
Arquivos envolvidos: `backend/app/{core/config.py,routes/auth.py,schemas/user.py,
services/email_service.py,services/password_reset_service.py}`, teste
`backend/tests/test_password_reset.py`, `frontend/src/{App.jsx,pages/Login.jsx,
pages/Register.jsx,pages/ForgotPassword.jsx,services/api.js}`, relay
`frontend/api/internal/email-delivery.js`, `frontend/tests/emailDelivery.test.mjs`,
`.env.example` e este README. Nenhuma alteracao de schema ou credenciais.

Comandos de validacao no PowerShell, a partir da raiz canonica do repositorio:

```powershell
Set-Location 'C:\Users\DeskTop-Kauan\Kauan Ramalho\Programacao\REPOSITORIOS GitHub\CasaSync'
Push-Location backend
.venv/Scripts/python.exe -m unittest discover -s tests
Pop-Location
Push-Location frontend
node --test tests/*.test.mjs
npm.cmd run lint
# URL explicita usada somente neste processo de validacao do build.
$env:VITE_API_URL = 'https://casasync-api.onrender.com/api'
npm.cmd run build
Pop-Location
git diff --check
```

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
- `FRONTEND_URL=https://DOMINIO-REAL-DO-CASASYNC.vercel.app` (substitua pelo dominio exato confirmado no projeto Vercel)
- `CORS_ORIGINS=["https://DOMINIO-REAL-DO-CASASYNC.vercel.app"]` para origens extras, se necessário
- `CORS_ORIGIN_REGEX=^https://SEU-SLUG-VERCEL(?:-[a-z0-9-]+)*\.vercel\.app$` somente se previews da Vercel precisarem acessar a API; substitua o slug e valide o padrao
- `TWO_FACTOR_HMAC_SECRET=<segredo forte separado do JWT>` obrigatorio
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, `EMAIL_FROM` para envio real de 2FA
- `EMAIL_DEV_MODE=false` em producao; codigos 2FA nunca sao gravados em logs
- `INTEGRATION_TOKEN_ENCRYPTION_KEY=<segredo forte e separado>` quando Google Agenda estiver habilitado

Frontend (Vercel/Netlify):

- Root/build directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Configure `VITE_API_URL=https://casasync-api.onrender.com/api` no ambiente de producao. O cliente também aceita a URL sem `/api` e normaliza automaticamente.
- `NEXT_PUBLIC_API_URL` também é aceito como alias público. Não use `API_URL` genérico no frontend Vite.
- O build rejeita API ausente, HTTP, host local ou URL com credenciais. O fallback local existe apenas no servidor de desenvolvimento.
- O cliente aguarda até 65 segundos para a API gratuita iniciar, sem repetir automaticamente operações de escrita.
- Diagnóstico atual, testes e configuração dos domínios confirmados: [recuperação de conectividade](docs/CONNECTIVITY_RECOVERY.md).

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
