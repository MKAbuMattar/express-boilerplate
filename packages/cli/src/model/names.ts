/** Every spelling a resource name needs, from one kebab-case singular. */
export class Names {
  readonly kebab: string;
  readonly pascal: string;
  readonly camel: string;
  readonly plural: string;
  readonly pluralPascal: string;
  readonly table: string;
  readonly constant: string;
  /** SEND_REPORT for send-report: queue names and other singular ids. */
  readonly singularConstant: string;

  constructor(raw: string) {
    const kebab = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!/^[a-z][a-z0-9-]*$/.test(kebab)) {
      throw new Error(`"${raw}" is not a usable resource name`);
    }
    const words = kebab.split('-');
    const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
    const last = words.at(-1)!;
    const pluralLast = /(s|x|z|ch|sh)$/.test(last)
      ? `${last}es`
      : /[^aeiou]y$/.test(last)
        ? `${last.slice(0, -1)}ies`
        : `${last}s`;
    const pluralWords = [...words.slice(0, -1), pluralLast];
    this.kebab = kebab;
    this.pascal = words.map(cap).join('');
    this.camel = words[0]! + words.slice(1).map(cap).join('');
    this.plural = pluralWords.join('-');
    this.pluralPascal = pluralWords.map(cap).join('');
    this.table = pluralWords.join('_');
    this.constant = pluralWords.join('_').toUpperCase();
    this.singularConstant = words.join('_').toUpperCase();
  }
}
