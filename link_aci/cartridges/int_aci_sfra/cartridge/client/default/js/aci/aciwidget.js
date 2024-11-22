'use strict';
var wpwlOptions = require('./customaciwpwloptions');
var config = $('#aci-widget-options').data('widget-options') || {};

module.exports = {
    initialize: function () {
        window.wpwlOptions = wpwlOptions;
    },
    handleBackButton: function () {
        if (config.page === 'checkout') {
            if (window.history && window.history.pushState) {
                jQuery(window).on('popstate', function () {
                    window.location = $('a.back-to-cart').attr('href');
                    return false;
                });

                window.history.pushState(null, null, location.href);
            }
        }
    }
};
