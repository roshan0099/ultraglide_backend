import serverlessExpress from '@codegenie/serverless-express';
import app, { PRODUCT_CATALOG } from './app.js';

// AWS Lambda entrypoint handler
// Compatible with AWS API Gateway (HTTP API v2, REST API v1),
// Application Load Balancer (ALB), and Lambda Function URLs.
export const handler = serverlessExpress({ app });

export { PRODUCT_CATALOG, app };
export default handler;
