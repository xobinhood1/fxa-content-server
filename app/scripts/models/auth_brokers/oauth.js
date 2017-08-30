/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A broker that knows how to finish an OAuth flow. Should be subclassed
 * to override `sendOAuthResultToRelier`
 */

define(function (require, exports, module) {
  'use strict';

  const _ = require('underscore');
  const AuthErrors = require('lib/auth-errors');
  const BaseAuthenticationBroker = require('models/auth_brokers/base');
  const Constants = require('lib/constants');
  const HaltBehavior = require('views/behaviors/halt');
  const OAuthErrors = require('lib/oauth-errors');
  const p = require('lib/promise');
  const Url = require('lib/url');
  const Vat = require('lib/vat');

  const fxaRelierCrypto = window.FxaCrypto.deriver;
  const fxaDeriverUtils = new fxaRelierCrypto.DeriverUtils();
  console.log('fxaRelierCrypto', fxaRelierCrypto)
  console.log('fxaDeriverUtils', fxaDeriverUtils)

  /**
   * Formats the OAuth "result.redirect" url into a {code, state} object
   *
   * @param {Object} result
   * @returns {Object}
   */
  function _formatOAuthResult(result) {

    // get code and state from redirect params
    if (! result) {
      return p.reject(OAuthErrors.toError('INVALID_RESULT'));
    } else if (! result.redirect) {
      return p.reject(OAuthErrors.toError('INVALID_RESULT_REDIRECT'));
    }

    var redirectParams = result.redirect.split('?')[1];

    result.state = Url.searchParam('state', redirectParams);
    result.code = Url.searchParam('code', redirectParams);

    if (Vat.oauthCode().validate(result.code).error) {
      return p.reject(OAuthErrors.toError('INVALID_RESULT_CODE'));
    }

    return p(result);
  }

  var proto = BaseAuthenticationBroker.prototype;

  var OAuthAuthenticationBroker = BaseAuthenticationBroker.extend({
    type: 'oauth',

    defaultBehaviors: _.extend({}, proto.defaultBehaviors, {
      // the relier will take over after sign in, no need to transition.
      afterForceAuth: new HaltBehavior(),
      afterSignIn: new HaltBehavior(),
      afterSignInConfirmationPoll: new HaltBehavior()
    }),

    defaultCapabilities: _.extend({}, proto.defaultCapabilities, {
      // Disable signed-in notifications for OAuth due to the potential for
      // unintended consequences from redirecting to a relier URL more than
      // once.
      handleSignedInNotification: false
    }),

    initialize (options) {
      options = options || {};

      this.session = options.session;
      this._assertionLibrary = options.assertionLibrary;
      this._oAuthClient = options.oAuthClient;
      this._fxaClient = options.fxaClient;

      return BaseAuthenticationBroker.prototype.initialize.call(
                  this, options);
    },

    getOAuthResult (account) {
      if (! account || ! account.get('sessionToken')) {
        return p.reject(AuthErrors.toError('INVALID_TOKEN'));
      }
      var asser;
      var keys;
      const relier = this.relier;
      const clientId = relier.get('clientId');
      return this._assertionLibrary.generate(account.get('sessionToken'), null, clientId)
        .then((assertion) => {
          asser = assertion
          var keyFetchToken = account.get('keyFetchToken');
          var unwrapBKey = account.get('unwrapBKey');

          console.log({
            keyFetchToken: keyFetchToken,
            unwrapBKey: unwrapBKey
          });

          return this._fxaClient.accountKeys(keyFetchToken, unwrapBKey)


        })
        .then((rkeys) => {
          var uid = account.get('uid');
          return this.relier.deriveRelierKeys(rkeys, uid);
        })
        .then((rkeys) => {
          keys = rkeys;

          const appJwk = fxaRelierCrypto.jose.util.base64url.decode(JSON.stringify(relier.get('keys_jwk')));
          return fxaDeriverUtils.encryptBundle(appJwk, JSON.stringify(keys));
        })
        .then((encryptedJwe) => {
          var oauthParams = {
            assertion: asser,
            client_id: clientId, //eslint-disable-line camelcase
            code_challenge: relier.get('codeChallenge'), //eslint-disable-line camelcase
            code_challenge_method: relier.get('codeChallengeMethod'), //eslint-disable-line camelcase
            scope: relier.get('scope'),
            state: relier.get('state'),
            derivedKeyBundle: encryptedJwe
          };

          if (relier.get('accessType') === Constants.ACCESS_TYPE_OFFLINE) {
            oauthParams.access_type = Constants.ACCESS_TYPE_OFFLINE; //eslint-disable-line camelcase
          }
          return this._oAuthClient.getCode(oauthParams);
        })
        .then(_formatOAuthResult);
    },

    /**
     * Overridden by subclasses to provide a strategy to finish the OAuth flow.
     *
     * @param {Object} [result] - state sent by OAuth RP
     * @param {String} [result.state] - state sent by OAuth RP
     * @param {String} [result.code] - OAuth code generated by the OAuth server
     * @param {String} [result.redirect] - URL that can be used to redirect to
     * the RP.
     *
     * @returns {Promise}
     */
    sendOAuthResultToRelier (/*result*/) {
      return p.reject(new Error('subclasses must override sendOAuthResultToRelier'));
    },

    finishOAuthSignInFlow (account) {
      return this.finishOAuthFlow(account, { action: Constants.OAUTH_ACTION_SIGNIN });
    },

    finishOAuthSignUpFlow (account) {
      return this.finishOAuthFlow(account, { action: Constants.OAUTH_ACTION_SIGNUP });
    },

    finishOAuthFlow (account, additionalResultData = {}) {
      this.session.clear('oauth');
      return this.getOAuthResult(account)
        .then((result) => {
          result = _.extend(result, additionalResultData);
          return this.sendOAuthResultToRelier(result);
        });
    },

    persistVerificationData (account) {
      return p().then(() => {
        var relier = this.relier;
        this.session.set('oauth', {
          access_type: relier.get('access_type'), //eslint-disable-line camelcase
          action: relier.get('action'),
          client_id: relier.get('clientId'), //eslint-disable-line camelcase
          keys: relier.get('keys'),
          scope: relier.get('scope'),
          state: relier.get('state')
        });

        return proto.persistVerificationData.call(this, account);
      });
    },

    afterForceAuth (account) {
      return this.finishOAuthSignInFlow(account)
        .then(() => proto.afterForceAuth.call(this, account));
    },

    afterSignIn (account) {
      return this.finishOAuthSignInFlow(account)
        .then(() => proto.afterSignIn.call(this, account));
    },

    afterSignInConfirmationPoll (account) {
      return this.finishOAuthSignInFlow(account)
        .then(() => proto.afterSignInConfirmationPoll.call(this, account));
    },

    afterSignUpConfirmationPoll (account) {
      // The original tab always finishes the OAuth flow if it is still open.
      return this.finishOAuthSignUpFlow(account);
    },

    afterResetPasswordConfirmationPoll (account) {
      return this.finishOAuthSignInFlow(account);
    },

    transformLink (link) {
      if (link[0] !== '/') {
        link = '/' + link;
      }

      if (/^\/(signin|signup)/.test(link)) {
        link = '/oauth' + link;
      }

      const windowSearchParams = Url.searchParams(this.window.location.search);
      return Url.updateSearchString(link, windowSearchParams);
    }
  });

  module.exports = OAuthAuthenticationBroker;
});
