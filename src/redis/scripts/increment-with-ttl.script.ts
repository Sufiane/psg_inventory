// INCR then EXPIRE as two round-trips leaves a window where a crash between
// them strands the key with no TTL (never expires). A single script makes
// the increment and the first-hit expiry atomic in one round trip.
export const INCREMENT_WITH_TTL_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;
