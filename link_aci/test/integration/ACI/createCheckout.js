var assert = require('chai').assert;
var chaiSubset = require('chai-subset');
var chai = require('chai');
chai.use(chaiSubset);

var request = require('request-promise');
var config = require('../it.config');

describe('Create Checkout ACI Checkout Flow', function () {
    var cookieJar = request.jar();

    var csrfGenerateRequest = {
        url: config.baseUrl + '/CSRF-Generate',
        method: 'POST',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar,
        form: {},
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    };

    var addProductToCartRequest = {
        url: config.baseUrl + '/Cart-AddProduct',
        method: 'POST',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar,
        form: {
            pid: '701644329402M',
            quantity: 1,
            options: []
        },
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    };

    var updateShippingRequest = {
        url: config.baseUrl + '/CheckoutShippingServices-SubmitShipping',
        method: 'POST',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar,
        form: {
            originalShipmentUUID: '',
            shipmentUUID: '',
            shipmentSelector: 'new',
            dwfrm_shipping_shippingAddress_addressFields_firstName: 'Steve',
            dwfrm_shipping_shippingAddress_addressFields_lastName: 'Tom',
            dwfrm_shipping_shippingAddress_addressFields_address1: '2100 Hassel Rd',
            dwfrm_shipping_shippingAddress_addressFields_address2: '202',
            dwfrm_shipping_shippingAddress_addressFields_country: 'US',
            dwfrm_shipping_shippingAddress_addressFields_states_stateCode: 'IL',
            dwfrm_shipping_shippingAddress_addressFields_city: 'Hoffman Estates',
            dwfrm_shipping_shippingAddress_addressFields_postalCode: '60169',
            dwfrm_shipping_shippingAddress_addressFields_phone: '2623456543',
            dwfrm_shipping_shippingAddress_shippingMethodID: '003',
            dwfrm_shipping_shippingAddress_giftMessage: ''

        },
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    };

    var submitPaymentRequest = {
        url: config.baseUrl + '/CheckoutServices-SubmitPayment',
        method: 'POST',
        rejectUnauthorized: false,
        resolveWithFullResponse: true,
        jar: cookieJar,
        form: {
            addressSelector: '0f908cc8c6eff4d33ffc225b4e',
            shipmentUUID: '',
            shipmentSelector: 'new',
            dwfrm_billing_addressFields_firstName: 'Steve',
            dwfrm_billing_addressFields_lastName: 'Tom',
            dwfrm_billing_addressFields_address1: '2100 Hassel Rd',
            dwfrm_billing_addressFields_address2: '201',
            dwfrm_billing_addressFields_country: 'US',
            dwfrm_billing_addressFields_states_stateCode: 'IL',
            dwfrm_billing_addressFields_city: 'Hoffman Estates',
            dwfrm_billing_addressFields_postalCode: '60169',
            dwfrm_billing_contactInfoFields_email: 'test@test.com',
            dwfrm_billing_contactInfoFields_phone: '2623456543',
            dwfrm_shipping_shippingAddress_giftMessage: '',
            dwfrm_billing_paymentMethod: 'CREDIT_CARD'
        },
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }

    };

    var aciPrepareCheckoutRequest = {
        url: config.baseUrl + '/CheckoutServices-PlaceOrder',
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        },
        jar: cookieJar
    };

    var csrfJsonResponse = {};

    it('should create a new ACI checkout experience', function () {
        this.timeout(200000);

        return request(addProductToCartRequest)
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected POST Cart-AddProduct call statusCode to be 200.');

                var nextRequest = csrfGenerateRequest;

                var cookieString = cookieJar.getCookieString(addProductToCartRequest.url);
                var cookie = request.cookie(cookieString);
                cookieJar.setCookie(cookie, addProductToCartRequest.url);
                // step2 : get cookies, Generate CSRF, then set cookies
                return request(nextRequest);
            })
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected POST CSRF-Generate call statusCode to be 200.');

                var nextRequest = updateShippingRequest;

                csrfJsonResponse = JSON.parse(response.body);
                // step3 : submit billing request with token aquired in step 2
                nextRequest.url += '?' +
                    csrfJsonResponse.csrf.tokenName + '=' +
                    csrfJsonResponse.csrf.token;

                return request(nextRequest);
            })
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected POST CSRF-Generate call statusCode to be 200.');

                var nextRequest = submitPaymentRequest;

                nextRequest.url += '?' +
                    csrfJsonResponse.csrf.tokenName + '=' +
                    csrfJsonResponse.csrf.token;

                return request(nextRequest);
            })
            .then(function (response) {
                assert.equal(response.statusCode, 200, 'Expected POST CSRF-Generate call statusCode to be 200.');

                var nextRequest = aciPrepareCheckoutRequest;
                nextRequest.url += '?' +
                    csrfJsonResponse.csrf.tokenName + '=' +
                    csrfJsonResponse.csrf.token;


                return request(nextRequest).then(function (aciPrepareCheckoutResponse) {
                    var aciPrepareCheckoutResponseData = JSON.parse(aciPrepareCheckoutResponse);
                    assert.equal(aciPrepareCheckoutResponseData.error, false, 'Expected POST ACI-PrepareCheckout call error to be false. ');
                    assert.isNotNull(aciPrepareCheckoutResponseData.orderID);
                    assert.isNotNull(aciPrepareCheckoutResponseData.orderToken);
                    assert.isString(aciPrepareCheckoutResponseData.continueUrl);
                });
            });
    });
});
