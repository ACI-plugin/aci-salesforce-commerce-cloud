'use strict';

var server = require('server');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

server.extend(module.superModule);

server.prepend(
    'AddPayment',
    csrfProtection.generateToken,
    consentTracking.consent,
    userLoggedIn.validateLoggedIn,
    function (req, res, next) { //eslint-disable-line
        var Site = require('dw/system/Site');
        if (!Site.current.getCustomPreferenceValue('ACI_ENABLED')) {
            return next();
        }

        var ACIServiceWrapper = require('*/cartridge/scripts/aci/aciServiceWrapper');
        var ACIHelper = require('*/cartridge/scripts/aci/aciHelper');
        var URLUtils = require('dw/web/URLUtils');
        var Resource = require('dw/web/Resource');
        var registrationID = null;
        var prepareRegistration = ACIServiceWrapper.prepareRegistration();
        if (prepareRegistration.ok) {
            registrationID = prepareRegistration.object.id;
            req.session.privacyCache.set('registrationID', registrationID); //eslint-disable-line
        }

        if (registrationID == null) {
            ACIHelper.getLogger().info('[AddPayment] registrationID not found');
            ACIHelper.setACIErrorCode('aci.error.general');
        }

        var dataBrands = ACIHelper.getCardBrands();
        var shopperReturnURL = URLUtils.abs('ACI-HandleTokenizationResponse');

        var widgetOptions = {
            page: 'account',
            CheckSFCCSessionUrl: URLUtils.abs('ACI-IsCustomerAuthenticated').toString()
        };

        res.render('account/payment/aciCreditcardregistration', {
            aciCheckoutID: registrationID,
            dataBrands: dataBrands,
            shopperReturnURL: shopperReturnURL,
            widgetUrl: ACIHelper.preferences.aciWidgetURL,
            sessionErrorUrl: URLUtils.url('PaymentInstruments-List').toString(),
            widgetOptions: JSON.stringify(widgetOptions),
            breadcrumbs: [{
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString()
            },
            {
                htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                url: URLUtils.url('Account-Show').toString()
            },
            {
                htmlValue: Resource.msg('page.heading.payments', 'payment', null),
                url: URLUtils.url('PaymentInstruments-List').toString()
            }
            ]
        });
        this.emit('route:Complete', req, res);
        return; //eslint-disable-line
    }
);

server.append('List', userLoggedIn.validateLoggedIn, consentTracking.consent, function (req, res, next) {
    var Site = require('dw/system/Site');
    if (!Site.current.getCustomPreferenceValue('ACI_ENABLED')) {
        return next();
    }

    var Calendar = require('dw/util/Calendar');
    var viewData = res.getViewData();
    var paymentInstruments = viewData.paymentInstruments;

    Object.keys(paymentInstruments).forEach(function (key) {
        var paymentInstrument = paymentInstruments[key];
        paymentInstrument.expired = false;
        var expireDate = new Date(paymentInstrument.creditCardExpirationYear, paymentInstrument.creditCardExpirationMonth);
        if ((new Calendar()).after(new Calendar(expireDate))) {
            paymentInstrument.expired = true;
        }
    });
    viewData.paymentInstruments = paymentInstruments;

    res.render('account/payment/aciPayment', viewData);
    return next();
});

module.exports = server.exports();
