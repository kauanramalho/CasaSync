# Auditoria de Seguranca CasaSync

Atualizada em: 2026-10-07. Correcoes desta revisao ainda locais, nao publicadas.

## Revisao de 2026-10-07

- Cadastro e verificacao obrigatoria falham com 503 em producao se nao houver canal de e-mail; nao verificam contas nem emitem sessao completa como fallback. Simulacao local permanece disponivel apenas fora de producao.
- Excecoes inesperadas de autenticacao registram tipo e fingerprint, nao traceback/parametros SQL com dados da conta.
- Web Push aceita somente endpoints HTTPS de provedores conhecidos, valida registros antigos antes do envio, limita timeout a 20 segundos e impede transferir uma inscricao entre usuarios.
- Callback Google publico nao troca nem persiste tokens. Finalizacao exige POST autenticado, mesmo usuario, familia, versao da sessao e membership atual. Codigo/state seguem no fragmento do frontend, removido antes do POST.
- Permissao ampla `calendar` substituida por `calendar.app.created`; `calendar.events` mantida. Grants antigos nao foram revogados.
- Uma resposta 401 atrasada de outra sessao nao encerra a sessao atual. Notificacoes locais exigem usuario e familia identificados.
- Headers do frontend foram configurados contra framing, sniffing e vazamento de Referer; verificacao no dominio publicado ainda pendente.
- PyJWT atualizado para 2.15.1 no ambiente local e requisito minimo 2.15.0. Nodemailer atualizado para 10.0.16; lockfile atualizado sem scripts de instalacao.

Validacao atual: **164 testes backend, 62 frontend, lint e build aprovados**; `pip-audit` e `npm audit --omit=dev` sem vulnerabilidades conhecidas. Auditoria completa npm ainda aponta **7 alertas no toolchain Tailwind 3 (5 altos, 2 moderados)**. Bandit: 10.491 linhas, 0 altos, 7 medios e 4 baixos; achados contextuais revisados, nao equivalentes a 11 vulnerabilidades confirmadas.

Detalhes, comandos, limites e gate de publicacao: [SERVICE_AUDIT_20261007.md](SERVICE_AUDIT_20261007.md).

## Fluxo de autenticacao revisado

- Cadastro e login validavam senha no backend e emitiam JWT completo imediatamente.
- O frontend armazenava apenas o token completo em `localStorage`.
- Rotas privadas do backend passam por `get_current_user` ou por `get_family_id`, que depende de `get_current_user`.
- Logout invalida sessoes existentes ao incrementar `token_version`.
- Familias ja tinham aprovacao pendente por administrador; entrada direta por codigo esta desativada.

## Alteracoes aplicadas

- Cadastro agora cria conta com `email_verified=false` e envia codigo por e-mail antes de liberar acesso completo.
- Login agora exige codigo quando o e-mail ainda nao foi verificado ou quando `last_2fa_verified_at` passou do intervalo configurado.
- Sessao parcial usa JWT separado com `typ=2fa`, `challenge_id` e expiracao curta.
- `get_current_user` rejeita tokens parciais e usuarios sem e-mail verificado.
- Codigos 2FA ficam na tabela `two_factor_codes` com HMAC, salt, expiracao, uso unico e limite de tentativas.
- Reenvio invalida codigos antigos e aplica cooldown/limite por hora.
- Frontend usa `sessionStorage` para desafio 2FA pendente e so grava `localStorage` apos verificacao concluida.
- Alteracao de e-mail no perfil agora exige nova verificacao antes de continuar usando a conta.
- Foram adicionados rate limits em login, cadastro, verificacao, reenvio e solicitacao de entrada em familia.
- Headers de seguranca foram adicionados no backend; HSTS e CSP entram apenas em producao.
- Campos textuais, codigos, listas e URLs receberam limites backend para reduzir abuso, payloads gigantes e manipulacao de entrada.
- Credenciais de SMTP e parametros 2FA foram documentados em `.env.example`.
- Login nao vem mais preenchido com credenciais de demo.
- Troca de e-mail e exclusao de conta exigem confirmacao da senha atual no backend.
- Estado OAuth do Google respeita `token_version` e deixa de funcionar apos invalidacao de sessao.
- Login executa verificacao bcrypt equivalente para identificadores inexistentes, reduzindo enumeracao por tempo.
- Rate limit por conta independe do IP, ignora `X-Forwarded-For` nao confiavel e limita buckets em memoria.
- Producao falha ao iniciar com JWT fraco, modo de e-mail de desenvolvimento ou secrets criticos ausentes/compartilhados.
- Payloads de autenticacao rejeitam campos extras e novas senhas exigem ao menos uma letra e um numero.
- Codigos 2FA nao sao registrados em logs; producao exige canal real SMTP ou relay HTTP autenticado e desenvolvimento local pode simular entrega com `000000`.
- Cadastro novo e desfeito quando a entrega inicial do codigo 2FA falha.
- CORS de previews nao e habilitado por regex implicitamente.

## Variaveis de ambiente criticas

- `JWT_SECRET_KEY`: obrigatoria e forte em producao.
- `TWO_FACTOR_HMAC_SECRET`: obrigatorio em producao, forte e separado do JWT.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, `EMAIL_FROM`: envio SMTP real; alternativamente, relay HTTPS com `EMAIL_DELIVERY_HTTP_URL` e token forte pareado.
- `EMAIL_DEV_MODE=false`: obrigatorio em producao. O CasaSync nunca registra codigo 2FA em logs.
- `INTEGRATION_TOKEN_ENCRYPTION_KEY`: obrigatoria, forte e separada quando Google Agenda estiver ativo em producao.
- `ENVIRONMENT=production` para habilitar HSTS/CSP e evitar comportamento de desenvolvimento.

## Riscos remanescentes antes do beta

- O rate limit continua em memoria e por instancia; para escala horizontal, migrar para Redis ou gateway/API WAF.
- Tokens continuam em `localStorage`; para maior hardening futuro, considerar cookie HttpOnly/Secure/SameSite com CSRF.
- Recuperacao de senha nao existe no codigo atual; quando adicionada, aplicar token curto, hash, uso unico e rate limit.
- Imagens persistidas continuam acessiveis por URL opaca para suportar `<img>` sem cookies; revisar URLs assinadas ou proxy autenticado antes de armazenar midia mais sensivel.
- A cadeia de compilacao Tailwind 3 ainda tem 7 alertas npm. A atualizacao compativel resolveu os alertas de producao, incluindo os antigos de Router/Nodemailer. Migrar Tailwind 4 em lote proprio, com regressao visual, sem `audit fix --force`.

## Validacoes historicas (2026-08-05, nao reexecutadas integralmente nesta data)

- `python -m compileall backend/app`
- `python -m unittest discover -s backend/tests` (116 testes)
- `pip-audit -r backend/requirements.txt --progress-spinner off` sem vulnerabilidades conhecidas, com `cryptography>=50.0.0,<51.0.0`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd audit --audit-level=moderate`
- `backend/.venv/Scripts/python.exe -m pip check`
- Alembic em PostgreSQL 16: banco vazio, `alembic check`, downgrade/upgrade e adocao de schema compativel preservando dados sentinel.
- Testes diretos em SQLite temporario para cadastro 2FA, bloqueio de token parcial, codigo errado, codigo correto, reutilizacao de codigo, expiracao, limite de tentativas, cooldown de reenvio e verificacao apos troca de e-mail.
