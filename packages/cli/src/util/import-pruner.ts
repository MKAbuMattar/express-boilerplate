/**
 * Drops import names a TypeScript file no longer uses after a feature block
 * was cut, and whole import statements left empty. Imports are not wrapped
 * in markers because the formatter sorts them and would split a block.
 * Side-effect imports (`import 'x'`) are always kept.
 */
export class ImportPruner {
  private static readonly IMPORT =
    /^import\s+(type\s+)?([^'";]*?)\s*from\s*(['"][^'"]+['"]);?[ \t]*\n/gm;

  static prune(source: string): string {
    const body = source.replace(ImportPruner.IMPORT, '');
    const used = (name: string) =>
      // Not a property (`a.name`), but a spread (`...name`) counts as a use.
      new RegExp(
        `(?<![\\w$])(?<![^.]\\.)${name.replace(/\$/g, '\\$')}(?![\\w$])`,
      ).test(body);
    return source.replace(
      ImportPruner.IMPORT,
      (statement, typeOnly: string | undefined, clause: string, from) => {
        const {kept, dropped} = ImportPruner.keep(clause, used);
        if (!dropped) return statement;
        if (kept === '') return '';
        return `import ${typeOnly ?? ''}${kept} from ${from};\n`;
      },
    );
  }

  private static keep(
    clause: string,
    used: (name: string) => boolean,
  ): {kept: string; dropped: boolean} {
    const braces = clause.indexOf('{');
    const defaultName = (braces === -1 ? clause : clause.slice(0, braces))
      .replace(/,\s*$/, '')
      .trim();
    const parts: string[] = [];
    let dropped = false;
    if (defaultName) {
      if (used(defaultName)) parts.push(defaultName);
      else dropped = true;
    }
    if (braces !== -1) {
      const names = clause
        .slice(braces + 1, clause.lastIndexOf('}'))
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      // `type A as B` binds B.
      const local = (name: string) =>
        name
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
          .at(-1) ?? name;
      const kept = names.filter((name) => used(local(name)));
      if (kept.length < names.length) dropped = true;
      if (kept.length > 0) parts.push(`{${kept.join(', ')}}`);
    }
    return {kept: parts.join(', '), dropped};
  }
}
