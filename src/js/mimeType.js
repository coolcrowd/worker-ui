var $ = require("jquery");

module.exports = {
    checkIfImage: function( url ) {
        var contentType = getContentType( url );
        return $.inArray(contentType, IMAGES) > -1;
    }
};

function getContentType (url) {
    return $.get(url).done(function(data, status, xhr) {
        return xhr.getResponseHeader("Content-Type")
    });
}

var IMAGE = "IMAGE/";
var BMP = IMAGE + "bmp";
var X_CANON_CRW = IMAGE + "x-canon-crw";
var GIF = IMAGE + "gif";
var VND_MICROSOFT_ICON = IMAGE + "vnd.microsoft.icon";
var JPEG = IMAGE + "jpeg";
var PNG = IMAGE + "png";
var VND_ADOBE_PHOTOSHOP = IMAGE + "vnd.adobe.photoshop";
var SVG_XML = IMAGE + "svg+xml";
var TIFF = IMAGE + "tiff";
var WEBP = IMAGE + "webp";

var IMAGES = [BMP, X_CANON_CRW, GIF, VND_MICROSOFT_ICON, JPEG, PNG, VND_ADOBE_PHOTOSHOP, SVG_XML, TIFF, WEBP];
