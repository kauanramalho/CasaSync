# Checklist de Implementacao Segura

Use este checklist antes e depois de qualquer mudanca no CasaSync.

## Antes de alterar codigo

- Ler `AGENTS.md`.
- Ler o arquivo de `docs/codex-skills/` correspondente ao dominio da mudanca.
- Verificar `git status --short` e separar alteracoes do usuario das suas.
- Mapear frontend, backend, rota, service, schema, model e migracao/upgrades envolvidos.
- Confirmar se a mudanca toca autenticacao, familia, permissao, banco, IA, Google, anexos, notificacoes ou dados pessoais.
- Se tocar regra sensivel, planejar validacao backend antes da UX.
- Identificar feature flags e variaveis de ambiente necessarias.
- Preferir mudancas aditivas e reversiveis; nao apagar coluna/tabela/campo sem pedido explicito.

## Durante a implementacao

- Reutilizar services existentes antes de criar logica nova.
- Nao duplicar criacao/edicao de tarefa em componentes.
- Nao aceitar `familyId`, `userId`, categoria ou responsavel sensivel sem validar no backend.
- Nao expor chaves, tokens, refresh tokens, secrets, imagens, prompts ou payloads sensiveis em logs.
- Manter fallback seguro quando integracao externa estiver desativada.
- Preservar compatibilidade com dados antigos: usuario sem username, tarefa sem anexo, tarefa sem lembrete, `assignee_id` legado.
- Manter UI no padrao: `Button`, `Card`, `SelectMenu`, `DateTimePicker`, badges, toasts e responsividade.
- Bloquear duplo clique em acoes que criam ou sincronizam dados.

## Depois de alterar codigo

- Rodar `git diff --check`.
- Rodar checagens relevantes:
  - Frontend: `npm.cmd run build`, `npm.cmd run lint` se existir, `npm.cmd run typecheck` se existir.
  - Backend: testes disponiveis, import/compile check ou rota/service especifico quando houver.
- Fazer busca por segredos em arquivos alterados quando mexer em integracoes.
- Conferir que `.env`, uploads, tokens e credenciais nao foram adicionados ao commit.
- Validar manualmente os fluxos principais afetados.
- Entregar resumo com arquivos alterados, comandos, testes, riscos e proximos passos.

## Testes manuais minimos por dominio

- Auth: cadastro, login por email, login por username quando existir, senha errada, sessao atual.
- Familia/permissoes: usuario sem familia, membro comum, admin/dono, tentativa de acessar dados de outra familia.
- Tarefas: criar, editar, concluir, reabrir, excluir, filtrar/ordenar, dashboard.
- Anexos: upload valido, tipo invalido, arquivo grande, download autorizado, acesso bloqueado, remocao.
- IA por imagem: imagem unica, multiplas imagens, erro por imagem, baixa confianca, edicao, criacao manual, modo automatico se alterado.
- Google Agenda: desativado, conectado, desconectado, tarefa sem horario, tarefa ja sincronizada.
- Lembretes: tarefa proxima, tarefa concluida, rodar processamento duas vezes sem duplicar, marcar notificacao como lida.
- UI: desktop, notebook, mobile, tema claro/escuro quando aplicavel.

## Cuidados de commit

- Stage somente arquivos do escopo atual.
- Nao misturar documentacao com funcionalidades se o pedido for apenas docs.
- Nao commitar arquivos sensiveis, uploads locais, bancos `.db`, caches, `node_modules`, `.venv` ou artefatos de build.
- Se houver alteracoes pre-existentes no worktree, informe que elas ficaram fora do commit quando nao forem do escopo.
