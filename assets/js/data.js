const DataLoader = (() => {
  const loadJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url}`);
    }
    return response.json();
  };

  const loadAll = async () => {
    const [places, routes, campaigns, layers] = await Promise.all([
      loadJson('data/places.json'),
      loadJson('data/routes.geojson'),
      loadJson('data/campaigns.json'),
      loadJson('data/layers.json')
    ]);

    return { places, routes, campaigns, layers };
  };

  return { loadAll };
})();
