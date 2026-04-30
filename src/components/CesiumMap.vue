<template>
  <div class="cesium-container" ref="containerRef"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as Cesium from 'cesium'
import { invoke } from '@tauri-apps/api/core'
import type { Track, TrackPoint } from '../types/track'
import { useTrackStyle } from '../composables/useTrackStyle'
import { useLayerVisibility } from '../composables/useLayerVisibility'
import { useLabelVisibility } from '../composables/useLabelVisibility'

const props = defineProps<{
  tracks: Track[]
  replayTime: number | null
}>()

const containerRef = ref<HTMLDivElement>()

let viewer: Cesium.Viewer | null = null
const { getColor, getIcon } = useTrackStyle()
const { visibility } = useLayerVisibility()
const { showLabels } = useLabelVisibility()

const LABEL_FONT_BASE = '12px sans-serif'
const LABEL_FONT_LARGE = '18px sans-serif'

interface TrackEntities {
  polyline: Cesium.Entity | undefined
  billboard: Cesium.Entity
  source: string
  labelText: string
}

const entityMap = new Map<string, TrackEntities>()

function findPositionAtTime(points: TrackPoint[], time: number): TrackPoint | null {
  if (points.length === 0) return null
  if (time <= points[0].timestamp) return points[0]
  if (time >= points[points.length - 1].timestamp) return points[points.length - 1]

  let lo = 0
  let hi = points.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].timestamp <= time) lo = mid
    else hi = mid
  }

  const dt = points[hi].timestamp - points[lo].timestamp
  const t = dt > 0 ? (time - points[lo].timestamp) / dt : 0

  return {
    timestamp: points[lo].timestamp,
    latitude: points[lo].latitude + (points[hi].latitude - points[lo].latitude) * t,
    longitude: points[lo].longitude + (points[hi].longitude - points[lo].longitude) * t,
    altitude: points[lo].altitude + (points[hi].altitude - points[lo].altitude) * t,
    heading: points[lo].heading + (points[hi].heading - points[lo].heading) * t,
    groundSpeed: points[lo].groundSpeed + (points[hi].groundSpeed - points[lo].groundSpeed) * t,
    verticalRate: points[lo].verticalRate + (points[hi].verticalRate - points[lo].verticalRate) * t,
  }
}

function createTrackEntities(track: Track) {
  if (!viewer || track.positions.length === 0) return

  const color = getColor(track.source)
  const icon = getIcon(track.source)
  const last = track.positions[track.positions.length - 1]

  let polyline: Cesium.Entity | undefined
  if (track.positions.length >= 2) {
    polyline = viewer.entities.add({
      polyline: {
        positions: track.positions.map((p) =>
          Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.altitude),
        ),
        width: 1.5,
        material: color.withAlpha(0.7),
        clampToGround: false,
      },
    })
  }

  const label = [track.metadata.flightNumber, track.metadata.aircraftType]
    .filter(Boolean)
    .join(' | ')

  const billboard = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(last.longitude, last.latitude, last.altitude),
    billboard: {
      image: icon,
      scale: 0.7,
    },
    label: {
      text: showLabels.value ? (label || track.id) : '',
      font: showLabels.value ? LABEL_FONT_LARGE : LABEL_FONT_BASE,
      fillColor: color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -20),
    },
  })

  entityMap.set(track.id, { polyline, billboard, source: track.source, labelText: label || track.id })
}

function removeTrackEntities(id: string) {
  const entry = entityMap.get(id)
  if (entry && viewer) {
    if (entry.polyline) viewer.entities.remove(entry.polyline)
    viewer.entities.remove(entry.billboard)
    entityMap.delete(id)
  }
}

function clearAllEntities() {
  if (!viewer) return
  for (const [id] of entityMap) {
    removeTrackEntities(id)
  }
}

function syncEntities(newTracks: Track[]) {
  if (!viewer) return

  const newIds = new Set(newTracks.map((t) => t.id))
  const oldIds = new Set(entityMap.keys())

  viewer.entities.suspendEvents()

  for (const id of oldIds) {
    if (!newIds.has(id)) removeTrackEntities(id)
  }

  for (const track of newTracks) {
    if (!entityMap.has(track.id)) createTrackEntities(track)
  }

  viewer.entities.resumeEvents()
  viewer.scene.requestRender()
}

watch(
  () => props.tracks,
  (newTracks) => syncEntities(newTracks),
  { deep: false },
)

function updateReplayPositions(time: number) {
  if (!viewer) return
  for (const track of props.tracks) {
    const entities = entityMap.get(track.id)
    if (!entities) continue
    const point = findPositionAtTime(track.positions, time)
    if (!point) continue
    entities.billboard.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, point.altitude),
    )
  }
  viewer.scene.requestRender()
}

let wasReplaying = false
watch(
  () => props.replayTime,
  (time) => {
    if (time !== null) {
      updateReplayPositions(time)
      wasReplaying = true
    } else if (wasReplaying) {
      wasReplaying = false
      for (const track of props.tracks) {
        const entities = entityMap.get(track.id)
        if (!entities || track.positions.length === 0) continue
        const last = track.positions[track.positions.length - 1]
        entities.billboard.position = new Cesium.ConstantPositionProperty(
          Cesium.Cartesian3.fromDegrees(last.longitude, last.latitude, last.altitude),
        )
      }
      viewer?.scene.requestRender()
    }
  },
)

watch(
  visibility,
  () => {
    for (const [, entities] of entityMap) {
      const vis = visibility.value[entities.source as keyof typeof visibility.value]
      if (entities.polyline) entities.polyline.show = vis
      entities.billboard.show = vis
    }
    viewer?.scene.requestRender()
  },
  { deep: true },
)

// Toggle label visibility and font size in-place (no rebuild)
watch(showLabels, (val) => {
  for (const [, entities] of entityMap) {
    if (entities.billboard.label) {
      const lbl = entities.billboard.label as any
      lbl.text = val ? entities.labelText : ''
      lbl.font = val ? LABEL_FONT_LARGE : LABEL_FONT_BASE
    }
  }
  viewer?.scene.requestRender()
})

function resetView() {
  if (!viewer) return
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(110, 25, 12000000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    duration: 1.0,
  })
}

function flyToTrack(track: Track) {
  if (!viewer || track.positions.length === 0) return
  const last = track.positions[track.positions.length - 1]
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(last.longitude, last.latitude, last.altitude + 8000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
    duration: 1.5,
  })
}

onMounted(async () => {
  if (!containerRef.value) return

  const port: number = await invoke('get_tile_server_port')

  viewer = new Cesium.Viewer(containerRef.value, {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    navigationInstructionsInitiallyVisible: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    skyBox: false,
    skyAtmosphere: false,
    baseLayer: false,
  })

  viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: `http://127.0.0.1:${port}/tiles/{z}/{x}/{y}.png`,
      minimumLevel: 0,
      maximumLevel: 8,
      tileWidth: 256,
      tileHeight: 256,
    }),
  )

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(110, 25, 12000000),
  })

  syncEntities(props.tracks)
})

onUnmounted(() => {
  clearAllEntities()
  if (viewer) {
    viewer.destroy()
    viewer = null
  }
})

defineExpose({ getViewer: () => viewer, flyToTrack, resetView })
</script>

<style scoped>
.cesium-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
