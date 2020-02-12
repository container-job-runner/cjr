import * as path from 'path'

export const default_remote_config    = {}
export const remote_config_filename   = "remote-config"
export const remote_keys_dir_name     = "keys"
export const remote_sshsocket_dirname = 'ssh-sockets'     // sockets for ssh multiplex
export const default_remote_storage_dirname = '$HOME'        // location where remote data folder will be created
export const remote_storage_basename  = '.cjr-remote-data'  // name of remote data folder
export const remoteStoragePath        = (dirname: string) => path.posix.join(dirname, remote_storage_basename)
