import {DockerBuildDriver} from '../docker/docker-build-driver'
import {PodmanConfiguration} from '../../config/podman/podman-configuration'

export class PodmanBuildDriver extends DockerBuildDriver
{
    private base_command = 'podman'
    private json_output_format = "json"
    private configuration_constructor = PodmanConfiguration // pointer to configuration class constructor

    private addJSONFormatFlag(flags)
    {
      flags["format"] = {shorthand: false, value: 'json'}
      return flags
    }

}
