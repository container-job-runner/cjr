import * as chalk from 'chalk'


export const ErrorStrings = {
    CONFIG:{
      NON_EXISTANT_BIND_HOSTPATH : (hostPath) => chalk`{bold Invalid Stack Configuration} - bind mount contains nonexistant host path.\n  {italic hostPath}: ${hostPath}`
    }
}

ErrorStrings.CONFIG.NON_EXISTANT_STACK
