import { DockerBuildDriver } from '../docker/docker-cli-build-driver'
import { parseJSON } from '../../functions/misc-functions'
import { DockerStackConfiguration } from '../../config/stacks/docker/docker-stack-configuration'

// - types ---------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export class PodmanBuildDriver extends DockerBuildDriver
{
    protected base_command = 'podman'
    protected outputParser = parseJSON

    isBuilt(configuration:DockerStackConfiguration)
    {
      const image_name = configuration.getImage()
      const command = `${this.base_command} images`;
      const args:Array<string> = []
      const flags:Dictionary = {
        filter: `reference=${image_name}`
      }
      this.addJSONFormatFlag(flags);
      var result = this.outputParser(this.shell.output(command, flags, args, {}))
      if(!result.success) return false
      // extra logic since podman images --reference=name:tag is equivalent to docker images --reference=*name:tag
      return result.value.some((image_data:Dictionary) =>
        image_data.names.some((name: string) =>
          (new RegExp(`/${image_name}$`)).test(name)))
    }

    protected addJSONFormatFlag(flags: Dictionary)
    {
      flags["format"] = {shorthand: false, value: 'json'}
      return flags
    }

}
