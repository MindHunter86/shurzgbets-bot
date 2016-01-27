var fs = require('fs');
/*var https_options = {
    //ca: fs.readFileSync("/var/projects/itemup.ru/crts/ca-bundle.pem"),
    key: fs.readFileSync("/var/projects/itemup.ru/crts/www.itemupru.key"),
    cert: fs.readFileSync("/var/projects/itemup.ru/crts/www.itemupru.pem")
};*/
var auth = require('http-auth'),
    scribe = require('scribe-js')(),
    console = process.console,
    config  = require('./config/config.js'),
    app     = require('express')(),
    server  = require('http').createServer(app),
    io      = require('socket.io')(server),
    redis   = require('redis'),
    requestify   = require('requestify'),
    bot     = require('./bot.js');
    //shop     = require('./shop.js');

if (process.env.REDIS_URL) {
    var redisUrl    = require('url').parse(process.env.REDIS_URL);
    var redisClient = redis.createClient(redisUrl.port, redisUrl.hostname);
    var client      = redis.createClient(redisUrl.port, redisUrl.hostname);
    /* 
        Use it only when need to auth
        redisClient.auth(redisUrl.auth.split(":")[1]);
        client.auth(redisUrl.auth.split(":")[1]);
    */
} else {
    var redisClient = redis.createClient(),
        client = redis.createClient();
}

bot.init(redis, io, requestify);
//shop.init(redis, requestify);
var ports = process.env.PORT || 5000;
server.listen(5000);

console.log('Server started on ' + config.domain + ':' + ports);

var basicAuth = auth.basic({ //basic auth config
    realm: "WebPanel",
    file: __dirname + "/config/users.htpasswd"
});
app.use('/logs', auth.connect(basicAuth), scribe.webPanel());

redisClient.subscribe(config.prefix + 'show.winners');
redisClient.subscribe(config.prefix + 'queue');
redisClient.subscribe(config.prefix + 'newDeposit');
redisClient.subscribe(config.prefix + 'depositDecline');

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

    updateOnline();

    socket.on('disconnect', function(){
        updateOnline();
    })
});

function updateOnline(){
    io.sockets.emit('online', Object.keys(io.sockets.adapter.rooms).length);
    console.info('Connected ' + Object.keys(io.sockets.adapter.rooms).length + ' clients');
}

var steamStatus = [],
    game,
    timer,
    ngtimer,
    timerStatus = false,
    timerTime = 180,
    preFinishingTime = 10;

getCurrentGame();
//checkSteamInventoryStatus();

var preFinish = false;
function startTimer(){
    var time = timerTime;
    timerStatus = true;
    clearInterval(timer);
    console.tag('Game').log('Game start.');
    timer = setInterval(function(){
        console.tag('Game').log('Timer:' + time);
        io.sockets.emit('timer', time--);
        if((game.status == 1) && (time <= preFinishingTime)){
            if(!preFinish){
                preFinish = true;
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
    var time = 30;
    data = JSON.parse(winners);
    data.showSlider = true;
    clearInterval(ngtimer);
    ngtimer = setInterval(function(){
        bot.delayForNewGame(true);
        if(time <= 15) data.showSlider = false;
        console.tag('Game').log('NewGame Timer:' + time);
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
    requestify.post('http://'+config.domain+'/api/getCurrentGame', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            game = JSON.parse(response.body);
            console.tag('Game').log('Current Game #' + game.id);
            if(game.status == 1) startTimer();
            if(game.status == 2) startTimer();
            if(game.status == 3) newGame();
        },function(response){
            console.tag('Game').log('Something wrong [getCurrentGame]');
            setTimeout(getCurrentGame, 1000);
        });
}

function newGame(){
    requestify.post('http://'+config.domain+'/api/newGame', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            game = JSON.parse(response.body);
            console.tag('Game').log('New game! #' + game.id);
            io.sockets.emit('newGame', game);
            bot.handleOffers();
            preFinish = false;
        },function(response){
            console.tag('Game').error('Something wrong [newGame]');
            setTimeout(newGame, 1000);
        });
}

function showSliderWinners(){
    requestify.post('http://'+config.domain+'/api/getWinners', {
        secretKey: config.secretKey
    })
        .then(function(response) {
            var winners = response.body;
            console.tag('Game').log('Show slider!');
            startNGTimer(winners);
            setGameStatus(3);
            //io.sockets.emit('slider', winners)
        },function(response){
            console.tag('Game').error('Something wrong [showSlider]');
            setTimeout(showSliderWinners, 1000);
        });
}

function setGameStatus(status){
    requestify.post('http://'+config.domain+'/api/setGameStatus', {
        status: status,
        secretKey: config.secretKey
    })
        .then(function(response) {
            game = JSON.parse(response.body);
            console.tag('Game').log('Set game to a prefinishing status. Bets are redirected to a new game.');
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
            console.log('Something wrong [5]');
            console.log(response.body);
        });
}
setInterval(checkSteamInventoryStatus, 120000);