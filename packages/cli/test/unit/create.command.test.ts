import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {CreateCommand} from '../../src/controller/create.command.ts';
import {PlainProgressServiceImpl} from '../../src/service/impl/plain-progress.service.impl.ts';
import {ProjectServiceImpl} from '../../src/service/impl/project.service.impl.ts';
import {type Choice, PromptService} from '../../src/service/prompt.service.ts';
import {TemplateService} from '../../src/service/template.service.ts';

/** A template with one optional feature. */
class FakeTemplate extends TemplateService {
  readonly dir = mkdtempSync(join(tmpdir(), 'eb-tpl-'));

  constructor() {
    super();
    mkdirSync(join(this.dir, 'src'));
    writeFileSync(
      join(this.dir, 'package.json'),
      '{"name":"express-boilerplate"}',
    );
    writeFileSync(join(this.dir, 'src/redis.ts'), 'export class Redis {}\n');
    writeFileSync(
      join(this.dir, 'boilerplate.features.json'),
      JSON.stringify({
        features: [
          {
            id: 'redis',
            title: 'Redis',
            group: 'data',
            default: true,
            remove: ['src/redis.ts'],
          },
        ],
        presets: {minimal: [], standard: ['redis'], full: '*'},
      }),
    );
  }

  async resolve(): Promise<string> {
    return this.dir;
  }
}

/** Answers from a script, in order. */
class ScriptedPrompts extends PromptService {
  readonly answers: unknown[];
  constructor(...answers: unknown[]) {
    super();
    this.answers = answers;
  }
  async text(): Promise<string> {
    return this.answers.shift() as string;
  }
  async select(_q: string, _c: Choice[]): Promise<string> {
    return this.answers.shift() as string;
  }
  async multiSelect(): Promise<string[]> {
    return this.answers.shift() as string[];
  }
  async confirm(): Promise<boolean> {
    return this.answers.shift() as boolean;
  }
}

describe('CreateCommand', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const out = () => join(mkdtempSync(join(tmpdir(), 'eb-new-')), 'shop');
  const command = (prompts: PromptService, interactive: boolean) =>
    new CreateCommand(
      new FakeTemplate(),
      new ProjectServiceImpl(),
      prompts,
      new PlainProgressServiceImpl(),
      interactive,
    );

  it('asks for what the flags leave out', async () => {
    const target = out();
    await command(new ScriptedPrompts(target, 'custom', [], false), true).run(
      undefined,
      {},
    );
    expect(
      JSON.parse(readFileSync(join(target, 'boilerplate.json'), 'utf8')),
    ).toEqual({name: 'shop', features: []});
    expect(existsSync(join(target, 'src/redis.ts'))).toBe(false);
  });

  it('never prompts without a terminal and uses the standard preset', async () => {
    const target = out();
    await command(new ScriptedPrompts(), false).run(target, {install: false});
    expect(existsSync(join(target, 'src/redis.ts'))).toBe(true);
  });

  it('writes nothing on a dry run', async () => {
    const target = out();
    await command(new ScriptedPrompts(), false).run(target, {
      preset: 'minimal',
      dryRun: true,
    });
    expect(existsSync(target)).toBe(false);
  });
});
