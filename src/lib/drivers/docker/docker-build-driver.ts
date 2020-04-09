import * as fs from 'fs-extra'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as chalk from 'chalk'
import {BuildDriver} from '../abstract/build-driver'
import {ValidatedOutput} from '../../validated-output'
import {JSTools} from '../../js-tools'
import {DockerStackConfiguration} from '../../config/stacks/docker/docker-stack-configuration'
import {FileTools} from '../../fileio/file-tools'
import {YMLFile} from '../../fileio/yml-file'
import {TextFile} from '../../fileio/text-file'

// - types ---------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export class DockerBuildDriver extends BuildDriver
{
    protected base_command = 'docker'
    protected json_output_format = "line_json"
    protected default_config_name = "config.yml"

    protected ERRORSTRINGS = {
      "MISSING_DOCKERFILE_OR_IMAGE": (dir: string) => chalk`{bold Stack is Missing a Dockerfile or image.tar.gz file.}\n  {italic path:} ${dir}`,
      "MISSING_STACKDIR": (dir: string) => chalk`{bold Nonexistant Stack Directory or Image.}\n  {italic path:} ${dir}`,
      "YML_ERROR": (path: string, error: string) => chalk`{bold Unable to Parse YML.}\n  {italic  path:} ${path}\n  {italic error:} ${error}`,
      "INVALID_NAME": (path: string) => chalk`{bold Invalid Stack Name} - stack names may contain only lowercase and uppercase letters, digits, underscores, periods and dashes.\n  {italic  path:} ${path}`,
      "FAILED_TO_EXTRACT_IMAGE_NAME": chalk`{bold Failed to load tar} - could not extract image name`,
      "FAILED_TO_BUILD": chalk`{bold Image Build Failed} - stack configuration likely contains errors`
    }

    protected WARNINGSTRINGS = {
      IMAGE_NONEXISTANT: (name: string) => chalk`There is no image named ${name}.`
    }

    validate(stack_path: string)
    {
      var result = new ValidatedOutput(true);
      var stack_type
      // -- check that folder name is valid ------------------------------------
      if(FileTools.existsDir(stack_path)) // -- assume local stack -------------
      {
        const name_re = new RegExp(/^[a-zA-z0-9-_.]+$/)
        if(!name_re.test(this.stackName(stack_path)))
          result.pushError(this.ERRORSTRINGS["INVALID_NAME"](stack_path))

        if(FileTools.existsFile(path.join(stack_path, 'Dockerfile')))
          stack_type = 'local-dockerfile'
        else if(FileTools.existsFile(path.join(stack_path, 'image.tar.gz')))
          stack_type = 'local-tar'
        else
          result.pushError(this.ERRORSTRINGS["MISSING_DOCKERFILE_OR_IMAGE"](stack_path));

        result.absorb(this.loadConfiguration(stack_path, [])); // validate local config
      }
      else // -- assume remote image -------------------------------------------
      {
        stack_type = 'remote'
        if(!this.isBuilt(stack_path, this.emptyConfiguration())) { // use empty configuration for isbuilt since we are using docker pull, not build
          const pull_result = this.shell.exec(`${this.base_command} pull`, {}, [stack_path])
          if(!pull_result.success) result.pushError(this.ERRORSTRINGS["MISSING_STACKDIR"](stack_path));
        }
      }
      return (result.success) ? new ValidatedOutput(true, {stack_type: stack_type}) : result
    }

    isBuilt(stack_path: string, configuration: DockerStackConfiguration)
    {
      const command = `${this.base_command} images`;
      const args:Array<string> = []
      const flags:Dictionary = {
        filter: `reference=${this.imageName(stack_path, configuration.buildHash())}`
      }
      this.addJSONFormatFlag(flags);
      var result = this.shell.output(command, flags, args, {}, this.json_output_format)
      return (result.success && !JSTools.isEmpty(result.data)) ? true : false
    }

    build(stack_path: string, configuration:DockerStackConfiguration, nocache?:boolean)
    {
      var result = this.validate(stack_path)
      if(!result.success) return result
      const {stack_type} = result.data

      if(stack_type === 'local-dockerfile') // build local stack -------------------------
      {
          const build_object:Dictionary = configuration.buildObject()
          const command = `${this.base_command} build`;
          const args = [build_object?.context || '.']
          let   flags:Dictionary = {
            "t": this.imageName(stack_path, configuration.buildHash()),
            "f": path.join(build_object.dockerfile || 'Dockerfile')
          }
          if(build_object["no_cache"] || nocache) {
            flags["no-cache"] = {}
            flags["pull"] = {}
          }
          this.argFlags(flags, build_object)
          result = this.shell.exec(command, flags, args, {cwd: stack_path})
      }
      else if(stack_type === 'local-tar') // build local stack -------------------------
      {
          // -- load tar file --------------------------------------------------
          const command = `${this.base_command} load`;
          const flags = {input: 'image.tar.gz', q: {}}
          const load_result = this.shell.output(command,flags, [], {cwd: stack_path})
          if(!load_result.success) return load_result
          // -- extract name and retag -----------------------------------------
          const image_name = load_result.data?.split(/:(.+)/)?.[1]?.trim(); // split on first ":"
          if(!image_name) return (new ValidatedOutput(false)).pushError(this.ERRORSTRINGS.FAILED_TO_EXTRACT_IMAGE_NAME);
          result = this.shell.exec(`${this.base_command} image tag`, {}, [image_name, this.imageName(stack_path, configuration.buildHash())])
      }
      else if(stack_type === 'remote') // retag remote stack -----------------------
      {
        result = this.shell.exec(`${this.base_command} image tag`, {}, [stack_path, this.imageName(stack_path, configuration.buildHash())])
      }
      if(!result.success) result.pushError(this.ERRORSTRINGS.FAILED_TO_BUILD)
      return result;
    }

    protected argFlags(flags:Dictionary, build_object:Dictionary)
    {
      const args = build_object?.args
      if(args) flags["build-arg"] = {
        escape: false, // allow shell commands $()
        value: Object.keys(args).map(k => `${k}\\=${args[k]}`)
      }
    }

    removeImage(stack_path: string, configuration?:DockerStackConfiguration)
    {
      if(configuration === undefined) // -- delete all images associated with stack (regardless of configuration)
      {
        const image_id_cmd = this.shell.commandString(
            `${this.base_command} images`,
            {q: {}, filter: `reference=*${this.imageName(stack_path, "")}`}
        )
        const command = `${this.base_command} rmi $(${image_id_cmd})`
        return this.shell.exec(command)
      }
      else if(this.isBuilt(stack_path, configuration)) // -- only delete images associated with stack and configuration
      {
          const command = `${this.base_command} rmi`;
          const args = [this.imageName(stack_path, configuration.buildHash())]
          const flags = {}
          return this.shell.exec(command, flags, args)
      }
      return new ValidatedOutput(true).pushWarning(
        this.WARNINGSTRINGS.IMAGE_NONEXISTANT(
          this.imageName(stack_path, configuration.buildHash())
        ))
    }

    // Load stack_path/config.yml and any additional config files. The settings in the last file in the array has highest priorty
    // silently ignores files if they are not present

    loadConfiguration(stack_path: string, overloaded_config_paths: Array<string> = [])
    {
      const stack_config = path.join(stack_path, this.default_config_name)
      if(path.isAbsolute(stack_config))
        overloaded_config_paths = [path.join(stack_path, this.default_config_name)].concat(overloaded_config_paths) // if stack_path is absolute (implies a local stack) then prepend stack config file. Note: create new array with = to prevent modifying overloaded_config_paths for calling function
      var configuration = this.emptyConfiguration()
      var result = overloaded_config_paths.reduce(
        (result: ValidatedOutput, path: string) => {
          const sub_configuration = this.emptyConfiguration()
          const load_result = sub_configuration.loadFromFile(path)
          if(load_result) configuration.merge(sub_configuration)
          return result
        },
        new ValidatedOutput(true)
      )

      return (result.success) ? new ValidatedOutput(true, configuration) : result
    }

    copy(stack_path: string, new_stack_path: string, configuration?: DockerStackConfiguration)
    {
      try
      {
        if(path.isAbsolute(stack_path))
          fs.copySync(stack_path, new_stack_path)
        this.copyConfig(stack_path, new_stack_path, configuration)
      }
      catch(e)
      {
        return new ValidatedOutput(false, e, [e?.message])
      }
      return new ValidatedOutput(true)
    }

    copyConfig(stack_path: string, new_stack_path: string, configuration?: DockerStackConfiguration)
    {
      if(!path.isAbsolute(stack_path)) { // create Dockerfile for nonlocal stack
        const file = (new TextFile(new_stack_path, false))
        file.add_extension = false
        file.write('Dockerfile', `FROM ${stack_path}`)
      }
      if(configuration !== undefined) // write any configurion files
        return configuration.writeToFile(path.join(new_stack_path,this.default_config_name))
    }

    // Special function for reducing code repetition in Podman Driver Class

    protected addJSONFormatFlag(flags: Dictionary)
    {
      flags["format"] = '{{json .}}'
    }

    // Overloaded Methods

    imageName(stack_path: string, prefix: string="") // Docker only accepts lowercase image names
    {
      return super.imageName(stack_path, prefix).toLowerCase()
    }

    emptyConfiguration()
    {
      return new DockerStackConfiguration()
    }

}
