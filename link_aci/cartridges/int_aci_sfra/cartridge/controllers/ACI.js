'use strict';

var server = require('server');

var ACIHelper = require('*/cartridge/scripts/aci/aciHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');
var URLUtils = require('dw/web/URLUtils');

server.get(
    'CheckSFCCSessionLive',
    server.middleware.https,
    consentTracking.consent,
    csrfProtection.generateToken,
    function (req, res, next) {
        var OrderMgr = require('dw/order/OrderMgr');
        var status = false;
        var orderNo = req.session.privacyCache.get('orderNo');
        if (orderNo !== null) {
            var order = OrderMgr.getOrder(orderNo);
            if (order && order.getStatus().value === dw.order.Order.ORDER_STATUS_CREATED) { //eslint-disable-line
                status = true;
            }
        }
        res.json({
            success: status
        });
        return next();
    }
);

/**
 * Main entry point for Checkout
 */

server.post(
    'ShowCheckoutWidget',
    server.middleware.https,
    consentTracking.consent,
    csrfProtection.generateToken,
    function (req, res, next) {
        var PaymentMgr = require('dw/order/PaymentMgr');
        var OrderMgr = require('dw/order/OrderMgr');
        var OrderModel = require('*/cartridge/models/order');
        var Transaction = require('dw/system/Transaction');

        var order = OrderMgr.getOrder(req.session.privacyCache.get('orderNo'));
        if (!order) {
            res.redirect(URLUtils.url('Cart-Show'));
            return next();
        }
        var orderPaymentInstrument = ACIHelper.getPayment(order);
        var paymentMethodID = orderPaymentInstrument.getPaymentMethod();
        if (!paymentMethodID) {
            Transaction.wrap(function () {
                OrderMgr.failOrder(order, true);
            });
            ACIHelper.getLogger().info('[showCheckoutWidget] paymentMethodID not found');
            res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'shipping'));
            return next();
        }

        var paymentMethod = PaymentMgr.getPaymentMethod(paymentMethodID);

        var PaymentInstrument = require('dw/order/PaymentInstrument');
        var dataBrands;

        if (paymentMethod.ID.equals(PaymentInstrument.METHOD_CREDIT_CARD)) {
            dataBrands = ACIHelper.getCardBrands();
        } else {
            dataBrands = paymentMethod.custom.ACI_BrandID;
        }

        var aciCheckoutID = req.session.privacyCache.get('aciCheckoutID');
        req.session.privacyCache.set('aciCheckoutID', null);

        if (!aciCheckoutID) {
            ACIHelper.getLogger().info('[showCheckoutWidget] aciCheckoutID not found');
            ACIHelper.setACIErrorCode('aci.error.general');
            Transaction.wrap(function () {
                OrderMgr.failOrder(order, true);
            });
            res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'shipping'));
            return next();
        }

        var widgetOptions = {
            page: 'checkout',
            CheckSFCCSessionUrl: URLUtils.abs('ACI-CheckSFCCSessionLive').toString(),
            allowRegistration: !!((customer.isAuthenticated() && ACIHelper.preferences.allowRegistration)), //eslint-disable-line
            async: paymentMethod.custom.ACI_Asynchronous,
            gatewayMerchantId: ACIHelper.preferences.entityID,
            appleDisplayName: ACIHelper.preferences.appleDisplayName,
            appleBusinessName: ACIHelper.preferences.appleBusinessName

        };

        var orderModel = new OrderModel(
            order, {
                containerView: 'order'
            }
        );

        var backToCartUrl = URLUtils.abs('ACI-BackToCart', 'OrderNo', order.orderNo).toString();
        res.render('checkout/acipayment', {
            aciCheckoutID: aciCheckoutID,
            dataBrands: dataBrands,
            order: orderModel,
            widgetUrl: ACIHelper.preferences.aciWidgetURL,
            shopperReturnURL: URLUtils.abs('ACI-HandleACIRedirect').toString(),
            sessionErrorUrl: backToCartUrl,
            async: paymentMethod.custom.ACI_Asynchronous,
            widgetOptions: JSON.stringify(widgetOptions),
            backToCartUrl: backToCartUrl
        });

        return next();
    }
);

/**
 * handle ACI payment response
 */

server.get(
    'HandleACIRedirect',
    server.middleware.https,
    consentTracking.consent,
    csrfProtection.generateToken,
    function (req, res, next) {
        var Resource = require('dw/web/Resource');
        var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
        var ACIPostPaymentProcessor = require('*/cartridge/scripts/aci/aciPostPaymentProcessor');
        var response = ACIPostPaymentProcessor.postPaymentProcess();
        var order = response.order;
        // if error, return to checkout page
        if (!response.ok) {
            if (response.isTransactionCancelledByCustomer) {
                res.redirect(URLUtils.https('Checkout-Begin', 'stage', 'payment'));
            } else {
                res.redirect(URLUtils.https('Checkout-Begin', 'stage', 'payment', 'paymentError', Resource.msg('error.payment.not.valid', 'checkout', null)));
            }
            return next();
        }
        // Places the order

        var placeOrderResult = COHelpers.placeOrder(order, {});
        if (placeOrderResult.error) {
            res.redirect(URLUtils.https('Checkout-Begin', 'stage', 'placeOrder', 'paymentError', Resource.msg('error.technical', 'checkout', null)));
            return next();
        }
        // Check if payment status is pending and update export status to not exported
        ACIHelper.updateOrderExportStatus(order);


        COHelpers.sendConfirmationEmail(order, req.locale.id);

        // Reset usingMultiShip after successful Order placement
        req.session.privacyCache.set('usingMultiShipping', false);

        res.render('checkout/acipreconfirm', {
            confirmationUrl: URLUtils.https('Order-Confirm').toString(),
            orderID: order.orderNo,
            token: order.orderToken
        });
        return next();
    }
);


/**
 * Handle Tokenization response from the ACI My Account
 */
server.get(
    'HandleTokenizationResponse',
    server.middleware.https,
    consentTracking.consent,
    csrfProtection.generateToken,
    function (req, res, next) {
        var ACIServiceWrapper = require('*/cartridge/scripts/aci/aciServiceWrapper');
        var registrationID = req.querystring.id;
        var sessionRegistrationID = req.session.privacyCache.get('registrationID');
        var redirectUrl = URLUtils.url('PaymentInstruments-List');
        if (registrationID == null && sessionRegistrationID !== registrationID) {
            ACIHelper.setACIErrorCode('aci.error.general');
            res.redirect(URLUtils.url('PaymentInstruments-AddPayment'));
            return next();
        }
        try {
            var resourcePath = req.querystring.resourcePath;
            var tokenizationResponse = ACIServiceWrapper.getRegistrationStatus(resourcePath);
            if (tokenizationResponse.ok && !ACIHelper.isTransactionRejected(tokenizationResponse.object)) {
                ACIHelper.saveCustomerCreditCard(tokenizationResponse.object);
                req.session.privacyCache.set('registrationID', null);
            } else {
                ACIHelper.setACIErrorCode('aci.error.general');
                redirectUrl = URLUtils.url('PaymentInstruments-AddPayment');
            }
        } catch (e) {
            var errorMsg = "[handleTokenizationResponse] An error occurred during tokenization registration's result service.\n Error details :" + e.message;
            ACIHelper.setACIErrorCode('aci.error.general');
            redirectUrl = URLUtils.url('PaymentInstruments-AddPayment');
            ACIHelper.getLogger().error(errorMsg);
        }
        res.redirect(redirectUrl);
        return next();
    }
);

server.get(
    'IsCustomerAuthenticated',
    server.middleware.https,
    function (req, res, next) {
        var status = true;
        if (!req.currentCustomer.raw.authenticated) {
            status = false;
        }
        res.json({
            success: status
        });
        return next();
    }
);

/**
 * Handles the click on logo or return to site URL from ACI payment widget page
 */
server.get(
    'BackToCart',
    server.middleware.https,
    consentTracking.consent,
    csrfProtection.generateToken,
    function (req, res, next) {
        var OrderMgr = require('dw/order/OrderMgr');
        var Transaction = require('dw/system/Transaction');
        var orderNo = req.querystring.OrderNo;
        var order = OrderMgr.getOrder(orderNo);

        if (order != null && order.getStatus().value === dw.order.Order.ORDER_STATUS_CREATED) { //eslint-disable-line
            Transaction.wrap(function () {
                OrderMgr.failOrder(order, true);
            });
            ACIHelper.getLogger().error('[BackToCart] Failing order as customer clicked back to cart');
        } else {
            ACIHelper.getLogger().error('[BackToCart] Order not found or order status is not CREATED');
        }
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }
);

/**
 * Handles the click on logo or return to site URL from ACI payment widget page
 */
server.get(
    'ShowError',
    server.middleware.https,
    consentTracking.consent,
    csrfProtection.generateToken,
    function (req, res, next) {
        var ACIErrorCode = req.session.privacyCache.get('ACIErrorCode');
        req.session.privacyCache.set('ACIErrorCode', null);
        res.render('aci/util/errormessages', {
            ACIErrorCode: ACIErrorCode
        });
        return next();
    }
);

module.exports = server.exports();
