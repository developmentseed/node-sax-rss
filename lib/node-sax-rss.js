var http = require('http'),
    sax = require('sax'),
    url = require('url'),
    parser = sax.parser(false);
    entities = sax.ENTITIES;
    
    // Extend limited entities table
    entities['#039'] = "'";


/**
 * General TODO
 *   - add error handling
 *   - send chunks to push parser (currently sending all xml at once).
 *
 */

function Feed() {
    // Nothing here.
};

Feed.prototype.fetch = function (path, callback) {
    // @TODO: check if in cache
    var feed = url.parse(path);
    var host = feed.hostname;
    var port = url.port;

    var client = http.createClient(port || '80', host);
    client.addListener('error', function (err) {
        return callback({
            error: true,
            data: err
        });
    });
    var request = client.request('GET', path, {
        'host': host
    });
    request.end();
    request.on('response', function (response) {
        if (response.statusCode != 200) {
            return callback({
                error: true,
                data: ''
            });
        }
        var data = [];
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            data.push(chunk);
        });
        response.on('end', function () {
            return callback(false, data.join(''));
            // @TODO: return and cache
        });
    });

}

Feed.prototype.parse = function (xml, callback) {
    var stack = [];

    parser.onopentag = function (node) {
        var obj = {};
        obj['@'] = {};
        obj['#'] = "";
        for (a in node.attributes) {
            obj['@'][a] = node.attributes[a];
        }
        stack.push(obj);
    };

    parser.onclosetag = function (elem) {
        elem = elem.toLowerCase();
        var obj = stack.pop();
        if (stack.length > 0) {
            if (typeof stack[stack.length - 1][elem] === 'undefined') {
                stack[stack.length - 1][elem] = obj;
            } else if (Array.isArray(stack[stack.length - 1][elem])) {
                stack[stack.length - 1][elem].push(obj);
            } else {
                var old = stack[stack.length - 1][elem];
                stack[stack.length - 1][elem] = [];
                stack[stack.length - 1][elem].push(old);
            }
        } else {
            // Done parsing.
            callback(false, obj);
        }
    };

    parser.ontext = function (t) {
        t = t.trim();
        if (t != "") {
            stack[stack.length - 1]['#'] += t;
        }
    };

    parser.write(xml).close();
}

Feed.prototype.clean = function (obj, callback) {
    // Loop through object, check for required elements, create simplified object.
    // Support RSS 2.0 and, eventually, Atom, for example.
    var rss2 = {};
    // Channel information
    if (typeof(obj.channel.title['#']) === 'string') {
        rss2.title = obj.channel.title['#'];
    }
    if (typeof(obj.channel.link['#']) === 'string') {
        rss2.link = obj.channel.link['#'];
    }
    rss2.description = obj.channel.description['#'];

    // Items
    rss2.items = [];
    if (obj.channel.item instanceof Array) {
        var items = obj.channel.item;
        for (i in items) {
            rss2.items[i] = {};
            if (items[i].title !== undefined || items[i].description !== undefined) {
                for (elem in items[i]) {
                    // @TODO recurse instead.
                    if (items[i][elem] instanceof Array) {
                        rss2.items[i][elem] = [];
                        for (j in items[i][elem]) {
                            rss2.items[i][elem][j] = {};
                            rss2.items[i][elem][j].namespace = items[i][elem][j]['@'];
                            rss2.items[i][elem][j].val = items[i][elem][j]['#'];
                        }
                    } else {
                        // Skip parser-specific additives.
                        if (elem !== '#' && elem !== '@') {
                            rss2.items[i][elem] = items[i][elem]['#'];
                        }
                    }
                }
            } else {
                // No title or description.  Invalid.
                // @TODO handle error.
            }
        }
    }
    return callback(false, rss2);
}

var cache = {};

var load = function (source, callback) {
    var currentTime = Math.round(new Date().getTime() / 1000);
    if (cache[source.url] != null && (cache[source.url].time + source.ttl) > currentTime) {
        return callback(cache[source.url].result);
    }
    var feed = new Feed();
    feed.fetch(source.url, function (err, xml) {
        if (err) {
            return callback(err);
        }
        feed.parse(xml, function (err, data) {
            if (err) {
                return callback(err);
            }
            feed.clean(data, function (err, obj) {
                if (err) {
                    return callback(err);
                }
                // Send to cache.
                cache[source.url] = {
                    result: obj,
                    time: currentTime,
                }
                return callback(false, obj);
            });
        });
    });
}

function decode(text) {
    
}

exports.Feed = Feed;
exports.load = load;
