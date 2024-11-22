'use strict';

var ACIHelper = require('*/cartridge/scripts/aci/aciHelper');
var Transaction = require('dw/system/Transaction');

/**
 * This function checks the payment transaction status after customer is returned to the shopper return url
 *
 * @returns {___anonymous_response}
 */
function postPaymentProcess() {
	var resourcePath = request.httpParameterMap.resourcePath;
	var response = {
		'ok': true
	};
	var order, paymentInstrument, paymentTransaction, paymentStatus;
	var paymentResponse;
	var paymentProcessFailed = false;

	try {
		var ACIServiceWrapper = require("*/cartridge/scripts/aci/aciServiceWrapper");
		Transaction.wrap(function () {
			paymentStatus = ACIServiceWrapper.getPaymentStatus(resourcePath);
			paymentResponse = paymentStatus.object;

			order = _getOrder();

			if (order) {

				paymentInstrument = ACIHelper.getPayment(order);
				paymentTransaction = paymentInstrument.paymentTransaction;

				//Save response details to order
				if (paymentResponse) {

					_saveTransactionDetails();

					_checkAndSaveCardDetailsOnOrder();

					ACIHelper.savePaymentResponse(order, paymentResponse);
				}

				var transactionStatus = _checkTransactionStatus();
				if (!transactionStatus.ok) {
					// Handle error scenario when either - SFCC session timed out OR Transaction was either rejected OR Service call failed
					ACIHelper.getLogger().error('[PostPaymentPocess] Payment status is not ok or Transactions status is error for the Order: ' + order.orderNo + ' . Error details : ' + transactionStatus.errorCode);

					_failOrder(transactionStatus.errorCode);

					// Reverse the transaction if ACI processed payment successfully
					_checkAndReverseTransaction();

					response.ok = false;
					response.isTransactionCancelledByCustomer = transactionStatus.errorCode === 'CANCELLED_BY_CUSTOMER';

				} else {

					_checkAndSaveCardToWallet();

					if (ACIHelper.isTransactionPending(paymentResponse)) {
						// Mark order as pending if transaction status is pending or manual review AND SFCC session is alive
						order.custom.ACI_isPendingOrder = true;
					}
				}
			} else {
				// Unable to retrieve order
				ACIHelper.getLogger().error("[PostPaymentPocess] Unable to retrieve order");
				response.ok = false;
			}
		});

	} catch (e) {
		ACIHelper.getLogger().error("[PostPaymentPocess] An error occurred during Payment status API in Authorization.\n Error details :" + e.message);
		response.ok = false;
	}

	//Set order object
	response.order = order;

	return response;

	/**
	 * Function retrieves the orderNo from session or from payment response
	 */
	function _getOrder() {

		var orderNo = paymentResponse && paymentResponse.merchantTransactionId ? paymentResponse.merchantTransactionId : session.privacy.orderNo;
		return orderNo ? dw.order.OrderMgr.getOrder(orderNo) : null;
	}

	/**
	 * Function saves the basic transaction details
	 */
	function _saveTransactionDetails() {
		var PaymentMgr = require('dw/order/PaymentMgr');
		var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();

		paymentTransaction.paymentProcessor = paymentProcessor;
		paymentTransaction.transactionID = paymentResponse.id || '';
	}

	/**
	 * Function checks and saves card details to payment instrument
	 */
	function _checkAndSaveCardDetailsOnOrder() {

		if ('card' in paymentResponse && !empty(paymentResponse['card'])) {
			paymentInstrument.creditCardNumber = '************' + paymentResponse.card.last4Digits;
			paymentInstrument.creditCardExpirationMonth = paymentResponse.card.expiryMonth;
			paymentInstrument.creditCardExpirationYear = paymentResponse.card.expiryYear;
			paymentInstrument.creditCardHolder = paymentResponse.card.holder;
			paymentInstrument.creditCardType = paymentResponse.paymentBrand;
		}
	}

	/**
	 * Function checks and save card details to the wallet if the customer chose to save the card during the checkout journey
	 *
	 * @param paymentResponse
	 */
	function _checkAndSaveCardToWallet() {

		if (customer.registered && paymentResponse.customParameters && 'SHOPPER_savedCard' in paymentResponse.customParameters && paymentResponse.customParameters.SHOPPER_savedCard && 'registrationId' in paymentResponse) {
			ACIHelper.saveCustomerCreditCard(paymentResponse);
		}
	}

	function _checkTransactionStatus() {
		var returnObj = {
			'ok': true
		};

		// Check if session is valid
		if (!('orderNo' in session.privacy)) {
			returnObj.ok = false;
			returnObj.errorCode = "SESSION_INVALID";
			return returnObj;
		}

		// Check if there was an error with ACI service
		if (!paymentStatus.ok) {
			returnObj.ok = false;
			returnObj.errorCode = "ACI_SERVICE_ERROR";
			return returnObj;
		}

		// Check if ACI returned rejected transaction code
		if (ACIHelper.isTransactionRejected(paymentResponse)) {
			returnObj.ok = false;
			returnObj.errorCode = "TRANSACTION_REJECTED";
			if (paymentResponse.result.code == '100.396.101') {
				returnObj.errorCode = "CANCELLED_BY_CUSTOMER";
			}
			return returnObj;
		}


		// Check if ACI returned rejected transaction code
		if (!paymentResponse.id) {
			returnObj.ok = false;
			returnObj.errorCode = "TRANSACTIONID_MISSING";
			return returnObj;
		}

		// Check if order number in session and order number in payment response match
		var paymentResponseOrderNo = paymentResponse && paymentResponse.merchantTransactionId ? paymentResponse.merchantTransactionId : '';
		if (session.privacy.orderNo !== paymentResponseOrderNo) {
			returnObj.ok = false;
			returnObj.errorCode = "SESSION_ORDER_MISMATCH";
			return returnObj;
		}

		// Transaction processed successfully
		return returnObj;
	}


	/**
	 * Function fails the order and adds a note
	 */
	function _failOrder(errorCode) {
		if (order && order.getStatus().value === dw.order.Order.ORDER_STATUS_CREATED) {
			Transaction.wrap(function () {
				dw.order.OrderMgr.failOrder(order,true);

				var failReason = '';
				switch (errorCode) {
					case 'SESSION_INVALID':
						failReason = 'SFCC session expired';
						break;
					case 'ACI_SERVICE_ERROR':
						failReason = 'ACI service error';
						break;
					case 'TRANSACTION_REJECTED':
						failReason = 'Payment was rejected by ACI ';
						break;
					case 'CANCELLED_BY_CUSTOMER':
						failReason = 'Payment was cancelled by customer ';
						break;
					case 'SESSION_ORDER_MISMATCH':
						failReason = 'Session order mismatch. Probably due to multiple orders being placed parallely';
						break
					case 'TRANSACTIONID_MISSING':
						failReason = 'Transaction ID missing';
						break

				}
				order.addNote('Order fail reason', failReason);
			});
		}
	}

	/**
	 * Function checks if a reversal operation needs to be performed here
	 */
	function _checkAndReverseTransaction() {

		if (paymentResponse && paymentResponse.id && ACIHelper.isTransactionSuccess(paymentResponse)) {

			var TransactionHelper = require("~/cartridge/scripts/aci/transactionHelper");
			var EmailHelper = require("*/cartridge/scripts/util/emailUtil")

			var aciCaptureImmediate = ACIHelper.preferences.delayedCapture;
			var reverseResponse = {};

			//Perform refund or reversal operation based on the value of capture flag
			if (!empty(aciCaptureImmediate) && aciCaptureImmediate) {
				var paymentInstrument = ACIHelper.getPayment(order);
				var paymentAmount = paymentInstrument.paymentTransaction.amount.decimalValue.toString();
				var reverseResponse = TransactionHelper.initiateRefundRequest(order.orderNo, paymentAmount);
			} else {
				var reverseResponse = TransactionHelper.reversePayment(order.orderNo);
			}

			if (!reverseResponse.ok) {
				EmailHelper.SendReversalFailedEmail(order);
				ACIHelper.getLogger().error("[PostPaymentPocess] Unable to reverse payment for order : " + order.orderNo);
			}
		}
	}
}

/*
 * Module exports
 */
exports.postPaymentProcess = postPaymentProcess;