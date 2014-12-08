local numDigits = ARGV[ 1 ]

for i = 0, math.pow( 10, numDigits ) - 1, 1 do

	local padding = numDigits - string.len( i )

	redis.call( 'sadd', 'roomKeys', string.rep( '0', padding ) .. i )
end