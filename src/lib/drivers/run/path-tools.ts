import * as path from 'path'

export class PathTools
{

  static split(path_str: string)
  {
    const re = new RegExp(`^${path.sep}|${path.sep}$`,"g")
    return path_str.replace(re, "").split(path.sep)
  }

  static join(path_arr: array<string>)
  {
    return path.join(...arguments)
  }

  static relativePathFromParent(parent: array<string>, child: array<string>)
  {
    if(PathTools.ischild(parent, child)) {
      return child.splice(parent.length, child.length - parent.length)
    }
    return false
  }

  static ischild(parent: array<string>, child: array<string>) // returns true of
  {
    if(child.length < parent.length) return false;
    for(var i = 0; i < parent.length; i ++)
    {
        if(parent[i] !== child[i]) return false;
    }
    return true;
  }

}
