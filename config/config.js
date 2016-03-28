/*
Config file
 */

var config = {
    serverPort: 80,
    prefix: '',
	//настройка бота рулетки
    bot: {
        username: 'aldoodellanip',
        password: 'n5Bd2PW2Ju0Jx'
    },
	//настройки бота магазина
    shopBot: {
        username: 'frisondenuvicu',
        password: 'pzJMKFrqBvE8CR',//
        timeForCancelOffer: 1800
    },
    apiKey: '89638B050C0254D97337012787F57F68',	//steam api key
    domain: 'shurzgbets.com',	//домен сайта
    secretKey: 'WJeqewqeihqwWNewIoqweqw',
    
    admins: [	//steam id админов
        '76561198175079859','76561198180956505', '76561198227021736'
    ]
}

module.exports = config;