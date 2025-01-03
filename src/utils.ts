import { readFile, writeFile } from 'node:fs/promises'

import { writeXmltv, Xmltv } from '@iptv/xmltv'

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
 * Reads the ffprobe results from disk.
 *
 * @returns {Promise<FFProbeStoredResults>} Resolves with the results.
 */
export const readFFProbeResults = async (): Promise<FFProbeStoredResults> => {
  const results = await readFile('data/ffprobe-stored-results.json', { encoding: 'utf-8' })
  return ffProbeStoredResultsSchema.parseAsync(JSON.parse(results))
}

/**
 * Writes the given EPG to the file `data/ffprobe-epg.xml`.
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
 * @returns {Promise<string>} Resolves with the contents of `data/ffprobe-epg.xml`.
 */
export const readEPG = async () => {
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
