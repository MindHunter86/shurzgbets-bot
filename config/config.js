/*
Config file
 */

var config = {
    serverPort: 80,
    prefix: '',
	//настройка бота рулетки
    bot: {
        username: 'tmallidaxinnga',
        password: 'mRZesXvuqzTlFb'
    },
	//настройки бота магазина
    shopBot: {
        username: 'zettanalurzaish',
        password: 'T3bqAUPrhUB5fNL',//
        timeForCancelOffer: 1800
    },
    apiKey: '89638B050C0254D97337012787F57F68',	//steam api key
    domain: 'shurzgbets.com',	//домен сайта
    secretKey: '1K2wmLstWcMTirHs2rEeOKvyxDTkZVCclceg41Qqb2f6QJ2FaDEWtoUTpMjgBtjY',
    
    admins: [	//steam id админов
        '76561198180956505'
    ]
}

module.exports = config;
