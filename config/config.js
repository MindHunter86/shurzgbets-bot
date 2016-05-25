/*
Config file
 */

var config = {
    serverPort: 80,
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
    secretKey: '',
    
    admins: [	//steam id админов
        ''
    ]
}

module.exports = config;
