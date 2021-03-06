import fs = require('fs')
import path = require('path')
import constants = require('../constants')
import { ValidatedOutput } from '../validated-output';
import { AbstractSnapshot } from './abstract-snapshot';
import { DockerStackConfiguration } from '../config/stacks/docker/docker-stack-configuration';
import chalk = require('chalk');

export class ArchiveSnapshot extends AbstractSnapshot
{

    ERROR_STRINGS = {
        "INVALID-TAG": chalk`{bold Invalid Tag } - image does not exist.`
    }

    async snapshotFromJob(options : { "job-id": string, "stack-path": string }) : Promise<ValidatedOutput<undefined>>
    {
        return this.snapshotGeneric(
            options["stack-path"], 
            (image: string) => this.container_drivers.runner.jobToImage(options["job-id"], image)
        )
    }

    async snapshotFromImage(options : { "image": string, "stack-path": string }) : Promise<ValidatedOutput<undefined>>
    {
        return this.snapshotGeneric(
            options["stack-path"], 
            (image: string) => {
                const stack_configuration = new DockerStackConfiguration()
                stack_configuration.setImage(options.image)
                return this.container_drivers.builder.tagImage(stack_configuration, image)
            }
        )
    }

    private snapshotGeneric(stack_path: string, createSnapshotImage: (image: string) => ValidatedOutput<any>) : ValidatedOutput<undefined>
    {
        const result = new ValidatedOutput(true, undefined)
        
        if(!stack_path)
            result.pushError('Cannot snapshot stack (stack_path is undefined)')
        
        // -- load stack -------------------------------------------------------
        const stack_configuration = new DockerStackConfiguration()
        result.absorb(
            stack_configuration.load(stack_path, [])
        )
        if(!result.success) return result
        
        const sc_time = stack_configuration.copy()
        sc_time.setTag(`${Date.now()}`)

        // -- create image snapshot --------------------------------------------
        this.printStatusHeader(`Creating ${sc_time.getImage()}`);
        result.absorb(createSnapshotImage(sc_time.getImage()))
        if(!result.success) return result
        
        // -- save image to tar.gz ---------------------------------------------
        this.printStatusHeader(`Saving ${sc_time.getImage()}`);
        const snapshot_path = constants.stackNewSnapshotPath(stack_path, sc_time.getTag())
        const stack_image_path = constants.stackArchiveImagePath(stack_path)

        result.absorb(
            this.container_drivers.builder.saveImage(sc_time, 
                {
                    path: snapshot_path,
                    compress: true
                }, 
                "inherit"
            )
        )
        if(!result.success) return result
    
        // -- update symlink to latest -----------------------------------------
        if( fs.existsSync(stack_image_path) ) 
            fs.unlinkSync(stack_image_path)
        
        fs.linkSync(snapshot_path, stack_image_path)

        // -- rebuild original stack -------------------------------------------
        this.printStatusHeader(`Updating ${stack_configuration.getImage()}`);
        this.container_drivers.builder.build(stack_configuration, "inherit", {"no-cache": true})
        
        return result
    }

    async revert(options : {"tag": string, "stack-path": string}) : Promise<ValidatedOutput<undefined>>
    {
        const result = new ValidatedOutput(true, undefined)
        const stack_image_path = constants.stackArchiveImagePath(options["stack-path"])
        const snapshot_path = constants.stackNewSnapshotPath(options["stack-path"], options.tag)
        
        // -- load stack -------------------------------------------------------
        const stack_configuration = new DockerStackConfiguration()
        result.absorb(
            stack_configuration.load(options["stack-path"], [])
        )
        if(!result.success) return result

        // -- exit if snapshot does not exist ----------------------------------
        if( ! fs.existsSync(snapshot_path) )
            return result.pushError(this.ERROR_STRINGS["INVALID-TAG"])

        // -- update symlinks --------------------------------------------------
        fs.unlinkSync(stack_image_path)
        fs.linkSync(snapshot_path, stack_image_path)

        // -- rebuild original stack -------------------------------------------
        this.printStatusHeader(`Loading Image`);
        this.container_drivers.builder.build(stack_configuration, "inherit", {"no-cache": true})

        return new ValidatedOutput(true, undefined)
    }

    async list(options : {"stack-path": string})
    {
        const snapshot_dir = path.join(options["stack-path"], constants.subdirectories.stack.snapshots) 
        return new ValidatedOutput(true, fs.readdirSync(snapshot_dir)
            .filter( (filename: string) => constants.isArchiveImageFilename(filename) )
            .map ( (filename: string) => constants.extractArchiveImageTag(filename) )
            .filter ( (filename:string) => filename )
        )
    }

}