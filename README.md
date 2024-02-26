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

## Running locally

The solution requires both the nestjs web server and a running mongodb instance to work. To simplify this we use docker compose. Make sure that you have docker installed on your machine, then you should be able to simply run:

`npm run docker:dev'

to get the service up and running on `localhost:5050`

This will start two docker containers, one running a local instance of mongodb and one running the nestjs web server. The nest container has volumes mapped to your local files and nestjs will be running in watch mode so hot reloading will work as normal.

**Note** that this relies on a number of environment variables that should be provided via a local .env file which should look something like this:

```
DAILY_API_KEY=***************************************************
OC_IDENTITY=*****************************************************
OC_PUBLIC=*******************************************************
IC_URL=**********************************************************
DAILY_HOOK_HMAC=*************************************************
```

## Running in prod

This is more of a note to self for some relevant docker commands. You can just pull this repo as into a folder on the prod machine (ec2 instance) and then make sure that .env file noted above also exists on this machine (double check the docker-compose.yaml for the relevant env vars).

First you will need to ssh to the prod machine which will be something like:

`ssh -i "video_bridge.pem" ubuntu@ec2-75-101-243-180.compute-1.amazonaws.com`

Then `cd video-bridge` to get into the home directory for the service.

To start up the production images:

`sudo docker compose up server database -d`

This will build and run the images in the background.

To check whether they are runnin ok:

`sudo docker ps`

To tail the logs of the running services:

`sudo docker compose logs -f`

To shutdown the running services:

`sudo docker compose down`

To clean up all docker resources (if the machine runs out of space or something):

`sudo docker system prune -a -f --volumes`

If the service code has been updated:

```
git pull
sudo docker compose down server
sudo docker compose build server
sudo docker compose up server -d
```

Note that this update procedure will cause downtime to the video call feature so it would be good to come up with something better.
