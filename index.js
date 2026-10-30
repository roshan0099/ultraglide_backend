// Lambda Web Function entrypoint
// AWS Lambda Web Adapter expects the server to listen on the host/port
// specified by the AWS_LAMBDA_HTTP_ENDPOINT environment variable.
import app from './app.js';

// Parse the endpoint URL from Lambda's env var (e.g. "http://0.0.0.0:3000")
const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT || 'http://0.0.0.0:8080';
let host = '0.0.0.0';
let port = 3000;

try {
  const url = new URL(endpoint);
  host = url.hostname || '0.0.0.0';
  port = parseInt(url.port, 10) || 3000;
} catch {
  // Fallback if parsing fails
  host = '0.0.0.0';
  port = 3000;
}

app.listen(port, host, () => {
  console.log(`🚀 UltraGlide Web Function listening on ${host}:${port}`);
});
