// @ts-check
/**
 * How the server marks the two answers that mean "this participant can't be
 * saved here any more", in the error's `data.smile`. The browser acts on a
 * 403 or 404 only when it carries one of these: a 403 or 404 from anything
 * else on the way (a firewall, a proxy, a deploy being swapped) is treated as
 * a failure to try again, not as news about the participant.
 */

/** 404: the participant's row doesn't exist (deleted, or another database) */
export const NO_PARTICIPANT = 'no-participant'

/**
 * 400 or 413: the save route read the body and refused it (not JSON, the
 * wrong shape, too large). The same body would be refused again. A 4xx
 * without this mark came from something else on the way and is tried again.
 */
export const REFUSED = 'refused'

/** 403: the participant's token is missing, expired or signed with another secret */
export const BAD_TOKEN = 'bad-token'
