// =============================================================================
// JSTools : This class provides functions for general JS operations
// -- Properties ---------------------------------------------------------------
// -- Functions ----------------------------------------------------------------
// rMerge - recursively merges two objects
// isObject - determines if data is of Object type
// isArray - deteremines if data is of Array type
// =============================================================================

type Dictionary = {[key: string]: any}

export class JSTools
{
  static rMerge(a: Dictionary, b: Dictionary)
  {
    if(JSTools.isObject(a) && JSTools.isObject(b))
    {
      for (const key in b)
      {
          a[key] = JSTools.rMerge(a[key], b[key])
      }
      return a;
    }
    else
    {
      return b;
    }
  }

  static rCopy(a: Dictionary)
  {
    return JSTools.rMerge({}, a)
  }

  static isObject(val: any) {
      return val instanceof Object;
  }

  static isArray(val: any) {
      return val instanceof Array;
  }

}
