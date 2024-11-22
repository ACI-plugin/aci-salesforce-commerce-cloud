'use strict';


/**
 * Description of the function
 *
 * @return {String} The string 'myFunction'
 */
function sendReversalFailedEmail(order) {

	var Email = require('*/cartridge/scripts/models/EmailModel');
	var ACIHelper = require('*/cartridge/scripts/aci/aciHelper');
	var Resource = require('dw/web/Resource');

	var orderNo = order.orderNo;
	var mailSubject = Resource.msgf("aci.order.reversal.error.subject", "aci", null);
	return Email.get('mail/reversalfailedemail', ACIHelper.preferences.NotificationEmails)
		.setSubject(mailSubject)
		.send({
			orderNo: orderNo
		});
};

/* Exports of the modules */
///**
//* @see {@link module:cartridge/scripts/util/errorUtil~sendReversalFailedEmail} */
exports.SendReversalFailedEmail = sendReversalFailedEmail;
