import { $connect, $disconnect, updateConnectionId, fetchAllMessages, fetchAllUsers, sendPrivate } from './actions.mjs';

export const handler = async (event) => {
  if (!event.requestContext) {
    // if lambda is triggered without context
    return {};
  }

  try {
    // connectionId of the client
    const connectionId = event.requestContext.connectionId;
    // route key of ApiGateway
    const routeKey = event.requestContext.routeKey;
    // the payload if the websocket message.
    const body = JSON.parse(event.body || '{}');

    switch (routeKey) {
      case "$connect":
        // you can do authentication here if you want
        $connect();
        break;
      case "$disconnect":
        $disconnect();
        break;
      case "$default":
        // handler for all default action
        switch (body.action) {
          case "updateConnectionId":
            // update the connection id of the user in dynamo db
            await updateConnectionId(body, { connectionId });
            break;
          case "sendPrivate":
            // send a private message to another user
            await sendPrivate(body, { connectionId });
            break;
          case "fetchAllMessages":
            // fetch all messages between entity1 and entity2
            // this can be improvised using pagination
            await fetchAllMessages(body, { connectionId });
            break;
          case "fetchAllUsers":
            // fetch all users in the database.
            // this logic is not good but for now this will work.
            // in normal scenario we will query only users which have had conversation.
            await fetchAllUsers(body, { connectionId });
            break;
          default:
            // no switch case picked up
            break;
        }
      default:
        // no switch case picked up
        break;
    }
  } catch (err) {
    console.error(err);
  }
  return {};
};