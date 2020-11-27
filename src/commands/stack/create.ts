import fs = require('fs-extra')
import path = require('path')
import chalk = require('chalk')
import inquirer = require('inquirer')
import constants = require('../../lib/constants')
import { flags } from '@oclif/command'
import { BasicCommand } from '../../lib/commands/basic-command'
import { ValidatedOutput } from '../../lib/validated-output'
import { printValidatedOutput, printOutputHeader } from '../../lib/functions/misc-functions'
import { ErrorStrings } from '../../lib/error-strings'
import { FileTools } from '../../lib/fileio/file-tools'
import { DockerStackConfiguration } from '../../lib/config/stacks/docker/docker-stack-configuration'
import { StackConfiguration } from '../../lib/config/stacks/abstract/stack-configuration'
import { augmentImagePushParameters } from '../../lib/functions/cli-functions'
import { ContainerDrivers } from '../../lib/job-managers/abstract/job-manager'

type RemoteSnapshotOptions = { "image": string, "storage-location": "registry", "mode": "always"|"prompt", "username": string, "token"?: string, "server": string }
type ArchiveSnapshotOptions = { "image": string, "storage-location": "archive", "mode": "always"|"prompt" }
type NewSnapshotOptions = RemoteSnapshotOptions | ArchiveSnapshotOptions

export default class Create extends BasicCommand {
  static description = 'Create a new cjr stack.'
  static args = [{name: "name", required: true}]
  static flags = {
    "dockerfile": flags.string({exclusive: ['image', 'snapshot'], description: "Create a new stack with using this Dockerfile."}),
    "image": flags.string({exclusive: ['dockerfile', 'snapshot'], description: "Create a new stack based on an existing docker Image."}),
    "snapshot": flags.boolean({exclusive: ['dockerfile', 'image'], description: "Create a new stack that supports snapshots."}),
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
    if( ! valid_name.success ) return printValidatedOutput(valid_name)

    // -- exit if stack exists -------------------------------------------------
    if(fs.existsSync(path.join(stacks_path, args.name)))
      return printValidatedOutput(new ValidatedOutput(false, undefined).pushError(`stack "${stack_name}" already exists in ${stacks_path}`))

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
    printValidatedOutput(result)
  }

  validStackName(name: string) : ValidatedOutput<undefined>
  {
    const result = new ValidatedOutput(true, undefined)
    if(/^[a-zA-Z0-9_\-\.]+$/.test(name))
      return result
    return result.pushError(ErrorStrings.STACK.INVALID_NAME)
  }

  createEmptyStack(stacks_dir: string, stack_name: string, directories?: {build?: boolean, snapshots?: boolean}) : ValidatedOutput<undefined>
  {
    fs.mkdirpSync(path.join(stacks_dir, stack_name))
    fs.mkdirpSync(path.join(stacks_dir, stack_name, constants.subdirectories.stack.profiles))
    if(directories?.build)
        fs.mkdirpSync(path.join(stacks_dir, stack_name, constants.subdirectories.stack.build))
    if(directories?.snapshots)
        fs.mkdirpSync(path.join(stacks_dir, stack_name, constants.subdirectories.stack.snapshots))   
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
    const config_path = path.join(stacks_dir, stack_name, new DockerStackConfiguration().config_filename)
    fs.mkdirSync(build_dir)
    fs.copyFileSync(dockerfile, path.join(build_dir, 'Dockerfile'))
    fs.createFileSync(config_path)

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

  async createImageStackWithSnapshots(stacks_dir: string, stack_name: string, explicit: boolean) : Promise<ValidatedOutput<undefined>>
  {
    const result = new ValidatedOutput(true, undefined)
    const job_manager = this.newJobManager('localhost', {verbose: false, quiet: false, explicit: explicit})
    const container_drivers = job_manager.container_drivers

    // -- prompt user for stack options ----------------------------------------
    const options_prompt = await this.promptSnapshotOptions()
    if(!options_prompt.success)
      return result.absorb(options_prompt)
    const options = options_prompt.value
    
    // -- prepare image and write stack
    let new_config_result: ValidatedOutput<DockerStackConfiguration> 
    
    if(options["storage-location"] == "archive") {
        this.createEmptyStack(stacks_dir, stack_name, {snapshots: true, build: true});
        new_config_result = this.newArchiveSnapshotStackConfiguration(container_drivers, stacks_dir, stack_name, options)
    } else {
        new_config_result = await this.newRemoteSnapshotStackConfiguration(container_drivers, stack_name, options)
    }

    if(!new_config_result.success)
        return result.absorb(new_config_result)
    
    return this.createConfigStack(stacks_dir, stack_name, new_config_result.value)
  }

  // ---------------------------------------------------------------------------
  // pulls a remote image, then retags it as
  //    1. user/image-base-name:timestamp
  //    2. user/image-base-name:latest
  // then pushes images to users repository and returns snapshot config
  // ---------------------------------------------------------------------------

  async newRemoteSnapshotStackConfiguration(container_drivers: ContainerDrivers, stack_name: string, options: RemoteSnapshotOptions) : Promise<ValidatedOutput<DockerStackConfiguration>>
  {
    const result = new ValidatedOutput(true, new DockerStackConfiguration())

    // -- pull and tag images --------------------------------------------------
    printOutputHeader(`Pulling ${options.image}`)
    const image_name = path.posix.join(options.username, stack_name)
    const pr_result = this.pullAndTag(options.image, {
            "snapshot": `${image_name}:${Date.now()}`,
            "latest": `${image_name}:${constants.SNAPSHOT_LATEST_TAG}`
        }, container_drivers) as ValidatedOutput<{latest: DockerStackConfiguration, snapshot: DockerStackConfiguration}>
    
    if(!result.success)
        return result

    const snapshot_configuration =  pr_result.value.snapshot
    const latest_configuration = pr_result.value.latest

    // -- push stack image to user remote registry -----------------------------
    printOutputHeader(`Pushing ${snapshot_configuration.getImage()}`)
    const push_options = await augmentImagePushParameters(options)
    result.absorb(
        container_drivers.builder.pushImage(snapshot_configuration, push_options, "inherit")
    )
    if(!result.success) 
        return result
    
    // -- update latest snapshot -----------------------------------------------    
    printOutputHeader(`Updating ${latest_configuration.getImage()}`)
    result.absorb(
        container_drivers.builder.pushImage(latest_configuration, push_options, "inherit")
    )
    if(!result.success)
        return result

    // -- set stapshot options
    snapshot_configuration.setSnapshotOptions({
      "storage-location": "registry",
      "mode": options.mode,
      "username": options.username,
      "token": options.token,
      "server": options.server
    })
    snapshot_configuration.setTag('latest');
    
    // -- return validated output with tagged image ----------------------------
    return  new ValidatedOutput(true, snapshot_configuration) 
  }

  private pullAndTag(image: string, tags: {[key:string] : string}, container_drivers: ContainerDrivers) : ValidatedOutput<{[key:string] : DockerStackConfiguration}>
  {
    const configurations:{[key:string] : DockerStackConfiguration} = {}
    const result = new ValidatedOutput(true, configurations)

    // -- pull image -----------------------------------------------------------
    const configuration = new DockerStackConfiguration()
    configuration.setImage(image)
    result.absorb(
      container_drivers.builder.build(configuration, "inherit", {pull: true})
    )
    if(!result.success)
      return result

    // -- retag image ----------------------------------------------------------
    for (let key in tags)
    {
        const tagged_configuration = new DockerStackConfiguration()
        tagged_configuration.setImage(tags[key])
        result.absorb(
            container_drivers.builder.tagImage(configuration, tagged_configuration.getImage())
        )
        configurations[key] = tagged_configuration
    }
    
    return result
  }

  newArchiveSnapshotStackConfiguration(container_drivers: ContainerDrivers, stack_dir: string, stack_name: string, options: ArchiveSnapshotOptions) : ValidatedOutput<DockerStackConfiguration>
  {
    const result = new ValidatedOutput(true, new DockerStackConfiguration())

    // -- pull and tag images -------------------------------------------------
    printOutputHeader(`Pulling ${options.image}`)
    const pr_result = this.pullAndTag(options.image, {
            "snapshot": `${stack_name}:${Date.now()}`
        }, container_drivers) as ValidatedOutput<{snapshot: DockerStackConfiguration}>
    
    if(!result.success)
        return result

    // -- set snapshot options ------------------------------------------------
    const snapshot_configuration = pr_result.value["snapshot"]
    snapshot_configuration.setSnapshotOptions({
      "storage-location": "archive",
      "mode": options.mode
    })

    // -- save tar of image ---------------------------------------------------
    printOutputHeader(`Saving ${options.image} to tar.gz`)
    const stack_path = path.join(stack_dir, stack_name)
    const snapshot_tar = constants.stackNewSnapshotPath(stack_path, snapshot_configuration.getTag())
    const stack_image_tar = constants.stackArchiveImagePath(stack_path)

    result.absorb(
        container_drivers.builder.saveImage(snapshot_configuration, 
            {
                path: snapshot_tar,
                compress: true
            }, 
            "inherit"
        )
    )

    if(!result.success)
        return result

    // -- create hardlink ------------------------------------------------------
    fs.link(snapshot_tar, stack_image_tar)

    // -- return validated output with tagged image ----------------------------
    const stack_configuration = new DockerStackConfiguration()
    stack_configuration.setSnapshotOptions({
      "storage-location": "archive",
      "mode": options.mode
    })
    
    return  new ValidatedOutput(true, stack_configuration)
  }

  async promptSnapshotOptions() : Promise<ValidatedOutput<NewSnapshotOptions>>
  {
    const failure = new ValidatedOutput<NewSnapshotOptions>(false, {image: "", "storage-location": "registry", username: "", server: "", mode: "prompt"})
    const errors = {
      "EMPTYIMAGE": chalk`{bold Invalid Parameters} - Empty Image.`,
      "EMPTYSERVER": chalk`{bold Invalid Parameters} - Empty auth server endpoint.`,
      "EMPTYUSERNAME": chalk`{bold Invalid Parameters} - empty username.`
    }

    const prompt_general = await inquirer.prompt([
      {
        name: "image",
        message: `Base Image:`,
        type: "input",
      },
      {
        name: "location",
        message: `Snapshot storage location`,
        choices: ['remote registry', 'local archive'],
        type: "list",
      },
      {
        name: "mode",
        message: `Snapshot mode`,
        choices: ['prompt', 'always'],
        type: "list",
      }
    ]);

    let response:NewSnapshotOptions
    
    if( prompt_general["location"] == "local archive" )
    {
        response = {
            "storage-location": "archive",
            "image": prompt_general["image"],
            "mode": prompt_general["mode"],
        };
    }
    else
    {
        const prompt_registry = await inquirer.prompt([
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
            }
        ])
        response = {
            "storage-location": "registry",
            "image": prompt_general["image"],
            "mode": prompt_general["mode"],
            "username": prompt_registry["username"], 
            "token": prompt_registry["token"],
            "server": prompt_registry["server"]
        };

        if(!response.server)
            return failure.pushError(errors['EMPTYSERVER'])
        if(!response.username)
            return failure.pushError(errors['EMPTYUSERNAME'])
    }

    if(!response.image)
      return failure.pushError(errors['EMPTYIMAGE'])

    return new ValidatedOutput(true, response)

  }

}
