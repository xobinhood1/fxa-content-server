/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'intern',
  'intern!object',
  'tests/lib/helpers',
  'tests/functional/lib/helpers',
  'tests/functional/lib/selectors'
], function (intern, registerSuite, TestHelpers, FunctionalHelpers, selectors) {
  const config = intern.config;
  const PAGE_URL = config.fxaContentRoot + 'signin?context=iframe&service=sync';

  var email;
  const PASSWORD = '12345678';

  const thenify = FunctionalHelpers.thenify;

  const clearBrowserNotifications = FunctionalHelpers.clearBrowserNotifications;
  const clearBrowserState = FunctionalHelpers.clearBrowserState;
  const closeCurrentWindow = FunctionalHelpers.closeCurrentWindow;
  const createUser = FunctionalHelpers.createUser;
  const fillOutSignIn = FunctionalHelpers.fillOutSignIn;
  const fillOutSignInUnblock = FunctionalHelpers.fillOutSignInUnblock;
  const noPageTransition = FunctionalHelpers.noPageTransition;
  const noSuchBrowserNotification = FunctionalHelpers.noSuchBrowserNotification;
  const openPage = FunctionalHelpers.openPage;
  const openVerificationLinkInDifferentBrowser = FunctionalHelpers.openVerificationLinkInDifferentBrowser;
  const openVerificationLinkInNewTab = FunctionalHelpers.openVerificationLinkInNewTab;
  const testElementExists = FunctionalHelpers.testElementExists;
  const testElementTextInclude = FunctionalHelpers.testElementTextInclude;
  const testIsBrowserNotified = FunctionalHelpers.testIsBrowserNotified;
  const visibleByQSA = FunctionalHelpers.visibleByQSA;

  const setupTest = thenify(function (options) {
    options = options || {};

    return this.parent
      .then(createUser(email, PASSWORD, { preVerified: options.preVerified }))
      .then(openPage(options.pageUrl || PAGE_URL, '.email', {
        query: options.query,
        webChannelResponses: {
          'fxaccounts:can_link_account': { ok: options.canLinkAccountResponse !== false }
        }
      }))
      .then(visibleByQSA(selectors.SIGNIN.SUB_HEADER))
      // delay for the webchannel message
      .sleep(500)
      .then(fillOutSignIn(email, PASSWORD))
      .then(testIsBrowserNotified('fxaccounts:can_link_account'));
  });

  registerSuite({
    name: 'Firstrun Sync v1 sign_in',

    beforeEach: function () {
      email = TestHelpers.createEmail('sync{id}');

      return this.remote
        .then(clearBrowserState({
          force: true
        }));
    },

    'verified, verify same browser': function () {
      return this.remote
        .then(setupTest({ preVerified: true }))

        .then(testElementExists(selectors.CONFIRM_SIGNIN.HEADER))

        .then(testIsBrowserNotified('fxaccounts:login'))
        .then(clearBrowserNotifications())

        .then(openVerificationLinkInNewTab(email, 0))
        .switchToWindow('newwindow')
          .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
          .then(closeCurrentWindow())

        .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
        .then(noSuchBrowserNotification('fxaccounts:login'));
    },

    'verified, verify same browser, force SMS': function () {
      const query = {
        forceExperiment: 'sendSms',
        forceExperimentGroup: 'treatment'
      };
      return this.remote
      .then(setupTest({ preVerified: true, query }))

      .then(testElementExists(selectors.CONFIRM_SIGNIN.HEADER))

      .then(testIsBrowserNotified('fxaccounts:login'))
      .then(clearBrowserNotifications())

      .then(openVerificationLinkInNewTab(email, 0, { query }))
      .switchToWindow('newwindow')
        .then(testElementExists(selectors.SMS_SEND.HEADER))
        .then(closeCurrentWindow())

      .then(testElementExists(selectors.SMS_SEND.HEADER))
      .then(noSuchBrowserNotification('fxaccounts:login'));
    },

    'verified, verify different browser - from original tab\'s P.O.V.': function () {
      return this.remote
        .then(setupTest({ preVerified: true }))

        .then(testElementExists(selectors.CONFIRM_SIGNIN.HEADER))
        .then(testIsBrowserNotified('fxaccounts:login'))

        .then(openVerificationLinkInDifferentBrowser(email))

        .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER));
    },

    'verified, verify different browser, force SMS - from original tab\'s P.O.V.': function () {
      const query = {
        forceExperiment: 'sendSms',
        forceExperimentGroup: 'treatment'
      };
      return this.remote
      .then(setupTest({ preVerified: true, query }))

      .then(testElementExists(selectors.CONFIRM_SIGNIN.HEADER))
      .then(testIsBrowserNotified('fxaccounts:login'))

      .then(openVerificationLinkInDifferentBrowser(email))

      .then(testElementExists(selectors.SMS_SEND.HEADER));
    },

    'unverified': function () {
      this.timeout = 90 * 1000;
      return this.remote
        .then(setupTest({ preVerified: false }))

        .then(testElementExists(selectors.CONFIRM_SIGNUP.HEADER))
        .then(testIsBrowserNotified('fxaccounts:login'))
        .then(clearBrowserNotifications())

        // email 0 - initial sign up email
        // email 1 - sign in w/ unverified address email
        // email 2 - "You have verified your Firefox Account"
        .then(openVerificationLinkInNewTab(email, 1))
        .switchToWindow('newwindow')
          .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
          .then(closeCurrentWindow())

        // Since this is really a signup flow, the original tab
        // redirects to CAD too.
        .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
        .then(noSuchBrowserNotification('fxaccounts:login'));
    },

    'signin, cancel merge warning': function () {
      return this.remote
        .then(setupTest({ canLinkAccountResponse: false, preVerified: true }))

        .then(noSuchBrowserNotification('fxaccounts:login'))

        // user should not transition to the next screen
        .then(noPageTransition(selectors.SIGNIN.HEADER));
    },

    'blocked, valid code entered': function () {
      email = TestHelpers.createEmail('block{id}');

      return this.remote
        .then(setupTest({ preVerified: true }))

        .then(testElementExists(selectors.SIGNIN_UNBLOCK.HEADER))
        .then(testElementTextInclude(selectors.SIGNIN_UNBLOCK.EMAIL_FIELD, email))
        .then(fillOutSignInUnblock(email, 0))

        // Only users that go through signin confirmation see
        // `/signin_complete`, and users that go through signin unblock see
        // the default `settings` page.
        .then(testElementExists(selectors.SETTINGS.HEADER))
        .then(testIsBrowserNotified('fxaccounts:login'));
    }
  });
});
