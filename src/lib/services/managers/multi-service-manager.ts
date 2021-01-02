import { ValidatedOutput } from '../../validated-output';
import { ServiceIdentifier, ServiceInfo, ServiceOptions } from '../abstract/abstract-service';
import { GenericAbstractService } from "../abstract/generic-abstract-service";

type ServiceOrdering<K> = { start?: Array<K> , stop ?: Array<K>, ready ?: Array<K>}
type ServiceHooks<T> = { "post-start" ?: { [key in keyof T] : PostStartHook } }
type PostStartHook = ( x : ValidatedOutput<ServiceInfo> , identifier ?: ServiceIdentifier) => void

export class MultiServiceManager<T extends { [ key : string ] : GenericAbstractService}>
{
    services: { [key in keyof T] : GenericAbstractService }
    ordering: ServiceOrdering<keyof T>
    hooks: ServiceHooks<T>

    constructor(services: T, ordering: ServiceOrdering<keyof T> = {}, hooks: ServiceHooks<T> = {})
    {
        this.services = services
        this.ordering = ordering
        this.hooks = hooks
    }

    start(identifier: ServiceIdentifier,  options: { [ key in keyof T] : ServiceOptions } ) : { [key in keyof T] : ValidatedOutput<ServiceInfo> } // start new service
    {
        return this.serviceFunctionMap( (service: GenericAbstractService, key: keyof T) => service.start(identifier, options[key]), identifier, this.ordering.start, this.hooks["post-start"] )
    }

    stop(identifier?: ServiceIdentifier, copy?: { [ key in keyof T ] : boolean}) : { [key in keyof T] : ValidatedOutput<undefined> } // stop running services, or all services if identifier is empty
    {
        if(copy !== undefined)
            return this.serviceFunctionMap( (service: GenericAbstractService, key: keyof T) => service.stop(identifier, copy[key]), identifier, this.ordering.stop )
        else
            return this.serviceFunctionMap( (service: GenericAbstractService) => service.stop(identifier), identifier, this.ordering.stop )
    }
    
    list(identifier?: ServiceIdentifier) : { [key in keyof T] : ValidatedOutput<ServiceInfo[]> } // determine if service is ready to be accessed
    {
        return this.serviceFunctionMap( (service: GenericAbstractService) => service.list(identifier) ) // list information of runnign service, or all running services if identifier is empty
    }

    ready(identifier: ServiceIdentifier) : { [key in keyof T] : ValidatedOutput<{ output: string }> } // determine if services are ready to be accessed
    {
        return this.serviceFunctionMap( (service: GenericAbstractService) => service.ready(identifier) , identifier, this.ordering.ready )
    }

    protected serviceFunctionMap<VOT>(f : (service:GenericAbstractService, key: keyof T) => ValidatedOutput<VOT>, identifier ?: ServiceIdentifier, keys ?: Array<keyof T>, hooks ?: { [key in keyof T] : (result : ValidatedOutput<VOT>, identifier ?: ServiceIdentifier) => void } ) : { [key in keyof T] : ValidatedOutput<VOT> }
    {
        const result: { [key in keyof T] : ValidatedOutput<VOT> } = ( {} as { [key in keyof T] : ValidatedOutput<VOT> } ) // type cast is ok since fields will be filled in map
        
        // -- ensure ordered keys contains all keys -----------------------------
        const ordered_keys = (keys) ? keys : []
        ordered_keys.push( ... Object.keys(this.services).filter((key: keyof T) => ! ordered_keys.includes(key) ) )
        
        ordered_keys.map( (key: keyof T) => {
            const f_result = f(this.services[key], key)            
            result[key] = f_result
            if( hooks?.[key] !== undefined) hooks[key](f_result, identifier)
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