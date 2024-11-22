'use strict';
var cleave = require('base/components/cleave');

var baseBilling = require('base/checkout/billing');

baseBilling.methods.updatePaymentInformation = function updatePaymentInformation(order) {
    // update payment details
    var $paymentSummary = $('.payment-details');
    var htmlToAppend = '';

    if (order.billing.payment && order.billing.payment.selectedPaymentInstruments &&
        order.billing.payment.selectedPaymentInstruments.length > 0) {
        var paymentName = null;
        var payments = order.billing.payment.applicablePaymentMethods;

        for (var i = 0, len = payments.length; i < len; i++) {
            if (payments[i].ID === order.billing.payment.selectedPaymentInstruments[0].paymentMethod) {
                paymentName = payments[i].name;
                break;
            }
        }

        if (paymentName == null) {
            paymentName = order.billing.payment.selectedPaymentInstruments[0].paymentMethod;
        }
        htmlToAppend += '<span>' + paymentName + '</span>';
        htmlToAppend += ' <span>' + order.billing.payment.selectedPaymentInstruments[0].amount + '</span>';
    }

    $paymentSummary.empty().append(htmlToAppend);
};

baseBilling.methods.validateAndUpdateBillingPaymentInstrument = function (order) {
    var billing = order.billing;
    if (!billing.payment || !billing.payment.selectedPaymentInstruments
        || billing.payment.selectedPaymentInstruments.length <= 0) return;

    var form = $('form[name=dwfrm_billing]');
    if (!form) return;

    var instrument = billing.payment.selectedPaymentInstruments[0];
    $('select[name$=expirationMonth]', form).val(instrument.expirationMonth);
    $('select[name$=expirationYear]', form).val(instrument.expirationYear);
    // Force security code and card number clear
    $('input[name$=securityCode]', form).val('');
    if ($('input[name$=cardNumber]').length > 0) {
        $('input[name$=cardNumber]').data('cleave').setRawValue('');
    }
};

baseBilling.handleCreditCardNumber = function () {
    if ($('.cardNumber').length > 0) {
        cleave.handleCreditCardNumber('.cardNumber', '#cardType');
    }
};

module.exports = baseBilling;
