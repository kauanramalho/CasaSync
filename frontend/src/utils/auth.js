export function isTwoFactorRequiredResponse(response) {
  return response?.requires_two_factor === true && typeof response.pending_token === "string" && response.pending_token.length > 0;
}
