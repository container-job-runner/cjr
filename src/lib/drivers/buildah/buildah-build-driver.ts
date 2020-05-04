import { DockerCliBuildDriver } from '../docker/docker-cli-build-driver'

export class BuildahBuildDriver extends DockerCliBuildDriver
{
    protected base_command = 'buildah'
    protected sub_commands = {
      build: "bud",
      images: "images",
      remove: "rmi"
    }
}
