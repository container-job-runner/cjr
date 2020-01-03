// ===========================================================================
// Base Command: Abstract Class
// ===========================================================================

import * as fs from 'fs'
import * as path from 'path'
import {JSONFile} from './fileio/json-file'
import {StackCommand} from './stack-command'
import {cli_jobs_dir_name} from './constants'

export abstract class JobCommand extends StackCommand
{
  private const job_json = new JSONFile(
    path.join(this.config.dataDir, cli_jobs_dir_name), true)
}
