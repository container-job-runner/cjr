export const DefaultContainerRoot = "/"                                         // Note: though may lead to collisions, this choice always works with docker cp which does not create subfolders.
export const JUPYTER_JOB_NAME = (image_name) => `${image_name}_jupyter`.replace(/[^a-zA-Z0-9_.-]/g,"") 
