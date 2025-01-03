import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'

import { Xmltv, XmltvChannel, XmltvProgramme } from '@iptv/xmltv'
import { iso6392BTo1, iso6392TTo1 } from 'iso-639-2'
import { z } from 'zod'

import { escapeHtml, readConfig } from './utils.js'
/**
 * API Schema, defining it like this will prevent future updated on rakuten's side to break our stuff
 */
export const schema = z.object({
  data: z.array(
    z.object({
      type: z.string(),
      id: z.string(),
      numerical_id: z.number(),
      title: z.string(),
      channel_number: z.number(),
      content_aggregator_id: z.string(),
      classification: z.object({
        type: z.string().optional().nullable(),
        id: z.string().optional().nullable(),
        numerical_id: z.number().optional().nullable(),
        name: z.string().optional().nullable(),
        age: z.number().optional().nullable(),
        adult: z.boolean().optional().nullable(),
        description: z.string().optional().nullable(),
        default: z.boolean().optional().nullable()
      }).optional().nullable(),
      images: z.object({
        artwork: z.string().optional().nullable(),
        artwork_webp: z.string().optional().nullable(),
        artwork_negative: z.string().optional().nullable(),
        artwork_negative_webp: z.string().optional().nullable(),
        has_sponsored_snapshot: z.boolean().optional().nullable(),
        snapshot: z.string().optional().nullable(),
        snapshot_webp: z.string().optional().nullable()
      }).optional().nullable(),
      labels: z.object({
        tags: z.array(
          z.object({
            type: z.string(),
            id: z.string(),
            numerical_id: z.number(),
            name: z.string()
          })
        ).optional().nullable(),
        languages: z.array(
          z.object({
            type: z.string(),
            id: z.string(),
            numerical_id: z.number(),
            name: z.string()
          })
        ).optional().nullable()
      }).optional().nullable(),
      live_programs: z.array(
        z.object({
          type: z.string(),
          numerical_id: z.number(),
          id: z.string(),
          title: z.string(),
          subtitle: z.string().optional().nullable(),
          description: z.string(),
          is_live: z.boolean(),
          starts_at: z.string(),
          ends_at: z.string(),
          images: z.object({
            snapshot: z.string().optional().nullable(),
            snapshot_webp: z.string().optional().nullable()
          }),
          episode_id: z.string().optional().nullable(),
          season_id: z.string().optional().nullable(),
          movie_id: z.string().optional().nullable()
        })
      )
    })
  ),
  meta: z.object({
    pagination: z.object({
      page: z.number(),
      count: z.number(),
      per_page: z.number(),
      offset: z.number(),
      total_pages: z.number()
    })
  })
})

const BASE_URL = 'https://gizmo.rakuten.tv/v3/live_channels'
/**
 * Generates a valid XMLTV EPG from Rakuten's public JSON API
 *
 * @returns
 */
export const generateRakutenEPG = async () => {
  const { rakutenEpg } = await readConfig()
  if (!rakutenEpg.enabled) {
    console.log('Rakuten EPG Generation disabled')
    return undefined
  }
  console.log('Rakuten EPG Generation enabled, starting')
  const now = new Date()
  now.setHours(0)
  now.setMinutes(0)
  now.setSeconds(0)
  now.setMilliseconds(0)

  const end = new Date(now.getTime() + 2.592e+8)  // 3 days in milliseconds in the future
  const params = {
    device_identifier: 'web',
    device_stream_audio_quality: '2.0',
    device_stream_hdr_type: 'NONE',
    device_stream_video_quality: 'FHD',
    epg_duration_minutes: '360',
    per_page: '250',
    epg_starts_at: now.toISOString(),
    epg_starts_at_timestamp: now.getTime().toString(),
    epg_ends_at: end.toISOString(),
    epg_ends_at_timestamp: end.getTime().toString(),
    classification_id: rakutenEpg.classification_id.toString(),
    locale: rakutenEpg.locale,
    market_code: rakutenEpg.market_code
  }
  const url = `${BASE_URL}?${new URLSearchParams(params).toString().replace(/:/g, '%3A')}`
  const res = await fetch(url)
  const resText = await res.text()
  const resJSON: unknown = JSON.parse(resText)
  const resParsed = await schema.parseAsync(resJSON)

  // our output EPG
  const generatedEPG: Xmltv = {
    channels: [],
    programmes: [],
    date: new Date(),
    generatorInfoName: 'plex-iptv-proxy'
  }

  // build the EPG
  resParsed.data.forEach(channel => {
    let lang = channel.labels?.languages?.[0].id.toLowerCase() || 'en'
    if (lang === 'zxx') lang = 'en'
    lang = iso6392TTo1[lang] || iso6392BTo1[lang] || 'en'

    const xmlTvChannel: XmltvChannel = {
      displayName: [{ _value: escapeHtml(channel.title), lang }],
      id: channel.id
    }
    const icon = channel.images?.artwork_negative || channel.images?.artwork
    if (icon) xmlTvChannel.icon = [{ src: icon }]

    const channelTags = channel.labels?.tags
    generatedEPG.channels?.push(xmlTvChannel)

    channel.live_programs.forEach(program => {
      const xmlTvProgramme: XmltvProgramme = {
        channel: channel.id,
        title: [{ _value: escapeHtml(program.title), lang }],
        desc: [{ _value: escapeHtml(program.description), lang }],
        start: new Date(program.starts_at),
        stop: new Date(program.ends_at),
        language: { _value: lang, lang }
      }
      if (program.subtitle) {
        xmlTvProgramme.subTitle = [{ _value: escapeHtml(program.subtitle), lang }]
      }
      if (channelTags && channelTags.length > 0) {
        xmlTvProgramme.category = [{ _value: escapeHtml(channelTags.map(t => t.name).join(', ')), lang }]
      }
      if (program.images.snapshot) {
        xmlTvProgramme.image = [{ _value: program.images.snapshot, type: 'still' }]
      }
      if (program.episode_id) {
        xmlTvProgramme.episodeNum = [{ _value: escapeHtml(program.episode_id), system: 'onscreen' }]
      }
      generatedEPG.programmes?.push(xmlTvProgramme)
    })
  })

  console.log('Rakuten EPG Generation finished successfully')
  return generatedEPG
}

const pathToThisFile = resolve(fileURLToPath(import.meta.url))
const pathPassedToNode = resolve(process.argv[1])
const isThisFileBeingRunViaCLI = pathToThisFile.includes(pathPassedToNode)

if (isThisFileBeingRunViaCLI) {
  console.log('starting getRakutenEPG')
  generateRakutenEPG()
    .then(() => { console.log('getRakutenEPG completed successfully') })
    .catch((e: unknown) => { console.error(`getRakutenEPG encountered an error ${inspect(e)}`) })
}
