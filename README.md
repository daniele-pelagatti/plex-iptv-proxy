# Plex IPTV Proxy

> A software application that acts as a bridge between an IPTV (Internet Protocol Television) provider and a Plex media server.

## Introduction

This project allows users to specify multiple IPTV m3u8 playlists, generates an EPG (Electronic Program Guide) for each channel and makes the result available to a Plex media server.

## Features

* Retrieves and aggregates multiple M3U8 Playlists, extracts all channels (tracks) and test them individually using ffprobe to see if they are valid.
* Retrieves and aggregates EPG data from multiple EPG Sources and builds a tailor-made EPG for valid channels. 
* Tries to keep channel numbering consistent with what's indicated in the M3U8 playlists (if any channel numbering is indicated).
* Streams video content to Plex Media Server using FFmpeg, optionally transcoding unsupported audio.
* Supports generating an XMLTV EPG for Rakuten channels using their public JSON API 
* Supports configuration options for server port, tuner count, transcode audio, and more.


## Requirements

* FFmpeg (version 4 or higher)

That's it, nodejs (v20 or higher) is not strictly required because the installation process (see below) will download and install the appropriate node.js version in the installation folder

## Configuration
> :warning: please complete the configuration before installing as a systemd service (see below)

The configuration of Plex IPTV Proxy is done through a JSON file located at `data/config.json`. 

The configuration schema is defined using Zod and is as follows:

* iptvPlaylists: An array of strings representing the URLs of the IPTV playlists to use.
* epgSources: An array of strings representing URLs of EPGs to use for generating the aggregate EPG data.
* server: An object with the following properties:
  * port: The port on which the Plex IPTV Proxy server will listen for incoming requests. (optional, defaults to `26457`)
  * tunerCount: The number of tuners to use for streaming. (optional, defaults to `4`)
  * transcodeAudio: An array of audio codecs that will be transcoded on the fly into `AAC-LP` before being sent to plex, each object has the following properties:
    * codec: The audio codec name.
    * profile: The (optional) profile of the unsupported audio codec.
* rakutenEpg: Allows to generate a Rakuten TV EPG from their public JSON API. An object with the following properties:
  * enabled: A boolean indicating whether to enable Rakuten EPG support.
  * classification_id: The classification ID to use for Rakuten EPG. (see [screenshot](docs/rakuten-params.png) for instructions on how to retrieve this data for your country)
  * locale: The locale to use for Rakuten EPG. (see [screenshot](docs/rakuten-params.png) for instructions on how to retrieve this data for your country)
  * market_code: The market code to use for Rakuten EPG. (see [screenshot](docs/rakuten-params.png) for instructions on how to retrieve this data for your country)

Here's an example configuration:

```json
{
  "server": {
    "port": 55555,
    "tunerCount": 4,
    "transcodeAudio": [
      {
        "codec": "aac",
        "profile": "HE-AAC"
      }
    ]
  },
  "iptvPlaylists": [
    "http://example.com/playlist.m3u8",
    "http://example2.com/playlist.m3u8"
  ],
  "epgSources": [
    "https://example.com/foo.xml.gz",
    "https://example2.com/bar.xml"
  ],
  "rakutenEpg": {
    "enabled": true,
    "classification_id": 123,
    "locale": "en-US",
    "market_code": "US"
  }
}
```
In this example, the `transcodeAudio` array specifies that the `aac` audio codec with profile `HE-AAC` needs to be transcoded because it is not supported by your plex app player.

## Testing configuration

> :warning: you will need a working nodejs+npm installation available for your user

Start the server with 

```bash
npm i 
npm run serve
```

> :information_source: please note the first time you start the server, it will 
> * aggregate and test all the IPTV playlist you  provided in the configuration
> * generate the tailor-made aggregate EPG
>
> depending on how many IPTV playlist and EPG sources you provided, this process could be slow and the server will be unusable until the process is complete

After the server has been started, 
* navigate to http://localhost:26457/lineup.json and verify that the resulting lineup matches your expectations
* navigate to http://localhost:26457/epg.xml and verify that the resulting EPG matches your expectations

## Installation as a systemd service

To install Plex IPTV Proxy, you can use the provided `install.sh` script to install and configure the necessary services. This script will:

* Create a new user and group for the Plex IPTV Proxy service
* Copy the project into a system folder of your choice (defaults to `/usr/lib/plex-iptv-proxy` if unspecified)
* Set up the necessary permissions for the service to run
* Install the systemd unit files for the Plex IPTV Proxy service and timers (see below)

To use the install script, run the following command:

```bash
sudo ./install.sh
```
this will install in `/usr/lib/plex-iptv-proxy`

Alternatively manually specify an installation folder with:

```bash
sudo ./install.sh /installation/folder
```

This will install the necessary files in `/installation/folder` and configure them to start automatically on boot.

### Systemd services and timers

* `plex-iptv-proxy-server.service` is the main server, it is set to run on boot and restart if a crash occurs
* `plex-iptv-proxy-ffprobe.timer` tests your IPTV Playlists for validity, set to run weekly (frequency can be adjusted before installing or with an override like `sudo systemctl edit plex-iptv-proxy-ffprobe.timer`)
* `plex-iptv-proxy-epg-generator.timer` generates the tailor-made EPG, set to run every day at 10AM in order to make sure the epg provided has had ample time to generate his EPG (frequency/hour can be adjusted before installing or with an override like `sudo systemctl edit plex-iptv-proxy-epg-generator.timer`)

### Uninstallation

```bash
sudo ./uninstall.sh
```
Will undo what `install.sh` did. Please execute this if you'd like to uninstall the service and after a failed `install.sh` run.

## Usage


## Troubleshooting

* Check the application logs for errors (e.g. `journalctl --unit plex-iptv-proxy-server.service`)
* Verify IPTV provider and Plex media server settings
* Ensure FFmpeg is installed and available to all users

## Contributing

## License

This project is licensed under the MIT License. See the LICENSE file for details.