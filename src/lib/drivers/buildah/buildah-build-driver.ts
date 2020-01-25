import {DockerBuildDriver} from '../docker/docker-build-driver'

export class BuildahBuildDriver extends DockerBuildDriver
{
    protected base_command = 'buildah'
    protected sub_commands = {
      build: "bud",
      images: "images",
      remove: "rmi"
    }
}
