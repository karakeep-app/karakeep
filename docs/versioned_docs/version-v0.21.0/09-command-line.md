# Command Line Tool (CLI)

Hoarder comes with a simple CLI for those users who want to do more advanced manipulation.

## Features

- Manipulate bookmarks, lists and tags
- Mass import/export of bookmarks

## Installation (NPM)

```
npm install -g @hoarderapp/cli
```


## Installation (Docker)

```
docker run --rm ghcr.io/hoarder-app/hoarder-cli:release --help
```

## Usage

```
hoarder
```

```
Usage: hoarder [options] [command]

A CLI interface to interact with the hoarder api

Options:
  --api-key <key>       the API key to interact with the API (env: HOARDER_API_KEY)
  --server-addr <addr>  the address of the server to connect to (env: HOARDER_SERVER_ADDR)
  -V, --version         output the version number
  -h, --help            display help for command

Commands:
  bookmarks             manipulating bookmarks
  lists                 manipulating lists
  tags                  manipulating tags
  whoami                returns info about the owner of this API key
  help [command]        display help for command
```

And some of the subcommands:

```
hoarder bookmarks
```

```
Usage: hoarder bookmarks [options] [command]

Manipulating bookmarks

Options:
  -h, --help             display help for command

Commands:
  add [options]          creates a new bookmark
  get <id>               fetch information about a bookmark
  update [options] <id>  updates bookmark
  list [options]         list all bookmarks
  delete <id>            delete a bookmark
  help [command]         display help for command

```

```
hoarder lists
```

```
Usage: hoarder lists [options] [command]

Manipulating lists

Options:
  -h, --help                 display help for command

Commands:
  list                       lists all lists
  delete <id>                deletes a list
  add-bookmark [options]     add a bookmark to list
  remove-bookmark [options]  remove a bookmark from list
  help [command]             display help for command
```

## Optaining an API Key

To use the CLI, you'll need to get an API key from your hoarder settings. You can validate that it's working by running:

```
hoarder --api-key <key> --server-addr <addr> whoami
```

For example:

```
hoarder --api-key mysupersecretkey --server-addr https://try.hoarder.app whoami
{
  id: 'j29gnbzxxd01q74j2lu88tnb',
  name: 'Test User',
  email: 'test@gmail.com'
}
```
