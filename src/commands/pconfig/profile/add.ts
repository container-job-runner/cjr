import { flags } from '@oclif/command'
import { ProjectSettingsCommand } from '../../../lib/commands/project-settings-command'

export default class Set extends ProjectSettingsCommand {
  static description = 'Adds one element to an array configuration property'
  static args = [{name: "path", require: true}]
  static flags = {
    "project-root": flags.string({ env: 'PROJECTROOT', description: "location where settings should be written" })
  }
  static strict = true;

  async run()
  {
    const { args, flags } = this.parse(Set)
    this.augmentFlagsWithProjectSettings(flags, {"project-root":true})
    const project_root: string = flags["project-root"] || ""
    this.copyProfileToProjectSettings(args.path, project_root)
  }

}
