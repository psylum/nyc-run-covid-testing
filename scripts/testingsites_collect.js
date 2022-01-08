const axios = require("axios");
const cheerio = require("cheerio");
const cliProgress = require('cli-progress');
const fs = require("fs").promises;
require('dotenv').config();

const url = "https://www.nychealthandhospitals.org/covid-19-testing-sites/";
const dataFile = "data/centers.json";
let existingData;
let progress;

async function loadData() {
  try {
    const data = await fs.readFile(dataFile);
    existingData = JSON.parse(data.toLocaleString());
  } catch (e) {
    // ignore any issue trying to read an existing file.
  }
}

async function scrapeData() {
  try {
    // Fetch HTML of the page we want to scrape
    const { data } = await axios.get(url);
    // Load HTML we fetched in the previous line
    const $ = cheerio.load(data);
    // Select all the section headers and their associated entries
    // Or if they're not found, fall back to finding the known entry class.
    const elements = [];
    const headers = $("h3.m-b-20");
    if (headers.length) {
      for (const helt of headers) {
        const heltId = helt.attribs.id;
        const heltIdx = heltId.lastIndexOf("-");
        const boroughVal = heltId.slice(0, heltIdx);
        const heltText = $(helt).text();
        const borough = boroughVal.split("-").map(
          word => word.charAt(0).toUpperCase()+word.slice(1)).join(" ");
        const siteType = heltId.slice(heltIdx+1);
        const testType = heltText.includes(':') ? heltText.split(': ').pop() : '';
        let nextNode = helt.next;
        while (nextNode && (nextNode.type.toLowerCase() === 'text'
                            || nextNode.name.toLowerCase() === 'p'))
        {
          if (nextNode.type.toLowerCase() === 'tag') {
            elements.push({borough, siteType, testType, raw: $(nextNode).text()})
          }
          nextNode = nextNode.next;
        }
      }
    }
    else {
      const entries = $("p.m-b-20").map((_, el) => {
        return {raw: $(el).text()}
      }).toArray();
      elements.push(...entries)
    }

    console.log(`LOG | Scraping ${elements.length} items...`)
    Promise.all(elements) // asynchronously scrape details
      .then((data) => synchronousPromiseAll(data, geocodeLocation)) // synchronously get coordinates to stay under query limit (rather than asynchronous)
      .then((centers) => {  // write all data to a file
        const data = ({
          timestamp: new Date(),
          centers,
        })
        fs.writeFile(dataFile, JSON.stringify(data, null, 2)).then(() => {
          console.log("LOG | Successfully written data to file");
        }).catch((err) => {
          if (err) {
            console.error(err);
          }
        });
      })

  } catch (err) {
    console.error(err);
  }
}

// Load existing data (if available), then run the scraper.
loadData().then(scrapeData);

// src: https://stackoverflow.com/questions/29880715/how-to-synchronize-a-sequence-of-promises
function synchronousPromiseAll(array, fn) {

  console.log(`LOG | Beginning geocode of ${array.length} items...`)
  progress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progress.start(array.length, 1)

  let results = [];
  return array.reduce(function(p, item, i, all) {
      return p.then(function() {
          return fn(item, i, all).then(function(data) {
              results.push(data);
              return results;
          });
      });
  }, Promise.resolve());
}

function geocodeLocation(obj, index, all) {
  const item = obj.raw;
  const num = index + 1;
  progress.update(num);
  if (num === all.length) {
    progress.stop();
  } 

  const location = item.trim()
    .replace(/\t/g, '')
    .split(/\n/g);

  const name = location[0]
  const address = location.slice(1, 3).map(d => d.trim())
  // don't geocode an address when it's already available.
  const existingEntry = (existingData.centers || []).find(
    ctr => ctr && ctr.address.every((v,i) => v === address[i]))
  if (existingEntry && existingEntry.coordinates)
  {
    return Promise.resolve({
      name,
      address,
      borough: obj.borough || undefined,
      siteType: obj.siteType || undefined,
      testType: obj.testType || undefined,
      coordinates: existingEntry.coordinates,
      context: location.slice(3).map(d => d.trim()),
    })
  }
  // else run the geocoder.

  const trimAndConcatAddress = [name, ...address]
    .reduce((t, v, i) => {
      if (i === 0) return v
      return t.concat(`+${v}`)
    }, '')
    .replace(/ /g, '+');
  const geocoderQuery = encodeURIComponent(trimAndConcatAddress)

  return axios.get(`https://maps.googleapis.com/maps/api/geocode/json?address=${geocoderQuery}&key=${process.env.GOOGLE_API_KEY}`)
    .then(res => res.data)
    .then(json => {
      if (json.results.length === 0) {
        console.log("ERROR | ", json)
        return null
      } else {
      }
      let lat = json.results['0'].geometry.location.lat
      let lng = json.results['0'].geometry.location.lng
      return ({
        name,
        address,
        borough: obj.borough || undefined,
        siteType: obj.siteType || undefined,
        testType: obj.testType || undefined,
        coordinates: ({ lat, lng }),
        context: location.slice(3).map(d => d.trim()),
      })
    });
}

