import { exec } from 'node:child_process'
import util from 'node:util'

import { Track } from '@astronautlabs/m3u8'

import { ffProbeDataSchema, FFProbeParameters, FFProbeResult } from './schemas.js'
const execAsync = util.promisify(exec)

// type FFProbeParameters = {
//   track: Track
//   timeout: number
//   userAgent: string
//   httpReferer?: string
// }

// export type FFProbeResult = {
//   ok: false
//   channelNumber: number
//   channelName: string
//   error: string
//   params: FFProbeParameters
// } | {
//   ok: true
//   channelNumber: number
//   channelName: string
//   metadata: Omit<FfprobeData, 'streams'> & { streams: (FfprobeData['streams'][number] & { tags?: Record<string, string> })[] }
//   params: FFProbeParameters
// }

/**
 *
 * @param item
 * @param params
 * @returns
 */
const buildCommand = ({ userAgent, httpReferer, timeout, track }: FFProbeParameters) => {
  const args = [
    'ffprobe',
    '-of json',
    '-v verbose',
    '-hide_banner',
    '-show_streams',
    '-show_format',
  ]

  if (timeout) {
    args.push('-timeout', `"${(timeout * 1000).toString()}"`)
  }

  if (httpReferer) {
    args.push('-headers', `"Referer: ${httpReferer}"`)
  }

  if (userAgent) {
    args.push('-user_agent', `"${userAgent}"`)
  }

  args.push(`"${track.url}"`)

  return args.join(' ')
}

/**
 *
 * @param error
 * @param param1
 * @returns
 */
const parseError = (error: unknown) => {
  let message = 'unknown error'
  if (error instanceof Error) message = error.message
  else if (typeof error === 'string') message = error
  return message
}

const validChannelNumber = /^[0-9]+$/

export const getChannelNumber = (track: Track) => {
  return (typeof track.metadata['tvg-chno'] === 'string' && validChannelNumber.test(track.metadata['tvg-chno'])) && parseFloat(track.metadata['tvg-chno']) > 0 ? parseFloat(track.metadata['tvg-chno']) : -1
}
export const getChannelTitle = (track: Track) => {
  return track.title || 'untitled channel'
  // return track.metadata['group-title'] ? `${track.metadata['group-title']} - ${(track.title || 'untitled channel')}` : (track.title || 'untitled channel')
}

/**
 *
 * @param item
 * @param params
 * @returns
 */
export const ffprobe = async (params: Pick<FFProbeParameters, 'track'> & Partial<Omit<FFProbeParameters, 'track'>>): Promise<FFProbeResult> => {
  const fullParams: FFProbeParameters = {
    track: params.track,
    timeout: params.timeout || 60000,
    userAgent: params.userAgent || 'FMLE/3.0 (compatible; FMSc/1.0)',
    httpReferer: params.httpReferer
  }
  console.log('testing', fullParams.track.url)

  const command = buildCommand(fullParams)

  try {
    const { stdout } = await execAsync(command, { timeout: fullParams.timeout })

    // const metadata: FfprobeData = JSON.parse(stdout) as FfprobeData
    const metadata = await ffProbeDataSchema.parseAsync(JSON.parse(stdout))

    if (!metadata.streams.length) {
      console.log('testing', fullParams.track.url, 'failed: no streams')
      return {
        ok: false,
        params: fullParams,
        channelNumber: getChannelNumber(params.track),
        channelName: getChannelTitle(params.track),
        error: 'FFMPEG_STREAMS_NOT_FOUND',
      }
    }
    console.log('testing', fullParams.track.url, 'success')
    return {
      ok: true,
      params: fullParams,
      channelNumber: getChannelNumber(params.track),
      channelName: getChannelTitle(params.track),
      metadata,
    }
  } catch (err) {
    const error = parseError(err)
    console.log('testing', fullParams.track.url, 'failed, code:', error)
    return {
      ok: false,
      params: fullParams,
      channelNumber: getChannelNumber(params.track),
      channelName: getChannelTitle(params.track),
      error
    }
  }
}
