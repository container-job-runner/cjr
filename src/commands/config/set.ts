import {flags} from '@oclif/command'
import {StackCommand, Dictionary} from '../../lib/commands/stack-command'
import {printResultState} from '../../lib/functions/misc-functions'
import * as chalk from 'chalk'

export default class Set extends StackCommand {
  static description = 'Set a CLI parameter.'
  static flags = {
    "auto-project-root": flags.string({
      options: ["true", "false"],
      description: 'if true, then cjr will automatically traverse up the directory tree looking for .cjr directories where .cjr/project-settings.yml has project-root: "auto". If it finds such a project then it will set the default --project-root flag to this directory'
    }),
    "interactive": flags.string({
      options: ["true", "false"],
      description: "if true, then certain cli commands will prompt the user with interactive menus."
    }),
    "alway_print_job_id": flags.string({
      options: ["true", "false"],
      description: "if true, then cjr $ command will always print the user id even if --async flag is not selected."
    }),
    "autocopy_sync_job": flags.string({
      options: ["true", "false"],
      description: "if true, then cjr will automatically run job:copy at the end of all synchronous jobs."
    }),
    "selinux": flags.string({
      options: ["true", "false"],
      description: "if true, then the :Z option will be applied to all bind mounts."
    }),
    "stacks-dir": flags.string({
      description: "the default path to a folder that contains cjr stacks."
    }),
    "run_shortcuts_file": flags.string({
      description: "location of a yml file that can be used to specify run shortcuts for `cjr $` command; To disable set value to ''"
    }),
    "build_cmd": flags.string({
      options: ['podman', 'docker'],
      description: "container environment used to build images"
    }),
    "run_cmd": flags.string({
      options: ['podman', 'docker'],
      description: "container environment used to run images"
    }),
    "image_tag": flags.string({
      options: ['podman', 'docker'],
      description: "tag that cli uses when building all its images"
    }),
    "job_list_fields": flags.string({
      description: 'specifies which fields appear when running job:list. The string must be a comma separated list that contains any subset of the fields "id", "stack", "stackName", "statusString", "command", "message"'
    }),
    "container_default_shell": flags.string({
      description: 'default shell that should be started for job:shell commands (e.g. sh, bash, zsh).'
    }),
    "jupyter_command": flags.string({
      description: 'command that should be run to start Jupyter. This allows you to choose between Jupyter lab or Jupyter notebook'
    }),
    "webapp": flags.string({
      description: 'absolute path to cjr electron WebApp.'
    }),
    "job_default_run_mode": flags.string({
      options: ['sync', 'async'],
      description: 'determines if new jobs run sync or async by default.'
    })
  }
  static strict = true;

  async run() {
    const {args, flags} = this.parse(Set)
    Object.keys(flags).sort().map((key:string) => {
      const value = (flags as Dictionary)[key]
      const result = this.settings.set(key, value)
      if(result.success) this.log(chalk`{italic ${key}} -> {green ${value}}`)
      else printResultState(result)
    })
  }
}
