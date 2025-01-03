import { inspect } from 'node:util'

import { Parser } from '@astronautlabs/m3u8'
import Hapi from '@hapi/hapi'
import ffmpeg from 'fluent-ffmpeg'
import { getPortPromise } from 'portfinder'

import { readEPG, readFFProbeResults } from './utils.js'

// https://www.epgitalia.tv/guide2
// http://epg-guide.com/it.gz
/**
 *
 * @param file
 * @returns
 */
const spawnFFMPEG = (file: string) => {
  return ffmpeg()
    .input(file)
    .addInputOption(
      '-user_agent', 'FMLE/3.0 (compatible; FMSc/1.0)',
      // '-noaccurate_seek',
      // '-ignore_unknown',
      // '-probesize', '20000000',
      '-re',
      '-rtbufsize', '128M',
      '-thread_queue_size', '4096'
    )
    .addOutputOption(
      // '-threads', '4',
      // '-scan_all_pmts', '1',
      // '-max_packet_size', '409600',
      // '-break_non_keyframes', '1',
      // '-fflags', '+discardcorrupt',
      // '-scan_all_pmts', '-1',
      // '-map', '0',
      '-tune', 'zerolatency',
      '-preset', 'superfast'
    )
    // .map('p:0')
    .videoCodec('copy')
    // .audioCodec('copy')
    // .videoCodec('libx264')
    .audioCodec('libmp3lame')
    // .audioCodec('aac')
    // .outputFormat('mpjpeg')
    // .outputFormat('mp4')
    .outputFormat('mpegts')
}

/**
 *
 */
const start = async () => {
  const config = {
    port: await getPortPromise({ port: 26457 }),
    friendlyName: 'Plex IPTV Proxy',
    manufacturer: 'Silicondust',
    modelName: 'Plex-IPTV',
    modelNumber: 'Plex-IPTV',
    firmwareVersion: '1.0',
    firmwareName: 'plex-iptv-1.0',
    tunerCount: 4,
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
    handler: async (request) => {
      const baseUrl = request.url.protocol + '//' + request.url.host
      const ffprobeStoredResults = await readFFProbeResults()

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
    handler: async (request) => {
      const ffprobeEpg = await readEPG()
      const res = request.generateResponse(ffprobeEpg)
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
    handler: (request) => {
      if (typeof request.query.url !== 'string') return 'an url is needed'
      const url = decodeURI(request.query.url)

      console.log('streaming', url)

      const ffmpeg = spawnFFMPEG(url)
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

console.log('Starting IPTV Proxy')
start()
  .then(() => { console.log('IPTV Proxy Started') })
  .catch((e: unknown) => { console.error(`Could not start IPTV Proxy: ${inspect(e)}`) })
