'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var Transaction = require('../dw/system/Transaction');
var ArrayList = require('../dw.util.Collection');
var Logger = require('../dw/system/Logger');
var createCustomer = function () {
    return {
        addressBook: {
            addresses: {},
            preferredAddress: {
                address1: '15 South Point Drive',
                address2: null,
                city: 'Boston',
                countryCode: {
                    displayValue: 'United States',
                    value: 'US'
                },
                firstName: 'John',
                lastName: 'Snow',
                ID: 'Home',
                postalCode: '02125',
                stateCode: 'MA'
            }
        },
        customer: {},
        profile: {
            firstName: 'John',
            lastName: 'Snow',
            email: 'jsnow@starks.com'
        },
        wallet: {
            getPaymentInstruments: function () {
                return [{
                    creditCardExpirationMonth: '6',
                    creditCardExpirationYear: '2019',
                    maskedCreditCardNumber: '***********4215',
                    creditCardType: 'Master Card',
                    paymentMethod: 'CREDIT_CARD'
                }];
            }
        },
        raw: {
            authenticated: true,
            registered: true
        }
    };
};

function proxyModel() {
    return proxyquire('../../../cartridges/int_aci_core/cartridge/scripts/aci/ACIHelper', {
        // '*/cartridge/scripts/util/collections': collections,
        'customer': function () {
            return createCustomer();
        },
        'dw/system/Transaction': Transaction,
        'dw/system/Logger': Logger,
        'dw/order/PaymentMgr': {
            getApplicablePaymentMethods: function () {
                return [{
                    ID: 'GIFT_CERTIFICATE',
                    name: 'Gift Certificate'
                },
                {
                    ID: 'CREDIT_CARD',
                    name: 'Credit Card'
                }
                ];
            },
            getPaymentMethod: function () {
                return {
                    getActivePaymentCards: function () {
                        return new ArrayList([{
                            cardType: 'Visa',
                            name: 'Visa',
                            UUID: 'some UUID'
                        },
                        {
                            cardType: 'Amex',
                            name: 'American Express',
                            UUID: 'some UUID'
                        },
                        {
                            cardType: 'Master Card',
                            name: 'MasterCard'
                        },
                        {
                            cardType: 'Discover',
                            name: 'Discover'
                        }
                        ]);
                    }
                };
            },
            getApplicablePaymentCards: function () {
                return ['applicable payment cards'];
            }
        },
        'dw/system/Site': {
            getCurrent: function () {
                return {
                    getCustomPreferenceValue: function () {
                        return 'SOME_API_KEY';
                    }
                };
            }
        },
        'dw/order/PaymentInstrument': {},
        'dw/util/Iterator': {}
    });
}

module.exports = proxyModel();
