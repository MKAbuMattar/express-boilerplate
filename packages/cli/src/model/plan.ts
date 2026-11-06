/** Text that replaces a RegExp match, or a line added after the imports. */
export type Replacer =
  | string
  | ((match: string, ...groups: string[]) => string);

/**
 * 'import' adds the line after the last import; 'named' merges names into
 * the import from a module (`module|A,B`), adding it when missing; a RegExp
 * replaces its match.
 */
export type Change = ['import' | 'named' | RegExp, Replacer];

export type PlannedFile =
  | {kind: 'create'; path: string; content: string}
  | {kind: 'edit'; path: string; changes: Change[]};

/**
 * Everything a generator will write, decided before anything is written:
 * `--dry-run` prints it, and a real run applies it only when every edit
 * finds its anchor.
 */
export class Plan {
  readonly files: PlannedFile[] = [];
  /** Lines shown after the run, such as the routes or the next step. */
  readonly notes: string[] = [];

  create(path: string, content: string): this {
    this.files.push({kind: 'create', path, content});
    return this;
  }

  edit(path: string, ...changes: Change[]): this {
    const existing = this.files.find(
      (f): f is Extract<PlannedFile, {kind: 'edit'}> =>
        f.kind === 'edit' && f.path === path,
    );
    if (existing) existing.changes.push(...changes);
    else this.files.push({kind: 'edit', path, changes});
    return this;
  }

  note(line: string): this {
    this.notes.push(line);
    return this;
  }
}

/** One file as written (or as it would be, on a dry run). */
export type AppliedFile = {
  kind: 'create' | 'edit' | 'overwrite';
  path: string;
  /** Lines the run adds, for the dry-run preview. */
  added: string[];
};
