# CasaSync — Família, Tarefas, Calendário e IA compactos

Data: 2026-10-09. Publicação no app oficial autorizada pelo usuário após os testes.

## Alterações

- Família: configurações abertas somente ao tocar no cartão da família, em diálogo com foco controlado, fechamento por Escape e limite de altura. Trocar a família continua usando o fluxo existente. Membros comuns veem os detalhes sem edição; líder/administradores conservam suas ações, com exclusão somente para o líder e confirmação existente.
- Tarefas: linhas menores com título, prazo, estado, categoria e avatares dos responsáveis. Autor, prioridade, lembretes completos e demais informações permanecem nos detalhes. Concluir, reabrir, editar e excluir continuam disponíveis nas superfícies existentes.
- Calendário: grade mensal de sete colunas também no telefone, sem rolagem horizontal. Dois eventos por célula no mobile, três nas telas maiores e contador para abrir o dia completo. Eventos abrem os detalhes diretamente. Filtros e próximos compromissos inicialmente recolhidos; calendário usa a largura disponível. Semana, lista, fuso horário e início da semana preservados.
- Criação com IA: área de imagem e contexto menores, exemplo curto e remoção da descrição do modelo e instruções repetidas. Limites de arquivo/contexto, mensagens de indisponibilidade, Google Agenda opcional e revisão humana antes da importação preservados.

## Arquivos

- `frontend/src/pages/Family.jsx`
- `frontend/src/components/TaskList.jsx`
- `frontend/src/pages/Calendar.jsx`
- `frontend/src/components/MonthCalendarGrid.jsx` (novo componente compartilhado)
- `frontend/src/components/ImageTaskImportPanel.jsx`
- `frontend/tests/minimalUiRendering.test.mjs` (sete testes adicionais)
- `backend/tests/ui_fixture.py` (eventos fictícios para testar dias com vários compromissos)
- Este relatório.

Nenhuma alteração de API de produção, autenticação, banco de dados, regras de autorização, chaves, planos pagos ou configuração dos provedores.

## Validação executada

Terminal PowerShell na raiz do repositório, salvo indicação contrária:

```powershell
# Em frontend:
npm.cmd run lint
node --test tests/*.test.mjs
$env:VITE_API_URL='https://casasync-api.onrender.com/api'; npm.cmd run build

# Em backend:
.\.venv\Scripts\python.exe -m unittest discover -s tests -v

# Na raiz:
git diff --check
```

- Lint e build de produção aprovados. O build recusou corretamente uma primeira tentativa com URL local herdada; foi reexecutado com a URL pública explícita.
- Frontend: 158 testes aprovados, zero falhas. Inclui renderização real dos componentes, limites de mês, ano bissexto, início de semana, eventos ocultos, linhas compactas e preservação dos controles.
- Backend: 243 testes aprovados, zero falhas.
- Navegador Chrome com backend local isolado, SQLite em memória e dados fictícios: 20 combinações de tela/viewport (Famílias, Tarefas, Calendário, Nova tarefa × 320×568, 390×844, 844×390, 768×1024, 1366×768), sem overflow horizontal do documento. Conferidos temas claro e escuro.
- Fluxos: abrir/salvar/reabrir editor da família, descartar rascunho, trocar para família sem permissão de edição, abrir detalhes da tarefa, cancelar confirmação de exclusão, concluir/reabrir tarefa fictícia, abrir dia com múltiplos eventos, abrir evento diretamente, filtros/limpeza, navegação de mês, semana/lista e contexto da IA.
- Nenhuma tarefa ou família real foi apagada ou alterada na validação.

## Publicação e reversibilidade

- Usar o Git integrado aos projetos existentes: Vercel `casa-sync` / `https://casa-sync.vercel.app` e Render `CasaSync-api` / `https://casasync-api.onrender.com`.
- Conferir o mesmo novo SHA em Vercel READY/produção e Render live, além do HTML/ativos do domínio oficial, `/health/ready` e navegação somente leitura das quatro telas.
- Não considerar publicação concluída apenas por commit ou push: os estados e o smoke test de produção são gates separados.
- Base anterior validada: `4bdfdc28639b1f74336411d5e7f03a57c8a36c8b`. Em caso de regressão, reverter apenas este commit e publicar pelo fluxo normal; não usar reset destrutivo nem force-push.

## Limitações e próximo passo

- Viewports no Chrome não substituem testes físicos em Android ou iOS/Safari. Não havia iPhone disponível para esta validação.
- Não foi feita nova chamada real de análise/upload de imagem: a mudança de IA é de apresentação, e o teste visual de upload havia sido dispensado pelo usuário. O fluxo real do provedor não foi certificado novamente por este pacote.
- Alguns chips do calendário são deliberadamente densos; tocar na célula ou no contador também abre a lista completa do dia.
- Após o deploy verificado, atualizar/reabrir o app e conferir em aparelhos reais a grade mensal, os detalhes da família e o tamanho das tarefas.
