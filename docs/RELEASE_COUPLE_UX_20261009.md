# Espaço do Casal: criação sob demanda

Data: 2026-10-09. Publicação autorizada pelo usuário no CasaSync oficial.

## Escopo e arquivos

- `frontend/src/pages/CoupleSpace.jsx`: três formulários inicialmente recolhidos (Criar meta, Criar date, Criar nota), resumo compacto e listas salvas sempre visíveis.
- `frontend/tests/coupleUsability.test.mjs`: seis verificações de regressão de estrutura, rascunho montado, envio protegido, fechamento/foco, contratos existentes e quebra de textos longos.
- Este relatório de entrega.

O resumo mantém os três contadores lado a lado no celular. Os formulários usam disclosure HTML nativo com teclado e foco visível; o marcador nativo do Safari é ocultado para evitar duplicar a seta. Recolher manualmente preserva os componentes e seus rascunhos. Um salvamento bem-sucedido limpa apenas o formulário correspondente, recolhe-o e devolve o foco ao botão de criação. Uma falha mantém o formulário e o preenchimento. Envio em andamento bloqueia nova submissão pelo mesmo formulário.

Metas, dates e notas existentes continuam abertas, com as ações anteriores preservadas. Textos extensos têm quebra de linha dentro dos cartões. Não houve mudança de API, modelos, migração, autenticação, limites de família, notificações ou infraestrutura paga. Nenhuma tarefa ou informação real foi apagada/criada durante a validação.

## Validações realizadas

Frontend, terminal PowerShell em `frontend`:

```powershell
npm.cmd run lint
node --test tests/*.test.mjs
$env:VITE_API_URL='https://casasync-api.onrender.com/api'
npm.cmd run build
```

Resultado: lint sem erros; 140 testes aprovados, zero falhas; build de produção aprovado.

Backend, terminal PowerShell em `backend`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Resultado: 243 testes aprovados em 24,807 segundos. Aviso existente de depreciação Starlette/httpx, sem falha.

Navegador Chrome com API isolada em SQLite na memória (`python -m tests.ui_fixture`) e frontend local (`VITE_API_URL=http://localhost:8000/api`). Provedores externos desativados:

- criação de meta/date/nota, atualização dos contadores e fechamento após sucesso;
- recolher/reabrir mantendo rascunho;
- abrir/recolher por Enter no summary;
- erro 422 mantém rascunho e formulário aberto, libera os campos após falhar;
- edição de nota e atualização de progresso de meta preservadas;
- listas salvas fora dos disclosures;
- cinco tamanhos, tanto com os formulários abertos quanto recolhidos, sem conteúdo ultrapassando o viewport: 320×568, 390×844, 844×390, 768×1024 e 1366×768;
- resumo medido em 134 px de altura nos dois tamanhos de celular.

Captura visual de QA (dados fictícios): `casal-mobile-390.png`, no diretório de evidências do Codex, fora do Git.

Limitações: testes de viewport no Chrome não substituem testes físicos Android/iOS ou Safari. Upload/crop de imagem e exclusão de itens não foram executados nesta rodada; o componente e os contratos existentes foram preservados e inspecionados. Testes de frontend novos são estáticos, complementados pelos fluxos reais no navegador isolado. Conferência de produção será somente leitura.

## Publicação e reversão

Preservar o projeto Vercel `casa-sync` e o domínio `https://casa-sync.vercel.app`, bem como o serviço Render `CasaSync-api`. Publicar por commit no `main` conectado; confirmar SHA do deploy, Vercel READY/alias de produção e Render live/health. Não criar novos serviços ou custos.

Base anterior: `2b591722654b6c3ad209a88152064e5c23807912`. Em regressão, reverter somente o commit desta entrega (sem reset destrutivo), publicar novamente e conferir o domínio. Como não há migração de dados, não há reversão de schema.
