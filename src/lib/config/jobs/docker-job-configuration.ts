import { JobConfiguration } from './job-configuration'
import { DockerStackConfiguration} from '../stacks/docker/docker-stack-configuration';
import { JSTools } from '../../js-tools';

export class DockerJobConfiguration extends JobConfiguration<DockerStackConfiguration> { 

    copy() : DockerJobConfiguration
    {
        return new DockerJobConfiguration(
        this.stack_configuration.copy(),
        {
            command: this.command, 
            synchronous: this.synchronous, 
            remove_on_exit: this.remove_on_exit, 
            working_directory: this.working_directory, 
            labels: JSTools.rCopy(this.labels)
        }
    )
    }

}
