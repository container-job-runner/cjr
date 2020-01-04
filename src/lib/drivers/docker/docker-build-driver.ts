import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import {BuildDriver} from '../abstract/build-driver'
import {ValidatedOutput} from '../../validated-output'
import {DockerConfiguration} from '../../config/docker/docker-configuration'
import {FileTools} from '../../fileio/file-tools'

export class DockerBuildDriver extends BuildDriver
{
    private base_command = 'docker'
    private sub_commands = {
      build: "build",
      images: "images",
      remove: "rmi"
    }
    private configuration_constructor = DockerConfiguration // pointer to configuration class constructor

    private ERRORSTR = {
      "MISSING_DOCKERFILE": (dir) => `No Dockerfile found in stack directory:\n\t${dir}`,
      "MISSING_STACKDIR": (dir) => `Stack directory does not exist:\n\t${dir}`,
      "FAILED_BUILD": "Stack directory does not exist or is not a directory."
    }

    validate(stack_path: string, overloaded_config_paths: array<string> = [])
    {
      var result = new ValidatedOutput();
      // check stack_path is a directory
      const dir_exists = FileTools.existsDir(stack_path)
      if(!dir_exists) result.pushError(this.ERRORSTR["MISSING_STACKDIR"](stack_path))
      // check that required files are present
      const required_files = ['Dockerfile'];
      const files_exist = required_files.map(
        file => fs.existsSync(path.join(stack_path, file))
      )
      if(!files_exist[0]) result.pushError(this.ERRORSTR["MISSING_DOCKERFILE"](stack_path))
      // set results valid flag
      result.success = dir_exists && files_exist.every(x => x);
      if(result.success)
      {
          result = this.loadConfiguration(stack_path, overloaded_config_paths);
      }
      return result
    }

    isBuilt(stack_path: string)
    {
      const command = `${this.base_command} ${this.sub_commands["images"]}`;
      const args = []
      var flags = {
        filter: {shorthand: false, value: `reference=${this.imageName(stack_path)}`}
      }
      flags = this.addJSONFormatFlag(flags);
      var result = this.shell.output(command, flags, args, {}, "json")
      var isEmpty = obj => ((typeof obj === 'string') && (obj === "")) ||
        ((obj instanceof Array) && (obj.length == 0)) ||
        ((obj instanceof Object) && (Object.entries(obj).length === 0))
      return (result.success && !isEmpty(result.data)) ? true : false
    }

    build(stack_path: string, overloaded_config_paths: array<string> = [], nocache:boolean = false)
    {
      var result = this.validate(stack_path, overloaded_config_paths)
      if(result.success)
      {
          const build_object = result.data.buildObject()
          const command = `${this.base_command} ${this.sub_commands["build"]}`;
          const args = [build_object?.context || '.']
          var   flags = {
            "t": {value: this.imageName(stack_path), shorthand: true},
            "f": {value: path.join(stack_path, build_object.dockerfile || 'Dockerfile'), shorthand: true}
          }
          if(build_object["no_cache"] || nocache) flags["no-cache"] = {shorthand: false}
          this.argFlags(flags, build_object)
          result.output = this.shell.sync(command, flags, args, {cwd: stack_path})
      }
      return result;
    }

    private argFlags(flags, build_object)
    {
      const args = build_object?.args
      if(args) flags["build-arg"] = {
        shorthand: false,
        sanitize: false, // allow shell commands $()
        value: Object.keys(args).map(k => `${k}\\=${args[k]}`)
      }
    }

    removeImage(stack_path: string)
    {
      if(this.isBuilt(stack_path))
      {
          const command = `${this.base_command} ${this.sub_commands["remove"]}`;
          const args = [this.imageName(stack_path)]
          const flags = {}
          return new ValidatedOutput(true, this.shell.sync(command, flags, args, {cwd: stack_path}))
      }
      return new ValidatedOutput(true)
    }

    // Load stack_path/config.yml and any additional config files. The settings in the last file in the array has highest priorty
    // silently ignores files if they are not present

    loadConfiguration(stack_path: string, overloaded_config_paths: array<string> = [])
    {
      overloaded_config_paths.unshift(path.join(stack_path, "config.yml")) // always add stack config file first
      var configuration = new this.configuration_constructor()
      var result = overloaded_config_paths.reduce(
        (result, path) => {
          if(result) result = this.loadConfigurationFile(path)
          if(result) configuration.merge(result.data)
          return result
        },
        new ValidatedOutput(true)
      )

      return (result.success) ? new ValidatedOutput(true, configuration) : result
    }

    private loadConfigurationFile(file_path: string) // Determines if config file is valid
    {
        if(FileTools.existsFile(file_path))
        {
          try
          {
            const contents = yaml.safeLoad(fs.readFileSync(file_path, 'utf8')) || {} // allow blank files to pass validation
            const configuration = new this.configuration_constructor()
            const result = configuration.setRawObject(contents, path.dirname(file_path))
            return (result.success) ? new ValidatedOutput(true, configuration) : result
          }
          catch (error)
          {
            return new ValidatedOutput(false, null, [`Unable to parse yml in ${file_path}.\n${error}`])
          }
        }

        return new ValidatedOutput(true, {}); // exit silently if config files is not present
    }

    // Special function for reducing code repetition in Podman Driver Class

    private addJSONFormatFlag(flags)
    {
      flags["format"] = {shorthand: false, value: '{{json .}}'}
      return flags
    }

    // Overloaded Methods

    imageName(stack_path: string) // Docker only accepts lowercase image names
    {
      return super.imageName(stack_path).toLowerCase()
    }

}
