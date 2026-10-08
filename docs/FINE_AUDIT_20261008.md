# CasaSync — auditoria e ajustes finos de 2026-10-08

## Escopo e estado

Solicitacao: auditar codigo, seguranca, bugs, usabilidade e responsividade; corrigir problemas concretos e publicar no aplicativo oficial existente.

Base: `94857123dbcc0ca7d4fa0f933cb71e9ee7a84cb7`, branch `main`, repositorio `kauanramalho/CasaSync`. Os arquivos previamente nao rastreados `STATUS.md` e os tres recibos de releases anteriores foram preservados e nao fazem parte deste lote.

**Gate local aprovado.** Este documento foi produzido antes do push. A confirmacao de Vercel READY, Render LIVE, SHA e testes do dominio oficial pertence ao recibo `RELEASE_FINE_AUDIT_20261008.md`, gerado apos a publicacao. Nao confundir teste local, emulacao responsiva e aceitacao em aparelho fisico.

Sem nova migracao, alteracao de dominio/projeto, credenciais, flags de integracao ou desativacao de autenticacao. Arquitetura React/Vite + FastAPI e regras de permissao atuais foram preservadas.

## Problemas confirmados e corrigidos

| Problema | Correcao e evidencia |
| --- | --- |
| Exclusao de conta fazia commits por familia e podia falhar depois de remover participacoes anteriores | Saidas e desativacao em uma transacao, rollback integral, invalidacao de sessao e limpeza de familia ativa. Testes de recusa 409, falha de commit, commit unico e ultimo membro com FK ativa. |
| Titulos/nomes apenas com espacos passavam; PATCH aceitava null em campos obrigatorios | Tipos de texto compartilhados com trim e validacao backend. PATCH diferencia omissao de null; descricao, prazo, imagem e relacionamentos opcionais preservados. Teste HTTP retorna 422 e confirma tarefa inalterada. |
| Upload verificava cabecalho/assinatura, mas nao a imagem inteira nem seu limite de pixels | Servico compartilhado Pillow valida PNG/JPEG/WEBP, tipo real, decodificacao, lado e pixels. Executado no thread pool; arquivos originais e logs preservados. Sete testes, incluindo JPEG truncado. |
| Dashboard colocava entidades ORM diretamente na lista de schemas aninhados | Validacao `TaskRead` antes de agregar tarefas por categoria; serializacao JSON testada sem aviso do Pydantic. |
| Perfil nao tinha semantica de dialogo, foco preso/restaurado nem bloqueio de rolagem do fundo | Hook compartilhado e pilha de dialogos, Escape apenas no nivel superior, suporte a select/textarea e limpeza correta de dialogs aninhados. Validado pelo teclado no navegador. |
| Perfil podia enviar alteracoes antes de perceber confirmacao de senha invalida; trocar e-mail e senha juntos ignorava a senha | Pre-validacao anterior a upload/gravar, mensagens claras e solicitacao de operacoes separadas para e-mail e senha. Regras sensiveis continuam no backend. Isso nao transforma os endpoints separados em uma transacao unica. |
| Popovers tinham altura minima maior que o espaco disponivel | Posicionamento compartilhado limitado ao viewport, rolagem interna e retorno de foco; listas navegaveis por setas/Home/End. Conferidos em retrato e paisagem. |
| Seletor de data cortava os controles de hora em 320 px; mudar o dia substituia meia-noite por 09h | Controles empilhados no telefone e `??` para preservar hora zero. Antes: largura interna 306 px para 276 px disponiveis; depois: 276/276. Edicao manual manteve 00:30 ao trocar o dia. |
| Datas invalidas como 31 de fevereiro eram normalizadas silenciosamente | Parsing estrito com conferência dos componentes de data/hora e teste de regressao. |
| Lista de concluidas mostrava o prazo futuro como data de conclusao | Usa `completed_at`; tarefa com prazo 13/10 e conclusao em 08/10 agora mostra “Concluida: 08 de out.”. Sem registro usa fallback explicito. |
| Criacao/edicao de categoria nao tinha bloqueio sincronico de envio repetido | Ref de requisicao em andamento, botao desabilitado e estado “Salvando...”; criacao manual confirmada na fixture. |
| Campos e controles compartilhados sem nomes/estado acessiveis | Rotulos de senha, categoria, prioridade, status, prazo e lembrete; estados selecionado/expandido; datas por extenso. |
| Vulnerabilidade em dependencia de compilacao | Override de `postcss-selector-parser` para 7.1.6, lockfile atualizado e regressao de lint/build/temas aprovada. [Advisory oficial](https://github.com/advisories/GHSA-rj75-hqrm-r3gf). |

Os ajustes foram orientados pelos guias locais de arquitetura, seguranca, autenticacao, tarefas, anexos, IA/revisao humana, notificacoes, Google Agenda e qualidade. Nenhum provedor foi chamado por testes sinteticos.

## Validacoes e resultados

| Verificacao | Antes | Depois |
| --- | --- | --- |
| Backend unittest | 175 aprovados | **192 aprovados**, 23,986 s |
| Frontend Node tests | 95 aprovados | **110 aprovados**, zero falhas |
| ESLint / build Vite de producao | — | Aprovados; 2.290 modulos, build final 6,66 s |
| Ruff F821/F823/F401 | Aprovado | Aprovado |
| Compatibilidade Python | — | 45 pacotes compativeis |
| pip-audit do ambiente utilizado | 0 conhecidos | 0 conhecidos |
| npm audit --omit=dev | 0 | 0 |
| npm audit completo | 7 (5 altos, 2 moderados) | **5 altos**, somente cadeia de desenvolvimento/compilacao |
| Bandit | 0 altos, 7 medios, 4 baixos | Mesmo perfil; 10.675 linhas, nosec=0 |
| Diff whitespace | — | `git diff --check` aprovado |

Rastreamento de segredos do lote deve passar antes do commit/push. Os numeros de dependencia sao um snapshot desta data, nao promessa de ausencia de vulnerabilidades futuras.

### Navegador e responsividade

Fixture local em SQLite **em memoria**, usuario/familias/tarefas sinteticos, provedores desligados. Nao usou o startup de `app.main` para evitar migrar o banco configurado.

Dez telas: Dashboard, Tarefas, Nova tarefa, Calendario, Categorias, Familias, Ranking, Espaco do Casal, Relatorios e Configuracoes.

| Viewport Chromium | Telas verificadas | Overflow horizontal da pagina |
| --- | --- | --- |
| 320 × 568 | 10 | 0 |
| 390 × 844 | 10 | 0 |
| 844 × 390, paisagem | 10 | 0 |
| 768 × 1024 | 10 | 0 |
| 1024 × 768 | 10 | 0 |
| 1366 × 768 | 10 | 0 |
| 1920 × 1080 | 10 | 0 |

Mais **36 combinacoes**: seis temas × Dashboard/Nova tarefa/Aparencia × telefone 320 e notebook 1366. Mais **21**: login/cadastro/recuperacao × sete viewports. **127 verificacoes de pagina/tema/tamanho**, sem overflow horizontal; imagens visiveis da matriz principal sem erro. Medicao inicial de Configuracoes foi refeita apos carregar o status da integracao.

Fluxo manual isolado confirmado: login → criar tarefa com categoria → redirecionar ao Dashboard → abrir detalhes → editar titulo/prazo → concluir → conferir data real → reabrir. Tambem: categoria nova, trocar familia, controles de lider versus membro, painel do dia, Escape/foco de perfil e seletor aninhado no editor. Console local: zero erros nas leituras realizadas.

**Nao executado:** aplicativo nativo Android/iOS, aparelho fisico, Safari/WebKit, teclado virtual real, TalkBack/VoiceOver, instalacao PWA em aparelho e entrega push com app em segundo plano. Tamanhos representativos nao equivalem a todos os modelos de telefone/tablet.

### Seguranca: achados contextualizados

Bandit: bind `0.0.0.0` necessario ao hosting (B104); quatro textos marcados como senha sao tipo de token, prefixos de hash/criptografia e endpoint OAuth (B105); ORDER BY tem duas alternativas constantes (B608); cinco chamadas urlopen usam endpoints HTTPS constantes ou relay HTTPS validado na configuracao de producao (B310). Isso nao demonstra 11 exploracoes, nem substitui pentest.

Upload continua com limite de bytes/tipo/familia no backend. Pillow valida raster real; PDF continua com limite de bytes/tipo/assinatura, **sem sandbox, antivirus ou analise estrutural completa**. [Documentacao do Pillow sobre decodificacao e limites de imagem](https://pillow.readthedocs.io/en/stable/reference/Image.html).

## Riscos e fila remanescente

1. **P1 — toolchain:** cinco alertas altos associados a `braces`/chokidar/micromatch/fast-glob/Tailwind 3. O advisory nao fornece versao corrigida de braces; a solucao indicada implica migracao Tailwind 4 e regressao visual ampla. Sem `npm audit fix --force` nem downgrade silencioso. Nao executar compilacao com padroes glob provenientes de usuarios. [Advisory oficial](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
2. **P1 — aceite em aparelhos:** executar Android Chrome/PWA e iPhone/iPad Safari/PWA reais: login/2FA, teclado, recorte, compartilhamento, notificacao em segundo plano e acessibilidade. Nao validado aqui.
3. **P2 — integracoes externas:** Google OAuth/verificacao do consentimento, entrega real de e-mail/push e OpenAI faturada nao foram reexecutados. Testes de contrato, isolamento e falhas passaram. Nao contornar aviso de app nao verificado; aprovacao do Google exige processo externo.
4. **P2 — fusos:** PostgreSQL usa DateTime com timezone; SQLite da fixture descarta offset, portanto o round-trip de hora nessa fixture nao prova a persistencia real. Editor usa fuso do dispositivo e calendario usa preferencia do app; revisar consistencia quando forem diferentes, incluindo DST e meia-noite. Preservacao de 00:30 dentro do seletor esta validada.
5. **P2 — transacoes de perfil:** endpoints de perfil e senha continuam separados; senha atual recusada pode deixar alteracoes de perfil anteriores salvas. Pre-validacao evita erros locais conhecidos, nao promete atomicidade entre endpoints. Melhorar contrato em lote proprio, mantendo verificacao de e-mail.
6. **P2 — lideranca:** saida de lider quando ja existe outro administrador mantem o comportamento anterior. Formalizar transferencia de ownership antes de tornar obrigatoria uma politica diferente; nao promover membro silenciosamente.
7. **P2 — escala/hardening:** rate limit por instancia em memoria, tokens em storage do navegador, URLs opacas de midia, paginacao e testes de carga continuam melhorias arquiteturais separadas. Nao foram alterados nesta revisao fina.

Warnings de teste existentes: deprecacao Starlette/httpx, constante HTTP 413 e reflexao de indice de expressao no SQLite. Suites terminaram com OK. Ambiente local Python 3.11; build/runtime real do Render precisa concluir o gate remoto.

## Arquivos alterados

- Backend contratos: `app/schemas/{common,task,family,category,couple}.py`.
- Backend servicos: `auth_service.py`, `family_service.py`, `dashboard_service.py`, `image_service.py`, `task_attachment_service.py`, novo `image_validation.py`; `requirements.txt` acrescenta Pillow.
- Backend regressao: `tests/test_fine_audit.py`, `tests/test_image_validation.py`, `tests/test_api_auth_flow.py`.
- Frontend componentes: ProfileModal, SelectMenu, DateTimePicker, PasswordInput, AssigneePicker, TaskReminderFields, TaskList, TaskEditorModal, TaskDetailsModal e TaskDeleteConfirmModal.
- Frontend paginas: Calendar, Family, Categories, NewTask; hook `useDialogFocus`; utilitarios `tasks`, `popover`, `dialogFocus`, `dateTimeInput`, `profileValidation`; teste `fineAudit.test.mjs`; package/lockfile.
- Documentacao: este relatorio e `SECURITY_AUDIT.md`; recibo remoto separado depois do deploy.

## Comandos reproduziveis — PowerShell

Raiz canonica:

```powershell
Set-Location 'C:\Users\DeskTop-Kauan\Kauan Ramalho\Programacao\REPOSITORIOS GitHub\CasaSync'
git status --short
git branch --show-current
git rev-parse --show-toplevel
git log -1 --oneline
git remote -v
git diff --check
```

Backend, a partir da pasta `backend`:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests
uv tool run --from ruff ruff check app tests/test_fine_audit.py tests/test_image_validation.py --select F821,F823,F401
uv pip check --python .venv/Scripts/python.exe
uv tool run pip-audit --path .venv/Lib/site-packages --progress-spinner off
uv tool run --with bandit bandit -r app -f json
```

Frontend, a partir de `frontend`:

```powershell
npm.cmd install --ignore-scripts
node --test tests/*.test.mjs
npm.cmd run lint
$env:VITE_API_URL='https://casasync-api.onrender.com/api'
npm.cmd run build
npm.cmd audit --omit=dev --json
npm.cmd audit --json
```

`npm audit` completo retorna exit 1 pelos cinco alertas documentados; Bandit retorna nao zero pelos achados contextuais. `pip-audit --path` foi utilizado porque o ambiente gerido por uv nao tem pip instalado.

Fixture visual (terminais separados, sem usar credenciais de producao):

```powershell
# Terminal 1, backend
.venv/Scripts/python.exe -m tests.ui_fixture
# Terminal 2, frontend
$env:VITE_API_URL='http://localhost:8000/api'
npm.cmd run dev -- --host 127.0.0.1
# Navegador: http://localhost:5173
```

## Publicacao autorizada e rollback

Manter projeto Vercel `casa-sync` (`prj_p9xgSTuT6HMIgx8pWdrrD9g2m9qi`) e Render `CasaSync-api` (`srv-d809qe8sfn5c739bkjv0`). Push apenas dos arquivos deste lote em main, sem alterar remote ou forcar historico. Auto-deploy existente; conferir os dois provedores no mesmo SHA.

Antes da release: frontend rollback `dpl_4NQQjX3HZpcYijEt2JnzcqAvF5xa`, SHA `94857123dbcc0ca7d4fa0f933cb71e9ee7a84cb7`; backend rollback `dep-db3ge5ek1f9s73a29oj0`, SHA `6f2f738108b9afa4a08b8cbaae3bc165bf015ab7`. Sem schema novo, o lote nao requer downgrade de banco. Se houver falha nova de build/runtime, restaurar deployments anteriores nos mesmos projetos e comunicar; nao apagar dados nem recriar recursos.

Aceite remoto: deploys prontos, dominio oficial e readiness HTTP 200, assets da release identificados, navegacao autenticada de leitura e popovers corrigidos visiveis; consultar erros apos estabilizacao. Nao excluir contas/familias nem enviar mensagens/integracoes em producao para provar esta revisao.
