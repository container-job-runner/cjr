import * as fs from 'fs-extra'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as chalk from 'chalk'
import {BuildDriver} from '../abstract/build-driver'
import {ValidatedOutput} from '../../validated-output'
import {DockerConfiguration} from '../../config/docker/docker-configuration'
import {FileTools} from '../../fileio/file-tools'
import {YMLFile} from '../../fileio/yml-file'

export class DockerBuildDriver extends BuildDriver
{
    private base_command = 'docker'
    private sub_commands = {
      build: "build",
      images: "images",
      remove: "rmi"
    }
    private configuration_constructor = DockerConfiguration // pointer to configuration class constructor
    private json_output_format = "line_json"
    private default_config_name = "config.yml"

    private ERRORSTRINGS = {
      "MISSING_DOCKERFILE": (dir) => chalk`{bold Stack is Missing Dockerfile.}\n  {italic path:} ${dir}`,
      "MISSING_STACKDIR": (dir) => chalk`{bold Nonexistant Stack.}\n  {italic path:} ${dir}`,
      "YML_ERROR": (path, error) => chalk`{bold Unable to Parse YML.}\n  {italic  path:} ${path}\n  {italic error:} ${error}`
    }

    validate(stack_path: string, overloaded_config_paths: array<string> = [])
    {
      var result = new ValidatedOutput();
      // check stack_path is a directory
      const dir_exists = FileTools.existsDir(stack_path)
      if(!dir_exists) result.pushError(this.ERRORSTRINGS["MISSING_STACKDIR"](stack_path))
      // check that required files are present
      const required_files = ['Dockerfile'];
      const files_exist = required_files.map(
        file => fs.existsSync(path.join(stack_path, file))
      )
      if(!files_exist[0]) result.pushError(this.ERRORSTRINGS["MISSING_DOCKERFILE"](stack_path))
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
      var result = this.shell.output(command, flags, args, {}, this.json_output_format)
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
            "f": {value: path.join(build_object.dockerfile || 'Dockerfile'), shorthand: true}
          }
          if(build_object["no_cache"] || nocache) flags["no-cache"] = {shorthand: false}
          this.argFlags(flags, build_object)
          result.data = this.shell.sync(command, flags, args, {cwd: stack_path})
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
      overloaded_config_paths.unshift(path.join(stack_path, this.default_config_name)) // always add stack config file first
      var configuration = new this.configuration_constructor()
      var result = overloaded_config_paths.reduce(
        (result, path) => {
          if(result.success) result = this.loadConfigurationFile(path)
          if(result.success) configuration.merge(result.data)
          return result
        },
        new ValidatedOutput(true)
      )

      return (result.success) ? new ValidatedOutput(true, configuration) : result
    }

    private loadConfigurationFile(file_path: string) // Determines if config file is valid
    {
        const configuration = new this.configuration_constructor()
        if(FileTools.existsFile(file_path))
        {
          try
          {
            const contents = yaml.safeLoad(fs.readFileSync(file_path, 'utf8')) || {} // allow blank files to pass validation
            const result = configuration.setRawObject(contents, path.dirname(file_path))
            return (result.success) ? new ValidatedOutput(true, configuration) : result
          }
          catch (error)
          {
            return new ValidatedOutput(false, null, [this.ERRORSTRINGS.YML_ERROR(file_path, error)])
          }
        }
        else
        {
          configuration.setRawObject({})
        }

        return new ValidatedOutput(true, configuration); // exit silently if config files is not present
    }

    copy(stack_path: string, new_stack_path: string, configuration: object|boolean = false)
    {
      try
      {
        fs.copySync(stack_path, new_stack_path)
        if(configuration !== false) {
           const writer = new YMLFile(new_stack_path, true);
           return writer.write(this.default_config_name, configuration)
        }
      }
      catch(e)
      {
        return new ValidatedOutput(false, e)
      }
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
