const CALLBACK_KEYS = ["googleCalendar", "message", "googleCode", "googleState"];

export function consumeGoogleCalendarCallback(searchParams, hash = "") {
  const fragmentParams = new URLSearchParams(hash.replace(/^#/, ""));
  const callbackParams = fragmentParams.has("googleCalendar") ? fragmentParams : searchParams;
  const status = callbackParams.get("googleCalendar");
  if (!status) return null;
  const cleanedParams = new URLSearchParams(searchParams);
  CALLBACK_KEYS.forEach((key) => cleanedParams.delete(key));
  const code = callbackParams.get("googleCode");
  const state = callbackParams.get("googleState");
  const canComplete = Boolean(status === "authorize" && code && state && code.length <= 4096 && state.length <= 4096);
  const messages = {
    connected: "Google Agenda conectado com sucesso.",
    denied: "Autorizacao Google cancelada ou negada.",
    disabled: "Google Agenda esta desativado neste ambiente.",
    authorize: "Confirmando sua conexao com o Google Agenda."
  };
  return {
    status,
    cleanedParams,
    payload: canComplete ? { code, state } : null,
    message: (status !== "authorize" || canComplete) && messages[status]
      ? messages[status] : "Nao foi possivel concluir a conexao. Inicie novamente pelas configuracoes."
  };
}
