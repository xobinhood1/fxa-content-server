/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var flowMetrics = require('../flow-metrics');
var Handlebars = require('handlebars');

var fs = require('fs');
var path = require('path');

module.exports = function (config) {
  var SIGN_UP_PARTIAL = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'scripts', 'templates', 'sign_up.mustache')).toString();

  var STATIC_RESOURCE_URL = config.get('static_resource_url');
  var FLOW_ID_KEY = config.get('flow_id_key');

  var route = {};
  route.method = 'get';
  route.path = '/signup';

  Handlebars.registerPartial('signUpContent', SIGN_UP_PARTIAL);

  route.process = function (req, res) {
    var flowEventData = flowMetrics(FLOW_ID_KEY, req.headers['user-agent']);
    var isSync = req.query.service === 'sync';

    res.render('index', {
      flowBeginTime: flowEventData.flowBeginTime,
      flowId: flowEventData.flowId,
      isEmailOptInVisible: isSync,
      isSignInEnabled: true,
      // Note that staticResourceUrl is added to templates as a build step
      isSync: isSync,
      isSignUp: true,
      shouldFocusEmail: true,
      staticResourceUrl: STATIC_RESOURCE_URL
    });
  };

  return route;
};

