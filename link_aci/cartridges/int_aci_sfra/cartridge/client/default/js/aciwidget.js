'use strict';

var processInclude = require('base/util');

// eslint-disable-next-line no-undef
$(document).ready(function () {
    processInclude(require('./aci/aciwidget'));
});
