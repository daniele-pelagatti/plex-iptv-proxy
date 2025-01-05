import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'

import { Parser } from '@astronautlabs/m3u8'

import { ffprobe } from './ffprobe.js'
import { FFProbeStoredResults } from './schemas.js'
import { readConfig, writeFFProbeResults } from './utils.js'

/**
 * Stores the results of ffprobe in data/ffprobe-stored-results.json
 * It takes all the urls from the playlists and deduplicates them
 * It then calls ffprobe for each of them and stores the results
 * It assigns a channel number to each of the results starting from 1
 * If a channel number is already taken, it moves the channel number to the last available one
 * @returns {Promise<FFProbeStoredResults>}
 */
export const ffprobeStoreResults = async (): Promise<FFProbeStoredResults> => {
  const pLimit = await import('p-limit')
  const limit = pLimit.default(25)

  const { iptvPlaylists } = await readConfig()

  // get all lists
  const playlists = await Promise.all(iptvPlaylists.map(async (list) => {
    const pl = await fetch(list)
    return Parser.parse(await pl.text())
  }))

  // deduplicate them based on the URL
  const deduped: ReturnType<typeof Parser.parse>['tracks'] = []
  playlists.forEach(pl => {
    pl.tracks.forEach(track => {
      if (!deduped.find(t => t.url === track.url)) {
        deduped.push(track)
      } else {
        console.log(`${track.url} already added, skipping`)
      }
    })
  })

  const results = await Promise.all(
    deduped.map(track => limit(() => ffprobe({ track })))
  )

  // filter out invalid
  // const valid = results.filter(res => res.ok)

  const withChannelNumber = results.filter(res => res.channelNumber !== -1)
  // calculate last channel
  let lastChannel = withChannelNumber.reduce((p, c) => Math.max(p, c.channelNumber), Number.NEGATIVE_INFINITY)

  // starting from last, move duplicate channel numbers to last in queue
  let increment = 0
  for (let i = withChannelNumber.length - 1; i >= 0; i--) {
    const res = withChannelNumber[i]
    if (withChannelNumber.find(c => c !== res && c.channelNumber === res.channelNumber)) {
      increment++
      const prevChannelNumber = res.channelNumber
      res.channelNumber = lastChannel + increment
      console.log(`Moved ${res.channelName} from ${prevChannelNumber.toString()} to ${res.channelNumber.toString()}`)
    }
  }
  lastChannel += increment

  const noChannelNumber = results.filter(res => res.channelNumber === -1)

  // sort by name those with no explicit channel number
  const noChannelNumberSortedByName = noChannelNumber.sort((a, b) => a.channelName.localeCompare(b.channelName))

  // sort by explicit channel number
  const withChannelNumberSorted = withChannelNumber.sort((a, b) => a.channelNumber > b.channelNumber ? 1 : -1)

  // assign progressive channel numbers starting from the last proper channel number
  // const lastChannel = withChannelNumberSorted[withChannelNumberSorted.length - 1].channelNumber
  noChannelNumberSortedByName.forEach((result, index) => { result.channelNumber = lastChannel + (index + 1) })

  // results
  const ffprobeResults = {
    date: Date.now(),
    results: withChannelNumberSorted.concat(noChannelNumberSortedByName)
  }

  // last check
  ffprobeResults.results.forEach(res => {
    if (ffprobeResults.results.find(r => r !== res && r.channelNumber === res.channelNumber)) {
      throw new Error(`Duplicate channel! ${res.channelName}`)
    }
  })

  await writeFFProbeResults(ffprobeResults)

  return ffprobeResults
}

/**
 * Execute this file if called directly, otherwise ignore
 */

const pathToThisFile = resolve(fileURLToPath(import.meta.url))
const pathPassedToNode = resolve(process.argv[1])
const isThisFileBeingRunViaCLI = pathToThisFile.includes(pathPassedToNode)

if (isThisFileBeingRunViaCLI) {
  console.log('starting ffProbeStoreResults')
  ffprobeStoreResults()
    .then(() => { console.log('ffProbeStoreResults completed successfully') })
    .catch((e: unknown) => { console.error(`ffProbeStoreResults encountered an error ${inspect(e)}`) })
}
