# OpenChat Video Bridge

This exists to mediate creation of and access to daily.co video chats.

The flow goes as follows:

If a user wants to join or create a video chat for an OpenChat chat they request
an auth token from the OpenChat backend (in the form of a jwt). This auth token
is then passed to this video-bridge service which will do the following:

- verify the signed jwt
- create the room if it does not already exist
- create a meeting access token for this specific user
- return the meeting access token to the OpenChat front end

The OpenChat front end will then use the daily.co sdk to join the meeting using the token
returned from this service.

It is necessary to have a service to perform this function in order to protect the daily.co
credentials and ensure that the OpenChat security model is in charge of controlling access.

### Notes

How do we keep our state up to date?

When someone asks for a token for a room we tell OC that there is a meeting in progress for that room. We then start polling the room's presence api until there are zero participants and at that
point we delete the room and tell OC that the meeting is over.

Problem: what if the video-bridge crashes? OC will never be updated to say that the meeting is over.

Solutions:

1. on participant left on the OC client we could tell the OC backend that the meeting is over (we should also tell the bridge to delete the room in this case too). There is still a chance that won't get called e.g. I could be the last participant and I could simply close my browser.

2. on startup, the video bridge calls the global presence api. Any rooms with 0 participants, we delete the room and then tell OC the meeting is over

Possibly we only ever poll the global presence api and it just does that continuously detecting when a meeting starts and ends.

Daily docs suggest that calling the global presence api every 15 seconds is ok.

_But_ there is a problem - it only returns data for rooms that have participants. That means that have to remember the state so that we can compare it to the last iteration in order to detect
meetings that have ended.
