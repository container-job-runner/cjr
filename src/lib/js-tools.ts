// =============================================================================
// JSTools : This class provides functions for general JS operations
// -- Properties ---------------------------------------------------------------
// -- Functions ----------------------------------------------------------------
// rMerge - recursively merges two objects
// isObject - determines if data is of Object type
// isArray - deteremines if data is of Array type
// =============================================================================

export class JSTools
{
  static rMerge(a, b)
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

  static rCopy(a)
  {
    return JSTools.rMerge({}, a)
  }

  static isObject(val) {
      return val instanceof Object;
  }

  static isArray(val) {
      return val instanceof Array;
  }

}
