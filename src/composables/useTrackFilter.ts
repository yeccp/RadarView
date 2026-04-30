import { computed, reactive, type Ref } from 'vue'
import type { Track } from '../types/track'

export interface SourceRange {
  min: number
  max: number
  currentMin: number
  currentMax: number
  active: boolean
}

export function useTrackFilter(tracks: Ref<Track[]>) {
  const ranges = reactive<Record<string, SourceRange>>({})

  function computeRanges() {
    const sourceMinMax: Record<string, { min: number; max: number }> = {}

    for (const t of tracks.value) {
      const src = t.source
      for (const p of t.positions) {
        if (!p.timestamp) continue
        if (!sourceMinMax[src]) {
          sourceMinMax[src] = { min: p.timestamp, max: p.timestamp }
        } else {
          if (p.timestamp < sourceMinMax[src].min) sourceMinMax[src].min = p.timestamp
          if (p.timestamp > sourceMinMax[src].max) sourceMinMax[src].max = p.timestamp
        }
      }
    }

    for (const [src, mm] of Object.entries(sourceMinMax)) {
      if (!ranges[src]) {
        ranges[src] = {
          min: mm.min, max: mm.max,
          currentMin: mm.min, currentMax: mm.max,
          active: false,
        }
      } else {
        if (mm.min < ranges[src].min) {
          ranges[src].min = mm.min
          ranges[src].currentMin = mm.min
        }
        if (mm.max > ranges[src].max) {
          ranges[src].max = mm.max
          ranges[src].currentMax = mm.max
        }
      }
    }
  }

  const filteredTracks = computed<Track[]>(() => {
    computeRanges()

    // Check if any range is actually filtered (non-default)
    let hasActive = false
    for (const r of Object.values(ranges)) {
      if (r.currentMin > r.min || r.currentMax < r.max) {
        r.active = true
        hasActive = true
      } else {
        r.active = false
      }
    }

    if (!hasActive) return tracks.value

    return tracks.value
      .map((track) => {
        const range = ranges[track.source]
        if (!range || !range.active) return track

        const filtered = track.positions.filter(
          (p) => p.timestamp >= range.currentMin && p.timestamp <= range.currentMax,
        )

        if (filtered.length === 0) return null

        return { ...track, positions: filtered }
      })
      .filter((t): t is Track => t !== null)
  })

  return { ranges, filteredTracks }
}
