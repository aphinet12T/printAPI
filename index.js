const app = require('./app');
const port = 8113;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
