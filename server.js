var express = require('express');
var bodyParser = require('body-parser');
const vkIO = require('vk-io');
const https = require('https');

const LIMIT = 25;

const vk = new vkIO.VK();
vk.token = '';

var app = express();

var urlencodedParser = bodyParser.urlencoded({extended: false});
app.set('view engine', 'ejs');

app.get('/', function(_req, res) {
    res.render('index.ejs');
});

app.get('/params/:id_man', function(req, res) {
    res.render('vk_friends_graph', {id: req.params.id_man});
});

app.post('/', urlencodedParser, async function(req, res) {
    if (!req.body) return res.sendStatus(400);
    res.redirect('/params/' + req.body.id_man);
    var info = await run(req.body.id_man).catch(console.error);
    console.log(info);
});

app.get('/menu/help', function(_req, res) {
    res.render('help.ejs');
});

app.get('/auth', function(req, res) {
    const code = req.query.code;
    https.get(
        `https://oauth.vk.com/access_token?client_id=7020229&client_secret=l637eDwRzU6OR3V5SCQB&redirect_uri=http://localhost:3000/auth&code=${code}`, (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            vk.token = JSON.parse(data).access_token;
            console.log('token', vk.token);
            res.render('index.ejs');
        });
        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
});


async function run(id) {
    const numberId = Number.isNaN(parseInt(id))
        ? await vk.api.utils.resolveScreenName({screen_name: id})
        : id;

    console.log(numberId);

    const friends = await getFriends(numberId);
    const info = {};
    const promises = [];
    for (const limitedFriendsArray of chunk(friends, LIMIT)) {
        promises.push(getCommonFriends(numberId, limitedFriendsArray.map(friend => friend.id)));
    }

    return Promise.all(promises)
        .then(result => {
            result = flatten(result);
            friends.forEach((friend, index) => {
                info[friend.id] = {
                    first_name: friend.first_name,
                    last_name: friend.last_name,
                    common_friends: result[index]
                };
            });

            return info;
        });
}

function chunk(arr, len) {
    const chunks = [];
    let i = 0;
    const n = arr.length;

    while (i < n) {
      chunks.push(arr.slice(i, i += len));
    }

    return chunks;
}

function flatten(arr) {
    const result = [];
    for (const e of arr) {
        result.push(...e);
    }

    return result;
}

async function getFriends(id) {
    try {
        const params = {
            "user_id": id, "fields": ["first_name"]
        };
        const code = `return API.friends.get(${JSON.stringify(params)});`;
        const friends = await vk.api.execute({code});
        return friends.response.items;
    } catch (err) {
        console.error(err);
        return [];
    }
}

async function getCommonFriends(sourceId, targetsId) {
    const code = `
    var idsArray = [];
    var targetsId = ${JSON.stringify(targetsId)};
    var count = 0;
    while (count < targetsId.length) {
        idsArray.push(API.friends.getMutual({
            "source_uid": ${sourceId},
            "target_uid": targetsId[count]
        }));
        count = count + 1;
    }
    return idsArray;`;
    const friends = await vk.api.execute({code});
    return friends.response.map(friendIds => Array.isArray(friendIds) ? friendIds : []) || [];
}

app.listen(3000);
