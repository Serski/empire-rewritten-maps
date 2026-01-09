class CampaignPlayer {
  constructor(map, routesGeoJson) {
    this.map = map;
    this.routes = routesGeoJson;
    this.activeCampaign = null;
    this.units = new Map();
    this.isPlaying = false;
    this.speed = 1;
    this.time = 0;
    this.maxTime = 0;
    this.lastTick = null;
    this.onTimeUpdate = null;
    this.onEvent = null;
    this.routeIndex = this.buildRouteIndex(routesGeoJson);
  }

  buildRouteIndex(routesGeoJson) {
    const index = new Map();
    routesGeoJson.features.forEach((feature) => {
      const id = feature.properties.id;
      const coords = feature.geometry.coordinates;
      const distances = [0];
      for (let i = 1; i < coords.length; i += 1) {
        distances.push(distances[i - 1] + this.haversine(coords[i - 1], coords[i]));
      }
      index.set(id, {
        coords,
        distances,
        length: distances[distances.length - 1]
      });
    });
    return index;
  }

  haversine(a, b) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  pointAlongRoute(routeId, t) {
    const route = this.routeIndex.get(routeId);
    if (!route) return null;
    if (route.length === 0) return route.coords[0];

    const target = route.length * t;
    for (let i = 1; i < route.distances.length; i += 1) {
      if (route.distances[i] >= target) {
        const prev = route.coords[i - 1];
        const next = route.coords[i];
        const segmentLength = route.distances[i] - route.distances[i - 1];
        const segmentT = segmentLength === 0 ? 0 : (target - route.distances[i - 1]) / segmentLength;
        return [
          prev[0] + (next[0] - prev[0]) * segmentT,
          prev[1] + (next[1] - prev[1]) * segmentT
        ];
      }
    }
    return route.coords[route.coords.length - 1];
  }

  setCampaign(campaign) {
    this.activeCampaign = campaign;
    this.time = 0;
    this.maxTime = Math.max(...campaign.clips.map((clip) => clip.t1));
    this.clearUnits();
    campaign.units.forEach((unit) => {
      const el = document.createElement('img');
      el.src = unit.banner;
      el.alt = unit.name;
      el.className = 'unit-banner';
      el.style.width = `${unit.size * 160}px`;
      el.style.height = 'auto';
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([0, 0])
        .addTo(this.map);
      this.units.set(unit.id, { ...unit, marker });
    });
    this.update(0, true);
  }

  clearUnits() {
    this.units.forEach((unit) => unit.marker.remove());
    this.units.clear();
  }

  setSpeed(speed) {
    this.speed = Number(speed) || 1;
  }

  setTime(time) {
    this.time = Math.max(0, Math.min(this.maxTime, time));
    this.update(0, true);
  }

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTick = performance.now();
    requestAnimationFrame((t) => this.tick(t));
  }

  pause() {
    this.isPlaying = false;
  }

  tick(timestamp) {
    if (!this.isPlaying) return;
    const delta = (timestamp - this.lastTick) / 1000;
    this.lastTick = timestamp;
    this.update(delta);
    requestAnimationFrame((t) => this.tick(t));
  }

  update(delta, jump = false) {
    if (!this.activeCampaign) return;
    if (!jump) {
      this.time += delta * this.speed;
    }
    if (this.time > this.maxTime) {
      this.time = this.maxTime;
      this.pause();
    }

    const activeClips = this.activeCampaign.clips.filter(
      (clip) => this.time >= clip.t0 && this.time <= clip.t1
    );

    activeClips.forEach((clip) => {
      const unit = this.units.get(clip.unitId);
      if (!unit) return;
      const t = clip.t1 === clip.t0 ? 0 : (this.time - clip.t0) / (clip.t1 - clip.t0);
      const point = this.pointAlongRoute(clip.routeId, t) || [0, 0];
      unit.marker.setLngLat(point);
      this.applyCamera(clip, point, jump);
      if (clip.events && this.onEvent) {
        clip.events.forEach((event) => {
          if (event._fired) return;
          if (this.time >= event.at) {
            event._fired = true;
            this.onEvent(event);
          }
        });
      }
    });

    if (jump) {
      this.activeCampaign.clips.forEach((clip) => {
        if (clip.events) {
          clip.events.forEach((event) => {
            event._fired = this.time >= event.at;
          });
        }
      });
    }

    if (this.onTimeUpdate) {
      this.onTimeUpdate(this.time, this.maxTime);
    }
  }

  applyCamera(clip, point, jump) {
    if (!clip.camera || !this.map) return;
    const mode = clip.camera.mode || 'follow';
    const options = {
      center: point,
      zoom: clip.camera.zoom || this.map.getZoom(),
      pitch: clip.camera.pitch || this.map.getPitch(),
      bearing: clip.camera.bearing || this.map.getBearing(),
      duration: jump ? 0 : 1200
    };

    if (mode === 'follow') {
      this.map.easeTo(options);
    } else if (mode === 'flyTo' && jump) {
      this.map.flyTo(options);
    } else if (mode === 'wide') {
      const route = this.routeIndex.get(clip.routeId);
      if (route) {
        const bounds = route.coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(route.coords[0], route.coords[0]));
        this.map.fitBounds(bounds, { padding: 120, duration: jump ? 0 : 1200 });
      }
    }
  }
}

window.CampaignPlayer = CampaignPlayer;
