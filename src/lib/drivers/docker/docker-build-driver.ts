import * as fs from 'fs-extra'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as chalk from 'chalk'
import {BuildDriver} from '../abstract/build-driver'
import {ValidatedOutput} from '../../validated-output'
import {DockerConfiguration} from '../../config/docker/docker-configuration'
import {FileTools} from '../../fileio/file-tools'
import {YMLFile} from '../../fileio/yml-file'

// - types ---------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export class DockerBuildDriver extends BuildDriver
{
    protected base_command = 'docker'
    protected sub_commands = {
      build: "build",
      images: "images",
      remove: "rmi"
    }
    protected configuration_constructor = DockerConfiguration // pointer to configuration class constructor
    protected json_output_format = "line_json"
    protected default_config_name = "config.yml"

    protected ERRORSTRINGS = {
      "MISSING_DOCKERFILE": (dir: string) => chalk`{bold Stack is Missing Dockerfile.}\n  {italic path:} ${dir}`,
      "MISSING_STACKDIR": (dir: string) => chalk`{bold Nonexistant Stack.}\n  {italic path:} ${dir}`,
      "YML_ERROR": (path: string, error: string) => chalk`{bold Unable to Parse YML.}\n  {italic  path:} ${path}\n  {italic error:} ${error}`
    }

    validate(stack_path: string, overloaded_config_paths: Array<string> = [])
    {
      var result = new ValidatedOutput(true);
      // check stack_path is a directory
      if(!FileTools.existsDir(stack_path))
        result.pushError(this.ERRORSTRINGS["MISSING_STACKDIR"](stack_path));
      // check that the Dockerfile is present
      if(!FileTools.existsDir(path.join(stack_path, 'Dockerfile')))
        result.pushError(this.ERRORSTRINGS["MISSING_DOCKERFILE"](stack_path));
      // set results valid flag
      if(result.success)
        result = this.loadConfiguration(stack_path, overloaded_config_paths);

      return result
    }

    isBuilt(stack_path: string)
    {
      const command = `${this.base_command} ${this.sub_commands["images"]}`;
      const args:Array<string> = []
      var flags:Dictionary = {
        filter: {shorthand: false, value: `reference=${this.imageName(stack_path)}`}
      }
      flags = this.addJSONFormatFlag(flags);
      var result = this.shell.output(command, flags, args, {}, this.json_output_format)
      return (result.success && result.data) ? true : false
      // var isEmpty = (obj:any) => ((typeof obj === 'string') && (obj === "")) ||
      //   ((obj instanceof Array) && (obj.length == 0)) ||
      //   ((obj instanceof Object) && (Object.entries(obj).length === 0))
      // return (result.success && !isEmpty(result.data)) ? true : false
    }

    build(stack_path: string, overloaded_config_paths: Array<string> = [], nocache?:boolean)
    {
      var result = this.validate(stack_path, overloaded_config_paths)
      if(result.success)
      {
          const build_object:Dictionary = result.data.buildObject()
          const command = `${this.base_command} ${this.sub_commands["build"]}`;
          const args = [build_object?.context || '.']
          var   flags:Dictionary = {
            "t": {value: this.imageName(stack_path), shorthand: true},
            "f": {value: path.join(build_object.dockerfile || 'Dockerfile'), shorthand: true}
          }
          if(build_object["no_cache"] || nocache) flags["no-cache"] = {shorthand: false}
          this.argFlags(flags, build_object)
          result.data = this.shell.sync(command, flags, args, {cwd: stack_path})
      }
      return result;
    }

    protected argFlags(flags:Dictionary, build_object:Dictionary)
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

    loadConfiguration(stack_path: string, overloaded_config_paths: Array<string> = [])
    {
      overloaded_config_paths.unshift(path.join(stack_path, this.default_config_name)) // always add stack config file first
      var configuration = new this.configuration_constructor()
      var result = overloaded_config_paths.reduce(
        (result: ValidatedOutput, path: string) => {
          if(result.success) result = this.loadConfigurationFile(path)
          if(result.success) configuration.merge(result.data)
          return result
        },
        new ValidatedOutput(true)
      )

      return (result.success) ? new ValidatedOutput(true, configuration) : result
    }

    protected loadConfigurationFile(file_path: string) // Determines if config file is valid
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
          configuration.setRawObject({}, "")
        }

        return new ValidatedOutput(true, configuration); // exit silently if config files is not present
    }

    copy(stack_path: string, new_stack_path: string, configuration: Dictionary|boolean = false)
    {
      try
      {
        fs.copySync(stack_path, new_stack_path)
        if(configuration !== false) {
           const writer = new YMLFile(new_stack_path, true);
           return writer.write(this.default_config_name, configuration)
        }
        return new ValidatedOutput(true)
      }
      catch(e)
      {
        return new ValidatedOutput(false, e)
      }
    }

    // Special function for reducing code repetition in Podman Driver Class

    protected addJSONFormatFlag(flags: Dictionary)
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
