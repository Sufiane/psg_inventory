// EXISTS -> DECR -> conditional SET as three separate round-trips leaves a
// race: if the key's TTL expires in the gap between EXISTS and DECR, DECR
// recreates it at -1 with no TTL, and the clamp-to-zero SET (without
// KEEPTTL) would leave that key permanently orphaned with no expiry. A
// single script makes the existence check, the decrement, and the clamp
// atomic in one round trip, and KEEPTTL preserves whatever TTL the key
// already had rather than reissuing or dropping it.
export const DECREMENT_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
    return 0
end
local current = redis.call('DECR', KEYS[1])
if current < 0 then
    redis.call('SET', KEYS[1], '0', 'KEEPTTL')
    return 0
end
return current
`;
