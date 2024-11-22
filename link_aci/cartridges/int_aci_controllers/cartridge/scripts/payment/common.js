'use strict';

var ArrayList = require('dw/util/ArrayList');
var List = require('dw/util/List');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');

/**
 * Validates payment instruments and returns valid payment instruments.
 *
 * @alias module:models/ProfileModel~ProfileModel/validateWalletPaymentInstruments
 * @param {dw.customer.Wallet|dw.order.Basket} paymentContainer - Entity that possesses payment instruments
 * @param {String} countryCode Billing country code or null.
 * @param {Number} amount Payment amount to check valid payment instruments for.
 * @returns {ArrayList} Returns an array with the valid PaymentInstruments.
 */
function validatePaymentInstruments(paymentContainer, countryCode, amount) {

    var paymentInstruments = paymentContainer.getPaymentInstruments();

    // Gets applicable payment methods.
    var methods = PaymentMgr.getApplicablePaymentMethods(customer, countryCode, amount);

    // Collects all invalid payment instruments.
    var validPaymentInstruments = new ArrayList(paymentInstruments);
    var invalidPaymentInstruments = new ArrayList();

    for (var i = 0; i < paymentInstruments.length; i++) {
        var paymentInstrument = paymentInstruments[i];

        // Ignores gift certificate payment instruments.
        if (PaymentInstrument.METHOD_GIFT_CERTIFICATE.equals(paymentInstrument.paymentMethod)) {
            continue;
        }

        // Gets a payment method.
        var method = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod());

        // Checks whether payment method is still applicable.
        if (method && methods.contains(method)) {
            continue;
        }

        // Collects invalid payment instruments.
        invalidPaymentInstruments.add(paymentInstrument);
        validPaymentInstruments.remove(paymentInstrument);
    }

    if (invalidPaymentInstruments.size()) {
        return {
            InvalidPaymentInstruments: invalidPaymentInstruments,
            ValidPaymentInstruments: validPaymentInstruments
        };
    } else {
        return {
            ValidPaymentInstruments: validPaymentInstruments
        };
    }
}

module.exports = {
    validatePaymentInstruments: validatePaymentInstruments
};
