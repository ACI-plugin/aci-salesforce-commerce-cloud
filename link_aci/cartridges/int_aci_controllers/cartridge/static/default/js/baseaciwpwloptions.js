'use strict';

var config = $('#aci-widget-options').data('widget-options') || {};

function onError(error) {
    $(".overlay-text p").hide();

    if (error.name == 'InvalidCheckoutIdError') {
        $(".overlay-text p.session").show();
    } else {
        $(".overlay-text p.general").show();
    }
    $("#aci-overlay").show();
}

function onReady() {

    if (config.page == 'checkout') {
        if (config.allowRegistration == true) {
            var createRegistrationHtml = '<div class="customLabel">Store payment details?</div><div class="customInput"><input type="hidden" name="customParameters[SHOPPER_savedCard]" value="false"/><input id="create-registration" type="checkbox" name="createRegistration" value="true" /></div>';
            $('form.wpwl-form-card').find('.wpwl-button').before(createRegistrationHtml);
            $('#create-registration').click(function () {
                $("input[name='customParameters[SHOPPER_savedCard]']").val($("#create-registration").prop('checked'));
            });
        }

        if (config.async == true) {
            $('.wpwl-brand').trigger('click');
        }
    }
}

function onSaveTransactionData(data) {

    var error = {
        name: 'InvalidCheckoutIdError'
    }
    $.ajax({
            type: 'GET',
            dataType: 'json',
            contentType: 'application/json',
            url: config.CheckSFCCSessionUrl,
        })
        .done(function (response) {
            // success
            if (response.success) {
                window.location.href = config.actionURL;
            } else {
                onError(error);
            }
        })
        .fail(function (xhr, textStatus) {
            onError(error);
        });
}

function validateSession() {
    var error = {
        name: 'InvalidCheckoutIdError'
    }
    var deferred = $.Deferred();
    var status = true;
    $.ajax({
            type: 'GET',
            dataType: 'json',
            contentType: 'application/json',
            url: config.CheckSFCCSessionUrl,
        })
        .done(function (response) {
            // success
            if (!response.success) {
                onError(error);
                status = false;
            }
        })
        .fail(function (xhr, textStatus) {
            onError(error);
            status = false;
        })
        .always(function (xhr, textStatus) {
            deferred.resolve(status);
        });

    return deferred.promise();
}

function onBeforeSubmitCard($this) {
	console.log($this)
    var promise = validateSession();
    promise.done(function (result) {
        if (result) {
            wpwlOptions.onBeforeSubmitCard = function () {
                return true
            };
            $('.wpwl-button-pay','.wpwl-form-card').prop('disabled', false).trigger('click');
        }
    });

}


var basewpwlOptions = {
    onReady: onReady,
    onError: onError,
    onBeforeSubmitCard: onBeforeSubmitCard,
    onSaveTransactionData: onSaveTransactionData
};

if (config.page === 'checkout') {
    basewpwlOptions.useSummaryPage = true;
    basewpwlOptions.registrations = {
        requireCvv: false,
        hideInitialPaymentForms: false
    };
}

if (config.page == 'account') {
    basewpwlOptions.onBeforeSubmitCard = onBeforeSubmitCard;
}

window.wpwlOptions = basewpwlOptions;