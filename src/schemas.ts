import { z } from 'zod'

/**
 * Parameters used to execute an ffProbe
 */
const fFProbeParametersSchema = z.object({
  track: z.object({
    comments: z.array(
      z.object({
        text: z.string()
      })
    ),
    title: z.string().optional(),
    album: z.string().optional(),
    artist: z.string().optional(),
    metadata: z.record(z.string()),
    genre: z.string().optional(),
    fileSize: z.number().optional(),
    duration: z.number().optional(),
    image: z.string().optional(),
    group: z.string().optional(),
    url: z.string()
  }),
  timeout: z.number(),
  userAgent: z.string(),
  httpReferer: z.string().optional()
})
/**
 * Data returned by FFPRobe
 */
export const ffProbeDataSchema = z.object({
  streams: z.array(
    z.object({
      index: z.number(),
      codec_name: z.string().optional(),
      codec_long_name: z.string().optional(),
      codec_type: z.string().optional(),
      codec_tag_string: z.string().optional(),
      codec_tag: z.string().optional(),
      r_frame_rate: z.string().optional(),
      avg_frame_rate: z.string().optional(),
      time_base: z.string().optional(),
      profile: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      coded_width: z.number().optional(),
      coded_height: z.number().optional(),
      closed_captions: z.number().optional(),
      film_grain: z.number().optional(),
      has_b_frames: z.number().optional(),
      sample_aspect_ratio: z.string().optional(),
      display_aspect_ratio: z.string().optional(),
      pix_fmt: z.string().optional(),
      level: z.number().optional(),
      chroma_location: z.string().optional(),
      refs: z.number().optional(),
      is_avc: z.string().optional(),
      nal_length_size: z.string().optional(),
      start_pts: z.number().optional(),
      start_time: z.string().optional(),
      bits_per_raw_sample: z.string().optional(),
      extradata_size: z.number().optional(),
      sample_fmt: z.string().optional(),
      sample_rate: z.string().optional(),
      channels: z.number().optional(),
      channel_layout: z.string().optional(),
      bits_per_sample: z.number().optional(),
      initial_padding: z.number().optional(),
      color_range: z.string().optional(),
      color_space: z.string().optional(),
      color_transfer: z.string().optional(),
      color_primaries: z.string().optional(),
      bit_rate: z.string().optional(),
      side_data_list: z
        .array(z.object({ side_data_type: z.string() }))
        .optional(),
      view_ids_available: z.string().optional(),
      view_pos_available: z.string().optional(),
      field_order: z.string().optional(),
      id: z.string().optional(),
      duration_ts: z.number().optional(),
      duration: z.string().optional(),
      nb_frames: z.string().optional(),
      disposition: z.record(z.any())
        .and(z
          .object({
            default: z.number().optional(),
            dub: z.number().optional(),
            original: z.number().optional(),
            comment: z.number().optional(),
            lyrics: z.number().optional(),
            karaoke: z.number().optional(),
            forced: z.number().optional(),
            hearing_impaired: z.number().optional(),
            visual_impaired: z.number().optional(),
            clean_effects: z.number().optional(),
            attached_pic: z.number().optional(),
            timed_thumbnails: z.number().optional(),
            non_diegetic: z.number().optional(),
            captions: z.number().optional(),
            descriptions: z.number().optional(),
            metadata: z.number().optional(),
            dependent: z.number().optional(),
            still_image: z.number().optional(),
            multilayer: z.number().optional()
          })
        ),
      tags: z.record(z.union([z.string(), z.number()])).optional()
    })
  ),
  format: z
    .object({
      filename: z.string().optional(),
      nb_streams: z.number().optional(),
      nb_programs: z.number().optional(),
      nb_stream_groups: z.number().optional(),
      format_name: z.string().optional(),
      format_long_name: z.string().optional(),
      start_time: z.string().optional(),
      size: z.string().optional(),
      probe_score: z.number().optional(),
      duration: z.string().optional(),
      bit_rate: z.string().optional(),
      tags: z.record(z.union([z.string(), z.number()])).optional()
    })
})

/**
 * Result of one ffProbe
 */
const ffprobeResultSchema = z.union([
  z
    .object({
      ok: z.literal(false),
      channelNumber: z.number(),
      channelName: z.string(),
      params: fFProbeParametersSchema,
      error: z.string(),
    }),
  z
    .object({
      ok: z.literal(true),
      channelNumber: z.number(),
      channelName: z.string(),
      params: fFProbeParametersSchema,
      metadata: ffProbeDataSchema
    })
])

/**
 * data/ffprobe-stored-results.json
 */
export const ffProbeStoredResultsSchema = z.object({
  date: z.number(),
  results: z.array(ffprobeResultSchema)
})

/**
 * data/config.json
 */
export const configSchema = z.object({
  iptvPlaylists: z.array(z.string()).nonempty(),
  epgSources: z.array(z.string()).nonempty(),
  rakutenEpg: z.object({
    enabled: z.boolean(),
    classification_id: z.number(),
    locale: z.string(),
    market_code: z.string()
  })
})

export type FfprobeData = z.infer<typeof ffProbeDataSchema>
export type FFProbeResult = z.infer<typeof ffprobeResultSchema>
export type FFProbeStoredResults = z.infer<typeof ffProbeStoredResultsSchema>
export type FFProbeParameters = z.infer<typeof fFProbeParametersSchema>
export type Config = z.infer<typeof configSchema>
