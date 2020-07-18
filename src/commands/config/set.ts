import chalk = require('chalk')
import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { printValidatedOutput } from '../../lib/functions/misc-functions'
import { Dictionary } from '../../lib/constants'

export default class Set extends BasicCommand {
  static description = 'Set one or multiple cli parameters.'
  static flags = {
    "auto-project-root": flags.string({
      options: ["true", "false"],
      description: 'if true, then cjr will automatically traverse up the directory tree looking for .cjr directories where .cjr/project-settings.yml has project-root: "auto". If it finds such a project then it will set the default --project-root flag to this directory'
    }),
    "interactive": flags.string({
      options: ["true", "false"],
      description: "if true, then certain cli commands will prompt the user with interactive menus."
    }),
    "always-print-job-id": flags.string({
      options: ["true", "false"],
      description: "if true, then cjr $ command will always print the user id even if --async flag is not selected."
    }),
    "autocopy-sync-job": flags.string({
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
    "run-shortcuts-file": flags.string({
      description: "location of a yml file that can be used to specify run shortcuts for `cjr $` command; To disable set value to ''"
    }),
    "driver": flags.string({
      options: ['podman-cli', 'docker-cli', 'docker-socket', 'podman-socket'],
      description: "container engine used to build and run images"
    }),
    "image-tag": flags.string({
      description: "tag that cli uses when building all its images"
    }),
    "job-ls-fields": flags.string({
      description: 'specifies which fields appear when running job:list. The string must be a comma separated list that contains any subset of the fields "id", "stack", "stackName", "status", "command", "message"'
    }),
    "default-container-shell": flags.string({
      description: 'default shell that should be started for shell and job:shell commands (e.g. sh, bash, zsh).'
    }),
    "jupyter-command": flags.string({
      description: 'command that should be run to start Jupyter (e.g. "jupyter lab" or "jupyter notebook").'
    }),
    "webapp": flags.string({
      description: 'absolute path to cjr electron WebApp.'
    }),
    "job-default-run-mode": flags.string({
      options: ['sync', 'async'],
      description: 'determines if new jobs run sync or async by default.'
    }),
    "socket-path": flags.string({
      description: 'location of container runtime socket'
    }),
    "container-registry": flags.string({
      description: 'url of default container registry for pushing snapshots.'
    }),
    "container-registry-user": flags.string({
      description: 'container registry username for pushing snapshots'
    }),
    "timeout-jupyter": flags.string({
      description: 'maximum number of seconds that cjr should wait for jupyter server to start.'
    }),
    "timeout-theia": flags.string({
      description: 'number of seconds that cjr should wait for theia server to start.'
    }),
    "xquartz-autostart": flags.string({
      options: ["true", "false"],
      description: "only affects mac. if true, then cjr will try to start xquartz automatically when --x11 flag is selected."
    }),
    "quiet":flags.boolean({default: false, char: 'q'})
  }
  static strict = true;

  async run() {
    const { flags } = this.parse(Set)
    Object.keys(flags).filter((key:string) => key != "quiet").sort().map((key:string) => {
      const value = (flags as Dictionary)[key]
      const result = this.settings.set(key, value)
      if(result.success && !flags['quiet'])
        this.log(chalk`{italic ${key}} -> {green ${value}}`)
      else printValidatedOutput(result)
    })
  }
}
