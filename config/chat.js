/**
 * Created by frenZy on 12.06.2016.
 */
var loglv = {
    ALL: 0,
    INFO: 1,
    LOG: 2,
    ERROR: 3
};

var config = {
    prefix: 'chat_',
    port: 8081,
    secretKey: '1K2wmLstWcMTirHs2rEeOKvyxDTkZVCclceg41Qqb2f6QJ2FaDEWtoUTpMjgBtjY',
    loglevel: loglv.ALL
}

module.exports = config;
module.exports.loglv = loglv;
