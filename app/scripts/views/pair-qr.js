/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const _ = require('underscore');
  const BaseView = require('views/base');
  const Cocktail = require('cocktail');
  const ResumeTokenMixin = require('views/mixins/resume-token-mixin');
  const SignInMixin = require('views/mixins/signin-mixin');
  const Template = require('stache!templates/pair_qr');

  // a jQuery plugin, doesn't need to do anything.
  require('qrcode-reader');
  require('qrcode-reader-jq');

  class View extends BaseView {
    get template () {
      return Template;
    }

    context () {
      const context = super.context();
      return _.extend({}, context, {
        serviceName: this.relier.get('serviceName')
      });
    }

    afterVisible () {
      const $qrReaderEl = this.$('#qrcode-reader');
      $qrReaderEl.html5_qrcode((qrCodeData) => {
        // do something when code is read
        $qrReaderEl.html5_qrcode_stop();
        this.signInFromQRCode(qrCodeData);
      },
      (err) => this.displayError(err),
      (videoError) => this.displayError(videoError));
    }

    signInFromQRCode (qrCodeData) {
      console.log('data', qrCodeData);
      const accountInfo = JSON.parse(qrCodeData);
      console.log('accountInfo', accountInfo);
      if (accountInfo.email && accountInfo.password) {
        const account = this.user.initAccount({
          email: accountInfo.email
        });
        return this.signIn(account, accountInfo.password)
          .then(null, (err) => this.displayError(err));
      }
    }
  }

  Cocktail.mixin(
    View,
    ResumeTokenMixin,
    SignInMixin
  );

  module.exports = View;
});
