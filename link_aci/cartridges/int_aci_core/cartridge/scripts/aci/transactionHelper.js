'use strict';

var Transaction = require('dw/system/Transaction');
var ACIServiceWrapper = require("~/cartridge/scripts/aci/aciServiceWrapper");
var ACIHelper = require('~/cartridge/scripts/aci/aciHelper');
var TransactionHelper = {};

/**
 * Initiate Capture Request for an order
 *
 * @param {String} OrderNo number
 * @param {String} captureAmount number
 * @returns {Object} captureResponse Capture response
 */
TransactionHelper.initiateCaptureRequest = function (orderNo, captureAmount) {

    var response = {
        ok: false
    };

    try {

        var order = dw.order.OrderMgr.getOrder(orderNo);
        if (!order) {
            ACIHelper.getLogger().error('[initiateCaptureRequest] Unable to find order : ' + orderNo);
            response.errorCode = 'UNABLE_TO_FIND_ORDER';
            return response;
        }

        var currencyCode = order.getCurrencyCode();
        var transactionID = _getPaymentTransactionID(order);
        if (transactionID) {
            var captureResponse = ACIServiceWrapper.capturePayment(transactionID, currencyCode, captureAmount);
            Transaction.wrap(function () {
                if (captureResponse.ok) {
                    ACIHelper.savePaymentResponse(order, captureResponse.object);
                    response.ok = true;
                } else {
                    ACIHelper.getLogger().error('[initiateCaptureRequest] An error occurred during Capture request service for order : ' + orderNo + '. Error details : ' + captureResponse.errorMessage);
                    ACIHelper.savePaymentResponse(order, captureResponse.errorMessage);
                    response.errorCode = 'ACI_CAPTURE_ERROR';
                }
            });
        } else {
            ACIHelper.getLogger().error('[initiateCaptureRequest] Unable to find transaction id for order : ' + orderNo);
            response.errorCode = 'UNABLE_TO_FIND_TRANSACTION';
        }

    } catch (e) {
        ACIHelper.getLogger().error("[initiateCaptureRequest] An error occurred during Capture request service.\n Error details :" + e.message);
        response.errorCode = 'GENERAL_CAPTURE_ERROR';
    }

    return response;
}

function _getPaymentTransactionID(order) {
    var paymentInstruments = order.getPaymentInstruments();
    var transactionID = '';

    if (paymentInstruments.length > 0) {
        for (var i = 0; i < paymentInstruments.length; i++) {
            var paymentInstrument = paymentInstruments[i];
            if (ACIHelper.isACIPaymentMethod(paymentInstrument.paymentMethod)) {
                transactionID = paymentInstrument.paymentTransaction.transactionID;
                break;
            }

        }
    }
    return transactionID;
}

/**
 * Reverses ACI payment for an order
 *
 * @param {String} Order number
 * @returns {Object} Reverse response
 */
TransactionHelper.reversePayment = function (orderNo) {

    var response = {
        ok: false
    };

    try {
        var order = dw.order.OrderMgr.getOrder(orderNo);

        if (!order) {
            ACIHelper.getLogger().error('[ReversePayment] Unable to find order : ' + orderNo);
            response.errorCode = 'UNABLE_TO_FIND_ORDER';
            return response;
        }

        var transactionID = _getPaymentTransactionID(order);

        if (!transactionID) {
            ACIHelper.getLogger().error('[ReversePayment] Unable to find transaction for order : ' + orderNo);
            response.errorCode = 'UNABLE_TO_FIND_TRANSACTION';
            return response;
        }

        var reversalResponse = ACIServiceWrapper.reversePayment(transactionID);

        Transaction.wrap(function () {
            if (reversalResponse.ok) {

                //Save transaction response to order
                ACIHelper.savePaymentResponse(order, reversalResponse.object);
                response.ok = true;

            } else {
                ACIHelper.getLogger().error('[ReversePayment] An error occurred while reversing payment for order : ' + order.orderNo + '\n Error details : ' + reversalResponse.errorMessage);
                ACIHelper.savePaymentResponse(order, reversalResponse.errorMessage);
                response.errorCode = 'ACI_REVERSAL_ERROR';
            }
        });
    } catch (e) {
        ACIHelper.getLogger().error("[ReversePayment] An error occurred during reverse payment service.\n Error details :" + e.message);
        response.errorCode = 'GENERAL_REVERSAL_ERROR';
    }

    return response;
}


/**
 * Refunds ACI payment for an order
 *
 * @param {String, String} Order number, Refund amount
 * @returns {Object} Refund response
 */
TransactionHelper.initiateRefundRequest = function (orderNo, refundAmount) {

    var response = {
        ok: false
    };

    try {
        var order = dw.order.OrderMgr.getOrder(orderNo);

        if (!order) {
            ACIHelper.getLogger().error('[initiateRefundRequest] Unable to find order : ' + orderNo);
            response.errorCode = 'UNABLE_TO_FIND_ORDER';
            return response;
        }

        var transactionID = _getPaymentTransactionID(order);

        if (!transactionID) {
            ACIHelper.getLogger().error('[initiateRefundRequest] Unable to find transaction for order : ' + orderNo);
            response.errorCode = 'UNABLE_TO_FIND_TRANSACTION';
            return response;
        }

        var currencyCode = order.getCurrencyCode();

        var refundResponse = ACIServiceWrapper.refundPayment(transactionID, currencyCode, refundAmount);

        Transaction.wrap(function () {
            if (refundResponse.ok) {

                //Save transaction response to order
                ACIHelper.savePaymentResponse(order, refundResponse.object);
                response.ok = true;

            } else {
                ACIHelper.getLogger().error('[initiateRefundRequest] An error occurred in refund payment for order: ' + order.orderNo + '\n Error details : ' + refundResponse.errorMessage);
                ACIHelper.savePaymentResponse(order, refundResponse.errorMessage);
                response.errorCode = 'ACI_REFUND_ERROR';
            }
        });

    } catch (e) {
        ACIHelper.getLogger().error("[initiateRefundRequest] An error occurred in refund payment service.\n Error details :" + e.message);
        response.errorCode = 'GENERAL_REFUND_ERROR';
    }

    return response;

}

module.exports = TransactionHelper;