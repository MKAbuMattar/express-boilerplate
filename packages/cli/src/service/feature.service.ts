/** What turning features on or off does to one file of the project. */
export type FeatureFileChange = {
  path: string;
  action: 'create' | 'delete' | 'merge' | 'keep';
};

/** Outcome of turning features on or off in an existing project. */
export type FeatureChange = {
  added: string[];
  removed: string[];
  files: FeatureFileChange[];
  /** Files left with <<<<<<< markers where your edits and the feature meet. */
  conflicts: string[];
};

/** Contract for changing the features of a project after `create`. */
export abstract class FeatureService {
  abstract change(
    root: string,
    add: string[],
    remove: string[],
    options: {dryRun: boolean; template?: string; ref?: string},
  ): Promise<FeatureChange>;
}
