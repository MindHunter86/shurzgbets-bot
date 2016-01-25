/*
Config file
 */

var config = {
    serverPort: 44314,
    prefix: '',
	//настройка бота рулетки
    bot: {
        username: 'sergoold',
        password: 'Sergoproaloalo1488'
    },
	//настройки бота магазина
    shopBot: {
        username: 'lexx_nightwolf',
        password: '3kAp2SNyFejf3rR',
        timeForCancelOffer: 1800
    },
    apiKey: '89638B050C0254D97337012787F57F68',	//steam api key
    domain: 'itemup.ru',	//домен сайта
    secretKey: 'oDWx4GYTr4Acbdms',
    
    admins: [	//steam id админов
        '76561198227021736',
        '76561198227021736',
        '76561198227021736',
    ]
}

module.exports = config;