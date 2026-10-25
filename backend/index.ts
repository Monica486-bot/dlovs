import 'dotenv/config';
import { checkSecrets } from './utils/secrets';
checkSecrets();
import app from './app';

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`DLOVS API listening on port ${PORT}`));
