import {ProgressService, type Task} from '../progress.service.ts';

/** For CI logs and pipes: one line per step, no cursor movement. */
export class PlainProgressServiceImpl extends ProgressService {
  async run(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      console.log(`- ${task.title}`);
      await task.run();
    }
  }

  summary(title: string, lines: string[]): void {
    console.log(`\n${title}\n${lines.map((l) => `  ${l}`).join('\n')}`);
  }
}
