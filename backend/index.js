require('dotenv').config();
require('./utils/secrets').checkSecrets();
const app = require('./app');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`DLOVS API listening on port ${PORT}`);
});
