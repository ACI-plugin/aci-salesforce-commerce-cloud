'use strict';

var config = $('#aci-widget-options').data('widget-options') || {};

/**
 * Widget timeout/communication error callback
 * @param {Object} error - Error object
 */
function onError(error) {
    if (error.brand === 'GOOGLEPAY' && error.event === 'closed') {
        return;
    }
    $('.overlay-text p').hide();

    if (error.name === 'InvalidCheckoutIdError') {
        $('.overlay-text p.session').show();
    } else {
        $('.overlay-text p.general').show();
    }
    $('#aci-overlay').show();
}

/**
 * Initialize Events
 */
function initializeEvents() {
    if (config.page === 'account') {
        $('.wpwl-button-pay', '.card-registration').click(function () {
            var error = {
                name: 'InvalidCheckoutIdError'
            };
            $.ajax({
                type: 'GET',
                dataType: 'json',
                contentType: 'application/json',
                url: config.CheckSFCCSessionUrl
            })
                // eslint-disable-next-line consistent-return
                .done(function (response) {
                    // success
                    if (!response.success) {
                        onError(error);
                        return false;
                    }
                })
                .fail(function () {
                    onError(error);
                });
        });
    }
}

/**
 * Widget on reday callback
 */
function onReady() {
    initializeEvents();
    if (config.page === 'checkout') {
        if (config.allowRegistration === true) {
            var createRegistrationHtml = '<div class="customLabel">Store payment details?</div><div class="customInput"><input type="hidden" name="customParameters[SHOPPER_savedCard]" value="false"/><input id="create-registration" type="checkbox" name="createRegistration" value="true" /></div>';
            $('form.wpwl-form-card').find('.wpwl-button').before(createRegistrationHtml);
            $('#create-registration').click(function () {
                $("input[name='customParameters[SHOPPER_savedCard]']").val($('#create-registration').prop('checked'));
            });
        }
        if (config.async === true) {
            $('.wpwl-brand').trigger('click');
        }
    }
}

/**
 * Check SFCC session exits or not.
 * @returns {Object} deferred object.
 */
function validateSession() {
    var error = {
        name: 'InvalidCheckoutIdError'
    };
    // eslint-disable-next-line new-cap
    var deferred = $.Deferred();
    var status = true;
    $.ajax({
        type: 'GET',
        dataType: 'json',
        contentType: 'application/json',
        url: config.CheckSFCCSessionUrl,
        success: function (data) {
            // success
            if (!data.success) {
                onError(error);
                status = false;
            }
        },
        error: function () {
            onError(error);
            deferred.resolve(status);
        },
        complete: function () {
            deferred.resolve(status);
        }
    });

    return deferred.promise();
}

/**
 * This will trigger before submit the card from the widget.
 */
function onBeforeSubmitCard() {
    var promise = validateSession();
    promise.done(function (result) {
        if (result) {
            window.wpwlOptions.onBeforeSubmitCard = function () {
                return true;
            };
            $('.wpwl-button-pay', '.wpwl-form-card').prop('disabled', false).trigger('click');
        }
    });
}


var basewpwlOptions = {
    onReady: onReady,
    onError: onError,
    onBeforeSubmitCard: onBeforeSubmitCard,
    googlePay: {
        gatewayMerchantId: config.gatewayMerchantId
    },
    applePay: {
        displayName: config.appleDisplayName,
        total: { label: config.appleBusinessName }
    }
};


if (config.page === 'checkout') {
    basewpwlOptions.registrations = {
        requireCvv: false,
        hideInitialPaymentForms: false
    };
}

module.exports = basewpwlOptions;
