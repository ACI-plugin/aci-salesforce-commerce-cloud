'use strict';

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var ACIServiceWrapper = require('*/cartridge/scripts/aci/aciServiceWrapper');
var ACIHelper = require('*/cartridge/scripts/aci/aciHelper');

/**
 * Creates a token. This should be replaced by utilizing a tokenization provider
 * @returns {string} a token
 */
function createToken() {
    return Math.random().toString(36).substr(2);
}

/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation - the payment information
 * @return {Object} returns an error object
 */
function Handle(basket, paymentInformation) {
    var currentBasket = basket;
    var cardErrors = {};
    var serverErrors = [];
    var error = false;

    try {
        Transaction.wrap(function () {
            var paymentInstruments = currentBasket.getPaymentInstruments();
            var iter = paymentInstruments.iterator();

            var currentPI = null;
            while (iter.hasNext()) {
                currentPI = iter.next();
                var paymentMethod = currentPI.paymentMethod;
                if (paymentMethod != null && typeof paymentMethod !== 'undefined' && ACIHelper.isACIPaymentMethod(paymentMethod)) {
                    currentBasket.removePaymentInstrument(currentPI);
                }
            }

            currentBasket.createPaymentInstrument(paymentInformation.paymentMethodID, currentBasket.totalGrossPrice);
        });
    } catch (e) {
        error = true;
        ACIHelper.getLogger().error('[Handle] Error message is ' + e.message);
        serverErrors.push(
            Resource.msg('error.technical', 'checkout', null)
        );
    }

    return {
        fieldErrors: cardErrors,
        serverErrors: serverErrors,
        error: error
    };
}

/**
 * Authorizes a payment using a credit card. Customizations may use other processors and custom
 *      logic to authorize credit card payment.
 * @param {number} orderNumber - The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor -  The payment processor of the current
 *      payment method
 * @return {Object} returns an error object
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var orderMgr = require('dw/order/OrderMgr');
    var serverErrors = [];
    var fieldErrors = {};
    var error = false;
    var ACIRedirect = false;


    try {
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
        });

        var order = orderMgr.getOrder(orderNumber);
        var prepareCheckout = ACIServiceWrapper.prepareCheckout(order);
        if (prepareCheckout.ok) {
            ACIRedirect = true;
            session.privacy.aciCheckoutID = prepareCheckout.object.id; //eslint-disable-line
            session.privacy.orderNo = orderNumber; //eslint-disable-line
            Transaction.wrap(function () {
                var paymentTransaction = paymentInstrument.paymentTransaction;
                paymentTransaction.custom.ACI_TransactionStatusFlow = 'INITIALIZED';
            });
        } else {
            error = true;
            serverErrors.push(
                Resource.msg('error.technical', 'checkout', null)
            );
        }
    } catch (e) {
        error = true;
        ACIHelper.getLogger().error('[Authorize] Error message is ' + e.message);
        serverErrors.push(
            Resource.msg('error.technical', 'checkout', null)
        );
    }

    return {
        ACIRedirect: ACIRedirect,
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: error
    };
}

exports.Handle = Handle;
exports.Authorize = Authorize;
exports.createToken = createToken;
