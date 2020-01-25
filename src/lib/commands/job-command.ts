// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as path from 'path'
import {JSONFile} from '../fileio/json-file'
import {StackCommand} from './stack-command'
import {cli_jobs_dir_name} from '../constants'

export type Dictionary = {[key: string]: any}
export abstract class JobCommand extends StackCommand
{
  protected job_json = new JSONFile(
    path.join(this.config.dataDir, cli_jobs_dir_name), true)
}
