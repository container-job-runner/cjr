import { ValidatedOutput } from '../../validated-output';
import { ServiceIdentifier, ServiceInfo, ServiceOptions } from '../abstract/AbstractService';
import { GenericAbstractService } from "../abstract/GenericAbstractService";

export class MultiServiceManager<T extends { [ key : string ] : GenericAbstractService}>
{
    services: { [key in keyof T] : GenericAbstractService }

    constructor(services: T)
    {
        this.services = services
    }

    start(identifier: ServiceIdentifier,  options: ServiceOptions) : ValidatedOutput<{ [key in keyof T] : ServiceInfo }> // start new service
    {
        return this.serviceFunctionMap( (service: GenericAbstractService) => service.start(identifier, options) )
    }

    stop(identifier?: ServiceIdentifier, copy?: { [ key in keyof T ] : boolean}) : ValidatedOutput<{ [key in keyof T] : undefined }> // stop running services, or all services if identifier is empty
    {
        if(copy !== undefined)
            return this.serviceFunctionMap( (service: GenericAbstractService, key: keyof T) => service.stop(identifier, copy[key]) )
        else
            return this.serviceFunctionMap( (service: GenericAbstractService) => service.stop(identifier) )
    }
    
    list(identifier?: ServiceIdentifier) : ValidatedOutput<{ [key in keyof T] : ServiceInfo[] }> // determine if service is ready to be accessed
    {
        return this.serviceFunctionMap( (service: GenericAbstractService) => service.list(identifier) ) // list information of runnign service, or all running services if identifier is empty
    }

    ready(identifier: ServiceIdentifier) : ValidatedOutput<{ [key in keyof T] : { output: string } }> // determine if services are ready to be accessed
    {
        return this.serviceFunctionMap( (service: GenericAbstractService) => service.ready(identifier) )
    }

    protected serviceFunctionMap<VOT>(f : (service:GenericAbstractService, key: keyof T) => ValidatedOutput<VOT>, identifier ?: ServiceIdentifier) : ValidatedOutput<{ [key in keyof T] : VOT }>
    {
        const value: { [key in keyof T] : VOT } = {} as { [key in keyof T] : VOT } // type cast is ok since fields will be filled in map
        const result = new ValidatedOutput(true, value)

        Object.keys(this.services).map( (key: keyof T) => {
            const f_result = f(this.services[key], key)            
            result.absorb(f_result)
            value[key] = f_result.value
        })
        
        return result
    }

}