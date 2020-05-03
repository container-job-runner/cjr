import { JobConfiguration } from './job-configuration'
import { DockerStackConfiguration} from '../stacks/docker/docker-stack-configuration';

export class DockerJobConfiguration extends JobConfiguration<DockerStackConfiguration> { }
