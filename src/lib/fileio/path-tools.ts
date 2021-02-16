import * as path from 'path'

export class PathTools
{

  static split(path_str: string)
  {
    const re = new RegExp(`^${path.sep}|${path.sep}$`,"g")
    return path_str.replace(re, "").split(path.sep)
  }

  static join(path_arr: Array<string>)
  {
    return path.join(...path_arr)
  }

  static relativePathFromParent(parent: Array<string>, child: Array<string>)
  {
    if(PathTools.ischild(parent, child)) {
      return child.splice(parent.length, child.length - parent.length)
    }
    return false
  }

  static ischild(parent: Array<string>, child: Array<string>, strict_subchild: boolean = false) // returns true of
  {
    if(strict_subchild && child.length <= parent.length) return false
    if(child.length < parent.length) return false;
    for(var i = 0; i < parent.length; i ++)
    {
        if(parent[i] !== child[i]) return false;
    }
    return true;
  }

  static addTrailingSeparator(path_str: string, type?:"posix"|"win32")
  {
    if(type !== undefined)
      return (path_str.endsWith(path[type].sep)) ? path_str : `${path_str}${path[type].sep}`
    else
      return (path_str.endsWith(path.sep)) ? path_str : `${path_str}${path.sep}`
  }

  static removeTrailingSeparator(path_str: string, type?:"posix"|"win32")
  {
    if(type !== undefined)
      return (path_str.length > 1 && path_str.endsWith(path[type].sep)) ? path_str.slice(0, -1) : path_str
    else
      return (path_str.length > 1 && path_str.endsWith(path.sep)) ? path_str.slice(0, -1) : path_str
  }

}
