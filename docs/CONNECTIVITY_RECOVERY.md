# Recuperação de conectividade do CasaSync

Verificação: 2026-09-15. Checkout canônico: `C:\Users\DeskTop-Kauan\Kauan Ramalho\Programacao\REPOSITORIOS GitHub\CasaSync`, branch `main`, commit-base `1bf46b8`.

## Resultado e limite

O banco Neon está conectado à API publicada. Não foi necessário trocar `DATABASE_URL`, recriar o banco ou migrar dados. As correções abaixo estão no checkout local; **não foram publicadas**. Login autenticado e operações de família em produção ainda precisam de aceitação pós-publicação com uma conta autorizada.

`STATUS.md` já estava não rastreado antes deste trabalho e foi preservado. Nenhum commit, stage, push, deploy ou alteração de variável remota foi feito.

## Evidência atual e causa

| Superfície | Evidência confirmada | Conclusão |
| --- | --- | --- |
| API `https://casasync-api.onrender.com` | `/health` e `/health/ready`: HTTP 200; readiness informa `database: ok` | A conexão com o banco funciona |
| Inicialização da API | Primeiras consultas demoraram aproximadamente 43 segundos; consulta posterior de readiness demorou cerca de 0,5 segundo | O timeout anterior de 25 segundos não comportava a inicialização observada; pode explicar a falha inicial de login |
| Neon `casasync-production` | Consulta somente leitura: `SELECT 1` retorna 1; revisão `20260801_0001`; 5 usuários, 1 família, 1 vínculo de membro | Há dados existentes; não recriar nem substituir o banco |
| Frontend Vercel `https://casa-sync.vercel.app` | Bundle público contém `https://casasync-api.onrender.com/api`; preflight autorizado retorna 200 e origem exata | A URL e o CORS do domínio principal já estavam corretos |
| Frontend adicional `https://casasync.onrender.com` | Bundle público sem `VITE_API_URL`/`NEXT_PUBLIC_API_URL`; preflight dessa origem retorna 400 sem `Access-Control-Allow-Origin` | Esse endereço possui dois bloqueios confirmados: configuração da API ausente e origem não autorizada |
| Parser CORS local, antes da correção | `Settings(cors_origins=...)` aceitava CSV, mas `CORS_ORIGINS` via `os.environ` gerava `SettingsError` para CSV e origem única; JSON funcionava | O decodificador automático de `pydantic-settings` executava antes do validator |

A API está em plano gratuito do Render. O compute do Neon foi observado inicialmente arquivado e depois ativo durante as consultas. A duração de 43 segundos mede o caminho de inicialização observado; não identifica isoladamente quanto tempo pertence a cada provedor. Não há evidência de perda de dados nem de falha causada pela integração de IA.

O domínio efetivamente usado pelo usuário ainda não foi confirmado. Não alterar o frontend adicional sem confirmar se ele deve continuar sendo usado.

## Impacto mapeado e mudanças

Pontos de código: timeout em `frontend/src/services/api.js:8`, resolução em `frontend/src/services/apiConfig.js:43`, build guard em `frontend/vite.config.js:8`, campo CORS em `backend/app/core/config.py:127` e parser em `backend/app/core/config.py:172`. A trava de família está em `frontend/src/pages/Family.jsx:55`.

- `frontend/src/services/apiConfig.js`: resolução e normalização compartilhadas entre build e cliente. Prioridade: `VITE_API_URL`, depois `NEXT_PUBLIC_API_URL`. API pública com ou sem `/api`, sem barras duplicadas, query, fragmento ou credenciais. Produção exige HTTPS e rejeita host local. O fallback é passado pelo cliente somente em desenvolvimento e eliminado do build de produção.
- `frontend/src/services/api.js`: timeout de 25 para 65 segundos; função de transporte testável com fetch simulado. Sem retry automático de POST. Bearer JWT, `credentials: "omit"`, deduplicação de GET e header de família ativa preservados.
- `frontend/vite.config.js`: a ausência de URL válida agora impede o build; evita publicar uma aplicação que só descobre o problema no login. `envDir` continua na raiz do repositório.
- `frontend/src/pages/Family.jsx`: trava síncrona e estado de espera compartilhados entre criação e solicitação de entrada; formulários ficam bloqueados durante a operação e são liberados após falha. A recarga manual existente e os estados sem família foram preservados.
- `backend/app/core/config.py`: `NoDecode` permite que origem única, CSV e JSON das variáveis reais cheguem ao parser. Itens CSV vazios são rejeitados, assim como caminhos, credenciais, URL inválida e wildcard. O middleware não foi ampliado.
- `backend/requirements.txt`: mínimo `pydantic-settings>=2.9.0`, validado por importação de `NoDecode` na versão 2.9.0.
- `.env.example` e `README.md`: documentação do contrato de configuração e do build seguro.

Sem mudanças em modelos, schemas, regras de login, propriedade da família, autorização, migrações, integrações de IA/Google ou envio de e-mail. `/health` e `/health/ready` foram reutilizados sem alteração.

### Contratos de família e autenticação preservados

A base do cliente é `https://casasync-api.onrender.com/api`. A tela consulta `GET /families`; havendo família, consulta `/families/current`, `/families/current/members` e `/dashboard`; administradores também consultam `/families/current/join-requests`.

Criação: `POST /families`, payload `{ "name": "..." }`. Convite: `POST /families/join`, payload `{ "invite_code": "..." }`, com aprovação posterior pelo administrador. Bearer JWT obrigatório; a fronteira de família permanece validada no backend.

Usuário sem família: lista HTTP 200 com `[]`; família ativa HTTP 404. Esse estado não gera erro de rede. HTTP 401, 403, 404, 429 e 5xx continuam distintos de failed fetch e timeout. O navegador não permite distinguir com certeza CORS de outras causas de failed fetch; não apresentar essa hipótese como diagnóstico exclusivo.

CORS continua com `allow_credentials=False`, métodos GET/POST/PUT/PATCH/DELETE/OPTIONS e os headers já existentes, incluindo Authorization, Content-Type e X-CasaSync-Family-Id. Sem wildcard e sem cookies cross-site novos. Origens locais são adicionadas somente em desenvolvimento e excluídas da allowlist de produção.

## Testes e validação

| Verificação | Resultado |
| --- | --- |
| Backend completo: unittest | 130 testes passaram |
| Frontend completo: node --test | 37 testes passaram |
| Frontend: ESLint | Passou |
| Frontend: build com API pública | Passou; 2274 módulos transformados |
| Build sem URL e com API local HTTPS | Ambos recusados como esperado; testes do guard passaram |
| Backend: compileall | Passou |
| Alembic heads | Uma revisão: `20260801_0001` |
| Alembic/model drift | Testes de migração em SQLite temporário passaram; `alembic check` sem novas operações |
| Dependências Python: uv pip check | 44 pacotes compatíveis |
| Git diff --check e revisão dos arquivos novos/diff | Passaram; nenhum arquivo de credencial ou artefato local no escopo |
| Navegador: cadastro e ativação 2FA local | Passaram, com entrega simulada e código de desenvolvimento |
| Navegador: login por username e por e-mail | Passaram |
| Navegador: usuário sem família | Estado vazio correto, sem erro de conexão |
| Navegador: criar família, solicitar convite e aprovar | Passaram; família exibiu dois membros |
| Navegador: membro comum | Controles administrativos ocultos/desabilitados |
| Navegador: submissão duplicada com resposta 503 simulada | Duas submissões resultaram em um POST de criação; duas submissões de convite resultaram em um POST de convite; controles liberados após falha |
| Navegador: botão Tentar novamente após 503 simulado | Recarregou a lista com um GET e removeu o erro, sem reenviar o POST |
| Navegador: criação após os ajustes finais | Família criada, ativa e com controles liberados |
| Navegador: desktop e mobile 390 × 844 | Conteúdo renderizado, sem overlay de erro ou overflow horizontal; nenhum erro JavaScript reportado pelo navegador |

Testes novos: `backend/tests/test_cors_environment.py`, `frontend/tests/apiTimeout.test.mjs`. Atualizados: `backend/tests/test_api_auth_flow.py`, `frontend/tests/apiConfig.test.mjs`. Testes externos de integração continuam com mocks; as verificações remotas foram exclusivamente de leitura, sem credenciais de usuários.

O banco do teste de navegador foi criado em diretório temporário, separado do Neon. O navegador e os servidores desse teste foram encerrados após a validação.

### Comandos executados — PowerShell, raiz canônica

```powershell
Set-Location 'C:\Users\DeskTop-Kauan\Kauan Ramalho\Programacao\REPOSITORIOS GitHub\CasaSync'
uv venv backend/.venv --python 3.11
uv pip install --python backend/.venv/Scripts/python.exe -r backend/requirements-dev.txt
$env:PYTHONPATH = Join-Path (Get-Location).Path 'backend'
& backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests -q
& backend/.venv/Scripts/python.exe -m compileall -q backend/app backend/tests
& backend/.venv/Scripts/python.exe -m alembic -c backend/alembic.ini heads
uv pip check --python backend/.venv/Scripts/python.exe
uv run --no-project --with 'pydantic-settings==2.9.0' --python backend/.venv/Scripts/python.exe python -c "import pydantic_settings; from pydantic_settings import NoDecode; print(pydantic_settings.__version__)"
git diff --check
git status --short
```

### Comandos executados — PowerShell, frontend canônico

```powershell
Set-Location 'C:\Users\DeskTop-Kauan\Kauan Ramalho\Programacao\REPOSITORIOS GitHub\CasaSync\frontend'
npm.cmd ci --no-audit --no-fund
node --test tests/*.test.mjs
npm.cmd run lint
$env:VITE_API_URL = 'https://casasync-api.onrender.com/api'
npm.cmd run build
rg -n --only-matching --glob '*.js' 'https://casasync-api\.onrender\.com/api|https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?' dist/assets
```

O smoke no navegador usou `npx.cmd --yes agent-browser --session casasync-recovery`, com backend local na porta 8010 e Vite na porta 5173. Comandos-base, executados na raiz canônica:

```powershell
npx.cmd --yes agent-browser --session casasync-recovery open http://127.0.0.1:5173/cadastro
npx.cmd --yes agent-browser --session casasync-recovery snapshot -i
npx.cmd --yes agent-browser --session casasync-recovery errors
npx.cmd --yes agent-browser --session casasync-recovery set viewport 390 844
npx.cmd --yes agent-browser --session casasync-recovery close
```

Os formulários foram preenchidos com dois usuários fictícios. As simulações de atraso, 503 e contagem de chamadas foram injetadas apenas na sessão local via `eval --stdin`; não fazem parte do app publicado. Refs do snapshot foram atualizadas após navegação; nenhuma senha ou sessão real foi usada.

## Configuração exata para publicação — ainda não executada

### Vercel, projeto `casa-sync`

- Production: manter `VITE_API_URL=https://casasync-api.onrender.com/api`; o bundle atual já confirma esse valor.
- Preview: o mesmo valor somente se esses previews forem autorizados a acessar a API. Confirmar cada origem no backend; não habilitar regex genérico nem todos os projetos da conta.
- Development: usar o backend local ou deixar a URL ausente para o fallback de desenvolvimento; não configurar credenciais do banco no frontend.
- Publicar o código corrigido exige novo build/deploy. A configuração atual correta não precisa ser substituída.

### Render, serviço `CasaSync-api`

Configuração mínima para o domínio principal confirmado:

```env
ENVIRONMENT=production
FRONTEND_URL=https://casa-sync.vercel.app
CORS_ORIGINS=[]
EMAIL_DEV_MODE=false
```

`FRONTEND_URL` já inclui a origem principal. Se origens extras estiverem em uso, preservá-las após validar autorização. O formato JSON é recomendado; após a correção, origem única e CSV também funcionam nas variáveis reais. A variável que controla as regras de produção é `ENVIRONMENT`, não `APP_ENV`.

Somente se o frontend adicional do Render continuar em uso, adicionar a origem exata:

```env
CORS_ORIGINS=["https://casasync.onrender.com"]
```

Não trocar `DATABASE_URL`, JWT, HMAC ou credenciais de e-mail: nenhuma necessidade de substituição foi demonstrada. Mudança de CORS/código exige restart/deploy do backend.

### Render, frontend adicional `CasaSync`

Somente se esse endereço for mantido: configurar `VITE_API_URL=https://casasync-api.onrender.com/api` **no build do static site**, não apenas no backend. Fazer rebuild. Sem isso, o frontend publicado continua sem API, independentemente do estado do banco.

### Ordem e aceitação após autorização

1. Confirmar qual frontend o usuário utiliza e quais origens extras devem permanecer autorizadas.
2. Revisar e autorizar separadamente publicação e mudanças remotas; manter `STATUS.md` fora do escopo.
3. Publicar o backend corrigido, mantendo a conexão Neon; esperar `/health/ready` retornar 200.
4. Se necessário, corrigir a configuração do frontend adicional e sua origem CORS exata.
5. Publicar o frontend corrigido e conferir que o novo bundle contém a API pública, sem fallback de API local.
6. Validar preflight da origem real e HTTP 401 com CORS correto em `/api/families` sem token.
7. Com uma conta de teste autorizada, validar login por e-mail/username, cadastro/2FA real, criação de família, convite pendente, aprovação e recarga. Não usar contas reais de terceiros nem envio de e-mail sem autorização.

## Limitações e riscos restantes

- Não afirmar que produção autenticada foi corrigida antes da publicação e aceitação acima. Readiness com banco não substitui login ou teste de família autenticado.
- 65 segundos comportam a inicialização observada, mas não garantem que toda inicialização futura termine nesse prazo. Sem retry automático, wake-up recorrente ou serviço pago novo.
- Abort do navegador não garante cancelamento de escrita já iniciada no servidor. Em timeout de criação, recarregar/verificar famílias antes de repetir a operação.
- O bundle contém `http://localhost` dentro do React Router como base de parsing de URLs relativas. Essa ocorrência já pertence à dependência e não é URL de fetch nem fallback da API. O fallback `http://localhost:8000/api` foi eliminado do build de produção. A exigência literal de zero ocorrências de localhost no bundle não foi atendida; alterar a dependência apenas para esconder essa string seria fora do escopo.
- Alembic/model drift foi validado em SQLite; esse dialect não reflete o índice de expressão de username. PostgreSQL completo e índice de expressão não foram retestados neste trabalho; nenhum modelo ou migration foi alterado.
- Há avisos das dependências nos testes: depreciação de TestClient/httpx, HMAC curto em fixtures antigas e reflexão limitada de índice no SQLite. Não houve teste falhando.
- Backend não possui comando dedicado de lint/typecheck e frontend não possui script typecheck. Não apresentar compileall como typecheck.
- O encerramento dos servidores foi confirmado sem listeners nas portas 8010/5173. A remoção do banco fictício em `C:\Users\DeskTop-Kauan\AppData\Local\Temp\casasync-browser-test-qp17q7fm\smoke.db` foi bloqueada pela política de execução; esse arquivo temporário permanece fora do repositório e não contém dados de produção.
