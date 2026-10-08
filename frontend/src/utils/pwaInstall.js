export function getInstallPlatform({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

export function isStandalone({ navigator: nav = {}, matchMedia } = {}) {
  return nav.standalone === true || Boolean(matchMedia?.("(display-mode: standalone)").matches || matchMedia?.("(display-mode: fullscreen)").matches);
}

export function getInstallGuide(platform) {
  if (platform === "ios") return {
    title: "Instalar no iPhone ou iPad",
    steps: [
      "Abra o CasaSync no Safari. Se abriu pelo WhatsApp, Instagram ou outro app, abra o mesmo endereço no Safari.",
      "Toque em Compartilhar: o quadrado com uma seta para cima. Dependendo do layout, ele fica dentro do menu do Safari.",
      "Role as opções e escolha Adicionar à Tela de Início.",
      "Se aparecer Abrir como App da Web, deixe essa opção ativada. Depois toque em Adicionar.",
      "Abra o CasaSync pelo novo ícone na Tela de Início. Entre uma vez e marque Manter sessão aberta.",
    ],
    help: "Não encontrou Adicionar à Tela de Início? No menu de compartilhamento, role até Editar Ações e adicione essa opção. Se estiver em navegação privada, abra uma aba normal.",
    note: "O app e o Safari podem ter sessões separadas. Se o ícone antigo estiver branco, selecione o tema no Safari e adicione o CasaSync novamente à Tela de Início. Remova apenas o atalho antigo, nunca sua conta. Faça o primeiro login pelo novo ícone.",
  };
  if (platform === "android") return {
    title: "Instalar no Android",
    steps: [
      "Abra o CasaSync no Chrome ou no navegador do seu dispositivo.",
      "No menu ⋮ do navegador, escolha Instalar aplicativo ou Adicionar à tela inicial.",
      "Confirme a instalação e abra o CasaSync pelo novo ícone.",
      "Ao entrar, marque Manter sessão aberta para continuar conectado neste dispositivo.",
    ],
    help: "Se o navegador não oferecer a instalação, use o Chrome em uma aba normal e tente novamente.",
    note: "Você pode continuar usando o CasaSync pelo navegador enquanto isso.",
  };
  return {
    title: "Usar o CasaSync como aplicativo",
    steps: [
      "Abra o CasaSync no Chrome, Edge ou Safari.",
      "Procure Instalar aplicativo no menu ou na barra de endereço. No Safari do Mac, use Arquivo → Adicionar ao Dock.",
      "Abra pelo ícone criado e marque Manter sessão aberta ao entrar.",
    ],
    help: "A opção e o nome do comando dependem do navegador. Você também pode consultar abaixo o passo a passo para celular.",
    note: "O CasaSync continua disponível normalmente pelo navegador.",
  };
}

export async function promptNativeInstall(event) {
  if (!event || typeof event.prompt !== "function") return "unavailable";
  await event.prompt();
  return (await event.userChoice)?.outcome === "accepted" ? "accepted" : "dismissed";
}
