import {DockerBuildDriver} from '../docker/docker-build-driver'
import {PodmanStackConfiguration} from '../../config/stacks/podman/podman-stack-configuration'

// - types ---------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export class PodmanBuildDriver extends DockerBuildDriver
{
    protected base_command = 'podman'
    protected json_output_format = "json"
    protected configuration_constructor = PodmanStackConfiguration // pointer to configuration class constructor

    isBuilt(stack_path: string)
    {
      const command = `${this.base_command} images`;
      const args:Array<string> = []
      const flags:Dictionary = {
        filter: `reference=${this.imageName(stack_path)}`
      }
      this.addJSONFormatFlag(flags);
      var result = this.shell.output(command, flags, args, {}, this.json_output_format)
      if(!result.success) return false
      // extra logic since podman images --reference=name:tag is equivalent to docker images --reference=*name:tag
      return result.data.some((image_data:Dictionary) =>
        image_data.names.some((name: string) =>
          (new RegExp(`/${this.imageName(stack_path)}$`)).test(name)))
    }

    protected addJSONFormatFlag(flags: Dictionary)
    {
      flags["format"] = {shorthand: false, value: 'json'}
      return flags
    }

    emptyConfiguration()
    {
      return new PodmanStackConfiguration()
    }

}
