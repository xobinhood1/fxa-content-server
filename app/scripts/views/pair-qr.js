/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define(function (require, exports, module) {
  'use strict';

  const BaseView = require('views/base');
  const { SESSION_TOKEN_USED_FOR_SYNC } = require('lib/constants');
  const Template = require('stache!templates/pair_qr');

  // a jQuery plugin, doesn't need to do anything.
  require('qrcode-reader');
  require('qrcode-reader-jq');

  module.exports = BaseView.extend({
    template: Template,

    afterVisible () {
      this.$('#qrcode-reader').html5_qrcode((data) => {
 		    // do something when code is read
        this.setAccountFromQRCode(data);
      }, (err) => {

      });
    },

    setAccountFromQRCode (qrCodeData) {
      const accountInfo = JSON.parse(qrCodeData);
      console.log('accountInfo', accountInfo);
      if (accountInfo.email && accountInfo.sessionToken) {
        const account = this.user.initAccount({
          email: accountInfo.email,
          keyFetchToken: accountInfo.keyFetchToken,
          sessionToken: accountInfo.sessionToken,
          sessionTokenContext: SESSION_TOKEN_USED_FOR_SYNC,
          uid: accountInfo.uid,
          unwrapBKey: accountInfo.unwrapBKey
        });

        this.user.setAccount(account)
          .then(() => this.user.setSignedInAccount(account))
          .then(() => {
            this.navigate('settings', {
              success: `Successfully paired as ${accountInfo.email}`
            });
          });
      }
    }
  });
});
