/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'intern',
  'intern!object',
  'tests/lib/helpers',
  'tests/functional/lib/helpers',
  'tests/functional/lib/fx-desktop',
  'tests/functional/lib/selectors',
  'tests/functional/lib/ua-strings'
], function (intern, registerSuite,
  TestHelpers, FunctionalHelpers, FxDesktopHelpers, selectors, UA_STRINGS) {
  'use strict';

  const config = intern.config;
  const SIGNIN_PAGE_URL = `${config.fxaContentRoot}signin?context=fx_ios_v1&service=sync`;
  const SMS_PAGE_URL = `${config.fxaContentRoot}sms?context=fx_desktop_v1&service=sync&forceExperiment=sendSms&forceExperimentGroup=signinCodes`;

  let email;
  const PASSWORD = '12345678';

  const thenify = FunctionalHelpers.thenify;
  const clearBrowserState = FunctionalHelpers.clearBrowserState;
  const click = FunctionalHelpers.click;
  const closeCurrentWindow = FunctionalHelpers.closeCurrentWindow;
  const createUser = FunctionalHelpers.createUser;
  const deleteAllSms = FunctionalHelpers.deleteAllSms;
  const disableInProd = FunctionalHelpers.disableInProd;
  const fillOutSignIn = FunctionalHelpers.fillOutSignIn;
  const fillOutSignInUnblock = FunctionalHelpers.fillOutSignInUnblock;
  const getSmsSigninCode = FunctionalHelpers.getSmsSigninCode;
  const listenForFxaCommands = FxDesktopHelpers.listenForFxaCommands;
  const noPageTransition = FunctionalHelpers.noPageTransition;
  const openPage = FunctionalHelpers.openPage;
  const openVerificationLinkInDifferentBrowser = FunctionalHelpers.openVerificationLinkInDifferentBrowser;
  const openVerificationLinkInNewTab = FunctionalHelpers.openVerificationLinkInNewTab;
  const testElementExists = FunctionalHelpers.testElementExists;
  const testElementTextEquals = FunctionalHelpers.testElementTextEquals;
  const testElementTextInclude = FunctionalHelpers.testElementTextInclude;
  const testIsBrowserNotified = FxDesktopHelpers.testIsBrowserNotifiedOfMessage;
  const testIsBrowserNotifiedOfLogin = FxDesktopHelpers.testIsBrowserNotifiedOfLogin;
  const type = FunctionalHelpers.type;
  const visibleByQSA = FunctionalHelpers.visibleByQSA;

  const setupTest = thenify(function (options) {
    options = options || {};

    const successSelector = options.blocked ? selectors.SIGNIN_UNBLOCK.HEADER :
                            options.preVerified ? selectors.CONFIRM_SIGNIN.HEADER :
                            selectors.CONFIRM_SIGNUP.HEADER;

    return this.parent
      .then(createUser(email, PASSWORD, { preVerified: options.preVerified }))
      .then(openPage(SIGNIN_PAGE_URL, selectors.SIGNIN.HEADER, {
        query: {
          forceUA: options.forceUA || UA_STRINGS['ios_firefox_6_1']
        }
      }))
      .execute(listenForFxaCommands)
      .then(fillOutSignIn(email, PASSWORD))
      .then(testElementExists(successSelector))
      .then(testIsBrowserNotified('can_link_account'))
      .then(() => {
        if (! options.blocked) {
          return this.parent
            .then(testIsBrowserNotifiedOfLogin(email, { expectVerified: false }));
        }
      });
  });

  registerSuite({
    name: 'FxiOS v1 sign_in',

    beforeEach: function () {
      email = TestHelpers.createEmail('sync{id}');

      return this.remote
        .then(clearBrowserState({ force: true }));
    },

    'verified, verify same browser': function () {
      const forceUA = UA_STRINGS['ios_firefox_6_1'];

      return this.remote
        .then(setupTest({ forceUA, preVerified: true }))

        .then(openVerificationLinkInNewTab(email, 0, {
          query: {
            forceUA
          }
        }))
        .switchToWindow('newwindow')
          .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
          .then(closeCurrentWindow())

        .then(testElementExists(selectors.SIGNIN_COMPLETE.HEADER));
    },

    'verified, verify different browser - from original tab\'s P.O.V.': function () {
      const forceUA = UA_STRINGS['ios_firefox_6_1'];
      return this.remote
        .then(setupTest({ forceUA, preVerified: true }))

        .then(openVerificationLinkInDifferentBrowser(email))

        .then(testElementExists(selectors.SIGNIN_COMPLETE.HEADER));
    },

    'Fx iOS <= 6.0 unverified, verify same browser': function () {
      const forceUA = UA_STRINGS['ios_firefox_6_0'];
      return this.remote
      .then(setupTest({ forceUA, preVerified: false }))

        // email 0 - initial sign up email
        // email 1 - sign in w/ unverified address email
        // email 2 - "You have verified your Firefox Account"
        .then(openVerificationLinkInNewTab(email, 1, {
          query: {
            forceUA
          }
        }))
        .switchToWindow('newwindow')
          .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
          .then(closeCurrentWindow())

        .then(testElementExists(selectors.CONFIRM_SIGNUP.HEADER));
    },

    'Fx iOS >= 6.1 unverified, verify same browser': function () {
      const forceUA = UA_STRINGS['ios_firefox_6_1'];
      return this.remote
        .then(setupTest({ forceUA, preVerified: false }))

        // email 0 - initial sign up email
        // email 1 - sign in w/ unverified address email
        // email 2 - "You have verified your Firefox Account"
        .then(openVerificationLinkInNewTab(email, 1, {
          query: {
            forceUA
          }
        }))
        .switchToWindow('newwindow')
          .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
          .then(closeCurrentWindow())

          // In Fx for iOS >= 6.1, user should redirect to the signup-complete
          // page after verification.
          .then(testElementExists(selectors.SIGNUP_COMPLETE.HEADER));
    },

    'signup link is enabled': function () {
      const forceUA = UA_STRINGS['ios_firefox_6_1'];
      return this.remote
        .then(openPage(SIGNIN_PAGE_URL, selectors.SIGNIN.HEADER, { query: { forceUA }}))
        .then(testElementExists('a[href^="/signup"]'));
    },

    'signin with an unknown account does not allow the user to sign up': function () {
      const forceUA = UA_STRINGS['ios_firefox_6_1'];
      return this.remote
        .then(openPage(SIGNIN_PAGE_URL, selectors.SIGNIN.HEADER, { query: { forceUA } }))
        .execute(listenForFxaCommands)

        .then(fillOutSignIn(email, PASSWORD))

        .then(visibleByQSA('.error'));
    },

    'blocked, valid code entered': function () {
      email = TestHelpers.createEmail('block{id}');
      const forceUA = UA_STRINGS['ios_firefox_6_1'];

      return this.remote
        .then(setupTest({ blocked: true, forceUA, preVerified: true }))

        .then(testElementExists(selectors.SIGNIN_UNBLOCK.HEADER))
        .then(testElementTextInclude(selectors.SIGNIN_UNBLOCK.EMAIL_FIELD, email))
        .then(fillOutSignInUnblock(email, 0))

        // about:accounts will take over post-unblock, no transition
        .then(noPageTransition(selectors.SIGNIN_UNBLOCK.HEADER))
        .then(testIsBrowserNotifiedOfLogin(email, { expectVerified: true }));
    },

    'signup in desktop, send an SMS, open deferred deeplink in Fx for iOS': disableInProd(function () {
      const testPhoneNumber = TestHelpers.createPhoneNumber();
      const forceUA = UA_STRINGS['ios_firefox_6_1'];

      return this.remote
        // The phoneNumber is reused across tests, delete all
        // if its SMS messages to ensure a clean slate.
        .then(deleteAllSms(testPhoneNumber))
        .then(setupTest({ forceUA, preVerified: true }))

        .then(openPage(SMS_PAGE_URL, selectors.SMS_SEND.HEADER))
        .then(type(selectors.SMS_SEND.PHONE_NUMBER, testPhoneNumber))
        .then(click(selectors.SMS_SEND.SUBMIT))

        .then(testElementExists(selectors.SMS_SENT.HEADER))
        .then(getSmsSigninCode(testPhoneNumber, 0))
        .then(function (signinCode) {
          return this.parent
            .then(clearBrowserState())
            .then(openPage(SIGNIN_PAGE_URL, selectors.SIGNIN.HEADER, {
              query: {
                forceUA,
                signin: signinCode
              }
            }))
            .then(testElementTextEquals(selectors.SIGNIN.EMAIL_NOT_EDITABLE, email));
        });
    })
  });
});
