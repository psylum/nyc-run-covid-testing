class Mapbox {

  constructor(centers) {
    this.centers = centers
    console.log('this.centers :>> ', this.centers);
    mapboxgl.accessToken = process.env.NODE_ENV_MAPBOX_ACCESS_TOKEN;
    this.map = new mapboxgl.Map({
      container: 'map', // container ID
      style: 'mapbox://styles/mapbox/streets-v11', // style URL
      center: [-74.0183, 40.7077], // starting position [lng, lat]
      zoom: 11 // starting zoom
    });
  }

  includeTimes(times) {
    this.centers.filter(c => c).map(center => {
      const timesLookup = new Map(times.map(time => [time.fullname, time]));
      let popup = formatPopup(center);
      if (timesLookup.has(center.name)) {
        const { wait_time, last_reported } = timesLookup.get(center.name)
        popup = formatPopup(center, ({ wait_time, last_reported }));
      }
      const marker = new mapboxgl.Marker()
        .setLngLat(center.coordinates)
        .setPopup(new mapboxgl.Popup().setHTML(popup))
      const siteType = center.siteType || '';
      // inject the type icon if one is present.
      if (siteType) {
        const textElt =
          document.createElementNS("http://www.w3.org/2000/svg", 'text');
        textElt.setAttribute("x", "-2");
        textElt.setAttribute("y", "11");
        textElt.setAttribute("class", 'marker-icon');
        textElt.textContent = typeIcon(siteType);
        const markerElt = marker.getElement();
        const circles = markerElt.getElementsByTagNameNS(
          "http://www.w3.org/2000/svg", 'circle');
        if (circles) {Array.from(circles).pop().parentNode.append(textElt)}
      }
      marker.addTo(this.map)
    })
  }

};

const formatPopup = (location, waitTimeObj) => (`
  <div class="font-sans px-2">
    <h3 class="text-lg font-bold py-1">${typeIcon(location.siteType || '')} ${location.name}</h3>
    <h3 class="text-md font-bold py-1">Location</h3>
    ${location.address.reduce((t, v) => t.concat(`<p class="text-md">${v}</p>`), '')}
    ${location.testType ? `<h3 class="text-md font-bold py-1">Testing Types</h3><p class="text-md">${location.testType}</p>` : ''}
    <h3 class="text-md font-bold py-1">Details</h3>
    ${location.context.filter(d => d !== "Pre-register for your visit").reduce((t, v) => t.concat(`<p class="text-md">${v}</p>`), '')}
    ${waitTimeObj ? `<h3 class="text-md font-bold py-1">Wait Times</h3><p>Current wait time: ${waitTimeObj.wait_time}</p><p>Wait time last reported: ${waitTimeObj.last_reported}</p>` : ''}
  </div>
`);

const typeIcon = (locationType) => {
  switch(locationType) {
    case 'mortar': return '🏥';
    case 'mobile': return '🚑';
    case 'micro': return '⛺️';
    default: return '';
  }
}

export default Mapbox;