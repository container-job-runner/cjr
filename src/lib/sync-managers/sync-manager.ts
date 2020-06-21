import { ValidatedOutput } from '../validated-output';

export abstract class SyncManager
{
    abstract copyToHost( ... args: any ) : ValidatedOutput<undefined>
    abstract copyFromHost( ... args: any ) : ValidatedOutput<undefined>
}