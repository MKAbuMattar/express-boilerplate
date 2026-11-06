import {basename} from 'node:path';

/** How the CLI was started, which decides whether a bare word means create. */
export class Invocation {
  /**
   * `create-expresso my-api` has no command word. npx keeps the bin
   * name in argv[1]; pnpm (dlx, create) and Windows shims run the bundle's
   * own path instead, dist/main.js, which is only ever the published package.
   * So both mean "create" when the first word is not a command. From a
   * checkout (`pnpm eb`, src/main.ts) an unknown word stays an error.
   */
  static isBareCreate(
    script: string,
    first: string | undefined,
    commands: readonly string[],
  ): boolean {
    if (first !== undefined && commands.includes(first)) return false;
    const name = basename(script);
    return (
      name.startsWith('create') || (name === 'main.js' && first !== undefined)
    );
  }
}
