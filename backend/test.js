const docClient = require("./config/dynamoConfig");
const TABLE_NAME = "Products";

async function check() {
  const result = await docClient.get({
    TableName: "Products", // or whatever the table name is
    Key: { Product_ID: "8c1f867b9abd67f44663157a921a7ec3845c14d58082eda5eb56e16bbf9914d9" }
  }).promise();
  console.log(result.Item);
}
check();
