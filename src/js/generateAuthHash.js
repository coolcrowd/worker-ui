var sjcl = require("../../lib/sjcl/sjcl.js");
module.exports = {
    /**
     * This method generates a hash from a pseudo-random string and returns this string and its sha256 hash
     * encoded as base64Url (as specified in https://www.ietf.org/rfc/rfc4648.txt Table 2).
     * @returns {{random, base64UrlHash: *}} the random string the hash was generated with,
     * the base64Url encoding of the hash
     */
    generateAuthHash: function () {
        var randomToHash = generatePseudoRandomString(8);
        var hashedBitArray = sjcl.hash.sha256.hash(randomToHash);
        var base64Hash = sjcl.codec.base64url.fromBits(hashedBitArray);
        return {
            random: randomToHash,
            base64UrlHash: base64Hash
        }
    }
};

// this generates a random code with 10 characters in [a-zA-Z0-9]
function generatePseudoRandomString(length) {
    var s = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.apply(null, new Array(length)).map(function () {
        return s.charAt(Math.floor(Math.random() * s.length));
    }).join('');
}