/**
 * Cuts feature blocks out of any text file. A block is the lines between a
 * comment line holding `@feature:<id>` and one holding `@end:<id>`, in any
 * comment syntax (`//`, `#`, `<!-- -->`, `/* *\/`). `@feature:!<id>` marks a
 * block kept only when the feature is OFF (a fallback). The template has
 * every feature on, so a fallback that would clash with the feature's code
 * is written commented out with `//~` or `#~`; those prefixes are removed
 * when the fallback is kept. Marker lines never reach the output.
 */
export class MarkerStripper {
  private static readonly START = /@feature:(!?)([a-z0-9-]+)/;
  private static readonly END = /@end:(!?)([a-z0-9-]+)/;
  private static readonly COMMENT = /^\s*(\/\/|#|<!--|\/\*|\{\/\*)/;
  private static readonly DORMANT = /^(\s*)(?:\/\/|#)~ ?/;

  /** True when the text holds at least one marker. */
  static hasMarkers(text: string): boolean {
    return text.includes('@feature:');
  }

  static strip(text: string, enabled: ReadonlySet<string>): string {
    const out: string[] = [];
    const open: {id: string; keep: boolean; fallback: boolean}[] = [];
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
      if (MarkerStripper.COMMENT.test(line)) {
        const start = MarkerStripper.START.exec(line);
        if (start) {
          const [, negate, id] = start as unknown as [string, string, string];
          const on = enabled.has(id);
          const fallback = negate === '!';
          open.push({id, keep: fallback ? !on : on, fallback});
          continue;
        }
        const end = MarkerStripper.END.exec(line);
        if (end) {
          const id = end[2];
          const top = open.pop();
          if (top?.id !== id) {
            throw new Error(
              `line ${index + 1}: @end:${id} closes ${top ? `@feature:${top.id}` : 'nothing'}`,
            );
          }
          continue;
        }
      }
      if (!open.every((block) => block.keep)) continue;
      out.push(
        open.some((block) => block.fallback)
          ? line.replace(MarkerStripper.DORMANT, '$1')
          : line,
      );
    }
    if (open.length > 0) {
      throw new Error(`@feature:${open.at(-1)?.id} is never closed`);
    }
    return out.join('\n');
  }
}
