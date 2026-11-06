import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {CliConstants} from '../constant/cli.constants.ts';

export type Feature = {
  id: string;
  title: string;
  group: string;
  /** Selected when the user picks "custom" and accepts the defaults. */
  default?: boolean;
  /** Features this one cannot work without; selected with it. */
  requires?: string[];
  /** Files and folders deleted when the feature is off. */
  remove?: string[];
  /** package.json (by folder) to dependency names dropped when off. */
  dependencies?: Record<string, string[]>;
};

type ManifestFile = {
  features: Feature[];
  presets: Record<string, string[] | '*'>;
};

/**
 * boilerplate.features.json at the template root: every optional feature,
 * what removing it deletes, and the presets. Code shared with other
 * features is cut by `@feature:<id>` markers instead (see MarkerStripper).
 */
export class FeatureManifest {
  readonly features: Feature[];
  readonly presets: Record<string, string[] | '*'>;

  constructor(file: ManifestFile) {
    this.features = file.features;
    this.presets = file.presets;
  }

  static exists(root: string): boolean {
    return existsSync(join(root, CliConstants.MANIFEST_FILE));
  }

  static load(root: string): FeatureManifest {
    const file = JSON.parse(
      readFileSync(join(root, CliConstants.MANIFEST_FILE), 'utf8'),
    ) as ManifestFile;
    return new FeatureManifest(file);
  }

  /** The features a person picks from; internal ones come with others. */
  choices(
    keep: (feature: Feature) => boolean = () => true,
  ): {value: string; label: string}[] {
    return this.features
      .filter((f) => f.group !== 'internal' && keep(f))
      .map((f) => ({value: f.id, label: `${f.group.padEnd(9)} ${f.title}`}));
  }

  get(id: string): Feature {
    const feature = this.features.find((f) => f.id === id);
    if (!feature) {
      const known = this.features.map((f) => f.id).join(', ');
      throw new Error(`Unknown feature "${id}". Known: ${known}`);
    }
    return feature;
  }

  preset(name: string): string[] {
    const preset = this.presets[name];
    if (preset === undefined) {
      const known = Object.keys(this.presets).join(', ');
      throw new Error(`Unknown preset "${name}". Known: ${known}`);
    }
    return preset === '*' ? this.features.map((f) => f.id) : preset;
  }

  defaults(): string[] {
    return this.features.filter((f) => f.default).map((f) => f.id);
  }

  /** The selection plus everything it requires, transitively. */
  resolve(selection: Iterable<string>): Set<string> {
    const enabled = new Set<string>();
    const visit = (id: string) => {
      if (enabled.has(id)) return;
      enabled.add(id);
      for (const required of this.get(id).requires ?? []) visit(required);
    };
    for (const id of selection) visit(id);
    return enabled;
  }

  disabled(enabled: Set<string>): Feature[] {
    return this.features.filter((f) => !enabled.has(f.id));
  }
}
