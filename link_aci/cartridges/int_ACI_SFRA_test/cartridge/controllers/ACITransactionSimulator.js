'use strict';

var server = require('server');
var system = require('dw/system/System');
var URLUtils = require('dw/web/URLUtils');
var TransactionHelper = require('*/cartridge/scripts/aci/transactionHelper');


server.get('Test', server.middleware.https, function (req, res, next) {
    var env = system.getInstanceType();
    if (env === system.PRODUCTION_SYSTEM) {
        res.redirect(URLUtils.url('Home-ErrorNotFound'));
    } else {
        var actionUrl = URLUtils.https('ACITransactionSimulator-Initiate');
        res.render('aci/simulator/transactionsimulatorform', {
            actionUrl: actionUrl
        });
    }
    next();
});


server.post('Initiate', server.middleware.https, function (req, res, next) {
    var orderNumber = req.form.ordernumber;
    var amount = req.form.amount;
    var transactionType = req.form.transactionType;
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
        default:
    }

    res.render('aci/simulator/transactionsimulatorresult', {
        orderNumber: orderNumber,
        amount: amount,
        transactionType: transactionType,
        response: response
    });
    next();
});


module.exports = server.exports();
