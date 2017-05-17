/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'intern',
  'intern!object',
  'intern/chai!assert',
  'intern/dojo/node!../../../server/lib/configuration',
  'intern/dojo/node!../../../server/lib/csp',
  'intern/dojo/node!htmlparser2',
  'intern/dojo/node!got',
  'intern/dojo/node!url',
  'intern/browser_modules/dojo/Promise',
  'intern/dojo/node!fxa-shared'
], function (intern, registerSuite, assert, config, csp,
  htmlparser2, got, url, Promise, fxaShared) {

  var httpUrl, httpsUrl = intern.config.fxaContentRoot.replace(/\/$/, '');

  if (intern.config.fxaProduction) {
    assert.equal(0, httpsUrl.indexOf('https://'), 'uses https scheme');
    httpUrl = httpsUrl.replace('https://', 'http://');
  } else {
    httpUrl = httpsUrl.replace(config.get('port'), config.get('http_port'));
  }

  function makeRequest(url, requestOptions) {
    return got(url, requestOptions)
      .catch(function (err) {
        return err.response;
      });
  }

  function checkHeaders(routes, route, res) {
    var headers = res.headers;

    if (headers['content-type'].indexOf('text/html') > -1) {
      // all HTML pages by default have x-frame-options: DENY
      assert.equal(headers['x-frame-options'], 'DENY');
      assert.equal(headers['x-robots-tag'], 'noindex,nofollow');

      if (routes[route].csp !== false) {
        assert.ok(headers.hasOwnProperty('content-security-policy'));
      }
    }

    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.include(headers['strict-transport-security'], 'max-age=');
  }

  /**
   * Go through each of the HTML files, look for URLs, check that
   * each URL exists, responds with a 200, and in the case of JS, CSS
   * and fonts, that the correct CORS headers are set.
   */
  function extractAndCheckUrls(res) {
    var href = url.parse(res.url);
    var origin = [ href.protocol, '//', href.host ].join('');
    return extractUrls(res.body)
      .then(checkUrls.bind(null, origin));
  }

  function extractUrls(body) {
    return new Promise(function (resolve, reject) {
      var dependencyUrls = [];

      var parser = new htmlparser2.Parser({
        onattribute: function (attrName, attrValue) {
          if (attrName === 'href' || attrName === 'src') {
            var depUrl;
            if (isAbsoluteUrl(attrValue)) {
              depUrl = attrValue;
            } else {
              depUrl = httpsUrl + attrValue;
            }
            dependencyUrls.push(depUrl);
          }
        },
        onend: function () {
          resolve(dependencyUrls);
        }
      });

      parser.write(body);
      parser.end();
    });
  }

  // keep a cache of checked URLs to avoid duplicate tests and
  // speed up the tests.
  var checkedUrlPromises = {};

  function checkUrls(origin, urls) {
    var requests = urls.map(function (url) {
      if (checkedUrlPromises[url]) {
        return checkedUrlPromises[url];
      }

      var requestOptions = {};
      if (doesURLRequireCORS(url)) {
        requestOptions = {
          headers: {
            'Origin': origin
          }
        };
      }

      var promise = makeRequest(url, requestOptions)
        .then(function (res) {
          if (/support.mozilla.org/.test(url) || /localhost:35729/.test(url)) {
            // Do not check support.mozilla.org URLs. Issue #4712
            // In February 2017 SUMO links started returning 404s to non-browser redirect requests
            // Also skip the livereload link in the mocha tests
            return;
          }
          assert.equal(res.statusCode, 200);

          var headers = res.headers;
          var hasCORSHeaders =
            // Node responds with Access-Control-Allow-Origin,
            // nginx responds with access-control-allow-origin
            headers.hasOwnProperty('Access-Control-Allow-Origin') ||
            headers.hasOwnProperty('access-control-allow-origin');

          if (doesURLRequireCORS(url)) {
            assert.ok(hasCORSHeaders, url + ' should have CORS headers');
          } else {
            assert.notOk(hasCORSHeaders, url + ' should not have CORS headers');
          }
        });

      checkedUrlPromises[url] = promise;
      return promise;
    });

    return Promise.all(requests);
  }

  function isAbsoluteUrl(url) {
    return /^http/.test(url);
  }

  function doesURLRequireCORS(url) {
    return isExternalUrl(url) && doesExtensionRequireCORS(url);
  }

  function isContentServerUrl(url) {
    return url.indexOf(httpsUrl) === 0 ||
           url.indexOf(httpUrl) === 0;
  }

  function isExternalUrl(url) {
    return ! isContentServerUrl(url);
  }

  function doesExtensionRequireCORS(url) {
    return /\.(js|css|woff|woff2|eot|ttf)/.test(url);
  }

  return {
    checkHeaders: checkHeaders,
    extractAndCheckUrls: extractAndCheckUrls,
    makeRequest: makeRequest
  };
});
