import { ValidatedOutput } from '../../validated-output';
import { ServiceIdentifier, ServiceInfo, ServiceOptions } from '../abstract/abstract-service';
import { GenericAbstractService } from "../abstract/generic-abstract-service";

export class MultiServiceManager<T extends { [ key : string ] : GenericAbstractService}>
{
    services: { [key in keyof T] : GenericAbstractService }

    constructor(services: T)
    {
        this.services = services
    }

    start(identifier: ServiceIdentifier,  options: ServiceOptions) : { [key in keyof T] : ValidatedOutput<ServiceInfo> } // start new service
    {
        return this.serviceFunctionMap( (service: GenericAbstractService) => service.start(identifier, options) )
    }

    stop(identifier?: ServiceIdentifier, copy?: { [ key in keyof T ] : boolean}) : { [key in keyof T] : ValidatedOutput<undefined> } // stop running services, or all services if identifier is empty
    {
        if(copy !== undefined)
            return this.serviceFunctionMap( (service: GenericAbstractService, key: keyof T) => service.stop(identifier, copy[key]) )
        else
            return this.serviceFunctionMap( (service: GenericAbstractService) => service.stop(identifier) )
    }
    
    list(identifier?: ServiceIdentifier) : { [key in keyof T] : ValidatedOutput<ServiceInfo[]> } // determine if service is ready to be accessed
    {
        return this.serviceFunctionMap( (service: GenericAbstractService) => service.list(identifier) ) // list information of runnign service, or all running services if identifier is empty
    }

    ready(identifier: ServiceIdentifier) : { [key in keyof T] : ValidatedOutput<{ output: string }> } // determine if services are ready to be accessed
    {
        return this.serviceFunctionMap( (service: GenericAbstractService) => service.ready(identifier) )
    }

    protected serviceFunctionMap<VOT>(f : (service:GenericAbstractService, key: keyof T) => ValidatedOutput<VOT>) : { [key in keyof T] : ValidatedOutput<VOT> }
    {
        const result: { [key in keyof T] : ValidatedOutput<VOT> } = {} as { [key in keyof T] : ValidatedOutput<VOT> } // type cast is ok since fields will be filled in map
        
        Object.keys(this.services).map( (key: keyof T) => {
            const f_result = f(this.services[key], key)            
            result[key] = f_result
        })
        
        return result
    }

    success(result : { [key in keyof T] : ValidatedOutput<any> }) : boolean
    {
        let flag = true;        
        Object.keys(this.services).map(
            (key: keyof T) => {
                flag = flag && result[key].success
            }
        )
        return flag
    }

    value<VOT>(output : { [key in keyof T] : ValidatedOutput<VOT> }) : { [key in keyof T] : VOT }
    {
        const result: { [key in keyof T] : VOT } = {} as { [key in keyof T] : VOT } // type cast is ok since fields will be filled in map
        Object.keys(this.services).map( (key: keyof T) => {
            result[key] = output[key].value
        })
        return result
    }

    absorb(output : { [key in keyof T] : ValidatedOutput<any> }) : ValidatedOutput<undefined>
    {
        const result = new ValidatedOutput(true, undefined)
        Object.keys(this.services).map( (key: keyof T) => {
            result.absorb(output[key])
        })
        return result
    }

}