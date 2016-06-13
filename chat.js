/**
 * Created by frenZy on 11.06.2016.
 */

var scribe = require('scribe-js')({
    createDefaultConsole: false
});
var config  = require('./config/chat.js');
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
    redis   = require('redis');

var redisClient = redis.createClient(),
    client = redis.createClient();

var chatHistory = [],
    chatId = 0;


server.listen(config.port, '127.0.0.1');

console.log('Chat server started on port' + config.port);

var basicAuth = auth.basic({ //basic auth config
    realm: "WebPanel",
    file: __dirname + "/config/users.htpasswd"
});
app.use('/logs/chat/', auth.connect(basicAuth), scribe.webPanel());

redisClient.subscribe(config.prefix + 'new_message');
redisClient.subscribe(config.prefix + 'remove_message');
redisClient.subscribe(config.prefix + 'ban');

redisClient.setMaxListeners(0);
redisClient.on("message", function(channel, message) {
        var msg = JSON.parse(message);
        if (channel == config.prefix + 'new_message') {
            console.tag('Chat').notice('New chat msg: [' + msg.username + '] ' + msg.text);
            chatId++;
            msg.id = chatId;
            chatHistory.push(msg);
            if (chatHistory.length>50)
                chatHistory = chatHistory.slice(1,50);
        }
        if (channel == config.prefix + 'remove_message') {
            for (var i=0;i<chatHistory.length;i++)
                if (chatHistory[i].id==msg.id) {
                    chatHistory.splice(i,1);
                }
            console.tag('Chat').log('Removed message #' + msg.id);
        }
        if (channel == config.prefix + 'ban')
            console.tag('Chat').log('User '+msg.steamid+' banned until '+msg.bantime);
        io.emit(channel, msg);
});

io.on('connection', function(socket) {
    socket.emit(config.prefix + 'history',chatHistory);
});