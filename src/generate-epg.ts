import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect, promisify } from 'node:util'
import { gunzip } from 'node:zlib'

import { Track } from '@astronautlabs/m3u8'
import { parseXmltv, Xmltv, XmltvChannel, XmltvProgramme } from '@iptv/xmltv'

import { generateRakutenEPG } from './generate-rakuten-epg.js'
import { FFProbeResult } from './schemas.js'
import { escapeHtml, readConfig, readFFProbeResults, writeEPG } from './utils.js'

const gunzipAsync = promisify(gunzip)

type TrackEPGMatch = {
  channel: XmltvChannel
  programmes: XmltvProgramme[]
  epgDate: Date,
  firstProgrammeDate: Date
  lastProgrammeDate: Date
}

/**
 * Elaborates a match between a track and an epg.
 *
 * Given an EPG and a track, it filters out the programmes that are not related to the track, and
 * checks if the EPG is outdated or if the first programme is too far in the future.
 *
 * @param {Xmltv} epg - The EPG to elaborate.
 * @param {XmltvChannel} [foundEpgChannel] - The channel of the EPG that matches the track.
 * @returns {TrackEPGMatch|undefined} The elaborated match or undefined if the match is not good.
 */
const elaborateMatch = (epg: Xmltv, foundEpgChannel?: XmltvChannel) => {
  if (foundEpgChannel) {
    const programmes = epg.programmes?.filter(prog => prog.channel === foundEpgChannel.id)
    // if we have no programmes then this match is not good
    if (programmes) {
      const firstProgrammeDate = programmes.reduce((p, a) => new Date(Math.min(p.getTime(), a.start.getTime())), new Date(9999999999999))
      const lastProgrammeDate = programmes.reduce((p, a) => new Date(Math.max(p.getTime(), a.start.getTime())), new Date(0))
      const now = Date.now()
      // last programme date is < of 3 hours in the future
      // it means this is outdated
      if (lastProgrammeDate.getTime() < now - (10800 * 1000)) return undefined

      // first programme date is > of 6 hours in the future
      // we will not have EPGs unless we wait 6 hours from now
      if (firstProgrammeDate.getDate() > now + (21600 * 1000)) return undefined
      return {
        channel: foundEpgChannel,
        programmes,
        epgDate: epg.date || new Date(0),
        firstProgrammeDate,
        lastProgrammeDate
      }
    }
  }
  return undefined
}

/**
   * Given a list of valid EPG guides and a track, it tries to match the track with an EPG channel.
   * It first tries to match the track.metadata['tvg-id'] on both epg.id and epg.displayName.
   * If no match is found, it tries to match the track.title on both epg.id and epg.displayName.
   * After that, it elaborates each match and filters out the matches that are not good.
   * Finally, it sorts the matches by number of programmes (descending) and returns them.
   *
   * @param {Xmltv[]} validEpgGuides - The list of valid EPG guides.
   * @param {Track} track - The track to match.
   * @return {TrackEPGMatch[]} The matches, sorted by number of programmes (descending).
   */
const matchTrackWithEPGChannel = (validEpgGuides: Xmltv[], track: Track) => {
  const results:TrackEPGMatch[] = []

  validEpgGuides.forEach(epg => {
    if (epg.channels) {
      let foundEpgChannel: XmltvChannel | undefined
      // try matching track.metadata['tvg-id'] on both epg.id and epg.displayName
      if (track.metadata['tvg-id']) {
        foundEpgChannel = epg.channels.find(epgChannel => epgChannel.id === track.metadata['tvg-id'] || epgChannel.displayName[0]._value === track.metadata['tvg-id'])
        const res = elaborateMatch(epg, foundEpgChannel)
        if (res) {
          foundEpgChannel = res.channel
          results.push(res)
        }
      }

      // try matching track.title on both epg.id and epg.displayName
      if (!foundEpgChannel && track.title) {
        foundEpgChannel = epg.channels.find(epgChannel => epgChannel.id === track.title || epgChannel.displayName[0]._value === track.title)
        const res = elaborateMatch(epg, foundEpgChannel)
        if (res) {
          foundEpgChannel = res.channel
          results.push(res)
        }
      }
    }
  })

  // sort matches by number of programmes (descending)
  results.sort((a, b) => {
    return a.programmes.length > b.programmes.length ? -1 : 1
  })

  return results
}

/**
 * Generates an Electronic Program Guide (EPG) based on FFProbe results and multiple XMLTV sources.
 *
 * This function downloads and parses EPG data from a list of configured sources,
 * decompressing and interpreting XMLTV data. It attempts to match these EPG channels
 * with tracks obtained from FFProbe results. If a match is found, it maps the EPG
 * channel data to the track's channel information. If no match is found, it creates
 * a default EPG entry for the track. The resulting EPG data is returned as an
 * Xmltv object.
 *
 * @param {FFProbeResult[]} results - The list of FFProbe results to be used for generating the EPG.
 * @returns {Promise<Xmltv>} A promise that resolves to the generated Xmltv object.
 */

export const generateEPG = async (results: FFProbeResult[]) => {
  console.log('generating EPG')
  const { epgSources } = await readConfig()

  const epgGuides = await Promise.all(
    epgSources.map(async (url) => {
      console.log(`Downloading ${url}`)
      let epg: Awaited<ReturnType<typeof fetch>>
      try {
        epg = await fetch(url)
      } catch (e) {
        console.log(`Downloading ${url} FAILED`)
        return undefined
      }
      const arrBuffer = await epg.arrayBuffer()
      let parsed: Xmltv
      try {
        console.log(`Decompressing ${url}`)
        const unzipped = await gunzipAsync(arrBuffer)
        console.log(`Parsing ${url}`)
        parsed = parseXmltv(unzipped.toString('utf-8'))
      } catch (e) {
        try {
          console.log(`Parsing ${url} as text`)
          const text = new TextDecoder().decode(arrBuffer)
          parsed = parseXmltv(text)
        } catch (e) {
          console.log(`Parsing of ${url} FAILED`)
          return undefined
        }
      }
      if (typeof parsed === 'string') {
        console.warn(`Unexpected string result for ${url}: ${String(parsed)}`)
        return undefined
      }
      return parsed
    })
  )
  console.log('ALL EPGs downloaded')

  // filter out failed epg guides
  const validEpgGuides = epgGuides.filter(epg => epg !== undefined)
  try {
    const rakutenEpg = await generateRakutenEPG()
    if (rakutenEpg) validEpgGuides.push(rakutenEpg)
  } catch (e) {
    console.error(`generateRakutenEPG encountered an error ${inspect(e)}`)
  }

  // some epg guides have "generated-ts" and not date
  validEpgGuides.forEach(g => {
    if (!g.date && ('generated-ts' in g) && typeof g['generated-ts'] === 'string') {
      g.date = new Date(parseFloat(g['generated-ts']))
    }
  })

  // sort by generation date (descending), newest = best
  validEpgGuides.sort((a, b) => {
    const aDate = a.date || new Date(0)
    const bDate = b.date || new Date(0)
    return aDate.getTime() > bDate.getTime() ? -1 : 1
  })

  // our output EPG
  const generatedEPG: Xmltv = {
    channels: [],
    programmes: [],
    date: new Date(),
    generatorInfoName: 'plex-iptv-proxy'
  }

  // base our EPG only on successful FFPROBE results
  const validResults = results.filter(res => res.ok)

  validResults.forEach(result => {
    const matchResults = matchTrackWithEPGChannel(validEpgGuides, result.params.track)
    const channelTitle = result.params.track.title || 'UNKNOWN CHANNEL'
    // we have a match
    if (matchResults.length > 0) {
      // select first match
      const { programmes, channel } = matchResults[0]

      // clone this stuff, we are going to modify it
      const epgChannelCopy = structuredClone(channel)
      const programmesCopy = structuredClone(programmes)

      // set logo if missing (tracks sometimes contain it)
      if (result.params.track.metadata['tvg-logo'] && (!epgChannelCopy.icon || epgChannelCopy.icon.length === 0)) {
        epgChannelCopy.icon = [{ src: result.params.track.metadata['tvg-logo'] }]
      }

      // rewrite channel ID to match track channelNumber
      if (result.channelNumber !== -1) {
        epgChannelCopy.id = result.channelNumber.toString()
        programmesCopy.forEach(p => { p.channel = result.channelNumber.toString() })
      }

      // push results in our guide
      generatedEPG.channels?.push(epgChannelCopy)
      generatedEPG.programmes = generatedEPG.programmes?.concat(programmesCopy)

      console.log(`[${result.channelNumber.toString()}] Matched Channel added to EPG Guide: ${result.params.track.metadata['group-title'] || ''} ${channelTitle}`)
    } else {
      if (result.channelNumber === -1) {
        return // skip tracks with -1 channel number
      }
      // generate a fake EPG guide for these

      const start = new Date()

      // create a channel based on the track title
      const channel: XmltvChannel = {
        displayName: [{ _value: escapeHtml(channelTitle) }],
        id: result.channelNumber.toString()
      }

      generatedEPG.channels?.push(channel)

      // create one single programme with the same name with a 3 days duration
      const programme: XmltvProgramme = {
        channel: result.channelNumber.toString(),
        start,
        stop: new Date(start.getTime() + 2.592e+8), // 3 days in milliseconds in the future
        title: [{ _value: escapeHtml(channelTitle) }]
      }
      if (result.params.track.genre) {
        programme.category = [{ _value: escapeHtml(result.params.track.genre) }]
      }
      if (result.params.track.image) {
        programme.image = [{ _value: result.params.track.image, type: 'poster' }]
      }
      generatedEPG.programmes?.push(programme)

      console.log(`[${result.channelNumber.toString()}] Non Matched Channel added to EPG Guide: ${result.params.track.metadata['group-title'] || ''} ${channelTitle}`)
    }
  })

  console.log(`Generated EPG with ${String(generatedEPG.channels?.length.toString())}/${validResults.length.toString()} channels`)

  return generatedEPG
}

const start = async () => {
  const ffprobeStoredResults = await readFFProbeResults()
  if (!ffprobeStoredResults) {
    throw new Error('ffprobe results not found, please run generate-ffprobe-results first')
  }
  const epg = await generateEPG(ffprobeStoredResults.results)
  await writeEPG(epg)
}

/**
 * Execute this file if called directly, otherwise ignore
 */

const pathToThisFile = resolve(fileURLToPath(import.meta.url))
const pathPassedToNode = resolve(process.argv[1])
const isThisFileBeingRunViaCLI = pathToThisFile.includes(pathPassedToNode)

if (isThisFileBeingRunViaCLI) {
  console.log('starting generateEpg')
  start()
    .then(() => { console.log('generateEpg completed successfully') })
    .catch((e: unknown) => { console.error(`generateEpg encountered an error ${inspect(e)}`) })
}
