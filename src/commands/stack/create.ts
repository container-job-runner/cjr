import fs = require('fs-extra')
import path = require('path')
import chalk = require('chalk')
import inquirer = require('inquirer')
import constants = require('../../lib/constants')
import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { ValidatedOutput } from '../../lib/validated-output'
import { printResultState } from '../../lib/functions/misc-functions'
import { ErrorStrings } from '../../lib/error-strings'
import { FileTools } from '../../lib/fileio/file-tools'
import { DockerStackConfiguration } from '../../lib/config/stacks/docker/docker-stack-configuration'
import { StackConfiguration } from '../../lib/config/stacks/abstract/stack-configuration'
import { augmentImagePushParameters } from '../../lib/functions/cli-functions'
import { ContainerDrivers } from '../../lib/job-managers/job-manager'

type NewSnapshotOptions = {
  "image": string,
  "username": string,
  "token"?: string,
  "server": string,
  "mode": string
}

export default class Create extends BasicCommand {
  static description = 'Initialize a project in the current directory.'
  static args = [{name: "name", required: true}]
  static flags = {
    "dockerfile": flags.string({exclusive: ['image', 'snapshot'], description: "Path to local dockerfile."}),
    "image": flags.string({exclusive: ['dockerfile', 'snapshot'], description: "Base docker image for stack."}),
    "snapshot": flags.boolean({exclusive: ['dockerfile', 'image'], description: "Create new stack with snapshotting."}),
    "stacks-dir": flags.string({default: "", description: "override default stack directory"}),
    "explicit": flags.boolean({default: false})
  }
  static strict = true;

  async run()
  {
    const { args, flags } = this.parse(Create)
    this.augmentFlagsWithProjectSettings(flags, {"stacks-dir": true})
    const stacks_path = flags["stacks-dir"] || this.settings.get("stacks-dir")
    const stack_name = args['name']

    // -- validate name --------------------------------------------------------
    const valid_name = this.validStackName(args.name)
    if( ! valid_name.success ) return printResultState(valid_name)

    // -- exit if stack exists -------------------------------------------------
    if(fs.existsSync(path.join(stacks_path, args.name)))
      return printResultState(new ValidatedOutput(false, undefined).pushError(`stack "${stack_name}" already exists in ${stacks_path}`))

    // -- create stack ---------------------------------------------------------
    let result: ValidatedOutput<undefined>
    if(flags.dockerfile)
      result = this.createDockerfileStack(stacks_path, stack_name, flags['dockerfile'])
    else if (flags['image'])
      result = this.createImageStack(stacks_path, stack_name, flags['image'])
    else if (flags['snapshot'])
      result = await this.createImageStackWithSnapshots(stacks_path, stack_name, flags['explicit'])
    else
      result = this.createEmptyStack(stacks_path, stack_name)
    printResultState(result)
  }

  validStackName(name: string) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    if(/^[a-zA-Z0-9_\-\.]+$/.test(name))
      return result
    return result.pushError(ErrorStrings.STACK.INVALID_NAME)
  }

  createEmptyStack(stacks_dir: string, stack_name: string) : ValidatedOutput<undefined>
  {
    fs.mkdirSync(path.join(stacks_dir, stack_name))
    fs.mkdirSync(path.join(stacks_dir, stack_name, constants.subdirectories.stack.profiles))
    return new ValidatedOutput(true, undefined)
  }

  createDockerfileStack(stacks_dir: string, stack_name: string, dockerfile: string) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)

    // -- exit if dockerfile does not exist ------------------------------------
    dockerfile = path.resolve(dockerfile)
    if(!FileTools.existsFile(dockerfile))
      return result.pushError(`Nonexistant dockerfile ${dockerfile}`)

    // -- create stack and copy dockerfile -------------------------------------
    result.absorb(this.createEmptyStack(stacks_dir, stack_name))
    const build_dir = path.join(stacks_dir, stack_name, constants.subdirectories.stack.build)
    fs.mkdirSync(build_dir)
    fs.copyFileSync(dockerfile, path.join(build_dir, 'Dockerfile'))

    return result
  }

  createImageStack(stacks_dir: string, stack_name: string, image: string)
  {
    const configuration = new DockerStackConfiguration()
    configuration.setImage(image)
    return this.createConfigStack(stacks_dir, stack_name, configuration)
  }

  createConfigStack(stacks_dir: string, stack_name: string, configuration: StackConfiguration<any>)
  {
    const result = this.createEmptyStack(stacks_dir, stack_name)
    const stack_path = path.join(stacks_dir, stack_name)
    return result.absorb(
      configuration.save(stack_path)
    )
  }

  async createImageStackWithSnapshots(stacks_dir: string, stack_name: string, explicit: boolean)
  {
    const result = new ValidatedOutput(true, undefined)
    const { container_drivers } = this.initContainerSDK(false, false, explicit)

    // -- prompt user for stack options ----------------------------------------
    const options_prompt = await this.promptSnapshotOptions()
    if(!options_prompt.success)
      return result.absorb(options_prompt)
    const options = options_prompt.value
    // -- pull stack, retag for user, and create new configuration -------------
    const new_config_result = this.newSnapshotStackConfiguration(container_drivers, stack_name, options)
    if(!new_config_result.success)
      return result.absorb(new_config_result)
    const snapshot_configuration = new_config_result.value.snapshot
    const latest_configuration = new_config_result.value.latest
    // -- push stack image to user remote registry -----------------------------
    const push_options = await augmentImagePushParameters(options)
    result.absorb(
      container_drivers.builder.pushImage(snapshot_configuration, push_options, "inherit"),
      container_drivers.builder.pushImage(latest_configuration, push_options, "inherit")
    )
    if(!result.success)
      return result

    snapshot_configuration.setTag('latest');
    return this.createConfigStack(stacks_dir, stack_name, snapshot_configuration)
  }

  // ---------------------------------------------------------------------------
  // pulls a remote image, then retags it as
  //    1. user/image-base-name:timestamp
  // ---------------------------------------------------------------------------

  newSnapshotStackConfiguration(container_drivers: ContainerDrivers, stack_name: string, options: NewSnapshotOptions) : ValidatedOutput<{latest: DockerStackConfiguration, snapshot: DockerStackConfiguration}>
  {
    const snapshot_configuration = new DockerStackConfiguration()
    const result = new ValidatedOutput(true, {latest: snapshot_configuration, snapshot: snapshot_configuration})

    // -- pull image -----------------------------------------------------------
    const configuration = new DockerStackConfiguration()
    configuration.setImage(options.image)
    result.absorb(
      container_drivers.builder.build(configuration, "inherit", {pull: true})
    )
    if(!result.success)
      return result

    // -- retag image ----------------------------------------------------------
    snapshot_configuration.setImage(path.posix.join(options.username, stack_name))
    snapshot_configuration.setTag(`${Date.now()}`)
    snapshot_configuration.setSnapshotOptions({
      "mode": options.mode as 'always'|'prompt'|'flag',
      "username": options.username,
      "token": options.token,
      "server": options.server
    })
    const latest_configuration = snapshot_configuration.copy()
    latest_configuration.setTag(constants.SNAPSHOT_LATEST_TAG)
    result.value.latest = latest_configuration

    result.absorb(
      container_drivers.builder.tagImage(configuration, snapshot_configuration.getImage()),
      container_drivers.builder.tagImage(configuration, latest_configuration.getImage())
    )
    if(!result.success)
      return result

    // -- return validated output with tagged image ----------------------------
    return result
  }

  async promptSnapshotOptions() : Promise<ValidatedOutput<NewSnapshotOptions>>
  {
    const failure = new ValidatedOutput(false, {image: "", username: "", server: "", mode: "off"})
    const errors = {
      "EMPTYIMAGE": chalk`{bold Invalid Parameters} - Empty Image.`,
      "EMPTYSERVER": chalk`{bold Invalid Parameters} - Empty auth server endpoint.`,
      "EMPTYUSERNAME": chalk`{bold Invalid Parameters} - empty username.`
    }

    const response = await inquirer.prompt([
      {
        name: "image",
        message: `Base Image:`,
        type: "input",
      },
      {
        name: "server",
        message: `Auth Server:`,
        default: this.settings.get('container-registry-auth'),
        type: "input",
      },
      {
        name: "username",
        message: `Username:`,
        default: this.settings.get('container-registry-user'),
        type: "input",
      },
      {
        name: "token",
        message: `Access Token (Optional):`,
        type: "password",
      },
      {
        name: "mode",
        message: `Snapshot mode`,
        choices: ['always', 'prompt', 'flag'],
        type: "list",
      }
    ])

    if(!response.image)
      return failure.pushError(errors['EMPTYIMAGE'])
    if(!response.server)
      return failure.pushError(errors['EMPTYSERVER'])
    if(!response.username)
      return failure.pushError(errors['EMPTYUSERNAME'])

    return new ValidatedOutput(true, response)

  }

}
