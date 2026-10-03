// The libraries the page loads from jsDelivr, served to the browsers of the
// three browser runs from a local folder instead of the network.
//
// The built file keeps its CDN URLs; only the browser contexts of the runs
// answer those requests, with the files of exactly the pinned versions. A
// file of an exact version on jsDelivr does not change, so the URL is the key:
// https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.min.js lies in
// tests/.cdn/npm/mermaid@12.0.0/dist/mermaid.min.js. The folder is not part of
// the repository (tests/.gitignore).
//
//   const libraries = await prepareLibraries(fileUnderTest);   // before anything is built
//   await libraries.serve(context);                             // in every browser context
//   libraries.served                                            // what was answered, for the report
//   libraries.refused                                           // what was asked for and not served
//
// prepareLibraries() reads the URLs the file under test and src/index.html
// name. A URL without an exact version stops the run, and so does a file that
// is not in the folder yet and cannot be fetched: the message names the URL. A
// missing file is fetched once, from that URL, and kept.
//
// serve() answers every request to cdn.jsdelivr.net in a context, over https
// and over http. One of the URLs above gets its file and is listed in
// `served`; any other one fails, is never fetched live, and is listed in
// `refused`, which every run reports and fails on.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Both schemes: a request over http would otherwise pass the route and go to
// the network. The local file is keyed by the path below the host.
const HOST = /^https?:\/\/cdn\.jsdelivr\.net\//;
export const LIBRARY_FOLDER = path.join(here, '.cdn');
// A package on jsDelivr's npm path, at an exact version: 1.2.3, or 1.2.3-rc.1.
const EXACT = /^https?:\/\/cdn\.jsdelivr\.net\/npm\/(?:@[\w.-]+\/)?[\w.-]+@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\/[^?#]+$/;
const URL_IN_TEXT = /https?:\/\/cdn\.jsdelivr\.net\/[^"'\s<>`()\\]+/g;
const TYPES = { '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

// The version a URL names, or null when it names none that is exact.
export const versionOf = url => (url.match(EXACT) || [])[1] || null;
const below = url => url.replace(HOST, '');
const localFile = url => path.join(LIBRARY_FOLDER, ...below(url).split('/'));

// Fetches one file into the folder. Written beside its place first and then
// moved there, so that runs started side by side never read half a file.
// Every failure, of the request, the body or the writing, names the URL, and
// leaves no part file behind.
async function fetchOnce(url){
  const file = localFile(url);
  const part = file + '.' + process.pid + '.part';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const body = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(part, body);
    fs.renameSync(part, file);
  } catch (e){
    fs.rmSync(part, { force: true });
    throw new Error('cannot fetch ' + url + ' into ' + path.relative(process.cwd(), LIBRARY_FOLDER) + ': ' + (e.cause && e.cause.message || e.message));
  }
}

export async function prepareLibraries(fileUnderTest){
  const urls = new Set();
  for (const file of [fileUnderTest, path.join(here, '../src/index.html')]){
    for (const m of fs.readFileSync(file, 'utf8').matchAll(URL_IN_TEXT)) urls.add(m[0]);
  }
  const loose = [...urls].filter(url => !versionOf(url));
  if (loose.length) throw new Error('not pinned to an exact version, so not served: ' + loose.join(', '));
  for (const url of urls) if (!fs.existsSync(localFile(url))) await fetchOnce(url);
  const bodies = new Map([...urls].map(url => [url, fs.readFileSync(localFile(url))]));
  const served = [], refused = [];
  return {
    urls: [...urls].sort(),
    served,
    refused,
    async serve(context){
      await context.route(url => HOST.test(String(url)), route => {
        const url = route.request().url();
        const body = bodies.get(url);
        if (!body){
          if (!refused.includes(url)) refused.push(url);
          return route.abort('blockedbyclient');
        }
        if (!served.includes(url)) served.push(url);
        return route.fulfill({ status: 200, body, contentType: TYPES[path.extname(new URL(url).pathname)] || 'application/octet-stream',
                               headers: { 'access-control-allow-origin': '*' } });
      });
    },
  };
}

// One line for a run's report: the files served, each with its version in its
// path. Printed at the end of a run, when every request has been answered.
export const librariesLine = libraries => 'libraries, served from ' + path.relative(process.cwd(), LIBRARY_FOLDER) + ': ' +
  (libraries.served.length ? libraries.served.slice().sort().map(url => below(url).replace(/^npm\//, '')).join(', ') : 'none');
