import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'

import { Parser } from '@astronautlabs/m3u8'
import Hapi from '@hapi/hapi'
import { getPortPromise } from 'portfinder'

import { ffprobeStoreResults } from './ffprobe-store-results.js'
import { generateEPG } from './generate-epg.js'
import { readConfig, readEPG, readFFProbeResults, spawnFFMPEG, writeEPG } from './utils.js'

/**
 * Start the HAPI Server
 *
 * This function starts a HAPI server which serves the following routes:
 * - GET /m3u8?url=<url> - parses an m3u8 file and returns a list of tracks
 * - GET /device.xml - returns a device description xml
 * - GET /discover.json - returns a json describing the device
 * - GET /lineup.json - returns a json describing the lineup
 * - GET /epg.xml - returns an xmltv file
 * - GET /lineup.post - always returns a 200
 * - GET /lineup_status.json - returns a json describing the lineup status
 * - GET /stream?url=<url> - streams a video from the given url
 *
 * It also starts a ffmpeg process for each stream request and pipes the output of ffmpeg to the response.
 *
 * @returns {Promise<void>} - a promise which resolves when the server is started
 */
const startServer = async () => {
  const { server: serverConfig } = await readConfig()

  /**
   * Initial checks if files exist
   *
   * Absent files could be missing because this is the first time the server is started
   */
  let storedFFprobeResults = await readFFProbeResults()
  if (!storedFFprobeResults) {
    console.log('ffprobe results not found in data folder, generating now')
    storedFFprobeResults = await ffprobeStoreResults()
  }
  const storedEPG = await readEPG()
  if (!storedEPG) {
    console.log('generated epg not found in data folder, generating now')
    await writeEPG(await generateEPG(storedFFprobeResults.results))
  }

  const config = {
    port: await getPortPromise({ port: serverConfig?.port || 26457 }),
    friendlyName: 'Plex IPTV Proxy',
    manufacturer: 'Silicondust',
    modelName: 'Plex-IPTV',
    modelNumber: 'Plex-IPTV',
    firmwareVersion: '1.0',
    firmwareName: 'plex-iptv-1.0',
    tunerCount: serverConfig?.tunerCount || 4,
    lineupUrl: '/lineup.json',
    deviceId: '45654789541',
    serialNumber: '0123456789',
    deviceAuth: 'user123'
  }

  const server = new Hapi.Server({ port: config.port })

  server.route({
    method: 'GET',
    path: '/m3u8',
    handler: async (request) => {
      if (typeof request.query.url !== 'string') return 'an url is needed'
      const url = decodeURI(request.query.url)
      const text = await (await fetch(url)).text()
      const parsed = Parser.parse(text)
      return parsed.tracks.map(t => `<b>${t.title || 'unknown'}</b> ${t.url}`).join('<br />')
    }
  })

  server.route({
    method: 'GET',
    path: '/device.xml',
    /**
     * Generates a UPnP XML device description for this server.
     *
     * The response is a XML document with the following elements:
     * - URLBase: the base url of this server
     * - specVersion: the UPnP spec version
     *   - major: the major version of the spec
     *   - minor: the minor version of the spec
     * - device: the device description
     *   - deviceType: the device type
     *   - friendlyName: the friendly name of this server
     *   - manufacturer: the manufacturer of this server
     *   - modelName: the model name of this server
     *   - modelNumber: the model number of this server
     *   - serialNumber: the serial number of this server
     *   - UDN: the UDN of this server
     */
    handler: (request) => {
      const res = request.generateResponse(`
      <root xmlns="urn:schemas-upnp-org:device-1-0">
        <URLBase>${request.url.protocol + '//' + request.url.host}</URLBase>
        <specVersion>
            <major>1</major>
            <minor>0</minor>
        </specVersion>
        <device>
          <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
          <friendlyName>${config.friendlyName}</friendlyName>
          <manufacturer>${config.manufacturer}</manufacturer>
          <modelName>${config.modelName}</modelName>
          <modelNumber>${config.modelNumber}</modelNumber>
          <serialNumber>${config.serialNumber}</serialNumber>
          <UDN>uuid:${config.deviceId}</UDN>
        </device>
      </root>`
      )
      res.header('Content-Type', 'text/xml')
      return res
    }
  })

  server.route({
    method: 'GET',
    path: '/discover.json',
    /**
     * Returns a JSON response with the configuration of this server.
     *
     * The response is a JSON object with the following keys:
     * - FriendlyName: the friendly name of this server
     * - Manufacturer: the manufacturer of this server
     * - ModelNumber: the model number of this server
     * - FirmwareName: the firmware name of this server
     * - TunerCount: the number of tuners of this server
     * - FirmwareVersion: the firmware version of this server
     * - DeviceID: the device ID of this server
     * - DeviceAuth: the device auth of this server
     * - BaseURL: the base URL of this server
     * - LineupURL: the URL of the lineup of this server
     */
    handler: (request) => {
      const baseUrl = request.url.protocol + '//' + request.url.host
      const res = request.generateResponse(
        JSON.stringify(
          {
            FriendlyName: config.friendlyName,
            Manufacturer: config.manufacturer,
            ModelNumber: config.modelName,
            FirmwareName: config.firmwareName,
            TunerCount: config.tunerCount,
            FirmwareVersion: config.firmwareVersion,
            DeviceID: config.deviceId,
            DeviceAuth: config.deviceAuth,
            BaseURL: baseUrl,
            LineupURL: `${baseUrl}${config.lineupUrl}`
          }
          , null, 2)
      )
      res.header('Content-Type', 'application/json')
      return res
    }
  })

  server.route({
    method: 'GET',
    path: config.lineupUrl,

    /**
     * Handles a request to retrieve the lineup in JSON format.
     *
     * This handler reads the stored ffprobe results from disk and filters
     * them for valid entries. It generates a JSON response containing
     * channel information such as GuideName, HD status, GuideNumber, and
     * streaming URL for each valid channel. The base URL is constructed
     * from the request's protocol and host. If no ffprobe results are
     * found, a 404 response is returned instructing to run
     * generate-ffprobe-results first. The response is sent with a
     * 'Content-Type' of 'application/json'.
     *
     * @param {Hapi.Request} request - The Hapi request object.
     * @param {Hapi.ResponseToolkit} h - The Hapi response toolkit.
     * @returns {Hapi.ResponseObject} The response object containing the lineup in JSON format.
     */
    handler: async (request, h) => {
      const baseUrl = request.url.protocol + '//' + request.url.host
      const ffprobeStoredResults = await readFFProbeResults()
      if (!ffprobeStoredResults) {
        return h.response('ffprobe results not found, please run generate-ffprobe-results first').code(404)
      }
      const valid = ffprobeStoredResults.results.filter(res => res.ok)

      return request.generateResponse(
        JSON.stringify(valid.map((result, index) => {
          return {
            GuideName: result.channelName,
            HD: result.metadata.streams.find(stream => stream.codec_type === 'video' && ((stream.width && stream.width >= 1920) || (stream.coded_width && stream.coded_width >= 1920))) ? 1 : 0,
            GuideNumber: result.channelNumber.toString(),
            URL: `${baseUrl}/stream?url=${encodeURIComponent(result.params.track.url)}`
          }
        }), null, 2)
      )
        .header('Content-Type', 'application/json')
    }
  })

  server.route({
    method: 'GET',
    path: '/epg.xml',

    /**
     * Handles a request to retrieve the EPG in XML format.
     *
     * This handler reads the previously generated EPG file from disk, and
     * sends it as the response to the request. The response is sent with a
     * 'Content-Type' of 'application/xml'. If the EPG file does not exist,
     * a 404 response is sent.
     *
     * @param {Hapi.Request} request - The Hapi request object.
     * @param {Hapi.ResponseToolkit} h - The Hapi response toolkit.
     * @returns {Hapi.ResponseObject} The response object containing the EPG in XML format.
     */
    handler: async (request, h) => {
      const epg = await readEPG()
      if (!epg) {
        return h.response('epg not found, please run generate-epg first').code(404)
      }
      const res = request.generateResponse(epg)
      res.header('Content-Type', 'application/xml')
      return res
    }
  })

  server.route({
    method: 'GET',
    path: '/lineup.post',
    handler: (request) => {
      const res = request.generateResponse(JSON.stringify({}, null, 2))
      res.header('Content-Type', 'application/json')
      return res
    }
  })

  server.route({
    method: 'GET',
    path: '/lineup_status.json',
    /**
     * Handles a request to retrieve lineup status in JSON format.
     *
     * This handler generates a JSON response indicating the scan status of the lineup,
     * whether a scan is possible, the source of the lineup, and a list of available sources.
     * The response is sent with a 'Content-Type' of 'application/json'.
     *
     * @param {Hapi.Request} request - The Hapi request object.
     * @returns {Hapi.ResponseObject} The response object containing lineup status information.
     */
    handler: (request) => {
      const res = request.generateResponse(
        JSON.stringify({
          ScanInProgress: 0,
          ScanPossible: 1,
          Source: 'Cable',
          SourceList: ['Cable']
        }, null, 2)
      )
      res.header('Content-Type', 'application/json')
      return res
    }
  })

  server.route({
    method: 'GET',
    path: '/stream',
    options: {
      cache: false,
      timeout: { server: false, socket: false }
    },

    /**
     * Handles streaming requests by decoding the provided URL and determining
     * whether audio transcoding is necessary based on the server configuration
     * and ffProbe results. If transcoding is required, it spawns an FFMPEG
     * process with the appropriate audio codec, otherwise it copies the audio
     * stream. The FFMPEG process is piped to create a stream which is then
     * returned. Handles errors by logging them and terminating the FFMPEG
     * process.
     *
     * @param {Hapi.Request} request - The incoming request object, expected to
     *   contain a query parameter 'url' which is the media URL to stream.
     * @returns {stream.Readable} - A readable stream piped from the FFMPEG process.
     */
    handler: async (request) => {
      if (typeof request.query.url !== 'string') return 'an url is needed'
      const url = decodeURI(request.query.url)

      console.log('streaming', url)

      // determine if we need to transcode audio, given some players can't decode some audio codecs
      // for example aac with profile HE-AAC is not well supported, but the list is configurable

      const { server: serverConfig } = await readConfig()
      let needsAudioTranscode = false
      const transcodeAudioConfig = serverConfig?.transcodeAudio
      if (transcodeAudioConfig) {
        const ffprobeStoredResults = await readFFProbeResults()
        if (ffprobeStoredResults) {
          const matchedResult = ffprobeStoredResults.results.find(res => res.params.track.url === url)
          if (matchedResult?.ok) {
            needsAudioTranscode = !!matchedResult.metadata.streams.find(stream =>
              // must be an audio stream
              stream.codec_type === 'audio' &&
              // must match a config
              !!transcodeAudioConfig.find(config =>
                config.codec === stream.codec_name &&
                config.profile === stream.profile
              ))
          } else {
            console.warn('No matching entry found in stored ffProbe, audio will NOT be transcoded')
          }
        }
      }
      console.log('Will transcode audio?', needsAudioTranscode)

      const ffmpeg = spawnFFMPEG(url, needsAudioTranscode ? 'aac' : 'copy')
      console.log('ffmpeg arguments', ffmpeg._getArguments().join(' '))
      ffmpeg.on('stderr', function (stderrLine) {
        console.log('FFMPEG Stderr output: ' + stderrLine)
      })
      ffmpeg.on('error', (err) => {
        console.error('ffmpeg error', err)
        ffmpeg.kill('SIGKILL')
      })

      // create stream
      const stream = ffmpeg.pipe()
      stream.on('error', (err) => {
        ffmpeg.kill('SIGKILL')
        console.error('stream error', err)
      })
      stream.on('close', () => {
        ffmpeg.kill('SIGKILL')
        console.log('stream closed', url)
      })
      return stream
    }
  })

  console.log('Starting HAPI Server')
  try {
    await server.start()
    console.log(`HAPI Server Started on http://0.0.0.0:${config.port.toString()}`)
  } catch (e) {
    console.error(`Could not start HAPI Server: ${inspect(e)}`)
  }
}

/**
 * Execute this file if called directly, otherwise ignore
 */

const pathToThisFile = resolve(fileURLToPath(import.meta.url))
const pathPassedToNode = resolve(process.argv[1])
const isThisFileBeingRunViaCLI = pathToThisFile.includes(pathPassedToNode)

if (isThisFileBeingRunViaCLI) {
  console.log('Starting IPTV Proxy')
  startServer()
    .then(() => { console.log('IPTV Proxy Started') })
    .catch((e: unknown) => { console.error(`Could not start IPTV Proxy: ${inspect(e)}`) })
}
