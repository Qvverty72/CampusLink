const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
};

