'use strict';

/**
 * Empty implementation for processForm method for ACI payments
 * @param {Object} req - The request object
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @return {Object} an object that contains error information
 */
function processForm(req, paymentForm, viewFormData) {
    var viewData = viewFormData;

    viewData.paymentMethod = {
        value: paymentForm.paymentMethod.value,
        htmlName: paymentForm.paymentMethod.value
    };

    viewData.paymentInformation = {
        cardNumber: {
            value: '',
            htmlName: ''
        }
    };
    viewData.paymentInformation.paymentMethodID = viewData.paymentMethod.value;

    return {
        error: false,
        viewData: viewData
    };
}

/**
 * default hook if no save payment information processor is supported
 */
function savePaymentInformation() {
    return;
}

exports.processForm = processForm;
exports.savePaymentInformation = savePaymentInformation;
