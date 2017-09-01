/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers for the "Connect Another Device" screens. Users who
 * are eligible for CAD can go to either /sms or /connect_another_device.
 * This module exposes functions to query whether the user is eligible
 * for CAD, and if so, to navigate to the appropriate screen.
 *
 * Should be called like:
 * if (this.isEligibleForConnectAnotherDevice(account)) {
 *   return this.navigateToConnectAnotherDeviceScreen(account);
 * } else {
 *   return this.navigateToAnotherScreen();
 * }
 *
 * This mixin unfortunately requires a bunch of other mixins:
 *  - ExperimentMixin,
 *  - UserAgentMixin,
 *  - VerificationReasonMixin
 */

define((require, exports, module) => {
  'use strict';

  const p = require('lib/promise');
  const ExperimentMixin = require('views/mixins/experiment-mixin');
  const UserAgentMixin = require('lib/user-agent-mixin');
  const VerificationReasonMixin = require('views/mixins/verification-reason-mixin');

  const REASON_ANDROID = 'sms.ineligible.android';
  const REASON_CONTROL_GROUP = 'sms.ineligible.control_group';
  const REASON_IOS = 'sms.ineligible.ios';
  const REASON_NOT_IN_EXPERIMENT = 'sms.ineligible.not_in_experiment';
  const REASON_NO_SESSION = 'sms.ineligible.no_session';
  const REASON_OTHER_USER_SIGNED_IN = 'sms.ineligible.other_user_signed_in';
  const REASON_UNSUPPORTED_COUNTRY = 'sms.ineligible.unsupported_country';
  const REASON_XHR_ERROR = 'sms.ineligible.xhr_error';

  return {
    dependsOn: [
      ExperimentMixin,
      UserAgentMixin,
      VerificationReasonMixin
    ],

    /**
     * Is `account` eligible for connect another device?
     *
     * @param {Object} account - account to check
     * @returns {Boolean}
     */
    isEligibleForConnectAnotherDevice (account) {
      // If a user is already signed in to Sync which is different to the
      // user that just verified, show them the old "Account verified!" screen.
      return ! this.user.isAnotherAccountSignedIn(account);
    },

    /**
     * Navigate to the appropriate CAD screen for `account`.
     *
     * @param {Object} account
     * @returns {Promise}
     */
    navigateToConnectAnotherDeviceScreen (account) {
      // users have to be eligible for CAD to be part of SMS too.
      // Users selected to be part of the SMS experiment who are
      // in the control group will go to the existing CAD screen.
      if (! this.isEligibleForConnectAnotherDevice(account)) {
        // this shouldn't happen IRL.
        return p.reject(new Error('chooseConnectAnotherDeviceScreen can only be called if user is eligible to connect another device'));
      }

      // Initialize the flow metrics so any flow events are logged.
      // The flow-events-mixin, even if it were mixed in, does this in
      // `afterRender` whereas this method can be called in `beforeRender`
      this.notifier.trigger('flow.initialize');

      return this._isEligibleForSms(account)
        .then(({ ok, country }) => {
          const type = this.model.get('type');
          if (ok) {
            // User is eligible for SMS experiment, now bucket
            // users into treatment and control groups.
            const group = this.getExperimentGroup('sendSms', { account });
            this.createExperiment('sendSms', group);

            if (group === 'control') {
              this.logFlowEvent(REASON_CONTROL_GROUP);
              this.navigate('connect_another_device', { account, type });
            } else {
              // all non-control groups go to the sms page.
              this.navigate('sms', { account, country, type });
            }
          } else {
            this.navigate('connect_another_device', { account, type });
          }
        });
    },

    /**
     * Is `account` eligible for SMS?
     *
     * @param {Object} account
     * @returns {Promise} resolves to an object with two fields:
     *   @returns {String} country - country user is in, only valid if user is eligible for SMS
     *   @returns {Boolean} ok - whether the user is eligible for SMS.
     * @private
     */
    _isEligibleForSms (account) {
      return p(
        this._areSmsRequirementsMet(account) &&
        this._smsCountry(account)
      )
      .then((country) => {
        return {
          country,
          ok: !! country
        };
      });
    },

    /**
     * Check if the requirements are met to send an SMS, if not, log why.
     *
     * @param {Object} account
     * @returns {Boolean}
     * @private
     */
    _areSmsRequirementsMet (account) {
      let reason;

      if (this.getUserAgent().isAndroid()) {
        // If already on a mobile device, doesn't make sense to send an SMS.
        reason = REASON_ANDROID;
      } else if (this.getUserAgent().isIos()) {
        reason = REASON_IOS;
      } else if (! (account && account.get('sessionToken'))) {
        reason = REASON_NO_SESSION;
      } else if (this.user.isAnotherAccountSignedIn(account)) {
        // If a user is already signed in to Sync which is different to the
        // user that just verified, show them the old "Account verified!" screen.
        reason = REASON_OTHER_USER_SIGNED_IN;
      } else if (! this.isInExperiment('sendSms', { account })) {
        reason = REASON_NOT_IN_EXPERIMENT;
      }

      if (reason) {
        this.logFlowEvent(reason);
      }

      return ! reason;
    },

    /**
     * Check if `account` to send an SMS, and if so, which
     * country the SMS should be sent to.
     *
     * @param {Object} account - account to check
     * @returns {Promise} If user can send an SMS, resolves to
     *   the country to send the SMS to.
     * @private
     */
    _smsCountry (account) {
      // The auth server can gate whether users can send an SMS based
      // on the user's country and whether the SMS provider account
      // has sufficient funds.
      return account.smsStatus(this.relier.pick('country'))
        .then((resp = {}) => {
          // If the auth-server says the user is good to send an SMS,
          // check with the experiment choices to ensure SMS is enabled for the country
          // returned in the response. The auth-server may report
          // that SMS is enabled for Romania, though it's only enabled
          // for testing and not for the public at large. Experiment choices are used
          // for this because it's the logic most likely to change.
          if (resp.country) {
            this.logFlowEvent(`sms.status.country.${resp.country}`);
          }

          // If geo-lookup is disabled, no country is returned, assume US
          const country = resp.country || 'US';
          if (resp.ok && this.isInExperiment('sendSmsEnabledForCountry', { country })) {
            return country;
          } else {
            // It's a big assumption, but assume ok: false means an unsupported country.
            this.logFlowEvent(REASON_UNSUPPORTED_COUNTRY);
          }
        }, (err) => {
          // Add `.smsStatus` to the context so we can differentiate between errors
          // checking smsStatus from other XHR errors that occur in the consumer modules.
          err.context = `${this.getViewName()}.smsStatus`;
          // Log and throw away errors from smsStatus, it shouldn't
          // prevent verification from completing. Send the user to
          // /connect_another_device instead. See #5109
          this.logError(err);
          this.logFlowEvent(REASON_XHR_ERROR);
        });
    }
  };
});
