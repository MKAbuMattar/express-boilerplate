/** Contract for finding the template a project is created from. */
export abstract class TemplateService {
  /**
   * A directory holding the template and its feature manifest: `template`
   * when given, else this checkout, else a GitHub download of `ref`.
   */
  abstract resolve(template?: string, ref?: string): Promise<string>;
}
