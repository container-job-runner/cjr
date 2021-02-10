import constants = require('../constants')
import axios from 'axios'
import { DockerRegistryAuthConfig, DockerRegistryStackSnapshotOptions, DockerStackConfiguration } from '../config/stacks/docker/docker-stack-configuration';
import { ValidatedOutput } from '../validated-output';
import { AbstractSnapshot } from './abstract-snapshot';
import chalk = require('chalk');

export class RegistrySnapshot extends AbstractSnapshot
{

    ERROR_STRINGS = {
        "FAILED-REQUEST": chalk`{bold Failed to connect with container registry }.`,
        "LIST": {
            "INVALID-REGISTRY": chalk`{bold Invalid Registry.} list is only available for images on Dockerhub.`
        }
    }

    async snapshotFromJob(options : { "job-id": string, "registry-options": DockerRegistryStackSnapshotOptions}) : Promise<ValidatedOutput<undefined>>
    {
        return this.snapshotGeneric(
            options["registry-options"],
            (image: string) => this.container_drivers.runner.jobToImage(options["job-id"], image)
        )
    }

    async snapshotFromImage(options : { "image": string, "registry-options": DockerRegistryStackSnapshotOptions}) : Promise<ValidatedOutput<undefined>>
    {
        return this.snapshotGeneric(
            options["registry-options"],
            (image: string) => {
                const stack_configuration = new DockerStackConfiguration()
                stack_configuration.setImage(options.image)
                return this.container_drivers.builder.tagImage(stack_configuration, image)
            }
        )
    }

    private snapshotGeneric(registry_options: DockerRegistryStackSnapshotOptions, createSnapshotImage: (image: string) => ValidatedOutput<any>) : ValidatedOutput<undefined>
    {
        const result = new ValidatedOutput(true, undefined)
        
        const sc_time = new DockerStackConfiguration()
        sc_time.setImage(`${registry_options.auth.username}/${registry_options.repository}`)
        sc_time.setTag(`${Date.now()}`)
        
        const sc_latest = sc_time.copy() // Note: image does not yet exist at this point
        sc_latest.setTag(`${constants.SNAPSHOT_LATEST_TAG}`)

        // -- create snapshot image --------------------------------------------
        this.printStatusHeader(`Creating ${sc_time.getImage()}`);
        result.absorb(createSnapshotImage(sc_time.getImage()))
        if(!result.success) return result
        
        // -- push image -------------------------------------------------------
        this.printStatusHeader(`Pushing ${sc_time.getImage()}`);
        result.absorb(this.container_drivers.builder.pushImage(sc_time, registry_options.auth, "inherit"))
        if(!result.success) return result
        
        // -- update latest tag ------------------------------------------------
        this.printStatusHeader(`Updating ${sc_latest.getImage()}`);
        result.absorb(this.container_drivers.builder.tagImage(sc_time, sc_latest.getImage()))
        if(!result.success) return result
        
        result.absorb(this.container_drivers.builder.pushImage(sc_latest, registry_options.auth, "inherit"))
        return result
    }

    async revert(options : {"tag": string, "registry-options": DockerRegistryStackSnapshotOptions}) : Promise<ValidatedOutput<undefined>>
    {
        const result = new ValidatedOutput(true, undefined)
        
        const snapshot = new DockerStackConfiguration();
        snapshot.setImage(`${options["registry-options"].auth.username}/${options["registry-options"].repository}`)
        snapshot.setTag(options.tag)

        const sc_latest = snapshot.copy()
        sc_latest.setTag(`${constants.SNAPSHOT_LATEST_TAG}`)

        // -- pull snapshot ----------------------------------------------------
        this.printStatusHeader(`Pulling ${snapshot.getImage()}`);
        const build_result = this.container_drivers.builder.build(snapshot, "pipe", {"no-cache": true, "pull": true});
        if( ! build_result.success ) return result.absorb(build_result)

        // -- retag to latest --------------------------------------------------
        this.printStatusHeader(`Updating ${sc_latest.getImage()}`);
        result.absorb(
            this.container_drivers.builder.tagImage(snapshot, sc_latest.getImage())
        )
        if ( ! result.success ) return result
        
        // -- repush latest ----------------------------------------------------
        this.printStatusHeader(`Pushing ${sc_latest.getImage()}`);
        result.absorb(
            this.container_drivers.builder.pushImage(sc_latest, options["registry-options"].auth, "inherit")
        )
        return result;
    }

    async list(options : {"registry-options": DockerRegistryStackSnapshotOptions}) // https://www.twilio.com/blog/5-ways-to-make-http-requests-in-node-js-using-async-await
    {
        if ( options["registry-options"].auth.server !== "https://index.docker.io/v1/" )
            return new ValidatedOutput(true, []).pushError(this.ERROR_STRINGS.LIST["INVALID-REGISTRY"])
        
        const repository = `${options['registry-options'].auth.username}/${options["registry-options"].repository}`
        const auth = options["registry-options"].auth
        return await this.tags(repository, auth)
    }

    // == Docker API functions ================================================

    // Queries Dockerhub API v2 and extracts tags for a repository.
    // If token is used, then this can also look at private repositories
    // https://hub.docker.com/support/doc/how-do-i-authenticate-with-the-v2-api

    private async tags(repository: string, auth: DockerRegistryAuthConfig) : Promise<ValidatedOutput<string[]>>
    {
        const token = await this.requestToken_APIV2(auth) // if we add a public property for the image, we can skip the token
        if( ! token.success ) return new ValidatedOutput(false, [])
        return this.requestTags_APIV2(repository, token.value)
    }
    
    private async requestToken_APIV2(auth : DockerRegistryAuthConfig) : Promise<ValidatedOutput<string>>
    {
        try { 
            const token_response = await axios.post('https://hub.docker.com/v2/users/login/', {
                "username": auth.username,
                "password": auth.token
            })
            return new ValidatedOutput(true, token_response.data.token as string)
        }
        catch( error ) {
            return new ValidatedOutput(false, "")
        }
    }

    private async requestTags_APIV2(repository: string, token?: string) : Promise<ValidatedOutput<string[]>>
    {
        try {
            
            const options = (token === undefined) ? {} : {headers: {"Authorization" : `JWT ${token}`}}
            const token_response = await axios.get(`https://hub.docker.com/v2/repositories/${repository}/tags/`, options)
            return new ValidatedOutput(true, token_response.data.results
                .map((d:constants.Dictionary) => d.name)
                .filter((s:string) => /^\d+$/.test(s))
                .sort()  as string[]
            )            
        }
        catch( error ) {
            return new ValidatedOutput(false, [])
        }
    }

    // Queries Dockerhub API v1 and extracts tags for a repository.
    // This endpoint does not require Auth and only works for public repositories
    
    private async tags_APIV1(repository: string) : Promise<ValidatedOutput<string[]>>
    {
        try { 
            const token_response = await axios.get(`https://registry.hub.docker.com/v1/repositories/${repository}/tags`)
            const data = token_response.data
            return new ValidatedOutput(true, data.map((d:constants.Dictionary) => d.name).filter((s:string) => /^\d+$/.test(s)) as string[])
        }
        catch( error ) {
            return new ValidatedOutput(false, []).pushError(this.ERROR_STRINGS["FAILED-REQUEST"])
        }   
    }

}