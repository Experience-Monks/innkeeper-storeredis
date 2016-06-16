# innkeeper-storeredis

[![experimental](http://badges.github.io/stability-badges/dist/experimental.svg)](http://github.com/badges/stability-badges)

innkeeper-storeredis is a memory store for inn-keeper which uses a Redis database.

## Usage

[![NPM](https://nodei.co/npm/innkeeper-storeredis.png)](https://www.npmjs.com/package/innkeeper-storeredis)

The following is a small example using this module with [`inkeeper-socket.io`](https://www.npmjs.com/package/innkeeper-socket.io):

```javascript
var app = require('http').createServer( function(){} );
var io = require( 'socket.io' )( app );
var innkeeper = require( 'innkeeper-socket.io' );
var innkeeperStoreRedis = require('innkeeper-storeredis');
var redis = redis = require( 'redis' );

var storeMemory = innkeeperStoreRedis(redis.createClient());

var keeper = innkeeper({ 
  io: io,
  memory: storeMemory
});

app.listen( 8888 );
```

## License

MIT, see [LICENSE.md](http://github.com/jam3/innkeeper-storeredis/blob/master/LICENSE.md) for details.
