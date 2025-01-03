import { readFile, writeFile } from 'node:fs/promises'

import { writeXmltv, Xmltv } from '@iptv/xmltv'

import { Config, configSchema, FFProbeStoredResults, ffProbeStoredResultsSchema } from './schemas.js'

// /**
//  * data/config.json
//  */
// export const configSchema = z.object({
//   iptv: z.array(z.string()).nonempty(),
//   epgSources: z.array(z.string()).nonempty()
// })
// /**
//  * data/ffprobe-stored-results.json
//  */
// export const ffProbeSchema = z.object({
//   date: z.number(),
//   results: z.array(
//     z.object({
//       ok: z.boolean(),
//       params: z.object({
//         track: z.object({
//           url: z.string(),
//           metadata: z.object({
//             '-1': z.string().optional(),
//             'tvg-id': z.string().optional(),
//             'tvg-chno': z.string().optional(),
//             'tvg-logo': z.string().optional(),
//             'group-title': z.string().optional(),
//             'tvg-name': z.string().optional(),
//             'channel-id': z.string().optional()
//           }),
//           comments: z.array(z.object({ text: z.string() })),
//           title: z.string().optional()
//         }),
//         timeout: z.number(),
//         userAgent: z.string()
//       }),
//       channelNumber: z.number(),
//       channelName: z.string(),
//       metadata: z
//         .object({
//           streams: z.array(
//             z.object({
//               index: z.number(),
//               codec_name: z.string().optional(),
//               codec_long_name: z.string().optional(),
//               codec_type: z.string().optional(),
//               codec_tag_string: z.string(),
//               codec_tag: z.string(),
//               r_frame_rate: z.string(),
//               avg_frame_rate: z.string(),
//               time_base: z.string(),
//               disposition: z.object({
//                 default: z.number(),
//                 dub: z.number(),
//                 original: z.number(),
//                 comment: z.number(),
//                 lyrics: z.number(),
//                 karaoke: z.number(),
//                 forced: z.number(),
//                 hearing_impaired: z.number(),
//                 visual_impaired: z.number(),
//                 clean_effects: z.number(),
//                 attached_pic: z.number(),
//                 timed_thumbnails: z.number(),
//                 non_diegetic: z.number(),
//                 captions: z.number(),
//                 descriptions: z.number(),
//                 metadata: z.number(),
//                 dependent: z.number(),
//                 still_image: z.number(),
//                 multilayer: z.number()
//               }).optional(),
//               tags: z
//                 .object({
//                   variant_bitrate: z.string().optional(),
//                   language: z.string().optional(),
//                   'id3v2_priv.com.apple.streaming.transportStreamTimestamp': z
//                     .string()
//                     .optional(),
//                   comment: z.string().optional(),
//                   handler_name: z.string().optional(),
//                   vendor_id: z.string().optional(),
//                   major_brand: z.string().optional(),
//                   minor_version: z.string().optional(),
//                   compatible_brands: z.string().optional(),
//                   encoder: z.string().optional(),
//                   creation_time: z.string().optional(),
//                   id: z.string().optional()
//                 })
//                 .optional(),
//               profile: z.string().optional(),
//               width: z.number().optional(),
//               height: z.number().optional(),
//               coded_width: z.number().optional(),
//               coded_height: z.number().optional(),
//               closed_captions: z.number().optional(),
//               film_grain: z.number().optional(),
//               has_b_frames: z.number().optional(),
//               sample_aspect_ratio: z.string().optional(),
//               display_aspect_ratio: z.string().optional(),
//               pix_fmt: z.string().optional(),
//               level: z.number().optional(),
//               chroma_location: z.string().optional(),
//               refs: z.number().optional(),
//               is_avc: z.string().optional(),
//               nal_length_size: z.string().optional(),
//               start_pts: z.number().optional(),
//               start_time: z.string().optional(),
//               bits_per_raw_sample: z.string().optional(),
//               extradata_size: z.number().optional(),
//               sample_fmt: z.string().optional(),
//               sample_rate: z.string().optional(),
//               channels: z.number().optional(),
//               channel_layout: z.string().optional(),
//               bits_per_sample: z.number().optional(),
//               initial_padding: z.number().optional(),
//               color_range: z.string().optional(),
//               color_space: z.string().optional(),
//               color_transfer: z.string().optional(),
//               color_primaries: z.string().optional(),
//               bit_rate: z.string().optional(),
//               side_data_list: z
//                 .array(z.object({ side_data_type: z.string() }))
//                 .optional(),
//               view_ids_available: z.string().optional(),
//               view_pos_available: z.string().optional(),
//               field_order: z.string().optional(),
//               id: z.string().optional(),
//               duration_ts: z.number().optional(),
//               duration: z.string().optional(),
//               nb_frames: z.string().optional()
//             })
//           ),
//           format: z.object({
//             filename: z.string(),
//             nb_streams: z.number(),
//             nb_programs: z.number(),
//             nb_stream_groups: z.number(),
//             format_name: z.string(),
//             format_long_name: z.string(),
//             start_time: z.string(),
//             size: z.string().optional(),
//             probe_score: z.number(),
//             tags: z
//               .object({
//                 'Icy-MetaData': z.string().optional(),
//                 'icy-br': z.string().optional(),
//                 'icy-name': z.string().optional(),
//                 'icy-pub': z.string().optional(),
//                 StreamTitle: z.string().optional(),
//                 major_brand: z.string().optional(),
//                 minor_version: z.string().optional(),
//                 compatible_brands: z.string().optional(),
//                 creation_time: z.string().optional()
//               })
//               .optional(),
//             bit_rate: z.string().optional(),
//             duration: z.string().optional()
//           })
//         })
//         .optional(),
//       error: z.string().optional()
//     })
//   )
// })

// export type FFProbeResults = z.infer<typeof ffProbeSchema>
// export type Config = z.infer<typeof configSchema>

export const escapeHtml = (unsafe: string) => {
  return unsafe.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

/**
 *
 * @param results
 * @returns
 */
export const writeFFProbeResults = async (results: FFProbeStoredResults) => {
  return writeFile(
    'data/ffprobe-stored-results.json',
    JSON.stringify(results, null, 2),
    { encoding: 'utf-8' }
  )
}

/**
 *
 * @returns
 */
export const readFFProbeResults = async (): Promise<FFProbeStoredResults> => {
  const results = await readFile('data/ffprobe-stored-results.json', { encoding: 'utf-8' })
  return ffProbeStoredResultsSchema.parseAsync(JSON.parse(results))
}

/**
 *
 * @param epg
 * @returns
 */
export const writeEPG = async (epg: Xmltv) => {
  return writeFile(
    'data/ffprobe-epg.xml',
    writeXmltv(epg),
    { encoding: 'utf-8' }
  )
}

/**
 *
 * @returns
 */
export const readEPG = async () => {
  return readFile('data/ffprobe-epg.xml', { encoding: 'utf-8' })
}

let cachedConfig:Config | undefined
/**
 *
 * @returns
 */
export const readConfig = async (): Promise<Config> => {
  if (!cachedConfig) {
    const config = await readFile('data/config.json', { encoding: 'utf-8' })
    cachedConfig = await configSchema.parseAsync(JSON.parse(config))
  }
  return cachedConfig
}
