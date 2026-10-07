# CasaSync — auditoria e melhorias de servicos

Data: 2026-10-07. Estado: **implementacao local validada; nao publicada**.

## Escopo e limites

Inventario de backend/frontend, analise estatica do backend inteiro, lint do frontend, auditoria de dependencias e revisao manual dos limites criticos: autenticacao, familias/permissoes, notificacoes/push, anexos, Google Agenda, busca e carregamento de contexto. Arquitetura existente preservada: HTTP em routes, regras em services, contratos em schemas, cliente compartilhado em `services/api.js`.

Nao e prova de ausencia de bugs em todo o codigo, pentest independente, certificacao de seguranca, conformidade WCAG integral ou teste em todos os aparelhos. Nenhuma credencial, variavel remota, schema remoto, grant Google ou deploy foi alterado nesta etapa. Lotes anteriores de recuperacao/UX foram preservados.

## Problemas confirmados e correcoes

| Problema | Correcao | Evidencia |
| --- | --- | --- |
| Busca global ficava presa no carregamento pela limpeza do proprio efeito | Dependencias corrigidas, retry explicito e invalidacao apos alteracoes | Resultado real no navegador para tarefa recem-criada |
| 401 atrasado podia limpar sessao de outra conta | Comparacao do token da requisicao com o token atual, inclusive bootstrap do AuthProvider | Teste de token antigo/atual; login/logout local |
| Notificacoes locais podiam misturar contexto | Exige usuario + familia; itens legados sem ownership nao aparecem | 2 testes de isolamento |
| Endpoint push arbitrario permitia destino controlado pelo cliente | HTTPS e allowlist de provedores, revalidacao de rows legadas, timeout 20s | 12 destinos internos/deceptivos rejeitados em teste |
| Inscricao push existente podia ser transferida de conta | Conflito 409, sem trocar ownership | Teste de takeover rejeitado e refresh pelo dono |
| Falta de e-mail podia liberar verificacao obrigatoria em producao | Falha 503 com rollback, sem verificar conta nem emitir sessao completa | Cadastro/login de producao sem entrega rejeitados |
| Traceback de autenticacao podia incluir parametros SQL pessoais | Log de tipo/fingerprint, sem payload/traceback | Regressao com erro SQL sintetico |
| Callback Google publico persistia vinculo apenas com state assinado | GET so redireciona; POST exige sessao/usuario/familia/version/membership | Callback nao chama provider; conclusao valida cifra tokens; divergencias rejeitadas |
| Retorno OAuth podia ser perdido pela montagem antes da familia ativa | Outlet inicial aguarda familia; URL limpa antes do POST | Retorno sintetico invalido mostra erro seguro e URL limpa |
| Scope Google amplo e resposta JSON inesperada | `calendar.app.created` + `calendar.events`; valida objeto JSON | URL de autorizacao e resposta nao-objeto testadas |
| Tela podia falhar sem recuperacao amigavel | Error boundary com recarga/inicio, sem detalhes privados | 2 testes de renderizacao |
| Cabecalho/resumo ocupavam espaco excessivo no celular | Perfil compacto, busca em segunda linha, indicadores em duas colunas | Screenshots de 390px; matriz responsiva |
| Destaques claros prejudicavam leitura no tema escuro | Superficies e textos semanticos escuros, gradientes e fundo branco/85 ajustados | Inspecao visual do destaque atrasado, mensagens e detalhes |
| Informacoes ficticias confundiam armazenamento/privacidade | Removidos medidor/backup ficticios e promessa de espaco privado do casal | Configuracoes mostra limites reais e compartilhamento da familia |
| Campos de tarefa/editor sem label associado | `htmlFor`/id, limites coerentes com backend, nome/fechamento acessiveis do editor | Labels e dimensoes do modal conferidos no navegador |

## Dependencias e analise estatica

- Baseline npm: 13 alertas, 11 altos + 2 moderados. Atualizacao compativel mais Nodemailer 10.0.16: **0 alertas de producao**; auditoria completa ainda tem **7** (5 altos + 2 moderados).
- Remanescentes: braces, chokidar, fast-glob, micromatch, postcss-nested, postcss-selector-parser, tailwindcss. Sao a cadeia dev/build do Tailwind 3. Nao sao falhas eliminadas: evitar compilar conteudo nao confiavel; migracao Tailwind 4 deve ter lote e regressao visual proprios. Nao foi usado `audit fix --force`.
- PyJWT instalado 2.14.0 tinha 2 alertas conhecidos. Requisito elevado para `>=2.15.0,<3.0.0`, ambiente local 2.15.1. `pip-audit`: **0 conhecidos**, compatibilidade **44 pacotes**.
- Reparo local da metadata antiga do PyJWT foi recuperavel: `pyjwt-2.14.0.dist-info` movido para `pyjwt-2.14.0.recovery` dentro da venv, sem apagar dependencias ou credenciais.
- Bandit 1.9.4: **10.491 linhas**, 0 arquivos ignorados, **0 altos / 7 medios / 4 baixos**. Exit code 1 esperado pelos alertas.
- Revisao contextual: B104 identifica string de host na lista de bloqueio, nao bind; B608 seleciona um de dois ORDER BY literais internos; B310s usam endpoints fixos OpenAI/Google ou relay de configuracao controlada e HTTPS em producao, IDs Google escapados. B105s sao tipos/prefixos/URL, nao senhas reais. Nao foram adicionadas supressoes para esconder achados.
- Vite 6 e ESLint 9 permanecem linhas antigas, apesar de pacotes compativeis atualizados. Nenhuma promessa de stack totalmente modernizada foi feita.
- Gitleaks nos diretorios `backend/app`, `frontend/src` e `frontend/api`, com saida redigida: nenhum vazamento detectado. Esta checagem de codigo nao certifica historico Git, ambientes remotos ou ausencia absoluta de segredos.

## Validacao atual

| Gate | Resultado |
| --- | --- |
| Backend completo (SQLite isolado, incluindo migracoes locais) | **164 aprovados** em 15,134s |
| Frontend, utilitarios/contratos/SW | **62 aprovados**, 0 falhas |
| ESLint, incluindo `no-undef` em todo JS/JSX | Aprovado |
| Build Vite com API HTTPS explicita | Aprovado; rotas continuam lazy-loaded |
| Auditorias de dependencias de producao e Python | 0 vulnerabilidades conhecidas |
| npm com dependencias de compilacao | Pendente: 7 alertas acima |
| Layout em 7 larguras, temas claro/escuro | 10 telas x 7 larguras x 2 temas = **140 verificacoes**, sem escape horizontal detectado |
| Login/cadastro publicos | 2 telas x 7 larguras = **14 verificacoes**, sem overflow de pagina |
| Modal de edicao | 320, 390, 768 e 1366px: dentro da largura/altura visivel, labels associados |
| Google real / telefone fisico / push suspenso | **Nao verificado** |
| Deploy / headers remotos deste lote | **Nao publicado / nao verificado** |

Larguras: 320, 390, 600, 768, 1024, 1366 e 1920px; alturas 844px em telas pequenas, 900px nas maiores. Rotas: Dashboard, tarefas, nova tarefa, calendario, categorias, familias, ranking, casal, relatorios, configuracoes. Scroll horizontal intencional de abas/calendario permanece; contencao global de overflow nao foi usada como desculpa para ignorar controles cortados.

Verificacao visual em navegador Chromium emulado, nao equivalente a Safari/iOS/Android real. HMR durante edicao apresentou incompatibilidade transitoria de contexto React; recarga completa recuperou. Rejeicoes OAuth/401 sinteticas foram provocadas intencionalmente, nao reportadas como fluxo real bem-sucedido.

### Historia ponta a ponta verificada localmente

Usuario sintetico faz login → cria tarefa no formulario → `POST /api/tasks` valida/persiste no SQLite em memoria → resposta confirma → navega para `/` → Dashboard e busca exibem a tarefa. Abertura de detalhes faz leitura pela API; nao e apenas mock visual.

| Limite | Estado | Evidencia |
| --- | --- | --- |
| UI → autenticacao | Aprovado local | Login/logout pela interface |
| Formulario → API | Aprovado local | Mensagem de tarefa criada e redirecionamento |
| API → banco → resposta | Aprovado local | Tarefa retornada em listagem e detalhes posteriores |
| Resposta → Dashboard/busca | Aprovado local | Novo titulo exibido, spinner da busca encerra |
| Google → consentimento real | Pendente externo | Console Cloud e verificacao nao confirmados |

Fixture: banco somente em memoria e provedores desligados. Nenhum dado de producao foi criado por estes testes.

## Comandos executados e reproduziveis

PowerShell na raiz do repositorio:

```powershell
git status --short
git branch --show-current
git rev-parse --show-toplevel
git log -1 --oneline
git remote -v
git diff --check
gitleaks dir backend/app --redact --no-banner
gitleaks dir frontend/src --redact --no-banner
gitleaks dir frontend/api --redact --no-banner
```

PowerShell em `backend`:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests
uv pip check --python .venv/Scripts/python.exe
uv tool run pip-audit --path .venv/Lib/site-packages --progress-spinner off
uv tool run bandit -r app -q
.venv/Scripts/python.exe -m tests.ui_fixture
```

PowerShell em `frontend`:

```powershell
node --test tests/*.test.mjs
npm.cmd run lint
$env:VITE_API_URL='https://casasync-api.onrender.com/api'
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=moderate
npm.cmd audit --audit-level=moderate
```

Desenvolvimento isolado, em outro terminal `frontend`: `$env:VITE_API_URL='http://localhost:8000/api'; npm.cmd run dev -- --host 127.0.0.1`. Atualizacoes executadas: `npm.cmd update --ignore-scripts`, `npm.cmd install 'nodemailer@^10.0.16' --ignore-scripts`, `uv pip install --python .venv/Scripts/python.exe 'PyJWT[crypto]>=2.15.0,<3.0.0' --reinstall-package pyjwt`.

## Arquivos deste lote (alem dos lotes locais anteriores preservados)

- Backend: `app/core/{config,push_security}.py`, `app/routes/{auth,integrations}.py`, `app/schemas/{integration,notification}.py`, `app/services/{calendar_provider_adapter,calendar_service,notification_service}.py`, `requirements.txt`.
- Testes backend: `test_auth_fallback.py`, `test_auth_security.py`, `test_google_calendar_oauth.py`, `test_audit_regressions.py`, `test_push_security.py`.
- Frontend base: `package.json`, `package-lock.json`, `eslint.config.js`, `vercel.json`, `src/main.jsx`, `src/styles.css`.
- Frontend componentes: `GlobalSearch.jsx`, `PageHeader.jsx`, `AppErrorBoundary.js`, `StatCard.jsx`, `TaskEditorModal.jsx`; hooks `useAuth.jsx`, `useNotifications.jsx`; `layouts/AppLayout.jsx`.
- Paginas: `Dashboard.jsx`, `NewTask.jsx`, `Register.jsx`, `Settings.jsx`, `Tasks.jsx`; cliente `services/api.js`; utils `auth.js`, `notificationVisibility.js`, `googleCalendarCallback.js`.
- Testes frontend: `auth.test.mjs`, `appErrorBoundary.test.mjs`, `notificationVisibility.test.mjs`, `googleCalendarCallback.test.mjs`, `deploymentHeaders.test.mjs`.
- Documentacao: este relatorio, `SECURITY_AUDIT.md`, `GOOGLE_CALENDAR_SYNC.md`.

## Pendencias priorizadas / proximo gate

1. **Google Cloud**: confirmar audience/marca/dominio/privacy/redirect e verificacao de scopes; depois consentimento real autorizado. Ver checklist em `GOOGLE_CALENDAR_SYNC.md`. Codigo sozinho nao remove aviso oficial; nao contorna-lo.
2. **Publicacao coordenada**: separar lotes locais preservados, revisar diff/segredos e obter confirmacao de publicacao. Conferir relay de e-mail real antes de ativar auth fail-closed. Publicar frontend/backend compativeis, manter projetos/dominios/variaveis existentes; smoke de login, familia, tarefa, e-mail, OAuth e headers. Nao foi contratado scheduler pago.
3. **Toolchain**: migrar Tailwind 4/Vite/ESLint em lote controlado; manter regressao de temas, componentes, CSS e bundle. Nodemailer major teve testes de contrato, mas entrega SMTP real nao foi validada nesta etapa.
4. **Operacao e midia**: JWT em localStorage, rate limit por processo, fotos por URLs opacas, persistencia local de anexos e backup do runtime continuam riscos arquiteturais. Mapear migracao para cookies/CSRF, limites distribuidos, storage duravel e acesso assinado sem quebrar dados existentes.
5. **Telefone real**: push com app suspenso, scheduler independente, gestos multitoque, teclado virtual, leitores de tela e Safari. Emulacao de largura nao substitui esses aceites.

Rollback: isolar primeiro cada lote em commit revisado; reverter somente o lote aprovado e frontend/backend OAuth juntos. Nao usar reset/checkout global no worktree sujo: ha trabalho anterior de schema e UX. Este lote nao exige migracao/downgrade de banco. Os tokens/grants Google existentes nao foram apagados.
