'use strict';
var basewpwlOptions = require('./baseaciwpwloptions');

// Add your changes below this line

/**
 * 	Examples on how to override base wpwlOptions

   	Override onReady function from base

		var baseOnReady = basewpwlOptions.onReady;
		var wpwlOptions = {
    onReady: function () {
			// Add logic to override base functionality
      baseOnReady.call(this); //Required only if you need base functionality to be executed as well

    }
};
 */

var baseOnReady = basewpwlOptions.onReady;

var wpwlOptions = {
    style: 'plain',
    showCVVHint: true,
    onReady: function () {
        baseOnReady.call(this);
        $('.wpwl-group-cardNumber').after($('.wpwl-group-brand'));
        $('.wpwl-group-expiry').after($('.wpwl-group-cvv'));
    }
};

var customwpwlOptions = $.extend({}, basewpwlOptions, wpwlOptions);

module.exports = customwpwlOptions;
