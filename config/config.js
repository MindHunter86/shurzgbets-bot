/*
Config file
 */

var config = {
    serverPort: 80,
    prefix: '',
	//настройка бота рулетки
    bot: {
        username: 'sergoold',
        password: 'Sergoproaloalo1488'
    },
	//настройки бота магазина
    shopBot: {
        username: 'dotal_1',
        password: 'QmjKTHvO',
        timeForCancelOffer: 1800
    },
    apiKey: '89638B050C0254D97337012787F57F68',	//steam api key
    domain: 'itemup.ru',	//домен сайта
    secretKey: 'oDWx4GYTr4Acbdms',
    
    admins: [	//steam id админов
        '76561198227021736',
        '76561198239237004',
        '76561198254647128',
    ]
}

module.exports = config;