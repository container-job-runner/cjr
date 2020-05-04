import * as chalk from 'chalk'
import { BuildDriver } from '../abstract/build-driver'
import { ValidatedOutput } from '../../validated-output'
import { JSTools } from '../../js-tools'
import { DockerStackConfiguration} from '../../config/stacks/docker/docker-stack-configuration'
import { parseLineJSON } from '../../functions/misc-functions'
import { Dictionary, cli_name, stack_path_label } from '../../constants'
import { StackConfiguration } from '../../config/stacks/abstract/stack-configuration'

export class DockerCliBuildDriver extends BuildDriver
{
    protected base_command = 'docker'
    protected outputParser = parseLineJSON

    protected ERRORSTRINGS = {
      "INVALID_CONFIGURATION": chalk`{bold Invalid Configuration} - This build driver requires a DockerStackConfiguration`,
      "INVALID_STACK_TYPE": chalk`{bold Invalid Configuration} - StackConfiguration is of unkown type`,
      "FAILED_TO_EXTRACT_IMAGE_NAME": chalk`{bold Failed to Load tar} - could not extract image name`,
      "FAILED_TO_BUILD": chalk`{bold Image Build Failed} - stack configuration likely contains errors`
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
      return (result.success && !JSTools.isEmpty(result.value)) ? true : false
    }

    build(configuration:StackConfiguration<any>, options?: Dictionary) : ValidatedOutput<undefined>
    {
      const result = new ValidatedOutput(true, undefined)

      // -- exit if configuration is not a DockerStackConfiguration
      if(!(configuration instanceof DockerStackConfiguration))
        return result.pushError(this.ERRORSTRINGS.INVALID_CONFIGURATION)

      switch (configuration.stack_type)
      {
        case 'dockerfile': // -- build docker file -----------------------------
          result.absorb(
            this.buildFromDockerfile(configuration, options)
          )
          break;
        case 'tar': // -- load image.tar or image.tar.gz -----------------------
        case 'tar.gz': // -- build image.tar.gz --------------------------------
          result.absorb(
            this.loadArchivedImage(configuration, options)
          )
          break;
        case 'config':  // -- pull remote image --------------------------------
        case 'remote-image':
          result.absorb(
            this.pullImage(configuration, options)
          )
          break;
        default:
          return result.pushError(this.ERRORSTRINGS.INVALID_STACK_TYPE)
      }

      return result
    }

    protected buildFromDockerfile(configuration: DockerStackConfiguration, options?: Dictionary)
    {
      const command = `${this.base_command} build`;
      const args = [configuration.build_context] // user cwd as context
      const flags = this.generateDockerBuildFlags(configuration, options)
      const result = this.shell.exec(command, flags, args, {cwd: configuration.stack_path})
      if(!result.success) result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)
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
      flags["label"] = [`${stack_path_label}=${configuration.stack_path}`, `builder=${cli_name}`]

        return flags;
    }

    protected loadArchivedImage(configuration: DockerStackConfiguration, options?: Dictionary) : ValidatedOutput<undefined>
    {
      // -- exit with failure if stack is not of correct type
      const result = new ValidatedOutput(true, undefined)
      if(!configuration.stack_path)
        return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)
      if(!['tar', 'tar.gz'].includes(configuration.stack_type as string))
        return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)

      // only extract tar if image does not exist, or if no-cache is specified
      if(this.isBuilt(configuration) && !options?.['no-cache'])
        return result

      const archive_name = `${configuration.archive_filename}.${configuration.stack_type}`
      // -- load tar file --------------------------------------------------
      const command = `${this.base_command} load`;
      const flags = {input: archive_name}
      const load_result = this.shell.output(command,flags, [], {cwd: configuration.stack_path})
      if(!load_result.success) return result.absorb(load_result)
      // -- extract name and retag -----------------------------------------
      const image_name = load_result.value?.split(/:(.+)/)?.[1]?.trim(); // split on first ":"
      if(!image_name) return (new ValidatedOutput(false, undefined)).pushError(this.ERRORSTRINGS.FAILED_TO_EXTRACT_IMAGE_NAME);
      return result.absorb(
        this.shell.exec(`${this.base_command} image tag`, {}, [image_name, configuration.getImage()])
      )
    }

    protected pullImage(configuration:DockerStackConfiguration, options?:Dictionary) : ValidatedOutput<undefined>
    {
      const result = new ValidatedOutput(true, undefined)
      // -- exit with failure if stack is not of correct type
      if(!["remote-image", "config"].includes(configuration.stack_type as string))
        return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)
      if(!configuration.getImage())
        return result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)

      // -- only pull image if image does not exist, or if pull is specified
      if(this.isBuilt(configuration) && !options?.['pull'])
        return result

      return result.absorb(
        this.shell.exec(`${this.base_command} pull`, {}, [configuration.getImage()])
      )
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
            return result.absorb(this.shell.exec(command, flags, args))
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
          {q: {}, filter: [`label=${stack_path_label}=${stack_path}`, `label=builder=${cli_name}`]}
      )
      const command = `${this.base_command} rmi $(${image_id_cmd})`
      return (new ValidatedOutput(true, undefined)).absorb(this.shell.exec(command))
    }

    protected addJSONFormatFlag(flags: Dictionary)
    {
      flags["format"] = '{{json .}}'
    }

}
