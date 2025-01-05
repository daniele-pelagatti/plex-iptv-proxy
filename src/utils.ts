import { access, readFile, writeFile } from 'node:fs/promises'

import { writeXmltv, Xmltv } from '@iptv/xmltv'
import ffmpeg from 'fluent-ffmpeg'

import { Config, configSchema, FFProbeStoredResults, ffProbeStoredResultsSchema } from './schemas.js'

/**
 * Escapes HTML special characters in a string.
 *
 * @param {string} unsafe - The string to escape.
 * @returns {string} The escaped string.
 */
export const escapeHtml = (unsafe: string) => {
  return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

/**
 * Writes the ffprobe results to disk.
 *
 * @param {FFProbeStoredResults} results - The results to write.
 * @returns {Promise<void>} Resolves when the write is complete.
 */
export const writeFFProbeResults = async (results: FFProbeStoredResults) => {
  return writeFile(
    'data/ffprobe-stored-results.json',
    JSON.stringify(results, null, 2),
    { encoding: 'utf-8' }
  )
}

/**
 * Reads the previously written ffprobe results from disk.
 *
 * @returns {Promise<FFProbeStoredResults | undefined>} Resolves with the parsed results if the file exists, or `undefined` if it doesn't.
 */
export const readFFProbeResults = async () => {
  try {
    await access('data/ffprobe-stored-results.json')
  } catch {
    return undefined
  }
  const results = await readFile('data/ffprobe-stored-results.json', { encoding: 'utf-8' })
  return ffProbeStoredResultsSchema.parseAsync(JSON.parse(results))
}

/**
 * Writes the given EPG to `data/ffprobe-epg.xml`.
 *
 * @param {Xmltv} epg - The EPG to write.
 * @returns {Promise<void>} Resolves when the write is complete.
 */
export const writeEPG = async (epg: Xmltv) => {
  return writeFile(
    'data/ffprobe-epg.xml',
    writeXmltv(epg),
    { encoding: 'utf-8' }
  )
}

/**
 * Reads the previously written EPG from disk.
 *
 * @returns {Promise<string | undefined>} Resolves with the contents of the file as a string if the file exists, or `undefined` if it doesn't.
 */
export const readEPG = async () => {
  try {
    await access('data/ffprobe-epg.xml')
  } catch {
    return undefined
  }
  return readFile('data/ffprobe-epg.xml', { encoding: 'utf-8' })
}

let cachedConfig:Config | undefined

/**
 * Reads the config from disk and returns it. The config is cached after the first
 * read, so subsequent calls will return the cached config.
 *
 * @returns {Promise<Config>} The config.
 */
export const readConfig = async (): Promise<Config> => {
  if (!cachedConfig) {
    const config = await readFile('data/config.json', { encoding: 'utf-8' })
    cachedConfig = await configSchema.parseAsync(JSON.parse(config))
  }
  return cachedConfig
}

/**
 * Spawns a new ffmpeg process with the given options.
 *
 * @param {string} file - The input file to read from.
 * @param {'copy'|'aac'} [audioCodec='copy'] - The audio codec to use.
 * @returns {ffmpeg.FfmpegCommand} The spawned ffmpeg process.
 */
export const spawnFFMPEG = (file: string, audioCodec: 'copy' | 'aac' = 'copy') => {
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
    .audioCodec(audioCodec)
    // .videoCodec('libx264')
    // .audioCodec('libmp3lame')
    // .audioCodec('aac')
    // .outputFormat('mpjpeg')
    // .outputFormat('mp4')
    .outputFormat('mpegts')
}
