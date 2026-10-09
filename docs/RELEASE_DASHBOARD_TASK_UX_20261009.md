# CasaSync — Dashboard e Tarefas mais compactos (09/10/2026)

## Escopo e arquivos

Publicação no aplicativo oficial autorizada pelo usuário após os testes. Continuação do redesign do Espaço do Casal, sem mudanças de autenticação, banco, permissões, notificações ou integração externa.

- `frontend/src/pages/Dashboard.jsx`: cartões menores e clicáveis; atrasadas, tarefas com prazo e recentes recolhem automaticamente quando vazios. Gráfico, categorias, casal e resumo por membro abrem sob demanda. Lista recente usa a largura disponível no desktop; estado de carregamento também ficou compacto.
- `frontend/src/pages/Tasks.jsx`: cartões filtram por status; busca sincronizada com o endereço; filtros extras recolhidos; histórico concluído abre sob demanda ou ao selecionar Concluídas. Filtros ativos continuam identificáveis quando recolhidos.
- `frontend/src/components/CollapsibleSection.jsx`: controle compartilhado com botão nativo, `aria-expanded`, identificadores únicos e conteúdo preservado ao recolher. O gráfico é montado somente quando aberto.
- `frontend/src/components/Card.jsx` e `StatCard.jsx`: suporte aditivo a links/botões, foco e estado selecionado. Cartões de outras telas preservam dimensões e comportamento padrão.
- `frontend/src/utils/taskStatusFilters.js`: normalização segura do status e destinos dos cartões, sem alterar tarefas.
- `frontend/tests/dashboardTaskUsability.test.mjs`: 11 testes novos de semântica dos filtros e regressão estrutural/acessível.
- `backend/tests/ui_fixture.py`: apenas massa de teste isolada, com cinco tarefas de estados diferentes e uma segunda família vazia. Não participa do runtime de produção.

Pendentes inclui `pendente` e `em_andamento`, mas não `atrasada`, igual ao contador existente. Atrasadas tem seu próprio cartão. Pontos do mês abre o Ranking mensal.

## Validação local

PowerShell em `frontend`:

```powershell
npm.cmd run lint
node --test tests/*.test.mjs
$env:VITE_API_URL='https://casasync-api.onrender.com/api'
npm.cmd run build
```

Resultado: lint aprovado; 151 testes aprovados, zero falhas; build aprovado em 6,67 s. Testes novos combinam lógica pura com verificações estáticas do JSX; não substituem a validação de interação abaixo.

PowerShell em `backend`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Resultado: 243 testes aprovados em 25,275 s. Tentativa inicial com pytest não executou testes, pois o pacote não está instalado; foi utilizado o runner unittest existente, sem instalar dependências.

## Navegador isolado

Chrome com API SQLite em memória (`python -m tests.ui_fixture`), frontend local e provedores externos desativados. Nenhuma tarefa real foi apagada ou alterada.

- Quatro cartões do Dashboard: Concluídas → lista concluída; Pendentes → três tarefas, incluindo uma em andamento; Atrasadas → somente uma atrasada; Pontos → Ranking mensal.
- Cartões de Tarefas, busca combinada, limpar filtros e botão Voltar: resultado e endereço coerentes.
- Categoria Casa → duas tarefas; responsável QA Local → cinco tarefas. Filtros extras podem recolher sem esconder a indicação dos filtros ativos.
- Histórico de concluídas inicialmente fechado em Todas; aberto automaticamente ao selecionar Concluídas.
- Família vazia: três seções de tarefas recolhidas, com cabeçalhos de 56 px. Abrir/recolher com Enter aprovado. Lista concluída vazia também recolhida.
- Detalhes mantêm Editar e Excluir; confirmação de exclusão aberta e cancelada, sem excluir nem mesmo a tarefa fictícia.
- Concluir e reabrir tarefa fictícia atualizou contadores e listas corretamente.
- Ordenação móvel preservada ao recolher e reabrir a lista; gráfico carregado ao expandir.
- Tarefas e Dashboard expandido conferidos em 320×568, 390×844, 844×390, 768×1024 e 1366×768. `scrollWidth` igual à largura útil em cada tamanho; nenhum controle inspecionado escapou horizontalmente.
- Temas GPT Escuro e Azul Profissional conferidos no telefone e desktop; menu de filtro móvel dentro da tela. Nenhum erro/aviso capturado no console durante essa rodada.

Evidências visuais ficam fora do Git em `.codex/visualizations`, com dados fictícios, não fotos pessoais.

## Publicação e reversão

Manter os projetos e variáveis atuais. Publicar por Git em `main`, pelo fluxo já configurado, depois de `git diff --check` e revisão dos arquivos staged.

- Frontend: projeto Vercel `casa-sync`, ID `prj_p9xgSTuT6HMIgx8pWdrrD9g2m9qi`; domínio `https://casa-sync.vercel.app`.
- API: serviço Render `CasaSync-api`, ID `srv-d809qe8sfn5c739bkjv0`, `rootDir=backend`; health `https://casasync-api.onrender.com/health/ready`.
- Aceitação após envio: frontend READY para o SHA publicado, domínio oficial servindo o novo bundle, API pronta e conferência visual somente leitura. A alteração da fixture pode disparar o auto-deploy do Render; o código de runtime não mudou.
- Reversão: snapshot anterior frontend `f6bc457dcd27ede089036b67ae107210e5930cce`, deployment Vercel `dpl_86oaHQ7MgKsukgaJUhK8DKmXn5nU`. Backend anterior live `2b591722654b6c3ad209a88152064e5c23807912`, deploy `dep-db4g58psrm7s738mi6gg`. Não usar reset destrutivo; promover o deployment anterior ou reverter somente o commit desta entrega, após aprovação.

## Riscos, limitações e próximo passo

Não houve migração, troca de chave, pacote novo ou mudança de planos. Os filtros e recolhimento são somente apresentação; ações existentes usam os mesmos serviços e checagens de família. A escolha manual de abrir/recolher vale durante a permanência naquela seção e é reiniciada ao navegar ou trocar filtro/família.

Viewports do Chrome não são testes físicos Android/iOS/Safari. Upload, Google Agenda, entrega de push, recuperação de senha e exclusão definitiva não foram retestados nesta entrega. Monitoramento contínuo e varredura de logs históricos estão fora do escopo; a conferência de publicação é pontual. Próximo passo de aceitação: usar a atualização no telefone real e comunicar qualquer diferença de navegador/sistema.
