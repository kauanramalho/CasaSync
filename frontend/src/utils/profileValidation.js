export function validateProfileSubmission(form, passwordForm, currentEmail) {
  const username = form.username.trim().toLowerCase();
  if (username && !/^(?=.*[a-z0-9])[a-z0-9._-]{3,30}$/.test(username)) return "Username deve ter 3 a 30 caracteres e usar apenas letras, numeros, ponto, underline ou hifen.";
  const emailChanged = form.email.trim().toLowerCase() !== String(currentEmail || "").trim().toLowerCase();
  if (emailChanged && !passwordForm.current_password) return "Digite sua senha atual para alterar o e-mail.";
  if (passwordForm.new_password || passwordForm.confirm_password) {
    if (emailChanged) return "Altere o e-mail e a senha separadamente. Primeiro conclua a verificação do novo e-mail.";
    if (passwordForm.new_password !== passwordForm.confirm_password) return "A confirmacao da nova senha nao confere.";
    if (!passwordForm.current_password) return "Digite sua senha atual para alterar a senha.";
    if (passwordForm.new_password.length < 8 || passwordForm.new_password.length > 128 || !/[\p{L}]/u.test(passwordForm.new_password) || !/\d/.test(passwordForm.new_password)) return "A nova senha deve ter de 8 a 128 caracteres, pelo menos uma letra e um numero.";
  }
  return "";
}
