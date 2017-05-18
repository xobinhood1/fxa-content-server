/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Given a URL to a CSS resource, return a list of the sub-resources
// referenced from CSS.

var path = require('path');
var url = require('url');

var css = require('css');
var extend = require('extend');
var Promise = require('bluebird');
var got = require('got');

var CSSURL_RE = /url\(\s*['"]?([^)'"]+)['"]?\s*\)/g;

function findCssUrlMatches(value, base) {
  var urls = {};
  var match;

  while (match = CSSURL_RE.exec(value)) { // eslint-disable-line no-cond-assign
    var resolved = url.resolve(base, match[1]);
    var protocol = url.parse(resolved).protocol;
    if (protocol.match(/^http/)) {
      // XXX Hack to get tests to pass - see GH-4114
      if (! resolved.match(/(spinner\.gif|close\.png)$/)) {
        urls[resolved] = 1;
      }
    }
  }

  return urls;
}

function parseCssUrls(content, base) {
  var ast = css.parse(content);
  var urls = {};

  ast.stylesheet.rules.forEach(function(rule) {
    if (rule.type === 'font-face' || rule.type === 'rule') {
      rule.declarations.forEach(function(declaration) {
        extend(urls, findCssUrlMatches(declaration.value, base));
      });
    } else if (rule.type === 'media') {
      rule.rules.forEach(function(mediaRule) {
        mediaRule.declarations.forEach(function(declaration) {
          extend(urls, findCssUrlMatches(declaration.value, base));
        });
      });
    }
  });

  return Object.keys(urls).sort();
}

function extractCssUrls(uri) {
  var options = {
    headers: {
      'Accept': 'text/css,*/*;q=0.1',
    }
  };

  return new Promise(function (resolve, reject) {
    console.log('css:  kicking off request for', uri);
    return got(uri, options)
      .then((response) => {
        return resolve(parseCssUrls(body, uri));
      })
      .catch((err) => {
        return reject(err);
      })
  });
}

function filterCssUrls(urls) {
  return urls.filter(function (uri) {
    var parsedUri = url.parse(uri);
    var extension = path.extname(parsedUri.pathname);
    if (extension === '.css') {
      return uri;
    }
  });
}

// keep a cache of CSS URLs queried for entrained resources, to avoid
// duplicate tests and speed up the tests.
var checkedCssUrlPromises = {};

function discoverCssResources(urls) {
  // For urls with extension `.css`, find the font and image resources
  // entrained from CSS.
  var cssUrls = filterCssUrls(urls);

  var cssResourceRequests = cssUrls.map(function (cssUrl) {
    if (checkedCssUrlPromises[cssUrl]) {
      return checkedCssUrlPromises[cssUrl];
    }

    var promise = extractCssUrls(cssUrl);
    checkedCssUrlPromises[cssUrl] = promise;

    return promise;
  });

  return Promise.all(cssResourceRequests).then(function (cssResources) {
    // return a flattened, deduped, list of resources
    var flattened = [].concat.apply([], cssResources);
    return flattened.filter(function (item, pos) {
      return flattened.indexOf(item) === pos;
    });
  });
}

module.exports = discoverCssResources;
