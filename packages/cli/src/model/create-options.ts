import type {FeatureManifest} from './feature-manifest.ts';

/** What `create` reads from flags or a --config file. */
export type CreateConfig = {
  name?: string;
  preset?: string;
  features?: string[];
  install?: boolean;
};

/** Everything ProjectService needs to write one project. */
export type CreateOptions = {
  source: string;
  target: string;
  /** npm-safe name: package scope and local domain (<name>.len). */
  name: string;
  enabled: Set<string>;
  manifest: FeatureManifest;
};
