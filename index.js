var promise = require( 'bluebird' ),
	romis = require( 'romis' ),
	fs = require( 'fs' );

module.exports = storeRedis;

var ROOM_DOES_NOT_EXIST = promise.reject( 'There is no room by that id' );
ROOM_DOES_NOT_EXIST.catch( function() {} ); // this is to ensure there isnt a logged error

/**
 * storeRedis is used to store data in memory on one process. This is not ideal
 * for clustered servers as each process may have different data. Use another
 * memory store if your server is clustered however use this memory store just
 * to get up and running fast or if your server is not clustered.
 *
 * @param {redis} redis You should pass a redis client that will be used to write
 *                      to redis with.
 * @return {storeRedis} An new instance of storeRedis
 */
function storeRedis( redis ) {

	if( !( this instanceof storeRedis ) )
		return new storeRedis( redis );

	this.redis = romis.fromRedis( redis );
}

storeRedis.prototype = {

	/**
	 * The init function should be called before doing anything.
	 * This will setup the redis db the way it should be.
	 * 
	 * @return {Promise} This promise will resolve once we're good to go
	 */
	init: function() {

		return this._reset()
			   .then( this._generateKeys.bind( this ) );
	},

	/**
	 * This will create a roomID, roomDataObject, and users array for the room
	 * 
	 * @return {Promise} This promise will return a room id once the room is created
	 */
	createRoom: function( userID ) {

		return this._getNextRoomId()
		.then( function( id ) {

			return this.joinRoom( userID, id )
			.then( function() {

				return id;
			});
		}.bind( this ));
	},

	joinRoom: function( userID, roomID ) {

		var redis = this.redis,
			setName = 'roomUsers:' + roomID;

		return redis.sismember( setName, userID )
		.then( function( isMember ) {

			if( !isMember ) {

				return redis.sadd( setName, userID );
			}
		})
		.then( function() {

			return roomID;
		});
	},

	/**
	 * Remove a user from a room
	 * 
	 * @param  {String} userID an id for the user whose leaving
	 * @param  {String} roomID an id for the room the user is leaving
	 * @return {Promise} When this promise resolves it will send the number of users in the room
	 */
	leaveRoom: function( userID, roomID ) {

		var userCount;

		if( roomUsers[ roomID ] === undefined ) {

			return promise.reject( 'No room with the id: ' + roomID );
		} else {

			var userIDX = roomUsers[ roomID ].indexOf( userID );

			if( userIDX != -1 ) {

				roomUsers[ roomID ].splice( userIDX, 1 );

				userCount = roomUsers[ roomID ].length;

				if( userCount == 0 ) {

					delete roomUsers[ roomID ];
				}

				return promise.resolve( userCount );
			} else {

				return promise.reject( 'User ' + userID + ' is not in the room: ' + roomID );
			}
		}
	},

	/**
	 * get a key which can be used to enter a room vs entering room via
	 * roomID
	 * 
	 * @param  {String} roomID id of the room you'd like a key for
	 * @return {Promise} A promise will be returned which will return a roomKey on success
	 */
	getKey: function( roomID ) {

		var key;

		return this.redis.spop( 'roomKeys' )
		.then( function( nKey ) {

			key = nKey;

			if( key ) {

				return promise.all( [

					this._setRoomIdForKey( roomID, key ),
					this._setKeyForRoomID( roomID, key )
				])
				.then( function() {

					return key;
				});
			} else {

				return promise.reject( 'Run out of keys' );
			}
		}.bind( this ));
	},

	/**
	 * return a room key so someone else can use it.
	 * 
	 * @param  {String} roomID id of the room you'll be returning a key for
	 * @param  {String} key the key you'd like to return
	 * @return {Promise} This promise will succeed when the room key was returned
	 */
	returnKey: function( roomID, key ) {

		return this.getRoomIdForKey( key )
		.then( function( savedRoomId ) {

			if( savedRoomId == roomID ) {

				return this._deleteKeyIdLookups( roomID, key )
				.then( function() {

					return this.redis.sadd( 'roomKeys', key );
				}.bind( this ));
			} else {

				return promise.reject( 'roomID and roomID for key do not match' );
			}
		}.bind( this ));
	},

	/**
	 * return the room id for the given key
	 * 
	 * @param  {String} key key used to enter the room
	 * @return {Promise} This promise will succeed with the room id and fail if no room id exists for key
	 */
	getRoomIdForKey: function( key ) {

		return this.redis.hget( 'keyForRoomID', key )
		.then( function( savedRoomId ) {

			if( savedRoomId ) {

				return promise.resolve( parseInt( savedRoomId ) );
			} else {

				return promise.reject();
			}
		});
	},

	/**
	 * set a variable on the rooms data object
	 * 
	 * @param {String} roomID id for the room whose 
	 * @param {String} key variable name/key that you want to set
	 * @param {*} value Value you'd like to set for the variable
	 * @return {Promise} once this promise succeeds the rooms variable will be set
	 */
	setRoomDataVar: function( roomID, key, value ) {

		var redis = this.redis;

		return this._doesRoomExist( roomID )
		.then( function( exists ) {

			if( exists ) {

				return redis.hset( 'roomData:' + roomID, key, value )
				.then( function( countSet ) {

					return value;
				});
			} else {

				return ROOM_DOES_NOT_EXIST;
			}
		});
	},

	/**
	 * get a variable from the rooms data object
	 * 
	 * @param {String} roomID id for the room
	 * @param {String} key variable name/key that you want to get
	 * @return {Promise} once this promise succeeds it will return the variable value it will fail if the variable does not exist
	 */
	getRoomDataVar: function( roomID, key ) {

		var redis = this.redis;

		return this._doesRoomExist( roomID )
		.then( function( exists ) {

			if( exists ) {

				return redis.hget( 'roomData:' + roomID, key )
				.then( function( value ) {

					return value == null ? undefined : value;
				});
			} else {

				return ROOM_DOES_NOT_EXIST;
			}
		});
	},

	/**
	 * delete a variable from the rooms data object
	 * 
	 * @param {String} roomID id for the room 
	 * @param {String} key variable name/key that you want to delete
	 * @return {Promise} once this promise succeeds it will return the value that was stored before delete
	 */
	delRoomDataVar: function( roomID, key ) {

		var redis = this.redis,
			rVal;

		return this._doesRoomExist( roomID )
		.then( function( exists ) {

			if( exists ) {

				return this.getRoomDataVar( roomID, key )
				.then( function( value ) {

					rVal = value;
				})
				.then( function() {

					return redis.hdel( 'roomData:' + roomID, key );
				})
				.then( function() {

					return rVal;
				})
				.catch();
			} else {

				return ROOM_DOES_NOT_EXIST;
			}
		}.bind( this ));
	},

	/**
	 * Receive the data stored for a room.
	 * 
	 * @param  {String} roomID id for the room you'd like data for
	 * @return {Promise} This promise will succeed when data is received for the room
	 */
	getRoomData: function( roomID ) {

		var redis = this.redis;

		return this._doesRoomExist( roomID )
		.then( function( exists ) {

			if( exists ) {

				return redis.hgetall( 'roomData:' + roomID )
				.then( function( data ) {

					return data === null ? {} : data;
				});
			} else {

				return ROOM_DOES_NOT_EXIST;
			}
		});
	},

	/**
	 * Set data stored for a room.
	 * 
	 * @param  {String} roomID id for the room you'd like to set data for
	 * @return {Promise} This promise will succeed when data is set for the room
	 */
	setRoomData: function( roomID, data ) {

		var redis = this.redis,
			name = 'roomData:' + roomID;

		return redis.hmset( 'roomData:' + roomID, data )
		.then( function() {

			return data;
		});

		return redis.watch( name )
		.then( function() {

			return redis.multi()
			.set( name, JSON.stringify( data ) )
			.exec();
		}.bind( this ))
	},

	/**
	 * _generateKeys is a function which will create and store a set of 
	 * keys which can be used to enter a room instead of a room id
	 *
	 * @private
	 */
	_generateKeys: function() {

		var redis = this.redis;

		return redis.eval( fs.readFileSync( 'lua/generateKeys.lua', 'utf8' ), 0, 5 );
	},

	_doesRoomExist: function( roomID ) {

		return this.redis.scard( 'roomUsers:' + roomID )
		.then( function( countUsers ) {

			return countUsers > 0;
		});
	},

	_setRoomIdForKey: function( roomID, key ) {

		return this.redis.hset( 'roomIDForKey', roomID, key );
	},

	_setKeyForRoomID: function( roomID, key ) {

		return this.redis.hset( 'keyForRoomID', key, roomID );
	},

	_deleteKeyIdLookups: function( roomID, key ) {

		var redis = this.redis;

		return promise.all( [

			redis.hdel( 'roomIDForKey', roomID ),
			redis.hdel( 'keyForRoomID', key )
		]);
	},

	_reset: function() {

		var redis = this.redis;

		return redis.set( 'nextRoomID', 0 )
		.then( function() {

			return redis.flushdb();
		});
	},

	_getNextRoomId: function() {

		var redis = this.redis;

		return redis.eval( fs.readFileSync( 'lua/getRoomID.lua', 'utf8' ), 0 );
	}
};