/*
Config file
 */
var loglv = {
    ALL: 0,
    INFO: 1,
    LOG: 2,
    ERROR: 3
};

var config = {
    prefix: '',
	//настройка бота рулетки
    bot: {
        username: '',
        password: '',
        shared_secret: '',
        identity_secret: ''
    },
	//настройки бота магазина
    shopBot: {
        username: '',
        password: '',
        shared_secret: '',
        identity_secret: '',
        timeForCancelOffer: 1800
    },
    apiKey: '89638B050C0254D97337012787F57F68',	//steam api key
    domain: 'shurzgbets.com',	//домен сайта
    protocol: 'https',
    port: 8080,
    secretKey: '',

    loglevel: loglv.LOG,
    admins: [	//steam id админов
        ''
    ]
}

module.exports = config;
module.exports.loglv = loglv;
