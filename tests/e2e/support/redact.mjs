// Command lines of other sessions can carry credentials. Masked here, before anything is logged:
//   - a password in a URL: scheme://user:pass@host (the password may contain / or @;
//     the mask runs up to the last @ of the token)
//   - NAME=value and --name=value where NAME contains KEY, TOKEN, SECRET, PASS, AUTH, COOKIE,
//     CREDENTIAL or DSN (any case). PASS also covers PASSWORD and PASSWD.
//   - --name value, the same name given with a space
//   - sshpass -p value
//   - Authorization: [Scheme ]value (HTTP header)
// A value may be quoted ("a b", 'a b'); the quotes go with it. An unterminated quote
// masks to the end of the line.
const SECRET_NAME = '[\\w-]*(?:KEY|TOKEN|SECRET|PASS|AUTH|COOKIE|CREDENTIAL|DSN)[\\w-]*';
const VALUE = `(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\\s"']+)`;

export const redact = (text) =>
  text
    .replace(/:\/\/[^\s]*@/g, '://***@')
    .replace(new RegExp(`(${SECRET_NAME}=)${VALUE}`, 'gi'), '$1***')
    .replace(new RegExp(`(--${SECRET_NAME}\\s+)${VALUE}`, 'gi'), '$1***')
    .replace(new RegExp(`(\\bsshpass\\s+-p\\s*)${VALUE}`, 'gi'), '$1***')
    .replace(new RegExp(`(Authorization:\\s*(?:(?:Bearer|Basic|Token)\\s+)?)${VALUE}`, 'gi'), '$1***');
