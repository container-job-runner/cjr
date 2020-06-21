import { ValidatedOutput } from '../validated-output';
import { SyncManager } from './sync-manager';

export class VolumeSyncManager extends SyncManager
{
    copyToHost( ... args: any ) : ValidatedOutput<undefined>
    {
        return new ValidatedOutput(false, undefined);
    }

    copyFromHost( ... args: any ) : ValidatedOutput<undefined>
    {
        return new ValidatedOutput(false, undefined);
    }
}