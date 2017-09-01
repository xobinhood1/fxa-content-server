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
  'use strict';

  const config = intern.config;
  const PAGE_URL = `${config.fxaContentRoot}?context=fx_firstrun_v2&service=sync&automatedBrowser=true&action=email`;

  let email;
  const PASSWORD = '12345678';
  const PASSWORD_MISMATCH = '123456789';

  const clearBrowserState = FunctionalHelpers.clearBrowserState;
  const click = FunctionalHelpers.click;
  const closeCurrentWindow = FunctionalHelpers.closeCurrentWindow;
  const createUser = FunctionalHelpers.createUser;
  const openPage = FunctionalHelpers.openPage;
  const openVerificationLinkInNewTab = FunctionalHelpers.openVerificationLinkInNewTab;
  const testElementExists = FunctionalHelpers.testElementExists;
  const testElementTextInclude = FunctionalHelpers.testElementTextInclude;
  const testElementValueEquals = FunctionalHelpers.testElementValueEquals;
  const testIsBrowserNotified = FunctionalHelpers.testIsBrowserNotified;
  const type = FunctionalHelpers.type;
  const visibleByQSA = FunctionalHelpers.visibleByQSA;

  registerSuite({
    name: 'Firstrun Sync v2 email first',

    beforeEach: function () {
      email = TestHelpers.createEmail('sync{id}');

      return this.remote
        .then(clearBrowserState({ force: true }));
    },

    'signup': function () {
      return this.remote
        .then(openPage(PAGE_URL, selectors.ENTER_EMAIL.HEADER, {
          webChannelResponses: {
            'fxaccounts:can_link_account': { ok: true }
          }
        }))
        .then(visibleByQSA(selectors.ENTER_EMAIL.SUB_HEADER))
        .then(type(selectors.ENTER_EMAIL.EMAIL, email))
        .then(click(selectors.ENTER_EMAIL.SUBMIT, selectors.SIGNUP_PASSWORD.HEADER))
        .then(testIsBrowserNotified('fxaccounts:can_link_account'))

        .then(testElementValueEquals(selectors.SIGNUP_PASSWORD.EMAIL, email))
        .then(type(selectors.SIGNUP_PASSWORD.PASSWORD, PASSWORD))
        // intentional password mismatch
        .then(type(selectors.SIGNUP_PASSWORD.VPASSWORD, PASSWORD_MISMATCH))
        .then(type(selectors.SIGNUP_PASSWORD.AGE, 21))

        // password mismatch, no screen transition.
        .then(click(selectors.SIGNUP_PASSWORD.SUBMIT, selectors.SIGNUP_PASSWORD.HEADER))
        .then(testElementTextInclude(selectors.SIGNUP_PASSWORD.ERROR_PASSWORDS_DO_NOT_MATCH, 'do not match'))
        .then(type(selectors.SIGNUP_PASSWORD.VPASSWORD, PASSWORD))
        .then(click(selectors.SIGNUP_PASSWORD.SUBMIT, selectors.CHOOSE_WHAT_TO_SYNC.HEADER))

        .then(click(selectors.CHOOSE_WHAT_TO_SYNC.SUBMIT, selectors.CONFIRM_SIGNUP.HEADER))
        .then(testIsBrowserNotified('fxaccounts:login'))

        .then(openVerificationLinkInNewTab(email, 0))
        .switchToWindow('newwindow')
          .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
          .then(closeCurrentWindow())

        .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER));
    },

    'signin - merge cancelled': function () {
      return this.remote
        .then(createUser(email, PASSWORD, { preVerified: true }))
        .then(openPage(PAGE_URL, selectors.ENTER_EMAIL.HEADER, {
          webChannelResponses: {
            'fxaccounts:can_link_account': { ok: false }
          }
        }))

        .then(visibleByQSA(selectors.ENTER_EMAIL.SUB_HEADER))
        .then(type(selectors.ENTER_EMAIL.EMAIL, email))
        .then(click(selectors.ENTER_EMAIL.SUBMIT, selectors.ENTER_EMAIL.ERROR))

        .then(testIsBrowserNotified('fxaccounts:can_link_account'));
    },

    'signin verified': function () {
      return this.remote
        .then(createUser(email, PASSWORD, { preVerified: true }))
        .then(openPage(PAGE_URL, selectors.ENTER_EMAIL.HEADER, {
          webChannelResponses: {
            'fxaccounts:can_link_account': { ok: true }
          }
        }))
        .then(visibleByQSA(selectors.ENTER_EMAIL.SUB_HEADER))
        .then(type(selectors.ENTER_EMAIL.EMAIL, email))
        .then(click(selectors.ENTER_EMAIL.SUBMIT, selectors.SIGNIN_PASSWORD.HEADER))
        .then(testIsBrowserNotified('fxaccounts:can_link_account'))

        .then(testElementValueEquals(selectors.SIGNIN_PASSWORD.EMAIL, email))
        .then(type(selectors.SIGNIN_PASSWORD.PASSWORD, PASSWORD))
        .then(click(selectors.SIGNIN_PASSWORD.SUBMIT, selectors.CONFIRM_SIGNIN.HEADER))
        .then(testIsBrowserNotified('fxaccounts:login'))

        .then(openVerificationLinkInNewTab(email, 0))
        .switchToWindow('newwindow')
          .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
          .then(closeCurrentWindow())

        .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER));
    },

    'signin unverified': function () {
      return this.remote
        .then(createUser(email, PASSWORD, { preVerified: false }))
        .then(openPage(PAGE_URL, selectors.ENTER_EMAIL.HEADER, {
          webChannelResponses: {
            'fxaccounts:can_link_account': { ok: true }
          }
        }))
        .then(visibleByQSA(selectors.ENTER_EMAIL.SUB_HEADER))
        .then(type(selectors.ENTER_EMAIL.EMAIL, email))
        .then(click(selectors.ENTER_EMAIL.SUBMIT, selectors.SIGNIN_PASSWORD.HEADER))
        .then(testIsBrowserNotified('fxaccounts:can_link_account'))

        // The /account/status endpoint does not return whether the account
        // is verified, only whether the email has been registered
        .then(testElementValueEquals(selectors.SIGNIN_PASSWORD.EMAIL, email))
        .then(type(selectors.SIGNIN_PASSWORD.PASSWORD, PASSWORD))
        // The user never verified their account and must do so.
        .then(click(selectors.SIGNIN_PASSWORD.SUBMIT, selectors.CONFIRM_SIGNUP.HEADER))

        .then(testIsBrowserNotified('fxaccounts:login'))

        // Get the 2nd email, the 1st was sent for createUser
        .then(openVerificationLinkInNewTab(email, 1))
        .switchToWindow('newwindow')
          .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER))
          .then(closeCurrentWindow())

        .then(testElementExists(selectors.CONNECT_ANOTHER_DEVICE.HEADER));
    },

    'email specified by relier, not registered': function () {
      return this.remote
        .then(openPage(PAGE_URL, selectors.SIGNUP_PASSWORD.HEADER, {
          query: {
            email
          },
          webChannelResponses: {
            'fxaccounts:can_link_account': { ok: true }
          }
        }))
        .then(testElementValueEquals(selectors.SIGNUP_PASSWORD.EMAIL, email));
    },

    'email specified by relier, registered': function () {
      return this.remote
        .then(createUser(email, PASSWORD, { preVerified: true }))
        .then(openPage(PAGE_URL, selectors.SIGNIN_PASSWORD.HEADER, {
          query: {
            email
          },
          webChannelResponses: {
            'fxaccounts:can_link_account': { ok: true }
          }
        }))
        .then(testElementValueEquals(selectors.SIGNIN_PASSWORD.EMAIL, email));
    },
  });
});
