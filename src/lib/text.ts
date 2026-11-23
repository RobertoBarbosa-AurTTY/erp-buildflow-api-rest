// Text and document (CPF/CNPJ) helpers.

/** Lowercase, trimmed, without accents: used for case/accent-insensitive search. */
export function normalize(value: string | undefined | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function onlyDigits(value: string | undefined | null) {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

/** Empty is valid (the document is optional). */
export function documentError(value: string | undefined | null): string | null {
  const digits = onlyDigits(value);
  if (!digits) return null;
  if (digits.length === 11) return isValidCpf(digits) ? null : "CPF inválido";
  if (digits.length === 14) return isValidCnpj(digits) ? null : "CNPJ inválido";
  return "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)";
}

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR");
