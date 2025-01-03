import { exec } from 'node:child_process'
import util from 'node:util'

import { Track } from '@astronautlabs/m3u8'

import { ffProbeDataSchema, FFProbeParameters, FFProbeResult } from './schemas.js'
const execAsync = util.promisify(exec)

/**
 * Builds an ffprobe command given a set of parameters.
 * @param {FFProbeParameters} params
 * @returns {string} The command as a string.
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
 * Parses an unknown error object and extracts the error message.
 *
 * @param error - The error object, which can be of any type.
 * @returns The error message if available, otherwise returns 'unknown error'.
 */

const parseError = (error: unknown) => {
  let message = 'unknown error'
  if (error instanceof Error) message = error.message
  else if (typeof error === 'string') message = error
  return message
}

const validChannelNumber = /^[0-9]+$/

/**
 * Retrieves the channel number from a given track's metadata.
 *
 * @param {Track} track - The track object containing metadata.
 * @returns {number} The channel number if valid and greater than 0, otherwise returns -1.
 */

export const getChannelNumber = (track: Track) => {
  return (typeof track.metadata['tvg-chno'] === 'string' && validChannelNumber.test(track.metadata['tvg-chno'])) && parseFloat(track.metadata['tvg-chno']) > 0 ? parseFloat(track.metadata['tvg-chno']) : -1
}
/**
 * Retrieves the title of a given channel.
 *
 * @param {Track} track - The track object containing metadata.
 * @returns {string} The title of the channel, or 'untitled channel' if it does not have a title.
 */
export const getChannelTitle = (track: Track) => {
  return track.title || 'untitled channel'
  // return track.metadata['group-title'] ? `${track.metadata['group-title']} - ${(track.title || 'untitled channel')}` : (track.title || 'untitled channel')
}

/**
 * Executes an ffprobe command to retrieve metadata for a given media track.
 *
 * This function constructs an ffprobe command using the provided parameters,
 * executes the command asynchronously, and returns the parsed metadata.
 * If the command execution is successful and streams are found, it returns
 * an object with the metadata and status as ok. If no streams are found or
 * an error occurs during execution, it returns an object with an error message
 * and status as not ok.
 *
 * @param {Pick<FFProbeParameters, 'track'> & Partial<Omit<FFProbeParameters, 'track'>>} params
 *   - The parameters for the ffprobe command, including the media track. Optional parameters include
 *     timeout, userAgent, and httpReferer with default values if not provided.
 *
 * @returns {Promise<FFProbeResult>}
 *   - Resolves with an object containing the result status, channel information, and metadata or error message.
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
