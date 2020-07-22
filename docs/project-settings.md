Projects
================================================================================

The most convenient way to use cjr for developing and running code, is to start a project in the root directory of your project files. You can start a project by running the command
```console
$ cjr init
```
in the root directory of your project. In the same spirit as git, this creates a .cjr folder in the directory. If you use the default settings, then cjr will automatically set the flag `--project-root` whenever you working anywhere inside the project directory. My modifying the project configuration you can also set the default values of other flags that determines the stack, the stack directory, the resource, and profiles. We describe this in detail in the next section.


## Project Configurations

Within any project, the default values for the flags `--stack`, `--resource`, `--profile`, and `--stacks-dir` can be
configured by modifying the *project-settings.yml* file, located in the .cjr directory of a project's
root folder. Cjr will then automatically set specified defaults flag values  whenever it is called
from within the project root or its child directories. All automatically loaded values can be overridden
by manually specifying a flag in the command.

The project-settings.yml file is automatically created when running the command `cjr init` inside a directory. The settings for any project can viewed using 
```console
$ cjr pconfig:ls
```
The settings can be modified using the `pconfig` subcommands that all can be listed using 
```console
$ cjr pconfig --help
```

Specification for project-settings.yml
--------------------------------------------------------------------------------
The project-settings.yml file can be also be manually edited so long as it adheres to the following format. Note that all fields are optional.

```yaml
project-root: "auto",
stack: STRING,
visible-stacks: STRING_ARRAY,
stacks-dir: STRING,
resource: STRING
default-profiles: OBJECT_OF_STRINGARRAY
```
Each of the following settings will only be applied if cjr is called from within the project root folder.

### `project-root`: 'auto'

This field must be set to "auto". If this option is present, then cjr will automatically set the flag `--project-root` to the location of the project root folder.

**Note**: This behavior can be disabled by setting the cjr setting *auto-project-root* to false.

### `stack`: string

If this option is present, then cjr will automatically set the flag `--stack`.

### `visible-stacks`: string[]

If this option is specified then the `cjr:job` subcommands will only affect stacks whose absolute paths end with any of the values in the visible-stacks array.

### `stacks-dir`: string

If this option is specified then the default stacks directory will be overridden.

### `resource`: string

If this option is specified then cjr will automatically set the flag `--resource`.


### `default-profiles`: { [key:string] : [string] }

This field determines which profiles are automatically applied to a stack. The keys represent the profile name, and the values are patterns. If a stack path matches with the pattern then the profile will be applied to the stack.
For example, the configuration
```yaml
default-profiles: 
  test-profile:
  - "fedora"
  - "ubuntu"
```
will cause a profile named "test-profile" to activate for any stacks whose full stack path ends with "fedora" or "ubuntu". The keyword 'ALL' can be used if a profile should be applied to all stacks in the project directory.


Example File
------------

Below we show an example file with all settings applied:

```yaml
project-root: "auto",
stack: fedora,
visible-stacks: 
- "fedora"
- "ubuntu"
stacks-dir: "/path/to/stacks"
resource: "localhost"
default-profiles:
  profileA: 
    - "ALL"
  profileB: 
    - "fedora"
    - "ubuntu"
```

Profiles
---------

Project specific profiles can be stored in the directory .cjr/profiles found in a project's root directory. This is the first place that cjr will look for a profile that has been specified either by the `--profile` flag, or by the default-profile settings in *project-settings.yml*. To add profiles, you can either manually copy the config files into the project profile directory or you can use the command
```console
$ cjr pconfig:profile:add $PATH_TO_PROFILE_FILE
```

