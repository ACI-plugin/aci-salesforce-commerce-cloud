'use strict';

var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');
var URLUtils = require('dw/web/URLUtils');
var TransactionHelper = require("*/cartridge/scripts/aci/transactionHelper");
var system = require('dw/system/System');

var test = function () {
	var env = system.getInstanceType();
	if (env === system.PRODUCTION_SYSTEM) {
		response.redirect(URLUtils.url('Home-ErrorNotFound'));
	} else {
		var actionUrl = URLUtils.https('ACITransactionSimulator-Initiate');
		app.getView({
			actionUrl: actionUrl
		}).render('aci/simulator/transactionsimulatorform');
	}

};

var initiate = function () {

	var orderNumber = request.httpParameterMap.ordernumber.value;
	var amount = request.httpParameterMap.amount.value;
	var transactionType = request.httpParameterMap.transactionType.value;
	var response = {};

	switch (transactionType) {
		case 'Capture':
			response = TransactionHelper.initiateCaptureRequest(orderNumber, amount);
			break;
		case 'Refund':
			response = TransactionHelper.initiateRefundRequest(orderNumber, amount);
			break;
		case 'Reversal':
			response = TransactionHelper.reversePayment(orderNumber);
			break;
	}
	app.getView({
		orderNumber: orderNumber,
		amount: amount,
		transactionType: transactionType,
		response: response
	}).render('aci/simulator/transactionsimulatorresult');
};


exports.Test = guard.ensure(['get'], test);
exports.Initiate = guard.ensure(['post'], initiate);