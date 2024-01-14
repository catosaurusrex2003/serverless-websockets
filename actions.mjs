// make sure to use aws-sdk version 3
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, ScanCommand } from "@aws-sdk/client-dynamodb";

/*
  Connection URL = https://xxxxxxxxxxx.execute-api.us-east-1.amazonaws.com/production/@connections
  ENDPOINT       = https://xxxxxxxxxxx.execute-api.us-east-1.amazonaws.com/production/
*/

// name of table
const usersTable = "chat-users"
const conversationTable = "chat-conversations"

const ENDPOINT = 'https://laetajstz1.execute-api.ap-south-1.amazonaws.com/production/';

const gatewayClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });
const dynamoClient = new DynamoDBClient({ region: "ap-south-1" });

const sendToOne = async (id, body) => {
  // emit message to a client using his connectionId
  try {
    const requestParams = {
      ConnectionId: id,
      Data: JSON.stringify(body)
    }
    const command = new PostToConnectionCommand(requestParams);
    await gatewayClient.send(command);
  } catch (err) {
    console.error(err);
  }
};

const sendToAll = async (ids, body) => {
  // emit message to many clients
  const all = ids.map(i => sendToOne(i, body));
  return Promise.all(all);
};

export const $connect = async () => {
  // you can put auth in this
  return {};
};

export const updateConnectionId = async (payload, meta) => {
  /* 
  update the document in Users table with the new connection id
  if no document with that email is present then creates one
  */

  // the document
  const newConnectionIdParams = {
    TableName: usersTable,
    Item: {
      email: { S: payload.email }, // unique identifier is email
      username: { S: payload.username },
      connectionId: { S: meta.connectionId }
    }
  };
  try {
    // put new document in dynamodb
    await dynamoClient.send(new PutItemCommand(newConnectionIdParams));
    console.log("Item created or updated successfully.");
    await sendToOne(meta.connectionId, { event: "updatedConnectionId" });
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: 'Failed to create or update item: ' + JSON.stringify(err),
    };
  }
  return {};
};


export const sendPrivate = async (payload, meta) => {
  // initialise variable for recievers connectionId. this will be updated in future.
  let recieverConnectionId = undefined;

  const queryParams = {
    TableName: usersTable,
    Key: {
      email: { S: payload.receiverEmail }
    }
  };
  try {
    // get the document of the reciever from database
    const { Item } = await dynamoClient.send(new GetItemCommand(queryParams));
    recieverConnectionId = Item.connectionId.S;
    console.log("connectionId fetched successfully.");
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: 'Failed to Fetch User connectionId Item : ' + JSON.stringify(err),
    };
  }

  // this will be the unique identifier of a private conversation
  const alphabeticalEmails = [payload.senderEmail, payload.receiverEmail].sort();
  const conversationId = `${alphabeticalEmails[0]}&${alphabeticalEmails[1]}`;


  const item = {
    conversationId: { S: conversationId },
    timestamp: { S: new Date().toISOString() },
    messageText: { S: payload.messageText },
    receiverEmail: { S: payload.receiverEmail },
    senderEmail: { S: payload.senderEmail },
  };

  const newItemparams = {
    TableName: conversationTable,
    Item: item
  };
  try {
    // put the item in 
    await dynamoClient.send(new PutItemCommand(newItemparams));
    console.log("message item created fetched successfully.");
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Failed to create Message in DynamoDb: ' + JSON.stringify(err) };
  }
  try {
    // send the message to client connectionId.
    await sendToAll([recieverConnectionId, meta.connectionId], { event: "newPrivateMessage", message: item });
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Failed to send socket message to reciepent: ' + JSON.stringify(err) };
  }
  return {};
};

export const fetchAllMessages = async (payload, meta) => {
  /*
  fetch all the messages in a conversation. we can implement pagination here to prevent querying the whoke database uselessly.
  */

  const alphabeticalEmails = [payload.entity1, payload.entity2].sort();
  // the unique identifier of a private conversation
  const conversationId = `${alphabeticalEmails[0]}&${alphabeticalEmails[1]}`;

  // query object to get all the documents in database with conversationId same as the one above.
  const queryParams = {
    TableName: conversationTable,
    KeyConditionExpression: "conversationId = :cid",
    ExpressionAttributeValues: {
      ":cid": { S: conversationId }
    },
    ScanIndexForward: true
  };
  try {
    // get the documents
    const queryCommand = new QueryCommand(queryParams);
    // 
    const { Items } = await dynamoClient.send(queryCommand);
    try {
      // echo back the message to connectionId.
      await sendToOne(meta.connectionId, { event: "allMessagesResponse", messageList: Items });
    } catch (err) {
      console.error(err);
      return {}
    }
  } catch (error) {
    console.error(error);
    return {};
  }
}

export const fetchAllUsers = async (payload, meta) => {
  /* 
  this function is inefficient and need to be improved in future 
  */

  try {
    const queryParams = {
      TableName: usersTable
    };
    // get the documents
    const data = await dynamoClient.send(new ScanCommand(queryParams));
    try {
      // echo the data back to the client who requested.
      await sendToOne(meta.connectionId, { event: "allUsersResponse", usersList: data });
    } catch (err) {
      console.error(err);
      return {}
    }
    return {};
  } catch (err) {
    console.error(err);
    return {};
  }
}

export const $disconnect = async (payload, meta) => {
  // can do something imp here
  return {};
};