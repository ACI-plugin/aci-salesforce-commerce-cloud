'use strict';

var Transaction = require('dw/system/Transaction');
var PaymentMgr = require('dw/order/PaymentMgr');
var Logger = require('dw/system/Logger');

var ACIHelper = {};

var ACILogger;


/**
 * Save credit card
 * @param {Object} tokenizationResponse Responce data from registration API call
 * @return {Object} Object with card data
 */
ACIHelper.saveCustomerCreditCard = function (tokenizationResponse) {
	var card = null;
	try {
		Transaction.begin();

		var customerPaymentInstrument = customer.getProfile().getWallet().createPaymentInstrument(dw.order.PaymentInstrument.METHOD_CREDIT_CARD);

		card = {
			expirationMonth: tokenizationResponse.card.expiryMonth,
			expirationYear: tokenizationResponse.card.expiryYear,
			number: tokenizationResponse.card.last4Digits,
			type: tokenizationResponse.paymentBrand,
			owner: tokenizationResponse.card.holder,
			paymentMethodToken: 'registrationId' in tokenizationResponse ? tokenizationResponse.registrationId : tokenizationResponse.id
		};

		customerPaymentInstrument.setCreditCardHolder(card.owner);
		customerPaymentInstrument.setCreditCardNumber('************' + card.number);
		customerPaymentInstrument.setCreditCardExpirationMonth(parseInt(card.expirationMonth, 10));
		customerPaymentInstrument.setCreditCardExpirationYear(parseInt(card.expirationYear, 10));
		customerPaymentInstrument.setCreditCardType(card.type);
		customerPaymentInstrument.custom.ACI_registrationID = card.paymentMethodToken;

		Transaction.commit();
	} catch (e) {
		card = {
			error: e.message
		};
		ACIHelper.getLogger().error('[saveCustomerCreditCard] An error occurred during Credit Card save. Error details :' + card);
	}
	return card;
};

/**
 * Get customer saved cards
 * @return {Array} paymentMethodToken
 */

ACIHelper.customerSavedCards = function (method) {
	var paymentMethodToken = [];
	var activeCardTypes = getActiveCardTypes();
	var customerPaymentInstruments = customer.getProfile().getWallet().getPaymentInstruments(dw.order.PaymentInstrument.METHOD_CREDIT_CARD);
	for (var i = 0; i < customerPaymentInstruments.length; i++) {
		var creditCardType = customerPaymentInstruments[i].creditCardType;	
		if(activeCardTypes.indexOf(creditCardType) > -1) {
			paymentMethodToken.push(customerPaymentInstruments[i].custom.ACI_registrationID);
		}
		
	}
	return paymentMethodToken;
}

function getActiveCardTypes() {
	var PaymentInstrument = require('dw/order/PaymentInstrument');
	var creditCardMethod = dw.order.PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD);

	var cardIterator: Iterator = creditCardMethod.activePaymentCards.iterator();

	var cardTypes = [];

	while (cardIterator.hasNext()) {
		var paymentCard = cardIterator.next();		
		cardTypes.push(paymentCard.cardType);		
	}
	return cardTypes;
}

/**
 * Gets the list of active payment cards configured in SFCC 
 * The cards will be passed in the data-brands field while invoking ACI payment widget
 * 
 * @return {Array} Array of card types
 */
ACIHelper.getCardBrands = function () {

	return getActiveCardTypes().join(' ');
}

/**
 * Saves the response of Payment Status API call to order
 * Update the following
 *  - Summarised payment transaction details
 *  - Transaction status flow  
 * 
 * 
 */
ACIHelper.savePaymentResponse = function (order, paymentResponse) {

	var saveResponse = {};
	var transactionTypeStatus;
	var summarisedTransactionData;
	var response = paymentResponse;

	var paymentInstrument = _getPaymentInstrument(order);
	var paymentTransaction = paymentInstrument.paymentTransaction;

	try {
		// Capture/Refund returns a json object as error message if the transaction fails. In case of service timeout, the response is a simple string.
		// JSON.parse would help identify the structure and save the response on the order accordingly
		if (typeof paymentResponse === 'string') {
			response = JSON.parse(paymentResponse);
		} else {
			response = paymentResponse;
		}


		summarisedTransactionData = _getTransactionDataSummary(response);

		transactionTypeStatus = ACIHelper.CONST.TRANSACTION_TYPE_MAPPINGS[summarisedTransactionData.transactionType] + '_' + summarisedTransactionData.transactionStatus;

	} catch (e) {
		transactionTypeStatus = "GENERAL_ERROR";
		summarisedTransactionData = response;
	}

	// Save transaction summary to order
	saveResponse[transactionTypeStatus] = summarisedTransactionData;
	_saveTransactionSummary(order, saveResponse);

	//Update transaction flow on the payment transaction
	_updateTransactionFlow(paymentTransaction, transactionTypeStatus);

}



/**
 * Function returns a summary of transaction data which is stored on the order for future references
 * 
 * @param paymentResponse
 * @returns
 */
function _getTransactionDataSummary(paymentResponse) {
	var transactionStatus = _getTransactionStatus(paymentResponse.result.code);

	var transactionType = paymentResponse.paymentType ? paymentResponse.paymentType : 'SERVICE';
	var transactionData = {};

	transactionData.transactionID = paymentResponse.id;
	transactionData.transactionType = transactionType;
	transactionData.result = paymentResponse.result;
	transactionData.amount = paymentResponse.amount;
	transactionData.transactionTimeStamp = paymentResponse.timestamp;
	transactionData.transactionStatus = transactionStatus;

	if (['PA', 'DB'].indexOf(transactionType) !== -1) {
		transactionData.resultDetails = paymentResponse.resultDetails;
		transactionData.risk = paymentResponse.risk;
	} else {
		transactionData.referencedId = paymentResponse.referencedId;
	}

	return transactionData;
}


/**
 * Function saves the current transaction summary to transaction history attribute on the order
 * 
 * @param order
 * @param transactionSummary
 */
function _saveTransactionSummary(order, transactionSummary) {
	var tempTransactionArray = order.custom['ACI_PaymentResponse'];
	var paymentTransactionResponses = [JSON.stringify(transactionSummary)];
	for each(var txnResponse in tempTransactionArray) {
		paymentTransactionResponses.splice(0, 0, txnResponse);
	}
	order.custom['ACI_PaymentResponse'] = paymentTransactionResponses;
}


/**
 * Function updates the transaction flow stored on the order
 * 
 * @param paymentTransaction
 * @param transactionTypeStatus
 */
function _updateTransactionFlow(paymentTransaction, transactionTypeStatus) {
	var transactionFlow = [transactionTypeStatus];
	if (!empty(paymentTransaction.custom.ACI_TransactionStatusFlow)) {
		transactionFlow.splice(0, 0, paymentTransaction.custom.ACI_TransactionStatusFlow);
	}
	paymentTransaction.custom.ACI_TransactionStatusFlow = transactionFlow.join(' > ');
}



/**
 * Function returns a transaction status that maps to the result code returned within ACI response
 * 
 * @param paymentResultCode
 * @returns
 */
function _getTransactionStatus(paymentResultCode) {
	var transactionStatus = ACIHelper.CONST.PAYMENT_REJECTED;
	if ((/^(000\.000\.|000\.100\.1|000\.[36])/).test(paymentResultCode)) {
		transactionStatus = ACIHelper.CONST.PAYMENT_SUCCESS;
	} else if ((/^(000\.400\.0[^3]|000\.400\.100)/).test(paymentResultCode)) {
		//Result codes for successfully processed transactions that should be manually reviewed
		transactionStatus = ACIHelper.CONST.PAYMENT_REVIEW;
	} else if ((/^(000\.200)/).test(paymentResultCode) || (/^(800\.400\.5|100\.400\.500)/).test(paymentResultCode)) {
		//Result codes for pending transactions
		transactionStatus = ACIHelper.CONST.PAYMENT_PENDING;
	}
	return transactionStatus;
}

/**
 * Function checks if transaction is rejected using the result code in the payment response
 */
ACIHelper.isTransactionRejected = function (paymentResponse) {
	var transactionStatus = _getTransactionStatus(paymentResponse.result.code);
	if (this.CONST.PAYMENT_REJECTED.equals(transactionStatus)) {
		return true;
	}
	return false;
};

/**
 * Function checks if transaction is pending using the result code in the payment response
 */
ACIHelper.isTransactionPending = function (paymentResponse) {
	var transactionStatus = _getTransactionStatus(paymentResponse.result.code);
	if (this.CONST.PAYMENT_REVIEW.equals(transactionStatus) || this.CONST.PAYMENT_PENDING.equals(transactionStatus)) {
		return true;
	}
	return false;
};


ACIHelper.prepareCheckout = function (paymentTransaction, status) {

	_updateTransactionFlow(paymentTransaction, status);
};


/**
 * This function returns the payment instrument for ACI payment brands
 * 
 * @param order
 * @returns {Object} PaymentInstrument
 */
function _getPaymentInstrument(order) {

	for each(var pi in order.paymentInstruments) {

		if ((PaymentMgr.getPaymentMethod(pi.paymentMethod).paymentProcessor).ID == ACIHelper.CONST.ACI_PAYMENT_PROCESSOR_ID) {
			return pi;
		}
	}
}

/**
 * This function returns the payment instrument for ACI payment brands
 * 
 * @param order
 * @returns {Object} PaymentInstrument
 */
ACIHelper.getPayment = function (order) {
	return _getPaymentInstrument(order);
}



/**
 * Checks if ACI payment method
 *
 * @param paymentMethodID
 * @returns {boolean} true/false
 */
ACIHelper.isACIPaymentMethod = function (paymentMethodID) {
	var PaymentMgr = require('dw/order/PaymentMgr');
	var paymentProcessorID = (PaymentMgr.getPaymentMethod(paymentMethodID)).paymentProcessor.ID
	return (ACIHelper.CONST.ACI_PAYMENT_PROCESSOR_ID === paymentProcessorID) ? true : false;
}


/**
 * Check is ACI payemnt method
 *
 * @param paymentMethodID
 * @returns {boolean} true/false
 */
ACIHelper.isSyncPaymentMethod = function (paymentMethodID) {
	var PaymentMgr = require('dw/order/PaymentMgr');
	var isSync = true;
	if (paymentMethodID != 'CREDIT_CARD') {
		isSync = PaymentMgr.getPaymentMethod(paymentMethodID).custom.ACI_Synchronous;
	}
	return isSync;
}

/**
 * Check is ACI payemnt method
 *
 * @param paymentMethodID
 * @returns {boolean} true/false
 */
ACIHelper.setACIErrorCode = function (errorCode) {

	session.privacy.ACIErrorCode = errorCode;
}

/**
 * Update order export status to not exported
 *
 * @param {Object} dw.order.Order
 * @returns {} 
 */
ACIHelper.updateOrderExportStatus = function (order) {

	try {
		if (order.custom.ACI_isPendingOrder) {
			Transaction.wrap(function () {
				order.exportStatus = dw.order.Order.EXPORT_STATUS_NOTEXPORTED;
			});
		}
	} catch (e) {
		ACIHelper.getLogger().error('[updateOrderExportStatus] An error occurred while updating export status of order : ' + order.orderNo + '\n Error details : ' + e.errorMessage);
	}

};

ACIHelper.updateOrdercapturedAmount = function (Order, captureAmount) {

	var tempCapturedAmountArray = Order.custom.ACI_CapturedAmount;
	var capturedAmountArray = new Array();
	for each(var existingCapturedAmount in tempCapturedAmountArray) {
		capturedAmountArray.push(existingCapturedAmount);
	}
	capturedAmountArray.push(captureAmount.value);

	Transaction.wrap(function () {
		Order.custom.ACI_CapturedAmount = capturedAmountArray;
	});

};

/**
 * Function checks if transaction is success using the result code in the payment response
 */
ACIHelper.isTransactionSuccess = function (paymentResponse) {
	var transactionStatus = _getTransactionStatus(paymentResponse.result.code);
	if (this.CONST.PAYMENT_SUCCESS.equals(transactionStatus)) {
		return true;
	}
	return false;
};



/**
 * returns the ACI Logger
 *
 * @param order
 * @returns {Object} ACILogger
 */
ACIHelper.getLogger = function () {
	if(!ACILogger) {
		ACILogger = Logger.getLogger('ACI-Log', 'ACI');
	}
	return ACILogger;
}



//ACI Site preference
var customPrefs = dw.system.Site.current.preferences.custom;

ACIHelper.preferences = {
	bearerToken: customPrefs['ACI_BearerToken'],	
	entityID: customPrefs['ACI_EntityID'],
	merchantName: customPrefs['ACI_MerchantName'],
	merchantCity: customPrefs['ACI_MerchantCity'],
	merchantStreet: customPrefs['ACI_MerchantStreet'],
	merchantPostCode: customPrefs['ACI_MerchantPostCode'],
	merchantState: customPrefs['ACI_MerchantState'],
	merchantCountry: customPrefs['ACI_MerchantCountry'],
	merchantPhone: customPrefs['ACI_MerchantPhone'],
	merchantMCC: customPrefs['ACI_MerchantMCC'],
	version: customPrefs['ACI_APIVersion'],
	delayedCapture: customPrefs['ACI_DelayedCapture'],
	useSummary: customPrefs['ACI_UseSummary'],
	allowRegistration: customPrefs['ACI_CardRegistration'],
	transactionMode: customPrefs['ACI_TransactionMode'],
	forceResultCode: customPrefs['ACI_ForceResultCode'],
	aciWidgetURL: customPrefs['ACI_WidgetURL'],
	NotificationEmails: customPrefs['ACI_NotificationEmails'],
	threedsTransactionId: customPrefs['ACI_3dsDsTransactionId'],
	threedsVersion: customPrefs['ACI_3dsVersion'],
	threedsChallengeIndicator: customPrefs['ACI_3dsChallengeIndicator'],
	threedsChallengeMandatedIndicator: customPrefs['ACI_3dsChallengeMandatedIndicator'],
	threedsAuthenticationType: customPrefs['ACI_3dsAuthenticationType'],
	threedsExemptionFlag: customPrefs['ACI_3dsExemptionFlag'],
	threedsTransactionStatusReason: customPrefs['ACI_3dsTransactionStatusReason'],
	threedsAcsTransactionId: customPrefs['ACI_3dsAcsTransactionId'],
	appleDisplayName: customPrefs['ACI_appleStore'],
	appleBusinessName: customPrefs['ACI_appletotal']
};

ACIHelper.CONST = {
	ACI_PAYMENT_PROCESSOR_ID: 'ACI',
	PAYMENT_SUCCESS: 'SUCCESS',
	PAYMENT_REVIEW: 'MANUAL_REVIEW',
	PAYMENT_PENDING: 'PENDING',
	PAYMENT_REJECTED: 'REJECTED',	
	TRANSACTION_TYPE_MAPPINGS: {
		'PA': 'AUTHORISATION',
		'CP': 'CAPTURE',
		'DB': 'IMMEDIATE_CAPTURE',
		'RF': 'REFUND',
		'RV': 'REVERSAL',
		'SERVICE' : 'SERVICE'
	}
};


module.exports = ACIHelper;