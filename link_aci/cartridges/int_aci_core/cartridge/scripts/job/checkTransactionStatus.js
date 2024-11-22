/**
* Description of the module and the logic it provides
*
* @module cartridge/scripts/job/CheckTransactionStatus
*/

'use strict';
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var logger = require('dw/system/Logger').getLogger('CheckTransactionStatus');
var Status = require('dw/system/Status');

/**
* Gets all orders which has ACI payment status 'PENDING' and export status as 'Not Exported' 
* and checks ACI payment transaction status for each order. Orders which are confirmed are 
* updated to 'Export Ready' status. Orders which are rejected are cancelled  
*  
* @return {Status} Job status
*/
 var checkPendingTransactions = function(){
	 
	 var ACIHelper = require('~/cartridge/scripts/aci/aciHelper');
	 var ACIServiceWrapper = require("~/cartridge/scripts/aci/aciServiceWrapper.js");
	 var Transaction = require('dw/system/Transaction');
	 var OrderMgr = require('dw/order/OrderMgr');
	 
	 var jobStatus = true;
 
	 var queryString = 'exportStatus = {0} AND custom.ACI_isPendingOrder = {1} AND (status = {2} OR status = {3})';
	 var queryParams =  [Order.EXPORT_STATUS_NOTEXPORTED, true, Order.ORDER_STATUS_NEW, Order.ORDER_STATUS_OPEN];
	 
	 var pendingOrders = OrderMgr.searchOrders(queryString, null, queryParams);
		
	 if (pendingOrders.getCount() <= 0) {
		 logger.info("No orders found in pending status");
		 return new Status(Status.OK, 'NO_ORDERS_FOUND');	
	 }
	 
	 for each(var order in pendingOrders) {	
		 
		try {
			
			logger.info ("Processing order : "+ order.orderNo);
			var paymentInstrument = ACIHelper.getPayment(order);		
			var paymentID = paymentInstrument.paymentTransaction.transactionID;
		
			if (!paymentID) {
				logger.error("Processing failed as payment ID is missing for order : "+ order.orderNo);
				continue;
			}
				
			var transactionStatus = ACIServiceWrapper.getTransactionStatus(paymentID);			
		
			if (transactionStatus.ok){
				
				var paymentResponse = transactionStatus.object;
				
				if (ACIHelper.isTransactionPending(paymentResponse)) {
					
					//Transaction status is still pending. Log the order number and proceed with next order
					logger.info("Order is not processed as payment Status is still pending for order: "+ order.orderNo);
					continue;
				
				} else {
					
					Transaction.wrap(function () {	
						
						//Save response details to order
						ACIHelper.savePaymentResponse(order, paymentResponse);
						
						//Cancel the order if payment is rejected, else mark the order to ready for export status
						if (ACIHelper.isTransactionRejected(paymentResponse)){
							
							logger.info("ACI Payment Status is REJECTED. The order will be cancelled");								 
							OrderMgr.cancelOrder(order);	
							 
						} else {
							
							logger.info("ACI Payment Status is CONFIRMED. Order export status is updated to EXPORT_STATUS_READY");	
							order.exportStatus = dw.order.Order.EXPORT_STATUS_READY;
						}		
						//Update the pending order flag of the order
						order.custom.ACI_isPendingOrder = false;
						
						logger.info ("Successfully processed order : "+ order.orderNo);		
					 });
				}
			}	
			else {
				logger.error("Processing failed as transaction Status is not ok for order : "+ order.orderNo);
				jobStatus = false;
			}
		
		} catch (e) {
			
			var errorMsg = "[checkPendingTransactions] An error occurred in checkPendingTransactions job.\n Error details :" + e.message;
			logger.error(errorMsg);
			logger.error("Processing failed for order : " + order.orderNo);
			jobStatus = false;
			
		}
	}
	 
	 if (jobStatus) {
		return new Status(Status.OK);
	 }
	 else {
		return new Status(Status.ERROR);
	 }
	
 }

/* Exports of the modules */

 /** Checks status of pending payments in ACI and updates order status
  * @see {@link module:cartridge/scripts/job/CheckTransactionStatu} */
  exports.CheckPendingTransactions = checkPendingTransactions;
