const CONFIG = {
  MAPTILER_KEY: '',
  DEFAULT_CENTER: [22.4, 37.3],
  DEFAULT_ZOOM: 6.6,
  STYLE_URLS: {
    maptiler: 'https://api.maptiler.com/maps/terrain/style.json?key={key}',
    fallback: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'osm-base',
          type: 'raster',
          source: 'osm'
        }
      ]
    }
  }
};

const state = {
  places: [],
  routes: null,
  campaigns: [],
  layersConfig: null,
  player: null,
  eventMarkers: [],
  fogEnabled: false,
  baseLayerGroups: {}
};

const formatTime = (time) => {
  const minutes = Math.floor(time);
  const seconds = Math.floor((time - minutes) * 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const buildStyle = () => {
  if (CONFIG.MAPTILER_KEY) {
    return CONFIG.STYLE_URLS.maptiler.replace('{key}', CONFIG.MAPTILER_KEY);
  }
  return CONFIG.STYLE_URLS.fallback;
};

const buildPlacesGeoJson = (places) => ({
  type: 'FeatureCollection',
  features: places.map((place) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: place.coords
    },
    properties: {
      id: place.id,
      name: place.name,
      faction: place.faction,
      type: place.type,
      tags: place.tags.join(', '),
      chapters: place.chapters.join(', '),
      codex: place.codex
    }
  }))
});

const buildBordersGeoJson = () => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [21.1, 38.2],
            [22.3, 38.1],
            [23.2, 37.6],
            [23.2, 36.8],
            [22.4, 36.7],
            [21.5, 36.9],
            [21.1, 37.6],
            [21.1, 38.2]
          ]
        ]
      },
      properties: {
        id: 'morea_border',
        name: 'Despotate Frontier'
      }
    }
  ]
});

const buildFrontLineGeoJson = () => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [22.2, 37.5],
          [22.8, 37.2]
        ]
      },
      properties: {
        id: 'front_line'
      }
    }
  ]
});

const buildFogGeoJson = (center) => {
  if (!center) return null;
  const [lng, lat] = center;
  const radius = 1.1;
  const steps = 64;
  const circle = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    circle.push([lng + Math.cos(angle) * radius, lat + Math.sin(angle) * radius]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-180, -85],
              [180, -85],
              [180, 85],
              [-180, 85],
              [-180, -85]
            ],
            circle
          ]
        },
        properties: {}
      }
    ]
  };
};

const loadKingdomsGeoJson = async () => {
  const response = await fetch('data/kingdoms.geojson');
  if (!response.ok) {
    throw new Error('Failed to load kingdoms data.');
  }
  return response.json();
};

const initMap = async () => {
  try {
    const data = await DataLoader.loadAll();
    state.places = data.places;
    state.routes = data.routes;
    state.campaigns = data.campaigns.campaigns;
    state.layersConfig = data.layers;

    const map = new maplibregl.Map({
      container: 'map',
      style: buildStyle(),
      center: CONFIG.DEFAULT_CENTER,
      zoom: CONFIG.DEFAULT_ZOOM,
      minZoom: 4
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      setupBaseLayers(map);
      addCustomLayers(map);
      setupUI(map);
      enableTimelineDrag();
      setupPlayer(map);
    });

    map.on('error', () => {
      const tileAttribution = document.getElementById('tile-attribution');
      tileAttribution.textContent = 'Tile error: check your style URL or API key.';
    });
  } catch (error) {
    console.error(error);
    document.body.innerHTML = '<p style="padding:2rem">Failed to load map data. Check console for details.</p>';
  }
};

const setupBaseLayers = (map) => {
  if (CONFIG.MAPTILER_KEY) {
    document.getElementById('tile-attribution').textContent = 'Using MapTiler vector tiles.';
  }

  const layers = map.getStyle().layers || [];
  const hideKeywords = state.layersConfig.styleFilters.hideByLayerName;
  layers.forEach((layer) => {
    const id = layer.id.toLowerCase();
    if (hideKeywords.some((keyword) => id.includes(keyword))) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  });

  state.baseLayerGroups = {
    terrain: layers.filter((layer) => /landcover|hillshade|terrain|land/i.test(layer.id)).map((layer) => layer.id),
    rivers: layers.filter((layer) => /waterway|river/i.test(layer.id)).map((layer) => layer.id),
    labels: layers.filter((layer) => /label|place|poi/i.test(layer.id)).map((layer) => layer.id),
    borders: layers.filter((layer) => /boundary|admin/i.test(layer.id)).map((layer) => layer.id)
  };
};

const addCustomLayers = (map) => {
  map.addSource('places', {
    type: 'geojson',
    data: buildPlacesGeoJson(state.places)
  });
  map.addSource('routes', { type: 'geojson', data: state.routes });
  map.addSource('borders', { type: 'geojson', data: buildBordersGeoJson() });
  map.addSource('front-line', { type: 'geojson', data: buildFrontLineGeoJson() });
  map.addSource('fog', { type: 'geojson', data: buildFogGeoJson(CONFIG.DEFAULT_CENTER) });

  loadKingdomsGeoJson()
    .then((kingdomsGeoJson) => {
      map.addSource('kingdoms', { type: 'geojson', data: kingdomsGeoJson });

      map.addLayer({
        id: 'kingdom-fills',
        type: 'fill',
        source: 'kingdoms',
        paint: {
          'fill-color': [
            'match',
            ['get', 'id'],
            'byzantium',
            '#006400',
            'frankish',
            '#8B4513',
            'bulgar',
            '#1f4e8c',
            '#888888'
          ],
          'fill-opacity': 0.3
        }
      });

      map.addLayer({
        id: 'kingdom-borders',
        type: 'line',
        source: 'kingdoms',
        paint: {
          'line-color': [
            'match',
            ['get', 'id'],
            'byzantium',
            '#006400',
            'frankish',
            '#8B4513',
            'bulgar',
            '#1f4e8c',
            '#888888'
          ],
          'line-width': 2
        }
      });
    })
    .catch((error) => {
      console.error(error);
    });

  map.addLayer({
    id: 'routes-glow',
    type: 'line',
    source: 'routes',
    paint: {
      'line-color': ['get', 'defaultColor'],
      'line-width': 6,
      'line-opacity': 0.35,
      'line-blur': 4
    }
  });

  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: 'routes',
    paint: {
      'line-color': ['get', 'defaultColor'],
      'line-width': 2.5,
      'line-dasharray': [
        'case',
        ['==', ['get', 'kind'], 'raid'],
        ['literal', [1.2, 1.5]],
        ['literal', [1, 0]]
      ]
    }
  });

  map.addLayer({
    id: 'border-lines',
    type: 'line',
    source: 'borders',
    paint: {
      'line-color': '#f2e6d2',
      'line-width': 2,
      'line-dasharray': [2, 1],
      'line-opacity': 0.8
    }
  });

  map.addLayer({
    id: 'front-line',
    type: 'line',
    source: 'front-line',
    paint: {
      'line-color': '#ff6b6b',
      'line-width': 1.5,
      'line-dasharray': [0.5, 1.2],
      'line-opacity': 0.8
    }
  });

  map.addLayer({
    id: 'place-pins',
    type: 'circle',
    source: 'places',
    paint: {
      'circle-color': '#c9a85b',
      'circle-radius': 5,
      'circle-stroke-color': '#0b1016',
      'circle-stroke-width': 2
    }
  });

  map.addLayer({
    id: 'place-labels',
    type: 'symbol',
    source: 'places',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular'],
      'text-size': 12,
      'text-offset': [0, 1.2],
      'text-anchor': 'top'
    },
    paint: {
      'text-color': '#e6e6e6',
      'text-halo-color': '#0b1016',
      'text-halo-width': 1.2
    }
  });

  map.addLayer({
    id: 'fog-layer',
    type: 'fill',
    source: 'fog',
    paint: {
      'fill-color': '#0b1016',
      'fill-opacity': 0.65
    },
    layout: { visibility: 'none' }
  });

  map.on('click', 'place-pins', (event) => {
    const feature = event.features[0];
    if (feature) {
      openCodexCard(feature.properties);
    }
  });

  map.on('mouseenter', 'place-pins', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'place-pins', () => {
    map.getCanvas().style.cursor = '';
  });
};

const setupPlayer = (map) => {
  const player = new CampaignPlayer(map, state.routes);
  state.player = player;

  const campaignSelect = document.getElementById('campaign-select');
  campaignSelect.innerHTML = '';
  state.campaigns.forEach((campaign) => {
    const option = document.createElement('option');
    option.value = campaign.id;
    option.textContent = `${campaign.title} (${campaign.timeSpanLabel})`;
    campaignSelect.append(option);
  });

  campaignSelect.addEventListener('change', () => {
    const selected = state.campaigns.find((c) => c.id === campaignSelect.value);
    if (selected) {
      loadCampaign(selected);
    }
  });

  loadCampaign(state.campaigns[0]);

  player.onTimeUpdate = (time, maxTime) => {
    document.getElementById('time-label').textContent = formatTime(time);
    const scrub = document.getElementById('timeline-scrub');
    scrub.value = time;
    scrub.max = maxTime;
    updateFog();
  };

  player.onEvent = (event) => {
    if (!event.coords) return;
    const el = document.createElement('div');
    el.className = 'event-battle';
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(event.coords)
      .addTo(map);
    state.eventMarkers.push(marker);
  };

  document.getElementById('play-toggle').addEventListener('click', () => {
    const button = document.getElementById('play-toggle');
    if (player.isPlaying) {
      player.pause();
      button.textContent = 'Play';
    } else {
      player.play();
      button.textContent = 'Pause';
    }
  });

  document.getElementById('timeline-scrub').addEventListener('input', (event) => {
    player.setTime(Number(event.target.value));
  });

  document.getElementById('speed-select').addEventListener('change', (event) => {
    player.setSpeed(event.target.value);
  });
};

const loadCampaign = (campaign) => {
  state.eventMarkers.forEach((marker) => marker.remove());
  state.eventMarkers = [];
  state.player.setCampaign(campaign);
  const eventList = document.getElementById('event-list');
  eventList.innerHTML = '';
  campaign.clips.forEach((clip) => {
    if (!clip.events) return;
    clip.events.forEach((event) => {
      const li = document.createElement('li');
      li.textContent = `${formatTime(event.at)} · ${event.text}`;
      li.addEventListener('click', () => {
        state.player.setTime(event.at);
        if (event.coords) {
          state.player.map.flyTo({ center: event.coords, zoom: 7.8, duration: 1200 });
        }
      });
      eventList.append(li);
    });
  });
};

const setupUI = (map) => {
  const layerPanel = document.getElementById('layer-panel');
  document.getElementById('toggle-panel').addEventListener('click', () => {
    layerPanel.style.display = layerPanel.style.display === 'flex' ? 'none' : 'flex';
  });

  document.querySelectorAll('#layer-panel input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const layer = checkbox.dataset.layer;
      const visible = checkbox.checked ? 'visible' : 'none';
      if (layer === 'routes') {
        map.setLayoutProperty('routes-glow', 'visibility', visible);
        map.setLayoutProperty('routes-line', 'visibility', visible);
      } else if (layer === 'pins') {
        map.setLayoutProperty('place-pins', 'visibility', visible);
      } else if (layer === 'labels') {
        map.setLayoutProperty('place-labels', 'visibility', visible);
        (state.baseLayerGroups.labels || []).forEach((id) => map.setLayoutProperty(id, 'visibility', visible));
      } else if (layer === 'borders') {
        map.setLayoutProperty('border-lines', 'visibility', visible);
      } else if (layer === 'kingdoms') {
        map.setLayoutProperty('kingdom-fills', 'visibility', visible);
        map.setLayoutProperty('kingdom-borders', 'visibility', visible);
      } else if (layer === 'fog') {
        map.setLayoutProperty('fog-layer', 'visibility', visible);
        state.fogEnabled = checkbox.checked;
      } else if (state.baseLayerGroups[layer]) {
        state.baseLayerGroups[layer].forEach((id) => map.setLayoutProperty(id, 'visibility', visible));
      }
    });
  });

  document.getElementById('codex-close').addEventListener('click', () => {
    document.getElementById('codex').style.display = 'none';
  });

  const searchInput = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!query) {
      results.style.display = 'none';
      return;
    }
    const matches = state.places.filter((place) => place.name.toLowerCase().includes(query));
    matches.forEach((place) => {
      const button = document.createElement('button');
      button.textContent = place.name;
      button.addEventListener('click', () => {
        map.flyTo({ center: place.coords, zoom: 8.2, duration: 1200 });
        openCodexCard(place);
        results.style.display = 'none';
        searchInput.value = '';
      });
      results.append(button);
    });
    results.style.display = matches.length ? 'block' : 'none';
  });

  document.addEventListener('click', (event) => {
    if (!results.contains(event.target) && event.target !== searchInput) {
      results.style.display = 'none';
    }
  });
};

const enableTimelineDrag = () => {
  const timelinePanel = document.querySelector('.panel--timeline');
  if (!timelinePanel) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  timelinePanel.addEventListener('mousedown', (event) => {
    dragging = true;
    offsetX = event.clientX - timelinePanel.offsetLeft;
    offsetY = event.clientY - timelinePanel.offsetTop;
  });

  document.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    timelinePanel.style.left = `${event.clientX - offsetX}px`;
    timelinePanel.style.top = `${event.clientY - offsetY}px`;
    timelinePanel.style.right = 'auto';
    timelinePanel.style.bottom = 'auto';
    timelinePanel.style.transform = 'none';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
  });
};

const openCodexCard = (properties) => {
  const codex = document.getElementById('codex');
  const content = document.getElementById('codex-content');
  const tags = properties.tags ? properties.tags.split(', ') : [];
  const chapters = properties.chapters ? properties.chapters.split(', ') : [];
  content.innerHTML = `
    <h2>${properties.name}</h2>
    <p class="muted">${properties.faction} · ${properties.type}</p>
    <p>${properties.codex}</p>
    <p><strong>Tags:</strong> ${tags.join(', ') || '—'}</p>
    <p><strong>Chapters:</strong> ${chapters.map((ch) => `Ch ${ch}`).join(', ') || '—'}</p>
  `;
  codex.style.display = 'block';
};

const updateFog = () => {
  if (!state.fogEnabled) return;
  const firstUnit = Array.from(state.player.units.values())[0];
  if (!firstUnit) return;
  const lngLat = firstUnit.marker.getLngLat();
  const fogSource = state.player.map.getSource('fog');
  if (fogSource) {
    fogSource.setData(buildFogGeoJson([lngLat.lng, lngLat.lat]));
  }
};

initMap();
