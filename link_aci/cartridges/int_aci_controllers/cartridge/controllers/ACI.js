/**
 * Controller to display ACI COPYandPAY widget
 *
 * @module  controllers/ACI
 */

'use strict';

/* API Includes */
var BasketMgr = require('dw/order/BasketMgr');
var PaymentMgr = require('dw/order/PaymentMgr');

/* Script Modules */
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');
var URLUtils = require('dw/web/URLUtils');
var ACIHelper = require('*/cartridge/scripts/aci/aciHelper');
var AciServiceWrapper = require('*/cartridge/scripts/aci/aciServiceWrapper');

/**
 * Displays ACI payment widget form
 *
 */
var showCheckoutWidget = function () {
    var basket = BasketMgr.getCurrentBasket();

    var paymentMethodID = session.privacy.paymentMethodID;
    if (!paymentMethodID) {
        ACIHelper.getLogger().info('[showCheckoutWidget] paymentMethodID not found');
        response.redirect(URLUtils.url('COBilling-Start'));
        return;
    }

    delete session.privacy.paymentMethodID;
    var paymentMethod = PaymentMgr.getPaymentMethod(paymentMethodID);

    var PaymentInstrument = require('dw/order/PaymentInstrument');
    var dataBrands;

    if (paymentMethod.ID.equals(PaymentInstrument.METHOD_CREDIT_CARD)) {
        dataBrands = ACIHelper.getCardBrands();
    } else {
        dataBrands = paymentMethod.custom.ACI_BrandID;
    }

    var aciCheckoutID = basket.custom.ACI_CheckoutID;
    if (!aciCheckoutID) {
        ACIHelper.getLogger().info('[showCheckoutWidget] aciCheckoutID not found');
        ACIHelper.setACIErrorCode('aci.error.general');
        response.redirect(URLUtils.url('COBilling-Start'));
    }

    var useSummary = ACIHelper.preferences.useSummary;
    var actionURL = null;

    if (useSummary) {
        actionURL = URLUtils.abs('COSummary-Start');
    } else {
        actionURL = URLUtils.abs('COSummary-ACIHostedPageSubmit');
    }

    var widgetOptions = {
        page: 'checkout',
        CheckSFCCSessionUrl: URLUtils.abs('ACI-CheckSFCCSessionLive').toString(),
        allowRegistration: !!((customer.isAuthenticated() && ACIHelper.preferences.allowRegistration)),
        actionURL: actionURL.toString(),
        async: paymentMethod.custom.ACI_Asynchronous
    };


    app.getView({
        aciCheckoutID: aciCheckoutID,
        dataBrands: dataBrands,
        Basket: basket,
        widgetUrl: ACIHelper.preferences.aciWidgetURL,
        shopperReturnURL: URLUtils.abs('COSummary-ACIRedirect'),
        sessionErrorUrl: URLUtils.url('Cart-Show').toString(),
        async: paymentMethod.custom.ACI_Asynchronous,
        widgetOptions: JSON.stringify(widgetOptions)
    }).render('checkout/acipayment');
};

/**
 * Show credit card registration widget in account
 */
var showRegistrationWidget = function () {
    var prepareRegistration = AciServiceWrapper.prepareRegistration();

    if (prepareRegistration.ok) {
        var registrationID = session.privacy.registrationID = prepareRegistration.object.id;
    }

    var dataBrands = ACIHelper.getCardBrands();
    var shopperReturnURL = URLUtils.abs('ACI-HandleTokenizationResponse');
    if (registrationID == null) {
        ACIHelper.getLogger().info('[ShowRegistrationWidget] registrationID not found');
        ACIHelper.setACIErrorCode('aci.error.general');
        response.redirect(URLUtils.url('PaymentInstruments-List'));
    }

    var widgetOptions = {
        page: 'account',
        CheckSFCCSessionUrl: URLUtils.abs('ACI-IsCustomerAuthenticated').toString()
    };

    app.getView({
        aciCheckoutID: registrationID,
        dataBrands: dataBrands,
        shopperReturnURL: shopperReturnURL,
        widgetUrl: ACIHelper.preferences.aciWidgetURL,
        sessionErrorUrl: URLUtils.url('PaymentInstruments-List').toString(),
        widgetOptions: JSON.stringify(widgetOptions)
    }).render('account/creditcardregistration');
};

/**
 * Handle Tokenization response from the ACI My Account
 */
var handleTokenizationResponse = function () {
    var registrationID = request.httpParameterMap.id;
    if (registrationID !== null && session.privacy.registrationID == registrationID) {
        try {
            var resourcePath = request.httpParameterMap.resourcePath;
            var tokenizationResponse = AciServiceWrapper.getRegistrationStatus(resourcePath);
            delete session.privacy.registrationID;

            if (tokenizationResponse.ok && !ACIHelper.isTransactionRejected(tokenizationResponse.object)) {
                ACIHelper.saveCustomerCreditCard(tokenizationResponse.object);
            } else {
                ACIHelper.setACIErrorCode('aci.error.general');
            }
        } catch (e) {
            var errorMsg = "[handleTokenizationResponse] An error occurred during tokenization registration's result service.\n Error details :" + e.message;
            ACIHelper.setACIErrorCode('aci.error.general');
            ACIHelper.getLogger().error(errorMsg);
        }
    }
    response.redirect(URLUtils.url('PaymentInstruments-List'));
};

/**
 * Submits final ACI payment form to ACI
 */
var submitACIPayment = function () {
    var aciCheckoutID = session.privacy.aciCheckoutID;
    delete session.privacy.aciCheckoutID;

    var widgetURL = ACIHelper.preferences.aciWidgetURL + '/checkouts/' + aciCheckoutID + '/payment';
    app.getView({
        widgetURL: widgetURL
    }).render('checkout/submitpayment');
};

/**
 * Check the cart session before payment
 */
var checkSFCCSessionLive = function () {
    var status = true;
    var Response = require('*/cartridge/scripts/util/Response');
    var basket = BasketMgr.getCurrentBasket();
    var aciCheckoutID = 'aciCheckoutID' in session.privacy && session.privacy.aciCheckoutID;
    if (basket === null) {
        status = false;
    } else if (!aciCheckoutID) {
        status = false;
    }
    Response.renderJSON({
        success: status
    });
};

var isCustomerAuthenticated = function () {
    var Response = require('*/cartridge/scripts/util/Response');
    var status = true;
    if (!customer.isAuthenticated()) {
        status = false;
    }
    Response.renderJSON({
        success: status
    });
};

var handleACIRedirect = function () {
    var returnObj = {
        error: false
    };

    var ACIPostPaymentProcessor = require('*/cartridge/scripts/aci/aciPostPaymentProcessor');
    var paymentResponse = ACIPostPaymentProcessor.postPaymentProcess();

    if (paymentResponse.ok) {
		// Payment processed successfully
        session.privacy.isRedirectFromACI = true;
        return returnObj;
    }
		// Error occurred during payment processing. Redirect customer to billing page, if recreated basket has items
		// Redirect customer to empty basket page if recreated basket is empty (occurs during session timeout or placing multiple orders simultaneously
		// Error message is displayed only on billing page when the transaction was rejected by ACI and not cancelled by customer
    returnObj.error = true;
    returnObj.errorRedirectURL = URLUtils.url('Cart-Show');

    var currentBasket = BasketMgr.currentBasket;
    if (currentBasket && currentBasket.productLineItems.length > 0) {
        returnObj.errorRedirectURL = URLUtils.url('COBilling-Start');
        if (!paymentResponse.isTransactionCancelledByCustomer) {
            ACIHelper.setACIErrorCode('aci.error.general');
        }
    }

    return returnObj;
};

var ShowError = function () {
    var ACIErrorCode = session.privacy.ACIErrorCode;
    delete session.privacy.ACIErrorCode;
    app.getView({
        ACIErrorCode: ACIErrorCode
    }).render('aci/util/errormessages');
};

/* Exports of the controller */
// /**
/** Displays ACI payment widget page
 * @see {@link module:controllers/ACI~ShowCheckoutWidget} */
exports.ShowCheckoutWidget = guard.ensure(['get'], showCheckoutWidget);

/** save/update customer credit cards.
 * @see {@link module:controllers/ACI~handleTokenizationResponse} */
exports.HandleTokenizationResponse = guard.ensure(['get', 'loggedIn'], handleTokenizationResponse);

/** Show customer credit cards registration form.
 * @see {@link module:controllers/ACI~ShowRegistrationWidget} */
exports.ShowRegistrationWidget = guard.ensure(['get', 'loggedIn'], showRegistrationWidget);

/** Submits final ACI payment form to ACI
 * @see {@link module:controllers/ACI~SubmitACIPayment} */
exports.SubmitACIPayment = guard.ensure(['get', 'https'], submitACIPayment);

/** Submits final ACI payment form to ACI
 * @see {@link module:controllers/ACI~CheckSFCCSessionLive} */
exports.CheckSFCCSessionLive = guard.ensure(['get', 'https'], checkSFCCSessionLive);
/** Check customer is Authenticated
 * @see {@link module:controllers/ACI~isCustomerAuthenticated} */
exports.IsCustomerAuthenticated = guard.ensure(['get', 'https'], isCustomerAuthenticated);
/** Show error message
 * @see {@link module:controllers/ACI~ShowError} */
exports.ShowError = guard.ensure(['get', 'https'], ShowError);


exports.HandleACIRedirect = handleACIRedirect;
