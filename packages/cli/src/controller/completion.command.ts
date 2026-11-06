import {CliConstants} from '../constant/cli.constants.ts';

/** `eb completion bash|zsh`: source the output from your shell rc file. */
export class CompletionCommand {
  static readonly COMMANDS = [
    'create',
    'generate',
    'g',
    'add',
    'remove',
    'features',
    'info',
    'doctor',
    'routes',
    'migrate',
    'completion',
    'tui',
  ];

  run(shell: string | undefined): void {
    const commands = CompletionCommand.COMMANDS.join(' ');
    const kinds = Object.keys(CliConstants.GENERATORS).join(' ');
    if (shell === 'bash') {
      console.log(`_eb() {
  local cur=\${COMP_WORDS[COMP_CWORD]} prev=\${COMP_WORDS[1]}
  if [ "$COMP_CWORD" -eq 1 ]; then COMPREPLY=($(compgen -W "${commands}" -- "$cur"))
  elif [ "$COMP_CWORD" -eq 2 ] && { [ "$prev" = generate ] || [ "$prev" = g ]; }; then
    COMPREPLY=($(compgen -W "${kinds}" -- "$cur"))
  elif [ "$prev" = migrate ]; then COMPREPLY=($(compgen -W "run revert show" -- "$cur"))
  fi
}
complete -F _eb eb`);
      return;
    }
    if (shell === 'zsh') {
      console.log(`#compdef eb
_eb() {
  if (( CURRENT == 2 )); then compadd ${commands}
  elif (( CURRENT == 3 )) && [[ $words[2] == (generate|g) ]]; then compadd ${kinds}
  elif (( CURRENT == 3 )) && [[ $words[2] == migrate ]]; then compadd run revert show
  fi
}
compdef _eb eb`);
      return;
    }
    throw new Error('Usage: eb completion bash|zsh');
  }
}
