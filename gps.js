
(() => {
  class MapManager {
    constructor() {
      mapboxgl.accessToken = "pk.eyJ1IjoiYW50LXNoZWxlbmtlciIsImEiOiJjbWgwejhoMGowbWpxZnRwdTd0eHloeHoxIn0.0jkWtjN2ReKCcKswTH2Oqw";

      this.map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/streets-v12",
        center: [-76.70675, 39.2533],
        zoom: 12
      });

      this.map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    }

    createMarker(coordinates, color = "red", popupText = "Marker") {
      const marker = new mapboxgl.Marker({ color })
        .setLngLat(coordinates)
        .setPopup(new mapboxgl.Popup().setHTML(`<h3>${popupText}</h3>`))
        .addTo(this.map);
      return marker;
    }
  }

  class GPS {
    constructor(map) {
      this.map = map;
      this.userLocation = null;
      this.watchId = null;
      this.currentRoute = null;
      this.locationAcquired = false;

      this.userMarker = new mapboxgl.Marker({ color: "blue" })
        .setPopup(new mapboxgl.Popup().setHTML("<h3>You are here!</h3>"));
    }

    trackLocation() {
      if (!navigator.geolocation) {
        console.error("Geolocation is not supported by this browser.");
        return;
      }

      if (!this.map.loaded()) {
        this.map.once('load', () => this.startTracking());
      } else {
        this.startTracking();
      }
    }

    startTracking() {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {

          
          const coords = [pos.coords.longitude, pos.coords.latitude];

          // apparently when gps is slow, map relies on fallback = ip basedl ocation which SUCKS. so ignore
          if (pos.coords.accuracy > 100) {
            console.log("position inaccurate, ignoring")
            return;
          }

          this.userLocation = coords;
          console.log("Position update:", coords);

          if (!this.locationAcquired) {
            this.locationAcquired = true;
            this.userMarker.setLngLat(coords).addTo(this.map);
            console.log("First location acquired:", coords);
            if (coords && coords.length === 2) this.map.panTo(coords);
            if (this.onLocationAcquired) this.onLocationAcquired(coords);
          } else {
            this.userMarker.setLngLat(coords);
            if (coords && coords.length === 2) this.map.panTo(coords);
          }
        },
        (error) => console.error("Error getting location:", error.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
      );
    }

    stopTracking() {
      if (this.watchId !== null) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
    }

    async createRoute(endCoords) {
      console.log("createRoute called", { userLocation: this.userLocation, endCoords });

      if (!this.userLocation) {
        console.error("User location not available yet");
        return;
      }

      const start = this.userLocation;
      const end = endCoords;
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`;

      // update the marker, during testing sometimes the gps finally gets real pos but doesnt redraw marker and it dangles
      if (this.userMarker) {
        this.userMarker.setLngLat(start);
      }

      try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0].geometry;

          // Remove previous route
          if (this.map.getLayer('route')) this.map.removeLayer('route');
          if (this.map.getSource('route')) this.map.removeSource('route');

          // Add new route
          this.map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: route }
          });

          this.map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#3887be', 'line-width': 5, 'line-opacity': 0.75 }
          });

          // Fit bounds
          const coordinates = route.coordinates;
          const bounds = coordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
          this.map.fitBounds(bounds, { padding: 50 });

          this.currentRoute = route;
          console.log("Route drawn successfully!");
          return data.routes[0];
        } else {
          console.error("No routes found in response");
        }
      } catch (err) {
        console.error("Error creating route:", err);
      }
    }

    clearRoute() {
      if (this.map.getLayer('route')) this.map.removeLayer('route');
      if (this.map.getSource('route')) this.map.removeSource('route');
      this.currentRoute = null;
    }
  }

  let mapInstance = null;
  let gpsInstance = null;

  function initMapbox() {
    if (!mapInstance) {
      mapInstance = new MapManager();
      mapInstance.map.on('load', () => {
        gpsInstance = new GPS(mapInstance.map);
        gpsInstance.trackLocation();

      });
      
    }

    try { globalThis.mapInstance = mapInstance; } catch (e) {}
    try { globalThis.gpsInstance = gpsInstance; } catch (e) {}
  }

  // wraps route creation
  function createRouteFromFlutter(lng, lat) {
    if (gpsInstance && typeof gpsInstance.createRoute === 'function') {
      gpsInstance.createRoute([lng, lat]);
    } else {
      console.warn('gpsInstance not ready — initMapbox() may not have been called yet.');
    }
  }

 
  globalThis.initMapbox = initMapbox;
  globalThis.createRouteFromFlutter = createRouteFromFlutter;

})();
