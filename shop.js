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
    if (process.env.REDIS_URL) {
        var redisUrl    = require('url').parse(process.env.REDIS_URL);
        redisClient = redis.createClient(redisUrl.port, redisUrl.hostname);
        /* 
            Use it only when need to auth
            redisClient.auth(redisUrl.auth.split(":")[1]);
        */
    } else {
        redisClient = redis.createClient();
    }
    requestify = requestifyCore;
}

var logOnOptions = {
    account_name: config.shopBot.username,
    password: config.shopBot.password
};

var authCode = ''; // code received by email

try {
    logOnOptions.sha_sentryfile = getSHA1(fs.readFileSync('bots/ssfn2616591384358764314'));
    logOnOptions.two_factor_code = SteamTotp.getAuthCode('9dXb6372nKsXCc/7XgjxKEv2ejk=');
} catch (e) {
    if (authCode !== '') {
        logOnOptions.auth_code = authCode;
    }
}
function getSHA1(bytes) {
    var shasum = crypto.createHash('sha1');
    shasum.end(bytes);
    return shasum.read();
}
// if we've saved a server list, use it

var steamClient = new Steam.SteamClient();
var steamUser = new Steam.SteamUser(steamClient);
var steamFriends = new Steam.SteamFriends(steamClient);
var steamWebLogOn = new SteamWebLogOn(steamClient, steamUser);
var offers = new SteamTradeOffers();

var checkingOffers = [],
    WebSession = false,
    globalSession;

const redisChannels = {
    itemsToSale: 'items.to.sale',
    itemsToGive: 'items.to.give',
    offersToCheck: 'offers.to.check'
}

function steamBotLogger(log){
    console.tag('SteamBotShop').log(log);
}
steamClient.connect();
steamClient.on('debug', steamBotLogger);
steamClient.on('connected', function() {
    steamUser.logOn(logOnOptions);
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
                offers.setup({
                    sessionID: sessionID,
                    webCookie: newCookie,
                    APIKey: APIKey
                });
                WebSession = true;
                globalSession = sessionID;
                redisClient.lrange(redisChannels.tradeoffersList, 0, -1, function(err, offers){
                    offers.forEach(function(offer) {
                        checkingOffers.push(offer);
                    });
                    handleOffers();
                });
                redisClient.del(redisChannels.itemsToGive);
                redisClient.del(redisChannels.offersToCheck);
                confirmations.setCookies(newCookie);
                confirmations.startConfirmationChecker(10000, 'LCDy7k8u2Dz5YzwdgyjvWeuwR/0=');
                steamBotLogger('Setup Offers!');
            });
        });
    }
});


steamUser.on('updateMachineAuth', function(sentry, callback) {
    fs.writeFileSync('sentry_shop', sentry.bytes);
    callback({ sha_file: getSHA1(sentry.bytes) });
});

function handleOffers() {
    offers.getOffers({
        get_received_offers: 1,
        active_only: 1,
        active_only: 1
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
                                if ('undefined' != typeof traderesponse.tradeid) {
                                    offers.getItems({
                                        tradeId: traderesponse.tradeid
                                    }, function (error, recieved_items) {
                                        if (!error) {
                                            var itemsForParse = [], itemsForSale = [], i = 0;
                                            recieved_items.forEach(function(item){
                                                itemsForParse[i++] = item.id;
                                            })
                                            offers.loadMyInventory({appId: 730, contextId: 2}, function(error, botItems){
                                                if(!error){
                                                    i = 0;
                                                    botItems.forEach(function(item){
                                                        if(itemsForParse.indexOf(item.id) != -1){
                                                            //var type = item.tags[0].name;
                                                            //var rarity;
                                                            //var quality;
                                                            var rarity = '', type = '';
                                                            var arr = item.type.split(',');
                                                            if (arr.length == 2) rarity = arr[1].trim();
                                                            if (arr.length == 3) rarity = arr[2].trim();
                                                            if (arr.length && arr[0] == 'Knife') rarity = 'Тайное';
                                                            if (arr.length) type = arr[0];
                                                            var quality = item.market_name.match(/\(([^()]*)\)/);
                                                            if(quality != null && quality.length == 2) quality = quality[1];
                                                            /*if(type === 'Sticker') { 
                                                                rarity = item.tags[2].name;
                                                                quality = item.tags[1].name;
                                                            }
                                                            else if(type === 'Container') { 
                                                                rarity = item.tags[3].name;
                                                                quality = item.tags[2].name;
                                                            }
                                                            else if(type === 'Key') {
                                                                rarity = item.tags[2].name;
                                                                quality = item.tags[1].name;
                                                            }
                                                            else {
                                                                rarity = item.tags[4].name;
                                                                quality = item.tags[5].name;
                                                            }*/
                                                            itemsForSale[i++] = {
                                                                inventoryId: item.id,
                                                                classId: item.classid,
                                                                name: item.name,
                                                                market_hash_name: item.market_hash_name,
                                                                rarity: rarity,
                                                                quality: quality,
                                                                type: type
                                                            }
                                                        }
                                                    });
                                                }
                                                redisClient.rpush(redisChannels.itemsToSale, JSON.stringify(itemsForSale));
                                                return;
                                            });
                                        }
                                        return;
                                    });
                                }
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

var sendTradeOffer = function(offerJson){
    var d = domain.create();
    d.on('error', function(err) {
        console.log(err.stack);
        console.tag('SteamBotShop').error('Error to send the item');
        sendProcceed = false;
    });
    var offer = JSON.parse(offerJson);
    d.run(function () {
        offers.loadMyInventory({
            appId: 730,
            contextId: 2
        }, function (err, items) {
            if(err) {
                console.log(err);
                console.tag('SteamBot', 'SendPrize').log('LoadMyInventory error!');
                sendProcceed = false;
                return;
            }
            var itemsFromMe = [];

            items.forEach(function(item){
                if(item.id == offer.itemId){
                    itemsFromMe[0] = {
                        appid: 730,
                        contextid: 2,
                        amount: item.amount,
                        assetid: item.id
                    };
                }
            });

            if (itemsFromMe.length > 0) {
                offers.makeOffer({
                    partnerSteamId: offer.partnerSteamId,
                    accessToken: offer.accessToken,
                    itemsFromMe: itemsFromMe,
                    itemsFromThem: [],
                    message: ''
                }, function (err, response) {
                    if (err) {
                        if((err.toString().indexOf('(15)') != -1) || (err.toString().indexOf('available') != -1)) {
                            console.log('true');
                            redisClient.lrem(redisChannels.itemsToGive, 0, offerJson, function(err, data){
                                setItemStatus(offer.id, 4);
                                sendProcceed = false;
                            });
                            return;
                        }
                        redisClient.lrem(redisChannels.itemsToGive, 0, offerJson, function(err, data){
                            console.tag('SteamBotShop', 'SendItem').error('Error to send offer. Error: ' + err);
                            setItemStatus(offer.id, 4);
                            sendProcceed = false;
                        });
                    }
                    redisClient.lrem(redisChannels.itemsToGive, 0, offerJson, function(err, data){
                        sendProcceed = false;
                        setItemStatus(offer.id, 3);
                        console.tag('SteamBotShop', 'SendItem').log('TradeOffer #' + response.tradeofferid +' send!');
                        redisClient.rpush(redisChannels.offersToCheck, response.tradeofferid);
                    });
                });
            }else{
                redisClient.lrem(redisChannels.itemsToGive, 0, offerJson, function(err, data){
                    console.tag('SteamBotShop', 'SendItem').log('Items not found!');
                    setItemStatus(offer.id, 2);
                    sendProcceed = false;
                });
            }
        });
    });
};


var setItemStatus = function(item, status){
    requestify.post('http://'+config.domain+'/api/shop/setItemStatus', {
        secretKey: config.secretKey,
        id: item,
        status: status
    })
        .then(function(response) {
        },function(response){
            console.tag('SteamBotShop').error('Something wrong with setItemStatus. Retry...');
            setTimeout(function(){setItemStatus()}, 1000);
        });
}

var addNewItems = function(){
    requestify.post('http://'+config.domain+'/api/shop/newItems', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            var answer = JSON.parse(response.body);
            console.log(answer);
            if(answer.success){
                itemsToSaleProcced = false;
            }
        },function(response){
            console.tag('SteamBotShop').error('Something wrong with newItems. Retry...');
            setTimeout(function(){addNewItems()}, 1000);
        });
}

var checkOfferForExpired = function(offer){
    offers.getOffer({tradeOfferId: offer}, function (err, body){
        if(body.response.offer){
            var offerCheck = body.response.offer;
            if(offerCheck.trade_offer_state == 2) {
                var timeCheck = Math.floor(Date.now() / 1000) - offerCheck.time_created;
                console.log(timeCheck);
                if(timeCheck >= config.shopBot.timeForCancelOffer){
                    offers.cancelOffer({tradeOfferId: offer}, function(err, response){
                        if(!err){
                            redisClient.lrem(redisChannels.offersToCheck, 0, offer, function(err, data){
                                steamBotLogger('Offer #' + offer + ' was expired!')
                                checkProcceed = false;
                            });
                        }else{
                            checkProcceed = false;
                        }
                    });
                }else{
                    checkProcceed = false;
                }
                return;
            }else if(offerCheck.trade_offer_state == 3 || offerCheck.trade_offer_state == 7){
                redisClient.lrem(redisChannels.offersToCheck, 0, offer, function(err, data){
                    checkProcceed = false;
                });
            }else{
                checkProcceed = false;
            }
        }else{
            checkProcceed = false;
        }
    })
}

var queueProceed = function(){
    redisClient.llen(redisChannels.itemsToSale, function(err, length) {
        if (length > 0 && !itemsToSaleProcced) {
            console.tag('SteamBotShop','Queues').info('New items to sale:' + length);
            itemsToSaleProcced = true;
            addNewItems();
        }
    });
    redisClient.llen(redisChannels.itemsToGive, function(err, length) {
        if (length > 0 && !sendProcceed && WebSession) {
            console.tag('SteamBotShop','Queues').info('Send items:' + length);
            sendProcceed = true;
            redisClient.lindex(redisChannels.itemsToGive, 0,function (err, offerJson) {
                sendTradeOffer(offerJson);
            });
        }
    });
    redisClient.llen(redisChannels.offersToCheck, function(err, length) {
        if (length > 0 && !checkProcceed && WebSession) {
            console.tag('SteamBotShop','Queues').info('Check Offers:' + length);
            checkProcceed = true;
            redisClient.lindex(redisChannels.offersToCheck, 0,function (err, offer) {
                setTimeout(function(){
                    checkOfferForExpired(offer)
                }, 1000 * config.shopBot.timeForCancelOffer);
            });
        }
    });
}
var itemsToSaleProcced = false;
var sendProcceed = false;
var checkProcceed = false;
setInterval(queueProceed, 1500);
