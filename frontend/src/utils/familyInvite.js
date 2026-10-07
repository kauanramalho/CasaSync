export function buildFamilyInvite(family, inviter, origin) {
  return {
    title: `Convite para ${family.name} · CasaSync`,
    text: `${inviter || "Um membro"} convida você para a família ${family.name} no CasaSync! 🏡\nCódigo: ${family.invite_code}\nEntre no app e solicite sua participação.`,
    url: new URL("/familia", origin).href
  };
}

export async function shareFamilyInvite(invite, imageFile, browser = navigator) {
  if (typeof browser.share === "function") {
    const files = imageFile ? [imageFile] : [];
    const withImage = files.length && browser.canShare?.({ files });
    await browser.share(withImage ? { ...invite, files } : invite);
    return "shared";
  }
  if (!browser.clipboard?.writeText) throw new Error("Compartilhamento indisponível. Copie o código do convite manualmente.");
  await browser.clipboard.writeText(`${invite.text}\n${invite.url}`);
  return "copied";
}
