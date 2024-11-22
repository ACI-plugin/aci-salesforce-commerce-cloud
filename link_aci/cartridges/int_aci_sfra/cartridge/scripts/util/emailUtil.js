'use strict';

/**
 * Widget timeout/communication error callback
 * @param {Object} order order object
 */
function sendReversalFailedEmail(order) {
    var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');
    var ACIHelper = require('*/cartridge/scripts/aci/aciHelper');
    var Resource = require('dw/web/Resource');
    var orderNo = order.orderNo;
    var emailObj = {
        to: ACIHelper.preferences.NotificationEmails,
        subject: Resource.msgf('aci.order.reversal.error.subject', 'aci', null),
        from: 'no-reply@salesforce.com'
    };
    emailHelpers.sendEmail(emailObj, 'mail/reversalfailedemail', {
        orderNo: orderNo
    });
}

/* Exports of the modules */
exports.SendReversalFailedEmail = sendReversalFailedEmail;
