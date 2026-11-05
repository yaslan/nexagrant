// Command lines of other sessions can carry credentials. Masked here, before anything is logged:
//   - a password in a URL: scheme://user:pass@host
//   - NAME=value and --name=value where NAME contains KEY, TOKEN, SECRET or PASSWORD (any case)
//   - --name value, the same name given with a space
// A value may be quoted ("a b", 'a b'); the quotes go with it.
const SECRET_NAME = '[\\w-]*(?:KEY|TOKEN|SECRET|PASSWORD)[\\w-]*';
const VALUE = `(?:"[^"]*"|'[^']*'|\\S+)`;

export const redact = (text) =>
  text
    .replace(/:\/\/[^\s/@]+@/g, '://***@')
    .replace(new RegExp(`(${SECRET_NAME}=)${VALUE}`, 'gi'), '$1***')
    .replace(new RegExp(`(--${SECRET_NAME}\\s+)${VALUE}`, 'gi'), '$1***');
