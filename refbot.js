var fs = require('fs');
var crypto = require('crypto');
var console = process.console;
var config  = require('./config/config.js');
var Steam = require('steam');
var SteamWebLogOn = require('steam-weblogon');
var getSteamAPIKey = require('steam-web-api-key');
var SteamTradeOffers = require('steam-tradeoffers');
var domain = require('domain');
var SteamTotp = require('steam-totp');
var SteamCommunity = require('steamcommunity');
var confirmations = new SteamCommunity();

var redisClient, requestify;
module.exports.init = function(redis, requestifyCore) {
    redisClient = redis.createClient();
    requestify = requestifyCore;
}

var logOnOptions = {
    account_name: config.referalBot.username,
    password: config.referalBot.password
};

var authCode = ''; // code received by email

try {
    logOnOptions.two_factor_code = SteamTotp.getAuthCode(config.referalBot.shared_secret);
} catch (e) {
    if (authCode !== '') {
        logOnOptions.auth_code = authCode;
    }
}
console.log('Код реферального бота:', logOnOptions.two_factor_code);
function getSHA1(bytes) {
    var shasum = crypto.createHash('sha1');
    shasum.end(bytes);
    return shasum.read();
}

var steamClient = new Steam.SteamClient();
var steamUser = new Steam.SteamUser(steamClient);
var steamFriends = new Steam.SteamFriends(steamClient);
var steamWebLogOn = new SteamWebLogOn(steamClient, steamUser);
var offers = new SteamTradeOffers();

var checkingOffers = [],
    WebSession = false,
    globalSession,
    lockItems = [];

var checkArrGlobal = [];

const redisChannels = {
    itemsToSend: 'refitems.to.send'
}

function steamBotLogger(log){
    console.tag('SteamRefBot').log(log);
}
steamClient.connect();
steamClient.on('debug', steamBotLogger);
steamClient.on('connected', function() {
    steamUser.logOn(logOnOptions);
});
steamClient.on('error', function(error) {
    console.log(error);
});
steamClient.on('logOnResponse', function(logonResp) {
    if (logonResp.eresult === Steam.EResult.OK) {
        steamBotLogger('Logged in!');
        steamFriends.setPersonaState(Steam.EPersonaState.Online);

        steamWebLogOn.webLogOn(function(sessionID, newCookie) {
            getSteamAPIKey({
                sessionID: sessionID,
                webCookie: newCookie
            }, function(err, APIKey) {
                console.log('getSteamAPIKey shop');
                console.log(APIKey);
                offers.setup({
                    sessionID: sessionID,
                    webCookie: newCookie,
                    APIKey: APIKey
                });
                WebSession = true;
                globalSession = sessionID;
                confirmations.setCookies(newCookie);
                confirmations.startConfirmationChecker(10000, config.referalBot.identity_secret);
                steamBotLogger('Setup Offers!');
            });
        });
    }
});
steamClient.on('loggedOff', function() {
    steamClient.connect();
});

steamUser.on('updateMachineAuth', function(sentry, callback) {
    fs.writeFileSync('sentry_shop', sentry.bytes);
    callback({ sha_file: getSHA1(sentry.bytes) });
});

function handleOffers() {
    offers.getOffers({
        get_received_offers: 1,
        active_only: 1,
        time_historical_cutoff: Math.round(Date.now() / 1000)
    }, function(error, body) {
        if (
            body
            && body.response
            && body.response.trade_offers_received
        ) {
            body.response.trade_offers_received.forEach(function(offer) {
                if (offer.trade_offer_state == 2) {
                    if(config.admins.indexOf(offer.steamid_other) != -1){
                        offers.acceptOffer({
                            tradeOfferId: offer.tradeofferid
                        }, function(error, traderesponse) {
                            if(!error) {
                                console.tag('SteamRefBot').log('Accepted items from '+offer.steamid_other);
                            }
                            return;
                        });
                    }else{
                        offers.declineOffer({tradeOfferId: offer.tradeofferid});
                    }
                    return;
                }
            });
        }
    });
}

steamUser.on('tradeOffers', function(number) {
    console.log('Offers: ' + number);
    if (number > 0) {
        handleOffers();
    }
});

function getErrorCode(err, callback){
    var errCode = 0;
    var match = err.match(/\(([^()]*)\)/);
    if(match != null && match.length == 2) errCode = match[1];
    callback(errCode);
}
var sendTradeOffer = function(offerJson){
    var d = domain.create();
    d.on('error', function(err) {
        console.log(err.stack);
        console.tag('SteamRefBot').error('Error to send the item');
        sendProcceed = false;
    });
    var offer = JSON.parse(offerJson);
    d.run(function () {
        offers.loadMyInventory({
            appId: 730,
            contextId: 2
        }, function (err, items) {
            if(err) {
                console.tag('SteamRefBot', 'SendItems').error('LoadMyInventory error!');
                console.error(err);
                sendProcceed = false;
                return;
            }
            var itemsFromMe = [],
                checkArr = [];

            offer.items.forEach(function (offerItem) {
                for (var i=0;i<items.length;i++) {
                    var item = items[i];
                    if (item.market_hash_name == offerItem) {
                        if ((checkArr.indexOf(item.id) == -1) && (checkArrGlobal.indexOf(item.id) == -1)) {
                            checkArr.push(item.id);
                            itemsFromMe.push({
                                appid: 730,
                                contextid: 2,
                                amount: item.amount,
                                assetid: item.id
                            });
                            break;
                        }
                    }
                }
            });

            if (itemsFromMe.length == offer.items.length) {
                offers.makeOffer({
                    partnerSteamId: offer.partnerSteamId,
                    accessToken: offer.accessToken,
                    itemsFromMe: itemsFromMe,
                    itemsFromThem: [],
                    message: 'Реферальная награда от '+ config.domain
                }, function (err, response) {
                    if (err) {
                        getErrorCode(err.message, function(errCode) {
                            if(errCode == 15 || errCode == 25 || err.message.indexOf('an error sending your trade offer.  Please try again later.')) {
                                redisClient.lrem(redisChannels.itemsToSend, 0, offerJson, function(err, data){
                                    setReferalStatus(offer.userid, 4);
                                    sendProcceed = false;
                                });  
                            }
                        });
                        sendProcceed = false;
                        return;
                    }
                    redisClient.lrem(redisChannels.itemsToSend, 0, offerJson, function(err, data){
                        sendProcceed = false;
                        setReferalStatus(offer.userid, 3);
                        console.tag('SteamRefBot', 'SendItems').log('TradeOffer #' + response.tradeofferid +' send!');
                        checkArrGlobal = checkArrGlobal.concat(checkArr);
                    });
                });
            }else{
                redisClient.lrem(redisChannels.itemsToSend, 0, offerJson, function(err, data){
                    console.tag('SteamRefBot', 'SendItems').log('Items not found!');
                    setReferalStatus(offer.userid, 2);
                    sendProcceed = false;
                });
            }
        });
    });
};


var setReferalStatus = function(user, status){
    requestify.post(config.protocol+'://'+config.domain+'/api/referal/updateStatus', {
        secretKey: config.secretKey,
        userid: user,
        status: status
    })
        .then(function(response) {
        },function(response){
            console.tag('SteamBotShop').error('Something wrong with setItemStatus. Retry...');
            setTimeout(function(){setItemStatus()}, 1000);
        });
}

var queueProceed = function(){
    redisClient.llen(redisChannels.itemsToSend, function(err, length) {
        if (length > 0 && !sendProcceed && WebSession) {
            console.tag('SteamRefBot','Queues').info('Send items:' + length);
            sendProcceed = true;
            redisClient.lindex(redisChannels.itemsToSend, 0,function (err, offerJson) {
                sendTradeOffer(offerJson);
            });
        }
    });

}
var sendProcceed = false;
setInterval(queueProceed, 1500);
