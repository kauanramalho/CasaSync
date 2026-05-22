# AI Task Import UI Pattern

Referencia rapida para proximas alteracoes no fluxo de importacao de tarefas por imagem no CasaSync.

## Fluxo Atual

- A tela de tarefas renderiza `frontend/src/components/ImageTaskImportPanel.jsx`.
- O usuario seleciona uma ou varias imagens, o frontend valida tipo/tamanho/dimensoes e otimiza antes do envio.
- `frontend/src/services/api.js` envia `multipart/form-data` para `POST /api/image-analysis/task-suggestions/jobs` e acompanha o job por polling em `GET /api/image-analysis/task-suggestions/jobs/{jobId}`.
- Para uma imagem, o campo enviado pode ser `file`; para lote, cada arquivo vai em `files`.
- O backend valida familia ativa, cada arquivo e chama `backend/app/services/image_analysis_service.py`.
- `backend/app/services/ai_vision_adapter.py` chama OpenAI Vision por imagem e retorna sugestoes no `ImageAnalysisResponse`.
- O service consolida sugestoes, `imageErrors`, `totalImagesProcessed` e `totalSuggestionsGenerated`.
- A UI mostra todas as sugestoes editaveis em lote; nada e salvo antes do clique final.
- O clique final chama `POST /api/tasks/import-suggestions`, que passa por `backend/app/services/task_import_service.py`.
- A criacao em lote reutiliza o service atual, permite sucesso parcial e retorna criadas/falhas/ignoradas/warnings.
- Se o usuario marcar criacao automatica, o clique em interpretar tambem envia as sugestoes para `POST /api/tasks/import-suggestions` com `autoCreate=true`.
- O backend so cria automaticamente itens seguros: titulo valido, confianca alta, sem warnings da IA, categoria/responsavel validados quando presentes e datas/horarios consistentes.
- Itens inseguros voltam em `pendingReview` e continuam editaveis na UI.

## Instrucoes Personalizadas

- A area de IA permite salvar instrucoes personalizadas por usuario.
- Frontend usa `GET/PUT/DELETE /api/image-analysis/preferences`.
- Backend persiste em `users.ai_task_import_instructions` com limite de 1500 caracteres e rejeicao de segredos obvios.
- As instrucoes entram no prompt como preferencias secundarias; o system prompt e as validacoes do backend continuam prevalecendo.
- Preferencias podem orientar lembretes, categoria, prioridade, descricao e Google Agenda.
- O CasaSync suporta multiplos lembretes por tarefa via `task_reminders`; preserve tambem `reminderEnabled/reminderValue/reminderUnit` como espelho de compatibilidade.
- Se o usuario pedir "15min e 1h", "1h e 1 dia" ou similares, preencher `reminders` com ate 5 avisos sem duplicar antecedencias.

## Google Agenda Em Lote

- A opcao `syncGoogleCalendar` continua no payload de importacao.
- Funciona para criacao manual em lote e criacao automatica.
- O backend cria a tarefa mesmo se o Google Agenda falhar.
- Eventos so sao enviados quando a tarefa tem data e horario confirmados.
- Multiplos lembretes da tarefa devem virar `reminders.overrides` no evento Google.
- Se a tarefa ja tiver `google_calendar_event_id` ou o provider encontrar evento existente, a sync deve ser idempotente.
- Se instrucoes personalizadas pedirem Google Agenda e a sugestao tiver data/horario, `googleCalendarSuggestion` pode marcar a opcao automaticamente, mas o usuario ainda pode desativar.

## Componentes Reutilizaveis

- Datas e horarios: `frontend/src/components/DateTimePicker.jsx`.
- Categoria e prioridade: `frontend/src/components/SelectMenu.jsx`.
- Visual de categoria: `CategoryOptionContent`, `CategoryBadge` e `CategoryGlyph` em `frontend/src/components/Badges.jsx`.
- Responsaveis: `frontend/src/components/AssigneePicker.jsx`.
- Estrutura: `Card`, `Button`, `Avatar`, badges arredondados e `soft-input`.
- Feedback: `useToast`, alertas suaves inline e nunca `alert()`.

## Padrao Visual

- Cards com borda suave, `bg-white/75`, cantos grandes e `shadow-card`.
- Badges pequenos, arredondados, com icone quando fizer sentido.
- Popovers devem usar portal quando houver risco de corte.
- Campos em grids responsivos; no mobile tudo empilha.
- Alertas devem ser suaves: amber para revisao/duvida, rose para erro, emerald para sucesso.
- Previews de varias imagens devem mostrar miniatura, nome, tamanho, remover e status de processamento.
- Sugestoes devem mostrar a imagem de origem quando `sourceImageName` vier do backend.
- Criacao automatica deve mostrar resumo de criadas, pendentes, falhas e eventos de calendario.

## Cuidados

- Nao criar tarefas automaticamente sem acao explicita do usuario.
- Quando o modo automatico estiver ativo, backend deve filtrar itens arriscados e devolver para revisao.
- Nao remover o fluxo manual: editar, selecionar, remover e confirmar continuam obrigatorios quando modo automatico estiver desligado ou houver pendencias.
- Nao expor `OPENAI_API_KEY`, prompts completos, payloads da IA ou conteudo da imagem no frontend/logs.
- Nao permitir que prompt customizado, modo automatico ou UI bypass validem dados sensiveis so no frontend.
- Preservar Google Agenda como opcional e somente no clique final de criar tarefas.
- Se alterar campos editaveis, manter `buildReviewItem`, `buildTaskImportPayload` e validacoes backend alinhados.
- Nao salvar imagem permanentemente neste fluxo de interpretacao.
- Manter limite de 10 imagens por analise e 40 sugestoes revisaveis por resposta.

## Testes Manuais Recomendados

- Fluxo manual com uma imagem e com varias imagens.
- Criacao manual de varias tarefas selecionadas.
- Criacao automatica com alta confianca e baixa confianca pendente.
- Instrucao personalizada para lembrete de 1 hora ou 1 dia antes.
- Instrucao personalizada para Google Agenda quando houver data e horario.
- Google Agenda marcado/desmarcado no lote.
- Responsividade mobile e dropdowns customizados sem select nativo.
