import {CompletionCommand} from '../controller/completion.command.ts';
import {CreateCommand} from '../controller/create.command.ts';
import {DoctorCommand} from '../controller/doctor.command.ts';
import {FeaturesCommand} from '../controller/features.command.ts';
import {GenerateCommand} from '../controller/generate.command.ts';
import {InfoCommand} from '../controller/info.command.ts';
import {ProjectCommand} from '../controller/project.command.ts';
import {TuiCommand} from '../controller/tui.command.ts';
import type {FeatureService} from '../service/feature.service.ts';
import type {GeneratorService} from '../service/generator.service.ts';
import {FeatureServiceImpl} from '../service/impl/feature.service.impl.ts';
import {GeneratorServiceImpl} from '../service/impl/generator.service.impl.ts';
import {InkProgressServiceImpl} from '../service/impl/ink-progress.service.impl.ts';
import {InkPromptServiceImpl} from '../service/impl/ink-prompt.service.impl.ts';
import {PlainProgressServiceImpl} from '../service/impl/plain-progress.service.impl.ts';
import {ProjectServiceImpl} from '../service/impl/project.service.impl.ts';
import {TemplateServiceImpl} from '../service/impl/template.service.impl.ts';
import {WorkspaceServiceImpl} from '../service/impl/workspace.service.impl.ts';
import type {ProgressService} from '../service/progress.service.ts';
import type {ProjectService} from '../service/project.service.ts';
import type {PromptService} from '../service/prompt.service.ts';
import type {TemplateService} from '../service/template.service.ts';
import type {WorkspaceService} from '../service/workspace.service.ts';

/**
 * Composition root: binds each service contract to its implementation.
 * Plain construction, not the DI container: Node runs this package from
 * source with type stripping, which has no decorators.
 */
export class CliConfiguration {
  /** Prompts and live progress need a terminal on both ends; CI gets plain lines. */
  readonly interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  readonly templateService: TemplateService = new TemplateServiceImpl();
  readonly projectService: ProjectService = new ProjectServiceImpl();
  readonly workspaceService: WorkspaceService = new WorkspaceServiceImpl();
  readonly generatorService: GeneratorService = new GeneratorServiceImpl(
    this.workspaceService,
  );
  readonly featureService: FeatureService = new FeatureServiceImpl(
    this.templateService,
    this.projectService,
  );
  readonly promptService: PromptService = new InkPromptServiceImpl();
  readonly progressService: ProgressService = this.interactive
    ? new InkProgressServiceImpl()
    : new PlainProgressServiceImpl();

  readonly create = new CreateCommand(
    this.templateService,
    this.projectService,
    this.promptService,
    this.progressService,
    this.interactive,
  );
  readonly generate = new GenerateCommand(
    this.workspaceService,
    this.generatorService,
    this.promptService,
    this.progressService,
    this.interactive,
  );
  readonly features = new FeaturesCommand(
    this.templateService,
    this.workspaceService,
    this.featureService,
    this.projectService,
    this.progressService,
  );
  readonly info = new InfoCommand(this.workspaceService, this.progressService);
  readonly doctor = new DoctorCommand(
    this.workspaceService,
    this.progressService,
  );
  readonly project = new ProjectCommand(this.workspaceService);
  readonly completion = new CompletionCommand();
  readonly tui = new TuiCommand();
}
