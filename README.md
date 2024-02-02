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

We need to also keep the OC backend up to date with which chats currently have active calls so that it can be integrated into the existing update loop.

The do this we call daily's global presence api which will tell us about all rooms that have active participants. By monitoring
how this state changes over time we can derive when meetings start and end and call into the OC backend to update it. There is considerable latency on the
daily.co presence endpoint and we would hope to replace this with webhooks as and when they become available (scheduled for Q1 2024).
