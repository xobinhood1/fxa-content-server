/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  './intern',
  './ci/select_circle_tests'
], function (intern, selectCircleTests) {

  intern.functionalSuites = selectCircleTests([
    'tests/functional/sign_in_cached'
  ]);

  return intern;
});
