import {DockerBuildDriver} from './docker-build-driver'

export class BuildahBuildDriver extends DockerBuildDriver
{
    private base_command = 'buildah'
    private sub_commands = {
      build: "bud",
      images: "images",
      remove: "rmi"
    }
}
