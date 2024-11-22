'use strict';

/**
 * Defines a module to wrap all API calls to ACI
 */

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');
var ACIHelper = require('~/cartridge/scripts/aci/aciHelper');

const SERVICE_ID = "http.aciworldwide.checkout";

function ACIServiceWrapper() {}


/**
 * Local Services Framework service definition
 * @type dw.svc.Service
 */
var ACIService = LocalServiceRegistry.createService(SERVICE_ID, {

	/**
	 * Callback to configure HTTP request parameters before
	 * a call is made to ACI service
	 *
	 */
	createRequest: function (svc: HTTPService, requestParams) {
		svc.addHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");

		svc.addHeader("Authorization", "Bearer " + ACIHelper.preferences.bearerToken);

		return requestParams;
	},
	parseResponse: function (svc: HTTPService, client: HTTPClient) {
		return client;
	},
	filterLogMessage: function (msg: String) {
		return msg;
	},
	getResponseLogMessage: function (response: Object) {
		var responseMsg = 'Status Code: ' + response.statusCode +
			'\n Status Message  : ' + response.statusMessage +
			'\n Response : ' + response.text +
			'\n Error : ' + response.errorText +
			'\n Response Headers : ' + response.responseHeaders +
			'\n Timeout : ' + response.timeout
		return responseMsg;
	}
});


/**
 * Forms the authentication  part of the URL query string for prepare checkout API call
 *
 * @returns {String} URL query string
 */
function makeServiceCall(svc, payload) {

	var response = {};

	try {
		var result = svc.call(payload);
		if (result == null || result.status === dw.svc.Result.SERVICE_UNAVAILABLE || (!result.ok && !result.object)) {
			//Service is unavailable
			response.ok = false;
			response.errorCode = "SERVICE_UNAVAILABLE";
			response.errorMessage = result && 'errorMessage' in result ? result.errorMessage : "SERVICE_UNAVAILABLE";
		} else {
			response.ok = true;
			response.object = JSON.parse(result.object.text);
		}
	} catch (e) {
		response.ok = false;
		response.errorMessage = e.message;
	}

	return response;
}

/**
 * Gets the email address
 *
 * @param {Basket}  Basket object
 * @returns {String} Email
 */
function getEmail(order){
	var isOrder = (typeof order !== 'undefined') ? true : false;
	var email = isOrder ? order.customerEmail : customer.profile.email;
	return email;
}
/**
 * Prepares the URL query string for prepare checkout API call
 * and calls prepare checkout API call
 *
 * @param {Basket}  Basket object
 * @returns {Object} Result
 */
ACIServiceWrapper.prepareCheckout = function (cart) {
	
	var apiRequestPayload = getAuthentication() +
		getBasicPayment(cart) +
		getCustomerDetails(cart) +
		getBillingAddress(cart.billingAddress) +
		getShippingAddress(cart.getDefaultShipment().shippingAddress, cart.getDefaultShipment().shippingMethod, getEmail(cart)) +
		getCartItems(cart) +
		getMerchantDetails() +
		getSFCCVersion() +
		getTestSettings() +
		getCustomParameters() +
		getCustomRiskParameters();

	ACIService.setRequestMethod("POST");

	var url = ACIHelper.preferences.version + "/checkouts";
	ACIService.setURL(ACIService.getConfiguration().getCredential().getURL() + url);

	return makeServiceCall(ACIService, apiRequestPayload);

};

/**
 * Updates the checkout details in ACI at the time of placing order
 *
 * @param {Order}  Order object
 * @returns {String} URL query string
 */
ACIServiceWrapper.updateCheckout = function (order) {
	
	var apiRequestPayload = getAuthentication() +
		getBasicPayment(order) +		
		getCustomerDetails(order) +
		getBillingAddress(order.billingAddress) +
		getShippingAddress(order.getDefaultShipment().shippingAddress, order.getDefaultShipment().shippingMethod, getEmail(order)) +
		getCartItems(order) +
		getMerchantDetails() +
		getSFCCVersion() +
		getTestSettings() +
		getCustomParameters() +
		getCustomRiskParameters();

	ACIService.setRequestMethod("POST");

	var url = ACIHelper.preferences.version + "/checkouts/" + order.custom.ACI_CheckoutID;
	ACIService.setURL(ACIService.getConfiguration().getCredential().getURL() + url);

	return makeServiceCall(ACIService, apiRequestPayload);

};

/**
 * Forms the authentication  part of the URL query string for prepare checkout API call
 *
 * @returns {String} URL query string
 */
function getAuthentication() {

	var authPayload = 'entityId=' + ACIHelper.preferences.entityID;

	return authPayload;
}

/**
 * Forms the basic payment part of the URL query string for prepare checkout API call
 *
 * @param {Order}  Basket or Order object
 * @returns {String} URL query string
 */
function getBasicPayment(order) {
	var aciCaptureImmediate = ACIHelper.preferences.delayedCapture;
	var paymentType = 'PA';
	if (!empty(aciCaptureImmediate) && aciCaptureImmediate) {
		paymentType = 'DB';
	}

	var basicPaymentPayload = '&amount=' + (order.getTotalGrossPrice().decimalValue).toString() +
		'&currency=' + order.getCurrencyCode() +
		'&paymentType=' + paymentType;
	
	if ('currentOrderNo' in order && !empty(order.currentOrderNo)){
		basicPaymentPayload += '&merchantTransactionId=' + order.currentOrderNo;
	}

	if (customer.isAuthenticated() && isApplicabileMethod(order)) {
		var customerSavedCards = ACIHelper.customerSavedCards();
		for (var i = 0; i < customerSavedCards.length; i++) {
			basicPaymentPayload += '&registrations[' + i + '].id=' + customerSavedCards[i];
		}

	}

	return basicPaymentPayload;
}

/**
 * Check whether customer selected payment as CC
 * @param {Order}  Billing Address object
 * @returns {Boolean} URL query string
 */
function isApplicabileMethod(order) {
	var PaymentMgr = require('dw/order/PaymentMgr');
	var isAplicable = false;
	
	for each(var pi in order.paymentInstruments) {

		if (pi.paymentMethod == dw.order.PaymentInstrument.METHOD_CREDIT_CARD){
			isAplicable = true;
			return isAplicable;
		}
	}
	return isAplicable;
}

/**
 * Forms the basic payment part of the URL query string for prepare checkout API call
 * @param {Order}  Billing Address object
 * @returns {String} URL query string
 */
function getCustomerDetails(order) {

	var isOrder = (typeof order !== 'undefined') ? true : false;
	var address;
	var status = 'EXISTING';
	if (isOrder && !order.getCustomer().registered) {
		status = 'NEW';
	}
	if (isOrder) {
		address = order.billingAddress;
	}

	var cutomerInfo = {
		id: customer.registered ? customer.profile.customerNo : order.getCustomer().ID,
		firstName: isOrder ? address.firstName : customer.profile.firstName,
		lastName: isOrder ? address.lastName : customer.profile.lastName,
		phone: isOrder ? address.phone : customer.profile.phoneMobile,
		email: isOrder ? order.customerEmail : customer.profile.email,
		ip: request.httpRemoteAddress,
		status: status
	};

	var basicPaymentPayload = '&customer.merchantCustomerId=' + cutomerInfo.id +
		'&customer.givenName=' + cutomerInfo.firstName +
		'&customer.surname=' + cutomerInfo.lastName +
		'&customer.phone=' + cutomerInfo.phone +
		'&customer.email=' + cutomerInfo.email +
		'&customer.ip=' + cutomerInfo.ip +
		'&customer.status=' + cutomerInfo.status;

	return basicPaymentPayload;
}

/**
 * Forms the billing address part of the URL query string for prepare checkout API call
 *
 * @param {OrderAddress}  Billing Address object
 * @returns {String} URL query string
 */
function getBillingAddress(billingAddress) {

	var stateCode = !empty(billingAddress.stateCode) ? billingAddress.stateCode : ""

	var billingAddressPayload = '&billing.street1=' + billingAddress.address1 +
		'&billing.street2=' + billingAddress.address2 +
		'&billing.city=' + billingAddress.city +
		'&billing.state=' + stateCode +
		'&billing.postcode=' + billingAddress.postalCode +
		'&billing.country=' + String(billingAddress.countryCode.value).toUpperCase();
	return billingAddressPayload;
}

/**
 * Forms the shipping address part of the URL query string for prepare checkout API call
 *
 * @param {OrderAddress}  Shipping Address object
 * @returns {String} URL query string
 */
function getShippingAddress(shippingAddress, shipMethod, email) {

	var stateCode = !empty(shippingAddress.stateCode) ? shippingAddress.stateCode : ""

	var shippingAddressPayload = '&shipping.street1=' + shippingAddress.address1 +
		'&shipping.street2=' + shippingAddress.address2 +
		'&shipping.city=' + shippingAddress.city +
		'&shipping.state=' + stateCode +
		'&shipping.postcode=' + shippingAddress.postalCode +
		'&shipping.country=' + String(shippingAddress.countryCode.value).toUpperCase() +
		'&shipping.method=' + shipMethod.custom.ACI_ShippingMethod +
		'&shipping.customer.givenName=' + shippingAddress.firstName +
		'&shipping.customer.surname=' + shippingAddress.lastName +
		'&shipping.customer.email=' + email +
		'&shipping.customer.phone=' + shippingAddress.phone;
	return shippingAddressPayload;
}

/**
 * Populates the cart line details as part of the URL query string for prepare checkout API call
 *
 * @param {Order}  Shipping Address object
 * @returns {String} URL query string
 */
function getCartItems(order) {

	var plis = order.getProductLineItems();
	var currency = order.getCurrencyCode();
	var cartPayload = '';
	var sumTotalAmount = 0;
	var differenceTotalAmount = 0;

	for (var i = 0; i < plis.length; i++) {
		var pli = plis[i];
		var qty = pli.quantityValue;
		cartPayload = cartPayload + '&cart.items[' + i + '].name=' + pli.productName +
		'&cart.items[' + i + '].merchantItemId=' + pli.position +
		'&cart.items[' + i + '].quantity=' + pli.quantityValue +
		'&cart.items[' + i + '].sku=' + pli.productID +
		'&cart.items[' + i + '].price=' + roundUp((pli.adjustedGrossPrice*100/(qty*100)), 2).toFixed(2) +
		'&cart.items[' + i + '].currency=' + currency +
		'&cart.items[' + i + '].description=' + pli.getLineItemText() +
		'&cart.items[' + i + '].tax=0' + 
		'&cart.items[' + i + '].totalTaxAmount=0' +
		'&cart.items[' + i + '].totalAmount=' + (roundUp((pli.adjustedGrossPrice*100/(qty*100)), 2) * qty).toFixed(2) +
		'&cart.items[' + i + '].originalPrice=' + (pli.getAdjustedNetPrice()*100/(qty*100)).toFixed(2);

		sumTotalAmount += roundUp((pli.adjustedGrossPrice*100/(qty*100)), 2) * qty;
	}
	cartPayload = cartPayload + '&cart.items[' + i + '].name=shipping_fee' +
	'&cart.items[' + i + '].quantity=1' + 
	'&cart.items[' + i + '].price=' + order.getAdjustedShippingTotalGrossPrice().decimalValue.toString() +
	'&cart.items[' + i + '].currency=' + currency +
	'&cart.items[' + i + '].description=Shipping Cost' +
	'&cart.items[' + i + '].tax=0' +
	'&cart.items[' + i + '].totalTaxAmount=0' +
	'&cart.items[' + i + '].totalAmount=' + order.getAdjustedShippingTotalGrossPrice().decimalValue.toString();

	sumTotalAmount += order.getAdjustedShippingTotalGrossPrice().decimalValue;
	differenceTotalAmount = sumTotalAmount - order.getTotalGrossPrice().decimalValue;

	if (differenceTotalAmount > 0) {
		cartPayload = cartPayload + '&cart.payments[0].amount=' + differenceTotalAmount.toFixed(2).toString();
	}

	return cartPayload;
}

/**
 * Gets the rounded up version of the Number
 * @param {Number} num Number
 * @param {Number} precision Number
 * @returns {Number} rounded up Number
 */
function roundUp(num, precision) {
    precision = Math.pow(10, precision)
    return Math.ceil(num * precision) / precision
}

/**
 * Gets the SFCC version from properties file
 *
 * @returns {String} URL query string
 */
function getSFCCVersion() {

	var version = Resource.msg('sfcc.cartridges.int_aci.version', 'aci', '');
	var versionPayload = '&customParameters[SFCCCartridgeVersion]=' + version;
	return versionPayload;
}

/**
 * Gets the information of the merchant
 *
 * @returns {String} URL query string
 */
function getMerchantDetails() {

	var merchantPayload = '';
	if (!empty(ACIHelper.preferences.merchantName)) {
		merchantPayload += '&merchant.name=' + ACIHelper.preferences.merchantName;
	}
	if (!empty(ACIHelper.preferences.merchantCity)) {
		merchantPayload += '&merchant.city=' + ACIHelper.preferences.merchantCity;
	}
	if (!empty(ACIHelper.preferences.merchantStreet)) {
		merchantPayload += '&merchant.street=' + ACIHelper.preferences.merchantStreet;
	}
	if (!empty(ACIHelper.preferences.merchantPostCode)) {
		merchantPayload += '&merchant.postcode=' + ACIHelper.preferences.merchantPostCode;
	}
	if (!empty(ACIHelper.preferences.merchantState)) {
		merchantPayload += '&merchant.state=' + ACIHelper.preferences.merchantState;
	}
	if (!empty(ACIHelper.preferences.merchantCountry)) {
		merchantPayload += '&merchant.country=' + ACIHelper.preferences.merchantCountry;
	}
	if (!empty(ACIHelper.preferences.merchantPhone)) {
		merchantPayload += '&merchant.phone=' + ACIHelper.preferences.merchantPhone;
	}
	if (!empty(ACIHelper.preferences.merchantMCC)) {
		merchantPayload += '&merchant.mcc=' + ACIHelper.preferences.merchantMCC;
	}

	return merchantPayload;
}

/**
 * Gets the information of the merchant
 *
 * @returns {String} URL query string
 */
function getTestSettings() {

	var testSettings = '';
	
	if (!empty(ACIHelper.preferences.transactionMode)) {	
		testSettings = '&testMode=' + ACIHelper.preferences.transactionMode;
	}

	if (!empty(ACIHelper.preferences.forceResultCode)) {
		testSettings += '&customParameters[forceResultCode]=' + ACIHelper.preferences.forceResultCode;
	}

	return testSettings;
}

/**
 * Forms the custom parameters part of the URL query string for prepare checkout API call
 * Place holder to add any custom parameters
 *
 * @returns {String} URL query string
 */
function getCustomParameters() {
	var customParamsPayload = '';
	customParamsPayload += getThreeDSecureParams();
	return customParamsPayload;
}

/**
 * Forms the custom risk parameters part of the URL query string for update checkout API call
 * Place holder to add any custom risk parameters. 
 * For example, send risk parameters as '&risk.amount=50.00&risk.brand=PAYPAL'
 *
 * @returns {String} URL query string
 */
function getCustomRiskParameters() {
	var customParamsPayload = '';
	return customParamsPayload;
}

/**
 * Gets payment status from ACI by calling the payment status API
 *
 * @param {String}  Resource Path returned by ACI
 * @returns {String} URL query string
 */
ACIServiceWrapper.getPaymentStatus = function (resourcePath) {

	var url = ACIService.getConfiguration().getCredential().getURL() +
		resourcePath + '?' + getAuthentication();

	ACIService.setRequestMethod("GET");
	ACIService.setURL(url);

	return makeServiceCall(ACIService, '');

};

/**
 * Gets widget ID for card registration
 * @returns {String} registrationID checkout id from ACI
 */
ACIServiceWrapper.prepareRegistration = function () {
	var errorMsg = "[prepareRegistration] An error occurred during fetching registration ID service.\n Error details :";

	var apiRequestPayload = getAuthentication() + '&createRegistration=true' + getCustomerDetails() + getTestSettings();

	ACIService.setRequestMethod("POST");
	var url = ACIHelper.preferences.version + "/checkouts";
	ACIService.setURL(ACIService.getConfiguration().getCredential().getURL() + url);
	
	return makeServiceCall(ACIService, apiRequestPayload);

};

/**
 * Gets registration status from ACI
 * @param {String}  resourcePath Path returned by ACI
 * @returns {Object} response service response
 */
ACIServiceWrapper.getRegistrationStatus = function (resourcePath) {
	var errorMsg = "[getRegistrationStatus] An error occurred during registration's result service.\n Error details :";

	ACIService.setRequestMethod("GET");
	ACIService.setURL(ACIService.getConfiguration().getCredential().getURL() + resourcePath + '?' + getAuthentication());
	
	return makeServiceCall(ACIService, '');
	
};

/**
 * Captures a previously authorized payment
 *
 * @param 
 * @returns {Object} Service result
 */
ACIServiceWrapper.capturePayment = function (paymentID, currency, amount) {

	var apiRequestPayload = getAuthentication() +
		getDetails(currency, amount, 'CP');

	ACIService.setRequestMethod("POST");

	var url = ACIHelper.preferences.version + "/payments/" + paymentID;
	ACIService.setURL(ACIService.getConfiguration().getCredential().getURL() + url);

	return makeServiceCall(ACIService, apiRequestPayload);

};

/**
 * Refunds a payment
 *
 * @param 
 * @returns {Object} Service result
 */
ACIServiceWrapper.refundPayment = function (paymentID, currency, amount) {

	var apiRequestPayload = getAuthentication() +
		getDetails(currency, amount, "RF");

	ACIService.setRequestMethod("POST");

	var url = ACIHelper.preferences.version + "/payments/" + paymentID;
	ACIService.setURL(ACIService.getConfiguration().getCredential().getURL() + url);

	return makeServiceCall(ACIService, apiRequestPayload);

};

/**
 * Reverses a payment
 *
 * @param 
 * @returns {Object} Service result
 */
ACIServiceWrapper.reversePayment = function (paymentID) {

	var apiRequestPayload = getAuthentication() +
		'&paymentType=RV' + '&testMode=' + ACIHelper.preferences.transactionMode;

	ACIService.setRequestMethod("POST");

	var url = ACIHelper.preferences.version + "/payments/" + paymentID;
	ACIService.setURL(ACIService.getConfiguration().getCredential().getURL() + url);

	return makeServiceCall(ACIService, apiRequestPayload);

};

/**
 * Forms the request parameters for capture or refund requests
 * 
 * @param {String, String, String} Currency, Amount to be captured/refunded, payment type - CP or RF
 * @returns {String} URL query string
 */
function getDetails(currency, amount, paymentType) {
	var requestParams = '&amount=' + amount +
		'&currency=' + currency +
		'&testMode=' + ACIHelper.preferences.transactionMode +
		'&paymentType=' + paymentType;

	return requestParams;
}

/**
 * Gets transaction status from ACI for a payment ID
 *
 * @param 
 * @returns {Object} Service result
 */
ACIServiceWrapper.getTransactionStatus = function (paymentID) {

	ACIService.setRequestMethod("GET");

	var url = ACIHelper.preferences.version + "/query/" + paymentID + '?' + getAuthentication();;
	ACIService.setURL(ACIService.getConfiguration().getCredential().getURL() + url);

	return makeServiceCall(ACIService, '');

}

/**
 * Check site preferences value exist ot not
 *
 * @returns {Boolean}
 */
function checkValueIsExist($paramVal) {
	if (!empty($paramVal) && $paramVal.value != null) {
		return true;
	} else {
		return false;
	}
}
/**
 * Gets the 3D Secure Params
 *
 * @returns {String} URL query string
 */
function getThreeDSecureParams() {
	var threeDSecureValString = '';

	if (!empty(ACIHelper.preferences.threedsTransactionId)) {
		threeDSecureValString += '&customParameters["threeDSecure.dsTransactionId"]=' + ACIHelper.preferences.threedsTransactionId;
	}
	if (!empty(ACIHelper.preferences.threedsVersion)) {
		threeDSecureValString += '&customParameters["threeDSecure.version"]=' + ACIHelper.preferences.threedsVersion;
	}
	if (checkValueIsExist(ACIHelper.preferences.threedsChallengeIndicator)) {
		threeDSecureValString += '&customParameters["threeDSecure.challengeIndicator"]=' + ACIHelper.preferences.threedsChallengeIndicator;
	}
	if (!empty(ACIHelper.preferences.threedsChallengeMandatedIndicator)) {
		threeDSecureValString += '&customParameters["threeDSecure.challengeMandatedIndicator"]=' + ACIHelper.preferences.threedsChallengeMandatedIndicator;
	}
	if (checkValueIsExist(ACIHelper.preferences.threedsAuthenticationType)) {
		threeDSecureValString += '&customParameters["threeDSecure.authenticationType"]=' + ACIHelper.preferences.threedsAuthenticationType;
	}
	if (checkValueIsExist(ACIHelper.preferences.threedsExemptionFlag)) {
		threeDSecureValString += '&customParameters["threeDSecure.exemptionFlag"]=' + ACIHelper.preferences.threedsExemptionFlag;
	}
	if (!empty(ACIHelper.preferences.threedsTransactionStatusReason)) {
		threeDSecureValString += '&customParameters["threeDSecure.transactionStatusReason"]=' + ACIHelper.preferences.threedsTransactionStatusReason;
	}
	if (!empty(ACIHelper.preferences.threedsAcsTransactionId)) {
		threeDSecureValString += '&customParameters["threeDSecure.acsTransactionId"]=' + ACIHelper.preferences.threedsAcsTransactionId;
	}

	return threeDSecureValString;
}

/*
 * Module Exports
 */
module.exports = ACIServiceWrapper;
