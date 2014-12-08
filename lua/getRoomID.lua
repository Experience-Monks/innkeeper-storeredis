local cID = redis.call( "INCR", "nextRoomID" );

if( cID == 9999999999999 ) then
	redis.call( "SET", "nextRoomID", -9999999999999 )

	return -9999999999999
else

	return cID
end