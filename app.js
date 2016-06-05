var fs = require('fs');
/*var https_options = {
    //ca: fs.readFileSync("/var/projects/itemup.ru/crts/ca-bundle.pem"),
    key: fs.readFileSync("/var/projects/itemup.ru/crts/www.itemupru.key"),
    cert: fs.readFileSync("/var/projects/itemup.ru/crts/www.itemupru.pem")
};*/
var scribe = require('scribe-js')({
        createDefaultConsole: false
    });
var config  = require('./config/config.js');
var console = scribe.console({
        console : {
            logInConsole: false
        },
        createBasic : false
    });

    console.addLogger('notice', 'grey', {
        logInConsole: config.loglevel <= config.loglv.ALL
    });
    console.addLogger('info', 'cyan', {
        logInConsole: config.loglevel <= config.loglv.INFO
    });
    console.addLogger('log', 'white', {
        logInConsole: config.loglevel <= config.loglv.LOG
    });
    console.addLogger('error', 'red', {
        logInConsole: config.loglevel <= config.loglv.ERROR
    });
process.console = console;

var auth = require('http-auth'),
    app     = require('express')(),
    server  = require('http').createServer(app),
    io      = require('socket.io')(server),
    redis   = require('redis'),
    requestify   = require('requestify'),
    bot     = require('./bot.js');
    shop     = require('./shop.js');
    //refbot     = require('./refbot.js');

var redisClient = redis.createClient(),
    client = redis.createClient();

bot.init(redis, io, requestify);
shop.init(redis, requestify);
//refbot.init(redis, requestify);
server.listen(config.port, '127.0.0.1');

console.log('Server started on ' + config.domain + ':' + config.port);

var basicAuth = auth.basic({ //basic auth config
    realm: "WebPanel",
    file: __dirname + "/config/users.htpasswd"
});
app.use('/logs', auth.connect(basicAuth), scribe.webPanel());

redisClient.subscribe(config.prefix + 'show.winners');
redisClient.subscribe(config.prefix + 'queue');
redisClient.subscribe(config.prefix + 'newDeposit');
redisClient.subscribe(config.prefix + 'newPlayer');
redisClient.subscribe(config.prefix + 'depositDecline');
redisClient.subscribe(config.prefix + 'show.lottery.winners');

redisClient.setMaxListeners(0);
redisClient.on("message", function(channel, message) {
    if(channel == config.prefix + 'depositDecline' || channel == config.prefix + 'queue'){
        io.sockets.emit(channel, message);
    }
    if(channel == config.prefix + 'show.winners'){
        clearInterval(timer);
        timerStatus = false;
        console.log('Force Stop');
        game.status = 3;
        showSliderWinners();
    }
    if(channel == 'show.lottery.winners') {
        console.log('Start Winner Lottery');
        showSliderWinnersLottery();
    }
    if(channel == config.prefix + 'newPlayer'){
        io.sockets.emit(channel, message);
    }
    if(channel == config.prefix + 'newDeposit'){
        io.sockets.emit(channel, message);

        message = JSON.parse(message);
        if(!timerStatus && message.gameStatus == 1){
            game.status = 1;
            startTimer(io.sockets);
        }
    }
});

io.sockets.on('connection', function(socket) {

    /*updateOnline();

    socket.on('disconnect', function(){
        updateOnline();
    })*/
});
var lastGameTimestamp = Date.now();
setInterval(checkLastGame, 30000);
setInterval(updateOnline, 5000);

function checkLastGame() {
    var currentTime = Date.now();
    if (currentTime-lastGameTimestamp >= config.maxIntervalBetweenGames*60*1000) {
        if (config.notifyURL && config.notifyURL.length) {
            requestify.get(config.notifyURL)
                .then(function(response) {
                        console.log('Notify sended');
                    },
                function(response) {
                        console.error('Cannot request notify URL');
                    }
                );
        }
        console.error('No games within '+config.maxIntervalBetweenGames+' minutes. Restarting.');
        process.exit(0);
    }
}

function updateOnline(){
    io.sockets.emit('online', Object.keys(io.sockets.adapter.rooms).length);
    console.info('Connected ' + Object.keys(io.sockets.adapter.rooms).length + ' clients');
}

var steamStatus = [],
    game,
    timer,
    ngtimer,
    timerStatus = false,
    timerTime = 80,
    preFinishingTime = 23;

getCurrentGame();
//checkSteamInventoryStatus();

var preFinish = false;
function startTimer(){
    var time = timerTime;
    timerStatus = true;
    clearInterval(timer);
    console.tag('Game').log('Game start.');
    timer = setInterval(function(){
        console.tag('Game').notice('Timer:' + time);
        io.sockets.emit('timer', time--);
        if((game.status == 1) && (time <= preFinishingTime)){
            if(!preFinish){
                preFinish = true;
                console.log('Отключаем карточки');
                setGameStatus(2);
            }
        }
        if(time <= 0){
            clearInterval(timer);
            timerStatus = false;
            console.tag('Game').log('Game end.');
            showSliderWinners();
        }
    }, 1000);
}

function startNGTimer(winners){
    var time = 18;
    data = JSON.parse(winners);
    data.showSlider = true;
    clearInterval(ngtimer);
    bot.getBonusItems();
    ngtimer = setInterval(function(){
        bot.delayForNewGame(true);
        if(time <= 10) data.showSlider = false;
        console.tag('Game').notice('NewGame Timer:' + time);
        data.time = time--;
        io.sockets.emit('slider', data);
        if(time <= 0){
            clearInterval(ngtimer);
            newGame();
            bot.delayForNewGame(false);
        }
    }, 1000);
}
function getCurrentGame(){
    requestify.post(config.protocol+'://'+config.domain+'/api/getCurrentGame', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            game = JSON.parse(response.body);
            console.tag('Game').log('Current Game #' + game.id);
            if(game.status == 1) startTimer();
            if(game.status == 2) startTimer();
            if(game.status == 3) newGame();
        },function(response){
            console.tag('Game').error('Something wrong [getCurrentGame]');
            setTimeout(getCurrentGame, 1000);
        });
}
function newLottery(){
    requestify.post(config.protocol+'://'+config.domain+'/api/newLottery', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            game = JSON.parse(response.body);
            console.tag('Lottery').log('New lottery! #' + game.id);
            io.sockets.emit('newLottery', game);
            bot.handleOffers();
            //redisClient.del('usersQueue.list');
        },function(response){
            console.tag('Lottery').error('Something wrong [newLottery]');
            setTimeout(newLottery, 1000);
        });
}
function newGame(){
    requestify.post(config.protocol+'://'+config.domain+'/api/newGame', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            game = JSON.parse(response.body);
            console.tag('Game').log('New game! #' + game.id);
            io.sockets.emit('newGame', game);
            bot.handleOffers();
            preFinish = false;
            requestify.post(config.protocol+'://'+config.domain+'/api/bonusBet', {
                secretKey: config.secretKey
            })
            .then(function(response) {
                var data = JSON.parse(response.getBody());
                if (data.success) {
                    console.notice('Bonus added');
                } else {
                    console.tag('Bonus').log(data.message);
                }
            }, function(response) {
                console.notice('Error with bonus bet');
            });
            lastGameTimestamp = Date.now();
            //redisClient.del('usersQueue.list');
        },function(response){
            console.tag('Game').error('Something wrong [newGame]');
            setTimeout(newGame, 1000);
        });
}

function showSliderWinnersLottery(){
    requestify.post(config.protocol+'://'+config.domain+'/api/getWinnersLottery', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            var winners = response.body;
            data = JSON.parse(winners);
            io.sockets.emit('sliderLottery', data);
            setTimeout(newLottery, 10000);
            console.tag('Lottery').notice('Show slider!');
        },function(response){
            console.tag('Lottery').error('Something wrong [showSlider]');
            setTimeout(showSliderWinnersLottery, 1000);
        });
}
function showSliderWinners(){
    requestify.post(config.protocol+'://'+config.domain+'/api/getWinners', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            var winners = response.body;
            console.tag('Game').notice('Show slider!');
            startNGTimer(winners);
            setGameStatus(3);
            //io.sockets.emit('slider', winners)
        },function(response){
            console.tag('Game').error('Something wrong [showSlider]');
            setTimeout(showSliderWinners, 1000);
        });
}

function setGameStatus(status){
    requestify.post(config.protocol+'://'+config.domain+'/api/setGameStatus', {
        status: status,
        secretKey: config.secretKey
    })
        .then(function(response) {
            game = JSON.parse(response.body);
            if (status==3) console.tag('Game').log('Set game to a prefinishing status. Bets are redirected to a new game.');
        },function(response){
            console.tag('Game').error('Something wrong [setGameStatus]');
            setTimeout(setGameStatus, 1000);
        });
}

function checkSteamInventoryStatus() {
    requestify.get('http://api.steampowered.com/ICSGOServers_730/GetGameServersStatus/v1/?key=' + config.apiKey)
        .then(function(response) {
            var answer = JSON.parse(response.body);
            steamStatus = answer.result.services;
            console.tag('SteamStatus').info(steamStatus);
            client.set('steam.community.status', steamStatus.SteamCommunity);
            client.set('steam.inventory.status', steamStatus.IEconItems);
        },function(response){
            console.error('Something wrong [checkSteamInventoryStatus]');
            console.error(response.body);
        });
}
setInterval(checkSteamInventoryStatus, 120000);