/**
 * Description of the module and the logic it provides
 *
 * @module cartridge/scripts/payment/processor/ACI
 */

'use strict';

/* API Includes */
var Cart = require('*/cartridge/scripts/models/CartModel');
var PaymentMgr = require('dw/order/PaymentMgr');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');
var ACIHelper = require('*/cartridge/scripts/aci/aciHelper');

/* Script Modules */
var ACIServiceWrapper = require('*/cartridge/scripts/aci/aciServiceWrapper');


/**
 * Makes a POST request to ACI to prepare the checkout.
 * Saves the checkout ID returned in the API call to custom attribute in basket
 */
function Handle(args) {
    var cart = Cart.get(args.Basket);
    var paymentInstrument;
    Transaction.wrap(function () {
    var paymentInstruments = cart.getPaymentInstruments();
    var iter = paymentInstruments.iterator();
    var currentPi = null;
    while (iter.hasNext()) {
        	currentPi = iter.next();
            var paymentMethod = currentPi.paymentMethod;
            if (paymentMethod != null && typeof paymentMethod !== 'undefined' && ACIHelper.isACIPaymentMethod(paymentMethod)) {
            	cart.removePaymentInstrument(currentPi);
            }
        }
    paymentInstrument = cart.createPaymentInstrument(args.PaymentMethodID, cart.getNonGiftCertificateAmount());
    cart.object.custom.ACI_CheckoutID = null;
});

    try {
    var prepareCheckout = ACIServiceWrapper.prepareCheckout(cart.object);
    if (prepareCheckout.ok) {
    Transaction.wrap(function () {
				/* Add a dummy credit card type for credit card payments.
				 * This is to handle validation after submit from ACI hosted page as
				 * validation fails due to credit card type not present in payment
				 */
				/* if (PaymentInstrument.METHOD_CREDIT_CARD.equals(args.PaymentMethodID)) {
					paymentInstrument.creditCardType = ACIHelper.CONST.ACI_DUMMY_CARD_TYPE;
				}*/

    var paymentTransaction = paymentInstrument.paymentTransaction;
    paymentTransaction.custom.ACI_TransactionStatusFlow = 'INITIALIZED';

    cart.object.custom.ACI_CheckoutID = session.privacy.aciCheckoutID = prepareCheckout.object.id;
});
} else {
    ACIHelper.setACIErrorCode('aci.error.general');
    return {
    error: true
};
}
} catch (e) {
    var errorMsg = '[prepareCheckout] An error occurred during ACI Prepare checkout API.\n Error details :' + e.message;
    ACIHelper.getLogger().error(errorMsg);
    ACIHelper.setACIErrorCode('aci.error.general');
return {
    error: true
};
}
    return {
    success: true
};
}

/**
 * Authorizes a payment using ACI Service if the authorization has not happened and
 * redirects to separate page to show ACI payment Widget.
 * If the call to Authorize happens after redirect from ACI, then get the payment status from ACI
 * and update payment transaction details
 *
 */
function Authorize(args) {

	var order = args.Order;

	if (order.custom.ACI_PaymentResponse.length == 0) {
		// First call to Authorize from COSummary-Submit after order is created
		try {
			var updateCheckout = ACIServiceWrapper.updateCheckout(order);

			if (updateCheckout.ok) {
				session.privacy.aciCheckoutID = order.custom.ACI_CheckoutID;
				session.privacy.orderNo = order.orderNo;
				response.redirect(URLUtils.url('ACI-SubmitACIPayment'));
				return {
					hostedCheckout: true
				};
			} 
				return {
					error: true,
					authorized: false
				};
			

		} catch (e) {

			var errorMsg = "[UpdateCheckout] An error occurred during ACI Prepare checkout API in Authorization.\n Error details :" + e.message;
			ACIHelper.getLogger().error(errorMsg);
			ACIHelper.setACIErrorCode('aci.error.general');
			return {
				error: true,
				authorized: false
			};
		}

		return {
			error: true,
			authorized: false
		};
	}

	// Second call to Authorize from COSummary-ACIRedirect(shopper return url). Control reaches here only if SFCC session is valid and payment
	//was processed successfully
	return {
		error: false,
		authorized: true
	};
}


/*
 * Module exports
 */

exports.Handle = Handle;
exports.Authorize = Authorize;
