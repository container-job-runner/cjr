import * as chalk from 'chalk'
import * as path from 'path'
import constants = require('../../constants')
import { BuildDriver } from '../abstract/build-driver'
import { ValidatedOutput } from '../../validated-output'
import { JSTools } from '../../js-tools'
import { DockerStackConfiguration} from '../../config/stacks/docker/docker-stack-configuration'
import { parseLineJSON } from '../../functions/misc-functions'
import { Dictionary, cli_name, label_strings } from '../../constants'
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration'
import { ShellCommand } from '../../shell-command'

export class DockerCliBuildDriver extends BuildDriver
{
    protected base_command = 'docker'
    protected outputParser = parseLineJSON

    protected ERRORSTRINGS = {
      "INVALID_CONFIGURATION": chalk`{bold Invalid Configuration} - This build driver requires a DockerStackConfiguration`,
      "INVALID_STACK_TYPE": chalk`{bold Invalid Configuration} - StackConfiguration is of unkown type`,
      "FAILED_TO_EXTRACT_IMAGE_NAME": chalk`{bold Failed to Load tar} - could not extract image name`,
      "FAILED_TO_BUILD": chalk`{bold Image Build Failed} - stack configuration likely contains errors`,
      "FAILED_TO_DELETE_IMAGE": chalk`{bold Image Remove Failed} - unable to remove image`,
      "FAILED_REGISTRY_LOGIN": chalk`{bold Container Registry Authentication Failed} - login was not successful.`,
      "FAILED_REGISTRY_PUSH": chalk`{bold Container Registry Push Failed} - unable to push image.`,
      "FAILED_IMAGE_SAVE": chalk`{bold Image Save Failed} - unable to write image file.`
    }

    protected WARNINGSTRINGS = {
      IMAGE_NONEXISTANT: (name: string) => chalk`There is no image named ${name}.`
    }

    isBuilt(configuration: StackConfiguration<any>)
    {
      const command = `${this.base_command} images`;
      const args:Array<string> = []
      const flags:Dictionary = {
        filter: `reference=${configuration.getImage()}`
      }
      this.addJSONFormatFlag(flags);
      var result = this.outputParser(this.shell.output(command, flags, args, {}))
      return (result.success && !JSTools.isEmpty(result.value))
    }

    build(configuration:StackConfiguration<any>, stdio:"inherit"|"pipe", options?: Dictionary) : ValidatedOutput<string>
    {
      const result = new ValidatedOutput(true, "")

      // -- exit if configuration is not a DockerStackConfiguration
      if(!(configuration instanceof DockerStackConfiguration))
        return result.pushError(this.ERRORSTRINGS.INVALID_CONFIGURATION)

      switch (configuration.stack_type)
      {
        case 'dockerfile': // -- build docker file -----------------------------
          result.merge(
            this.buildFromDockerfile(configuration, stdio, options)
          )
          break;
        case 'tar': // -- load image.tar or image.tar.gz -----------------------
        case 'tar.gz': // -- build image.tar.gz --------------------------------
          result.merge(
            this.loadArchivedImage(configuration, stdio, options)
          )
          break;
        case 'config':  // -- pull remote image --------------------------------
        case 'remote-image':
          result.merge(
            this.pullImage(configuration, stdio, options)
          )
          break;
        default:
          return result.pushError(this.ERRORSTRINGS.INVALID_STACK_TYPE)
      }

      return result
    }

    protected buildFromDockerfile(configuration: DockerStackConfiguration, stdio: "inherit"|"pipe", options?: Dictionary) : ValidatedOutput<string>
    {
      if(!configuration.stack_path)
        return new ValidatedOutput(false, "")

      const command = `${this.base_command} build`;
      const args = ['.'] // user cwd as context
      const flags = this.generateDockerBuildFlags(configuration, options)
      const wd = path.join(configuration.stack_path, configuration.build_context);
      const exec_result = this.shell.exec(`cd ${ShellCommand.bashEscape(wd)} ; ${command}`, flags, args, {"stdio": stdio})
      const result = new ValidatedOutput(true, ShellCommand.stdout(exec_result.value))
      if(!exec_result.success)
        result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)

      return result
    }

    protected generateDockerBuildFlags(configuration: DockerStackConfiguration, options?: Dictionary)
    {
      const flags:Dictionary = {
        "t": configuration.getImage(),
        "f": 'Dockerfile'
      }
      // -- add build arguments ------------------------------------------------
      const args = configuration?.config?.build?.args
      if(args) flags["build-arg"] = {
        value: Object.keys(args).map(k => `${k}=${args[k]}`)
      }
      // -- optional build flags -----------------------------------------------
      if(configuration.config?.build?.["no-cache"] || options?.['no-cache'])
        flags["no-cache"] = {}
      if(configuration?.config?.build?.["pull"] || options?.['pull'])
        flags["pull"] = {}
      // -- add labels ---------------------------------------------------------
      flags["label"] = [`${label_strings.job["stack-path"]}=${configuration.stack_path}`, `builder=${cli_name}`]

      return flags;
    }

    protected loadArchivedImage(configuration: DockerStackConfiguration, stdio: "inherit"|"pipe", options?: Dictionary) : ValidatedOutput<string>
    {
      // -- exit with failure if stack is not of correct type
      const result = new ValidatedOutput(true, "")
      if(!configuration.stack_path)
        return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)
      if(!['tar', 'tar.gz'].includes(configuration.stack_type as string))
        return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)

      // only extract tar if image does not exist, or if no-cache is specified
      if(this.isBuilt(configuration) && !(configuration?.config?.build?.["no-cache"] || options?.['no-cache']))
        return result

      const archive_name = `${configuration.archive_filename}.${configuration.stack_type}`
      // -- load tar file --------------------------------------------------
      const command = `${this.base_command} load`;
      const flags = {input: archive_name}
      const load_result = this.shell.output(command,flags, [], {cwd: path.join(configuration.stack_path, constants.subdirectories.stack.build)})
      if(!load_result.success) return result.absorb(load_result)
      // -- extract name and retag -----------------------------------------
      const image_name = load_result.value?.split(/:(.+)/)?.[1]?.trim(); // split on first ":"
      if(!image_name) return result.pushError(this.ERRORSTRINGS.FAILED_TO_EXTRACT_IMAGE_NAME);
      const exec_result = this.shell.exec(`${this.base_command} image tag`, {}, [image_name, configuration.getImage()], {"stdio": stdio})

      result.value = ShellCommand.stdout(exec_result.value)
      result.absorb(exec_result)
      return result
    }

    protected pullImage(configuration:DockerStackConfiguration, stdio: "inherit"|"pipe", options?:Dictionary) : ValidatedOutput<string>
    {
      const result = new ValidatedOutput(true, "")
      // -- exit with failure if stack is not of correct type
      if(!["remote-image", "config"].includes(configuration.stack_type as string))
        return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)
      if(!configuration.getImage())
        return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)

      // -- only pull image if image does not exist, or if pull is specified
      if(this.isBuilt(configuration) && !(configuration?.config?.build?.["pull"] || options?.['pull']))
        return result

      const exec_result = this.shell.exec(`${this.base_command} pull`, {}, [configuration.getImage()], {"stdio": stdio})
      result.value = ShellCommand.stdout(exec_result.value)
      result.absorb(exec_result)
      return result

    }

    tagImage(configuration: DockerStackConfiguration, name: string)
    {
      return new ValidatedOutput(true, undefined).absorb(
        this.shell.output(`${this.base_command} image tag`, {}, [configuration.getImage(), name])
      )
    }

    pushImage(configuration: DockerStackConfiguration, options: Dictionary, stdio: "inherit"|"pipe") : ValidatedOutput<undefined>
    {
      const result = new ValidatedOutput(true, undefined);
      const login_flags:Dictionary = {}
      if(options.username) login_flags['username'] = options.username
      if(options.token) login_flags['password'] = options.token
      if(options.password) login_flags['password'] = options.password
      const login_args = []
      if(options.server) login_args.push(options.server)
      const login = this.shell.exec(`${this.base_command} login`, login_flags, login_args, {stdio: "pipe"})
      if(!login.success)
        return result.pushError(this.ERRORSTRINGS.FAILED_REGISTRY_LOGIN)
      const push = this.shell.exec(`${this.base_command} push`, {}, [configuration.getImage()], {"stdio": stdio})
      if(!push.success)
        return result.pushError(this.ERRORSTRINGS.FAILED_REGISTRY_PUSH)
      return result
    }

    removeImage(configuration:DockerStackConfiguration) : ValidatedOutput<undefined>
    {
      const result = (new ValidatedOutput(true, undefined))
      // -- exit if configuration is not a DockerStackConfiguration
      if(!(configuration instanceof DockerStackConfiguration))
        return result.pushError(this.ERRORSTRINGS.INVALID_CONFIGURATION)

      if(this.isBuilt(configuration))
      {
        const command = `${this.base_command} rmi`;
        const args = [configuration.getImage()]
        const flags = {}
        result.absorb(this.shell.exec(command, flags, args))
        if(!result.success) result.pushError(this.ERRORSTRINGS.FAILED_TO_DELETE_IMAGE)
        return result
      }

      return result.pushWarning(
        this.WARNINGSTRINGS.IMAGE_NONEXISTANT(configuration.getImage())
      )
    }

    removeAllImages(stack_path: string) : ValidatedOutput<undefined>
    {
      if(!stack_path) return new ValidatedOutput(false, undefined)
      const image_id_cmd = this.shell.commandString(
        `${this.base_command} images`,
        {q: {}, filter: [`label=${label_strings.job["stack-path"]}=${stack_path}`, `label=builder=${cli_name}`]}
      )
      const command = `${this.base_command} rmi $(${image_id_cmd})`
      return (new ValidatedOutput(true, undefined)).absorb(this.shell.exec(command))
    }

    saveImage(configuration: DockerStackConfiguration, options: {path: string, compress: boolean}, stdio: "inherit"|"pipe") : ValidatedOutput<undefined>
    {
      const result = new ValidatedOutput(true, undefined);
      if(options.compress == false)
        result.absorb(
            this.shell.exec(`${this.base_command} save`, {output: options.path}, [configuration.getImage()], {"stdio": stdio})
        )
      else {
          const save_command = this.shell.commandString(`${this.base_command} save`, {}, [configuration.getImage()])
          const gzip_command = this.shell.commandString('gzip >', {}, [options["path"]])
          result.absorb(
              this.shell.exec(`${save_command} | ${gzip_command}`)
          )
      }
      if(!result.success)
        result.pushError(this.ERRORSTRINGS.FAILED_IMAGE_SAVE)
      
      return result
    }

    protected addJSONFormatFlag(flags: Dictionary)
    {
      flags["format"] = '{{json .}}'
    }

}
