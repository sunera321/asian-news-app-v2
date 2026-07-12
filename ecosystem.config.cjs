// pm2 process definition — run with: pm2 start ecosystem.config.cjs --env production
module.exports = {
  apps: [
    {
      name:    "asia-economic-lens",
      script:  "server.js",
      cwd:     __dirname,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
