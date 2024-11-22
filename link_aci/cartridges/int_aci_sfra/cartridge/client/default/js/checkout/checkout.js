'use strict';

var baseCheckout = require('base/checkout/checkout');

var billingHelpers = require('./billing');

[billingHelpers].forEach(function (library) {
    Object.keys(library).forEach(function (item) {
        if (typeof library[item] === 'object') {
            baseCheckout[item] = $.extend({}, baseCheckout[item], library[item]);
        } else {
            baseCheckout[item] = library[item];
        }
    });
});

module.exports = baseCheckout;
