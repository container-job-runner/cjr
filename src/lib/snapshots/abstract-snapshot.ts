import chalk = require('chalk');
import { ContainerDrivers } from '../job-managers/abstract/job-manager';
import { ValidatedOutput } from '../validated-output';

export abstract class AbstractSnapshot
{
    container_drivers: ContainerDrivers
    verbose: boolean
    
    constructor(container_drivers: ContainerDrivers, verbose: boolean)
    {
        this.container_drivers = container_drivers;
        this.verbose = verbose;
    }
    
    // creates new snapshot
    abstract async snapshotFromJob( options : { "job-id" : string } ) : Promise<ValidatedOutput<undefined>>
    abstract async snapshotFromImage( options : { "image" : string } ) : Promise<ValidatedOutput<undefined>>
    
    // lists current snapshots   
    abstract async list( ... args: any ) : Promise<ValidatedOutput<String[]>>

    // set snapshot to current
    abstract async revert( options : { "tag" : string } ) : Promise<ValidatedOutput<undefined>>

    protected printStatusHeader(message: string, line_width:number = 80) {
        if(this.verbose) console.log(chalk`-- {bold ${message}} ${'-'.repeat(Math.max(0,line_width - message.length - 4))}`)
    }
}