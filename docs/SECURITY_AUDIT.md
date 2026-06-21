# Auditoria de Seguranca CasaSync

Atualizada em: 2026-06-20

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
- Codigos 2FA nao sao registrados em logs; o fluxo completo exige SMTP configurado.
- Cadastro novo e desfeito quando a entrega inicial do codigo 2FA falha.
- CORS de previews nao e habilitado por regex implicitamente.

## Variaveis de ambiente criticas

- `JWT_SECRET_KEY`: obrigatoria e forte em producao.
- `TWO_FACTOR_HMAC_SECRET`: obrigatorio em producao, forte e separado do JWT.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, `EMAIL_FROM`: necessarias para envio real.
- `EMAIL_DEV_MODE=false`: obrigatorio em producao. O CasaSync nunca registra codigo 2FA em logs.
- `INTEGRATION_TOKEN_ENCRYPTION_KEY`: obrigatoria, forte e separada quando Google Agenda estiver ativo em producao.
- `ENVIRONMENT=production` para habilitar HSTS/CSP e evitar comportamento de desenvolvimento.

## Riscos remanescentes antes do beta

- Migracoes Alembic ainda devem substituir `create_all`/upgrades aditivos antes de producao.
- O rate limit continua em memoria e por instancia; para escala horizontal, migrar para Redis ou gateway/API WAF.
- Tokens continuam em `localStorage`; para maior hardening futuro, considerar cookie HttpOnly/Secure/SameSite com CSRF.
- Recuperacao de senha nao existe no codigo atual; quando adicionada, aplicar token curto, hash, uso unico e rate limit.
- Imagens persistidas continuam acessiveis por URL opaca para suportar `<img>` sem cookies; revisar URLs assinadas ou proxy autenticado antes de armazenar midia mais sensivel.
- Auditoria de vulnerabilidades Python ficou limitada a `pip check`; adicionar `pip-audit`/SCA no CI.

## Validacoes executadas

- `python -m compileall backend/app`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd audit --audit-level=moderate`
- `backend/venv/Scripts/python.exe -m pip check`
- Testes diretos em SQLite temporario para cadastro 2FA, bloqueio de token parcial, codigo errado, codigo correto, reutilizacao de codigo, expiracao, limite de tentativas, cooldown de reenvio e verificacao apos troca de e-mail.
