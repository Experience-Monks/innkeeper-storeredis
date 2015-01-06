local cID = redis.call( "INCR", "nextRoomID" );

if( cID == 9999999999999 ) then
	redis.call( "SET", "nextRoomID", 0 )

	return 0
else

	return cID
end