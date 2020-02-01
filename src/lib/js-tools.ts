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

  static oSubset(a: Dictionary, props: Array<string>)
  {
    const b:Dictionary = {}
    for(var i = 0; i <= props.length; i ++)
    {
      var p = props[i]
      if(a.hasOwnProperty(p)) b[p] = a[p]
    }
    return b;
  }

  static randomString(n:number, alphabet:string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
  {
    const s = new Array<String>(n)
    const l = alphabet.length
    for(var i = 0; i < n; i ++)  {
        s[i] = alphabet[Math.floor(l * Math.random())]
    }
    return s.join("")
  }

  static isObject(val: any) {
      return val instanceof Object;
  }

  static isArray(val: any) {
      return val instanceof Array;
  }

  static isEmpty(val: any) {
     return ((typeof val === 'string') && (val === "")) ||
     ((val instanceof Array) && (val.length == 0)) ||
     ((val instanceof Object) && (Object.entries(val).length === 0)) ||
     (!val)
  }

  static clipAndPad (s:string, clip_width: number, final_width: number, silent_clip: boolean) {
    if(s.length > clip_width)  s = (silent_clip) ? s.substring(0, clip_width) : `${s.substring(0, clip_width - 3)}...`
    if(s.length < final_width) s += " ".repeat(final_width - s.length)
    return s
  }

}
