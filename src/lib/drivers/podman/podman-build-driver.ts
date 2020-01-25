import {DockerBuildDriver} from '../docker/docker-build-driver'
import {PodmanConfiguration} from '../../config/podman/podman-configuration'

// - types ---------------------------------------------------------------------
type Dictionary = {[key: string]: any}

export class PodmanBuildDriver extends DockerBuildDriver
{
    protected base_command = 'podman'
    protected json_output_format = "json"
    protected configuration_constructor = PodmanConfiguration // pointer to configuration class constructor

    protected addJSONFormatFlag(flags: Dictionary)
    {
      flags["format"] = {shorthand: false, value: 'json'}
      return flags
    }

}
